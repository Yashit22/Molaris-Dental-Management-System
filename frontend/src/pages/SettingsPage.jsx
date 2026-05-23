import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Edit2, Trash2, X, Download, Upload, Mail, CheckCircle, XCircle, RefreshCw, Pill, FileSpreadsheet, ExternalLink, Loader2, Calendar, Clock, Globe, Copy, Link2, BookOpen } from 'lucide-react';
import API from '../services/api';
import EmailTemplateEditorModal from '../modals/EmailTemplateEditorModal';
import AddClinicalDataModal from '../modals/AddClinicalDataModal';
import SingleClinicalItemModal from '../modals/SingleClinicalItemModal';
import BulkUploadClinicalModal from '../modals/BulkUploadClinicalModal';
import { useInventorySettings } from '../Context/SettingsContext';
import { useAuth } from '../Context/AuthContext';

// ─── Booking helpers ──────────────────────────────────────────────────────────

const BOOKING_DAYS = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];

const DEFAULT_BOOKING_SETTINGS = {
  isBookingEnabled: false,
  slotDurationMinutes: 30,
  clinicDisplayName: '',
  clinicTagline: '',
  clinicLogoUrl: '',
  workingHours: Object.fromEntries(
    BOOKING_DAYS.map(d => [d, { isOpen: d !== 'sunday', start: '09:00', end: '17:00', breaks: [] }])
  ),
  blockedDates: [],
};

const DEFAULT_DOCTOR_WH = {
  monday:    { isOpen: true,  start: '09:00', end: '17:00', breaks: [] },
  tuesday:   { isOpen: true,  start: '09:00', end: '17:00', breaks: [] },
  wednesday: { isOpen: true,  start: '09:00', end: '17:00', breaks: [] },
  thursday:  { isOpen: true,  start: '09:00', end: '17:00', breaks: [] },
  friday:    { isOpen: true,  start: '09:00', end: '17:00', breaks: [] },
  saturday:  { isOpen: true,  start: '10:00', end: '14:00', breaks: [] },
  sunday:    { isOpen: false, start: '09:00', end: '17:00', breaks: [] },
};

