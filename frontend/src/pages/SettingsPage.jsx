import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Edit2, Trash2, X, Download, Upload, Mail, CheckCircle, XCircle, RefreshCw, FileSpreadsheet, ExternalLink, Loader2, Calendar, Clock, Globe, Copy, Link2, BookOpen, ChevronDown, Eye, Coins } from 'lucide-react';
import API from '../services/api';
import AddClinicalDataModal from '../modals/AddClinicalDataModal';
import SingleClinicalItemModal from '../modals/SingleClinicalItemModal';
import BulkUploadClinicalModal from '../modals/BulkUploadClinicalModal';
import { useAuth } from '../Context/AuthContext';

// Best-effort cleanup of a replaced/removed branding image (logo, payment QR,
// doctor signature) from Cloudinary. Fire-and-forget: never blocks or fails the
// UI action — an orphaned asset is harmless, so we only log on error.
function deleteBrandingImage(url) {
  if (!url) return;
  API.delete('/documents/image', { data: { url } })
    .catch(err => console.warn('Branding image cleanup failed (non-fatal):', err?.message));
}

function ToggleSwitch({ enabled, onChange, disabled = false }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={!!enabled}
      disabled={disabled}
      onClick={() => !disabled && onChange?.(!enabled)}
      className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-[#137fec] focus:ring-offset-2 ${enabled ? 'bg-[#137fec]' : 'bg-slate-300 dark:bg-slate-600'} ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${enabled ? 'translate-x-5' : 'translate-x-0.5'}`}
      />
    </button>
  );
}

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
  monday:    { isOpen: true,  shifts: [{ start: '09:00', end: '17:00' }] },
  tuesday:   { isOpen: true,  shifts: [{ start: '09:00', end: '17:00' }] },
  wednesday: { isOpen: true,  shifts: [{ start: '09:00', end: '17:00' }] },
  thursday:  { isOpen: true,  shifts: [{ start: '09:00', end: '17:00' }] },
  friday:    { isOpen: true,  shifts: [{ start: '09:00', end: '17:00' }] },
  saturday:  { isOpen: true,  shifts: [{ start: '10:00', end: '14:00' }] },
  sunday:    { isOpen: false, shifts: [] },
};

// Normalize a stored bookingWorkingHours day into the {isOpen, shifts[]} shape,
// converting the legacy {start,end,breaks} representation into shifts.
function normalizeBookingDay(day, fallback) {
  if (!day || (day.isOpen === undefined && !day.shifts && !day.start)) return { ...fallback };
  if (Array.isArray(day.shifts) && day.shifts.length > 0) {
    return { isOpen: !!day.isOpen, shifts: day.shifts };
  }
  if (day.start && day.end) {
    return { isOpen: !!day.isOpen, shifts: [{ start: day.start, end: day.end }] };
  }
  return { isOpen: !!day.isOpen, shifts: [] };
}

