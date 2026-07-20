import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  Mic, Pause, Play, Square, X, Sparkles, Loader2, Check,
  AlertTriangle, RotateCcw, ChevronRight, Plus, Trash2,
} from 'lucide-react';
import API from '../services/api';
import { useDictation } from '../hooks/useDictation';

// Dictation → assessment autofill.
//
// The guiding rule: dictation must never take the dentist away from the chart. So
// this is NOT a modal — it's a slim recorder bar above the assessment columns plus
// a review drawer that slides in beside the chart, leaving the teeth visible while
// the draft is checked against them.
//
// State machine: idle → recording/paused → transcript → extracting → review
//
// Nothing is written to the clinical record until Commit. Commit then replays the
// approved draft through the SAME endpoints the manual charting flow uses, so an
// autofilled treatment is indistinguishable from a hand-charted one — and shows up
// in the treatment-plan board and the invoice with no extra wiring.

const fmtTime = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

// ─── Add-item picker ──────────────────────────────────────────────────────────
// Search the clinic's catalog to add a finding / diagnosis / treatment the AI
// missed. Anything not in the library can still be added as free text (flagged
// `is_new`), mirroring the manual chart modal's "add new" behaviour.
function AddItemPicker({ kind, catalog, onAdd, onCancel }) {
  const [search, setSearch] = useState('');
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const matches = catalog
    .filter(c => c.name.toLowerCase().includes(search.toLowerCase()))
    .slice(0, 6);

  const addFree = () => {
    const name = search.trim();
    if (!name) return;
    onAdd({ name, catalog_id: null, is_new: true, ...(kind === 'treatments' ? { cost: 0 } : {}) });
    setSearch('');
  };

  const label = kind === 'findings' ? 'findings' : kind === 'diagnoses' ? 'diagnoses' : 'treatments';

  return (
    <div className="mt-1.5 border border-[#137fec]/30 rounded-lg p-2 bg-white">
      <div className="flex items-center gap-1.5">
        <input
          ref={inputRef}
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter')  { e.preventDefault(); addFree(); }
            if (e.key === 'Escape') onCancel();
          }}
          placeholder={`Search ${label}…`}
          className="flex-1 min-w-0 text-xs border border-slate-200 rounded px-2 py-1 focus:outline-none focus:border-[#137fec]"
        />
        <button onClick={onCancel} className="p-1 text-slate-400 hover:text-slate-600"><X size={13} /></button>
      </div>

      {matches.length > 0 && (
        <div className="mt-1.5 max-h-32 overflow-y-auto">
          {matches.map(c => (
            <button
              key={c._id}
              onClick={() => {
                onAdd({
                  name: c.name, catalog_id: c._id, is_new: false,
                  ...(kind === 'treatments' ? { cost: c.cost ?? 0 } : {}),
                });
                setSearch('');
              }}
              className="w-full text-left text-xs px-2 py-1 rounded hover:bg-blue-50 text-slate-700 flex justify-between gap-2"
            >
              <span className="truncate">{c.name}</span>
              {kind === 'treatments' && c.cost > 0 && (
                <span className="text-slate-400 flex-shrink-0">₹{c.cost.toLocaleString('en-IN')}</span>
              )}
            </button>
          ))}
        </div>
      )}

      {search.trim() && !matches.some(m => m.name.toLowerCase() === search.trim().toLowerCase()) && (
        <button
          onClick={addFree}
          className="mt-1 w-full text-left text-xs px-2 py-1 rounded text-[#137fec] hover:bg-blue-50 font-medium"
        >
          + Add “{search.trim()}” as a new term
        </button>
      )}
    </div>
  );
}

// One clinical line in an entry — removable, and (for treatments) editable cost.
function ItemRow({ kind, item, onRemove, onCostChange }) {
  const label = kind === 'findings' ? 'Finding' : kind === 'diagnoses' ? 'Dx' : 'Tx';
  return (
    <div className="group/item flex items-center gap-1.5 text-xs text-slate-600 py-0.5">
      <span className="text-slate-400 flex-shrink-0">{label}:</span>
      <span className="truncate">{item.name}</span>

      {kind === 'treatments' && (
        <span className="flex items-center gap-0.5 flex-shrink-0">
          <span className="text-slate-400">₹</span>
          <input
            type="number"
            value={item.cost ?? 0}
            onChange={e => onCostChange(Number(e.target.value) || 0)}
            className="w-16 text-xs border border-slate-200 rounded px-1 py-0.5 focus:outline-none focus:border-[#137fec]"
          />
        </span>
      )}

      {item.is_new && (
        <span className="text-[10px] bg-amber-100 text-amber-700 px-1 py-px rounded font-medium flex-shrink-0">new term</span>
      )}

      <button
        onClick={onRemove}
        title="Remove"
        className="ml-auto p-0.5 rounded text-slate-300 hover:text-red-500 opacity-0 group-hover/item:opacity-100 transition-opacity flex-shrink-0"
      >
        <Trash2 size={12} />
      </button>
    </div>
  );
}

