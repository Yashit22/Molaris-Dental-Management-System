import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import {
  Printer, FileText, Monitor, Phone,
  MapPin, User, Plus, X, NotebookPen, Pill, TestTube, Loader2, Save, Edit2, Receipt, Mic, AlertTriangle,
  ClipboardList, Stethoscope, FolderOpen, Activity, ChevronDown, Lightbulb,
} from 'lucide-react';

// --- IMPORTS ---
import API from '../services/api';
import { useAuth } from '../Context/AuthContext.jsx';
import { useTreatment } from '../Context/TreatmentContext.jsx';
import PatientProfileModal from '../modals/PatientProfileModal.jsx';
import RichTextEditorModal from '../modals/RichTextEditorModal.jsx';
import NewInvoiceModal from '../modals/NewInvoiceModal.jsx';
import ClinicalReportModal from '../modals/ClinicalReportModal.jsx';
import VisitDocumentsModal from '../modals/VisitDocumentsModal.jsx';
import TreatmentTabs from '../components/TreatmentTabs.jsx';
// import AssessmentDictation from '../components/AssessmentDictation.jsx'; // re-enable with the dictation button below
import TreatmentPlanBoard from '../components/TreatmentPlanBoard.jsx';
import ReportsNotesSection from '../components/ReportNotesSection.jsx';
import MedicationsPanel from '../components/MedicationsPanel.jsx';
import PatientHistory from '../components/PatientHistory.jsx';

// --- Sub-Components ---

// The appointment tied to the current (newest) visit, if any. Sent with note/
// advice/prescription posts so the backend links the visit to this appointment
// instead of relying on a same-day guess.
const currentApptId = (visits) => {
  const v = visits?.[0];
  if (!v) return null;
  return (typeof v.appointment_id === 'object' ? v.appointment_id?._id : v.appointment_id) || null;
};

