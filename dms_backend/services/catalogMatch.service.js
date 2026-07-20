// Resolve a clinically-spoken term to an entry in THIS TENANT's catalog.
//
// The LLM extracts what the dentist said ("RCT", "pulp is dying"); this module
// decides which catalog row that actually is. Keeping identity-resolution out of
// the prompt means the catalog never has to be sent to the model — so a tenant
// with 5,000 custom terms costs the same prompt as one with 50.
//
// Three tiers, cheapest first. Each one only sees what the tier above it missed:
//
//   1. EXACT     normalized string / acronym match          (free, synchronous)
//   2. FUZZY     token-set overlap + edit distance          (free, synchronous)
//   3. SEMANTIC  one small LLM call over a SHORTLIST of     (one call, only for
//                fuzzy-ranked candidates — never the whole   terms tiers 1-2 failed)
//                library
//
// Catalogs are per-tenant and fetched fresh per request, so there is no cache to
// invalidate when a clinic adds a term. A term that survives all three tiers is
// NOT dropped — it is returned flagged `is_new` and surfaces in the review drawer
// for the dentist to accept or correct.

const SARVAM_URL = 'https://api.sarvam.ai/v1/chat/completions';
const MODEL      = 'sarvam-105b';

const FUZZY_ACCEPT   = 0.82; // score at/above which fuzzy is trusted outright

// Below this many entries, the semantic tier just sees the WHOLE catalog for that
// kind — a few dozen names is a trivial prompt, and any filtering risks hiding the
// right answer. Above it, we fall back to a fuzzy-ranked shortlist.
const SEND_ALL_BELOW = 60;
const SHORTLIST_SIZE = 25;

// ─── Normalization ────────────────────────────────────────────────────────────
const normalize = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const tokens    = (s) => normalize(s).split(' ').filter(Boolean);

// Initials of a multi-word name: "Root Canal Treatment" → "rct". Dentists dictate
// in acronyms constantly, and an acronym is neither a substring of the full name
// nor vice versa — without this, "RCT" reads as a new term and gets priced at 0.
function acronym(s) {
  const w = tokens(s);
  return w.length > 1 ? w.map(x => x[0]).join('') : '';
}

// ─── Tier 2 scoring ───────────────────────────────────────────────────────────
function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = cur;
  }
  return prev[b.length];
}

// Blend two signals, because each alone has a blind spot:
//   • token-set overlap  — order-independent, catches "caries deep" vs "deep caries",
//     and handles extra words ("Deep Dental Caries" vs "deep caries").
//   • edit distance      — catches typos and morphology ("pulpitis"/"pulpits") that
//     token overlap scores as a total miss.
function fuzzyScore(a, b) {
  const ta = tokens(a);
  const tb = tokens(b);
  if (!ta.length || !tb.length) return 0;

  const setA = new Set(ta);
  const setB = new Set(tb);
  const shared = [...setA].filter(t => setB.has(t)).length;
  // Divide by the SMALLER set: a short spoken term that is fully contained in a
  // longer catalog name ("deep caries" ⊂ "Deep Dental Caries") should score high.
  const overlap = shared / Math.min(setA.size, setB.size);

  const na = normalize(a);
  const nb = normalize(b);
  const dist = levenshtein(na, nb);
  const edit = 1 - dist / Math.max(na.length, nb.length);

  return 0.65 * overlap + 0.35 * edit;
}

// ─── Tiers 1 & 2 ──────────────────────────────────────────────────────────────
// Returns { entry, score, tier } | null. `score` 1 = certain.
function matchLocal(name, catalog) {
  const target = normalize(name);
  if (!target || !catalog.length) return null;

  // Tier 1a — exact, normalized.
  const exact = catalog.find(c => normalize(c.name) === target);
  if (exact) return { entry: exact, score: 1, tier: 'exact' };

  // Tier 1b — acronym, in both directions ("RCT" ⇄ "Root Canal Treatment").
  const flat = target.replace(/\s+/g, '');
  const byAcronym = catalog.find(c => acronym(c.name) === flat);
  if (byAcronym) return { entry: byAcronym, score: 0.97, tier: 'acronym' };

  const targetAcr = acronym(name);
  if (targetAcr) {
    const rev = catalog.find(c => normalize(c.name).replace(/\s+/g, '') === targetAcr);
    if (rev) return { entry: rev, score: 0.97, tier: 'acronym' };
  }

  // Tier 2 — fuzzy.
  const ranked = catalog
    .map(c => ({ entry: c, score: fuzzyScore(name, c.name) }))
    .sort((a, b) => b.score - a.score);

  const best = ranked[0];
  if (best && best.score >= FUZZY_ACCEPT) {
    return { entry: best.entry, score: best.score, tier: 'fuzzy' };
  }

  return null;
}

