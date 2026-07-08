import { useState, useEffect, useRef } from 'react';
import { Plus, Pill, Calendar, Clock, Info, Pencil, Check, X } from 'lucide-react';
import API from '../services/api';
import { DOSAGE_OPTIONS, DURATION_OPTIONS } from '../data/prescriptionOptions';

const emptyRow = () => ({ drug_name: '', dosage: '', duration: '', instructions: '' });

// ── Medicine name field with catalog substring search ─────────────────────────
// Plain substring (.includes) match against name + composition. Typing a value
// not in the catalog is allowed (free text) — nothing is ever saved to the
// catalog from here. Selecting a catalog item pre-fills dosage/duration/instructions.
function MedicineNameInput({ value, catalog, onNameChange, onSelectMedicine }) {
  const [showDropdown, setShowDropdown] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!showDropdown) return;
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setShowDropdown(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showDropdown]);

  const q = value.trim().toLowerCase();
  const matches = q
    ? catalog.filter(m =>
        m.name.toLowerCase().includes(q) ||
        (m.composition && m.composition.toLowerCase().includes(q))
      ).slice(0, 20)
    : [];

  return (
    <div className="relative" ref={containerRef}>
      <input
        className="w-full border border-gray-200 rounded-md px-2.5 py-1.5 text-sm focus:outline-none focus:border-[#137fec]"
        placeholder="Medicine name..."
        value={value}
        onChange={e => { onNameChange(e.target.value); setShowDropdown(true); }}
        onFocus={() => setShowDropdown(true)}
      />
      {showDropdown && matches.length > 0 && (
        <div className="absolute z-[300] left-0 right-0 mt-1 bg-white border border-slate-200 rounded-md shadow-xl max-h-52 overflow-auto">
          {matches.map(m => (
            <div
              key={m._id}
              className="px-3 py-2 hover:bg-blue-50 cursor-pointer text-sm"
              onMouseDown={e => { e.preventDefault(); onSelectMedicine(m); setShowDropdown(false); }}
            >
              <div className="font-medium text-slate-800 truncate">{m.name}</div>
              {m.composition && <div className="text-[11px] text-slate-400 truncate">{m.composition}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const formatVisitDate = (date) =>
  new Date(date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

// ── Dosage visualiser ─────────────────────────────────────────────────────────
// Parses "M-A-E" codes like "1-0-1" and renders pill slots.
function DosageDisplay({ dosage }) {
  if (!dosage) return <span className="text-slate-400 text-xs italic">—</span>;

  const maeMatch = dosage.match(/^(\d)-(\d)-(\d)$/);
  if (maeMatch) {
    const slots = [
      { label: 'M', title: 'Morning',   active: maeMatch[1] !== '0' },
      { label: 'A', title: 'Afternoon', active: maeMatch[2] !== '0' },
      { label: 'E', title: 'Evening',   active: maeMatch[3] !== '0' },
    ];
    return (
      <div className="flex items-center gap-1" title={slots.filter(s => s.active).map(s => s.title).join(', ') || 'None'}>
        {slots.map(s => (
          <span
            key={s.label}
            title={s.title}
            className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-bold border transition-colors ${
              s.active
                ? 'bg-[#137fec] text-white border-[#137fec]'
                : 'bg-slate-100 text-slate-300 border-slate-200'
            }`}
          >
            {s.label}
          </span>
        ))}
      </div>
    );
  }

  // Non-MAE codes — show as a badge
  const badgeColors = {
    'SOS': 'bg-amber-50 text-amber-700 border-amber-200',
    'Once daily': 'bg-blue-50 text-blue-700 border-blue-200',
    'Twice daily': 'bg-indigo-50 text-indigo-700 border-indigo-200',
    'Thrice daily': 'bg-purple-50 text-purple-700 border-purple-200',
  };
  const cls = badgeColors[dosage] || 'bg-slate-100 text-slate-600 border-slate-200';
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold border ${cls}`}>
      {dosage}
    </span>
  );
}

// ── Single prescription card ──────────────────────────────────────────────────
function PrescriptionCard({ p, onDelete, onSave }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft]     = useState(null);
  const [saving, setSaving]   = useState(false);

  const startEdit = () => {
    setDraft({
      drug_name:    p.drug_name || '',
      dosage:       p.dosage || '',
      duration:     p.duration || '',
      instructions: p.instructions || '',
    });
    setEditing(true);
  };

  const cancelEdit = () => { setEditing(false); setDraft(null); };

  const saveEdit = async () => {
    if (!draft.drug_name.trim()) return;
    setSaving(true);
    try {
      await onSave(p.visitId, p._id, draft);
      setEditing(false);
      setDraft(null);
    } finally {
      setSaving(false);
    }
  };

  // ── Edit mode ──
  if (editing) {
    return (
      <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-blue-50/40 border border-blue-100">
        <div className="mt-0.5 flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-[#137fec]">
          <Pill size={15} />
        </div>
        <div className="grid grid-cols-[2fr_1.2fr_1.2fr_1.5fr] gap-2 flex-1 min-w-0">
          <input
            className="w-full border border-slate-200 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:border-[#137fec]"
            placeholder="Medicine name..."
            value={draft.drug_name}
            onChange={e => setDraft(d => ({ ...d, drug_name: e.target.value }))}
          />
          <select
            className="w-full border border-slate-200 rounded-md px-2 py-1.5 text-sm bg-white focus:outline-none focus:border-[#137fec]"
            value={draft.dosage}
            onChange={e => setDraft(d => ({ ...d, dosage: e.target.value }))}
          >
            <option value="">-- Dosage --</option>
            {DOSAGE_OPTIONS.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
          <select
            className="w-full border border-slate-200 rounded-md px-2 py-1.5 text-sm bg-white focus:outline-none focus:border-[#137fec]"
            value={draft.duration}
            onChange={e => setDraft(d => ({ ...d, duration: e.target.value }))}
          >
            <option value="">-- Duration --</option>
            {DURATION_OPTIONS.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
          <input
            className="w-full border border-slate-200 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:border-[#137fec]"
            placeholder="After food..."
            value={draft.instructions}
            onChange={e => setDraft(d => ({ ...d, instructions: e.target.value }))}
          />
        </div>
        <button
          onClick={saveEdit}
          disabled={saving || !draft.drug_name.trim()}
          className="flex-shrink-0 flex items-center justify-center w-7 h-7 rounded-md text-green-600 hover:bg-green-100 disabled:opacity-40"
          title="Save"
        >
          <Check size={16} />
        </button>
        <button
          onClick={cancelEdit}
          disabled={saving}
          className="flex-shrink-0 flex items-center justify-center w-7 h-7 rounded-md text-slate-400 hover:bg-slate-100"
          title="Cancel"
        >
          <X size={16} />
        </button>
      </div>
    );
  }

  // ── Read-only mode ──
  return (
    <div className="group flex items-start gap-3 px-3 py-3 rounded-xl hover:bg-slate-50 border border-transparent hover:border-slate-200 transition-all">
      {/* Icon */}
      <div className="mt-0.5 flex-shrink-0 w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center text-[#137fec]">
        <Pill size={15} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-slate-800 text-sm truncate">{p.drug_name}</p>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-1.5">
          {/* Dosage */}
          <div className="flex items-center gap-1.5">
            <DosageDisplay dosage={p.dosage} />
            {p.dosage?.match(/^\d-\d-\d$/) && (
              <span className="text-xs text-slate-400">{p.dosage}</span>
            )}
          </div>

          {/* Duration */}
          {p.duration && (
            <div className="flex items-center gap-1 text-xs text-slate-500">
              <Clock size={11} className="text-slate-400" />
              {p.duration}
            </div>
          )}

          {/* Instructions */}
          {p.instructions && (
            <div className="flex items-center gap-1 text-xs text-slate-500">
              <Info size={11} className="text-slate-400" />
              {p.instructions}
            </div>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 self-center opacity-0 group-hover:opacity-100 transition-all">
        <button
          onClick={startEdit}
          className="flex-shrink-0 flex items-center gap-1 text-slate-400 hover:text-[#137fec] text-xs px-2 py-1 rounded border border-transparent hover:border-blue-200"
        >
          <Pencil size={12} /> Edit
        </button>
        <button
          onClick={() => onDelete(p.visitId, p._id)}
          className="flex-shrink-0 text-red-400 hover:text-red-600 text-xs px-2 py-1 rounded border border-transparent hover:border-red-200"
        >
          Remove
        </button>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function MedicationsPanel({ visits = [], patientId, onRefresh, targetVisitId = null, appointmentId = null }) {
  const [showForm, setShowForm]           = useState(false);
  const [rows, setRows]                   = useState([emptyRow()]);
  const [saving, setSaving]               = useState(false);
  const [catalog, setCatalog]             = useState([]);

  // Load the medicine catalog once for the name search dropdown.
  useEffect(() => {
    let cancelled = false;
    API.get('/medicines')
      .then(({ data }) => { if (!cancelled) setCatalog(Array.isArray(data) ? data : []); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const allPrescriptions = visits
    .filter(v => v.prescriptions?.length > 0)
    .flatMap(v => v.prescriptions.map(p => ({ ...p, visitId: v._id, visitDate: v.date })))
    .sort((a, b) => new Date(b.visitDate) - new Date(a.visitDate));

  // Group by visit date
  const grouped = allPrescriptions.reduce((acc, p) => {
    const key = formatVisitDate(p.visitDate);
    (acc[key] ||= []).push(p);
    return acc;
  }, {});

  const updateRow = (idx, field, value) =>
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r));

  const addRow    = () => setRows(prev => [...prev, emptyRow()]);
  const removeRow = (idx) => setRows(prev => prev.length === 1 ? prev : prev.filter((_, i) => i !== idx));

  const handleSaveAll = async () => {
    const valid = rows.filter(r => r.drug_name.trim());
    if (!valid.length) return;
    setSaving(true);
    try {
      // Prefer an explicit target visit; otherwise link the new visit to the
      // active appointment (reliable on the first action), falling back to
      // whatever is already stamped on the current visit.
      const cur = visits?.[0];
      const apptId = appointmentId
        || (cur ? ((typeof cur.appointment_id === 'object' ? cur.appointment_id?._id : cur.appointment_id) || null) : null);
      await Promise.all(valid.map(r =>
        API.post(`/visits/patient/${patientId}/prescription`,
          targetVisitId ? { ...r, visit_id: targetVisitId } : { ...r, appointment_id: apptId })
      ));
      setRows([emptyRow()]);
      setShowForm(false);
      onRefresh?.();
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleDiscard = () => { setRows([emptyRow()]); setShowForm(false); };

  const handleDelete = async (visitId, prescriptionId) => {
    try {
      await API.delete(`/visits/${visitId}/prescriptions/${prescriptionId}`);
      onRefresh?.();
    } catch (err) {
      console.error(err);
    }
  };

  const handleEdit = async (visitId, prescriptionId, fields) => {
    try {
      await API.patch(`/visits/${visitId}/prescriptions/${prescriptionId}`, fields);
      onRefresh?.();
    } catch (err) {
      console.error(err);
      throw err; // let the card keep edit mode open on failure
    }
  };

  const validRowCount = rows.filter(r => r.drug_name.trim()).length;

  return (
    <div className="p-5 bg-white rounded-xl shadow-sm border border-gray-100 mb-6">
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-50 rounded-full flex items-center justify-center text-[#137fec]">
            <Pill size={20} />
          </div>
          <h3 className="font-semibold text-lg text-slate-800">Medications</h3>
        </div>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors font-medium text-sm"
          >
            <Plus size={16} /> Prescribe Medicine
          </button>
        )}
      </div>

      {/* ── Prescription entry form ── */}
      {showForm && (
        <div className="mb-5 rounded-xl border border-blue-100 overflow-hidden">
          <div className="grid grid-cols-[2fr_1.2fr_1.2fr_1.5fr_32px] gap-2 px-3 py-2 bg-blue-50/60 border-b border-blue-100">
            <span className="text-xs font-semibold text-slate-500">Drug Name *</span>
            <span className="text-xs font-semibold text-slate-500">Dosage</span>
            <span className="text-xs font-semibold text-slate-500">Duration</span>
            <span className="text-xs font-semibold text-slate-500">Instructions</span>
            <span></span>
          </div>

          <div className="flex flex-col divide-y divide-slate-100">
            {rows.map((row, idx) => (
              <div key={idx} className="grid grid-cols-[2fr_1.2fr_1.2fr_1.5fr_32px] gap-2 items-center px-3 py-2 bg-white">
                <MedicineNameInput
                  value={row.drug_name}
                  catalog={catalog}
                  onNameChange={val => updateRow(idx, 'drug_name', val)}
                  onSelectMedicine={m => setRows(prev => prev.map((r, i) => i === idx ? {
                    ...r,
                    drug_name:    m.name,
                    // Pre-fill from catalog defaults only when the option is valid
                    // for the fixed selects; otherwise leave the current value.
                    dosage:       DOSAGE_OPTIONS.includes(m.default_dosage) ? m.default_dosage : r.dosage,
                    duration:     DURATION_OPTIONS.includes(m.default_duration) ? m.default_duration : r.duration,
                    instructions: m.default_instructions || r.instructions,
                  } : r))}
                />
                <select
                  className="w-full border border-gray-200 rounded-md px-2.5 py-1.5 text-sm focus:outline-none focus:border-[#137fec] bg-white"
                  value={row.dosage}
                  onChange={e => updateRow(idx, 'dosage', e.target.value)}
                >
                  <option value="">-- Select --</option>
                  {DOSAGE_OPTIONS.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
                <select
                  className="w-full border border-gray-200 rounded-md px-2.5 py-1.5 text-sm focus:outline-none focus:border-[#137fec] bg-white"
                  value={row.duration}
                  onChange={e => updateRow(idx, 'duration', e.target.value)}
                >
                  <option value="">-- Select --</option>
                  {DURATION_OPTIONS.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
                <input
                  className="w-full border border-gray-200 rounded-md px-2.5 py-1.5 text-sm focus:outline-none focus:border-[#137fec]"
                  placeholder="After food..."
                  value={row.instructions}
                  onChange={e => updateRow(idx, 'instructions', e.target.value)}
                />
                <button
                  onClick={() => removeRow(idx)}
                  disabled={rows.length === 1}
                  className="flex items-center justify-center w-7 h-7 rounded-md text-slate-300 hover:text-red-400 hover:bg-red-50 disabled:opacity-0 transition-colors"
                >
                  ×
                </button>
              </div>
            ))}
          </div>

          {/* Dosage legend */}
          <div className="px-3 py-1.5 bg-slate-50/70 border-t border-slate-100 flex items-center gap-2 text-[10px] text-slate-400">
            <span className="font-semibold">Dosage codes:</span>
            <span>M = Morning · A = Afternoon · E = Evening</span>
            <span>e.g. 1-0-1 = morning + evening</span>
          </div>

          <div className="flex items-center justify-between px-3 py-2 bg-slate-50 border-t border-slate-100">
            <button
              onClick={addRow}
              className="flex items-center gap-1 text-xs text-[#137fec] font-medium hover:underline"
            >
              <Plus size={13} /> Add Medicine
            </button>
            <div className="flex gap-2">
              <button onClick={handleDiscard} className="px-4 py-1.5 text-sm border border-slate-200 rounded-lg text-slate-500 hover:bg-slate-100">
                Discard
              </button>
              <button
                onClick={handleSaveAll}
                disabled={saving || validRowCount === 0}
                className="px-4 py-1.5 text-sm bg-[#137fec] text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? 'Saving...' : validRowCount > 1 ? `Save All (${validRowCount})` : 'Save Prescription'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Prescription history (grouped by visit date) ── */}
      {allPrescriptions.length === 0 ? (
        <div className="flex items-center justify-center py-8 text-slate-400 text-sm bg-slate-50 rounded-xl border border-dashed border-slate-200">
          No prescriptions recorded.
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(grouped).map(([date, prescriptions]) => (
            <div key={date}>
              <div className="flex items-center gap-2 mb-1 px-1">
                <Calendar size={12} className="text-slate-400" />
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{date}</span>
                <div className="flex-1 h-px bg-slate-100" />
                <span className="text-xs text-slate-300">{prescriptions.length} med{prescriptions.length !== 1 ? 's' : ''}</span>
              </div>
              <div className="divide-y divide-slate-50">
                {prescriptions.map(p => (
                  <PrescriptionCard key={p._id} p={p} onDelete={handleDelete} onSave={handleEdit} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
