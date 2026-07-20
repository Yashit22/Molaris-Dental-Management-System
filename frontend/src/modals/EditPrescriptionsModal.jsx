import { useState, useEffect } from 'react';
import { X, Pill } from 'lucide-react';
import API from '../services/api';
import MedicationsPanel from '../components/MedicationsPanel.jsx';

export default function EditPrescriptionsModal({ isOpen, onClose, patient, appointmentId = null }) {
  const [visits, setVisits] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchVisits = async () => {
    if (!patient?._id) return;
    setLoading(true);
    try {
      const { data } = await API.get(`/visits/patient/${patient._id}`);
      setVisits(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) fetchVisits();
    else setVisits([]);
  }, [isOpen, patient?._id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isOpen) return null;

  // Resolve the SAME visit the documents modal uses: STRICTLY the one linked to
  // this appointment (appointment_id is the single source of truth). We must NOT
  // fall back to visits[0] — saving a prescription to an arbitrary/older visit
  // makes it land on a different visit than the docs modal reads, so it never
  // shows there, and it inherits that older visit's date.
  const idOf = (a) => (a && typeof a === 'object' ? a._id : a);
  const matchedVisit = appointmentId
    ? (visits.find(v => String(idOf(v.appointment_id)) === String(appointmentId)) || null)
    : (visits[0] || null);
  const targetVisitId = matchedVisit?._id || null;
  // When no visit is linked to this appointment yet, leave targetVisitId null so
  // the save is scoped to the appointment — the backend creates/adopts the
  // appointment-linked visit, which is exactly what the docs modal will find.
  const scopedVisits = matchedVisit ? [matchedVisit] : [];

  return (
    <div
      className="fixed inset-0 z-[500] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-gradient-to-r from-blue-50/60 to-white flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Pill size={18} className="text-[#137fec]" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-800">Medications</h2>
              {patient && (
                <p className="text-xs text-slate-500">
                  {patient.first_name} {patient.last_name || ''}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-red-50 hover:text-red-500 text-slate-400 rounded-lg transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-4">
          {loading ? (
            <div className="flex items-center justify-center h-40 text-slate-400 text-sm">
              Loading prescriptions…
            </div>
          ) : (
            <MedicationsPanel
              visits={scopedVisits}
              patientId={patient?._id}
              onRefresh={fetchVisits}
              targetVisitId={targetVisitId}
              appointmentId={appointmentId}
            />
          )}
        </div>
      </div>
    </div>
  );
}
