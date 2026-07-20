// Prompts for the assessment autofill pipeline (dictation → assessment tab).
//
// Three LLM passes, each with one job. They are deliberately separate: the tooth
// pass needs rigid, conservative, low-temperature discipline, while the history
// pass needs to read loose narrative speech. One prompt serving both means the
// narrative tokens crowd out the tooth reasoning.
//
// v1 scope: ADULT permanent dentition only (FDI 11-18, 21-28, 31-38, 41-48).
// Soft tissue, TMJ and pedo/mixed dentition extend PASS 2/3's target vocabulary
// later without changing the pipeline's shape.

// The only tooth ids the extractor may emit. Anything else is a hallucination.
export const ADULT_FDI = [
  11, 12, 13, 14, 15, 16, 17, 18,
  21, 22, 23, 24, 25, 26, 27, 28,
  31, 32, 33, 34, 35, 36, 37, 38,
  41, 42, 43, 44, 45, 46, 47, 48,
].map(String);

// NOTE: there is no tooth-resolution PROMPT here any more. Dentists dictate tooth
// numbers digit-by-digit ("two six" = 26) and never by name ("upper left six"), so
// resolving them is a parsing problem, not a reasoning one — it is done in code, in
// services/toothParser.service.js. That removed an entire LLM call, and with it any
// possibility of a hallucinated tooth number.

// ── PASS 1: patient history + visit notes ─────────────────────────────────────
// Fills the assessment tab's left panel AND the Visit Notes tab (consultation note
// + patient advice). Nothing tooth-related — the chart pass handles that.
//
// consultation_note / advice are PLAIN TEXT, not HTML. The visit-summary PDF runs
// htmlToText() over whatever is stored, and the rich-text editor adds its own markup
// when a human edits — so generating HTML here would be markup the pipeline only
// strips back out. Store the words; presentation is handled downstream.
//
// Keep this prompt tight: sarvam-105b reasons over every instruction before answering
// and that thinking is charged against max_tokens (see CHART_SYSTEM_PROMPT).
export const HISTORY_SYSTEM_PROMPT = `You extract a dental consultation into JSON. Record only what the dentist actually said. Output ONLY the JSON object. Do not explain.`;

export function getHistoryPrompt(transcript, existing = {}) {
  return `Dictation:
"""
${transcript}
"""

Already on file (report only what is NEW):
  medical_history: ${JSON.stringify(existing.medical_history || [])}
  dental_history:  ${JSON.stringify(existing.dental_history || '')}

Output JSON:
{
  "chief_complaint": "the patient's reason for this visit, one short sentence, or \\"\\"",
  "medical_history": ["short condition tags, e.g. \\"Diabetes\\""],
  "dental_history":  "prior dental treatment in a sentence or two, or \\"\\"",
  "tobacco_smoking":    true | false | null,
  "tobacco_smokeless":  true | false | null,
  "tea_consumption":    "amount as stated, e.g. \\"2-3 cups daily\\", or \\"\\"",
  "coffee_consumption": "amount as stated, or \\"\\"",
  "consultation_note":  "clinical summary of this visit for the record: what was examined, found, and planned. Plain text. \\"\\" if there is nothing to record.",
  "advice":             "instructions FOR THE PATIENT in plain language: care, diet, hygiene, when to return. Plain text. \\"\\" if none were given."
}

RULES:
- Report ONLY what was said. Not mentioned → "", [] or null. Never infer.
- A patient not asked about tobacco is null, NOT false. false means they denied it.
- tea/coffee are QUANTITIES, not yes/no.
- consultation_note and advice are PLAIN TEXT — no HTML, no markdown, no bullet characters.
- advice is what the DENTIST TOLD THE PATIENT. Do not invent advice they did not give.
- Do NOT put tooth findings, diagnoses or treatments in these fields.
- English only.`;
}

// (Tooth resolution lives in services/toothParser.service.js — no prompt needed.)

// ── PASS 3: chart entries ─────────────────────────────────────────────────────
// Given the transcript + the resolved teeth, group clinical content into chart
// entries. Many-to-many falls out of the shape: an entry may carry several teeth,
// and a tooth may appear in several entries.
//
// NOTE: the clinic's catalogs are deliberately NOT sent here. The model's job is
// to report what the dentist SAID; mapping those words onto the tenant's library
// is a retrieval problem, handled afterwards by catalogMatch.service.js. That keeps
// this prompt constant-size — a tenant with 5,000 custom terms costs the same as
// one with 50 — and stops the model having to act as a search engine over a list.
// KEEP THIS PROMPT SHORT. sarvam-105b is a reasoning model: it deliberates over every
// instruction before answering, and that thinking is charged against max_tokens (hard
// ceiling 4096 on the starter tier). An earlier, carefully-worded version of this
// prompt with a dozen numbered rules made the model reason so long that it ran out of
// budget mid-JSON — finish_reason:'length', unparseable output, pass failed. The rules
// that actually matter are enforced in CODE anyway (the FDI whitelist rejects invented
// teeth; prices come from the tenant's catalog, never from the model), so spelling them
// out here bought nothing and cost the answer. Verbosity is not free with this model.
export const CHART_SYSTEM_PROMPT = `You extract dental chart entries as JSON. Output ONLY the JSON object. Do not explain.`;

export function getChartPrompt(transcript, toothMap) {
  return `Dictation:
"""
${transcript}
"""

Teeth already resolved from this dictation: ${JSON.stringify(toothMap.mentions || [])}

Output JSON:
{"entries":[{"teeth":["26","27"],"findings":["Deep caries"],"diagnoses":["Irreversible pulpitis"],"treatments":["Root canal treatment"],"evidence":"quoted words from the dictation"}]}

Teeth sharing the same clinical picture go in ONE entry. Use only teeth from the resolved list. Any of findings/diagnoses/treatments may be empty — do not invent them. Expand abbreviations you are sure of (RCT = Root canal treatment). No prices. English only. No chartable content → {"entries":[]}.`;
}
