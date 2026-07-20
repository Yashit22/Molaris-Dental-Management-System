// Resolve spoken tooth references to FDI numbers — WITHOUT an LLM.
//
// Dentists dictate tooth numbers digit-by-digit ("two six" = 26, quadrant 2, tooth 6).
// That is the only way they refer to a tooth, which makes this a parsing problem, not
// a reasoning one. So it is done in code:
//
//   • deterministic — a tooth number can never be hallucinated
//   • instant       — no API call, no reasoning tokens
//   • removes an entire LLM pass, and with it a third of the failure surface
//
// Speech-to-text renders the same dictation inconsistently, so all three forms are
// accepted: "2 6" (separated digits), "26" (joined), and "two six" (number words).
//
// v1 scope: adult permanent dentition (FDI 11-18, 21-28, 31-38, 41-48).

import { ADULT_FDI } from '../config/assessmentAutofill.config.js';

const WORD_DIGITS = {
  zero: 0, one: 1, two: 2, three: 3, four: 4,
  five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  // Hindi / Marathi — dictation is often mixed-language.
  ek: 1, do: 2, teen: 3, char: 4, chaar: 4,
  paanch: 5, panch: 5, chhe: 6, che: 6, chha: 6,
  saat: 7, sat: 7, aath: 8, ath: 8, nau: 9,
};

const isValidFDI = (n) => ADULT_FDI.includes(String(n));

// A "26" spoken as one word ("twenty six") is NOT how dentists chart, but STT may
// still collapse "two six" into "26" — so a bare valid 2-digit number is accepted.
const JOINED = /\b([1-4][1-8])\b/g;

// Normalize the transcript into a digit stream, keeping track of the words each
// digit came from so `spoken` can quote what the dentist actually said.
function tokenize(text) {
  return String(text || '')
    .split(/\s+/)
    .map(raw => {
      const w = raw.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (!w) return null;
      if (/^\d$/.test(w))            return { digit: Number(w), raw };
      if (WORD_DIGITS[w] !== undefined) return { digit: WORD_DIGITS[w], raw };
      return { digit: null, raw };
    })
    .filter(Boolean);
}

// Two adjacent digits in the valid range are NOT always a tooth. A dentist also says
// "take one two times a day" (→ 12) or "BP is one four zero" (→ 14). A phantom tooth
// is a clinical-record error, so a digit pair is only accepted when its surroundings
// look clinical rather than like a dose or a vital sign.
const DOSAGE_CONTEXT = /\b(times?|daily|hourly|days?|weeks?|months?|years?|hours?|mg|ml|milligram|tablet|tabs?|capsule|cups?|bp|pressure|pulse|sugar|age|aged|old|over|per|every|twice|thrice|once)\b/;

// Words that mark a tooth being talked about clinically.
const TOOTH_CONTEXT = /\b(tooth|teeth|caries|cavity|decay|decayed|pulp|pulpitis|rct|root canal|crown|filling|restoration|extract|extraction|scaling|polish|attrition|abrasion|erosion|fracture|fractured|mobile|mobility|sensitiv|pain|tender|percussion|periapical|abscess|missing|impacted|wisdom|molar|premolar|incisor|canine|distal|mesial|buccal|lingual|palatal|occlusal|grossly|filled|do|treat|plan|number)\b/;

const WINDOW = 40; // characters either side of the match to inspect

function looksClinical(text, start, end) {
  const before = text.slice(Math.max(0, start - WINDOW), start).toLowerCase();
  const after  = text.slice(end, end + WINDOW).toLowerCase();
  const ctx = `${before} ${after}`;

  // A dosage/vitals cue immediately AFTER the digits is the strongest signal that
  // this is not a tooth ("one two times a day", "one four zero over ninety").
  if (DOSAGE_CONTEXT.test(after.slice(0, 20))) return false;

  // Otherwise require some clinical dental language nearby.
  return TOOTH_CONTEXT.test(ctx);
}

/**
 * Extract every tooth reference from a transcript.
 *
 * Returns { mentions: [{ spoken, teeth: ['26'], confident: true }], unplaced: [] }
 * — the same shape the LLM pass returned, so callers are unchanged.
 */
export function parseTeeth(transcript) {
  const text = String(transcript || '');
  const mentions = [];
  const seen = new Set(); // dedupe: the same tooth said twice is one mention

  const push = (tooth, spoken) => {
    const t = String(tooth);
    if (!isValidFDI(t) || seen.has(t)) return;
    seen.add(t);
    mentions.push({ spoken, teeth: [t], confident: true });
  };

  // ── Form A: joined digits already in the text ("26") ──
  let m;
  const joined = new RegExp(JOINED);
  while ((m = joined.exec(text)) !== null) {
    if (looksClinical(text, m.index, m.index + m[0].length)) push(m[1], m[1]);
  }

  // ── Forms B & C: adjacent single digits, as numerals ("2 6") or words ("two six").
  // A pair only counts if quadrant ∈ 1-4 and position ∈ 1-8 — that alone rejects
  // "forty year old" and "three days" — and only if the context looks clinical,
  // which rejects "one two times a day".
  const toks = tokenize(text);
  for (let i = 0; i < toks.length - 1; i++) {
    const a = toks[i];
    const b = toks[i + 1];
    if (a.digit === null || b.digit === null) continue;
    if (a.digit < 1 || a.digit > 4) continue;   // quadrant
    if (b.digit < 1 || b.digit > 8) continue;   // tooth position

    const phrase = `${a.raw} ${b.raw}`;
    const at = text.indexOf(phrase);
    if (at !== -1 && !looksClinical(text, at, at + phrase.length)) continue;

    push(`${a.digit}${b.digit}`, phrase);
  }

  return { mentions, unplaced: [] };
}

export const __test = { tokenize, looksClinical };
