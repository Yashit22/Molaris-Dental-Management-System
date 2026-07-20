// Assessment autofill — dictation → structured draft for the Treatment page's
// assessment tab (patient history + dental chart).
//
// Three sarvam-105b passes, then deterministic guards:
//   PASS 1  history  — chief complaint, medical/dental history, habits
//   PASS 2  teeth    — resolve every spoken tooth reference to an FDI number
//   PASS 3  chart    — group clinical content into per-teeth chart entries
//
// then catalogMatch.service.js maps the extracted terms onto THIS TENANT's
// clinical-findings / diagnoses / treatments libraries.
//
// The LLM proposes; CODE disposes. Every tooth number is checked against the adult
// FDI whitelist, every clinical term is resolved against the tenant's own catalog,
// and every price comes from that catalog — never from the model.
//
// This service performs NO database writes. It returns a draft for the dentist to
// review; committing is the frontend's job, through the same endpoints the manual
// charting flow already uses.

import {
  ADULT_FDI,
  HISTORY_SYSTEM_PROMPT, getHistoryPrompt,
  CHART_SYSTEM_PROMPT,   getChartPrompt,
} from '../config/assessmentAutofill.config.js';
import { resolveEntryTerms } from './catalogMatch.service.js';
import { parseTeeth } from './toothParser.service.js';

const SARVAM_URL = 'https://api.sarvam.ai/v1/chat/completions';
const MODEL      = 'sarvam-105b';

// sarvam-105b is a REASONING model: it emits a long hidden reasoning trace before
// the answer, and those tokens are charged against max_tokens. A realistic dictation
// costs ~1,500 reasoning tokens, so a budget sized for "just the JSON" truncates the
// answer mid-object — finish_reason:'length', unparseable JSON, and the pass throws.
//
// 4096 is the hard ceiling on the starter tier (the API rejects anything higher), so
// every pass gets the full budget. There is no upside to leaving headroom unused.
const MAX_TOKENS = 4096;