// eslint-disable-next-line react/prop-types
const PatientInfoCard = ({ patient, onViewProfile, appointments = [], currentVisit = null }) => {
  // Handle Loading/Empty State
  if (!patient) {
      return <div className="p-5 bg-white rounded-xl shadow-sm border border-gray-100 mb-6 h-48 animate-pulse"></div>;
  }

  const age = patient.dob ? new Date().getFullYear() - new Date(patient.dob).getFullYear() : '-';
  const fullName = `${patient.first_name} ${patient.last_name || ''}`.trim();

  // Get the latest appointment visit type
  const latestAppointment = appointments && appointments.length > 0
    ? appointments.sort((a, b) => new Date(b.start_time) - new Date(a.start_time))[0]
    : null;
  const visitType = latestAppointment?.type || '-';

  return (
    <div className="p-4 sm:p-5 bg-white rounded-xl relative shadow-sm border border-gray-100 mb-3">
      <div className="absolute top-0 left-4 sm:left-5 bg-blue-50 text-blue-600 px-3 py-1 rounded-b-md text-xs sm:text-sm font-medium">
        Patient Profile
      </div>

      <div className="pt-7 sm:pt-8 flex flex-col gap-3 sm:gap-5">
        {/* Name row */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1 min-w-0">
            <h2 className="font-semibold text-xl sm:text-2xl text-gray-800 capitalize truncate">{fullName}</h2>
            <div className="flex flex-wrap gap-2 sm:gap-4 items-center text-gray-500 text-xs sm:text-sm">
              <span className="flex gap-1 items-center"><MapPin size={12} /> {patient.contact?.city || 'N/A'}</span>
              <span className="flex gap-1 items-center"><Phone size={12} /> {patient.contact?.mobile || '--'}</span>
              <span className="flex gap-1 items-center"><User size={12} /> {patient.gender}</span>
            </div>
          </div>
          <button
            onClick={onViewProfile}
            className="flex-shrink-0 px-2.5 sm:px-3 py-1.5 border border-[#137fec] text-[#137fec] rounded-md text-xs sm:text-sm font-medium hover:bg-[#137fec] hover:text-white transition-colors"
          >
            View Profile
          </button>
        </div>

        {/* Chief Complaint — sourced from today's visit, not the patient record */}
        {currentVisit?.chief_complaint && (
          <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 sm:px-4 py-2.5">
            <AlertTriangle size={14} className="text-red-500 mt-0.5 flex-shrink-0" />
            <div>
              <span className="text-xs font-bold text-red-500 uppercase tracking-wide">Chief Complaint</span>
              <p className="text-sm text-red-800 font-medium mt-0.5">{currentVisit.chief_complaint}</p>
            </div>
          </div>
        )}

        <div className="border-t border-gray-100 w-full" />

        {/* Stats grid — 3 cols on mobile, 6 on desktop */}
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 sm:gap-5">
          {[
            { label: 'Gender',      value: patient.gender },
            { label: 'Age',         value: `${age} Yrs` },
            { label: 'Patient ID',  value: patient.patientId || patient._id?.slice(-6).toUpperCase() },
            { label: 'Blood Group', value: patient.blood_group || '-' },
            { label: 'Reg Date',    value: new Date(patient.createdAt).toLocaleDateString() },
          ].map((item, idx) => (
            <div key={idx} className="flex flex-col gap-0.5">
              <p className="text-[10px] text-gray-400 uppercase tracking-wide">{item.label}</p>
              <p className="font-medium text-gray-800 text-xs sm:text-sm truncate">{item.value}</p>
            </div>
          ))}
          <div className="flex flex-col gap-0.5">
            <p className="text-[10px] text-gray-400 uppercase tracking-wide">Visit Type</p>
            <span className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded border border-blue-100 font-medium capitalize self-start">{visitType}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

const ClinicalHistory = ({ patient, currentVisit, onSaveHistory, onSaveVisitComplaint }) => {
  // Local state for editing fields
  const [formData, setFormData] = useState({
    chief_complaint: '',
    medical_history: [],
    dental_history: '',
    tobacco_smoking: false,
    tobacco_smokeless: false,
    tea_consumption: '',
    coffee_consumption: '',
    dentition_type: 'Adult'
  });
  const [isEditing, setIsEditing] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null); // 'saving' | 'saved' | 'error'
  // Raw text for medical history input — lets user type freely including spaces
  const [medHistoryRaw, setMedHistoryRaw] = useState('');

  // Initialize data from patient prop and current visit
  useEffect(() => {
    if (patient) {
      const medHistory = patient.medical_history || [];
      setFormData({
        chief_complaint: currentVisit?.chief_complaint || '',
        medical_history: medHistory,
        dental_history: patient.dental_history || '',
        tobacco_smoking: patient.tobacco_smoking || false,
        tobacco_smokeless: patient.tobacco_smokeless || false,
        tea_consumption: patient.tea_consumption || '',
        coffee_consumption: patient.coffee_consumption || '',
        dentition_type: patient.dentition_type || 'Adult'
      });
      setMedHistoryRaw(medHistory.join(', '));
    }
  }, [patient, currentVisit]);

  const handleSave = async () => {
    // 1. Save medical_history, dental_history, lifestyle habits, and dentition type to patient
    onSaveHistory({
      medical_history: formData.medical_history,
      dental_history: formData.dental_history,
      tobacco_smoking: formData.tobacco_smoking,
      tobacco_smokeless: formData.tobacco_smokeless,
      tea_consumption: formData.tea_consumption,
      coffee_consumption: formData.coffee_consumption,
      dentition_type: formData.dentition_type
    });
    // 2. Save chief_complaint to current visit (if a visit exists)
    if (currentVisit?._id) {
      await onSaveVisitComplaint(currentVisit._id, formData.chief_complaint);
    }
    setIsEditing(false);
  };

  const handleMedicalHistoryChange = (e) => {
    const val = e.target.value;
    setMedHistoryRaw(val);
    // Parse into array for display tags — only trim, don't strip spaces mid-word
    setFormData(prev => ({
      ...prev,
      medical_history: val ? val.split(',').map(s => s.trim()).filter(Boolean) : [],
    }));
  };

  return (
    <div className="p-5 bg-white rounded-xl shadow-sm border border-gray-100 mb-6 relative">
      {/* Always-visible edit/save controls */}
      <div className="absolute top-4 right-4 flex items-center gap-2">
        {saveStatus === 'saved' && <span className="text-xs text-green-600 font-medium">✓ Saved</span>}
        {saveStatus === 'error' && <span className="text-xs text-red-500 font-medium">Save failed</span>}
        {isEditing ? (
          <button
            onClick={handleSave}
            disabled={saveStatus === 'saving'}
            className="flex items-center gap-1 px-3 py-1.5 bg-green-50 text-green-600 rounded-md text-xs font-bold border border-green-200 hover:bg-green-100 disabled:opacity-60"
          >
            <Save size={14} /> {saveStatus === 'saving' ? 'Saving…' : 'Save Changes'}
          </button>
        ) : (
          <button onClick={() => setIsEditing(true)} className="flex items-center gap-1 px-3 py-1.5 bg-slate-50 text-slate-500 rounded-md text-xs font-bold border border-slate-200 hover:bg-slate-100">
            <NotebookPen size={14} /> Edit History
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="flex flex-col gap-5">
          
          {/* 1. Chief Complaint — per visit */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <label className="font-semibold text-gray-700">Chief Complaints</label>
              <span className="text-[10px] px-1.5 py-0.5 bg-blue-50 text-blue-500 border border-blue-100 rounded font-medium">This Visit</span>
            </div>
            {isEditing ? (
                <textarea 
                    className="w-full border border-gray-300 rounded-md p-2 text-sm focus:outline-none focus:border-[#137fec] resize-none"
                    rows={2}
                    value={formData.chief_complaint}
                    onChange={(e) => setFormData({...formData, chief_complaint: e.target.value})}
                    placeholder="e.g. Pain in upper right tooth"
                />
            ) : (
                <div className="p-2 bg-slate-50 rounded-md text-sm text-gray-700 min-h-[40px] flex items-center">
                    {formData.chief_complaint || <span className="text-gray-400 italic">No record</span>}
                </div>
            )}
          </div>

          {/* 2. Medical History */}
          <div className="flex flex-col gap-2">
            <label className="font-semibold text-gray-700">Medical History</label>
            {isEditing ? (
                <input 
                    type="text"
                    className="w-full border border-gray-300 rounded-md p-2 text-sm focus:outline-none focus:border-[#137fec]"
                    value={medHistoryRaw}
                    onChange={handleMedicalHistoryChange}
                    placeholder="e.g. Diabetes, Hypertension (comma separated)"
                />
            ) : (
                <div className="flex flex-wrap gap-2 min-h-[40px] items-center">
                    {formData.medical_history.length > 0 ? (
                        formData.medical_history.map((tag, i) => (
                            <span key={i} className="px-2 py-1 bg-red-50 text-red-600 rounded text-xs border border-red-100 font-medium">
                                {tag}
                            </span>
                        ))
                    ) : <span className="text-gray-400 italic text-sm">None</span>}
                </div>
            )}
          </div>

          {/* 3. Dental History */}
          <div className="flex flex-col gap-2">
            <label className="font-semibold text-gray-700">Dental History</label>
            {isEditing ? (
                <textarea
                    className="w-full border border-gray-300 rounded-md p-2 text-sm focus:outline-none focus:border-[#137fec] resize-none"
                    rows={2}
                    value={formData.dental_history}
                    onChange={(e) => setFormData({...formData, dental_history: e.target.value})}
                    placeholder="e.g. Previous extraction 2 years ago"
                />
            ) : (
                <div className="p-2 bg-slate-50 rounded-md text-sm text-gray-700 min-h-[40px] flex items-center">
                    {formData.dental_history || <span className="text-gray-400 italic">No record</span>}
                </div>
            )}
          </div>

        </div>

        {/* Right Column: Dentition Type & Lifestyle Habits */}
        <div className="flex flex-col gap-5">

          {/* 4. Dentition Type */}
          <div className="flex flex-col gap-2">
            <label className="font-semibold text-gray-700">Dentition Type</label>
            {isEditing ? (
                <div className="relative">
                  <select
                    value={formData.dentition_type}
                    onChange={(e) => setFormData({...formData, dentition_type: e.target.value})}
                    className="w-full border border-gray-300 rounded-md p-2 text-sm focus:outline-none focus:border-[#137fec] bg-white cursor-pointer"
                  >
                    <option value="Adult">Adult</option>
                    <option value="Pedo">Pedo (Pediatric)</option>
                    <option value="Mixed">Mixed</option>
                  </select>
                </div>
            ) : (
                <div className="p-2 bg-slate-50 rounded-md text-sm text-gray-700 min-h-[40px] flex items-center">
                  {formData.dentition_type === 'Pedo' ? 'Pedo (Pediatric)' : formData.dentition_type}
                </div>
            )}
          </div>

          {/* 5. Tobacco Consumption */}
          <div className="flex flex-col gap-2">
            <label className="font-semibold text-gray-700">Tobacco Consumption</label>
            {isEditing ? (
                <div className="flex flex-col gap-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.tobacco_smoking}
                      onChange={(e) => setFormData({...formData, tobacco_smoking: e.target.checked})}
                      className="w-4 h-4 rounded border-gray-300 cursor-pointer"
                    />
                    <span className="text-sm text-gray-700">Smoking</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.tobacco_smokeless}
                      onChange={(e) => setFormData({...formData, tobacco_smokeless: e.target.checked})}
                      className="w-4 h-4 rounded border-gray-300 cursor-pointer"
                    />
                    <span className="text-sm text-gray-700">Smokeless (Chewing/Snuff)</span>
                  </label>
                </div>
            ) : (
                <div className="flex flex-wrap gap-2 min-h-[40px] items-center">
                  {formData.tobacco_smoking || formData.tobacco_smokeless ? (
                    <>
                      {formData.tobacco_smoking && <span className="px-2 py-1 bg-orange-50 text-orange-600 rounded text-xs border border-orange-100 font-medium">Smoking</span>}
                      {formData.tobacco_smokeless && <span className="px-2 py-1 bg-orange-50 text-orange-600 rounded text-xs border border-orange-100 font-medium">Smokeless</span>}
                    </>
                  ) : <span className="text-gray-400 italic text-sm">None</span>}
                </div>
            )}
          </div>

          {/* 6. Tea Consumption */}
          <div className="flex flex-col gap-2">
            <label className="font-semibold text-gray-700">Tea Consumption</label>
            {isEditing ? (
                <input
                    type="text"
                    className="w-full border border-gray-300 rounded-md p-2 text-sm focus:outline-none focus:border-[#137fec]"
                    value={formData.tea_consumption}
                    onChange={(e) => setFormData({...formData, tea_consumption: e.target.value})}
                    placeholder="e.g. 1-2 cups daily, None, Occasional"
                />
            ) : (
                <div className="p-2 bg-slate-50 rounded-md text-sm text-gray-700 min-h-[40px] flex items-center">
                    {formData.tea_consumption || <span className="text-gray-400 italic">No record</span>}
                </div>
            )}
          </div>

          {/* 7. Coffee Consumption */}
          <div className="flex flex-col gap-2">
            <label className="font-semibold text-gray-700">Coffee Consumption</label>
            {isEditing ? (
                <input
                    type="text"
                    className="w-full border border-gray-300 rounded-md p-2 text-sm focus:outline-none focus:border-[#137fec]"
                    value={formData.coffee_consumption}
                    onChange={(e) => setFormData({...formData, coffee_consumption: e.target.value})}
                    placeholder="e.g. 1 cup daily, None, Occasional"
                />
            ) : (
                <div className="p-2 bg-slate-50 rounded-md text-sm text-gray-700 min-h-[40px] flex items-center">
                    {formData.coffee_consumption || <span className="text-gray-400 italic">No record</span>}
                </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
};

// --- Shared: date label for a visit ---
const formatVisitDate = (date) =>
  new Date(date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

// --- CONSULTATION NOTES ---
const ConsultationNotes = ({ visits, patientId, onRefresh, appointmentId = null }) => {
  const [modalOpen, setModalOpen]   = useState(false);
  const [editTarget, setEditTarget] = useState(null); // { visitId, noteId, content }
  const [collapsed, setCollapsed]   = useState(true);

  const allNotes = visits
    .filter(v => v.consultation_notes?.length > 0)
    .flatMap(v =>
      [...v.consultation_notes]
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        .map(note => ({ ...note, visitId: v._id, visitDate: v.date }))
    )
    .sort((a, b) => new Date(b.visitDate) - new Date(a.visitDate));

  function openCreate() { setEditTarget(null); setModalOpen(true); }
  function openEdit(note) { setEditTarget(note); setModalOpen(true); }
  function handleClose() { setModalOpen(false); setEditTarget(null); }

  async function handleSave(content) {
    if (editTarget) {
      await API.patch(`/visits/${editTarget.visitId}/notes/${editTarget._id}`, { content });
    } else {
      await API.post(`/visits/patient/${patientId}/note`, { content, appointment_id: appointmentId || currentApptId(visits) });
    }
    onRefresh();
  }

  return (
    <div className="p-5 bg-white rounded-xl shadow-sm border border-gray-100 mb-6">
      <div className="flex justify-between items-center gap-2">
        <button
          type="button"
          onClick={() => setCollapsed(c => !c)}
          className="flex items-center gap-3 flex-1 min-w-0 text-left group"
        >
          <div className="w-10 h-10 bg-blue-50 rounded-full flex items-center justify-center text-[#137fec] shrink-0">
            <NotebookPen size={20} />
          </div>
          <h3 className="font-semibold text-lg text-slate-800 truncate">Consultation Notes</h3>
          {allNotes.length > 0 && (
            <span className="text-xs font-semibold text-slate-400 bg-slate-100 rounded-full px-2 py-0.5 shrink-0">{allNotes.length}</span>
          )}
          <ChevronDown
            size={18}
            className={`text-slate-400 shrink-0 transition-transform duration-200 ${collapsed ? '-rotate-90' : ''}`}
          />
        </button>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors font-medium text-sm shrink-0"
        >
          <Plus size={16} /> New Note
        </button>
      </div>

      {collapsed ? null : allNotes.length === 0 ? (
        <div className="mt-4 flex items-center justify-center py-10 text-slate-400 text-sm bg-slate-50 rounded-xl border border-dashed border-slate-200">
          No consultation notes yet.
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-3">
          {allNotes.map(note => (
            <div key={note._id} className="relative group bg-slate-50 rounded-lg px-4 pt-4 pb-3 border border-slate-100">
              <button
                onClick={() => openEdit(note)}
                className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 px-2 py-1 bg-white border border-slate-200 rounded-md text-xs text-slate-500 hover:text-[#137fec] hover:border-[#137fec]"
              >
                <Edit2 size={11} /> Edit
              </button>
              <div
                className="text-sm text-slate-700 leading-relaxed pr-12
                  [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5
                  [&_li]:my-0.5 [&_b]:font-semibold [&_strong]:font-semibold"
                dangerouslySetInnerHTML={{ __html: note.content }}
              />
              <p className="text-right text-[11px] text-slate-400 mt-2">{formatVisitDate(note.visitDate)}</p>
            </div>
          ))}
        </div>
      )}

      <RichTextEditorModal
        isOpen={modalOpen}
        onClose={handleClose}
        type="note"
        initialContent={editTarget?.content}
        onSave={handleSave}
        onDelete={editTarget ? async () => {
          await API.delete(`/visits/${editTarget.visitId}/notes/${editTarget._id}`);
          onRefresh();
        } : undefined}
      />
    </div>
  );
};

// --- MEDICATIONS — delegated to shared MedicationsPanel component ---
const Medications = (props) => <MedicationsPanel {...props} />;

const LAB_STATUS_COLORS = {
  'Sent':                 'bg-blue-50 text-blue-600',
  'In Process':           'bg-amber-50 text-amber-600',
  'Received':             'bg-purple-50 text-purple-600',
  'Delivered to Patient': 'bg-green-50 text-green-600',
};

// --- LAB ORDERS ---
const LabOrders = ({ patientId, onRefresh, onOrdersLoaded, refreshKey = 0 }) => {
  const [orders, setOrders] = useState([]);
  const [catalogItems, setCatalogItems] = useState([]);
  const [labVendors, setLabVendors] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    item_name: '', shade: '', notes: '', expected_delivery: '',
    vendor_id: '', cost_to_clinic: ''
  });
  const [saving, setSaving] = useState(false);

  const fetchOrders = async () => {
    try {
      const res = await API.get('/labs/orders');
      const data = Array.isArray(res.data) ? res.data : [];
      const filtered = data.filter(o => o.patient_id?._id === patientId || o.patient_id === patientId);
      setOrders(filtered);
      onOrdersLoaded?.(filtered);
    } catch (err) { console.error(err); }
  };

  useEffect(() => {
    fetchOrders();
    Promise.all([
      API.get('/labs/items'),
      API.get('/vendors'),
    ]).then(([catalogRes, vendorRes]) => {
      setCatalogItems(Array.isArray(catalogRes.data) ? catalogRes.data : []);
      const vendors = Array.isArray(vendorRes.data) ? vendorRes.data : [];
      setLabVendors(vendors.filter(v => v.type === 'Lab'));
    }).catch(() => {});
  }, [patientId, refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleItemSelect = (itemName) => {
    const selectedItem = catalogItems.find(item => item.name === itemName);
    const newForm = { ...form, item_name: itemName };
    if (selectedItem && selectedItem.price) {
      newForm.cost_to_clinic = selectedItem.price;
    }
    setForm(newForm);
  };

  const handleAdd = async () => {
    if (!form.item_name.trim()) return;
    setSaving(true);
    try {
      await API.post('/labs/orders', { ...form, patient_id: patientId });
      setForm({ item_name: '', shade: '', notes: '', expected_delivery: '', vendor_id: '', cost_to_clinic: '' });
      setShowForm(false);
      fetchOrders();
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (orderId, status) => {
    try {
      await API.patch(`/labs/orders/${orderId}`, { status });
      fetchOrders();
    } catch (err) { console.error(err); }
  };

  return (
    <div className="p-5 bg-white rounded-xl shadow-sm border border-gray-100 mb-6">
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-50 rounded-full flex items-center justify-center text-[#137fec]">
            <TestTube size={20} />
          </div>
          <h3 className="font-semibold text-lg text-slate-800">Lab Orders</h3>
        </div>
        <button
          onClick={() => setShowForm(v => !v)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors font-medium text-sm"
        >
          <Plus size={16} /> Add Lab Order
        </button>
      </div>

      {/* Add form */}
      {showForm && (
        <div className="mb-4 p-4 bg-blue-50/40 rounded-xl border border-blue-100 flex flex-col gap-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1 block">Item *</label>
              <input
                list="lab-catalog-items"
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-[#137fec]"
                placeholder="Type or select lab item..."
                value={form.item_name}
                onChange={e => handleItemSelect(e.target.value)}
              />
              <datalist id="lab-catalog-items">
                {catalogItems.map(item => <option key={item._id} value={item.name} />)}
              </datalist>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1 block">Shade</label>
              <input
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-[#137fec]"
                placeholder="e.g. A2"
                value={form.shade}
                onChange={e => setForm({ ...form, shade: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1 block">Lab Vendor</label>
              <select
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-[#137fec]"
                value={form.vendor_id}
                onChange={e => setForm({ ...form, vendor_id: e.target.value })}
              >
                <option value="">-- Select Vendor --</option>
                {labVendors.map(v => <option key={v._id} value={v._id}>{v.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1 block">Expected Delivery</label>
              <input
                type="date"
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-[#137fec]"
                value={form.expected_delivery}
                onChange={e => setForm({ ...form, expected_delivery: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1 block">Cost to Clinic (₹)</label>
              <input
                type="number"
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-[#137fec]"
                placeholder="0"
                value={form.cost_to_clinic}
                onChange={e => setForm({ ...form, cost_to_clinic: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1 block">Notes / Instructions</label>
              <input
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-[#137fec]"
                placeholder="Special instructions..."
                value={form.notes}
                onChange={e => setForm({ ...form, notes: e.target.value })}
              />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowForm(false)} className="px-4 py-1.5 text-sm border border-slate-200 rounded-lg text-slate-500 hover:bg-slate-50">Cancel</button>
            <button
              onClick={handleAdd}
              disabled={saving || !form.item_name.trim()}
              className="px-4 py-1.5 text-sm bg-[#137fec] text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Create Order'}
            </button>
          </div>
        </div>
      )}

      {/* Orders list */}
      {orders.length === 0 ? (
        <div className="flex items-center justify-center py-8 text-slate-400 text-sm bg-slate-50 rounded-xl border border-dashed border-slate-200">
          No lab orders for this patient.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {orders.map(order => {
            const item = order.items?.[0] || {};
            return (
              <div key={order._id} className="flex items-center justify-between gap-4 px-4 py-3 bg-slate-50 rounded-lg border border-slate-100">
                <div className="flex flex-col gap-0.5 min-w-0">
                  <span className="font-medium text-slate-800 text-sm truncate">{item.item_name || '-'}</span>
                  <span className="text-xs text-slate-400">
                    {order.vendor_id?.name || 'No vendor'}
                    {item.shade ? ` · Shade: ${item.shade}` : ''}
                    {order.expected_delivery ? ` · Due: ${formatVisitDate(order.expected_delivery)}` : ''}
                  </span>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {order.cost_to_clinic > 0 && (
                    <span className="text-xs text-slate-500">₹{order.cost_to_clinic}</span>
                  )}
                  {(() => {
                    const billed = !!order.invoice_id;
                    return (
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                        billed
                          ? 'bg-green-50 text-green-600 border-green-100'
                          : 'bg-orange-50 text-orange-500 border-orange-100'
                      }`}>
                        {billed ? 'Billed' : 'Unbilled'}
                      </span>
                    );
                  })()}
                  <select
                    value={order.status}
                    onChange={e => handleStatusChange(order._id, e.target.value)}
                    className={`text-xs font-medium px-2 py-1 rounded-full border-0 cursor-pointer focus:outline-none ${LAB_STATUS_COLORS[order.status] || 'bg-slate-100 text-slate-600'}`}
                  >
                    {['Sent', 'In Process', 'Received', 'Delivered to Patient'].map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// --- ADVICES ---
const AdvicesRecall = ({ visits, patientId, onRefresh, appointmentId = null }) => {
  const [modalOpen, setModalOpen]   = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [collapsed, setCollapsed]   = useState(true);

  const allAdvices = visits
    .filter(v => v.advices?.length > 0)
    .flatMap(v =>
      [...v.advices]
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        .map(advice => ({ ...advice, visitId: v._id, visitDate: v.date }))
    )
    .sort((a, b) => new Date(b.visitDate) - new Date(a.visitDate));

  function openCreate() { setEditTarget(null); setModalOpen(true); }
  function openEdit(advice) { setEditTarget(advice); setModalOpen(true); }
  function handleClose() { setModalOpen(false); setEditTarget(null); }

  async function handleSave(content) {
    if (editTarget) {
      await API.patch(`/visits/${editTarget.visitId}/advices/${editTarget._id}`, { content });
    } else {
      await API.post(`/visits/patient/${patientId}/advice`, { content, appointment_id: appointmentId || currentApptId(visits) });
    }
    onRefresh();
  }

  return (
    <div className="p-5 bg-white rounded-xl shadow-sm border border-gray-100 mb-6">
      <div className="flex justify-between items-center gap-2">
        <button
          type="button"
          onClick={() => setCollapsed(c => !c)}
          className="flex items-center gap-3 flex-1 min-w-0 text-left group"
        >
          <div className="w-10 h-10 bg-amber-50 rounded-full flex items-center justify-center text-amber-600 shrink-0">
            <Lightbulb size={20} />
          </div>
          <h3 className="font-semibold text-lg text-slate-800 truncate">Advices</h3>
          {allAdvices.length > 0 && (
            <span className="text-xs font-semibold text-slate-400 bg-slate-100 rounded-full px-2 py-0.5 shrink-0">{allAdvices.length}</span>
          )}
          <ChevronDown
            size={18}
            className={`text-slate-400 shrink-0 transition-transform duration-200 ${collapsed ? '-rotate-90' : ''}`}
          />
        </button>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 bg-amber-50 text-amber-600 rounded-lg hover:bg-amber-100 transition-colors font-medium text-sm shrink-0"
        >
          <Plus size={16} /> Add Advice
        </button>
      </div>

      {/* Advices */}
      {collapsed ? null : (
        <div className="mt-4">
          {allAdvices.length === 0 ? (
            <div className="flex items-center justify-center py-10 text-slate-400 text-sm bg-slate-50 rounded-xl border border-dashed border-slate-200">
              No advices added yet.
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {allAdvices.map(advice => (
                <div key={advice._id} className="relative group bg-amber-50/40 rounded-lg px-4 pt-4 pb-3 border border-amber-100">
                  <button
                    onClick={() => openEdit(advice)}
                    className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 px-2 py-1 bg-white border border-amber-200 rounded-md text-xs text-slate-500 hover:text-amber-600 hover:border-amber-400"
                  >
                    <Edit2 size={11} /> Edit
                  </button>
                  <div
                    className="text-sm text-slate-700 leading-relaxed pr-12
                      [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5
                      [&_li]:my-0.5 [&_b]:font-semibold [&_strong]:font-semibold"
                    dangerouslySetInnerHTML={{ __html: advice.content }}
                  />
                  <p className="text-right text-[11px] text-slate-400 mt-2">{formatVisitDate(advice.visitDate)}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <RichTextEditorModal
        isOpen={modalOpen}
        onClose={handleClose}
        type="advice"
        initialContent={editTarget?.content}
        onSave={handleSave}
        onDelete={editTarget ? async () => {
          await API.delete(`/visits/${editTarget.visitId}/advices/${editTarget._id}`);
          onRefresh();
        } : undefined}
      />
    </div>
  );
};

// --- MAIN PAGE COMPONENT ---

// ── Clinical tabs ─────────────────────────────────────────────────────────────
const CLINICAL_TABS = [
  { id: 'assessment',    label: 'Assessment',     icon: Stethoscope,   desc: 'Clinical history & dental chart' },
  { id: 'treatment',     label: 'Treatment Plan', icon: ClipboardList, desc: 'Planned treatments & lab orders' },
  { id: 'notes',         label: 'Visit Notes',    icon: NotebookPen,   desc: 'Consultation notes & patient advice' },
  { id: 'prescriptions', label: 'Prescriptions',  icon: Pill,          desc: 'Medications prescribed' },
  { id: 'invoice',       label: 'Invoice',        icon: Receipt,       desc: 'Billing & payment' },
  { id: 'files',         label: 'Files & Reports',icon: FolderOpen,    desc: 'Uploaded files and AI reports' },
  { id: 'history',       label: 'History',        icon: Activity,      desc: 'Past visits & documents' },
];

function ClinicalTabBar({ active, onChange }) {
  return (
    <div className="bg-white rounded-xl border border-slate-100 shadow-sm mb-4 overflow-x-auto">
      <div className="flex min-w-max">
        {CLINICAL_TABS.map((tab, idx) => {
          const Icon = tab.icon;
          const isActive = active === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onChange(tab.id)}
              className={`relative flex items-center gap-2 px-4 sm:px-6 py-3.5 text-sm font-semibold transition-colors whitespace-nowrap
                ${isActive
                  ? 'text-[#137fec]'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'}
                ${idx !== 0 ? 'border-l border-slate-100' : ''}
              `}
            >
              <Icon size={15} className={isActive ? 'text-[#137fec]' : 'text-slate-400'} />
              <span>{tab.label}</span>
              {isActive && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#137fec] rounded-full" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// eslint-disable-next-line react/prop-types
function MobileActionBar({ onConclude, onDocuments, patientId, patient }) {
  const [open, setOpen] = useState(false);

  // Draggable FAB position state
  const [pos, setPos] = useState(null); // null = default centered position
  const dragging = React.useRef(false);
  const dragOffset = React.useRef({ x: 0, y: 0 });
  const fabRef = React.useRef(null);

  function onPointerDown(e) {
    // Only start drag on the FAB itself (not during tap-to-toggle)
    dragging.current = false;
    const fab = fabRef.current;
    if (!fab) return;
    const rect = fab.getBoundingClientRect();
    dragOffset.current = {
      x: e.clientX - rect.left - rect.width / 2,
      y: e.clientY - rect.top  - rect.height / 2,
    };

    const startX = e.clientX;
    const startY = e.clientY;

    function onMove(me) {
      const dx = me.clientX - startX;
      const dy = me.clientY - startY;
      if (!dragging.current && Math.hypot(dx, dy) > 8) {
        dragging.current = true;
        fab.setPointerCapture(e.pointerId);
      }
      if (!dragging.current) return;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const half = 28; // half of 56px button
      const newX = Math.min(Math.max(me.clientX - dragOffset.current.x, half), vw - half);
      const newY = Math.min(Math.max(me.clientY - dragOffset.current.y, half), vh - half);
      setPos({ x: newX, y: newY });
    }

    function onUp() {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      if (!dragging.current) {
        // It was a tap, toggle the menu
        setOpen(o => !o);
      }
      dragging.current = false;
    }

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  }

  // When menu is open and FAB is dragged, close the menu
  function handleMenuClose() { setOpen(false); }

  const fabStyle = pos
    ? { position: 'fixed', left: pos.x - 28, top: pos.y - 28, bottom: 'auto', transform: 'none', zIndex: 97 }
    : {};

  return (
    <div className="sm:hidden">
      {open && (
        <div className="fixed inset-0 z-[95] bg-black/40" onClick={handleMenuClose} />
      )}
      {open && (
        <div
          className="fixed left-4 right-4 z-[96] flex flex-col gap-2"
          style={pos ? { bottom: window.innerHeight - pos.y + 44 } : { bottom: 84 }}
        >
          <button
            onClick={() => { onConclude(); setOpen(false); }}
            className="w-full flex items-center gap-2 px-4 py-3 bg-white border-2 border-red-300 text-red-600 font-semibold rounded-xl shadow-lg text-sm"
          >
            ✓ Conclude Appointment
          </button>
          <button
            onClick={() => { onDocuments(); setOpen(false); }}
            className="w-full flex items-center gap-2 px-4 py-3 bg-white border border-[#137fec] text-[#137fec] font-semibold rounded-xl shadow-lg text-sm"
          >
            <FileText size={16} /> Documents
          </button>
        </div>
      )}
      <button
        ref={fabRef}
        onPointerDown={onPointerDown}
        style={fabStyle}
        className={`${pos ? '' : 'fixed bottom-4 left-1/2 -translate-x-1/2'} z-[97] w-14 h-14 rounded-full bg-[#137fec] text-white shadow-xl shadow-blue-400/40 flex items-center justify-center active:scale-95 transition-colors touch-none select-none`}
      >
        {open ? <X size={22} /> : <Plus size={22} />}
      </button>
    </div>
  );
}

// eslint-disable-next-line react/prop-types
function MolarisFAB({ onOpen }) {
  const [showTip, setShowTip] = useState(false);

  return (
    <div className="fixed bottom-28 right-4 sm:bottom-6 sm:right-6 z-[102] group">
      <div className={`absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1 bg-slate-900 text-white text-xs font-semibold rounded-lg whitespace-nowrap shadow-lg pointer-events-none transition-all duration-150 ${showTip ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}>
        Molaris TCO
        <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-900" />
      </div>
      <button
        onClick={onOpen}
        onMouseEnter={() => setShowTip(true)}
        onMouseLeave={() => setShowTip(false)}
        className="relative w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-gradient-to-br from-violet-500 to-purple-700 text-white shadow-xl shadow-purple-400/50 flex items-center justify-center hover:scale-110 active:scale-95 transition-all duration-200"
      >
        <span className="absolute inset-0 rounded-full bg-purple-500 opacity-25 animate-ping" />
        <Mic size={24} />
      </button>
    </div>
  );
}

export default function TreatmentPage({ patientIdProp }) {
  const { id: paramId } = useParams();
  const id = patientIdProp || paramId;

  const { user } = useAuth();
  const { closeTreatment, activeTreatment } = useTreatment();

  const [patient, setPatient]               = useState(null);
  const [visits, setVisits]                 = useState([]);
  const [appointments, setAppointments]     = useState([]);
  const [labOrders, setLabOrders]           = useState([]);
  const [loading, setLoading]               = useState(true);
  const [isProfileOpen, setIsProfileOpen]   = useState(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [isDocumentsOpen, setIsDocumentsOpen] = useState(false);
  const [docsReport, setDocsReport]               = useState(null); // AI report for the docs modal's visit
  const [reportRefreshKey, setReportRefreshKey]   = useState(0);
  const [labRefreshKey, setLabRefreshKey]         = useState(0);
  const [invoiceLoaded, setInvoiceLoaded]         = useState(false);
  const [viewingDate, setViewingDate]             = useState(null); // ISO date string or null (= today)
  const [showConcludeModal, setShowConcludeModal] = useState(false);
  const [concludingAppointment, setConcludingAppointment] = useState(null);
  const [pageBanner, setPageBanner] = useState(null); // { type: 'success'|'error', msg: string }
  const [activeTab, setActiveTab]           = useState('assessment');
  // Teeth to glow on the chart — set while hovering a draft entry in the dictation
  // review drawer, so an entry can be verified against the chart at a glance.
  const [highlightTeeth, setHighlightTeeth] = useState([]);
  const [visitInvoice, setVisitInvoice]     = useState(null); // the single invoice for the current visit
  const invoiceModalRef                     = useRef(null);

  const handleTabChange = (tab) => {
    setActiveTab(tab);
  };

  const showBanner = (type, msg) => {
    setPageBanner({ type, msg });
    setTimeout(() => setPageBanner(null), 3500);
  };

  // Central Data Fetch Function
  const fetchPageData = async () => {
    try {
      const [patientRes, visitsRes, appointmentsRes] = await Promise.all([
          API.get(`/patients/${id}`),
          API.get(`/visits/patient/${id}`),
          API.get(`/appointments/patient/${id}`)
      ]);
      setPatient(patientRes.data);

      // Doctor role: scope visits to those owned by the logged-in doctor.
      // A visit is "owned" when its doctor_id matches, OR its appointment's
      // doctor matches. Visits with no doctor at all (auto-created for notes)
      // stay visible so the doctor never loses their own in-progress work.
      const scopedDoctorId = user?.role === 'Doctor'
        ? (user?.doctorId ? String(user.doctorId) : null)
        : null;
      const allVisits = visitsRes.data || [];
      const visits = scopedDoctorId
        ? allVisits.filter(v => {
            const vDoc = v.doctor_id && (typeof v.doctor_id === 'object' ? v.doctor_id._id : v.doctor_id);
            const aDoc = v.appointment_id && typeof v.appointment_id === 'object' ? v.appointment_id.doctor_id : null;
            if (vDoc) return String(vDoc) === scopedDoctorId;
            if (aDoc) return String(aDoc) === scopedDoctorId;
            return true; // no doctor attached anywhere — keep it
          })
        : allVisits;
      setVisits(visits);
      setAppointments(appointmentsRes.data);
    } catch (err) {
      console.error("Failed to fetch treatment data", err);
    } finally {
      setLoading(false);
    }
  };

  // Initial Load
  useEffect(() => {
    if (id) {
        setLoading(true);
        fetchPageData();
    }
  }, [id]);

  // Background sync — auto-save invoice when treatments change in the dental chart.
  // Gated on invoiceLoaded so we never overwrite an existing invoice (with custom
  // items) before it has been fetched. The modal merges new treatments into the
  // existing items, so custom services/lab orders are preserved.
  const treatmentsSig = JSON.stringify(
    (visits[0]?.treatments || []).map(t => [t._id, t.treatment_name, t.cost, t.qty])
  );
  const didInitTreatmentSig = useRef(false);
  useEffect(() => {
    if (activeTab !== 'invoice') return;
    if (!invoiceLoaded) return;
    // Skip the first run after load — nothing has actually changed yet.
    if (!didInitTreatmentSig.current) { didInitTreatmentSig.current = true; return; }
    const t = setTimeout(() => invoiceModalRef.current?.save(), 600);
    return () => clearTimeout(t);
  }, [treatmentsSig, invoiceLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset the init guard whenever we leave the invoice tab.
  useEffect(() => {
    if (activeTab !== 'invoice') didInitTreatmentSig.current = false;
  }, [activeTab]);

  // Detect and load THIS appointment's invoice by appointment_id — the single
  // source of truth for linking documents. There is one and only one invoice per
  // appointment. invoiceLoaded gates the inline modal so it never seeds/auto-saves
  // before the existing invoice (which may contain custom items) has been fetched.
  // Track the appointment whose invoice we've already gated on, so refetches of the
  // same appointment (e.g. after a save) don't blank the gate and remount the modal.
  const gatedVisitRef = useRef(null);
  const loadVisitInvoice = useCallback(() => {
    // Resolve the current appointment the same way docsVisit does: prefer the live
    // session's appointment, else the appointment stamped on the newest visit.
    const sessionApptId = !viewingDate ? activeTreatment?.appointmentId : null;
    const currentVisit = visits[0];
    const currentApptId = sessionApptId
      || (typeof currentVisit?.appointment_id === 'object'
            ? currentVisit?.appointment_id?._id
            : currentVisit?.appointment_id)
      || null;
    // Only show the loading spinner when switching to a different appointment (or
    // the very first load). Reloads of the same appointment keep the modal mounted
    // so the Save button doesn't flicker Saving… → spinner → Save Changes.
    if (gatedVisitRef.current !== currentApptId) {
      gatedVisitRef.current = currentApptId;
      setInvoiceLoaded(false);
    }
    if (!currentApptId) { setVisitInvoice(null); setInvoiceLoaded(true); return; }
    return API.get(`/invoices?appointment_id=${currentApptId}`)
      .then(res => {
        const list = Array.isArray(res.data) ? res.data : [];
        setVisitInvoice(list[0] || null); // one invoice per appointment
      })
      .catch(() => setVisitInvoice(null))
      .finally(() => setInvoiceLoaded(true));
  }, [visits, viewingDate, activeTreatment?.appointmentId]);

  useEffect(() => { loadVisitInvoice(); }, [loadVisitInvoice]);

  // Re-fetch the invoice whenever the Invoice tab is (re)opened, so edits made
  // elsewhere (e.g. price change on a linked lab order in the Lab Orders page)
  // are reflected here.
  useEffect(() => {
    if (activeTab === 'invoice') loadVisitInvoice();
  }, [activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

  // Pre-populate chief_complaint from appointment booking if today's visit has none yet
  useEffect(() => {
    const appointmentComplaint = activeTreatment?.chiefComplaint;
    if (!appointmentComplaint || visits.length === 0) return;
    const todayVisit = visits[0];
    if (!todayVisit?._id || todayVisit.chief_complaint) return;
    // Silently seed it — don't alert the user
    API.patch(`/visits/${todayVisit._id}`, { chief_complaint: appointmentComplaint })
      .then(() => setVisits(prev => prev.map(v => v._id === todayVisit._id ? { ...v, chief_complaint: appointmentComplaint } : v)))
      .catch(() => {});
  }, [visits.length, activeTreatment?.chiefComplaint]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSaveHistory = async (updatedData) => {
      try {
          // Only patient-level fields (NO chief_complaint)
          await API.put(`/patients/${id}`, updatedData);
          setPatient(prev => ({ ...prev, ...updatedData }));
          alert("Clinical History Updated");
      } catch (err) {
          console.error("Failed to update history", err);
          alert("Update failed");
      }
  };

  const handleSaveVisitComplaint = async (visitId, chief_complaint) => {
      try {
          await API.patch(`/visits/${visitId}`, { chief_complaint });
          // Optimistically update local visits state
          setVisits(prev => prev.map(v => v._id === visitId ? { ...v, chief_complaint } : v));
      } catch (err) {
          console.error("Failed to update visit chief complaint", err);
          alert("Failed to save Chief Complaint");
      }
  };

  const handleConcludeAppointment = async () => {
    if (!concludingAppointment) throw new Error('No appointment to conclude');

    try {
      const response = await API.patch(`/appointments/${concludingAppointment._id}/status`, { status: 'Completed' });

      if (response.data.status !== 'Completed') {
        throw new Error('Failed to update appointment status');
      }

      await fetchPageData();
      setShowConcludeModal(false);
      setConcludingAppointment(null);
      closeTreatment(true);
    } catch (err) {
      console.error('Error concluding appointment:', err);
      showBanner('error', 'Failed to conclude appointment: ' + err.message);
      throw err;
    }
  };

  // Fetch the AI report for the docs modal's visit, strictly scoped to that
  // visit's appointment so an unrelated report never appears. Declared before
  // the early `loading` return so hook order stays stable across renders.
  useEffect(() => {
    if (!isDocumentsOpen || !id) { setDocsReport(null); return; }
    // Same appointment-keyed selection as `docsVisit` below: when a live session
    // is active, scope to the visit linked to THIS appointment so the report
    // matches the documents shown — not the newest-by-date visit.
    const sessionApptId = !viewingDate ? activeTreatment?.appointmentId : null;
    const dv =
      (sessionApptId &&
        visits.find(v => String(v.appointment_id?._id || v.appointment_id) === String(sessionApptId)))
      || (viewingDate
        ? visits.filter(v => new Date(v.date).toISOString().slice(0, 10) === new Date(viewingDate).toISOString().slice(0, 10))
        : visits)[0]
      || (viewingDate ? null : visits[0])
      || null;
    // Prefer the visit's own appointment, then the active session's appointment.
    // If neither exists (walk-in), scope by the visit's day so we still only get
    // THIS visit's report (the backend day-scopes on `date`).
    const apptId = (typeof dv?.appointment_id === 'object' ? dv.appointment_id?._id : dv?.appointment_id)
      || (!viewingDate ? activeTreatment?.appointmentId : null)
      || null;
    if (!apptId && !dv?.date) { setDocsReport(null); return; }
    const qs = apptId
      ? `patientId=${id}&appointmentId=${apptId}`
      : `patientId=${id}&date=${new Date(dv.date).toISOString()}`;
    let cancelled = false;
    setDocsReport(null);
    API.get(`/report/latest?${qs}`)
      .then(r => { if (!cancelled) setDocsReport(r.data?.report || null); })
      .catch(() => { if (!cancelled) setDocsReport(null); });
    return () => { cancelled = true; };
  }, [isDocumentsOpen, viewingDate, visits, id, activeTreatment?.appointmentId]);

  if (loading) {
      return (
          <div className="min-h-screen flex items-center justify-center bg-[#EBF2F7]">
              <Loader2 className="animate-spin text-[#137fec]" size={40} />
          </div>
      );
  }

  // When a past appointment is selected, filter visits to that day only
  const displayVisits = viewingDate
    ? visits.filter(v => new Date(v.date).toISOString().slice(0, 10) === new Date(viewingDate).toISOString().slice(0, 10))
    : visits;

  const viewingDateLabel = viewingDate
    ? new Date(viewingDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    : null;

  // The visit whose documents the modal shows (mirrors the modal's `visit` prop).
  // Everything is keyed by appointment_id now: when a live session is active,
  // pick the visit linked to THIS appointment — never the newest-by-date visit,
  // which may belong to a different appointment and won't carry the findings /
  // treatments just charted. Falls back to the newest visit for walk-ins / no
  // active session.
  const docsVisit = (() => {
    const apptId = !viewingDate ? activeTreatment?.appointmentId : null;
    if (apptId) {
      const linked = visits.find(
        v => String(v.appointment_id?._id || v.appointment_id) === String(apptId)
      );
      if (linked) return linked;
    }
    return displayVisits[0] || (viewingDate ? null : visits[0]) || null;
  })();

  // The appointment every document written this session links to. Prefer the live
  // session's appointment (reliable even on the first action, before any visit
  // exists); fall back to whatever is already stamped on the current visit.
  const activeApptId = (!viewingDate ? activeTreatment?.appointmentId : null) || currentApptId(displayVisits);

  const handleConclude = () => {
    const apptId = activeTreatment?.appointmentId;
    const activeAppt = apptId ? appointments.find(a => a._id === apptId) : null;
    if (activeAppt) { setConcludingAppointment(activeAppt); setShowConcludeModal(true); }
    else showBanner('error', 'No active appointment found for this patient.');
  };

  return (
    <div className="min-h-screen bg-[#EBF2F7] px-3 sm:px-4 font-sans pb-32 sm:pb-24">
      <div className="max-w-7xl mx-auto pt-4 sm:pt-6">

        {/* Page banner */}
        {pageBanner && (
          <div className={`flex items-center gap-2 px-4 py-3 rounded-xl mb-4 text-sm font-medium border ${
            pageBanner.type === 'success' ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'
          }`}>
            {pageBanner.type === 'success' ? '✓' : '✕'} {pageBanner.msg}
          </div>
        )}

        <PatientInfoCard patient={patient} onViewProfile={() => setIsProfileOpen(true)} appointments={appointments} currentVisit={visits[0] || null} />

        {/* Past date banner */}
        {viewingDate && (
          <div className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-3">
            <p className="text-sm text-amber-800">Viewing <span className="font-semibold">{viewingDateLabel}</span></p>
            <button onClick={() => setViewingDate(null)} className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-amber-300 text-amber-700 rounded-lg text-xs font-semibold hover:bg-amber-100 transition-colors">
              ← Back to Today
            </button>
          </div>
        )}

        {/* ── Clinical tab bar ── */}
        <ClinicalTabBar active={activeTab} onChange={handleTabChange} />

        {/* ── Tab: Assessment ── */}
        {activeTab === 'assessment' && (
          <div>
            {/* AI assessment dictation — hidden for now. Uncomment to re-enable;
                the backend (/api/assessment/autofill) and the component are intact. */}
            {/* <AssessmentDictation
              patientId={id}
              patient={patient}
              appointmentId={activeApptId}
              currentVisit={visits[0] || null}
              onHighlightTeeth={setHighlightTeeth}
              onCommitted={fetchPageData}
            /> */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <ClinicalHistory
                patient={patient}
                currentVisit={visits[0] || null}
                onSaveHistory={handleSaveHistory}
                onSaveVisitComplaint={handleSaveVisitComplaint}
              />
              <TreatmentTabs
                onTreatmentAdded={fetchPageData}
                visits={visits}
                patientId={id}
                appointmentId={activeApptId}
                initialDentition={patient?.dentition_type || 'Adult'}
                highlightTeeth={highlightTeeth}
              />
            </div>
          </div>
        )}

        {/* ── Tab: Treatment Plan ── */}
        {activeTab === 'treatment' && (
          <div className="space-y-3">
            <TreatmentPlanBoard visits={displayVisits} onRefresh={fetchPageData} />
            <LabOrders patientId={id} onRefresh={fetchPageData} onOrdersLoaded={setLabOrders} refreshKey={labRefreshKey} />
          </div>
        )}

        {/* ── Tab: Prescriptions ── */}
        {activeTab === 'prescriptions' && (
          <Medications visits={displayVisits} patientId={id} onRefresh={fetchPageData} targetVisitId={displayVisits[0]?._id || null} appointmentId={activeApptId} />
        )}

        {/* ── Tab: Invoice ── */}
        {activeTab === 'invoice' && (
          !invoiceLoaded ? (
            <div className="flex items-center justify-center py-12 text-slate-400 text-sm">
              <Loader2 className="animate-spin mr-2" size={18} /> Loading invoice…
            </div>
          ) : (
            // editInvoice = existing saved invoice (custom items live here).
            // seedItems = treatments/prescriptions from the chart to MERGE in.
            // The modal keeps existing items and adds any new treatment-backed ones.
            <NewInvoiceModal
              ref={invoiceModalRef}
              inline
              isOpen
              initialPatient={patient}
              visitId={displayVisits[0]?._id}
              appointmentId={activeApptId}
              editInvoice={visitInvoice}
              initialItems={[
                ...(displayVisits[0] ? (displayVisits[0].treatments || [])
                  .filter(t => t.status !== 'Cancelled' && t.treatment_name !== 'Missing')
                  .map(t => ({ name: t.treatment_name, type: 'Service', quantity: t.qty || 1, rate: t.cost || 0, total: (t.cost || 0) * (t.qty || 1), item_id: null, _treatmentRef: { visitId: displayVisits[0]._id, treatmentId: t._id } }))
                : []),
                ...(displayVisits[0] ? (displayVisits[0].prescriptions || [])
                  .map(p => ({ name: p.drug_name, type: 'Pharmacy', quantity: 1, rate: 0, total: 0, item_id: null, _prescriptionRef: { visitId: displayVisits[0]._id, prescriptionId: p._id } }))
                : []),
              ]}
              onSuccess={() => { fetchPageData(); setLabRefreshKey(k => k + 1); }}
              onClose={() => {}}
            />
          )
        )}

        {/* ── Tab: Visit Notes ── */}
        {activeTab === 'notes' && (
          <div className="space-y-3">
            <ConsultationNotes visits={displayVisits} patientId={id} onRefresh={fetchPageData} appointmentId={activeApptId} />
            <AdvicesRecall visits={displayVisits} patientId={id} onRefresh={fetchPageData} appointmentId={activeApptId} />
          </div>
        )}

        {/* ── Tab: Files & Reports ── */}
        {activeTab === 'files' && (
          <ReportsNotesSection patientId={id} refreshTrigger={reportRefreshKey} visits={visits} visitId={visits[0]?._id || null} appointmentId={activeApptId} onRefresh={fetchPageData} />
        )}

        {/* ── Tab: History ── */}
        {activeTab === 'history' && (
          <PatientHistory visits={visits} patient={patient} />
        )}

        {/* Desktop bottom bar */}
        <div className="hidden sm:flex sticky bottom-4 z-10 bg-white p-3 sm:p-4 rounded-xl shadow-[0_-4px_20px_rgba(0,0,0,0.05)] border border-gray-100 justify-between items-center gap-3">
          <button onClick={handleConclude} className="px-4 sm:px-6 py-2 border-2 border-red-300 text-red-600 font-medium rounded-lg hover:bg-red-50 flex items-center gap-2 transition-colors text-sm whitespace-nowrap">
            ✓ Conclude Appointment
          </button>
          <div className="flex gap-2 sm:gap-3 flex-wrap justify-end">
            <button onClick={() => setIsDocumentsOpen(true)} className="px-4 sm:px-6 py-2 border border-[#137fec] text-[#137fec] font-medium rounded-lg hover:bg-blue-50 flex items-center gap-2 transition-colors text-sm">
              <FileText size={16} /> Documents
            </button>
          </div>
        </div>
      </div>

      {/* Mobile action FAB */}
      <MobileActionBar
        onConclude={handleConclude}
        onDocuments={() => setIsDocumentsOpen(true)}
        patientId={id}
        patient={patient}
      />

      {/* Molaris TCO — Draggable FAB */}
      <MolarisFAB onOpen={() => setIsReportModalOpen(true)} />

      <ClinicalReportModal
        isOpen={isReportModalOpen}
        onClose={() => setIsReportModalOpen(false)}
        onSuccess={() => { fetchPageData(); setReportRefreshKey(k => k + 1); }}
        patientId={id}
        appointmentId={activeTreatment?.appointmentId || null}
        patient={patient}
      />

      <PatientProfileModal
        isOpen={isProfileOpen}
        onClose={() => setIsProfileOpen(false)}
        patient={patient}
      />

      <VisitDocumentsModal
        isOpen={isDocumentsOpen}
        onClose={() => setIsDocumentsOpen(false)}
        // When viewing a specific date, show only that date's visit — no fallback
        // to another visit's documents. Otherwise use the current (first) visit.
        visit={docsVisit}
        patient={patient}
        invoice={visitInvoice}
        reportJob={docsReport}
      />


      {/* Conclude Appointment Confirmation Modal */}
      {showConcludeModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <div className="flex items-center justify-center w-12 h-12 bg-red-100 rounded-full mx-auto mb-4">
              <span className="text-2xl text-red-600">⚠️</span>
            </div>
            <h3 className="text-xl font-bold text-slate-900 text-center mb-2">
              Conclude Appointment
            </h3>
            <p className="text-slate-600 text-center mb-6">
              Are you sure you want to mark this appointment as <span className="font-semibold">completed</span>?
              This action will update the appointment status and cannot be easily undone.
            </p>
            {concludingAppointment && (
              <div className="bg-slate-50 rounded-lg p-4 mb-6 border border-slate-200">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-slate-500 text-xs font-medium uppercase">Time</p>
                    <p className="text-slate-900 font-semibold">
                      {new Date(concludingAppointment.start_time).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-500 text-xs font-medium uppercase">Status</p>
                    <p className="text-slate-900 font-semibold capitalize">{concludingAppointment.status}</p>
                  </div>
                </div>
              </div>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowConcludeModal(false);
                  setConcludingAppointment(null);
                }}
                className="flex-1 px-4 py-2.5 border border-slate-300 text-slate-700 font-medium rounded-lg hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConcludeAppointment}
                className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg transition-colors"
              >
                Yes, Conclude
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}