function toSlug(str) {
  return (str || '').toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

// ─── Shared DayRow component ──────────────────────────────────────────────────

function DayRow({ day, schedule, onChange }) {
  const label = day.charAt(0).toUpperCase() + day.slice(1);
  const s = schedule || { isOpen: false, start: '09:00', end: '17:00', breaks: [] };

  const set = patch => onChange(day, { ...s, ...patch });

  const addBreak = () => set({ breaks: [...(s.breaks || []), { start: '13:00', end: '14:00' }] });
  const removeBreak = i => set({ breaks: s.breaks.filter((_, idx) => idx !== i) });
  const updateBreak = (i, field, val) => {
    const breaks = [...(s.breaks || [])];
    breaks[i] = { ...breaks[i], [field]: val };
    set({ breaks });
  };

  return (
    <div className="border border-slate-200 dark:border-slate-700 rounded-xl p-3 mb-2">
      <div className="flex items-center gap-3 flex-wrap">
        <label className="flex items-center gap-2 cursor-pointer min-w-[110px]">
          <input type="checkbox" checked={!!s.isOpen} onChange={e => set({ isOpen: e.target.checked })}
            className="w-4 h-4 accent-[#137fec]" />
          <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">{label}</span>
        </label>
        {s.isOpen && (
          <>
            <input type="time" value={s.start || ''} onChange={e => set({ start: e.target.value })}
              className="px-2 py-1 border border-slate-300 dark:border-slate-600 rounded-lg text-sm dark:bg-slate-800 dark:text-white" />
            <span className="text-slate-400 text-sm">to</span>
            <input type="time" value={s.end || ''} onChange={e => set({ end: e.target.value })}
              className="px-2 py-1 border border-slate-300 dark:border-slate-600 rounded-lg text-sm dark:bg-slate-800 dark:text-white" />
            <button onClick={addBreak}
              className="text-xs text-[#137fec] hover:underline font-medium ml-auto">+ Add Break</button>
          </>
        )}
      </div>
      {s.isOpen && (s.breaks || []).length > 0 && (
        <div className="mt-2 ml-6 space-y-1">
          {s.breaks.map((b, i) => (
            <div key={i} className="flex items-center gap-2 text-xs text-slate-500">
              <span>Break:</span>
              <input type="time" value={b.start || ''} onChange={e => updateBreak(i, 'start', e.target.value)}
                className="px-2 py-1 border border-slate-200 dark:border-slate-600 rounded text-xs dark:bg-slate-800 dark:text-white" />
              <span>–</span>
              <input type="time" value={b.end || ''} onChange={e => updateBreak(i, 'end', e.target.value)}
                className="px-2 py-1 border border-slate-200 dark:border-slate-600 rounded text-xs dark:bg-slate-800 dark:text-white" />
              <button onClick={() => removeBreak(i)} className="text-red-400 hover:text-red-600 ml-1">
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Doctor Schedule Modal ────────────────────────────────────────────────────

function DoctorScheduleModal({ doctor, onClose, onSaved }) {
  const [form, setForm] = useState({
    isBookable: false,
    bookingWorkingHours: { ...DEFAULT_DOCTOR_WH },
    holidays: [],
    blockedSlots: [],
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newHoliday, setNewHoliday] = useState({ date: '', reason: '' });

  useEffect(() => {
    API.get(`/settings/doctors/${doctor._id}/schedule`)
      .then(res => {
        const data = res.data;
        setForm({
          isBookable: data.isBookable || false,
          bookingWorkingHours: Object.fromEntries(
            BOOKING_DAYS.map(d => [d, { ...DEFAULT_DOCTOR_WH[d], ...(data.bookingWorkingHours?.[d] || {}) }])
          ),
          holidays:     data.holidays     || [],
          blockedSlots: data.blockedSlots || [],
        });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [doctor._id]);

  const setDayWH = (day, patch) =>
    setForm(f => ({ ...f, bookingWorkingHours: { ...f.bookingWorkingHours, [day]: patch } }));

  const addHoliday = () => {
    if (!newHoliday.date) return;
    setForm(f => ({ ...f, holidays: [...f.holidays, { ...newHoliday }] }));
    setNewHoliday({ date: '', reason: '' });
  };

  const removeHoliday = i =>
    setForm(f => ({ ...f, holidays: f.holidays.filter((_, idx) => idx !== i) }));

  const save = async () => {
    setSaving(true);
    try {
      await API.put(`/settings/doctors/${doctor._id}/schedule`, form);
      onSaved(doctor._id, form.isBookable);
      onClose();
    } catch (err) {
      alert('Failed to save: ' + (err.response?.data?.error || err.message));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-xl shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center sticky top-0 bg-white dark:bg-slate-900 z-10">
          <h3 className="font-bold text-lg text-slate-800 dark:text-white">
            Schedule — {doctor.name}
          </h3>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700">
            <X size={20} />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12 text-slate-400">
            <Loader2 size={24} className="animate-spin mr-2" /> Loading…
          </div>
        ) : (
          <div className="p-6 space-y-6">
            {/* Bookable toggle */}
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold text-slate-800 dark:text-white">Bookable Online</p>
                <p className="text-xs text-slate-500 mt-0.5">Patients can book appointments with this doctor</p>
              </div>
              <button
                onClick={() => setForm(f => ({ ...f, isBookable: !f.isBookable }))}
                className={`relative inline-flex h-6 w-11 rounded-full transition-colors ${form.isBookable ? 'bg-[#137fec]' : 'bg-slate-300 dark:bg-slate-600'}`}
              >
                <span className={`inline-block h-4 w-4 mt-1 rounded-full bg-white shadow transition-transform ${form.isBookable ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>

            {form.isBookable && (
              <>
                {/* Working Hours */}
                <div>
                  <p className="text-sm font-bold text-slate-700 dark:text-slate-200 mb-3">Working Hours</p>
                  {BOOKING_DAYS.map(day => (
                    <DayRow key={day} day={day}
                      schedule={form.bookingWorkingHours[day]}
                      onChange={setDayWH} />
                  ))}
                </div>

                {/* Holidays */}
                <div>
                  <p className="text-sm font-bold text-slate-700 dark:text-slate-200 mb-3">Holidays / Days Off</p>
                  <div className="space-y-2 mb-3">
                    {form.holidays.map((h, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm bg-slate-50 dark:bg-slate-800 rounded-lg px-3 py-2">
                        <Calendar size={14} className="text-slate-400 flex-shrink-0" />
                        <span className="font-medium text-slate-700 dark:text-slate-200">{h.date}</span>
                        {h.reason && <span className="text-slate-400">— {h.reason}</span>}
                        <button onClick={() => removeHoliday(i)} className="ml-auto text-red-400 hover:text-red-600">
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input type="date" value={newHoliday.date}
                      onChange={e => setNewHoliday(h => ({ ...h, date: e.target.value }))}
                      className="px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm flex-shrink-0 dark:bg-slate-800 dark:text-white" />
                    <input type="text" placeholder="Reason (optional)" value={newHoliday.reason}
                      onChange={e => setNewHoliday(h => ({ ...h, reason: e.target.value }))}
                      className="flex-1 px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm dark:bg-slate-800 dark:text-white" />
                    <button onClick={addHoliday}
                      className="px-3 py-2 bg-slate-100 dark:bg-slate-700 rounded-lg text-sm font-semibold hover:bg-slate-200 dark:hover:bg-slate-600 flex-shrink-0">
                      Add
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg">
            Cancel
          </button>
          <button onClick={save} disabled={saving || loading}
            className="px-5 py-2 bg-[#137fec] text-white text-sm font-bold rounded-lg hover:bg-blue-600 disabled:opacity-60 flex items-center gap-2">
            {saving ? <><Loader2 size={14} className="animate-spin" /> Saving…</> : 'Save Schedule'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Invoice Settings Tab ─────────────────────────────────────────────────────

function InvoiceSettingsTab() {
  const inputCls = 'w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-800 focus:ring-2 focus:ring-[#137fec] outline-none';

  const [form, setForm] = React.useState({
    clinic: { name: '', addressLines: ['', ''], phone: '', email: '', gstNumber: '', logoUrl: '' },
    currencySymbol: '₹',
    tax: { label: 'Tax', defaultRatePct: 0, show: true },
    invoiceNumber: { prefix: 'INV' },
    showPaidPending: true,
    footerText: '',
    termsText: '',
  });
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [banner, setBanner] = React.useState(null);

  React.useEffect(() => {
    API.get('/settings/invoice')
      .then(r => {
        if (r.data && Object.keys(r.data).length > 0) {
          const { _id, __v, createdAt, updatedAt, ...data } = r.data;
          setForm(prev => ({
            ...prev,
            ...data,
            clinic:        { ...prev.clinic,        ...(data.clinic        || {}) },
            tax:           { ...prev.tax,           ...(data.tax           || {}) },
            invoiceNumber: { ...prev.invoiceNumber, ...(data.invoiceNumber || {}) },
          }));
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  async function save() {
    setSaving(true);
    setBanner(null);
    try {
      const { _id, __v, createdAt, updatedAt, ...payload } = form;
      await API.put('/settings/invoice', payload);
      setBanner({ ok: true, msg: 'Invoice settings saved.' });
    } catch (err) {
      setBanner({ ok: false, msg: err.response?.data?.message || err.message });
    } finally {
      setSaving(false);
    }
  }

  function setClinic(field, val) {
    setForm(f => ({ ...f, clinic: { ...f.clinic, [field]: val } }));
  }
  function setAddressLine(idx, val) {
    const lines = [...(form.clinic.addressLines || ['', ''])];
    lines[idx] = val;
    setForm(f => ({ ...f, clinic: { ...f.clinic, addressLines: lines } }));
  }

  if (loading) return <div className="text-center py-12 text-slate-500">Loading…</div>;

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg p-6 max-w-2xl space-y-8">
      <h2 className="text-2xl font-bold text-slate-800 dark:text-white">Invoice Settings</h2>

      {/* Clinic / Branding */}
      <section className="space-y-4">
        <h3 className="text-sm font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wide border-b border-slate-100 dark:border-slate-700 pb-1">
          Clinic / Branding
        </h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Clinic Name</label>
            <input type="text" value={form.clinic.name} onChange={e => setClinic('name', e.target.value)} placeholder="City Dental Clinic" className={inputCls} />
          </div>
          <div className="col-span-2">
            <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Address Line 1</label>
            <input type="text" value={(form.clinic.addressLines || [])[0] || ''} onChange={e => setAddressLine(0, e.target.value)} placeholder="123, Main Street" className={inputCls} />
          </div>
          <div className="col-span-2">
            <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Address Line 2</label>
            <input type="text" value={(form.clinic.addressLines || [])[1] || ''} onChange={e => setAddressLine(1, e.target.value)} placeholder="Mumbai, Maharashtra 400001" className={inputCls} />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Phone</label>
            <input type="text" value={form.clinic.phone} onChange={e => setClinic('phone', e.target.value)} placeholder="+91 98765 43210" className={inputCls} />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Email</label>
            <input type="email" value={form.clinic.email} onChange={e => setClinic('email', e.target.value)} placeholder="clinic@example.com" className={inputCls} />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase block mb-1">GST Number</label>
            <input type="text" value={form.clinic.gstNumber} onChange={e => setClinic('gstNumber', e.target.value)} placeholder="27AAAAA0000A1Z5" className={inputCls} />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Logo URL (optional)</label>
            <input type="url" value={form.clinic.logoUrl} onChange={e => setClinic('logoUrl', e.target.value)} placeholder="https://…/logo.png" className={inputCls} />
          </div>
        </div>
      </section>

      {/* Currency & Numbering */}
      <section className="space-y-4">
        <h3 className="text-sm font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wide border-b border-slate-100 dark:border-slate-700 pb-1">
          Currency &amp; Numbering
        </h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Currency Symbol</label>
            <input type="text" value={form.currencySymbol} onChange={e => setForm(f => ({ ...f, currencySymbol: e.target.value }))} placeholder="₹" className={inputCls} />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Invoice Prefix</label>
            <input type="text" value={form.invoiceNumber?.prefix || 'INV'} onChange={e => setForm(f => ({ ...f, invoiceNumber: { ...f.invoiceNumber, prefix: e.target.value } }))} placeholder="INV" className={inputCls} />
          </div>
        </div>
      </section>

      {/* Tax */}
      <section className="space-y-4">
        <h3 className="text-sm font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wide border-b border-slate-100 dark:border-slate-700 pb-1">
          Tax
        </h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Tax Label</label>
            <input type="text" value={form.tax?.label || 'Tax'} onChange={e => setForm(f => ({ ...f, tax: { ...f.tax, label: e.target.value } }))} placeholder="GST / Tax" className={inputCls} />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Default Rate (%)</label>
            <input type="number" min="0" max="100" step="0.01" value={form.tax?.defaultRatePct ?? 0} onChange={e => setForm(f => ({ ...f, tax: { ...f.tax, defaultRatePct: Number(e.target.value) } }))} className={inputCls} />
          </div>
          <div className="col-span-2">
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={!!form.tax?.show} onChange={e => setForm(f => ({ ...f, tax: { ...f.tax, show: e.target.checked } }))} className="w-4 h-4 accent-[#137fec]" />
              <span className="text-sm text-slate-700 dark:text-slate-300">Show tax line on invoices</span>
            </label>
          </div>
        </div>
      </section>

      {/* Display Options */}
      <section className="space-y-4">
        <h3 className="text-sm font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wide border-b border-slate-100 dark:border-slate-700 pb-1">
          Display Options
        </h3>
        <label className="flex items-center gap-3 cursor-pointer">
          <input type="checkbox" checked={!!form.showPaidPending} onChange={e => setForm(f => ({ ...f, showPaidPending: e.target.checked }))} className="w-4 h-4 accent-[#137fec]" />
          <span className="text-sm text-slate-700 dark:text-slate-300">Show Paid / Pending amounts on invoice</span>
        </label>
      </section>

      {/* Footer & Terms */}
      <section className="space-y-4">
        <h3 className="text-sm font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wide border-b border-slate-100 dark:border-slate-700 pb-1">
          Footer &amp; Terms
        </h3>
        <div>
          <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Footer Text</label>
          <textarea rows={2} value={form.footerText} onChange={e => setForm(f => ({ ...f, footerText: e.target.value }))} placeholder="Thank you for choosing us!" className={`${inputCls} resize-none`} />
        </div>
        <div>
          <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Terms &amp; Conditions</label>
          <textarea rows={3} value={form.termsText} onChange={e => setForm(f => ({ ...f, termsText: e.target.value }))} placeholder="All treatments are subject to…" className={`${inputCls} resize-none`} />
        </div>
      </section>

      <div className="flex items-center gap-4 pt-2">
        <button onClick={save} disabled={saving} className="px-6 py-2.5 bg-[#137fec] hover:bg-blue-600 text-white font-semibold rounded-xl text-sm transition-colors disabled:opacity-60">
          {saving ? 'Saving…' : 'Save Invoice Settings'}
        </button>
        {banner && (
          <p className={`text-sm font-medium flex items-center gap-1.5 ${banner.ok ? 'text-green-600' : 'text-red-600'}`}>
            {banner.ok ? <CheckCircle size={15} /> : <XCircle size={15} />}
            {banner.msg}
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Prescription Settings Tab ────────────────────────────────────────────────

function PrescriptionSettingsTab() {
  const inputCls = 'w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-800 focus:ring-2 focus:ring-[#137fec] outline-none';

  const [form, setForm] = React.useState({
    clinic: { name: '', tagline: '', addressLines: ['', ''], phone: '', email: '', logoUrl: '' },
    footerText: '',
  });
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [banner, setBanner] = React.useState(null);

  React.useEffect(() => {
    API.get('/settings/prescription')
      .then(r => {
        if (r.data && Object.keys(r.data).length > 0) {
          const { _id, __v, createdAt, updatedAt, ...data } = r.data;
          setForm(prev => ({
            ...prev,
            ...data,
            clinic: { ...prev.clinic, ...(data.clinic || {}) },
          }));
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  async function save() {
    setSaving(true);
    setBanner(null);
    try {
      const { _id, __v, createdAt, updatedAt, ...payload } = form;
      await API.put('/settings/prescription', payload);
      setBanner({ ok: true, msg: 'Prescription settings saved.' });
    } catch (err) {
      setBanner({ ok: false, msg: err.response?.data?.message || err.message });
    } finally {
      setSaving(false);
    }
  }

  function setClinic(field, val) {
    setForm(f => ({ ...f, clinic: { ...f.clinic, [field]: val } }));
  }
  function setAddressLine(idx, val) {
    const lines = [...(form.clinic.addressLines || ['', ''])];
    lines[idx] = val;
    setForm(f => ({ ...f, clinic: { ...f.clinic, addressLines: lines } }));
  }

  if (loading) return <div className="text-center py-12 text-slate-500">Loading…</div>;

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg p-6 max-w-2xl space-y-8">
      <h2 className="text-2xl font-bold text-slate-800 dark:text-white">Prescription Settings</h2>

      {/* Clinic / Branding */}
      <section className="space-y-4">
        <h3 className="text-sm font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wide border-b border-slate-100 dark:border-slate-700 pb-1">
          Clinic / Branding
        </h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Clinic Name</label>
            <input type="text" value={form.clinic.name} onChange={e => setClinic('name', e.target.value)} placeholder="City Dental Clinic" className={inputCls} />
          </div>
          <div className="col-span-2">
            <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Tagline (optional)</label>
            <input type="text" value={form.clinic.tagline} onChange={e => setClinic('tagline', e.target.value)} placeholder="Your smile is our priority" className={inputCls} />
          </div>
          <div className="col-span-2">
            <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Address Line 1</label>
            <input type="text" value={(form.clinic.addressLines || [])[0] || ''} onChange={e => setAddressLine(0, e.target.value)} placeholder="123, Main Street" className={inputCls} />
          </div>
          <div className="col-span-2">
            <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Address Line 2</label>
            <input type="text" value={(form.clinic.addressLines || [])[1] || ''} onChange={e => setAddressLine(1, e.target.value)} placeholder="Mumbai, Maharashtra 400001" className={inputCls} />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Phone</label>
            <input type="text" value={form.clinic.phone} onChange={e => setClinic('phone', e.target.value)} placeholder="+91 98765 43210" className={inputCls} />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Email</label>
            <input type="email" value={form.clinic.email} onChange={e => setClinic('email', e.target.value)} placeholder="clinic@example.com" className={inputCls} />
          </div>
          <div className="col-span-2">
            <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Logo URL (optional)</label>
            <input type="url" value={form.clinic.logoUrl} onChange={e => setClinic('logoUrl', e.target.value)} placeholder="https://…/logo.png" className={inputCls} />
          </div>
        </div>
      </section>

      {/* Footer */}
      <section className="space-y-4">
        <h3 className="text-sm font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wide border-b border-slate-100 dark:border-slate-700 pb-1">
          Footer
        </h3>
        <div>
          <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Footer Text</label>
          <textarea rows={2} value={form.footerText} onChange={e => setForm(f => ({ ...f, footerText: e.target.value }))} placeholder="This prescription is valid for 7 days." className={`${inputCls} resize-none`} />
        </div>
      </section>

      <div className="flex items-center gap-4 pt-2">
        <button onClick={save} disabled={saving} className="px-6 py-2.5 bg-[#137fec] hover:bg-blue-600 text-white font-semibold rounded-xl text-sm transition-colors disabled:opacity-60">
          {saving ? 'Saving…' : 'Save Prescription Settings'}
        </button>
        {banner && (
          <p className={`text-sm font-medium flex items-center gap-1.5 ${banner.ok ? 'text-green-600' : 'text-red-600'}`}>
            {banner.ok ? <CheckCircle size={15} /> : <XCircle size={15} />}
            {banner.msg}
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Inventory Tab ────────────────────────────────────────────────────────────

function ToggleSwitch({ enabled, onChange, disabled }) {
  return (
    <button
      type="button"
      onClick={() => !disabled && onChange(!enabled)}
      disabled={disabled}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
        enabled ? 'bg-[#137fec]' : 'bg-slate-300 dark:bg-slate-600'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
          enabled ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );
}

function MedicineFormModal({ medicine, onClose, onSave }) {
  const [form, setForm] = useState({
    name: medicine?.name || '',
    composition: medicine?.composition || '',
    manufacturer: medicine?.manufacturer || '',
    category: medicine?.category || '',
  });
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      if (medicine?._id) {
        await API.put(`/inventory/${medicine._id}`, form);
      } else {
        await API.post('/inventory', { ...form, type: 'Pharmacy' });
      }
      onSave();
      onClose();
    } catch (err) {
      alert('Failed to save: ' + (err.response?.data?.error || err.message));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
          <h3 className="font-bold text-lg text-slate-800 dark:text-white">
            {medicine?._id ? 'Edit Medicine' : 'Add Medicine'}
          </h3>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700">
            <X size={20} />
          </button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase">Name <span className="text-red-500">*</span></label>
            <input
              required
              autoFocus
              type="text"
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              className="w-full mt-1 px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-[#137fec] outline-none bg-white dark:bg-slate-800"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase">Composition</label>
            <input
              type="text"
              value={form.composition}
              onChange={e => setForm({ ...form, composition: e.target.value })}
              className="w-full mt-1 px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-[#137fec] outline-none bg-white dark:bg-slate-800"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase">Manufacturer</label>
              <input
                type="text"
                value={form.manufacturer}
                onChange={e => setForm({ ...form, manufacturer: e.target.value })}
                className="w-full mt-1 px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-[#137fec] outline-none bg-white dark:bg-slate-800"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase">Category</label>
              <input
                type="text"
                value={form.category}
                onChange={e => setForm({ ...form, category: e.target.value })}
                placeholder="e.g. Antibiotic"
                className="w-full mt-1 px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-[#137fec] outline-none bg-white dark:bg-slate-800"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800">Cancel</button>
            <button type="submit" disabled={saving} className="px-5 py-2 rounded-lg bg-[#137fec] text-white text-sm font-bold hover:bg-blue-600 disabled:opacity-60">
              {saving ? 'Saving…' : medicine?._id ? 'Update' : 'Add Medicine'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function BulkUploadModal({ onClose, onSuccess }) {
  const [sheetUrl, setSheetUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    if (!sheetUrl.trim()) return;
    setUploading(true);
    setError('');
    setResult(null);
    try {
      const res = await API.post('/inventory/bulk-upload-medicines', { sheetUrl: sheetUrl.trim() });
      setResult(res.data);
      onSuccess();
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <FileSpreadsheet size={20} className="text-green-600" />
            <h3 className="font-bold text-lg text-slate-800 dark:text-white">Bulk Upload via Google Sheets</h3>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700">
            <X size={20} />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 text-sm">
            <p className="font-semibold text-slate-800 dark:text-slate-100 mb-2">How to use:</p>
            <ol className="list-decimal pl-5 space-y-1 text-slate-700 dark:text-slate-300">
              <li>Create a Google Sheet with these column headers in row 1:
                <div className="mt-1 font-mono text-xs bg-white dark:bg-slate-800 px-2 py-1 rounded border border-slate-200 dark:border-slate-700">
                  name | composition | manufacturer | category
                </div>
                <span className="text-xs text-slate-500">Only <b>name</b> is required.</span>
              </li>
              <li>Click <b>Share → General access</b> → set to <b>"Anyone with the link"</b> (Viewer).</li>
              <li>Copy the URL and paste it below.</li>
            </ol>
            <a
              href="https://docs.google.com/spreadsheets/create"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 mt-3 text-[#137fec] font-semibold text-xs hover:underline"
            >
              <ExternalLink size={12} /> Create a new Google Sheet
            </a>
          </div>

          {!result && (
            <form onSubmit={submit}>
              <label className="text-xs font-bold text-slate-500 uppercase">Google Sheets URL</label>
              <input
                autoFocus
                required
                type="url"
                value={sheetUrl}
                onChange={e => setSheetUrl(e.target.value)}
                placeholder="https://docs.google.com/spreadsheets/d/..."
                className="w-full mt-1 px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-[#137fec] outline-none bg-white dark:bg-slate-800"
              />
              {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
              <div className="flex justify-end gap-2 pt-4">
                <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800">Cancel</button>
                <button type="submit" disabled={uploading} className="px-5 py-2 rounded-lg bg-[#137fec] text-white text-sm font-bold hover:bg-blue-600 disabled:opacity-60 flex items-center gap-2">
                  {uploading ? <><Loader2 size={14} className="animate-spin" /> Importing…</> : <><Upload size={14} /> Import</>}
                </button>
              </div>
            </form>
          )}

          {result && (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-green-700">{result.inserted}</p>
                  <p className="text-xs text-slate-500 uppercase">Imported</p>
                </div>
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-amber-700">{result.skipped}</p>
                  <p className="text-xs text-slate-500 uppercase">Errors</p>
                </div>
                <div className="bg-slate-50 dark:bg-slate-800 border border-slate-200 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-slate-700 dark:text-slate-300">{result.total}</p>
                  <p className="text-xs text-slate-500 uppercase">Total Rows</p>
                </div>
              </div>
              {result.errors?.length > 0 && (
                <div>
                  <p className="text-xs text-slate-500 mb-1.5">
                    {result.errors.length} row{result.errors.length !== 1 ? 's' : ''} skipped — row numbers match your sheet (header is row 1):
                  </p>
                  <div className="border border-amber-200 rounded-lg overflow-hidden max-h-56 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-amber-50 sticky top-0">
                        <tr>
                          <th className="px-3 py-2 text-left font-semibold text-slate-600">Row</th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-600">Column</th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-600">Value</th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-600">Why it failed</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-amber-100">
                        {result.errors.map((e, i) => (
                          <tr key={i}>
                            <td className="px-3 py-1.5 font-mono text-slate-700">{e.row}</td>
                            <td className="px-3 py-1.5 text-slate-600">{e.column || '—'}</td>
                            <td className="px-3 py-1.5 text-slate-500 max-w-[160px] truncate" title={e.value}>{e.value || <span className="italic text-slate-400">(empty)</span>}</td>
                            <td className="px-3 py-1.5 text-red-600">{e.error}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              <div className="flex justify-end pt-2">
                <button onClick={onClose} className="px-5 py-2 rounded-lg bg-[#137fec] text-white text-sm font-bold hover:bg-blue-600">
                  Done
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function InventoryTab() {
  const { inventorySettings, refreshInventorySettings } = useInventorySettings();
  const [savingToggle, setSavingToggle] = useState(false);
  const [medicines, setMedicines] = useState([]);
  const [loadingMeds, setLoadingMeds] = useState(false);
  const [search, setSearch] = useState('');
  const [editingMedicine, setEditingMedicine] = useState(null); // null | {} | object
  const [showBulkModal, setShowBulkModal] = useState(false);

  const updateToggle = async (key, value) => {
    setSavingToggle(true);
    try {
      await API.put('/inventory/settings', { [key]: value });
      await refreshInventorySettings();
    } catch (err) {
      alert('Failed to save: ' + (err.response?.data?.error || err.message));
    } finally {
      setSavingToggle(false);
    }
  };

  const fetchMedicines = async () => {
    setLoadingMeds(true);
    try {
      const res = await API.get('/inventory');
      setMedicines((res.data || []).filter(i => i.type === 'Pharmacy'));
    } catch (err) {
      console.error('Failed to load medicines', err);
    } finally {
      setLoadingMeds(false);
    }
  };

  useEffect(() => {
    if (!inventorySettings.medicineEnabled) fetchMedicines();
  }, [inventorySettings.medicineEnabled]);

  const handleDelete = async (id) => {
    if (!confirm('Delete this medicine?')) return;
    try {
      await API.delete(`/inventory/${id}`);
      fetchMedicines();
    } catch (err) {
      alert('Failed to delete: ' + (err.response?.data?.error || err.message));
    }
  };

  const filteredMedicines = medicines.filter(m =>
    !search || `${m.name} ${m.composition || ''} ${m.manufacturer || ''} ${m.category || ''}`
      .toLowerCase()
      .includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Toggles */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg p-6">
        <h2 className="text-2xl font-bold text-slate-800 dark:text-white mb-1">Inventory Modules</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
          Disable modules you don't track. Disabling Medicine Inventory hides stock tracking and
          invoice charges, but the medicine list below is still used for prescriptions.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex items-center justify-between p-4 border border-slate-200 dark:border-slate-700 rounded-xl">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-50 dark:bg-blue-900/30 rounded-lg">
                <Pill size={20} className="text-[#137fec]" />
              </div>
              <div>
                <p className="font-bold text-slate-800 dark:text-white">Medicine Inventory</p>
                <p className="text-xs text-slate-500">Track pharmacy stock & charge in invoices</p>
              </div>
            </div>
            <ToggleSwitch
              enabled={inventorySettings.medicineEnabled}
              onChange={(v) => updateToggle('medicineEnabled', v)}
              disabled={savingToggle}
            />
          </div>
          <div className="flex items-center justify-between p-4 border border-slate-200 dark:border-slate-700 rounded-xl">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-orange-50 dark:bg-orange-900/30 rounded-lg">
                <FileSpreadsheet size={20} className="text-orange-500" />
              </div>
              <div>
                <p className="font-bold text-slate-800 dark:text-white">Consumable Inventory</p>
                <p className="text-xs text-slate-500">Track consumables used per treatment</p>
              </div>
            </div>
            <ToggleSwitch
              enabled={inventorySettings.consumableEnabled}
              onChange={(v) => updateToggle('consumableEnabled', v)}
              disabled={savingToggle}
            />
          </div>
        </div>
      </div>

      {/* Medicine List — only visible when Medicine Inventory is OFF */}
      {!inventorySettings.medicineEnabled && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg p-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-6">
            <div>
              <h2 className="text-2xl font-bold text-slate-800 dark:text-white">Medicine List</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Used for prescriptions in the Treatment page. ({medicines.length} medicines)
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowBulkModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-bold shadow-md"
              >
                <FileSpreadsheet size={16} /> Bulk Upload
              </button>
              <button
                onClick={() => setEditingMedicine({})}
                className="flex items-center gap-2 px-4 py-2 bg-[#137fec] hover:bg-blue-600 text-white rounded-lg text-sm font-bold shadow-md"
              >
                <Plus size={16} /> Add Medicine
              </button>
            </div>
          </div>

          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, composition, manufacturer or category…"
            className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-[#137fec] outline-none bg-white dark:bg-slate-800 mb-4"
          />

          {loadingMeds ? (
            <div className="flex justify-center py-8"><Loader2 className="animate-spin text-[#137fec]" /></div>
          ) : filteredMedicines.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              {medicines.length === 0 ? 'No medicines yet. Add one or bulk-upload via Google Sheets.' : 'No medicines match your search.'}
            </div>
          ) : (
            <div className="overflow-x-auto border border-slate-200 dark:border-slate-700 rounded-xl">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-900 text-xs text-slate-500 uppercase">
                  <tr>
                    <th className="px-4 py-3 text-left">Name</th>
                    <th className="px-4 py-3 text-left">Composition</th>
                    <th className="px-4 py-3 text-left">Manufacturer</th>
                    <th className="px-4 py-3 text-left">Category</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredMedicines.map(m => (
                    <tr key={m._id} className="hover:bg-slate-50 dark:hover:bg-slate-900/50">
                      <td className="px-4 py-3 font-semibold text-slate-800 dark:text-white">{m.name}</td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{m.composition || '—'}</td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{m.manufacturer || '—'}</td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{m.category || '—'}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-1">
                          <button onClick={() => setEditingMedicine(m)} className="p-1.5 rounded-md hover:bg-blue-50 text-slate-400 hover:text-[#137fec]">
                            <Edit2 size={15} />
                          </button>
                          <button onClick={() => handleDelete(m._id)} className="p-1.5 rounded-md hover:bg-red-50 text-slate-400 hover:text-red-600">
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {editingMedicine && (
        <MedicineFormModal
          medicine={editingMedicine}
          onClose={() => setEditingMedicine(null)}
          onSave={fetchMedicines}
        />
      )}
      {showBulkModal && (
        <BulkUploadModal
          onClose={() => setShowBulkModal(false)}
          onSuccess={fetchMedicines}
        />
      )}
    </div>
  );
}

// ─── Email Tab ────────────────────────────────────────────────────────────────

const EVENT_LABELS = {
  appointmentBooked:    'Appointment Booked',
  appointmentCompleted: 'Appointment Completed',
};

const COMPLETION_DOCS = [
  { key: 'smartReport',  label: 'Smart Report',  sub: 'Treatments, notes & visit summary PDF' },
  { key: 'prescription', label: 'Prescription',  sub: 'Medication list from the visit' },
  { key: 'invoice',      label: 'Invoice',        sub: 'Latest invoice for this patient' },
  { key: 'aiReport',     label: 'AI Report',      sub: 'Most recent AI-generated clinical report' },
];

const LANG_LABELS = { en: 'English', hi: 'Hindi', mr: 'Marathi' };

function EmailTab() {
  const [emailSubTab, setEmailSubTab] = useState('connection');

  // Settings state
  const [settings, setSettings] = useState(null);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [smtpForm, setSmtpForm] = useState({
    mode: 'gmail', enabled: false, automationEnabled: false,
    fromName: '', fromEmail: '', replyTo: '',
    smtp: { host: 'smtp.gmail.com', port: 465, secure: true, user: '', password: '' },
    events: {
      aiReportReady:     { enabled: false, delayMinutes: 0 },
      appointmentBooked: { enabled: false, delayMinutes: 0 },
      invoiceGenerated:  { enabled: false, delayMinutes: 0 },
    },
  });
  const [testEmail, setTestEmail] = useState('');
  const [testStatus, setTestStatus] = useState(null); // null | 'sending' | 'ok' | 'fail'
  const [testError, setTestError] = useState('');
  const [saveBanner, setSaveBanner] = useState(null); // null | { ok, msg }
  const [showGuide, setShowGuide] = useState(false);

  // Templates state
  const [templates, setTemplates] = useState([]);
  const [templateModal, setTemplateModal] = useState(null); // null | template obj | 'new'
  const [templatesLoading, setTemplatesLoading] = useState(false);

  // Logs state
  const [logs, setLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsFilter, setLogsFilter] = useState({ event: '', status: '' });
  const [expandedLog, setExpandedLog] = useState(null);

  useEffect(() => {
    fetchSettings();
  }, []);

  useEffect(() => {
    if (emailSubTab === 'templates') fetchTemplates();
    if (emailSubTab === 'logs') fetchLogs();
  }, [emailSubTab]);

  async function fetchSettings() {
    try {
      const res = await API.get('/email/settings');
      setSettings(res.data);
      setSmtpForm({
        mode:             res.data.mode || 'gmail',
        enabled:          res.data.enabled || false,
        automationEnabled: res.data.automationEnabled || false,
        fromName:         res.data.fromName || '',
        fromEmail:        res.data.fromEmail || '',
        replyTo:          res.data.replyTo || '',
        smtp: {
          host:     res.data.smtp?.host || 'smtp.gmail.com',
          port:     res.data.smtp?.port || 465,
          secure:   res.data.smtp?.secure !== false,
          user:     res.data.smtp?.user || '',
          password: '', // never pre-fill password
        },
        events: res.data.events || {
          aiReportReady:     { enabled: false, delayMinutes: 0 },
          appointmentBooked: { enabled: false, delayMinutes: 0 },
          invoiceGenerated:  { enabled: false, delayMinutes: 0 },
        },
      });
    } catch (err) {
      console.error('Failed to load email settings:', err);
    }
  }

  async function saveSettings() {
    setSettingsSaving(true);
    setSaveBanner(null);
    try {
      await API.put('/email/settings', smtpForm);
      await fetchSettings();
      setSaveBanner({ ok: true, msg: 'Settings saved successfully.' });
    } catch (err) {
      const raw = err.response?.data?.error || err.message || 'Unknown error';
      const hint = raw.includes('ECONNREFUSED')
        ? `${raw} — Check that your SMTP host and port are correct.`
        : raw.includes('535') || raw.includes('Invalid login')
        ? `${raw} — Authentication failed. For Gmail, use an App Password (not your account password).`
        : raw.includes('ETIMEDOUT')
        ? `${raw} — Connection timed out. Check your SMTP host, port, and firewall.`
        : raw;
      setSaveBanner({ ok: false, msg: hint });
    } finally {
      setSettingsSaving(false);
    }
  }

  async function sendTestEmail() {
    if (!testEmail.trim()) return;
    setTestStatus('sending');
    setTestError('');
    try {
      await API.post('/email/test', { to: testEmail.trim() });
      setTestStatus('ok');
    } catch (err) {
      setTestStatus('fail');
      setTestError(err.response?.data?.error || err.message);
    }
  }

  function handleModeSwitch(mode) {
    setSmtpForm(f => ({
      ...f,
      mode,
      smtp: {
        ...f.smtp,
        host:   mode === 'gmail' ? 'smtp.gmail.com' : '',
        port:   mode === 'gmail' ? 465 : 587,
        secure: mode === 'gmail',
      },
    }));
  }

  async function fetchTemplates() {
    setTemplatesLoading(true);
    try {
      const res = await API.get('/email/templates');
      setTemplates(res.data);
    } catch (err) {
      console.error('Failed to load email templates:', err);
    } finally {
      setTemplatesLoading(false);
    }
  }

  async function handleSaveTemplate(form, id) {
    if (id) {
      await API.put(`/email/templates/${id}`, form);
    } else {
      await API.post('/email/templates', form);
    }
    await fetchTemplates();
  }

  async function handleDeleteTemplate(id) {
    if (!window.confirm('Delete this template?')) return;
    await API.delete(`/email/templates/${id}`);
    setTemplates(ts => ts.filter(t => t._id !== id));
  }

  async function fetchLogs() {
    setLogsLoading(true);
    try {
      const params = {};
      if (logsFilter.event)  params.event  = logsFilter.event;
      if (logsFilter.status) params.status = logsFilter.status;
      const res = await API.get('/email/logs', { params });
      setLogs(res.data);
    } catch (err) {
      console.error('Failed to load email logs:', err);
    } finally {
      setLogsLoading(false);
    }
  }

  const inputCls = 'w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-800 focus:ring-2 focus:ring-[#137fec] outline-none';

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg p-4 sm:p-6">
      <h2 className="text-lg sm:text-2xl font-bold text-slate-800 dark:text-white mb-5 sm:mb-6 flex items-center gap-2">
        <Mail size={20} /> Email
      </h2>

      {/* Sub-tabs — scrollable on mobile */}
      <div className="flex gap-0 mb-6 border-b border-slate-200 dark:border-slate-700 overflow-x-auto scrollbar-none -mx-4 px-4 sm:mx-0 sm:px-0">
        {['connection', 'automation', 'templates', 'logs'].map(t => (
          <button
            key={t}
            onClick={() => setEmailSubTab(t)}
            className={`flex-shrink-0 px-3 sm:px-4 py-2.5 text-sm font-semibold capitalize transition-all whitespace-nowrap ${
              emailSubTab === t
                ? 'text-[#137fec] border-b-2 border-[#137fec]'
                : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* ── Connection ── */}
      {emailSubTab === 'connection' && (
        <div className="max-w-lg space-y-5">
          {/* Mode toggle */}
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase block mb-2">Mode</label>
            <div className="flex rounded-xl overflow-hidden border border-slate-300 dark:border-slate-700 w-fit">
              {['gmail', 'custom'].map(m => (
                <button
                  key={m}
                  onClick={() => handleModeSwitch(m)}
                  className={`px-5 py-2 text-sm font-semibold capitalize transition-colors ${
                    smtpForm.mode === m
                      ? 'bg-[#137fec] text-white'
                      : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50'
                  }`}
                >
                  {m === 'gmail' ? 'Gmail' : 'Custom SMTP'}
                </button>
              ))}
            </div>
            {smtpForm.mode === 'gmail' && (
              <div className="mt-3 rounded-xl border border-blue-200 bg-blue-50 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowGuide(g => !g)}
                  className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-blue-100 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-lg">📖</span>
                    <div>
                      <p className="text-sm font-bold text-blue-800">How to connect Gmail — Step by step</p>
                      <p className="text-xs text-blue-600">Gmail blocks regular passwords — you need a special App Password</p>
                    </div>
                  </div>
                  <span className="text-blue-500 font-bold text-lg leading-none">{showGuide ? '▲' : '▼'}</span>
                </button>
                {showGuide && (
                  <div className="border-t border-blue-200 px-4 py-5 space-y-4 text-sm text-slate-700 bg-white">

                    <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800">
                      <strong>Why App Password?</strong> Google blocks sign-ins from apps using your regular Gmail password as a security measure. An App Password is a special 16-character code generated only for this app — it cannot be used to log into your Google account.
                    </div>

                    <ol className="space-y-4">
                      <li className="flex gap-3">
                        <span className="flex-shrink-0 w-7 h-7 rounded-full bg-[#137fec] text-white text-xs font-bold flex items-center justify-center">1</span>
                        <div>
                          <p className="font-semibold">Open your Google Account</p>
                          <p className="text-xs text-slate-500 mt-0.5">In any browser, go to <span className="font-mono bg-slate-100 px-1 rounded border border-slate-200">myaccount.google.com</span> and sign in with the Gmail account you want to send emails from.</p>
                        </div>
                      </li>
                      <li className="flex gap-3">
                        <span className="flex-shrink-0 w-7 h-7 rounded-full bg-[#137fec] text-white text-xs font-bold flex items-center justify-center">2</span>
                        <div>
                          <p className="font-semibold">Go to Security settings</p>
                          <p className="text-xs text-slate-500 mt-0.5">In the left sidebar click <strong>Security</strong>. Scroll down to the section titled <strong>"How you sign in to Google"</strong>.</p>
                        </div>
                      </li>
                      <li className="flex gap-3">
                        <span className="flex-shrink-0 w-7 h-7 rounded-full bg-[#137fec] text-white text-xs font-bold flex items-center justify-center">3</span>
                        <div>
                          <p className="font-semibold">Enable 2-Step Verification</p>
                          <p className="text-xs text-slate-500 mt-0.5">Click <strong>2-Step Verification</strong> and follow the steps to turn it on. You can use SMS or the Google Authenticator app. <span className="text-red-500 font-medium">This step is mandatory</span> — App Passwords are hidden until 2-Step Verification is active.</p>
                        </div>
                      </li>
                      <li className="flex gap-3">
                        <span className="flex-shrink-0 w-7 h-7 rounded-full bg-[#137fec] text-white text-xs font-bold flex items-center justify-center">4</span>
                        <div>
                          <p className="font-semibold">Find App Passwords</p>
                          <p className="text-xs text-slate-500 mt-0.5">Go back to <span className="font-mono bg-slate-100 px-1 rounded border border-slate-200">myaccount.google.com</span>, click the <strong>search bar at the top</strong> of the page and type <strong>"App Passwords"</strong>. Click the result that appears.</p>
                        </div>
                      </li>
                      <li className="flex gap-3">
                        <span className="flex-shrink-0 w-7 h-7 rounded-full bg-[#137fec] text-white text-xs font-bold flex items-center justify-center">5</span>
                        <div>
                          <p className="font-semibold">Generate a new App Password</p>
                          <p className="text-xs text-slate-500 mt-0.5">In the <strong>"App name"</strong> field type <strong>Dental DMS</strong> and click <strong>Create</strong>. Google will show you a 16-character password like <span className="font-mono bg-slate-100 px-1 rounded border border-slate-200">abcd efgh ijkl mnop</span>.</p>
                        </div>
                      </li>
                      <li className="flex gap-3">
                        <span className="flex-shrink-0 w-7 h-7 rounded-full bg-[#137fec] text-white text-xs font-bold flex items-center justify-center">6</span>
                        <div>
                          <p className="font-semibold">Fill in the fields below</p>
                          <p className="text-xs text-slate-500 mt-0.5">
                            <strong>Email / SMTP Username</strong> = your full Gmail address (e.g. <span className="font-mono">clinic@gmail.com</span>)<br/>
                            <strong>App Password</strong> = the 16-character code (spaces don't matter, copy it as-is)<br/>
                            <strong>From Name</strong> = what patients will see as the sender (e.g. "City Dental Clinic")<br/>
                            Host, Port and TLS are pre-filled correctly — do not change them.
                          </p>
                        </div>
                      </li>
                      <li className="flex gap-3">
                        <span className="flex-shrink-0 w-7 h-7 rounded-full bg-[#137fec] text-white text-xs font-bold flex items-center justify-center">7</span>
                        <div>
                          <p className="font-semibold">Turn on "Enable Email Delivery" and save</p>
                          <p className="text-xs text-slate-500 mt-0.5">Toggle <strong>Enable Email Delivery</strong> to ON — this is the master switch that allows the system to actually send emails. Then click <strong>Save Settings</strong>.</p>
                        </div>
                      </li>
                      <li className="flex gap-3">
                        <span className="flex-shrink-0 w-7 h-7 rounded-full bg-[#137fec] text-white text-xs font-bold flex items-center justify-center">8</span>
                        <div>
                          <p className="font-semibold">Verify with a test email</p>
                          <p className="text-xs text-slate-500 mt-0.5">Scroll down to <strong>Send a Test Email</strong>, enter your own email address and click <strong>Send Test</strong>. If it arrives in your inbox, you're all set. If it fails, the error message will tell you exactly what's wrong.</p>
                        </div>
                      </li>
                      <li className="flex gap-3">
                        <span className="flex-shrink-0 w-7 h-7 rounded-full bg-[#137fec] text-white text-xs font-bold flex items-center justify-center">9</span>
                        <div>
                          <p className="font-semibold">Set up automatic emails (optional)</p>
                          <p className="text-xs text-slate-500 mt-0.5">Once the test passes, go to the <strong>Automation</strong> tab (next to Connection at the top) to configure which emails are sent automatically — e.g. when an invoice is generated or an AI report is ready.</p>
                        </div>
                      </li>
                    </ol>

                    <div className="bg-slate-50 rounded-lg px-3 py-2 text-xs text-slate-500 border border-slate-200 space-y-0.5">
                      <p><strong>Host:</strong> smtp.gmail.com &nbsp;·&nbsp; <strong>Port:</strong> 465 &nbsp;·&nbsp; <strong>TLS:</strong> On (pre-filled, do not change)</p>
                      <p><strong>Tip:</strong> Check your Spam folder if the test email doesn't arrive in inbox.</p>
                    </div>
                  </div>
                )}
              </div>
            )}
            {smtpForm.mode === 'custom' && (
              <div className="mt-3 bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-600 space-y-1">
                <p className="font-bold text-slate-700 mb-1">Common SMTP settings</p>
                <p><strong>Outlook / Office 365:</strong> smtp.office365.com · Port 587 · TLS off</p>
                <p><strong>Yahoo Mail:</strong> smtp.mail.yahoo.com · Port 465 · TLS on</p>
                <p><strong>Zoho Mail:</strong> smtp.zoho.in · Port 465 · TLS on</p>
                <p><strong>SendGrid:</strong> smtp.sendgrid.net · Port 587 · user = apikey</p>
              </div>
            )}
          </div>

          {/* Enable toggle */}
          <div className="flex items-start gap-3 p-4 bg-slate-50 border border-slate-200 rounded-xl">
            <div
              onClick={() => setSmtpForm(f => ({ ...f, enabled: !f.enabled }))}
              className={`mt-0.5 flex-shrink-0 w-10 h-5 rounded-full relative transition-colors cursor-pointer ${smtpForm.enabled ? 'bg-[#137fec]' : 'bg-slate-300 dark:bg-slate-600'}`}
            >
              <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${smtpForm.enabled ? 'left-5' : 'left-0.5'}`} />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-700">Enable Email Delivery</p>
              <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                This is the master on/off switch for all emails sent by the system. When <strong>ON</strong>, the system can send treatment summaries, invoices and AI reports to patients. When <strong>OFF</strong>, no emails are sent even if your SMTP credentials are saved — useful if you want to configure first and enable later, or temporarily pause emails without losing your settings.
              </p>
            </div>
          </div>

          {/* SMTP fields */}
          {smtpForm.mode === 'custom' && (
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="text-xs font-bold text-slate-500 uppercase block mb-1">SMTP Host</label>
                <input type="text" value={smtpForm.smtp.host} onChange={e => setSmtpForm(f => ({ ...f, smtp: { ...f.smtp, host: e.target.value } }))} placeholder="smtp.example.com" className={inputCls} />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Port</label>
                <input type="number" value={smtpForm.smtp.port} onChange={e => setSmtpForm(f => ({ ...f, smtp: { ...f.smtp, port: Number(e.target.value) } }))} className={inputCls} />
              </div>
              <div className="flex items-end">
                <label className="flex items-center gap-2 cursor-pointer pb-1">
                  <input type="checkbox" checked={smtpForm.smtp.secure} onChange={e => setSmtpForm(f => ({ ...f, smtp: { ...f.smtp, secure: e.target.checked } }))} className="w-4 h-4" />
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">TLS (port 465)</span>
                </label>
              </div>
            </div>
          )}

          <div>
            <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Email / SMTP Username</label>
            <input type="email" value={smtpForm.smtp.user} onChange={e => setSmtpForm(f => ({ ...f, smtp: { ...f.smtp, user: e.target.value } }))} placeholder="you@gmail.com" className={inputCls} />
          </div>

          <div>
            <label className="text-xs font-bold text-slate-500 uppercase block mb-1">
              {smtpForm.mode === 'gmail' ? 'App Password' : 'SMTP Password'}
            </label>
            <input type="password" value={smtpForm.smtp.password} onChange={e => setSmtpForm(f => ({ ...f, smtp: { ...f.smtp, password: e.target.value } }))} placeholder={settings?.smtp?.user ? '••••••••  (leave blank to keep existing)' : 'Password'} className={inputCls} />
          </div>

          <div className="grid grid-cols-1 xs:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase block mb-1">From Name</label>
              <input type="text" value={smtpForm.fromName} onChange={e => setSmtpForm(f => ({ ...f, fromName: e.target.value }))} placeholder="Dr. Name" className={inputCls} />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase block mb-1">From Email</label>
              <input type="email" value={smtpForm.fromEmail} onChange={e => setSmtpForm(f => ({ ...f, fromEmail: e.target.value }))} placeholder="clinic@example.com" className={inputCls} />
            </div>
            <div className="xs:col-span-2">
              <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Reply-To (optional)</label>
              <input type="email" value={smtpForm.replyTo} onChange={e => setSmtpForm(f => ({ ...f, replyTo: e.target.value }))} placeholder="replies@example.com" className={inputCls} />
            </div>
          </div>

          <button onClick={saveSettings} disabled={settingsSaving} className="px-6 py-2.5 bg-[#137fec] hover:bg-blue-600 text-white font-semibold rounded-xl text-sm transition-colors disabled:opacity-60">
            {settingsSaving ? 'Saving...' : 'Save Settings'}
          </button>

          {saveBanner && (
            <div className={`flex items-start gap-2 p-3 rounded-xl text-sm ${
              saveBanner.ok
                ? 'bg-green-50 text-green-700 border border-green-100'
                : 'bg-red-50 text-red-700 border border-red-100'
            }`}>
              {saveBanner.ok
                ? <CheckCircle size={14} className="mt-0.5 flex-shrink-0" />
                : <XCircle    size={14} className="mt-0.5 flex-shrink-0" />}
              {saveBanner.msg}
            </div>
          )}

          {/* Test send */}
          <div className="border-t border-slate-200 dark:border-slate-700 pt-5 space-y-3">
            <div>
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">Verify with a Test Email</p>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">After saving your settings, send a test email to confirm everything is working. Enter your own email address below and click <strong>Send Test</strong>. If it arrives in your inbox your setup is complete. Check your <strong>Spam folder</strong> if you don't see it within a minute. If it fails, the error message will tell you exactly what to fix.</p>
            </div>
            <div className="flex flex-col xs:flex-row gap-2">
              <input type="email" value={testEmail} onChange={e => setTestEmail(e.target.value)} placeholder="your@email.com" className={`${inputCls} flex-1`} />
              <button onClick={sendTestEmail} disabled={testStatus === 'sending'} className="px-4 py-2 bg-slate-700 hover:bg-slate-800 text-white font-semibold rounded-lg text-sm transition-colors disabled:opacity-60 whitespace-nowrap">
                {testStatus === 'sending' ? 'Sending…' : 'Send Test'}
              </button>
            </div>
            {testStatus === 'ok' && <p className="mt-1 text-sm text-green-600 flex items-center gap-1"><CheckCircle size={14} /> Test email sent successfully — check your inbox.</p>}
            {testStatus === 'fail' && <p className="mt-1 text-sm text-red-600 flex items-center gap-1"><XCircle size={14} /> {testError}</p>}
          </div>
        </div>
      )}

      {/* ── Automation ── */}
      {emailSubTab === 'automation' && (
        <div className="max-w-lg space-y-6">

          {/* Explainer guide */}
          <div className="rounded-xl border border-green-200 bg-green-50 p-4 space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-lg">⚡</span>
              <p className="text-sm font-bold text-green-800">What is Automation?</p>
            </div>
            <p className="text-xs text-green-700 leading-relaxed">
              Automation lets the system send emails to patients <strong>automatically</strong> — without you having to click anything. For example, the moment an invoice is created, the patient gets a copy by email. Or when an AI Report is generated, it is emailed directly to the patient.
            </p>
            <div className="bg-white border border-green-100 rounded-lg p-3 text-xs text-slate-600 space-y-1.5 leading-relaxed">
              <p><strong>Prerequisites before using Automation:</strong></p>
              <p>✅ Gmail (or SMTP) must be connected and tested in the <strong>Connection</strong> tab</p>
              <p>✅ <strong>Enable Email Delivery</strong> must be turned ON in the Connection tab</p>
              <p>✅ The <strong>Automation Master Switch</strong> below must be turned ON</p>
              <p>✅ Each individual event (Invoice, AI Report, etc.) must also be turned ON</p>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">
              If Automation is <strong>OFF</strong>, emails are not sent automatically — the doctor can still send them manually using the <strong>Send Mail</strong> button on the Treatment page.
            </p>
          </div>

          {/* Master toggles */}
          <div className="p-4 bg-slate-50 dark:bg-slate-700 rounded-xl space-y-3">
            <div className="flex items-start gap-3">
              <div onClick={() => setSmtpForm(f => ({ ...f, automationEnabled: !f.automationEnabled }))} className={`mt-0.5 flex-shrink-0 w-10 h-5 rounded-full relative transition-colors cursor-pointer ${smtpForm.automationEnabled ? 'bg-[#137fec]' : 'bg-slate-300 dark:bg-slate-600'}`}>
                <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${smtpForm.automationEnabled ? 'left-5' : 'left-0.5'}`} />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">Automation Master Switch</p>
                <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">The global on/off for all automatic emails. Individual event switches below only work when this is ON. Turn this OFF to pause all automated emails instantly without losing your per-event settings.</p>
              </div>
            </div>
          </div>

          {/* Per-event explainer */}
          <div className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-xl p-3 leading-relaxed space-y-1">
            <p className="font-semibold text-slate-600">Per-event settings</p>
            <p><strong>Toggle</strong> — Turn individual events on or off. For example, you may want to auto-send invoices but not AI reports.</p>
            <p><strong>Delay (minutes)</strong> — How many minutes after the event to wait before sending. Set to 0 to send immediately. Useful if you want to review before the email goes out.</p>
          </div>

          {/* Per-event toggles */}
          <div className="space-y-4">
            {Object.keys(EVENT_LABELS).map(event => (
              <div key={event} className="p-4 border border-slate-200 dark:border-slate-700 rounded-xl space-y-3">
                {/* Header row */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">{EVENT_LABELS[event]}</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {event === 'appointmentBooked'    && 'Sends a confirmation email when a new appointment is created'}
                      {event === 'appointmentCompleted' && 'Sends a summary email with selected documents when an appointment is marked Completed'}
                    </p>
                  </div>
                  <div
                    onClick={() => setSmtpForm(f => ({
                      ...f,
                      events: { ...f.events, [event]: { ...f.events[event], enabled: !f.events[event]?.enabled } }
                    }))}
                    className={`flex-shrink-0 w-10 h-5 rounded-full relative transition-colors cursor-pointer ${smtpForm.events?.[event]?.enabled ? 'bg-[#137fec]' : 'bg-slate-300 dark:bg-slate-600'}`}
                  >
                    <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${smtpForm.events?.[event]?.enabled ? 'left-5' : 'left-0.5'}`} />
                  </div>
                </div>

                {/* Delay */}
                <div className="flex items-center gap-2">
                  <label className="text-xs text-slate-500 whitespace-nowrap">Send after (minutes):</label>
                  <input
                    type="number" min="0"
                    value={smtpForm.events?.[event]?.delayMinutes || 0}
                    onChange={e => setSmtpForm(f => ({
                      ...f,
                      events: { ...f.events, [event]: { ...f.events[event], delayMinutes: Number(e.target.value) } }
                    }))}
                    className="w-20 px-2 py-1 border border-slate-300 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-800 focus:ring-2 focus:ring-[#137fec] outline-none"
                  />
                  <span className="text-xs text-slate-400">0 = immediately</span>
                </div>

                {/* Document selection — only for appointmentCompleted */}
                {event === 'appointmentCompleted' && (
                  <div className="space-y-1.5 pt-1 border-t border-slate-100">
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Documents to attach</p>
                    {COMPLETION_DOCS.map(doc => (
                      <label key={doc.key} className="flex items-start gap-3 p-2.5 rounded-lg border border-slate-100 hover:bg-slate-50 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={smtpForm.events?.appointmentCompleted?.include?.[doc.key] ?? false}
                          onChange={() => setSmtpForm(f => ({
                            ...f,
                            events: {
                              ...f.events,
                              appointmentCompleted: {
                                ...f.events?.appointmentCompleted,
                                include: {
                                  ...f.events?.appointmentCompleted?.include,
                                  [doc.key]: !f.events?.appointmentCompleted?.include?.[doc.key],
                                },
                              },
                            },
                          }))}
                          className="accent-[#137fec] w-4 h-4 mt-0.5 flex-shrink-0"
                        />
                        <div>
                          <p className="text-sm font-medium text-slate-700">{doc.label}</p>
                          <p className="text-xs text-slate-400">{doc.sub}</p>
                        </div>
                      </label>
                    ))}
                    <p className="text-xs text-slate-400 pt-1">Only documents that exist for the patient at the time of completion will be attached. If none exist, the email is skipped.</p>
                  </div>
                )}
              </div>
            ))}
          </div>

          <button onClick={saveSettings} disabled={settingsSaving} className="px-6 py-2.5 bg-[#137fec] hover:bg-blue-600 text-white font-semibold rounded-xl text-sm transition-colors disabled:opacity-60">
            {settingsSaving ? 'Saving...' : 'Save Automation Settings'}
          </button>
        </div>
      )}

      {/* ── Templates ── */}
      {emailSubTab === 'templates' && (
        <div>
          <div className="flex justify-between items-center mb-3">
            <p className="text-sm font-semibold text-slate-700">Email Templates</p>
            <button onClick={() => setTemplateModal('new')} className="flex items-center gap-2 px-4 py-2 bg-[#137fec] hover:bg-blue-600 text-white font-semibold rounded-xl text-sm transition-colors">
              <Plus size={16} /> New Template
            </button>
          </div>

          {/* Guide card */}
          <div className="mb-5 rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3 text-xs text-slate-600">
            <p className="text-sm font-bold text-slate-700">How templates work</p>
            <p className="leading-relaxed">Templates define the <strong>subject line and body text</strong> of the email. They apply to both automated emails (when an appointment is completed) and the manual <strong>Send Mail</strong> button on the Treatment page. The selected PDF documents (Smart Report, Invoice, etc.) are attached automatically — you only write the message here.</p>
            <div className="bg-white border border-slate-200 rounded-lg p-3 space-y-2">
              <p className="font-bold text-slate-700">Available variables — type these in your subject or body:</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                {[
                  ['{{name}}',        'Patient full name (e.g. Rahul Sharma)'],
                  ['{{first_name}}',  'Patient first name only (e.g. Rahul)'],
                  ['{{doctor}}',      'Doctor\'s name'],
                  ['{{date}}',        'Today\'s date (e.g. 12 May 2026)'],
                  ['{{treatments}}',  'Comma-separated treatment names from the visit'],
                ].map(([v, d]) => (
                  <div key={v} className="flex gap-2 items-start">
                    <code className="bg-blue-50 text-blue-700 border border-blue-100 px-1.5 py-0.5 rounded font-mono text-xs flex-shrink-0">{v}</code>
                    <span className="text-slate-500">{d}</span>
                  </div>
                ))}
              </div>
            </div>
            <p className="text-slate-400">Each event can have one active template per language. If no template is set for an event, a sensible default message is used automatically.</p>
          </div>

          {templatesLoading ? (
            <div className="text-center py-8 text-slate-500">Loading...</div>
          ) : templates.length === 0 ? (
            <div className="text-center py-12 text-slate-400">No templates yet. Create one to get started.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50 dark:bg-slate-700">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-300">Event</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-300">Language</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-300">Subject</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-300">Status</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600 dark:text-slate-300">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                  {templates.map(t => (
                    <tr key={t._id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                      <td className="px-4 py-3 text-sm text-slate-700 dark:text-slate-300">{EVENT_LABELS[t.event] || t.event}</td>
                      <td className="px-4 py-3 text-sm text-slate-500">{LANG_LABELS[t.language] || t.language}</td>
                      <td className="px-4 py-3 text-sm text-slate-700 dark:text-slate-300 max-w-xs truncate">{t.subject}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${t.isActive ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                          {t.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-center gap-2">
                          <button onClick={() => setTemplateModal(t)} className="p-1.5 text-blue-500 hover:bg-blue-50 dark:hover:bg-slate-600 rounded-lg transition-colors"><Edit2 size={16} /></button>
                          <button onClick={() => handleDeleteTemplate(t._id)} className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-slate-600 rounded-lg transition-colors"><Trash2 size={16} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Logs ── */}
      {emailSubTab === 'logs' && (
        <div>
          <div className="flex flex-wrap gap-3 mb-4 items-end">
            <select value={logsFilter.event} onChange={e => setLogsFilter(f => ({ ...f, event: e.target.value }))} className="px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-800 focus:ring-2 focus:ring-[#137fec] outline-none">
              <option value="">All Events</option>
              {Object.entries(EVENT_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              <option value="manual">Manual</option>
            </select>
            <select value={logsFilter.status} onChange={e => setLogsFilter(f => ({ ...f, status: e.target.value }))} className="px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-800 focus:ring-2 focus:ring-[#137fec] outline-none">
              <option value="">All Statuses</option>
              <option value="sent">Sent</option>
              <option value="failed">Failed</option>
            </select>
            <button onClick={fetchLogs} className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 text-slate-700 dark:text-slate-300 font-semibold rounded-lg text-sm transition-colors">
              <RefreshCw size={14} /> Refresh
            </button>
            <span className="text-xs text-slate-400 ml-auto">{logs.length} record{logs.length !== 1 ? 's' : ''}</span>
          </div>

          {logsLoading ? (
            <div className="text-center py-8 text-slate-500">Loading...</div>
          ) : logs.length === 0 ? (
            <div className="text-center py-12 text-slate-400">No email logs found.</div>
          ) : (
            <>
              {/* Mobile cards */}
              <div className="sm:hidden space-y-2">
                {logs.map(log => (
                  <div
                    key={log._id}
                    onClick={() => setExpandedLog(expandedLog === log._id ? null : log._id)}
                    className="border border-slate-200 dark:border-slate-700 rounded-xl p-3 cursor-pointer"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-800 dark:text-white truncate">{log.subject || '—'}</p>
                        <p className="text-xs text-slate-500 truncate mt-0.5">{log.patientId ? `${log.patientId.first_name} ${log.patientId.last_name || ''}` : '—'} · {log.to}</p>
                      </div>
                      <div className="flex-shrink-0 flex flex-col items-end gap-1">
                        {log.status === 'sent'
                          ? <span className="flex items-center gap-1 text-green-600 font-semibold text-xs"><CheckCircle size={12} /> Sent</span>
                          : <span className="flex items-center gap-1 text-red-500 font-semibold text-xs"><XCircle size={12} /> Failed</span>}
                        <span className="text-xs text-slate-400">{new Date(log.sentAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })}</span>
                      </div>
                    </div>
                    {expandedLog === log._id && (
                      <div className="mt-3 pt-3 border-t border-slate-100 text-xs space-y-1 text-slate-600 dark:text-slate-400">
                        <p><span className="font-semibold">Event:</span> {EVENT_LABELS[log.event] || log.event || 'Manual'}</p>
                        {log.messageId && <p><span className="font-semibold">Message ID:</span> {log.messageId}</p>}
                        {log.attachments?.length > 0 && <p><span className="font-semibold">Attachments:</span> {log.attachments.map(a => a.filename).join(', ')}</p>}
                        {log.errorMessage && <p className="text-red-500"><span className="font-semibold">Error:</span> {log.errorMessage}</p>}
                        <p><span className="font-semibold">Sent at:</span> {new Date(log.sentAt).toLocaleString()}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {/* Desktop table */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-700">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-300">Date</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-300">Patient</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-300">Subject</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-300">To</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-300">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                    {logs.map(log => (
                      <React.Fragment key={log._id}>
                        <tr onClick={() => setExpandedLog(expandedLog === log._id ? null : log._id)} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 cursor-pointer">
                          <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{new Date(log.sentAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })}</td>
                          <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{log.patientId ? `${log.patientId.first_name} ${log.patientId.last_name || ''}` : '—'}</td>
                          <td className="px-4 py-3 text-slate-700 dark:text-slate-300 max-w-xs truncate" title={log.subject}>{log.subject || '—'}</td>
                          <td className="px-4 py-3 text-slate-500 max-w-[12rem] truncate">{log.to}</td>
                          <td className="px-4 py-3">
                            {log.status === 'sent'
                              ? <span className="flex items-center gap-1 text-green-600 font-semibold text-xs"><CheckCircle size={13} /> Sent</span>
                              : <span className="flex items-center gap-1 text-red-500 font-semibold text-xs" title={log.errorMessage}><XCircle size={13} /> Failed</span>}
                          </td>
                        </tr>
                        {expandedLog === log._id && (
                          <tr className="bg-slate-50 dark:bg-slate-900">
                            <td colSpan={5} className="px-6 py-4">
                              <div className="text-xs space-y-1 text-slate-600 dark:text-slate-400">
                                <p><span className="font-semibold">Event:</span> {EVENT_LABELS[log.event] || log.event || 'Manual'}</p>
                                <p><span className="font-semibold">Subject:</span> {log.subject}</p>
                                <p><span className="font-semibold">To:</span> {log.to}</p>
                                {log.messageId && <p><span className="font-semibold">Message ID:</span> {log.messageId}</p>}
                                {log.attachments?.length > 0 && <p><span className="font-semibold">Attachments:</span> {log.attachments.map(a => a.filename).join(', ')}</p>}
                                {log.errorMessage && <p className="text-red-500"><span className="font-semibold">Error:</span> {log.errorMessage}</p>}
                                <p><span className="font-semibold">Sent at:</span> {new Date(log.sentAt).toLocaleString()}</p>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* Template editor modal */}
      {templateModal && (
        <EmailTemplateEditorModal
          template={templateModal === 'new' ? null : templateModal}
          onClose={() => setTemplateModal(null)}
          onSave={handleSaveTemplate}
        />
      )}
    </div>
  );
}

// ─── Main Settings Page ───────────────────────────────────────────────────────

const SettingsPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('doctors');

  // Doctor states
  const [doctors, setDoctors] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingDoctor, setEditingDoctor] = useState(null);
  const [doctorFormData, setDoctorFormData] = useState({
    name: '',
    specialization: '',
    email: '',
    phone: '',
    license_number: '',
    qualification: '',
    experience_years: 0,
    is_active: true,
    notes: '',
    availability: {
      monday: { start: '09:00', end: '17:00' },
      tuesday: { start: '09:00', end: '17:00' },
      wednesday: { start: '09:00', end: '17:00' },
      thursday: { start: '09:00', end: '17:00' },
      friday: { start: '09:00', end: '17:00' },
      saturday: { start: '10:00', end: '14:00' },
      sunday: { start: '', end: '' }
    }
  });

  // Booking settings state
  const [bookingSettings, setBookingSettings] = useState(DEFAULT_BOOKING_SETTINGS);
  const [bookingSaving, setBookingSaving] = useState(false);
  const [newBlockedDate, setNewBlockedDate] = useState({ date: '', reason: '' });

  // Doctor schedules tab state
  const [bookingDoctors, setBookingDoctors] = useState([]);
  const [bookingDoctorsLoading, setBookingDoctorsLoading] = useState(false);
  const [scheduleModal, setScheduleModal] = useState(null); // doctor object

  // Treatment states
  const [clinicalFindings, setClinicalFindings] = useState([]);
  const [diagnoses, setDiagnoses] = useState([]);
  const [suggestedTreatments, setSuggestedTreatments] = useState([]);
  const [treatmentTab, setTreatmentTab] = useState('findings');
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkItems, setBulkItems] = useState([]);

  // Unified Add modal state
  const [showAddChooser, setShowAddChooser] = useState(false);
  const [showSingleAdd, setShowSingleAdd] = useState(false);
  const [showBulkUpload, setShowBulkUpload] = useState(false);

  // Fetch data based on active tab
  useEffect(() => {
    if (activeTab === 'doctors') {
      fetchDoctors();
    } else if (activeTab === 'treatment') {
      fetchTreatmentData();
    } else if (activeTab === 'booking') {
      fetchBookingSettings();
    } else if (activeTab === 'doctorSchedules') {
      fetchBookingDoctors();
    }
  }, [activeTab, treatmentTab]);

  const fetchDoctors = async () => {
    setLoading(true);
    try {
      const res = await API.get('/doctors');
      setDoctors(res.data);
    } catch (err) {
      console.error('Failed to load doctors:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchTreatmentData = async () => {
    setLoading(true);
    try {
      const [findingsRes, diagnosesRes, treatmentsRes] = await Promise.all([
        API.get('/clinical-findings'),
        API.get('/diagnoses'),
        API.get('/suggested-treatments')
      ]);
      setClinicalFindings(findingsRes.data);
      setDiagnoses(diagnosesRes.data);
      setSuggestedTreatments(treatmentsRes.data);
    } catch (err) {
      console.error('Failed to load treatment data:', err);
    } finally {
      setLoading(false);
    }
  };

  // ── Booking settings handlers ──────────────────────────────────────────────

  const fetchBookingSettings = async () => {
    try {
      const res = await API.get('/settings/booking');
      setBookingSettings(prev => ({ ...DEFAULT_BOOKING_SETTINGS, ...res.data }));
    } catch (err) {
      console.error('Failed to load booking settings:', err);
    }
  };

  const handleSaveBookingSettings = async () => {
    setBookingSaving(true);
    try {
      const { blockedDates, ...toSave } = bookingSettings;
      await API.put('/settings/booking', toSave);
      alert('Booking settings saved!');
    } catch (err) {
      alert('Failed to save: ' + (err.response?.data?.error || err.message));
    } finally {
      setBookingSaving(false);
    }
  };

  const addBlockedDate = async () => {
    if (!newBlockedDate.date) return;
    const updated = [...bookingSettings.blockedDates, { ...newBlockedDate }];
    setBookingSettings(s => ({ ...s, blockedDates: updated }));
    setNewBlockedDate({ date: '', reason: '' });
    try {
      await API.put('/settings/booking', { blockedDates: updated });
    } catch (err) {
      console.error('Failed to save blocked date:', err);
    }
  };

  const removeBlockedDate = async (i) => {
    const updated = bookingSettings.blockedDates.filter((_, idx) => idx !== i);
    setBookingSettings(s => ({ ...s, blockedDates: updated }));
    try {
      await API.put('/settings/booking', { blockedDates: updated });
    } catch (err) {
      console.error('Failed to remove blocked date:', err);
    }
  };

  const setDayWH = (day, patch) =>
    setBookingSettings(s => ({
      ...s,
      workingHours: { ...s.workingHours, [day]: patch },
    }));

  // ── Doctor schedules tab ────────────────────────────────────────────────────

  const fetchBookingDoctors = async () => {
    setBookingDoctorsLoading(true);
    try {
      const res = await API.get('/doctors');
      setBookingDoctors(res.data);
    } catch (err) {
      console.error('Failed to load doctors for booking:', err);
    } finally {
      setBookingDoctorsLoading(false);
    }
  };

  const handleDoctorScheduleSaved = (doctorId, isBookable) => {
    setBookingDoctors(prev => prev.map(d =>
      d._id === doctorId ? { ...d, isBookable } : d
    ));
  };

  // ── Doctor management handlers ──────────────────────────────────────────────

  const handleAddDoctor = () => {
    if (doctors.length >= 10) {
      alert('You can only add a maximum of 10 doctors.');
      return;
    }
    setEditingDoctor(null);
    setDoctorFormData({
      name: '',
      specialization: '',
      email: '',
      phone: '',
      license_number: '',
      qualification: '',
      experience_years: 0,
      is_active: true,
      notes: '',
      availability: {
        monday: { start: '09:00', end: '17:00' },
        tuesday: { start: '09:00', end: '17:00' },
        wednesday: { start: '09:00', end: '17:00' },
        thursday: { start: '09:00', end: '17:00' },
        friday: { start: '09:00', end: '17:00' },
        saturday: { start: '10:00', end: '14:00' },
        sunday: { start: '', end: '' }
      }
    });
    setShowModal(true);
  };

  const handleEditDoctor = (doctor) => {
    setEditingDoctor(doctor);
    setDoctorFormData(doctor);
    setShowModal(true);
  };

  const handleDeleteDoctor = async (id) => {
    if (window.confirm('Are you sure you want to delete this doctor?')) {
      try {
        await API.delete(`/doctors/${id}`);
        setDoctors(doctors.filter(d => d._id !== id));
      } catch (err) {
        console.error('Failed to delete doctor:', err);
        alert('Failed to delete doctor');
      }
    }
  };

  const handleSubmitDoctor = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (editingDoctor) {
        const res = await API.put(`/doctors/${editingDoctor._id}`, doctorFormData);
        setDoctors(doctors.map(d => d._id === editingDoctor._id ? res.data : d));
      } else {
        const res = await API.post('/doctors', doctorFormData);
        setDoctors([...doctors, res.data]);
      }
      setShowModal(false);
    } catch (err) {
      console.error('Failed to save doctor:', err);
      alert('Failed to save doctor: ' + (err.response?.data?.error || err.message));
    } finally {
      setLoading(false);
    }
  };

  const handleDoctorChange = (e) => {
    const { name, value, type, checked } = e.target;
    if (name.startsWith('availability_')) {
      const [, day, timeType] = name.split('_');
      setDoctorFormData(prev => ({
        ...prev,
        availability: {
          ...prev.availability,
          [day]: {
            ...prev.availability[day],
            [timeType]: value
          }
        }
      }));
    } else {
      setDoctorFormData(prev => ({
        ...prev,
        [name]: type === 'checkbox' ? checked : (name === 'experience_years' ? Number(value) : value)
      }));
    }
  };

  const addBulkRow = () => {
    if (treatmentTab === 'treatments') {
      setBulkItems([...bulkItems, { name: '', category: '', cost: 0, description: '' }]);
    } else if (treatmentTab === 'diagnoses') {
      setBulkItems([...bulkItems, { name: '', code: '', category: '', description: '' }]);
    } else {
      setBulkItems([...bulkItems, { name: '', category: '', description: '' }]);
    }
  };

  const updateBulkRow = (index, field, value) => {
    const newItems = [...bulkItems];
    newItems[index] = { ...newItems[index], [field]: value };
    setBulkItems(newItems);
  };

  const removeBulkRow = (index) => {
    setBulkItems(bulkItems.filter((_, i) => i !== index));
  };

  const handleBulkAdd = async () => {
    if (bulkItems.length === 0) return;
    setLoading(true);

    try {
      for (const item of bulkItems) {
        if (!item.name.trim()) continue;

        if (treatmentTab === 'findings') {
          await API.post('/clinical-findings', {
            name: item.name.trim(),
            category: item.category || '',
            description: item.description || '',
            is_active: true
          });
        } else if (treatmentTab === 'diagnoses') {
          await API.post('/diagnoses', {
            name: item.name.trim(),
            code: item.code || '',
            category: item.category || '',
            description: item.description || '',
            is_active: true
          });
        } else if (treatmentTab === 'treatments') {
          await API.post('/suggested-treatments', {
            name: item.name.trim(),
            cost: parseFloat(item.cost) || 0,
            category: item.category || '',
            description: item.description || '',
            is_active: true
          });
        }
      }
      setBulkItems([]);
      setBulkMode(false);
      fetchTreatmentData();
      alert('Items added successfully!');
    } catch (err) {
      console.error('Failed to add items:', err);
      alert('Failed to add some items: ' + (err.response?.data?.error || err.message));
    } finally {
      setLoading(false);
    }
  };

  // Delete treatment item
  const handleDeleteTreatmentItem = async (id, type) => {
    if (window.confirm('Are you sure you want to delete this item?')) {
      try {
        const endpoint =
          type === 'findings' ? '/clinical-findings' :
          type === 'diagnoses' ? '/diagnoses' :
          '/suggested-treatments';
        await API.delete(`${endpoint}/${id}`);

        if (type === 'findings') setClinicalFindings(clinicalFindings.filter(f => f._id !== id));
        else if (type === 'diagnoses') setDiagnoses(diagnoses.filter(d => d._id !== id));
        else setSuggestedTreatments(suggestedTreatments.filter(t => t._id !== id));
      } catch (err) {
        console.error('Failed to delete item:', err);
        alert('Failed to delete item');
      }
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 p-3 sm:p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-5 sm:mb-8">
          <h1 className="text-2xl sm:text-4xl font-bold text-slate-800 dark:text-white mb-1 sm:mb-2">Settings</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">Manage clinic configuration and clinical data</p>
        </div>

        {/* Tabs — horizontally scrollable on mobile */}
        <div className="flex gap-0 mb-6 border-b border-slate-200 dark:border-slate-700 overflow-x-auto scrollbar-none -mx-3 px-3 sm:mx-0 sm:px-0">
          {[
            { key: 'doctors',        label: 'Doctors' },
            { key: 'treatment',      label: 'Clinical Data' },
            { key: 'inventory',      label: 'Inventory' },
            { key: 'email',          label: 'Email' },
            { key: 'booking',        label: 'Online Booking' },
            { key: 'doctorSchedules',label: 'Doctor Schedules' },
            { key: 'invoice',        label: 'Invoice' },
            { key: 'prescription',   label: 'Prescription' },
          ].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`flex-shrink-0 px-4 sm:px-6 py-3 text-sm sm:text-base font-semibold transition-all whitespace-nowrap ${
                activeTab === key
                  ? 'text-[#137fec] border-b-2 border-[#137fec]'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-300'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Doctors Tab */}
        {activeTab === 'doctors' && (
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg p-4 sm:p-6">
            <div className="flex justify-between items-center mb-6">
              <div className="flex items-center gap-2">
                <h2 className="text-lg sm:text-2xl font-bold text-slate-800 dark:text-white">Doctor Management</h2>
                <span className="text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-400">({doctors.length}/10)</span>
              </div>
              <button
                onClick={handleAddDoctor}
                disabled={doctors.length >= 10}
                className={`flex items-center gap-2 px-3 sm:px-4 py-2 sm:py-2.5 text-sm font-semibold rounded-xl transition-colors ${
                  doctors.length >= 10
                    ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                    : 'bg-[#137fec] hover:bg-blue-600 text-white'
                }`}
                title={doctors.length >= 10 ? 'Maximum of 10 doctors reached' : 'Add a new doctor'}
              >
                <Plus size={18} /> <span className="hidden xs:inline">Add Doctor</span><span className="xs:hidden">Add</span>
              </button>
            </div>

            {loading ? (
              <div className="text-center py-8 text-slate-500">Loading...</div>
            ) : doctors.length === 0 ? (
              <div className="text-center py-8 text-slate-500">
                <p>No doctors added yet. Click "Add Doctor" to get started.</p>
              </div>
            ) : (
              <>
                {/* Mobile cards */}
                <div className="sm:hidden space-y-3">
                  {doctors.map(doctor => (
                    <div key={doctor._id} className="border border-slate-200 dark:border-slate-700 rounded-xl p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-800 dark:text-white truncate">{doctor.name}</p>
                          {doctor.specialization && <p className="text-xs text-slate-500 mt-0.5">{doctor.specialization}</p>}
                        </div>
                        <div className="flex gap-1 flex-shrink-0">
                          <button onClick={() => handleEditDoctor(doctor)} className="p-2 text-blue-500 hover:bg-blue-50 rounded-lg transition-colors"><Edit2 size={16} /></button>
                          <button onClick={() => handleDeleteDoctor(doctor._id)} className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"><Trash2 size={16} /></button>
                        </div>
                      </div>
                      <div className="mt-2 space-y-1 text-xs text-slate-500">
                        {doctor.email && <p>{doctor.email}</p>}
                        {doctor.phone && <p>{doctor.phone}</p>}
                        <p>{doctor.experience_years} yrs experience</p>
                      </div>
                    </div>
                  ))}
                </div>
                {/* Desktop table */}
                <div className="hidden sm:block overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-slate-50 dark:bg-slate-700">
                      <tr>
                        <th className="px-6 py-3 text-left text-sm font-semibold text-slate-700 dark:text-slate-300">Name</th>
                        <th className="px-6 py-3 text-left text-sm font-semibold text-slate-700 dark:text-slate-300">Specialization</th>
                        <th className="px-6 py-3 text-left text-sm font-semibold text-slate-700 dark:text-slate-300">Email</th>
                        <th className="px-6 py-3 text-left text-sm font-semibold text-slate-700 dark:text-slate-300">Phone</th>
                        <th className="px-6 py-3 text-left text-sm font-semibold text-slate-700 dark:text-slate-300">Experience</th>
                        <th className="px-6 py-3 text-center text-sm font-semibold text-slate-700 dark:text-slate-300">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                      {doctors.map(doctor => (
                        <tr key={doctor._id} className="hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
                          <td className="px-6 py-4"><p className="font-semibold text-slate-800 dark:text-white">{doctor.name}</p></td>
                          <td className="px-6 py-4 text-slate-600 dark:text-slate-400">{doctor.specialization || '-'}</td>
                          <td className="px-6 py-4 text-slate-600 dark:text-slate-400">{doctor.email || '-'}</td>
                          <td className="px-6 py-4 text-slate-600 dark:text-slate-400">{doctor.phone || '-'}</td>
                          <td className="px-6 py-4 text-slate-600 dark:text-slate-400">{doctor.experience_years} years</td>
                          <td className="px-6 py-4">
                            <div className="flex justify-center gap-2">
                              <button onClick={() => handleEditDoctor(doctor)} className="p-2 text-blue-500 hover:bg-blue-50 dark:hover:bg-slate-600 rounded-lg transition-colors"><Edit2 size={18} /></button>
                              <button onClick={() => handleDeleteDoctor(doctor._id)} className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-slate-600 rounded-lg transition-colors"><Trash2 size={18} /></button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}


        {/* Treatment Tab */}
        {activeTab === 'treatment' && (
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg p-4 sm:p-6">
            {/* Treatment Sub-tabs — scrollable on mobile */}
            <div className="flex gap-0 mb-6 border-b border-slate-200 dark:border-slate-700 overflow-x-auto scrollbar-none -mx-4 px-4 sm:mx-0 sm:px-0">
              {['findings', 'diagnoses', 'treatments'].map(tab => (
                <button
                  key={tab}
                  onClick={() => setTreatmentTab(tab)}
                  className={`flex-shrink-0 px-3 sm:px-4 py-2 text-sm font-semibold transition-all whitespace-nowrap ${
                    treatmentTab === tab
                      ? 'text-[#137fec] border-b-2 border-[#137fec]'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {tab === 'findings' ? 'Clinical Findings' : tab === 'diagnoses' ? 'Diagnoses' : 'Suggested Treatments'}
                </button>
              ))}
            </div>

            {/* Header — Unified Add button */}
            <div className="flex flex-wrap justify-between items-center gap-3 mb-6">
              <h3 className="text-base sm:text-xl font-bold text-slate-800 dark:text-white">
                {treatmentTab === 'findings' ? 'Clinical Findings' : treatmentTab === 'diagnoses' ? 'Diagnoses' : 'Suggested Treatments'}
              </h3>
              {bulkMode ? (
                <button
                  onClick={() => { setBulkMode(false); setBulkItems([]); }}
                  className="flex items-center gap-2 px-4 py-2.5 text-sm rounded-xl font-semibold transition-colors bg-orange-500 text-white hover:bg-orange-600"
                >
                  <X size={16} /> Cancel Quick Entry
                </button>
              ) : (
                <button
                  onClick={() => setShowAddChooser(true)}
                  className="flex items-center gap-2 px-4 py-2.5 text-sm rounded-xl font-semibold transition-colors bg-[#137fec] text-white hover:bg-blue-600 shadow-md"
                >
                  <Plus size={16} />
                  Add {treatmentTab === 'findings' ? 'Findings' : treatmentTab === 'diagnoses' ? 'Diagnoses' : 'Treatments'}
                </button>
              )}
            </div>

            {/* Bulk Mode Input */}
            {bulkMode && (
              <div className="mb-6 p-6 bg-slate-50 dark:bg-slate-700 rounded-lg border-2 border-orange-300">
                <div className="flex justify-between items-center mb-4">
                  <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                    Add {treatmentTab === 'findings' ? 'Clinical Findings' : treatmentTab === 'diagnoses' ? 'Diagnoses' : 'Suggested Treatments'} in Bulk
                  </h4>
                  <button
                    onClick={addBulkRow}
                    className="flex items-center gap-2 px-3 py-1.5 bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold rounded-lg transition-colors"
                  >
                    <Plus size={16} /> Add Row
                  </button>
                </div>

                <div className="overflow-x-auto mb-4 border border-orange-300 rounded-lg">
                  <table className="w-full">
                    <thead className="bg-orange-100 dark:bg-slate-600">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 dark:text-slate-300">Name</th>
                        {treatmentTab === 'diagnoses' && (
                          <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 dark:text-slate-300">Code</th>
                        )}
                        {treatmentTab === 'treatments' && (
                          <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 dark:text-slate-300">Cost (₹)</th>
                        )}
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 dark:text-slate-300">Category</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 dark:text-slate-300">Description</th>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-slate-700 dark:text-slate-300">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-orange-200 dark:divide-slate-600">
                      {bulkItems.length === 0 ? (
                        <tr>
                          <td colSpan={treatmentTab === 'treatments' ? 5 : treatmentTab === 'diagnoses' ? 5 : 4} className="px-4 py-8 text-center text-slate-500">
                            Click "Add Row" to start adding items
                          </td>
                        </tr>
                      ) : (
                        bulkItems.map((item, idx) => (
                          <tr key={idx} className="hover:bg-orange-50 dark:hover:bg-slate-600/50 transition-colors">
                            <td className="px-4 py-3">
                              <input
                                type="text"
                                value={item.name}
                                onChange={(e) => updateBulkRow(idx, 'name', e.target.value)}
                                placeholder="Item name"
                                className="w-full px-2 py-1.5 border border-orange-300 rounded text-sm bg-white dark:bg-slate-800 dark:border-orange-500 focus:ring-2 focus:ring-orange-500 outline-none"
                              />
                            </td>
                            {treatmentTab === 'diagnoses' && (
                              <td className="px-4 py-3">
                                <input
                                  type="text"
                                  value={item.code}
                                  onChange={(e) => updateBulkRow(idx, 'code', e.target.value)}
                                  placeholder="ICD Code"
                                  className="w-full px-2 py-1.5 border border-orange-300 rounded text-sm bg-white dark:bg-slate-800 dark:border-orange-500 focus:ring-2 focus:ring-orange-500 outline-none"
                                />
                              </td>
                            )}
                            {treatmentTab === 'treatments' && (
                              <td className="px-4 py-3">
                                <input
                                  type="number"
                                  value={item.cost}
                                  onChange={(e) => updateBulkRow(idx, 'cost', e.target.value)}
                                  placeholder="0"
                                  className="w-full px-2 py-1.5 border border-orange-300 rounded text-sm bg-white dark:bg-slate-800 dark:border-orange-500 focus:ring-2 focus:ring-orange-500 outline-none"
                                />
                              </td>
                            )}
                            <td className="px-4 py-3">
                              <input
                                type="text"
                                value={item.category}
                                onChange={(e) => updateBulkRow(idx, 'category', e.target.value)}
                                placeholder="Category"
                                className="w-full px-2 py-1.5 border border-orange-300 rounded text-sm bg-white dark:bg-slate-800 dark:border-orange-500 focus:ring-2 focus:ring-orange-500 outline-none"
                              />
                            </td>
                            <td className="px-4 py-3">
                              <input
                                type="text"
                                value={item.description}
                                onChange={(e) => updateBulkRow(idx, 'description', e.target.value)}
                                placeholder="Description (optional)"
                                className="w-full px-2 py-1.5 border border-orange-300 rounded text-sm bg-white dark:bg-slate-800 dark:border-orange-500 focus:ring-2 focus:ring-orange-500 outline-none"
                              />
                            </td>
                            <td className="px-4 py-3 text-center">
                              <button
                                onClick={() => removeBulkRow(idx)}
                                className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-slate-600 rounded transition-colors"
                              >
                                <Trash2 size={16} />
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={handleBulkAdd}
                    disabled={loading || bulkItems.length === 0}
                    className="flex-1 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white font-semibold rounded-lg disabled:opacity-50 transition-colors"
                  >
                    Add All Items
                  </button>
                  <button
                    onClick={() => {
                      setBulkMode(false);
                      setBulkItems([]);
                    }}
                    className="flex-1 px-4 py-2 bg-slate-300 hover:bg-slate-400 text-slate-800 font-semibold rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Items list */}
            {loading ? (
              <div className="text-center py-8 text-slate-500">Loading...</div>
            ) : (() => {
              const items = treatmentTab === 'findings' ? clinicalFindings : treatmentTab === 'diagnoses' ? diagnoses : suggestedTreatments;
              return (
                <>
                  {items.length === 0 && !bulkMode && (
                    <div className="mb-5 flex flex-col sm:flex-row sm:items-center gap-4 p-4 rounded-xl bg-[#137fec]/5 border border-[#137fec]/20">
                      <div className="p-2.5 bg-[#137fec]/10 rounded-xl flex-shrink-0 self-start">
                        <BookOpen size={22} className="text-[#137fec]" />
                      </div>
                      <div className="flex-1">
                        <p className="font-semibold text-slate-800 dark:text-white text-sm">No {treatmentTab === 'findings' ? 'findings' : treatmentTab} yet</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          Add them one at a time, type a batch quickly, upload a CSV / Google Sheet, or pick from our curated starter library.
                        </p>
                      </div>
                      <button
                        onClick={() => setShowAddChooser(true)}
                        className="flex-shrink-0 px-4 py-2 bg-[#137fec] hover:bg-blue-600 text-white text-sm font-semibold rounded-lg transition-colors"
                      >
                        Add {treatmentTab === 'findings' ? 'Findings' : treatmentTab === 'diagnoses' ? 'Diagnoses' : 'Treatments'}
                      </button>
                    </div>
                  )}
                  {/* Mobile cards */}
                  <div className="sm:hidden space-y-2">
                    {items.map(item => (
                      <div key={item._id} className="flex items-center justify-between border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 gap-2">
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-800 dark:text-white text-sm truncate">{item.name}</p>
                          <div className="flex gap-2 mt-0.5 flex-wrap">
                            {treatmentTab === 'diagnoses' && item.code && <span className="text-xs text-slate-500">{item.code}</span>}
                            {treatmentTab === 'treatments' && <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">₹{item.cost?.toLocaleString('en-IN') || '0'}</span>}
                            {item.category && <span className="text-xs bg-slate-100 dark:bg-slate-600 px-1.5 py-0.5 rounded">{item.category}</span>}
                          </div>
                        </div>
                        <button onClick={() => handleDeleteTreatmentItem(item._id, treatmentTab)} className="flex-shrink-0 p-2 text-red-500 hover:bg-red-50 dark:hover:bg-slate-600 rounded-lg transition-colors"><Trash2 size={15} /></button>
                      </div>
                    ))}
                  </div>
                  {/* Desktop table */}
                  <div className="hidden sm:block overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-slate-50 dark:bg-slate-700">
                        <tr>
                          <th className="px-6 py-3 text-left text-sm font-semibold text-slate-700 dark:text-slate-300">Name</th>
                          {treatmentTab === 'diagnoses' && <th className="px-6 py-3 text-left text-sm font-semibold text-slate-700 dark:text-slate-300">Code</th>}
                          {treatmentTab === 'treatments' && <th className="px-6 py-3 text-left text-sm font-semibold text-slate-700 dark:text-slate-300">Cost</th>}
                          <th className="px-6 py-3 text-left text-sm font-semibold text-slate-700 dark:text-slate-300">Category</th>
                          <th className="px-6 py-3 text-center text-sm font-semibold text-slate-700 dark:text-slate-300">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                        {items.map(item => (
                          <tr key={item._id} className="hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
                            <td className="px-6 py-4"><p className="font-semibold text-slate-800 dark:text-white">{item.name}</p></td>
                            {treatmentTab === 'diagnoses' && <td className="px-6 py-4 text-slate-600 dark:text-slate-400">{item.code || '-'}</td>}
                            {treatmentTab === 'treatments' && <td className="px-6 py-4 text-slate-600 dark:text-slate-400">₹{item.cost?.toLocaleString('en-IN') || '0'}</td>}
                            <td className="px-6 py-4 text-slate-600 dark:text-slate-400"><span className="text-xs bg-slate-100 dark:bg-slate-600 px-2 py-1 rounded">{item.category || '-'}</span></td>
                            <td className="px-6 py-4 text-center"><button onClick={() => handleDeleteTreatmentItem(item._id, treatmentTab)} className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-slate-600 rounded-lg transition-colors"><Trash2 size={18} /></button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              );
            })()}
          </div>
        )}
        {/* Inventory Tab */}
        {activeTab === 'inventory' && <InventoryTab />}

        {/* Email Tab */}
        {activeTab === 'email' && <EmailTab />}

        {/* ── Online Booking Tab ────────────────────────────────────────────── */}
        {activeTab === 'booking' && (() => {
          const tenantId = user?.tenantId;
          const slug = toSlug(bookingSettings.clinicDisplayName);
          const bookingUrl = tenantId
            ? `${window.location.origin}/connect-dentalclinic/${slug || 'my-clinic'}/${tenantId}`
            : null;

          return (
            <div className="space-y-6">
              {/* Booking Link */}
              <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Link2 size={18} className="text-[#137fec]" />
                  <h3 className="font-bold text-slate-800 dark:text-white text-base">Your Booking Link</h3>
                </div>
                {!tenantId ? (
                  <p className="text-sm text-amber-600 bg-amber-50 dark:bg-amber-900/20 rounded-lg px-4 py-3">
                    Your account is not yet provisioned to a clinic. Contact your administrator.
                  </p>
                ) : (
                  <>
                    <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-700 rounded-xl px-4 py-3 mb-3">
                      <Globe size={14} className="text-slate-400 flex-shrink-0" />
                      <span className="text-sm text-slate-600 dark:text-slate-300 font-mono truncate flex-1">{bookingUrl}</span>
                      <button
                        onClick={() => { navigator.clipboard.writeText(bookingUrl); }}
                        className="flex-shrink-0 p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-500" title="Copy link">
                        <Copy size={14} />
                      </button>
                      <a href={bookingUrl} target="_blank" rel="noreferrer"
                        className="flex-shrink-0 p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-500" title="Open link">
                        <ExternalLink size={14} />
                      </a>
                    </div>
                    {!bookingSettings.isBookingEnabled && (
                      <p className="text-xs text-amber-600 flex items-center gap-1">
                        <XCircle size={12} /> Booking is currently disabled — enable it in General settings below.
                      </p>
                    )}
                  </>
                )}
              </div>

              {/* General Settings */}
              <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-5">
                <h3 className="font-bold text-slate-800 dark:text-white text-base mb-4">General</h3>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Enable Online Booking</p>
                      <p className="text-xs text-slate-400 mt-0.5">Patients can discover and book slots via the link above</p>
                    </div>
                    <button
                      onClick={() => setBookingSettings(s => ({ ...s, isBookingEnabled: !s.isBookingEnabled }))}
                      className={`relative inline-flex h-6 w-11 rounded-full transition-colors ${bookingSettings.isBookingEnabled ? 'bg-[#137fec]' : 'bg-slate-300 dark:bg-slate-600'}`}>
                      <span className={`inline-block h-4 w-4 mt-1 rounded-full bg-white shadow transition-transform ${bookingSettings.isBookingEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-500 uppercase">Clinic Display Name</label>
                    <input type="text" value={bookingSettings.clinicDisplayName}
                      onChange={e => setBookingSettings(s => ({ ...s, clinicDisplayName: e.target.value }))}
                      placeholder="e.g. Smile Care Dental"
                      className="w-full mt-1 px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm focus:ring-2 focus:ring-[#137fec] outline-none dark:bg-slate-700 dark:text-white" />
                    {bookingSettings.clinicDisplayName && (
                      <p className="text-xs text-slate-400 mt-1">URL slug: <span className="font-mono text-slate-600 dark:text-slate-300">{slug}</span></p>
                    )}
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-500 uppercase">Tagline</label>
                    <input type="text" value={bookingSettings.clinicTagline}
                      onChange={e => setBookingSettings(s => ({ ...s, clinicTagline: e.target.value }))}
                      placeholder="e.g. Your smile, our mission"
                      className="w-full mt-1 px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm focus:ring-2 focus:ring-[#137fec] outline-none dark:bg-slate-700 dark:text-white" />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-500 uppercase">Slot Duration</label>
                    <select value={bookingSettings.slotDurationMinutes}
                      onChange={e => setBookingSettings(s => ({ ...s, slotDurationMinutes: Number(e.target.value) }))}
                      className="w-full mt-1 px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm focus:ring-2 focus:ring-[#137fec] outline-none dark:bg-slate-700 dark:text-white">
                      {[15, 20, 30, 45, 60].map(v => <option key={v} value={v}>{v} minutes</option>)}
                    </select>
                  </div>
                </div>
                <button onClick={handleSaveBookingSettings} disabled={bookingSaving}
                  className="mt-5 px-5 py-2 bg-[#137fec] text-white text-sm font-bold rounded-xl hover:bg-blue-600 disabled:opacity-60 flex items-center gap-2">
                  {bookingSaving ? <><Loader2 size={14} className="animate-spin" /> Saving…</> : 'Save Booking Settings'}
                </button>
              </div>

              {/* Clinic Working Hours */}
              <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-5">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="font-bold text-slate-800 dark:text-white text-base">Clinic Working Hours</h3>
                    <p className="text-xs text-slate-400 mt-0.5">Reference only — slot generation uses each doctor's own schedule</p>
                  </div>
                </div>
                {BOOKING_DAYS.map(day => (
                  <DayRow key={day} day={day}
                    schedule={bookingSettings.workingHours[day]}
                    onChange={setDayWH} />
                ))}
                <button onClick={handleSaveBookingSettings} disabled={bookingSaving}
                  className="mt-4 px-5 py-2 bg-[#137fec] text-white text-sm font-bold rounded-xl hover:bg-blue-600 disabled:opacity-60 flex items-center gap-2">
                  {bookingSaving ? <><Loader2 size={14} className="animate-spin" /> Saving…</> : 'Save Working Hours'}
                </button>
              </div>

              {/* Blocked Dates */}
              <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-5">
                <h3 className="font-bold text-slate-800 dark:text-white text-base mb-1">Clinic Holidays / Blocked Dates</h3>
                <p className="text-xs text-slate-400 mb-4">These dates block all slots across all doctors. Saved immediately on add/remove.</p>

                <div className="space-y-2 mb-4">
                  {bookingSettings.blockedDates.length === 0 && (
                    <p className="text-sm text-slate-400 italic">No blocked dates added yet.</p>
                  )}
                  {bookingSettings.blockedDates.map((b, i) => (
                    <div key={i} className="flex items-center gap-3 bg-slate-50 dark:bg-slate-700 rounded-xl px-4 py-2.5">
                      <Calendar size={14} className="text-slate-400 flex-shrink-0" />
                      <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">{b.date}</span>
                      {b.reason && <span className="text-sm text-slate-400">— {b.reason}</span>}
                      <button onClick={() => removeBlockedDate(i)} className="ml-auto text-red-400 hover:text-red-600">
                        <X size={15} />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input type="date" value={newBlockedDate.date}
                    onChange={e => setNewBlockedDate(d => ({ ...d, date: e.target.value }))}
                    className="px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-xl text-sm flex-shrink-0 dark:bg-slate-700 dark:text-white focus:ring-2 focus:ring-[#137fec] outline-none" />
                  <input type="text" placeholder="Reason (optional)" value={newBlockedDate.reason}
                    onChange={e => setNewBlockedDate(d => ({ ...d, reason: e.target.value }))}
                    className="flex-1 px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-xl text-sm dark:bg-slate-700 dark:text-white focus:ring-2 focus:ring-[#137fec] outline-none" />
                  <button onClick={addBlockedDate} disabled={!newBlockedDate.date}
                    className="px-4 py-2 bg-[#137fec] text-white text-sm font-bold rounded-xl hover:bg-blue-600 disabled:opacity-60 flex-shrink-0">
                    Add Date
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

        {/* ── Doctor Schedules Tab ──────────────────────────────────────────── */}
        {activeTab === 'invoice' && <InvoiceSettingsTab />}

        {activeTab === 'prescription' && <PrescriptionSettingsTab />}

        {activeTab === 'doctorSchedules' && (
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-5">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="font-bold text-slate-800 dark:text-white text-lg">Doctor Schedules</h3>
                <p className="text-xs text-slate-400 mt-0.5">Configure which doctors are bookable online and their available hours</p>
              </div>
            </div>

            {bookingDoctorsLoading ? (
              <div className="flex items-center justify-center py-10 text-slate-400">
                <Loader2 size={22} className="animate-spin mr-2" /> Loading doctors…
              </div>
            ) : bookingDoctors.length === 0 ? (
              <p className="text-center py-8 text-slate-400">No doctors found. Add doctors in the Doctors tab first.</p>
            ) : (
              <div className="space-y-3">
                {bookingDoctors.map(doctor => (
                  <div key={doctor._id}
                    className="flex items-center gap-3 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-slate-800 dark:text-white truncate">{doctor.name}</p>
                      {doctor.specialization && (
                        <p className="text-xs text-slate-400">{doctor.specialization}</p>
                      )}
                    </div>
                    <span className={`flex-shrink-0 px-2.5 py-1 text-xs font-semibold rounded-full ${
                      doctor.isBookable
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                        : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'
                    }`}>
                      {doctor.isBookable ? 'Bookable' : 'Not Bookable'}
                    </span>
                    <button
                      onClick={() => setScheduleModal(doctor)}
                      className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300">
                      <Edit2 size={12} /> Configure
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </div>

      {/* Unified Add chooser */}
      {showAddChooser && (
        <AddClinicalDataModal
          tab={treatmentTab}
          onClose={() => setShowAddChooser(false)}
          onPickSingle={() => { setShowAddChooser(false); setShowSingleAdd(true); }}
          onPickQuickEntry={() => {
            setShowAddChooser(false);
            setBulkMode(true);
            if (bulkItems.length === 0) {
              if (treatmentTab === 'treatments') setBulkItems([{ name: '', category: '', cost: 0, description: '' }]);
              else if (treatmentTab === 'diagnoses') setBulkItems([{ name: '', code: '', category: '', description: '' }]);
              else setBulkItems([{ name: '', category: '', description: '' }]);
            }
          }}
          onPickBulkUpload={() => { setShowAddChooser(false); setShowBulkUpload(true); }}
          onPickLibrary={() => { setShowAddChooser(false); navigate(`/settings/import-catalog?type=${treatmentTab}`); }}
        />
      )}

      {showSingleAdd && (
        <SingleClinicalItemModal
          tab={treatmentTab}
          onClose={() => setShowSingleAdd(false)}
          onSaved={fetchTreatmentData}
        />
      )}

      {showBulkUpload && (
        <BulkUploadClinicalModal
          tab={treatmentTab}
          onClose={() => setShowBulkUpload(false)}
          onComplete={fetchTreatmentData}
        />
      )}

      {/* Doctor Schedule Modal */}
      {scheduleModal && (
        <DoctorScheduleModal
          doctor={scheduleModal}
          onClose={() => setScheduleModal(null)}
          onSaved={handleDoctorScheduleSaved}
        />
      )}

      {/* Service Modal */}
      {/* Doctor Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
              <h3 className="font-bold text-lg text-slate-800 dark:text-white">
                {editingDoctor ? 'Edit Doctor' : 'Add Doctor'}
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmitDoctor} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <input
                  type="text"
                  name="name"
                  placeholder="Full Name"
                  value={doctorFormData.name}
                  onChange={handleDoctorChange}
                  required
                  className="col-span-2 px-3 py-2.5 border border-slate-300 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-[#137fec] outline-none bg-white dark:bg-slate-800"
                />
                <input
                  type="text"
                  name="specialization"
                  placeholder="Specialization"
                  value={doctorFormData.specialization}
                  onChange={handleDoctorChange}
                  className="px-3 py-2.5 border border-slate-300 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-[#137fec] outline-none bg-white dark:bg-slate-800"
                />
                <input
                  type="text"
                  name="qualification"
                  placeholder="Qualification (BDS/MDS)"
                  value={doctorFormData.qualification}
                  onChange={handleDoctorChange}
                  className="px-3 py-2.5 border border-slate-300 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-[#137fec] outline-none bg-white dark:bg-slate-800"
                />
                <input
                  type="email"
                  name="email"
                  placeholder="Email"
                  value={doctorFormData.email}
                  onChange={handleDoctorChange}
                  className="px-3 py-2.5 border border-slate-300 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-[#137fec] outline-none bg-white dark:bg-slate-800"
                />
                <input
                  type="tel"
                  name="phone"
                  placeholder="Phone"
                  value={doctorFormData.phone}
                  onChange={handleDoctorChange}
                  className="px-3 py-2.5 border border-slate-300 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-[#137fec] outline-none bg-white dark:bg-slate-800"
                />
                <input
                  type="text"
                  name="license_number"
                  placeholder="License Number"
                  value={doctorFormData.license_number}
                  onChange={handleDoctorChange}
                  className="px-3 py-2.5 border border-slate-300 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-[#137fec] outline-none bg-white dark:bg-slate-800"
                />
                <input
                  type="number"
                  name="experience_years"
                  placeholder="Years of Experience"
                  value={doctorFormData.experience_years}
                  onChange={handleDoctorChange}
                  min="0"
                  className="px-3 py-2.5 border border-slate-300 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-[#137fec] outline-none bg-white dark:bg-slate-800"
                />
              </div>

              {/* Active Status */}
              <div className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-700 rounded-xl">
                <input
                  type="checkbox"
                  name="is_active"
                  checked={doctorFormData.is_active}
                  onChange={handleDoctorChange}
                  className="w-5 h-5 rounded cursor-pointer"
                />
                <label className="text-sm font-semibold text-slate-700 dark:text-slate-300 cursor-pointer">
                  Mark as Active
                </label>
              </div>

              {/* Availability */}
              <div className="border-t border-slate-200 dark:border-slate-700 pt-4">
                <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">Weekly Availability</h4>
                <div className="space-y-2">
                  {['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map(day => (
                    <div key={day} className="flex flex-col xs:flex-row xs:items-center gap-1.5 xs:gap-3">
                      <label className="xs:w-24 text-xs font-semibold text-slate-500 uppercase xs:normal-case xs:text-sm xs:font-medium xs:text-slate-700 dark:text-slate-300 capitalize">
                        {day}
                      </label>
                      <div className="flex items-center gap-2 flex-1">
                        <input
                          type="time"
                          name={`availability_${day}_start`}
                          value={doctorFormData.availability[day]?.start || ''}
                          onChange={handleDoctorChange}
                          className="flex-1 min-w-0 px-2 py-1.5 border border-slate-300 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-[#137fec] outline-none bg-white dark:bg-slate-800"
                        />
                        <span className="text-slate-400 text-xs flex-shrink-0">to</span>
                        <input
                          type="time"
                          name={`availability_${day}_end`}
                          value={doctorFormData.availability[day]?.end || ''}
                          onChange={handleDoctorChange}
                          className="flex-1 min-w-0 px-2 py-1.5 border border-slate-300 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-[#137fec] outline-none bg-white dark:bg-slate-800"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Notes */}
              <textarea
                name="notes"
                placeholder="Additional Notes"
                value={doctorFormData.notes}
                onChange={handleDoctorChange}
                rows="3"
                className="w-full px-3 py-2.5 border border-slate-300 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-[#137fec] outline-none bg-white dark:bg-slate-800 resize-none"
              />

              {/* Actions */}
              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-5 py-2.5 rounded-xl border border-slate-300 text-slate-600 font-semibold text-sm hover:bg-slate-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className={`px-6 py-2.5 rounded-xl bg-[#137fec] hover:bg-blue-600 text-white font-semibold text-sm transition-colors ${
                    loading ? 'opacity-70 cursor-not-allowed' : ''
                  }`}
                >
                  {loading ? 'Saving...' : 'Save Doctor'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default SettingsPage;