// ─── LLM call + JSON parse with one repair retry ──────────────────────────────
// A single malformed token must not nuke the whole autofill. On a parse failure,
// hand the model its own broken output plus the parser's complaint and let it fix
// itself once.
async function callLLM(apiKey, systemPrompt, userPrompt, { maxTokens = MAX_TOKENS } = {}) {
  const res = await fetch(SARVAM_URL, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userPrompt   },
      ],
      max_tokens:  maxTokens,
      temperature: 0.1,   // extraction, not composition — keep it tight
      top_p:       1.0,
    }),
  });

  if (!res.ok) throw new Error(`Sarvam API error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const choice = data.choices?.[0];

  // Ran out of budget mid-answer. The content is a truncated fragment, so JSON.parse
  // would fail with a cryptic "Unexpected end of input" — say what actually happened.
  if (choice?.finish_reason === 'length') {
    throw new Error(
      'The AI ran out of output space before finishing (the dictation may be too long). ' +
      'Try dictating in shorter sections.',
    );
  }

  return choice?.message?.content?.trim() || '';
}

// Models like to wrap JSON in ```json fences despite being told not to.
const stripFences = (t) => t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

async function extractJSON(apiKey, systemPrompt, userPrompt, opts) {
  const raw = await callLLM(apiKey, systemPrompt, userPrompt, opts);
  try {
    return JSON.parse(stripFences(raw));
  } catch (err) {
    const repairPrompt = `Your previous response was not valid JSON.

Your response:
"""
${raw}
"""

The JSON parser failed with: ${err.message}

Return the SAME data as valid JSON. Output only the JSON — no prose, no markdown fences.`;
    const repaired = await callLLM(apiKey, systemPrompt, repairPrompt, opts);
    return JSON.parse(stripFences(repaired)); // if this throws, the pass fails loudly
  }
}

// ─── Tooth whitelist ──────────────────────────────────────────────────────────
// v1 = adult permanent dentition. Anything outside it is either a hallucination or
// an out-of-scope (pedo) tooth; either way it must never reach the chart silently.
const isValidTooth = (t) => ADULT_FDI.includes(String(t).trim());

function sanitizeTeeth(teeth) {
  const valid = [];
  const rejected = [];
  (Array.isArray(teeth) ? teeth : []).forEach(t => {
    const s = String(t).trim();
    if (isValidTooth(s)) { if (!valid.includes(s)) valid.push(s); }
    else if (s) rejected.push(s);
  });
  return { valid, rejected };
}

const normalize = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// ─── PASS 1: history ──────────────────────────────────────────────────────────
async function extractHistory(apiKey, transcript, existing) {
  const data = await extractJSON(
    apiKey, HISTORY_SYSTEM_PROMPT, getHistoryPrompt(transcript, existing), { maxTokens: MAX_TOKENS },
  );

  const str = (v) => (typeof v === 'string' ? v.trim() : '');

  // Patient.tobacco_* are BOOLEANS. `null` means "not discussed" and must stay null
  // so the commit omits the field — writing `false` would record "does not smoke"
  // for a patient who was simply never asked. Anything that isn't a real boolean
  // becomes null rather than being coerced (a truthy string like "No" would
  // otherwise silently save as `true`).
  const bool = (v) => (typeof v === 'boolean' ? v : null);

  // Only NEW medical-history tags. The prompt is told what's on file, but trust
  // nothing — dedupe against the existing list here too.
  const known = new Set((existing.medical_history || []).map(normalize));
  const medical_history = (Array.isArray(data.medical_history) ? data.medical_history : [])
    .map(str)
    .filter(t => t && !known.has(normalize(t)));

  // Notes and advice are stored as PLAIN TEXT — the visit-summary PDF runs
  // htmlToText() over them anyway, and the rich-text editor adds its own markup when
  // a human edits. Strip any tags the model emits despite being told not to, so we
  // never store markup the pipeline only has to undo.
  const plain = (v) => str(v)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return {
    chief_complaint:    str(data.chief_complaint),
    medical_history,
    dental_history:     str(data.dental_history),
    tobacco_smoking:    bool(data.tobacco_smoking),
    tobacco_smokeless:  bool(data.tobacco_smokeless),
    // Patient.tea/coffee_consumption are free-text QUANTITIES ("2-3 cups"), not flags.
    tea_consumption:    str(data.tea_consumption),
    coffee_consumption: str(data.coffee_consumption),
    // Visit Notes tab.
    consultation_note:  plain(data.consultation_note),
    advice:             plain(data.advice),
  };
}

// ─── Teeth: parsed in code, NOT by an LLM ─────────────────────────────────────
// Dentists dictate tooth numbers digit-by-digit ("two six" = 26) and never by name
// ("upper left six"), so resolving them is a parsing problem, not a reasoning one.
// toothParser.service.js handles it deterministically — see that file. This removed
// an entire LLM call: no hallucinated teeth, no latency, no reasoning-token budget.

// ─── PASS 3: chart entries ────────────────────────────────────────────────────
// The catalogs are NOT sent to this prompt — the model reports what was said, and
// catalogMatch resolves those words against the tenant's library afterwards.
async function extractChart(apiKey, transcript, toothMap) {
  const data = await extractJSON(
    apiKey, CHART_SYSTEM_PROMPT, getChartPrompt(transcript, toothMap), { maxTokens: MAX_TOKENS },
  );

  const entries = [];
  const rejectedTeeth = [];

  (Array.isArray(data.entries) ? data.entries : []).forEach(e => {
    const { valid, rejected } = sanitizeTeeth(e.teeth);
    rejected.forEach(r => rejectedTeeth.push(r));

    const list = (v) => (Array.isArray(v) ? v.map(x => String(x || '').trim()).filter(Boolean) : []);
    const findings   = list(e.findings);
    const diagnoses  = list(e.diagnoses);
    const treatments = list(e.treatments);

    // An entry with no teeth, or with teeth but no clinical content, is noise.
    if (!valid.length) return;
    if (!findings.length && !diagnoses.length && !treatments.length) return;

    entries.push({
      teeth: valid,
      findings, diagnoses, treatments,
      evidence: String(e.evidence || '').trim(),
    });
  });

  return { entries, rejectedTeeth };
}

// ─── Public entry point ───────────────────────────────────────────────────────
// Two LLM passes (history, chart) plus deterministic tooth parsing. History is
// independent of the chart chain, so a failure in one does not sink the other — the
// dentist gets partial results with the failure named, not an all-or-nothing error.
//
// Returns { history, entries, unplaced, failures[] }
export async function buildAssessmentDraft({ apiKey, transcript, existingHistory = {}, catalogs }) {
  if (!apiKey)     throw new Error('Sarvam API key is not configured for this tenant.');
  if (!transcript) throw new Error('Transcript is empty.');

  // Teeth are parsed in code (instant, deterministic) and handed to the chart pass,
  // which is the only LLM call that needs them. History runs alongside.
  const toothMap = parseTeeth(transcript);

  const [historyResult, chartChain] = await Promise.allSettled([
    extractHistory(apiKey, transcript, existingHistory),
    (async () => {
      const chart   = await extractChart(apiKey, transcript, toothMap);
      // Map the extracted terms onto this tenant's own catalogs (exact → acronym →
      // fuzzy → semantic). Unmatched terms survive, flagged `is_new`, for review.
      const entries = await resolveEntryTerms(apiKey, chart.entries, catalogs);
      return { entries, rejectedTeeth: chart.rejectedTeeth };
    })(),
  ]);

  const failures = [];

  let history = null;
  if (historyResult.status === 'fulfilled') history = historyResult.value;
  else {
    console.error('[Assessment] history pass failed:', historyResult.reason);
    failures.push({ pass: 'history', message: historyResult.reason?.message || 'History extraction failed' });
  }

  let entries  = [];
  const unplaced = [...toothMap.unplaced];
  if (chartChain.status === 'fulfilled') {
    const chain = chartChain.value;
    entries = chain.entries;
    // Teeth the chart pass invented that the parser never saw in the transcript.
    chain.rejectedTeeth.forEach(t => {
      unplaced.push({ spoken: t, reason: 'Not a valid adult tooth number' });
    });
  } else {
    // Log the real cause — the UI only shows a generic "could not extract" line.
    console.error('[Assessment] chart pass failed:', chartChain.reason);
    failures.push({ pass: 'chart', message: chartChain.reason?.message || 'Chart extraction failed' });
  }

  return { history, entries, unplaced, failures };
}