// Candidates to show the semantic tier.
//
// Deliberately NOT thresholded on the fuzzy score. Tier 3 exists precisely for terms
// with no lexical overlap ("pulp is dying" → "Irreversible Pulpitis"), and for those
// the fuzzy score is near-zero and essentially noise — it ranks "Chronic Periodontitis"
// ABOVE the correct answer. Filtering on it would guarantee tier 3 never sees the very
// cases it was built for.
//
// So: a small catalog goes through whole (a few dozen names is a trivial prompt), and
// only a large one is capped — ranked by fuzzy score purely as a tie-breaker for which
// slice to keep, never as a gate.
function shortlist(name, catalog) {
  if (catalog.length <= SEND_ALL_BELOW) return catalog;
  return catalog
    .map(c => ({ entry: c, score: fuzzyScore(name, c.name) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, SHORTLIST_SIZE)
    .map(x => x.entry);
}

// ─── Tier 3: semantic resolution over shortlists ──────────────────────────────
// ONE call for ALL unresolved terms across the whole draft — each with its own
// small candidate list. Batching keeps this to a single round-trip regardless of
// how many terms missed.
//
// `unresolved`: [{ key, kind, name, candidates: [{_id, name}] }]
// Returns Map<key, catalogEntry>
async function resolveSemantically(apiKey, unresolved) {
  const withCandidates = unresolved.filter(u => u.candidates.length > 0);
  if (!apiKey || !withCandidates.length) return new Map();

  const systemPrompt = `You match dental terminology. For each spoken term, decide which ONE of the given options means the same thing clinically. Return valid JSON and nothing else.`;

  const items = withCandidates.map((u, i) => ({
    id: i,
    kind: u.kind,
    spoken: u.name,
    options: u.candidates.map(c => c.name),
  }));

  const userPrompt = `A dentist dictated these terms. For each, choose the option that means the SAME THING clinically.

${JSON.stringify(items, null, 2)}

Return JSON:
{ "matches": [ { "id": 0, "choice": "the exact option text, or null" } ] }

RULES:
- "choice" MUST be copied verbatim from that item's own "options" list, or be null.
- Return null when NO option means the same thing. A wrong match corrupts a clinical
  record — when in doubt, return null and let the dentist decide.
- Match on clinical MEANING, not wording: "pulp is dying" = "Irreversible Pulpitis",
  "cleaning" = "Scaling and Polishing". But "Reversible Pulpitis" is a DIFFERENT
  condition from "Irreversible Pulpitis" — do not match across a real clinical
  distinction just because the words look similar.`;

  const res = await fetch(SARVAM_URL, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userPrompt   },
      ],
      // sarvam-105b is a reasoning model — its hidden reasoning trace is charged
      // against max_tokens, so a budget sized for just the JSON truncates the answer.
      // 4096 is the starter-tier ceiling.
      max_tokens: 4096,
      temperature: 0.1,
      top_p: 1.0,
    }),
  });

  if (!res.ok) return new Map(); // best-effort: terms stay `is_new` and surface for review

  const choice = (await res.json()).choices?.[0];
  if (choice?.finish_reason === 'length') return new Map(); // truncated → leave terms is_new
  const raw = choice?.message?.content?.trim() || '';
  let parsed;
  try {
    parsed = JSON.parse(raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim());
  } catch {
    return new Map();
  }

  const out = new Map();
  (Array.isArray(parsed.matches) ? parsed.matches : []).forEach(m => {
    const item = withCandidates[m.id];
    if (!item || !m.choice) return;
    // Trust nothing: the choice must be one of the options WE gave it. A model that
    // invents a name here would otherwise fabricate a catalog entry.
    const hit = item.candidates.find(c => normalize(c.name) === normalize(m.choice));
    if (hit) out.set(item.key, hit);
  });
  return out;
}

// ─── Public API ───────────────────────────────────────────────────────────────
// Resolve every extracted term in a draft's entries against the tenant's catalogs.
// Mutates nothing — returns entries with each term replaced by:
//   { name, catalog_id, is_new, cost?, match_tier?, confidence? }
//
// `is_new: true` means no catalog entry fit. The term is KEPT (never dropped) and
// shows a "new term" badge in review, so the dentist can accept it into the library.
export async function resolveEntryTerms(apiKey, entries, catalogs) {
  const KINDS = [
    ['findings',   'findings'],
    ['diagnoses',  'diagnoses'],
    ['treatments', 'treatments'],
  ];

  // Pass A — tiers 1 & 2, synchronous. Collect what misses for tier 3.
  const unresolved = [];
  const resolved = entries.map((entry, ei) => {
    const out = { ...entry };
    KINDS.forEach(([field, catKey]) => {
      const catalog = catalogs[catKey] || [];
      out[field] = (entry[field] || []).map((name, ii) => {
        const clean = String(name || '').trim();
        if (!clean) return null;

        const hit = matchLocal(clean, catalog);
        if (hit) {
          return {
            name: hit.entry.name,
            catalog_id: hit.entry._id,
            is_new: false,
            match_tier: hit.tier,
            ...(hit.entry.cost != null ? { cost: hit.entry.cost } : {}),
          };
        }

        const key = `${ei}:${field}:${ii}`;
        unresolved.push({ key, kind: catKey, name: clean, candidates: shortlist(clean, catalog) });
        // Placeholder — tier 3 may upgrade this below.
        return {
          name: clean, catalog_id: null, is_new: true, _key: key,
          ...(catKey === 'treatments' ? { cost: 0 } : {}),
        };
      }).filter(Boolean);
    });
    return out;
  });

  if (!unresolved.length) return resolved;

  // Pass B — tier 3, one batched call for everything tiers 1-2 missed.
  let semantic = new Map();
  try {
    semantic = await resolveSemantically(apiKey, unresolved);
  } catch {
    // Never fail the draft over term matching — unmatched terms stay `is_new`.
  }

  return resolved.map(entry => {
    const out = { ...entry };
    KINDS.forEach(([field]) => {
      out[field] = entry[field].map(item => {
        if (!item._key) return item;
        const hit = semantic.get(item._key);
        const { _key, ...rest } = item;
        if (!hit) return rest; // stays is_new → surfaces as a "new term" for review
        return {
          name: hit.name,
          catalog_id: hit._id,
          is_new: false,
          match_tier: 'semantic',
          ...(hit.cost != null ? { cost: hit.cost } : {}),
        };
      });
    });
    return out;
  });
}

// Exported for tests.
export const __test = { normalize, acronym, fuzzyScore, matchLocal, shortlist };