// ─── Review drawer ────────────────────────────────────────────────────────────
function ReviewDrawer({
  draft, patient, onClose, onCommit, committing,
  checked, toggle, onHoverEntry, onRemoveTooth,
  catalogs, onAddItem, onRemoveItem, onCostChange, onNoteChange,
}) {
  const { history, entries, unplaced, failures } = draft;
  const [adding, setAdding] = useState(null); // { entry: idx, kind }

  const historyRows = [];
  if (history) {
    if (history.chief_complaint) {
      historyRows.push({ key: 'chief_complaint', label: 'Chief complaint', value: history.chief_complaint });
    }
    if (history.medical_history?.length) {
      historyRows.push({ key: 'medical_history', label: 'Medical history', value: history.medical_history.join(', '), isAdd: true });
    }
    if (history.dental_history) {
      historyRows.push({
        key: 'dental_history', label: 'Dental history', value: history.dental_history,
        old: patient?.dental_history || '',
      });
    }
    // tobacco_* are booleans: `false` is a real answer ("does not smoke") and must
    // still show. Only null/undefined means "not discussed" and is skipped.
    [['tobacco_smoking', 'Tobacco (smoking)'], ['tobacco_smokeless', 'Tobacco (smokeless)']].forEach(([key, label]) => {
      if (typeof history[key] === 'boolean') {
        historyRows.push({ key, label, value: history[key] ? 'Yes' : 'No' });
      }
    });
    // tea/coffee are free-text quantities ("2-3 cups daily").
    [['tea_consumption', 'Tea'], ['coffee_consumption', 'Coffee']].forEach(([key, label]) => {
      if (history[key]) historyRows.push({ key, label, value: history[key] });
    });
  }

  // Visit Notes tab — consultation note and patient advice. Editable in place: these
  // are long-form prose, and the dentist is far more likely to want to reword them
  // than to accept or reject them wholesale.
  const noteRows = [];
  if (history?.consultation_note) {
    noteRows.push({ key: 'consultation_note', label: 'Consultation note', value: history.consultation_note });
  }
  if (history?.advice) {
    noteRows.push({ key: 'advice', label: 'Patient advice', value: history.advice });
  }

  const selectedCount  = entries.filter((_, i) => checked.entries[i]).length;
  // Notes count too — a dictation that produced only a consultation note is still
  // committable, so Commit must not stay disabled.
  const nothingChecked =
    selectedCount === 0 &&
    !historyRows.some(r => checked.history[r.key]) &&
    !noteRows.some(r => checked.history[r.key]);

  return (
    <div className="fixed inset-y-0 right-0 z-[300] w-full sm:w-[440px] bg-white shadow-2xl border-l border-slate-200 flex flex-col animate-in slide-in-from-right duration-300">
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-[#137fec]" />
          <h3 className="font-bold text-slate-800">Draft assessment</h3>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600">
          <X size={18} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
        {failures?.length > 0 && (
          <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800">
            <p className="font-semibold flex items-center gap-1.5 mb-1"><AlertTriangle size={13} /> Partial result</p>
            {failures.map((f, i) => (
              <p key={i} className="mb-0.5">
                <span className="font-medium capitalize">{f.pass}:</span> {f.message}
              </p>
            ))}
            <p className="text-amber-600/80 mt-1">Anything extracted successfully is shown below.</p>
          </div>
        )}

        {/* ── History ── */}
        {historyRows.length > 0 && (
          <section>
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-2">History</p>
            <div className="space-y-2">
              {historyRows.map(row => (
                <label
                  key={row.key}
                  className={`flex gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                    checked.history[row.key] ? 'border-[#137fec]/40 bg-blue-50/50' : 'border-slate-200 bg-white'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={!!checked.history[row.key]}
                    onChange={() => toggle('history', row.key)}
                    className="mt-0.5 w-4 h-4 rounded accent-[#137fec] cursor-pointer flex-shrink-0"
                  />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-700">
                      {row.label}
                      {row.isAdd && <span className="ml-1.5 text-[10px] text-green-600 font-bold">+ adds to existing</span>}
                    </p>
                    {row.old ? (
                      <p className="text-xs text-slate-500 mt-0.5">
                        <span className="line-through text-slate-400">{row.old}</span>
                        <ChevronRight size={10} className="inline mx-1" />
                        <span className="text-slate-700">{row.value}</span>
                      </p>
                    ) : (
                      <p className="text-xs text-slate-600 mt-0.5 break-words">{row.value}</p>
                    )}
                  </div>
                </label>
              ))}
            </div>
          </section>
        )}

        {/* ── Chart ── */}
        {entries.length > 0 && (
          <section>
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-2">Chart</p>
            <div className="space-y-2">
              {entries.map((e, i) => (
                <div
                  key={i}
                  onMouseEnter={() => onHoverEntry(e.teeth)}
                  onMouseLeave={() => onHoverEntry([])}
                  className={`p-3 rounded-lg border transition-colors ${
                    checked.entries[i] ? 'border-[#137fec]/40 bg-blue-50/50' : 'border-slate-200 bg-white'
                  }`}
                >
                  <div className="flex gap-2.5">
                    <input
                      type="checkbox"
                      checked={!!checked.entries[i]}
                      onChange={() => toggle('entries', i)}
                      className="mt-1 w-4 h-4 rounded accent-[#137fec] cursor-pointer flex-shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      {/* Teeth chips — click to drop a tooth from this entry. */}
                      <div className="flex flex-wrap gap-1 mb-1.5">
                        {e.teeth.map(t => (
                          <button
                            key={t}
                            onClick={() => onRemoveTooth(i, t)}
                            title="Remove this tooth from the entry"
                            className="group px-2 py-0.5 rounded-md bg-[#137fec] text-white text-[11px] font-bold hover:bg-red-500 transition-colors"
                          >
                            {t}<span className="opacity-0 group-hover:opacity-100 ml-1">×</span>
                          </button>
                        ))}
                      </div>

                      {['findings', 'diagnoses', 'treatments'].map(kind =>
                        e[kind].map((item, k) => (
                          <ItemRow
                            key={`${kind}${k}`}
                            kind={kind}
                            item={item}
                            onRemove={() => onRemoveItem(i, kind, k)}
                            onCostChange={(v) => onCostChange(i, k, v)}
                          />
                        )),
                      )}

                      {/* Add anything the dictation missed. */}
                      {adding?.entry === i ? (
                        <AddItemPicker
                          kind={adding.kind}
                          catalog={catalogs[adding.kind] || []}
                          onAdd={(item) => { onAddItem(i, adding.kind, item); setAdding(null); }}
                          onCancel={() => setAdding(null)}
                        />
                      ) : (
                        <div className="flex gap-1 mt-1.5">
                          {[['findings', 'Finding'], ['diagnoses', 'Dx'], ['treatments', 'Tx']].map(([kind, label]) => (
                            <button
                              key={kind}
                              onClick={() => setAdding({ entry: i, kind })}
                              className="flex items-center gap-0.5 text-[11px] text-slate-400 hover:text-[#137fec] border border-dashed border-slate-200 hover:border-[#137fec]/40 rounded px-1.5 py-0.5 transition-colors"
                            >
                              <Plus size={10} /> {label}
                            </button>
                          ))}
                        </div>
                      )}

                      {e.evidence && (
                        <p className="mt-1.5 text-[11px] text-slate-400 italic border-l-2 border-slate-200 pl-2 line-clamp-2">
                          “{e.evidence}”
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Visit notes ── */}
        {noteRows.length > 0 && (
          <section>
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-2">Visit Notes</p>
            <div className="space-y-2">
              {noteRows.map(row => (
                <div
                  key={row.key}
                  className={`p-2.5 rounded-lg border transition-colors ${
                    checked.history[row.key] ? 'border-[#137fec]/40 bg-blue-50/50' : 'border-slate-200 bg-white'
                  }`}
                >
                  <label className="flex items-center gap-2.5 cursor-pointer mb-1.5">
                    <input
                      type="checkbox"
                      checked={!!checked.history[row.key]}
                      onChange={() => toggle('history', row.key)}
                      className="w-4 h-4 rounded accent-[#137fec] cursor-pointer flex-shrink-0"
                    />
                    <span className="text-xs font-semibold text-slate-700">{row.label}</span>
                  </label>
                  {/* Prose invites rewording, so it is editable rather than take-it-or-leave-it. */}
                  <textarea
                    value={row.value}
                    onChange={e => onNoteChange(row.key, e.target.value)}
                    rows={4}
                    className="w-full text-xs text-slate-700 border border-slate-200 rounded p-2 focus:outline-none focus:border-[#137fec] resize-y leading-relaxed"
                  />
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Unplaced ── */}
        {unplaced?.length > 0 && (
          <section className="rounded-lg bg-amber-50 border border-amber-200 p-3">
            <p className="text-xs font-semibold text-amber-800 flex items-center gap-1.5 mb-1.5">
              <AlertTriangle size={13} /> Couldn’t place on a tooth
            </p>
            {unplaced.map((u, i) => (
              <p key={i} className="text-xs text-amber-700">
                “{u.spoken}” <span className="text-amber-600/70">— {u.reason}</span>
              </p>
            ))}
            <p className="text-[11px] text-amber-600/80 mt-1.5">
              Chart these by hand — select the tooth and use “Add Treatment”.
            </p>
          </section>
        )}

        {entries.length === 0 && historyRows.length === 0 && (
          <p className="text-sm text-slate-400 text-center py-8">Nothing to fill from this dictation.</p>
        )}
      </div>

      <div className="border-t border-slate-100 px-5 py-4">
        <button
          onClick={onCommit}
          disabled={committing || nothingChecked}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#137fec] text-white font-semibold text-sm hover:bg-[#0f6fd4] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {committing
            ? <><Loader2 size={15} className="animate-spin" /> Filling…</>
            : <><Check size={15} /> Commit to assessment</>}
        </button>
        <p className="text-[11px] text-slate-400 text-center mt-2">
          {[
            selectedCount ? `${selectedCount} chart ${selectedCount === 1 ? 'entry' : 'entries'}` : '',
            noteRows.filter(r => checked.history[r.key]).length
              ? `${noteRows.filter(r => checked.history[r.key]).length} note${noteRows.filter(r => checked.history[r.key]).length > 1 ? 's' : ''}`
              : '',
          ].filter(Boolean).join(' · ') || 'Nothing selected'}
        </p>
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function AssessmentDictation({
  patientId, patient, appointmentId, currentVisit,
  onHighlightTeeth, onCommitted, reloadCredits,
}) {
  const dictation = useDictation({ onCreditsExhausted: reloadCredits });

  const [stage, setStage]           = useState('idle'); // idle|recording|transcript|extracting|review
  const [transcript, setTranscript] = useState('');
  const [duration, setDuration]     = useState(0);
  const [draft, setDraft]           = useState(null);
  const [checked, setChecked]       = useState({ history: {}, entries: {} });
  const [error, setError]           = useState('');
  const [committing, setCommitting] = useState(false);
  const [banner, setBanner]         = useState('');

  // The clinic's libraries — used by the drawer's "add item" pickers so a manual
  // correction lands on a real catalog entry (with its price) rather than free text.
  const [catalogs, setCatalogs] = useState({ findings: [], diagnoses: [], treatments: [] });

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      API.get('/clinical-findings'),
      API.get('/diagnoses'),
      API.get('/suggested-treatments'),
    ])
      .then(([f, d, t]) => {
        if (cancelled) return;
        setCatalogs({ findings: f.data || [], diagnoses: d.data || [], treatments: t.data || [] });
      })
      .catch(() => { /* pickers fall back to free text */ });
    return () => { cancelled = true; };
  }, []);

  async function handleStart() {
    setError(''); setBanner(''); setDraft(null);
    try {
      await dictation.start();
      setStage('recording');
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleStop() {
    try {
      const { transcript: text, durationSeconds } = await dictation.stop();
      if (!text) {
        setError('No speech was captured. Please try again.');
        setStage('idle');
        return;
      }
      setTranscript(text);
      setDuration(durationSeconds);
      setStage('transcript');
    } catch (err) {
      setError(err.message || 'Transcription failed.');
      setStage('idle');
    }
  }

  function handleCancel() {
    dictation.cancel();
    setStage('idle');
    setTranscript('');
    setDraft(null);
    setError('');
    onHighlightTeeth?.([]);
  }

  // The transcript stays in state across a failed extraction, so "retry" never means
  // "re-dictate" — the dentist's words are not thrown away on an API blip.
  async function handleExtract() {
    setStage('extracting');
    setError('');
    try {
      const { data } = await API.post('/assessment/autofill', {
        patient_id: patientId,
        transcript_text: transcript,
        audio_duration_seconds: duration,
      });

      // Everything starts checked — the dentist unchecks what's wrong rather than
      // opting in to each correct row (the common case is "it got it right").
      // `false` (tobacco explicitly denied) is a real value; only null/""/[] are absent.
      const isPresent = (v) => {
        if (typeof v === 'boolean') return true;
        return Array.isArray(v) ? v.length > 0 : !!v;
      };
      setChecked({
        history: Object.fromEntries(
          Object.entries(data.history || {}).filter(([, v]) => isPresent(v)).map(([k]) => [k, true]),
        ),
        entries: Object.fromEntries((data.entries || []).map((_, i) => [i, true])),
      });
      setDraft(data);
      setStage('review');
      setDuration(0); // already billed — a retry from this draft must not re-charge
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Extraction failed.');
      setStage('transcript'); // back to the transcript, still intact — retry is free
    }
  }

  const toggle = useCallback((group, key) => {
    setChecked(prev => ({ ...prev, [group]: { ...prev[group], [key]: !prev[group][key] } }));
  }, []);

  // ── Draft editing: the dentist corrects the AI in place, before anything is written ──
  const patchEntry = (entryIdx, fn) => {
    setDraft(prev => ({
      ...prev,
      entries: prev.entries.map((e, i) => (i === entryIdx ? fn(e) : e)),
    }));
  };

  const removeTooth = useCallback((entryIdx, tooth) => {
    patchEntry(entryIdx, e => ({ ...e, teeth: e.teeth.filter(t => t !== tooth) }));
  }, []);

  const addItem = useCallback((entryIdx, kind, item) => {
    patchEntry(entryIdx, e => ({ ...e, [kind]: [...e[kind], item] }));
  }, []);

  const removeItem = useCallback((entryIdx, kind, itemIdx) => {
    patchEntry(entryIdx, e => ({ ...e, [kind]: e[kind].filter((_, k) => k !== itemIdx) }));
  }, []);

  const changeCost = useCallback((entryIdx, itemIdx, cost) => {
    patchEntry(entryIdx, e => ({
      ...e,
      treatments: e.treatments.map((t, k) => (k === itemIdx ? { ...t, cost } : t)),
    }));
  }, []);

  // Consultation note / patient advice — reworded in place before commit.
  const changeNote = useCallback((key, value) => {
    setDraft(prev => ({ ...prev, history: { ...prev.history, [key]: value } }));
  }, []);

  // ── Commit ──────────────────────────────────────────────────────────────────
  // Rides the existing rails: POST /visits (the same payload the manual chart modal
  // sends → append/merge and the dentition lock come free) and PUT /patients.
  async function handleCommit() {
    setCommitting(true);
    setError('');
    try {
      // Skip entries the dentist emptied out (all teeth or all items removed).
      const selected = draft.entries.filter((e, i) =>
        checked.entries[i] &&
        e.teeth.length > 0 &&
        (e.findings.length || e.diagnoses.length || e.treatments.length),
      );
      const h = draft.history || {};
      const calls = [];

      // 1. Patient-level history.
      const patientUpdate = {};
      if (checked.history.medical_history && h.medical_history?.length) {
        patientUpdate.medical_history = Array.from(
          new Set([...(patient?.medical_history || []), ...h.medical_history]),
        );
      }
      if (checked.history.dental_history && h.dental_history) patientUpdate.dental_history = h.dental_history;
      // Booleans: save `false` too — it means the patient was asked and denied it.
      ['tobacco_smoking', 'tobacco_smokeless'].forEach(k => {
        if (checked.history[k] && typeof h[k] === 'boolean') patientUpdate[k] = h[k];
      });
      ['tea_consumption', 'coffee_consumption'].forEach(k => {
        if (checked.history[k] && h[k]) patientUpdate[k] = h[k];
      });
      if (Object.keys(patientUpdate).length) calls.push(API.put(`/patients/${patientId}`, patientUpdate));

      // 2. Chief complaint lives on the visit, not the patient.
      if (checked.history.chief_complaint && h.chief_complaint && currentVisit?._id) {
        calls.push(API.patch(`/visits/${currentVisit._id}`, { chief_complaint: h.chief_complaint }));
      }

      // 3. Visit Notes tab. These endpoints find-or-create today's visit themselves,
      // so they work even when no visit exists yet.
      let notesSaved = 0;
      if (checked.history.consultation_note && h.consultation_note?.trim()) {
        calls.push(API.post(`/visits/patient/${patientId}/note`, {
          content: h.consultation_note.trim(),
          appointment_id: appointmentId || null,
        }));
        notesSaved++;
      }
      if (checked.history.advice && h.advice?.trim()) {
        calls.push(API.post(`/visits/patient/${patientId}/advice`, {
          content: h.advice.trim(),
          appointment_id: appointmentId || null,
        }));
        notesSaved++;
      }

      // 4. The chart — one POST /visits, built exactly as the manual modal builds it.
      const counts = { f: 0, d: 0, t: 0, teeth: new Set() };
      if (selected.length) {
        const treatments = [];
        const tooth_findings = [];
        const tooth_diagnoses = [];

        selected.forEach(e => {
          e.teeth.forEach(t => counts.teeth.add(t));
          e.treatments.forEach(t => {
            treatments.push({
              teeth_numbers: e.teeth,
              surfaces: [],
              treatment_name: t.name,
              cost: Number(t.cost) || 0,
              status: 'Planned',
              qty: 1,
            });
            counts.t++;
          });
          e.findings.forEach(f => { tooth_findings.push({ name: f.name, teeth_numbers: e.teeth }); counts.f++; });
          e.diagnoses.forEach(d => { tooth_diagnoses.push({ name: d.name, teeth_numbers: e.teeth }); counts.d++; });
        });

        calls.push(API.post('/visits', {
          patient_id: patientId,
          appointment_id: appointmentId || null,
          dentition_type: 'Adult', // v1 scope; the backend's 409 lock guards a mismatch
          date: new Date(),
          treatments,
          findings: {
            // Legacy flat fields, kept in sync the way the manual modal does.
            clinical_findings: tooth_findings.map(f => f.name),
            diagnosis_notes:   tooth_diagnoses.map(d => d.name).join(', '),
            tooth_findings,
            tooth_diagnoses,
          },
        }));
      }

      const results = await Promise.allSettled(calls);
      const failed = results.filter(r => r.status === 'rejected');
      if (results.length > 0 && failed.length === results.length) {
        throw new Error(failed[0].reason?.response?.data?.error || 'Could not save the assessment.');
      }

      const parts = [];
      if (counts.f) parts.push(`${counts.f} finding${counts.f > 1 ? 's' : ''}`);
      if (counts.d) parts.push(`${counts.d} diagnos${counts.d > 1 ? 'es' : 'is'}`);
      if (counts.t) parts.push(`${counts.t} treatment${counts.t > 1 ? 's' : ''}`);
      const chartPart = parts.length
        ? `${parts.join(', ')} on ${counts.teeth.size} ${counts.teeth.size === 1 ? 'tooth' : 'teeth'}`
        : '';
      const notesPart = notesSaved ? `${notesSaved} visit note${notesSaved > 1 ? 's' : ''}` : '';
      const filled = [chartPart, notesPart].filter(Boolean).join(' · ');
      const summary = filled ? `Filled: ${filled}.` : 'History updated.';

      setBanner(failed.length ? `${summary} (some parts failed to save)` : summary);
      setDraft(null);
      setStage('idle');
      setTranscript('');
      onHighlightTeeth?.([]);
      onCommitted?.(); // re-fetch → the chart lights up; that IS the confirmation
    } catch (err) {
      setError(err.message || 'Commit failed.');
    } finally {
      setCommitting(false);
    }
  }

  // ── Idle ────────────────────────────────────────────────────────────────────
  if (stage === 'idle') {
    return (
      <div className="mb-3">
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={handleStart}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#137fec] text-white text-sm font-semibold hover:bg-[#0f6fd4] transition-colors shadow-sm"
          >
            <Mic size={15} /> Dictate assessment
          </button>
          {banner && (
            <span className="flex items-center gap-1.5 text-xs font-medium text-green-700 bg-green-50 border border-green-200 px-3 py-1.5 rounded-lg">
              <Check size={13} /> {banner}
            </span>
          )}
        </div>
        {error && (
          <p className="mt-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
        )}
      </div>
    );
  }

  return (
    <>
      {/* ── Recorder bar: the page below stays fully interactive ── */}
      <div className="mb-3 rounded-xl border-2 border-[#137fec]/30 bg-white shadow-sm overflow-hidden">
        {stage === 'recording' && dictation.state !== 'finalizing' && (
          <div className="flex items-center gap-3 px-4 py-3">
            <span className={`size-2.5 rounded-full flex-shrink-0 ${
              dictation.state === 'paused' ? 'bg-amber-500' : 'bg-red-500 animate-pulse'
            }`} />
            <span className="text-sm font-bold text-slate-700 tabular-nums flex-shrink-0">
              {fmtTime(dictation.seconds)}
            </span>

            {/* Live transcript — the dentist sees "26" appear as they say it. */}
            <p className="flex-1 min-w-0 text-xs text-slate-500 italic truncate">
              {dictation.liveTranscript
                ? `…${dictation.liveTranscript.slice(-90)}`
                : dictation.state === 'paused' ? 'Paused' : 'Listening…'}
            </p>

            <div className="flex items-center gap-1.5 flex-shrink-0">
              {dictation.state === 'paused' ? (
                <button onClick={dictation.resume} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold">
                  <Play size={13} /> Resume
                </button>
              ) : (
                <button onClick={dictation.pause} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold">
                  <Pause size={13} /> Pause
                </button>
              )}
              <button onClick={handleStop} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#137fec] hover:bg-[#0f6fd4] text-white text-xs font-semibold">
                <Square size={12} /> Done
              </button>
              <button onClick={handleCancel} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600">
                <X size={15} />
              </button>
            </div>
          </div>
        )}

        {dictation.state === 'finalizing' && (
          <div className="flex items-center gap-2 px-4 py-3 text-sm text-slate-600">
            <Loader2 size={15} className="animate-spin text-[#137fec]" /> Finalizing transcript…
          </div>
        )}

        {/* One glance at the words before spending an extraction on them. */}
        {stage === 'transcript' && (
          <div className="p-4">
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-2">Transcript</p>
            <textarea
              value={transcript}
              onChange={e => setTranscript(e.target.value)}
              rows={4}
              className="w-full text-sm text-slate-700 border border-slate-200 rounded-lg p-2.5 focus:outline-none focus:border-[#137fec] resize-y"
            />
            <div className="flex items-center gap-2 mt-2.5">
              <button
                onClick={handleExtract}
                disabled={!transcript.trim()}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#137fec] text-white text-sm font-semibold hover:bg-[#0f6fd4] disabled:opacity-50"
              >
                <Sparkles size={14} /> Fill assessment
              </button>
              <button onClick={handleStart} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 text-sm font-medium">
                <RotateCcw size={13} /> Re-record
              </button>
              <button onClick={handleCancel} className="ml-auto p-1.5 rounded-lg hover:bg-slate-100 text-slate-400">
                <X size={15} />
              </button>
            </div>
          </div>
        )}

        {stage === 'extracting' && (
          <div className="flex items-center gap-2.5 px-4 py-3.5">
            <Loader2 size={15} className="animate-spin text-[#137fec]" />
            <span className="text-sm text-slate-600 font-medium">Reading the dictation…</span>
            <span className="text-xs text-slate-400">history · teeth · chart</span>
          </div>
        )}

        {(dictation.warning || error) && (
          <div className="px-4 pb-3 -mt-1">
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              {error || dictation.warning}
            </p>
          </div>
        )}
      </div>

      {stage === 'review' && draft && (
        <ReviewDrawer
          draft={draft}
          patient={patient}
          checked={checked}
          toggle={toggle}
          committing={committing}
          catalogs={catalogs}
          onRemoveTooth={removeTooth}
          onAddItem={addItem}
          onRemoveItem={removeItem}
          onCostChange={changeCost}
          onNoteChange={changeNote}
          onHoverEntry={(teeth) => onHighlightTeeth?.(teeth)}
          onClose={handleCancel}
          onCommit={handleCommit}
        />
      )}
    </>
  );
}
