import { useState, useEffect } from 'react';
import { Plus, Pill, Calendar, Clock, Info } from 'lucide-react';
import API from '../services/api';

const DOSAGE_OPTIONS = [
  '1-0-0', '0-0-1', '0-1-0',
  '1-1-0', '0-1-1', '1-0-1',
  '1-1-1', 'SOS', 'Once daily',
  'Twice daily', 'Thrice daily',
];
const DURATION_OPTIONS = [
  '1 day', '2 days', '3 days', '4 days', '5 days',
  '7 days', '10 days', '14 days', '1 month',
];
const emptyRow = () => ({ drug_name: '', dosage: '', duration: '', instructions: '' });

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
function PrescriptionCard({ p, onDelete }) {
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

      {/* Delete */}
      <button
        onClick={() => onDelete(p.visitId, p._id)}
        className="opacity-0 group-hover:opacity-100 flex-shrink-0 self-center text-red-400 hover:text-red-600 text-xs px-2 py-1 rounded border border-transparent hover:border-red-200 transition-all"
      >
        Remove
      </button>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function MedicationsPanel({ visits = [], patientId, onRefresh, targetVisitId = null }) {
  const [showForm, setShowForm]           = useState(false);
  const [pharmacyItems, setPharmacyItems] = useState([]);
  const [rows, setRows]                   = useState([emptyRow()]);
  const [saving, setSaving]               = useState(false);

  useEffect(() => {
    API.get('/inventory').then(res => {
      const data = Array.isArray(res.data) ? res.data : [];
      setPharmacyItems(data.filter(i => i.type === 'Pharmacy'));
    }).catch(() => {});
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
      await Promise.all(valid.map(r =>
        API.post(`/visits/patient/${patientId}/prescription`, targetVisitId ? { ...r, visit_id: targetVisitId } : r)
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

          <datalist id="pharmacy-drugs-panel">
            {pharmacyItems.map(item => <option key={item._id} value={item.name} />)}
          </datalist>

          <div className="flex flex-col divide-y divide-slate-100">
            {rows.map((row, idx) => (
              <div key={idx} className="grid grid-cols-[2fr_1.2fr_1.2fr_1.5fr_32px] gap-2 items-center px-3 py-2 bg-white">
                <input
                  list="pharmacy-drugs-panel"
                  className="w-full border border-gray-200 rounded-md px-2.5 py-1.5 text-sm focus:outline-none focus:border-[#137fec]"
                  placeholder="Medicine name..."
                  value={row.drug_name}
                  onChange={e => updateRow(idx, 'drug_name', e.target.value)}
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
                  <PrescriptionCard key={p._id} p={p} onDelete={handleDelete} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