function toSlug(str) {
  return (str || '').toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

// ─── Shared DayRow component ──────────────────────────────────────────────────

function DayRow({ day, schedule, onChange }) {
  const label = day.charAt(0).toUpperCase() + day.slice(1);
  const s = schedule || { isOpen: false, shifts: [] };
  const shifts = s.shifts || [];

  const set = patch => onChange(day, { ...s, ...patch });

  const toggleOpen = checked => {
    if (checked && shifts.length === 0) set({ isOpen: true, shifts: [{ start: '09:00', end: '17:00' }] });
    else set({ isOpen: checked });
  };
  const addShift = () => set({ isOpen: true, shifts: [...shifts, { start: '09:00', end: '17:00' }] });
  const removeShift = i => set({ shifts: shifts.filter((_, idx) => idx !== i) });
  const updateShift = (i, field, val) => {
    const updated = [...shifts];
    updated[i] = { ...updated[i], [field]: val };
    set({ shifts: updated });
  };

  return (
    <div className="border border-slate-200 dark:border-slate-700 rounded-xl p-3 mb-2">
      <div className="flex items-center gap-3 flex-wrap">
        <label className="flex items-center gap-2 cursor-pointer min-w-[110px]">
          <input type="checkbox" checked={!!s.isOpen} onChange={e => toggleOpen(e.target.checked)}
            className="w-4 h-4 accent-[#137fec]" />
          <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">{label}</span>
        </label>
        {s.isOpen && (
          <button onClick={addShift}
            className="text-xs text-[#137fec] hover:underline font-medium ml-auto">+ Add Shift</button>
        )}
        {!s.isOpen && <span className="text-xs text-slate-400 italic">Closed</span>}
      </div>
      {s.isOpen && (
        <div className="mt-2 ml-6 space-y-1">
          {shifts.map((sh, i) => (
            <div key={i} className="flex items-center gap-2 text-xs text-slate-500">
              <span>Shift:</span>
              <input type="time" value={sh.start || ''} onChange={e => updateShift(i, 'start', e.target.value)}
                className="px-2 py-1 border border-slate-200 dark:border-slate-600 rounded text-xs dark:bg-slate-800 dark:text-white" />
              <span>–</span>
              <input type="time" value={sh.end || ''} onChange={e => updateShift(i, 'end', e.target.value)}
                className="px-2 py-1 border border-slate-200 dark:border-slate-600 rounded text-xs dark:bg-slate-800 dark:text-white" />
              <button onClick={() => removeShift(i)} className="text-red-400 hover:text-red-600 ml-1">
                <X size={12} />
              </button>
            </div>
          ))}
          {shifts.length === 0 && <span className="text-xs text-slate-400 italic">No shifts — add one.</span>}
        </div>
      )}
    </div>
  );
}

// ─── Doctor Schedule Modal ────────────────────────────────────────────────────

function DoctorScheduleModal({ doctor, onClose, onSaved }) {
  const [form, setForm] = useState({
    isBookable: false,
    useCustomBookingSchedule: false,
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
          useCustomBookingSchedule: data.useCustomBookingSchedule || false,
          bookingWorkingHours: Object.fromEntries(
            BOOKING_DAYS.map(d => [d, normalizeBookingDay(data.bookingWorkingHours?.[d], DEFAULT_DOCTOR_WH[d])])
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
                {/* Custom schedule toggle */}
                <div className="flex items-center justify-between border border-slate-200 dark:border-slate-700 rounded-xl p-3">
                  <div>
                    <p className="font-semibold text-slate-800 dark:text-white text-sm">Use a custom schedule for online booking</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {form.useCustomBookingSchedule
                        ? 'Online booking uses the hours configured below.'
                        : "Online booking reuses this doctor's Weekly Availability from the Doctors tab."}
                    </p>
                  </div>
                  <button
                    onClick={() => setForm(f => ({ ...f, useCustomBookingSchedule: !f.useCustomBookingSchedule }))}
                    className={`relative inline-flex h-6 w-11 rounded-full transition-colors flex-shrink-0 ml-3 ${form.useCustomBookingSchedule ? 'bg-[#137fec]' : 'bg-slate-300 dark:bg-slate-600'}`}
                  >
                    <span className={`inline-block h-4 w-4 mt-1 rounded-full bg-white shadow transition-transform ${form.useCustomBookingSchedule ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                </div>

                {/* Working Hours — only when using a custom schedule */}
                {form.useCustomBookingSchedule && (
                  <div>
                    <p className="text-sm font-bold text-slate-700 dark:text-slate-200 mb-3">Working Hours</p>
                    {BOOKING_DAYS.map(day => (
                      <DayRow key={day} day={day}
                        schedule={form.bookingWorkingHours[day]}
                        onChange={setDayWH} />
                    ))}
                  </div>
                )}

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

// ─── Email Tab ────────────────────────────────────────────────────────────────



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

// ─── AI Credits Tab (read-only, mobile-first) ─────────────────────────────────
// Owner-facing view of the clinic's AI report credits + usage history. Top-ups
// are done by the administrator in Connect Desk; this view is read-only.
const CREDIT_TYPE_STYLE = {
  topup:      { light: 'bg-green-100 text-green-700', dark: 'dark:bg-green-900/40 dark:text-green-400' },
  debit:      { light: 'bg-red-100 text-red-700',     dark: 'dark:bg-red-900/40 dark:text-red-400' },
  adjustment: { light: 'bg-amber-100 text-amber-700', dark: 'dark:bg-amber-900/40 dark:text-amber-400' },
};

function CreditsTab() {
  const [balance, setBalance] = useState(null);
  const [ledger, setLedger] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const [bal, led] = await Promise.all([
          API.get('/credits/balance'),
          API.get('/credits/ledger', { params: { limit: 100 } }),
        ]);
        if (!alive) return;
        setBalance(bal.data);
        setLedger(led.data || []);
      } catch (err) {
        console.error('Failed to load credits:', err.message);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const credits = balance?.credits ?? 0;
  const low = credits < 5;

  const typeBadge = (type) => {
    const s = CREDIT_TYPE_STYLE[type] || { light: 'bg-slate-100 text-slate-600', dark: 'dark:bg-slate-700 dark:text-slate-300' };
    return `inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${s.light} ${s.dark}`;
  };
  const fmt = (n) => (n >= 0 ? '+' : '') + Number(n).toFixed(2);
  const fmtDuration = (seconds) => {
    const s = Math.max(0, Math.round(seconds || 0));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };

  if (loading) {
    return <div className="flex justify-center py-20"><Loader2 className="animate-spin text-slate-400" size={28} /></div>;
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Balance card */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg p-5 sm:p-6">
        <div className="flex items-center gap-4">
          <div className={`flex items-center justify-center rounded-2xl size-14 sm:size-16 shrink-0 ${low ? 'bg-amber-100 dark:bg-amber-900/30' : 'bg-blue-100 dark:bg-blue-900/30'}`}>
            <Coins className={low ? 'text-amber-500' : 'text-[#137fec]'} size={30} />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">AI Report Credits</p>
            <p className={`text-3xl sm:text-4xl font-bold ${low ? 'text-amber-500' : 'text-slate-800 dark:text-white'}`}>{Number(credits).toFixed(2)}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">1 credit = 1 minute of dictation</p>
          </div>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-4 bg-slate-50 dark:bg-slate-700/40 rounded-lg px-3 py-2.5">
          {low ? 'Your balance is running low. ' : ''}Credits are consumed when a voice dictation is turned into a report.
          To add more credits, please contact your administrator.
        </p>
      </div>

      {/* Ledger */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg p-4 sm:p-6">
        <h3 className="font-bold text-slate-800 dark:text-white mb-4">Usage History</h3>
        {ledger.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-8">No credit activity yet.</p>
        ) : (
          <>
            {/* Mobile: stacked cards */}
            <div className="space-y-2 md:hidden">
              {ledger.map((r, i) => (
                <div key={r._id || i} className="flex items-center justify-between rounded-xl border border-slate-100 dark:border-slate-700 px-3 py-2.5">
                  <div className="min-w-0">
                    <span className={typeBadge(r.type)}>{r.type}</span>
                    {r.meta?.patientName && <span className="ml-2 text-xs font-semibold text-slate-700 dark:text-slate-200">{r.meta.patientName}</span>}
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                      {r.at ? new Date(r.at).toLocaleString('en-GB') : ''}
                      {r.meta?.durationSeconds ? ` · ${fmtDuration(r.meta.durationSeconds)} spoken` : ''}
                      {r.meta?.templateCount ? ` · ${r.meta.templateCount} report(s)` : ''}
                      {r.meta?.source ? ` · ${r.meta.source}` : ''}
                    </p>
                    {r.meta?.note && <p className="text-[11px] text-slate-400 dark:text-slate-500 italic mt-0.5 truncate">“{r.meta.note}”</p>}
                  </div>
                  <div className="text-right shrink-0 ml-3">
                    <p className={`text-sm font-bold ${r.seconds >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>{fmt(r.credits)}</p>
                    <p className="text-[10px] text-slate-400">bal {Number(r.balanceCredits).toFixed(2)}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop: table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-700 text-left">
                    <th className="py-2 pr-4 text-[11px] font-bold text-slate-500 uppercase tracking-wide">Date</th>
                    <th className="py-2 pr-4 text-[11px] font-bold text-slate-500 uppercase tracking-wide">Type</th>
                    <th className="py-2 pr-4 text-[11px] font-bold text-slate-500 uppercase tracking-wide">Patient</th>
                    <th className="py-2 pr-4 text-[11px] font-bold text-slate-500 uppercase tracking-wide">Details</th>
                    <th className="py-2 pr-4 text-[11px] font-bold text-slate-500 uppercase tracking-wide text-right">Credits</th>
                    <th className="py-2 text-[11px] font-bold text-slate-500 uppercase tracking-wide text-right">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {ledger.map((r, i) => (
                    <tr key={r._id || i} className="border-b border-slate-100 dark:border-slate-700/60">
                      <td className="py-2.5 pr-4 text-slate-600 dark:text-slate-300 whitespace-nowrap">{r.at ? new Date(r.at).toLocaleString('en-GB') : '—'}</td>
                      <td className="py-2.5 pr-4"><span className={typeBadge(r.type)}>{r.type}</span></td>
                      <td className="py-2.5 pr-4 text-slate-600 dark:text-slate-300">{r.meta?.patientName || '—'}</td>
                      <td className="py-2.5 pr-4 text-xs text-slate-500 dark:text-slate-400">
                        {r.meta?.durationSeconds ? `${fmtDuration(r.meta.durationSeconds)} spoken` : ''}
                        {r.meta?.templateCount ? ` · ${r.meta.templateCount} report(s)` : ''}
                        {r.meta?.source ? ` · ${r.meta.source}` : ''}
                        {r.meta?.note ? <span className="italic text-slate-400"> · “{r.meta.note}”</span> : ''}
                      </td>
                      <td className={`py-2.5 pr-4 text-right font-bold ${r.seconds >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>{fmt(r.credits)}</td>
                      <td className="py-2.5 text-right text-slate-600 dark:text-slate-300">{Number(r.balanceCredits).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const LANG_LABELS = { en: 'English', hi: 'Hindi', mr: 'Marathi' };

// Frontend-only preset templates — imported into the automation editor
const EMAIL_PRESETS = {
  appointmentBooked: [
    {
      name: 'Appointment Scheduled (Formal)',
      subject: 'Your appointment is scheduled — {{date}}',
      body: 'Dear {{first_name}},\n\nThis is to confirm your appointment with {{doctor}} on {{date}} at {{time}}.\n\nPlease arrive 10 minutes before your scheduled time.\n\nWarm regards,\n{{clinic}}',
    },
    {
      name: 'Appointment Scheduled (Friendly)',
      subject: "Great, you're booked! See you on {{date}} 😊",
      body: "Hi {{first_name}},\n\nJust confirming your appointment with {{doctor}} on {{date}} at {{time}}. We're looking forward to seeing you!\n\nAny questions? Just reply to this email.\n\nBest,\n{{clinic}}",
    },
    {
      name: 'Appointment Scheduled (Minimal)',
      subject: 'Appointment Scheduled',
      body: 'Dear {{name}},\n\nYour appointment with {{doctor}} on {{date}} at {{time}} has been scheduled.\n\nSee you soon,\n{{clinic}}',
    },
  ],
  appointmentCompleted: [
    {
      name: 'Thank You — Standard',
      subject: 'Thank you for your visit — {{date}}',
      body: 'Dear {{first_name}},\n\nThank you for visiting us today. Your appointment with {{doctor}} on {{date}} has been completed.\n\nTreatments received: {{treatments}}.\n\nFor any queries, feel free to reach out to us.\n\nWarm regards,\n{{clinic}}',
    },
    {
      name: 'Post-Visit Follow-Up',
      subject: 'Your visit is complete — follow-up care inside',
      body: "Hi {{first_name}},\n\nYour appointment with {{doctor}} on {{date}} is now complete.\n\nTreatments completed: {{treatments}}.\n\nPlease follow the post-care instructions from your doctor. If you experience any discomfort, don't hesitate to contact us.\n\nLooking forward to seeing you again!\n\n{{clinic}}",
    },
    {
      name: 'Simple Thank You',
      subject: 'Visit Complete — {{date}}',
      body: "Dear {{name}},\n\nThank you for your visit on {{date}} with {{doctor}}. We hope you're feeling great.\n\nWarm regards,\n{{clinic}}",
    },
  ],
};

function EmailTab() {
  const [emailSubTab, setEmailSubTab] = useState('connection');

  // Settings state
  const [settings, setSettings] = useState(null);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [smtpForm, setSmtpForm] = useState({
    mode: 'gmail', enabled: false, automationEnabled: false,
    fromName: '', replyTo: '',
    smtp: { host: 'smtp.gmail.com', port: 465, secure: true, user: '', password: '' },
    events: {
      appointmentBooked:    { enabled: false, delayMinutes: 0, subject: '', body: '' },
      appointmentCompleted: { enabled: false, delayMinutes: 0, subject: '', body: '' },
    },
  });
  const [testEmail, setTestEmail] = useState('');
  const [testStatus, setTestStatus] = useState(null); // null | 'sending' | 'ok' | 'fail'
  const [testError, setTestError] = useState('');
  const [saveBanner, setSaveBanner] = useState(null); // null | { ok, msg }
  const [showGuide, setShowGuide] = useState(false);

  // Per-event preset picker: which event has the picker open
  const [presetPickerOpen, setPresetPickerOpen] = useState(null); // null | 'appointmentBooked' | 'appointmentCompleted'

  // Logs state
  const [logs, setLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsFilter, setLogsFilter] = useState({ event: '', status: '' });
  const [expandedLog, setExpandedLog] = useState(null);

  useEffect(() => {
    fetchSettings();
  }, []);

  useEffect(() => {
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
        replyTo:          res.data.replyTo || '',
        smtp: {
          host:     res.data.smtp?.host || 'smtp.gmail.com',
          port:     res.data.smtp?.port || 465,
          secure:   res.data.smtp?.secure !== false,
          user:     res.data.smtp?.user || '',
          password: '', // never pre-fill password
        },
        events: {
          appointmentBooked:    { enabled: false, delayMinutes: 0, subject: '', body: '', ...(res.data.events?.appointmentBooked    || {}) },
          appointmentCompleted: { enabled: false, delayMinutes: 0, subject: '', body: '', ...(res.data.events?.appointmentCompleted || {}) },
        },
      });
    } catch (err) {
      console.error('Failed to load email settings:', err);
    }
  }

  function applyPreset(event, preset) {
    setSmtpForm(f => ({
      ...f,
      events: { ...f.events, [event]: { ...f.events[event], subject: preset.subject, body: preset.body } },
    }));
    setPresetPickerOpen(null);
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
        {['connection', 'automation', 'logs'].map(t => (
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
                          <p className="text-xs text-slate-500 mt-0.5">Scroll down on the page to find the <strong>Security</strong> section on the left. Look for the section titled <strong>"How you sign in to Google"</strong> and locate the <strong>2-Step Verification</strong> option.</p>
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
            <p><strong>Toggle</strong> — Turn each event on or off independently. Both automations can run at the same time.</p>
            <p><strong>Delay (minutes)</strong> — How many minutes after the event to wait before sending. Set to 0 to send immediately.</p>
            <p><strong>Subject & Body</strong> — Use "Choose from templates" to start from a preset, then edit freely. Use <code className="bg-slate-100 px-1 rounded">{'{{variables}}'}</code> to personalise. If left blank, a built-in default is used.</p>
          </div>

          {/* Per-event editors */}
          <div className="space-y-6">
            {Object.keys(EVENT_LABELS).map(event => {
              const evtVars = event === 'appointmentBooked'
                ? ['{{first_name}}', '{{name}}', '{{doctor}}', '{{date}}', '{{time}}', '{{clinic}}']
                : ['{{first_name}}', '{{name}}', '{{doctor}}', '{{date}}', '{{treatments}}', '{{clinic}}'];

              return (
                <div key={event} className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
                  {/* Header row */}
                  <div className="flex items-center justify-between px-4 py-3 bg-slate-50 dark:bg-slate-700/50">
                    <div>
                      <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">{EVENT_LABELS[event]}</p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {event === 'appointmentBooked'    && 'Confirmation email sent when a new appointment is created'}
                        {event === 'appointmentCompleted' && 'Plain-text notification sent when an appointment is marked Completed'}
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

                  <div className="p-4 space-y-3">
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

                    {/* Choose from templates button (collapsible) */}
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setPresetPickerOpen(presetPickerOpen === event ? null : event)}
                        className="flex items-center gap-1.5 text-xs font-semibold text-[#137fec] hover:text-blue-700 px-3 py-1.5 border border-blue-200 rounded-lg bg-blue-50 hover:bg-blue-100 transition-colors"
                      >
                        <BookOpen size={12} /> Choose from templates
                        <ChevronDown size={12} className={`transition-transform ${presetPickerOpen === event ? 'rotate-180' : ''}`} />
                      </button>

                      {presetPickerOpen === event && (
                        <div className="mt-1.5 border border-slate-200 rounded-xl shadow-lg bg-white dark:bg-slate-800 overflow-hidden z-10 relative">
                          <p className="px-3 py-2 text-[11px] font-bold text-slate-400 uppercase tracking-wide border-b border-slate-100">
                            Select a preset — it will fill the subject & body below
                          </p>
                          {(EMAIL_PRESETS[event] || []).map((preset, i) => (
                            <button
                              key={i}
                              type="button"
                              onClick={() => applyPreset(event, preset)}
                              className="w-full text-left px-3 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors border-b border-slate-50 last:border-0"
                            >
                              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{preset.name}</p>
                              <p className="text-xs text-slate-400 truncate mt-0.5">{preset.subject}</p>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Subject */}
                    <div>
                      <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Subject Line</label>
                      <input
                        type="text"
                        value={smtpForm.events?.[event]?.subject || ''}
                        onChange={e => setSmtpForm(f => ({
                          ...f,
                          events: { ...f.events, [event]: { ...f.events[event], subject: e.target.value } }
                        }))}
                        placeholder={event === 'appointmentBooked'
                          ? 'Your appointment is confirmed — {{date}}'
                          : 'Thank you for your visit — {{date}}'}
                        className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-800 focus:ring-2 focus:ring-[#137fec] outline-none"
                      />
                    </div>

                    {/* Body */}
                    <div>
                      <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Email Body</label>
                      <textarea
                        rows={6}
                        value={smtpForm.events?.[event]?.body || ''}
                        onChange={e => setSmtpForm(f => ({
                          ...f,
                          events: { ...f.events, [event]: { ...f.events[event], body: e.target.value } }
                        }))}
                        placeholder={event === 'appointmentBooked'
                          ? 'Dear {{first_name}},\n\nYour appointment with {{doctor}} is confirmed for {{date}} at {{time}}.\n\nWarm regards,\n{{clinic}}'
                          : 'Dear {{first_name}},\n\nThank you for your visit on {{date}} with {{doctor}}.\n\nTreatments: {{treatments}}\n\nWarm regards,\n{{clinic}}'}
                        className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg text-sm font-mono bg-white dark:bg-slate-800 focus:ring-2 focus:ring-[#137fec] outline-none resize-y"
                      />
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {evtVars.map(v => (
                          <code key={v} className="text-[10px] bg-blue-50 text-blue-600 border border-blue-100 px-1.5 py-0.5 rounded font-mono">{v}</code>
                        ))}
                      </div>
                      <p className="text-[10px] text-slate-400 mt-1">Click a variable chip above to see what it resolves to. Leave subject/body blank to use the built-in default.</p>
                    </div>

                  {/* Document selection — only for appointmentCompleted */}
                  {event === 'appointmentCompleted' && (
                    <div className="space-y-1.5 pt-1 border-t border-slate-100 dark:border-slate-700">
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
                </div>
              );
            })}
          </div>

          <button onClick={saveSettings} disabled={settingsSaving} className="px-6 py-2.5 bg-[#137fec] hover:bg-blue-600 text-white font-semibold rounded-xl text-sm transition-colors disabled:opacity-60">
            {settingsSaving ? 'Saving...' : 'Save Automation Settings'}
          </button>
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

    </div>
  );
}

// ─── Report-delivery variable helpers ────────────────────────────────────────

const REPORT_VARS = [
  { token: 'patientName',  label: 'Patient name' },
  { token: 'firstName',    label: 'First name' },
  { token: 'doctorName',   label: 'Doctor name' },
  { token: 'clinicName',   label: 'Clinic name' },
  { token: 'date',         label: 'Date' },
  { token: 'templateName', label: 'Report type' },
];

const REPORT_SAMPLE = {
  patientName: 'Jane Doe', firstName: 'Jane', doctorName: 'Dr. Smith',
  clinicName: 'City Dental', date: '23 May 2026', templateName: 'H&P Note',
};

function renderReportVars(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/\{\{(\w+)\}\}/g, (_, k) => (REPORT_SAMPLE[k] ?? `{{${k}}}`));
}

// ─── Document preview components ─────────────────────────────────────────────

function DocSheet({ children, label }) {
  return (
    <div className="flex flex-col gap-2 min-h-0">
      <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide flex items-center gap-1.5 flex-shrink-0">
        <Eye size={12} /> {label}
      </p>
      <div className="rounded-xl shadow-md border border-slate-200 bg-white overflow-hidden flex-1 min-h-0">
        <div className="overflow-y-auto h-full" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
          {children}
        </div>
      </div>
      <p className="text-[10px] text-slate-400 text-center flex-shrink-0">
        Sample — reflects your saved clinic settings.
      </p>
    </div>
  );
}

function InvoiceDocPreview({ clinicInfo }) {
  const clinic  = clinicInfo?.name    || 'Your Clinic';
  const phone   = clinicInfo?.phone   || '';
  const email   = clinicInfo?.email   || '';
  const address = clinicInfo?.address || '';
  const ITEMS = [
    { name: 'Root Canal Treatment', qty: 1, rate: 2500, total: 2500 },
    { name: 'Scaling & Polishing',  qty: 1, rate:  800, total:  800 },
    { name: 'Consultation Fee',     qty: 1, rate:  200, total:  200 },
  ];
  return (
    <DocSheet label="Invoice preview">
      <div className="px-4 pt-4 pb-3 border-b border-slate-100 text-center">
        <p className="font-bold text-sm text-slate-800">{clinic}</p>
        {address && <p className="text-[10px] text-slate-500 mt-0.5">{address}</p>}
        {(phone || email) && <p className="text-[10px] text-slate-500 mt-0.5">{[phone, email].filter(Boolean).join('  ·  ')}</p>}
      </div>
      <div className="px-4 py-3 flex justify-between items-start border-b border-slate-100">
        <div>
          <p className="text-base font-bold text-slate-700 uppercase tracking-wide">Invoice</p>
          <p className="text-xs text-slate-400 mt-0.5">INV-2026-042</p>
        </div>
        <div className="text-right text-xs text-slate-500 space-y-0.5">
          <p>15 May 2026</p>
          <p className="font-medium text-slate-700">Rahul Sharma</p>
        </div>
      </div>
      <div className="px-4 pt-3">
        <table className="w-full text-[10px]">
          <thead>
            <tr className="border-b border-slate-100 text-slate-400">
              <th className="text-left pb-1.5">Item</th>
              <th className="text-right pb-1.5">Qty</th>
              <th className="text-right pb-1.5">Total</th>
            </tr>
          </thead>
          <tbody>
            {ITEMS.map(it => (
              <tr key={it.name} className="border-b border-slate-50">
                <td className="py-1.5 text-slate-600">{it.name}</td>
                <td className="py-1.5 text-right text-slate-500">{it.qty}</td>
                <td className="py-1.5 text-right font-medium">₹{it.total.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="text-right py-3 space-y-0.5 text-xs">
          <p className="text-slate-400">Subtotal: <span className="text-slate-600">₹3,500</span></p>
          <p className="font-bold text-slate-800">Total: ₹3,500</p>
          <p className="text-green-600 font-semibold">Paid: ₹3,500</p>
        </div>
      </div>
    </DocSheet>
  );
}

function PrescriptionDocPreview({ clinicInfo }) {
  const clinic = clinicInfo?.name || 'Your Clinic';
  const RX = [
    { drug: 'Amoxicillin 500mg', dosage: '1 tab', freq: 'TID × 5 days' },
    { drug: 'Ibuprofen 400mg',   dosage: '1 tab', freq: 'BD × 3 days' },
  ];
  return (
    <DocSheet label="Prescription preview">
      <div className="px-4 pt-4 pb-3 border-b border-slate-100 text-center">
        <p className="font-bold text-sm text-slate-800">{clinic}</p>
        <p className="text-[10px] text-slate-400 mt-0.5">Prescription</p>
      </div>
      <div className="px-4 py-3">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-2xl font-serif text-slate-600">℞</span>
          <div className="text-xs text-slate-500">
            <p>Patient: <span className="font-medium text-slate-700">Rahul Sharma</span></p>
            <p>Doctor: <span className="font-medium text-slate-700">Dr. Rajan</span></p>
          </div>
        </div>
        <div className="space-y-2">
          {RX.map(rx => (
            <div key={rx.drug} className="bg-slate-50 rounded-lg p-2 text-xs">
              <p className="font-semibold text-slate-700">{rx.drug}</p>
              <p className="text-slate-400">{rx.dosage} · {rx.freq}</p>
            </div>
          ))}
        </div>
      </div>
    </DocSheet>
  );
}

function SmartReportDocPreview({ clinicInfo }) {
  const clinic = clinicInfo?.name || 'Your Clinic';
  return (
    <DocSheet label="Smart Report preview">
      <div className="px-4 pt-4 pb-3 border-b border-slate-100 bg-gradient-to-r from-[#1d6fe8] to-[#137fec] text-center">
        <p className="font-bold text-sm text-white">{clinic}</p>
        <p className="text-[10px] text-blue-100 mt-0.5">Visit Summary</p>
      </div>
      <div className="p-4 space-y-3 text-xs">
        <div className="grid grid-cols-2 gap-2">
          {[['Patient','Rahul Sharma'],['Doctor','Dr. Rajan'],['Date','15 May 2026'],['Type','Follow-up']].map(([k,v]) => (
            <div key={k} className="bg-slate-50 rounded p-2">
              <p className="text-slate-400">{k}</p>
              <p className="font-semibold text-slate-700">{v}</p>
            </div>
          ))}
        </div>
        <div>
          <p className="font-bold text-[#137fec] mb-1">Treatments</p>
          {['Root Canal — Tooth 36', 'Scaling & Polishing'].map(t => (
            <div key={t} className="flex items-center gap-2 text-slate-600 bg-slate-50 px-2 py-1.5 rounded mb-1">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 flex-shrink-0" />{t}
            </div>
          ))}
        </div>
        <div>
          <p className="font-bold text-[#137fec] mb-1">Prescription</p>
          <p className="text-slate-600 bg-slate-50 px-2 py-1.5 rounded">Amoxicillin 500mg TID × 5 days</p>
        </div>
      </div>
    </DocSheet>
  );
}

function AIReportEmailPreview({ clinicInfo, richHtml }) {
  const clinic = clinicInfo?.name    || 'Your Clinic';
  const tag    = clinicInfo?.tagline || '';

  if (!richHtml) {
    return (
      <DocSheet label="Email preview — plain text">
        <div className="p-4 space-y-3 text-xs font-mono">
          <p className="text-slate-700 font-semibold">Subject: Your visit summary — 23 May 2026</p>
          <hr className="border-slate-200" />
          <p className="text-slate-500 whitespace-pre-wrap leading-relaxed">{`Hi Jane,\n\nPlease find your H&P Note from Dr. Smith attached.\n\nDate: 23 May 2026\nPatient: Jane Doe\n\nBest regards,\n${clinic}`}</p>
        </div>
        <p className="text-[10px] text-slate-400 text-center p-4 pt-0">Plain-text email your patient receives.</p>
      </DocSheet>
    );
  }

  return (
    <DocSheet label="Email preview — rich HTML">
      <div className="px-4 pt-3 pb-2 border-b border-slate-100 bg-gradient-to-r from-[#1d6fe8] to-[#137fec]">
        <p className="font-bold text-sm text-white">{clinic}</p>
        {tag && <p className="text-[10px] text-blue-100 mt-0.5">{tag}</p>}
        <p className="text-[10px] text-blue-200 mt-0.5">Generated by Molaris AI</p>
      </div>
      <div className="p-4 space-y-2 text-xs">
        <div className="bg-slate-50 rounded-lg p-3 grid grid-cols-2 gap-2">
          {[['Patient','Jane Doe'],['Type','H&P Note'],['Doctor','Dr. Smith'],['Date','23 May 2026']].map(([k,v]) => (
            <div key={k}><p className="text-slate-400">{k}</p><p className="font-semibold text-slate-700">{v}</p></div>
          ))}
        </div>
        <p className="text-slate-500 leading-relaxed">
          Patient presented with chief complaint of sensitivity in lower-left quadrant. Clinical findings suggest early carious lesion on tooth 36…
        </p>
      </div>
      <p className="text-[10px] text-slate-400 text-center p-4 pt-0">Branded HTML email your patient receives.</p>
    </DocSheet>
  );
}

function SectionPreviewPane({ clinicInfo, section, htmlEmailEnabled }) {
  if (section === 'smart_report') return <SmartReportDocPreview  clinicInfo={clinicInfo} />;
  if (section === 'ai_report')    return <AIReportEmailPreview   clinicInfo={clinicInfo} richHtml />;
  if (section === 'send_email')   return <AIReportEmailPreview   clinicInfo={clinicInfo} richHtml={!!htmlEmailEnabled} />;
  return null;
}

// ─── Smart Report info section ────────────────────────────────────────────────

function SmartReportDeliverySection() {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-bold text-slate-700 dark:text-slate-200 mb-1">Smart Report</h3>
        <p className="text-sm text-slate-400 leading-relaxed">
          The Smart Report is a PDF summary of the patient’s visit — treatments, prescriptions, consultation notes, and advice.
          It is generated automatically from the current visit data when you click “Send via Email” on the treatment page.
        </p>
      </div>
      <div className="bg-slate-50 dark:bg-slate-700/40 border border-slate-200 dark:border-slate-700 rounded-xl p-4 space-y-2">
        <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">What it includes</p>
        {['Patient & doctor details', 'All treatments from the current visit', 'Prescriptions', 'Consultation notes & advice'].map(item => (
          <div key={item} className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
            <CheckCircle size={14} className="text-green-500 flex-shrink-0" />{item}
          </div>
        ))}
      </div>
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4">
        <p className="text-xs font-semibold text-blue-700 dark:text-blue-300 mb-1">How to send</p>
        <p className="text-xs text-blue-600 dark:text-blue-400 leading-relaxed">
          On the Treatment page, click <strong>Send Mail</strong> → tick <em>Smart Report</em> → enter the patient’s email → Send.
          You can also automate it via <strong>Settings → Email → Automation</strong>.
        </p>
      </div>
    </div>
  );
}

// ─── AI Report delivery settings (self-contained) ────────────────────────────

function ReportDeliveryTab() {
  const [form, setForm]     = useState(null);
  const [saving, setSaving] = useState(false);
  const [banner, setBanner] = useState(null);

  useEffect(() => {
    API.get('/report/delivery-settings')
      .then(r => setForm(r.data || {}))
      .catch(() => setForm({}));
  }, []);

  function setField(path, value) {
    setForm(prev => {
      const next = { ...prev };
      const keys = path.split('.');
      let cur = next;
      for (let i = 0; i < keys.length - 1; i++) {
        cur[keys[i]] = { ...(cur[keys[i]] || {}) };
        cur = cur[keys[i]];
      }
      cur[keys[keys.length - 1]] = value;
      return next;
    });
  }

  async function save() {
    setSaving(true); setBanner(null);
    try {
      const { _id, __v, createdAt, updatedAt, ...body } = form;
      const res = await API.put('/report/delivery-settings', body);
      setForm(res.data);
      setBanner({ ok: true, msg: 'Saved.' });
    } catch (err) {
      setBanner({ ok: false, msg: err.response?.data?.error || err.message });
    } finally { setSaving(false); }
  }

  if (!form) return <div className="py-8 flex justify-center"><Loader2 size={20} className="animate-spin text-[#137fec]" /></div>;

  return (
    <div className="space-y-6 max-w-lg">
      <section className="space-y-3">
        <h3 className="text-sm font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wide border-b border-slate-100 dark:border-slate-700 pb-1">
          Default Delivery Channels
        </h3>
        <p className="text-xs text-slate-400 leading-relaxed">When the AI Report modal opens, these channels will be pre-ticked for the doctor.</p>
        <div className="space-y-2">
          {[
            { key: 'cloud',    label: 'Save to Connect Cloud', sub: "Saves to the patient's Google Drive folder" },
            { key: 'email',    label: 'Send via Email',         sub: 'Emails the report PDF to the patient' },
          ].map(ch => (
            <label key={ch.key} className="flex items-start gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/40 cursor-pointer">
              <input type="checkbox"
                checked={form.defaults?.[ch.key] ?? false}
                onChange={() => setField(`defaults.${ch.key}`, !(form.defaults?.[ch.key]))}
                className="accent-[#137fec] w-4 h-4 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{ch.label}</p>
                <p className="text-xs text-slate-400">{ch.sub}</p>
              </div>
            </label>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700 pb-1">
          <h3 className="text-sm font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wide flex items-center gap-2">
            Branded PDF
          </h3>
          <ToggleSwitch enabled={!!form.pdf?.enabled} onChange={v => setField('pdf.enabled', v)} />
        </div>
        {form.pdf?.enabled && (
          <div className="space-y-3">
            <p className="text-xs text-slate-400 leading-relaxed">Clinic branding fields appear in the generated PDF header.</p>
            {[
              { field: 'clinicName',    label: 'Clinic Name',    placeholder: 'City Dental Clinic' },
              { field: 'clinicTagline', label: 'Tagline',        placeholder: 'Your smile, our care' },
              { field: 'clinicAddress', label: 'Address',        placeholder: '123 Main St, Mumbai' },
              { field: 'clinicPhone',   label: 'Phone',          placeholder: '+91 98765 43210' },
              { field: 'clinicEmail',   label: 'Email',          placeholder: 'clinic@example.com' },
            ].map(({ field, label, placeholder }) => (
              <div key={field}>
                <label className="text-xs text-slate-500 dark:text-slate-400 block mb-1">{label}</label>
                <input type="text" placeholder={placeholder}
                  value={form.pdf?.[field] || ''}
                  onChange={e => setField(`pdf.${field}`, e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-800 focus:ring-2 focus:ring-[#137fec] outline-none" />
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="flex items-center gap-4 pt-1">
        <button onClick={save} disabled={saving}
          className="px-6 py-2.5 bg-[#137fec] hover:bg-blue-600 text-white font-semibold rounded-xl text-sm transition-colors disabled:opacity-60">
          {saving ? 'Saving…' : 'Save AI Report Settings'}
        </button>
        {banner && (
          <p className={`text-sm font-medium flex items-center gap-1.5 ${banner.ok ? 'text-green-600' : 'text-red-600'}`}>
            {banner.ok ? <CheckCircle size={15} /> : <XCircle size={15} />} {banner.msg}
          </p>
        )}
      </div>
    </div>
  );
}

// ─── AI Report WhatsApp template (self-contained) ────────────────────────────

function AIReportWhatsAppSection() {
  const [form, setForm]     = useState({ whatsapp: { text: '' } });
  const [saving, setSaving] = useState(false);
  const [banner, setBanner] = useState(null);
  const bodyRef             = React.useRef(null);

  useEffect(() => {
    API.get('/report/delivery-settings')
      .then(r => setForm(r.data || {}))
      .catch(() => {});
  }, []);

  function insertVar(token) {
    const el = bodyRef.current;
    const tag = `{{${token}}}`;
    if (el) {
      const start = el.selectionStart;
      const end   = el.selectionEnd;
      const cur   = form.whatsapp?.text || '';
      const next  = cur.slice(0, start) + tag + cur.slice(end);
      setForm(f => ({ ...f, whatsapp: { ...f.whatsapp, text: next } }));
      requestAnimationFrame(() => {
        el.selectionStart = el.selectionEnd = start + tag.length;
        el.focus();
      });
    } else {
      setForm(f => ({ ...f, whatsapp: { ...f.whatsapp, text: (f.whatsapp?.text || '') + tag } }));
    }
  }

  async function save() {
    setSaving(true); setBanner(null);
    try {
      const current = await API.get('/report/delivery-settings');
      const merged  = { ...current.data, whatsapp: form.whatsapp };
      const { _id, __v, createdAt, updatedAt, ...body } = merged;
      const res = await API.put('/report/delivery-settings', body);
      setForm(res.data);
      setBanner({ ok: true, msg: 'Saved.' });
    } catch (err) {
      setBanner({ ok: false, msg: err.response?.data?.error || err.message });
    } finally { setSaving(false); }
  }

  const preview = renderReportVars(form.whatsapp?.text || '');

  return (
    <div className="space-y-5 max-w-lg">
      <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-3">
        <p className="text-xs text-amber-700 dark:text-amber-300 leading-relaxed">
          <strong>Note:</strong> WhatsApp reports are sent as text-only. File attachments via WhatsApp are not supported in this version.
        </p>
      </div>
      <p className="text-xs text-slate-500 leading-relaxed">Configure the message sent when sharing an AI Report via WhatsApp.</p>

      <div>
        <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-2">Insert variable</p>
        <div className="flex flex-wrap gap-1.5">
          {REPORT_VARS.map(({ token, label }) => (
            <button key={token} title={label} type="button" onClick={() => insertVar(token)}
              className="text-[11px] bg-blue-50 text-blue-700 border border-blue-100 rounded px-2 py-0.5 font-mono hover:bg-blue-100 transition-colors">
              {'{{'}{token}{'}}'}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="text-xs text-slate-500 dark:text-slate-400 block mb-1">Message</label>
        <textarea ref={bodyRef} rows={5}
          value={form.whatsapp?.text || ''}
          onChange={e => setForm(f => ({ ...f, whatsapp: { ...f.whatsapp, text: e.target.value } }))}
          placeholder="Hi {{patientName}}, please find your {{templateName}} from {{doctorName}} at {{clinicName}}."
          className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-800 focus:ring-2 focus:ring-[#137fec] outline-none resize-y font-mono" />
      </div>

      {/* Live preview */}
      {preview && (
        <div className="space-y-1">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Preview</p>
          <div className="bg-[#dcf8c6] rounded-xl rounded-bl-none p-3 max-w-xs shadow-sm">
            <p className="text-sm text-slate-800 leading-relaxed whitespace-pre-wrap">{preview}</p>
          </div>
        </div>
      )}

      <div className="flex items-center gap-4">
        <button onClick={save} disabled={saving}
          className="px-6 py-2.5 bg-[#137fec] hover:bg-blue-600 text-white font-semibold rounded-xl text-sm transition-colors disabled:opacity-60">
          {saving ? 'Saving…' : 'Save WhatsApp Template'}
        </button>
        {banner && (
          <p className={`text-sm font-medium flex items-center gap-1.5 ${banner.ok ? 'text-green-600' : 'text-red-600'}`}>
            {banner.ok ? <CheckCircle size={15} /> : <XCircle size={15} />} {banner.msg}
          </p>
        )}
      </div>
    </div>
  );
}

// ─── AI Report email template (self-contained) ───────────────────────────────

function AIReportEmailSection({ htmlEmailEnabled, onHtmlToggle }) {
  const [form, setForm]     = useState({ email: { subject: '', body: '' }, htmlEmail: { enabled: false } });
  const [saving, setSaving] = useState(false);
  const [banner, setBanner] = useState(null);
  const subjectRef          = React.useRef(null);
  const bodyRef             = React.useRef(null);
  const activeFieldRef      = React.useRef(null);

  useEffect(() => {
    API.get('/report/delivery-settings')
      .then(r => { setForm(r.data || {}); onHtmlToggle?.(r.data?.htmlEmail?.enabled ?? false); })
      .catch(() => {});
  }, []);

  function insertVar(token) {
    const el  = activeFieldRef.current;
    const tag = `{{${token}}}`;
    if (!el) { setForm(f => ({ ...f, email: { ...f.email, body: (f.email?.body || '') + tag } })); return; }
    const field = el === subjectRef.current ? 'subject' : 'body';
    const start = el.selectionStart;
    const end   = el.selectionEnd;
    const cur   = form.email?.[field] || '';
    const next  = cur.slice(0, start) + tag + cur.slice(end);
    setForm(f => ({ ...f, email: { ...f.email, [field]: next } }));
    requestAnimationFrame(() => {
      el.selectionStart = el.selectionEnd = start + tag.length;
      el.focus();
    });
  }

  async function save() {
    setSaving(true); setBanner(null);
    try {
      const current = await API.get('/report/delivery-settings');
      const merged  = { ...current.data, email: form.email, htmlEmail: form.htmlEmail };
      const { _id, __v, createdAt, updatedAt, ...body } = merged;
      const res = await API.put('/report/delivery-settings', body);
      setForm(res.data);
      setBanner({ ok: true, msg: 'Saved.' });
    } catch (err) {
      setBanner({ ok: false, msg: err.response?.data?.error || err.message });
    } finally { setSaving(false); }
  }

  const previewSubject = renderReportVars(form.email?.subject || '');
  const previewBody    = renderReportVars(form.email?.body    || '');

  return (
    <div className="space-y-5 max-w-lg">
      <p className="text-xs text-slate-500 leading-relaxed">Configure the email template used when sharing AI Reports. Click a variable chip to insert at cursor.</p>

      <div>
        <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-2">Insert variable</p>
        <div className="flex flex-wrap gap-1.5">
          {REPORT_VARS.map(({ token, label }) => (
            <button key={token} title={label} type="button" onClick={() => insertVar(token)}
              className="text-[11px] bg-blue-50 text-blue-700 border border-blue-100 rounded px-2 py-0.5 font-mono hover:bg-blue-100 transition-colors">
              {'{{'}{token}{'}}'}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="text-xs text-slate-500 dark:text-slate-400 block mb-1">Subject</label>
        <input type="text" ref={subjectRef}
          value={form.email?.subject || ''}
          onChange={e => setForm(f => ({ ...f, email: { ...f.email, subject: e.target.value } }))}
          onFocus={() => { activeFieldRef.current = subjectRef.current; }}
          placeholder="Your visit summary — {{date}}"
          className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-800 focus:ring-2 focus:ring-[#137fec] outline-none" />
      </div>
      <div>
        <label className="text-xs text-slate-500 dark:text-slate-400 block mb-1">Body</label>
        <textarea ref={bodyRef} rows={6}
          value={form.email?.body || ''}
          onChange={e => setForm(f => ({ ...f, email: { ...f.email, body: e.target.value } }))}
          onFocus={() => { activeFieldRef.current = bodyRef.current; }}
          placeholder="Hi {{patientName}}, please find your {{templateName}} from {{doctorName}} attached."
          className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-800 focus:ring-2 focus:ring-[#137fec] outline-none resize-y font-mono" />
      </div>

      {/* Preview */}
      {(previewSubject || previewBody) && (
        <div className="bg-slate-50 dark:bg-slate-700/40 border border-slate-200 dark:border-slate-600 rounded-xl p-4 space-y-1">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide mb-2">Preview</p>
          {previewSubject && <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 truncate">Subject: {previewSubject}</p>}
          {previewBody    && <p className="text-xs text-slate-500 dark:text-slate-400 whitespace-pre-wrap leading-relaxed">{previewBody}</p>}
        </div>
      )}

      <section className="space-y-3">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700 pb-1">
          <h3 className="text-sm font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wide flex items-center gap-2">Rich HTML Email</h3>
          <ToggleSwitch enabled={!!form.htmlEmail?.enabled} onChange={v => { setForm(f => ({ ...f, htmlEmail: { ...f.htmlEmail, enabled: v } })); onHtmlToggle?.(v); }} />
        </div>
        <p className="text-xs text-slate-400 leading-relaxed">
          When on, report emails are sent as branded HTML (clinic header, patient details, report body inline) instead of plain text.
        </p>
      </section>

      <div className="flex items-center gap-4 pt-1">
        <button onClick={save} disabled={saving}
          className="px-6 py-2.5 bg-[#137fec] hover:bg-blue-600 text-white font-semibold rounded-xl text-sm transition-colors disabled:opacity-60">
          {saving ? 'Saving…' : 'Save Email Settings'}
        </button>
        {banner && (
          <p className={`text-sm font-medium flex items-center gap-1.5 ${banner.ok ? 'text-green-600' : 'text-red-600'}`}>
            {banner.ok ? <CheckCircle size={15} /> : <XCircle size={15} />} {banner.msg}
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Share with Patient (unified hub) ────────────────────────────────────────

// ─── Document Branding (canonical DocumentSettings) ──────────────────────────
// Field components are defined at module scope (stable identity) so inputs keep
// focus across re-renders while typing.
function DocBrandText({ ds, set, label, k, ph, wide }) {
  return (
    <div className={wide ? 'sm:col-span-2' : ''}>
      <label className="block text-xs font-semibold text-slate-500 mb-1">{label}</label>
      <input value={ds[k] ?? ''} onChange={e => set(k, e.target.value)} placeholder={ph}
        className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-600 dark:bg-slate-700 rounded-lg" />
    </div>
  );
}
function DocBrandNum({ ds, set, label, k }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-500 mb-1">{label}</label>
      <input type="number" value={ds[k] ?? 0} onChange={e => set(k, Number(e.target.value))}
        className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-600 dark:bg-slate-700 rounded-lg" />
    </div>
  );
}
function DocBrandToggle({ ds, set, label, k }) {
  return (
    <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
      <input type="checkbox" checked={ds[k] !== false} onChange={e => set(k, e.target.checked)} className="w-4 h-4 accent-[#137fec]" />
      {label}
    </label>
  );
}
function DocBrandGroup({ title, children }) {
  return (
    <div className="border border-slate-200 dark:border-slate-700 rounded-xl p-4">
      <h4 className="text-sm font-bold text-slate-700 dark:text-slate-200 mb-3">{title}</h4>
      {children}
    </div>
  );
}

function DocumentBrandingTab() {
  const [ds, setDs] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [uploading, setUploading] = React.useState('');
  const [msg, setMsg] = React.useState('');

  React.useEffect(() => {
    API.get('/documents/settings')
      .then(r => setDs(r.data || {}))
      .catch(() => setDs({}))
      .finally(() => setLoading(false));
  }, []);

  const set = (k, v) => setDs(d => ({ ...d, [k]: v }));

  async function uploadImage(file, onUrl, key, previousUrl) {
    if (!file) return;
    setUploading(key);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const r = await API.post('/documents/upload-image', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      onUrl(r.data.url);
      // Clean up the replaced image from Cloudinary (best-effort).
      if (previousUrl && previousUrl !== r.data.url) deleteBrandingImage(previousUrl);
    } catch (e) {
      setMsg('Upload failed: ' + (e.response?.data?.error || e.message));
    } finally { setUploading(''); }
  }

  async function save() {
    setSaving(true); setMsg('');
    try {
      await API.put('/documents/settings', ds);
      setMsg('Saved.');
      setTimeout(() => setMsg(''), 2500);
    } catch (e) {
      setMsg('Save failed: ' + (e.response?.data?.error || e.message));
    } finally { setSaving(false); }
  }

  if (loading || !ds) return <div className="py-10 text-center text-slate-400 text-sm">Loading…</div>;

  const Group = DocBrandGroup;

  const modes = ds.payment_modes || [];
  const setMode = (i, k, v) => set('payment_modes', modes.map((m, j) => j === i ? { ...m, [k]: v } : m));

  return (
    <div className="space-y-5">
      <p className="text-sm text-slate-500">Branding applied to all generated documents (prescription, clinical notes, invoice, AI report).</p>

      <Group title="Clinic Info">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <DocBrandText ds={ds} set={set} label="Clinic Name" k="clinic_name" />
          <DocBrandText ds={ds} set={set} label="Tagline" k="tagline" />
          <DocBrandText ds={ds} set={set} label="Address" k="address" wide />
          <DocBrandText ds={ds} set={set} label="City" k="city" /><DocBrandText ds={ds} set={set} label="State" k="state" />
          <DocBrandText ds={ds} set={set} label="Pincode" k="pincode" /><DocBrandText ds={ds} set={set} label="Phone" k="phone" />
          <DocBrandText ds={ds} set={set} label="Email" k="email" /><DocBrandText ds={ds} set={set} label="Website" k="website" />
          <DocBrandText ds={ds} set={set} label="Registration No." k="reg_number" /><DocBrandText ds={ds} set={set} label="Currency Symbol" k="currency_symbol" />
        </div>
        <div className="mt-3 flex items-center gap-3">
          {ds.clinic_logo_url && <img src={ds.clinic_logo_url} alt="logo" className="h-12 w-12 object-contain border rounded" />}
          <label className="px-3 py-2 text-sm border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50">
            {uploading === 'logo' ? 'Uploading…' : 'Upload Logo'}
            <input type="file" accept="image/*" className="hidden" onChange={e => uploadImage(e.target.files[0], u => set('clinic_logo_url', u), 'logo', ds.clinic_logo_url)} />
          </label>
        </div>
      </Group>

      <Group title="GST & Tax">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <DocBrandText ds={ds} set={set} label="GSTIN" k="gstin" /><DocBrandText ds={ds} set={set} label="PAN" k="pan_number" />
          <DocBrandNum ds={ds} set={set} label="CGST %" k="cgst_rate" /><DocBrandNum ds={ds} set={set} label="SGST %" k="sgst_rate" /><DocBrandNum ds={ds} set={set} label="IGST %" k="igst_rate" />
        </div>
      </Group>

      <Group title="Payment Modes (UPI/QR or Bank Transfer)">
        {modes.map((m, i) => {
          const mode = m.type || 'upi';
          return (
            <div key={i} className="border border-slate-200 rounded-xl p-3 mb-3">
              <div className="flex items-center justify-between gap-3 mb-3">
                <div className="flex items-center gap-2">
                  <label className="text-xs font-semibold text-slate-500">Type</label>
                  <select
                    value={mode}
                    onChange={e => setMode(i, 'type', e.target.value)}
                    className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg bg-white"
                  >
                    <option value="upi">UPI / QR</option>
                    <option value="bank">Bank Transfer</option>
                  </select>
                </div>
                <button onClick={() => set('payment_modes', modes.filter((_, j) => j !== i))} className="text-red-500 text-sm">✕ Remove</button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><label className="block text-xs font-semibold text-slate-500 mb-1">Label</label>
                  <input value={m.label || ''} onChange={e => setMode(i, 'label', e.target.value)} placeholder={mode === 'bank' ? 'e.g. Bank Transfer' : 'e.g. UPI'} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" /></div>

                {mode === 'upi' ? (
                  <>
                    <div><label className="block text-xs font-semibold text-slate-500 mb-1">UPI ID / Details</label>
                      <input value={m.details || ''} onChange={e => setMode(i, 'details', e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" /></div>
                    <div className="flex items-center gap-2 sm:col-span-2">
                      {m.qr_url && <img src={m.qr_url} alt="qr" className="h-10 w-10 object-contain border rounded" />}
                      <label className="px-3 py-2 text-sm border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50">{uploading === `qr${i}` ? '…' : 'Upload QR'}
                        <input type="file" accept="image/*" className="hidden" onChange={e => uploadImage(e.target.files[0], u => setMode(i, 'qr_url', u), `qr${i}`, m.qr_url)} /></label>
                    </div>
                  </>
                ) : (
                  <>
                    <div><label className="block text-xs font-semibold text-slate-500 mb-1">Beneficiary Name</label>
                      <input value={m.beneficiary || ''} onChange={e => setMode(i, 'beneficiary', e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" /></div>
                    <div><label className="block text-xs font-semibold text-slate-500 mb-1">Account Number</label>
                      <input value={m.details || ''} onChange={e => setMode(i, 'details', e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" /></div>
                    <div><label className="block text-xs font-semibold text-slate-500 mb-1">Bank Name</label>
                      <input value={m.bank_name || ''} onChange={e => setMode(i, 'bank_name', e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" /></div>
                    <div><label className="block text-xs font-semibold text-slate-500 mb-1">Branch</label>
                      <input value={m.branch || ''} onChange={e => setMode(i, 'branch', e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" /></div>
                    <div><label className="block text-xs font-semibold text-slate-500 mb-1">IFSC Code</label>
                      <input value={m.ifsc || ''} onChange={e => setMode(i, 'ifsc', e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" /></div>
                  </>
                )}
              </div>
            </div>
          );
        })}
        <div className="flex gap-4">
          <button onClick={() => set('payment_modes', [...modes, { type: 'upi', label: '', details: '', qr_url: '' }])} className="text-sm font-semibold text-[#137fec]">+ Add UPI / QR</button>
          <button onClick={() => set('payment_modes', [...modes, { type: 'bank', label: 'Bank Transfer', details: '', bank_name: '', branch: '', ifsc: '', beneficiary: '' }])} className="text-sm font-semibold text-[#137fec]">+ Add Bank Transfer</button>
        </div>
      </Group>

      <Group title="Invoice — show / hide">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
          <DocBrandText ds={ds} set={set} label="Invoice Prefix" k="invoice_prefix" />
          <DocBrandText ds={ds} set={set} label="Footer Text" k="invoice_footer_text" wide />
        </div>
        <div className="flex flex-wrap gap-4">
          <DocBrandToggle ds={ds} set={set} label="Logo" k="invoice_show_logo" />
          <DocBrandToggle ds={ds} set={set} label="GST / Tax" k="invoice_show_gst" />
          <DocBrandToggle ds={ds} set={set} label="Payment Options" k="invoice_show_payment" />
          <DocBrandToggle ds={ds} set={set} label="Paid / Pending" k="invoice_show_paid_pending" />
          <DocBrandToggle ds={ds} set={set} label="Footer" k="invoice_show_footer" />
        </div>
      </Group>

      <Group title="Prescription — show / hide">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
          <DocBrandText ds={ds} set={set} label="Footer Text" k="prescription_footer_text" wide />

        </div>
        <div className="flex flex-wrap gap-4">
          <DocBrandToggle ds={ds} set={set} label="Logo" k="prescription_show_logo" />
          <DocBrandToggle ds={ds} set={set} label="Reg No." k="prescription_show_reg" />
          <DocBrandToggle ds={ds} set={set} label="Qualification" k="prescription_show_qualification" />
          <DocBrandToggle ds={ds} set={set} label="Advice" k="prescription_show_advice" />
          <DocBrandToggle ds={ds} set={set} label="Footer" k="prescription_show_footer" />
          <DocBrandToggle ds={ds} set={set} label="Digital Signature" k="prescription_show_signature" />
        </div>
        <p className="text-[11px] text-slate-400 mt-2">When on, the prescribing doctor's saved signature/stamp image is printed above their name. When off, a blank space is left to hand-sign.</p>
      </Group>

      <Group title="Visit Summary — settings">
        <div className="flex flex-wrap gap-4 mb-4">
          <DocBrandToggle ds={ds} set={set} label="Logo" k="smart_show_logo" />
          <DocBrandToggle ds={ds} set={set} label="Footer" k="smart_show_footer" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1">
            General Post-Care Instructions <span className="text-slate-400 font-normal">(one bullet per line, shown on every Visit Summary)</span>
          </label>
          <textarea
            value={ds.postcare_template ?? ''}
            onChange={e => set('postcare_template', e.target.value)}
            rows={7}
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg font-mono leading-relaxed resize-y"
            placeholder="• Avoid hard foods for 24 hours&#10;• Take medications as directed…"
          />
        </div>
      </Group>

      <Group title="AI Report — show / hide">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
          <DocBrandText ds={ds} set={set} label="Header Text" k="report_header_text" wide />
          <DocBrandText ds={ds} set={set} label="Footer Text" k="report_footer_text" wide />
        </div>
        <div className="flex flex-wrap gap-4">
          <DocBrandToggle ds={ds} set={set} label="Logo" k="report_show_logo" />
          <DocBrandToggle ds={ds} set={set} label="Patient" k="report_show_patient" />
          <DocBrandToggle ds={ds} set={set} label="Header Text" k="report_show_header" />
          <DocBrandToggle ds={ds} set={set} label="Footer" k="report_show_footer" />
        </div>
      </Group>

      <div className="flex items-center gap-3">
        <button onClick={save} disabled={saving} className="px-5 py-2.5 bg-[#137fec] text-white text-sm font-bold rounded-lg hover:bg-blue-700 disabled:opacity-60">
          {saving ? 'Saving…' : 'Save Branding'}
        </button>
        {msg && <span className="text-sm text-slate-500">{msg}</span>}
      </div>
    </div>
  );
}

// ─── Share with Patient (unified hub) ────────────────────────────────────────

function PatientDocumentsTab() {
  const [section, setSection]           = React.useState('branding');
  const [previewVisible, setPreviewVisible] = React.useState(false);
  const [clinicInfo, setClinicInfo]     = React.useState({ name: '', tagline: '', phone: '', email: '' });
  const [htmlEmailEnabled, setHtmlEmailEnabled] = React.useState(false);

  React.useEffect(() => {
    API.get('/settings/invoice').catch(() => null).then(r => {
      if (!r?.data) return;
      setClinicInfo(c => ({ ...c,
        name:  r.data.clinic?.name  || '',
        phone: r.data.clinic?.phone || '',
        email: r.data.clinic?.email || '',
      }));
    });
    API.get('/report/delivery-settings').catch(() => null).then(r => {
      if (!r?.data) return;
      setClinicInfo(c => ({
        ...c,
        tagline: r.data.pdf?.clinicTagline || c.tagline,
        name:    r.data.pdf?.clinicName    || c.name,
      }));
    });
  }, []);

  const sections = [
    { id: 'branding',      label: 'Document Branding' },
    { id: 'smart_report',  label: 'Smart Report' },
    { id: 'ai_report',     label: 'AI Report' },
    { id: 'send_email',    label: 'Send Email' },
  ];

  const hasPreview = section !== 'branding';

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg overflow-hidden">

        {/* Header */}
        <div className="px-4 sm:px-6 pt-5 sm:pt-6 pb-4 border-b border-slate-100 dark:border-slate-700 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-slate-800 dark:text-white">Share with Patient</h2>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
              Configure how AI reports and smart summaries are delivered from the treatment page.
            </p>
          </div>
          {hasPreview && (
            <button
              onClick={() => setPreviewVisible(v => !v)}
              className="lg:hidden flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#137fec] border border-blue-200 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors flex-shrink-0"
            >
              <Eye size={13} /> {previewVisible ? 'Hide preview' : 'Patient preview'}
            </button>
          )}
        </div>

        {/* Mobile preview panel */}
        {previewVisible && hasPreview && (
          <div className="lg:hidden p-6 bg-slate-50 dark:bg-slate-700/30 border-b border-slate-100 dark:border-slate-700">
            <SectionPreviewPane clinicInfo={clinicInfo} section={section} htmlEmailEnabled={htmlEmailEnabled} />
          </div>
        )}

        {/* Body */}
        <div className="flex flex-col lg:flex-row lg:divide-x lg:divide-slate-100 dark:lg:divide-slate-700">

          {/* Settings column */}
          <div className="flex-1 min-w-0">
            <div className="flex border-b border-slate-100 dark:border-slate-700 overflow-x-auto scrollbar-none">
              {sections.map(s => (
                <button key={s.id} onClick={() => setSection(s.id)}
                  className={`flex-shrink-0 px-4 sm:px-5 py-3 text-xs sm:text-sm font-semibold whitespace-nowrap transition-colors ${
                    section === s.id
                      ? 'text-[#137fec] border-b-2 border-[#137fec]'
                      : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
                  }`}>
                  {s.label}
                </button>
              ))}
            </div>

            <div className="p-4 sm:p-6">
              {section === 'branding'      && <DocumentBrandingTab />}
              {section === 'smart_report'  && <SmartReportDeliverySection />}
              {section === 'ai_report'     && <ReportDeliveryTab />}
              {section === 'send_email'    && <AIReportEmailSection htmlEmailEnabled={htmlEmailEnabled} onHtmlToggle={setHtmlEmailEnabled} />}
            </div>
          </div>

          {/* Preview column — desktop only */}
          {hasPreview && (
            <div className="hidden lg:flex lg:w-72 xl:w-80 flex-shrink-0 flex-col p-6 bg-slate-50/60 dark:bg-slate-700/20" style={{ minHeight: 480 }}>
              <SectionPreviewPane clinicInfo={clinicInfo} section={section} htmlEmailEnabled={htmlEmailEnabled} />
            </div>
          )}

        </div>
      </div>
    </div>
  );
}


// ─── Main Settings Page ───────────────────────────────────────────────────────

const SettingsPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'doctors');

  // Deep-link support: the nav credit pill links to /settings?tab=credits
  useEffect(() => {
    const t = searchParams.get('tab');
    if (t) setActiveTab(t);
  }, [searchParams]);

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
    experience_years: '',
    signature_url: '',
    is_active: true,
    notes: '',
    availability: {
      monday: [{ start: '09:00', end: '17:00' }],
      tuesday: [{ start: '09:00', end: '17:00' }],
      wednesday: [{ start: '09:00', end: '17:00' }],
      thursday: [{ start: '09:00', end: '17:00' }],
      friday: [{ start: '09:00', end: '17:00' }],
      saturday: [{ start: '10:00', end: '14:00' }],
      sunday: []
    }
  });
  const [sigUploading, setSigUploading] = useState(false);

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
  const [medicines, setMedicines] = useState([]);
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
      const [findingsRes, diagnosesRes, treatmentsRes, medicinesRes] = await Promise.all([
        API.get('/clinical-findings'),
        API.get('/diagnoses'),
        API.get('/suggested-treatments'),
        API.get('/medicines')
      ]);
      setClinicalFindings(findingsRes.data);
      setDiagnoses(diagnosesRes.data);
      setSuggestedTreatments(treatmentsRes.data);
      setMedicines(medicinesRes.data);
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
      experience_years: '',
      signature_url: '',
      is_active: true,
      notes: '',
      availability: {
        monday: [{ start: '09:00', end: '17:00' }],
        tuesday: [{ start: '09:00', end: '17:00' }],
        wednesday: [{ start: '09:00', end: '17:00' }],
        thursday: [{ start: '09:00', end: '17:00' }],
        friday: [{ start: '09:00', end: '17:00' }],
        saturday: [{ start: '10:00', end: '14:00' }],
        sunday: []
      }
    });
    setShowModal(true);
  };

  const uploadDoctorSignature = async (file) => {
    if (!file) return;
    setSigUploading(true);
    const previousUrl = doctorFormData.signature_url;
    try {
      const fd = new FormData();
      fd.append('file', file);
      const r = await API.post('/documents/upload-image', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      const url = r.data?.url || r.data?.secure_url || '';
      if (url) {
        setDoctorFormData(prev => ({ ...prev, signature_url: url }));
        // Clean up the replaced image from Cloudinary (best-effort).
        if (previousUrl && previousUrl !== url) deleteBrandingImage(previousUrl);
      }
    } catch (err) {
      console.error('Signature upload failed:', err);
      alert('Failed to upload signature image.');
    } finally {
      setSigUploading(false);
    }
  };

  const handleEditDoctor = (doctor) => {
    setEditingDoctor(doctor);
    // Normalize availability to arrays of shifts (back-compat with old {start,end} shape)
    const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    const availability = {};
    for (const day of days) {
      const val = doctor.availability?.[day];
      if (!val) availability[day] = [];
      else if (Array.isArray(val)) availability[day] = val;
      else availability[day] = (val.start || val.end) ? [{ start: val.start || '', end: val.end || '' }] : [];
    }
    setDoctorFormData({ ...doctor, availability });
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
      const payload = { ...doctorFormData, experience_years: Number(doctorFormData.experience_years) || 0 };
      if (editingDoctor) {
        const res = await API.put(`/doctors/${editingDoctor._id}`, payload);
        setDoctors(doctors.map(d => d._id === editingDoctor._id ? res.data : d));
      } else {
        const res = await API.post('/doctors', payload);
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
    setDoctorFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : (name === 'experience_years' ? (value === '' ? '' : Number(value)) : value)
    }));
  };

  const handleShiftChange = (day, index, field, value) => {
    setDoctorFormData(prev => {
      const shifts = [...(prev.availability[day] || [])];
      shifts[index] = { ...shifts[index], [field]: value };
      return { ...prev, availability: { ...prev.availability, [day]: shifts } };
    });
  };

  const handleAddShift = (day) => {
    setDoctorFormData(prev => ({
      ...prev,
      availability: {
        ...prev.availability,
        [day]: [...(prev.availability[day] || []), { start: '', end: '' }],
      },
    }));
  };

  const handleRemoveShift = (day, index) => {
    setDoctorFormData(prev => {
      const shifts = (prev.availability[day] || []).filter((_, i) => i !== index);
      return { ...prev, availability: { ...prev.availability, [day]: shifts } };
    });
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

    const skipped = [];
    const failed = [];

    try {
      for (const item of bulkItems) {
        if (!item.name.trim()) continue;
        try {
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
        } catch (err) {
          if (err.response?.status === 409) {
            skipped.push(item.name.trim());
          } else {
            failed.push(item.name.trim());
          }
        }
      }
      setBulkItems([]);
      setBulkMode(false);
      fetchTreatmentData();
      if (skipped.length || failed.length) {
        const parts = [];
        if (skipped.length) parts.push(`${skipped.length} duplicate(s) skipped: ${skipped.join(', ')}`);
        if (failed.length) parts.push(`${failed.length} failed: ${failed.join(', ')}`);
        alert('Done with warnings:\n' + parts.join('\n'));
      } else {
        alert('Items added successfully!');
      }
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
          type === 'medicines' ? '/medicines' :
          '/suggested-treatments';
        await API.delete(`${endpoint}/${id}`);

        if (type === 'findings') setClinicalFindings(clinicalFindings.filter(f => f._id !== id));
        else if (type === 'diagnoses') setDiagnoses(diagnoses.filter(d => d._id !== id));
        else if (type === 'medicines') setMedicines(medicines.filter(m => m._id !== id));
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
            { key: 'doctors',           label: 'Doctors' },
            { key: 'treatment',         label: 'Clinical Data' },
            { key: 'email',             label: 'Email' },
            { key: 'shareWithPatient',  label: 'Share with Patient' },
            { key: 'booking',           label: 'Online Booking' },
            { key: 'credits',           label: 'AI Credits' },
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
                        {doctor.license_number
                          ? <p className="font-mono">Reg. No.: {doctor.license_number}</p>
                          : <p className="text-red-400">License number not set</p>}
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
                        <th className="px-6 py-3 text-left text-sm font-semibold text-slate-700 dark:text-slate-300">Reg. No.</th>
                        <th className="px-6 py-3 text-left text-sm font-semibold text-slate-700 dark:text-slate-300">Email</th>
                        <th className="px-6 py-3 text-left text-sm font-semibold text-slate-700 dark:text-slate-300">Phone</th>
                        <th className="px-6 py-3 text-center text-sm font-semibold text-slate-700 dark:text-slate-300">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                      {doctors.map(doctor => (
                        <tr key={doctor._id} className="hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
                          <td className="px-6 py-4"><p className="font-semibold text-slate-800 dark:text-white">{doctor.name}</p></td>
                          <td className="px-6 py-4 text-slate-600 dark:text-slate-400">{doctor.specialization || '-'}</td>
                          <td className="px-6 py-4 text-slate-600 dark:text-slate-400 font-mono text-sm">{doctor.license_number || <span className="text-red-400 font-sans font-normal text-xs">Not set</span>}</td>
                          <td className="px-6 py-4 text-slate-600 dark:text-slate-400">{doctor.email || '-'}</td>
                          <td className="px-6 py-4 text-slate-600 dark:text-slate-400">{doctor.phone || '-'}</td>
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
              {['findings', 'diagnoses', 'treatments', 'medicines'].map(tab => (
                <button
                  key={tab}
                  onClick={() => setTreatmentTab(tab)}
                  className={`flex-shrink-0 px-3 sm:px-4 py-2 text-sm font-semibold transition-all whitespace-nowrap ${
                    treatmentTab === tab
                      ? 'text-[#137fec] border-b-2 border-[#137fec]'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {tab === 'findings' ? 'Clinical Findings' : tab === 'diagnoses' ? 'Diagnoses' : tab === 'treatments' ? 'Suggested Treatments' : 'Medicines'}
                </button>
              ))}
            </div>

            {/* Header — Unified Add button */}
            <div className="flex items-center justify-between gap-3 mb-6">
              <h3 className="text-base sm:text-xl font-bold text-slate-800 dark:text-white min-w-0">
                {treatmentTab === 'findings' ? 'Clinical Findings' : treatmentTab === 'diagnoses' ? 'Diagnoses' : treatmentTab === 'treatments' ? 'Suggested Treatments' : 'Medicines'}
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
                  Add {treatmentTab === 'findings' ? 'Findings' : treatmentTab === 'diagnoses' ? 'Diagnoses' : treatmentTab === 'treatments' ? 'Treatments' : 'Medicines'}
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
              const items = treatmentTab === 'findings' ? clinicalFindings : treatmentTab === 'diagnoses' ? diagnoses : treatmentTab === 'treatments' ? suggestedTreatments : medicines;
              return (
                <>
                  {items.length === 0 && !bulkMode && (
                    <div className="mb-5 flex flex-col sm:flex-row sm:items-center gap-4 p-4 rounded-xl bg-[#137fec]/5 border border-[#137fec]/20">
                      <div className="p-2.5 bg-[#137fec]/10 rounded-xl flex-shrink-0 self-start">
                        <BookOpen size={22} className="text-[#137fec]" />
                      </div>
                      <div className="flex-1">
                        <p className="font-semibold text-slate-800 dark:text-white text-sm">No {treatmentTab === 'findings' ? 'findings' : treatmentTab} yet</p>
                        {/* medicines label reads naturally from treatmentTab */}
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          Add them one at a time, type a batch quickly, upload a CSV / Google Sheet, or pick from our curated starter library.
                        </p>
                      </div>
                      <button
                        onClick={() => setShowAddChooser(true)}
                        className="flex-shrink-0 px-4 py-2 bg-[#137fec] hover:bg-blue-600 text-white text-sm font-semibold rounded-lg transition-colors"
                      >
                        Add {treatmentTab === 'findings' ? 'Findings' : treatmentTab === 'diagnoses' ? 'Diagnoses' : treatmentTab === 'treatments' ? 'Treatments' : 'Medicines'}
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
                            {(treatmentTab === 'treatments' || treatmentTab === 'medicines') && <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">₹{item.cost?.toLocaleString('en-IN') || '0'}</span>}
                            {treatmentTab === 'medicines' && item.form && <span className="text-xs bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">{item.form}</span>}
                            {treatmentTab === 'medicines' && item.default_dosage && <span className="text-xs text-slate-500">{item.default_dosage}{item.default_duration ? ` · ${item.default_duration}` : ''}</span>}
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
                          {treatmentTab === 'medicines' && <th className="px-6 py-3 text-left text-sm font-semibold text-slate-700 dark:text-slate-300">Form</th>}
                          {treatmentTab === 'medicines' && <th className="px-6 py-3 text-left text-sm font-semibold text-slate-700 dark:text-slate-300">Dosage</th>}
                          {(treatmentTab === 'treatments' || treatmentTab === 'medicines') && <th className="px-6 py-3 text-left text-sm font-semibold text-slate-700 dark:text-slate-300">Cost</th>}
                          <th className="px-6 py-3 text-left text-sm font-semibold text-slate-700 dark:text-slate-300">Category</th>
                          <th className="px-6 py-3 text-center text-sm font-semibold text-slate-700 dark:text-slate-300">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                        {items.map(item => (
                          <tr key={item._id} className="hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
                            <td className="px-6 py-4"><p className="font-semibold text-slate-800 dark:text-white">{item.name}</p></td>
                            {treatmentTab === 'diagnoses' && <td className="px-6 py-4 text-slate-600 dark:text-slate-400">{item.code || '-'}</td>}
                            {treatmentTab === 'medicines' && <td className="px-6 py-4 text-slate-600 dark:text-slate-400">{item.form || '-'}</td>}
                            {treatmentTab === 'medicines' && <td className="px-6 py-4 text-slate-600 dark:text-slate-400">{item.default_dosage ? `${item.default_dosage}${item.default_duration ? ` · ${item.default_duration}` : ''}` : '-'}</td>}
                            {(treatmentTab === 'treatments' || treatmentTab === 'medicines') && <td className="px-6 py-4 text-slate-600 dark:text-slate-400">₹{item.cost?.toLocaleString('en-IN') || '0'}</td>}
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
        {/* Email Tab */}
        {activeTab === 'credits' && <CreditsTab />}

        {activeTab === 'email' && <EmailTab />}

        {/* Share with Patient Tab */}
        {activeTab === 'shareWithPatient' && <PatientDocumentsTab />}

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

              {/* ── Doctor Schedules ── */}
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
            </div>
          );
        })()}

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
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase block mb-1">
                    License / Reg. Number <span className="text-red-500">*</span>
                  </label>
                  <input
                    required
                    type="text"
                    name="license_number"
                    placeholder="e.g. MH-12345 / A-98765"
                    value={doctorFormData.license_number}
                    onChange={handleDoctorChange}
                    className="w-full px-3 py-2.5 border border-slate-300 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-[#137fec] outline-none bg-white dark:bg-slate-800"
                  />
                  <p className="text-[11px] text-slate-400 mt-0.5">Printed on prescriptions, reports and invoices.</p>
                </div>
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

              {/* Signature / Stamp */}
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Signature / Stamp</label>
                <div className="flex items-center gap-3">
                  {doctorFormData.signature_url && (
                    <img src={doctorFormData.signature_url} alt="signature" className="h-12 w-auto object-contain border border-slate-200 rounded bg-white px-2" />
                  )}
                  <label className="px-3 py-2 text-sm border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50">
                    {sigUploading ? 'Uploading…' : (doctorFormData.signature_url ? 'Replace' : 'Upload Signature')}
                    <input type="file" accept="image/*" className="hidden" onChange={e => uploadDoctorSignature(e.target.files[0])} />
                  </label>
                  {doctorFormData.signature_url && (
                    <button type="button" onClick={() => {
                      const removed = doctorFormData.signature_url;
                      setDoctorFormData(prev => ({ ...prev, signature_url: '' }));
                      deleteBrandingImage(removed);
                    }}
                      className="text-xs text-red-500 hover:underline">Remove</button>
                  )}
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5">Printed above the doctor name on prescriptions & documents. Leave blank to hand-sign.</p>
              </div>

              {/* Availability */}
              <div className="border-t border-slate-200 dark:border-slate-700 pt-4">
                <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">Weekly Availability</h4>
                <div className="space-y-3">
                  {['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map(day => {
                    const shifts = doctorFormData.availability[day] || [];
                    return (
                      <div key={day} className="flex flex-col gap-1.5">
                        <div className="flex items-center justify-between">
                          <label className="text-sm font-medium text-slate-700 dark:text-slate-300 capitalize">{day}</label>
                          {shifts.length === 0 && (
                            <span className="text-xs text-slate-400 italic">Off</span>
                          )}
                        </div>
                        {shifts.map((shift, idx) => (
                          <div key={idx} className="flex items-center gap-2 pl-2">
                            <input
                              type="time"
                              value={shift.start || ''}
                              onChange={e => handleShiftChange(day, idx, 'start', e.target.value)}
                              className="flex-1 px-2 py-1.5 border border-slate-300 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-[#137fec] outline-none bg-white dark:bg-slate-800"
                            />
                            <span className="text-slate-500 flex-shrink-0 text-xs">to</span>
                            <input
                              type="time"
                              value={shift.end || ''}
                              onChange={e => handleShiftChange(day, idx, 'end', e.target.value)}
                              className="flex-1 px-2 py-1.5 border border-slate-300 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-[#137fec] outline-none bg-white dark:bg-slate-800"
                            />
                            <button
                              type="button"
                              onClick={() => handleRemoveShift(day, idx)}
                              className="text-slate-400 hover:text-red-500 text-sm font-bold flex-shrink-0 px-1"
                              title="Remove shift"
                            >
                              ×
                            </button>
                          </div>
                        ))}
                        <button
                          type="button"
                          onClick={() => handleAddShift(day)}
                          className="text-xs text-[#137fec] hover:underline text-left pl-2 mt-0.5 w-fit"
                        >
                          + Add shift
                        </button>
                      </div>
                    );
                  })}
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
