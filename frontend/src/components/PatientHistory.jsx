import { useState, useEffect } from 'react';
import { FolderOpen, Calendar, Stethoscope, FileText, Pill, NotebookPen } from 'lucide-react';
import API from '../services/api';
import VisitDocumentsModal from '../modals/VisitDocumentsModal.jsx';

// Date label for a visit row (matches Treatmentpage/PatientProfileModal styling)
const formatVisitDate = (date) =>
  new Date(date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

// Resolve the invoice belonging to a visit:
//   1. a treatment/prescription on the visit references an invoice
//   2. otherwise an invoice dated the same day as the visit
function resolveVisitInvoice(visit, invoices = []) {
  if (!visit || !invoices.length) return null;

  const ids = new Set();
  (visit.treatments || []).forEach(t => {
    const id = t.invoice_id?._id || t.invoice_id;
    if (id) ids.add(String(id));
  });
  (visit.prescriptions || []).forEach(p => {
    const id = p.invoice_id?._id || p.invoice_id;
    if (id) ids.add(String(id));
  });
  const byRef = invoices.find(inv => ids.has(String(inv._id)));
  if (byRef) return byRef;

  if (visit.date) {
    const day = new Date(visit.date).toDateString();
    const sameDay = invoices.find(inv => new Date(inv.date || inv.createdAt).toDateString() === day);
    if (sameDay) return sameDay;
  }
  return null;
}

// Resolve a doctor's display name from a (possibly populated) visit.doctor_id
function visitDoctorName(visit) {
  const d = visit?.doctor_id;
  const name = typeof d === 'object' ? d?.name : null;
  if (!name) return null;
  return /^dr\.?\s/i.test(name) ? name : `Dr. ${name}`;
}

/**
 * PatientHistory — chronological list of a patient's visits (newest first).
 * Each row summarises the visit and opens VisitDocumentsModal (the same
 * documents component used for completed appointments) for that visit.
 *
 * Props:
 *   visits   — array of Visit objects (with treatments/prescriptions/notes/findings)
 *   patient  — the patient object (with files[] for visit documents)
 *   invoices — array of the patient's invoices (optional; fetched on demand if
 *              omitted — used to attach an invoice to the documents modal)
 */
export default function PatientHistory({ visits = [], patient, invoices: invoicesProp }) {
  const [docsVisit, setDocsVisit] = useState(null);
  const [docsReport, setDocsReport] = useState(null);
  const [fetchedInvoices, setFetchedInvoices] = useState([]);

  // Fetch the AI report for the opened visit — strictly scoped to that visit's
  // appointment so an unrelated report never shows in the documents modal.
  useEffect(() => {
    if (!docsVisit || !patient?._id) { setDocsReport(null); return; }
    const apptId = typeof docsVisit.appointment_id === 'object'
      ? docsVisit.appointment_id?._id
      : docsVisit.appointment_id;
    // Many visits are auto-created without an appointment_id, so when there's no
    // appointment, scope the report to the visit's own day (backend day-scopes
    // on `date`) — otherwise the AI report would never show in history.
    if (!apptId && !docsVisit.date) { setDocsReport(null); return; }
    const qs = apptId
      ? `patientId=${patient._id}&appointmentId=${apptId}`
      : `patientId=${patient._id}&date=${new Date(docsVisit.date).toISOString()}`;
    let cancelled = false;
    setDocsReport(null);
    API.get(`/report/latest?${qs}`)
      .then(r => { if (!cancelled) setDocsReport(r.data?.report || null); })
      .catch(() => { if (!cancelled) setDocsReport(null); });
    return () => { cancelled = true; };
  }, [docsVisit, patient?._id]);

  // Fetch the patient's invoices ourselves when the caller didn't supply them
  // (e.g. the Treatment page, which only loads invoices per-visit).
  useEffect(() => {
    if (invoicesProp || !patient?._id) return;
    let cancelled = false;
    API.get(`/invoices?patient_id=${patient._id}`)
      .then(r => { if (!cancelled) setFetchedInvoices(r.data || []); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [invoicesProp, patient?._id]);

  const invoices = invoicesProp || fetchedInvoices;
  const sorted = [...visits].sort((a, b) => new Date(b.date) - new Date(a.date));

  const docsInvoice = docsVisit ? resolveVisitInvoice(docsVisit, invoices) : null;

  return (
    <div className="p-5 bg-white rounded-xl shadow-sm border border-gray-100 mb-6">
      <div className="flex items-center gap-2 mb-5 pb-3 border-b border-slate-100">
        <Calendar size={16} className="text-[#137fec]" />
        <h3 className="text-sm font-semibold text-slate-700">Patient History</h3>
        <span className="ml-auto text-xs text-slate-400">{sorted.length} visit{sorted.length === 1 ? '' : 's'}</span>
      </div>

      {sorted.length === 0 ? (
        <div className="flex items-center justify-center py-10 text-slate-400 text-sm bg-slate-50 rounded-xl border border-dashed border-slate-200">
          No visits recorded yet.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {sorted.map(visit => {
            const doctor   = visitDoctorName(visit);
            const tCount   = visit.treatments?.length || 0;
            const rxCount  = visit.prescriptions?.length || 0;
            const noteCount = visit.consultation_notes?.length || 0;
            const chief    = (visit.chief_complaint || visit.findings?.diagnosis_notes || '').trim();
            const docCount = (patient?.files || []).filter(f => String(f.visit_id) === String(visit._id)).length;

            // Primary line: chief complaint, else first treatment names
            const treatmentNames = (visit.treatments || []).map(t => t.treatment_name).filter(Boolean);
            const summary = chief
              || (treatmentNames.length ? treatmentNames.slice(0, 2).join(', ') + (treatmentNames.length > 2 ? `, +${treatmentNames.length - 2}` : '') : 'Visit');

            const meta = [
              tCount    ? { icon: Stethoscope, label: `${tCount} treatment${tCount === 1 ? '' : 's'}` } : null,
              rxCount   ? { icon: Pill,        label: `${rxCount} Rx` } : null,
              noteCount ? { icon: NotebookPen, label: `${noteCount} note${noteCount === 1 ? '' : 's'}` } : null,
              docCount  ? { icon: FileText,    label: `${docCount} file${docCount === 1 ? '' : 's'}` } : null,
            ].filter(Boolean);

            return (
              <div
                key={visit._id}
                className="group flex items-center gap-4 px-4 py-3 rounded-xl border border-slate-100 hover:border-slate-200 hover:bg-slate-50/60 transition-colors"
              >
                {/* Date block */}
                <div className="flex-shrink-0 w-24">
                  <p className="text-sm font-semibold text-slate-700">{formatVisitDate(visit.date)}</p>
                  {doctor && <p className="text-[11px] text-slate-400 truncate">{doctor}</p>}
                </div>

                {/* Summary + meta */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-700 truncate">{summary}</p>
                  {meta.length > 0 && (
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
                      {meta.map((m, i) => {
                        const Icon = m.icon;
                        return (
                          <span key={i} className="flex items-center gap-1 text-[11px] text-slate-400">
                            <Icon size={11} /> {m.label}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Documents action */}
                <button
                  onClick={() => setDocsVisit(visit)}
                  title="Documents (print, share, save, email)"
                  className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-slate-500 hover:text-[#137fec] hover:border-[#137fec] hover:bg-blue-50/50 transition-colors text-xs font-medium"
                >
                  <FolderOpen size={14} /> Documents
                </button>
              </div>
            );
          })}
        </div>
      )}

      {docsVisit && (
        <VisitDocumentsModal
          isOpen
          onClose={() => setDocsVisit(null)}
          visit={docsVisit}
          patient={patient}
          invoice={docsInvoice}
          reportJob={docsReport}
        />
      )}
    </div>
  );
}
