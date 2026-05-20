import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';

const API = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

const STEPS = ['Your Info', 'Service', 'Date', 'Time', 'Confirm'];

// ─── Utilities ───────────────────────────────────────────────────────────────

function toIST(dt) {
  return new Date(dt).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
}

function toISTDate(dt) {
  return new Date(dt).toLocaleDateString('en-IN', {
    timeZone: 'Asia/Kolkata',
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

function calendarDays() {
  const days = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = 0; i < 30; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    days.push(d);
  }
  return days;
}

function toDateStr(dt) {
  // YYYY-MM-DD in local timezone — avoids UTC offset flipping the date for IST
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function StepIndicator({ current, total }) {
  return (
    <div className="flex items-center justify-center gap-2 mb-6">
      {STEPS.map((label, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all
            ${i < current ? 'bg-green-500 text-white' :
              i === current ? 'bg-[#137fec] text-white ring-4 ring-blue-100' :
              'bg-gray-200 text-gray-400'}`}>
            {i < current ? '✓' : i + 1}
          </div>
          {i < total - 1 && (
            <div className={`h-0.5 w-6 ${i < current ? 'bg-green-500' : 'bg-gray-200'}`} />
          )}
        </div>
      ))}
    </div>
  );
}

function InputField({ label, type = 'text', value, onChange, placeholder, error, required }) {
  return (
    <div className="mb-4">
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full px-4 py-3 rounded-xl border text-base focus:outline-none focus:ring-2 transition-all
          ${error ? 'border-red-400 focus:ring-red-200' : 'border-gray-200 focus:ring-blue-200 focus:border-[#137fec]'}`}
      />
      {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
    </div>
  );
}

// ─── Step Components ─────────────────────────────────────────────────────────

function StepInfo({ form, setForm, onNext }) {
  const [errors, setErrors] = useState({});

  function validate() {
    const e = {};
    if (!form.first_name.trim()) e.first_name = 'Name is required';
    if (!/^\d{10}$/.test(form.phone.replace(/\s/g, ''))) e.phone = 'Enter a valid 10-digit mobile number';
    setErrors(e);
    return !Object.keys(e).length;
  }

  return (
    <div>
      <h2 className="text-xl font-bold text-gray-800 mb-1">Who are you?</h2>
      <p className="text-gray-500 text-sm mb-6">We'll use this to find or create your patient record.</p>
      <div className="flex gap-3">
        <div className="flex-1">
          <InputField label="First Name" value={form.first_name} onChange={v => setForm(f => ({...f, first_name: v}))}
            placeholder="First name" error={errors.first_name} required />
        </div>
        <div className="flex-1">
          <InputField label="Last Name" value={form.last_name} onChange={v => setForm(f => ({...f, last_name: v}))}
            placeholder="Last name (optional)" />
        </div>
      </div>
      <InputField label="Mobile Number" type="tel" value={form.phone}
        onChange={v => setForm(f => ({...f, phone: v.replace(/\D/g, '')}))}
        placeholder="10-digit mobile number" error={errors.phone} required />
      <InputField label="Email (optional)" type="email" value={form.email}
        onChange={v => setForm(f => ({...f, email: v}))}
        placeholder="For email confirmation" />
      <button onClick={() => validate() && onNext()}
        className="w-full py-3 bg-[#137fec] hover:bg-blue-600 text-white font-semibold rounded-xl transition-colors mt-2">
        Continue →
      </button>
    </div>
  );
}

function StepService({ services, form, setForm, onNext, onBack }) {
  const grouped = services.reduce((acc, s) => {
    const cat = s.category || 'General';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(s);
    return acc;
  }, {});

  return (
    <div>
      <h2 className="text-xl font-bold text-gray-800 mb-1">What do you need?</h2>
      <p className="text-gray-500 text-sm mb-4">Select the treatment or service.</p>

      <div className="space-y-4 max-h-72 overflow-y-auto pr-1 mb-4">
        {Object.entries(grouped).map(([cat, items]) => (
          <div key={cat}>
            <p className="text-xs font-semibold text-gray-400 uppercase mb-2">{cat}</p>
            <div className="space-y-2">
              {items.map(s => (
                <button key={s._id}
                  onClick={() => setForm(f => ({...f, service_id: s._id, service_name: s.name}))}
                  className={`w-full text-left px-4 py-3 rounded-xl border transition-all flex justify-between items-center
                    ${form.service_id === s._id
                      ? 'border-[#137fec] bg-blue-50 text-[#137fec] font-semibold'
                      : 'border-gray-200 hover:border-blue-300 text-gray-700'}`}>
                  <span>{s.name}</span>
                  {s.cost > 0 && <span className="text-sm text-gray-400">₹{s.cost}</span>}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-1">Reason / Notes <span className="text-gray-400">(optional)</span></label>
        <textarea rows={2} value={form.notes} onChange={e => setForm(f => ({...f, notes: e.target.value}))}
          placeholder="Describe any specific concerns..."
          className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-[#137fec] resize-none" />
      </div>

      <div className="flex gap-3">
        <button onClick={onBack} className="flex-1 py-3 border border-gray-200 text-gray-600 font-semibold rounded-xl hover:bg-gray-50">← Back</button>
        <button onClick={onNext} disabled={!form.service_id}
          className="flex-1 py-3 bg-[#137fec] hover:bg-blue-600 disabled:bg-gray-300 text-white font-semibold rounded-xl transition-colors">
          Continue →
        </button>
      </div>
    </div>
  );
}

function StepDate({ form, setForm, onNext, onBack, workingHours }) {
  const days = calendarDays();
  const WEEKDAYS = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];

  function isAvailable(d) {
    const wd = WEEKDAYS[d.getDay()];
    return !!workingHours[wd];
  }

  return (
    <div>
      <h2 className="text-xl font-bold text-gray-800 mb-1">Pick a date</h2>
      <p className="text-gray-500 text-sm mb-4">Greyed-out days have no availability.</p>

      <div className="grid grid-cols-5 gap-2 max-h-64 overflow-y-auto mb-4">
        {days.map(d => {
          const available = isAvailable(d);
          const selected = form.date === toDateStr(d);
          const today = d.toDateString() === new Date().toDateString();
          return (
            <button key={d.toISOString()} onClick={() => available && setForm(f => ({...f, date: toDateStr(d), slot: null}))}
              disabled={!available}
              className={`p-2 rounded-xl text-center transition-all flex flex-col items-center
                ${selected ? 'bg-[#137fec] text-white font-bold ring-2 ring-blue-300' :
                  available ? 'border border-gray-200 hover:border-blue-300 hover:bg-blue-50 text-gray-700' :
                  'border border-gray-100 text-gray-300 cursor-not-allowed bg-gray-50'}`}>
              <span className="text-xs">{d.toLocaleDateString('en-IN', { weekday: 'short' })}</span>
              <span className="text-base font-semibold">{d.getDate()}</span>
              <span className="text-xs">{d.toLocaleDateString('en-IN', { month: 'short' })}</span>
              {today && !selected && <span className="text-xs text-blue-400 font-medium">Today</span>}
            </button>
          );
        })}
      </div>

      <div className="flex gap-3">
        <button onClick={onBack} className="flex-1 py-3 border border-gray-200 text-gray-600 font-semibold rounded-xl hover:bg-gray-50">← Back</button>
        <button onClick={onNext} disabled={!form.date}
          className="flex-1 py-3 bg-[#137fec] hover:bg-blue-600 disabled:bg-gray-300 text-white font-semibold rounded-xl transition-colors">
          Continue →
        </button>
      </div>
    </div>
  );
}

function StepTime({ form, setForm, onNext, onBack, tenantId, loadingSlots, setLoadingSlots, slots, setSlots }) {
  useEffect(() => {
    if (!form.date) return;
    setLoadingSlots(true);
    const params = { date: form.date };
    if (form.service_id) params.service_id = form.service_id;
    axios.get(`${API}/booking/${tenantId}/availability`, { params })
      .then(r => setSlots(r.data.slots || []))
      .catch(() => setSlots([]))
      .finally(() => setLoadingSlots(false));
  }, [form.date, tenantId]);

  return (
    <div>
      <h2 className="text-xl font-bold text-gray-800 mb-1">Pick a time</h2>
      <p className="text-gray-500 text-sm mb-4">
        {form.date ? toISTDate(form.date + 'T00:00:00') : 'Select a date first'}
      </p>

      {loadingSlots ? (
        <div className="flex items-center justify-center py-12 text-gray-400">
          <div className="animate-spin w-6 h-6 border-2 border-[#137fec] border-t-transparent rounded-full mr-2" />
          Loading available times…
        </div>
      ) : slots.length === 0 ? (
        <div className="text-center py-10 text-gray-500">
          <div className="text-4xl mb-2">😔</div>
          <p className="font-medium">No slots available for this day.</p>
          <p className="text-sm text-gray-400 mt-1">Try picking another date.</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2 max-h-64 overflow-y-auto mb-4">
          {slots.map(slot => (
            <button key={slot.datetime}
              onClick={() => setForm(f => ({...f, slot}))}
              className={`py-3 px-2 rounded-xl text-center text-sm font-semibold border transition-all
                ${form.slot?.datetime === slot.datetime
                  ? 'bg-[#137fec] text-white border-[#137fec] ring-2 ring-blue-200'
                  : 'border-gray-200 hover:border-blue-300 hover:bg-blue-50 text-gray-700'}`}>
              {slot.display_time}
            </button>
          ))}
        </div>
      )}

      <div className="flex gap-3 mt-2">
        <button onClick={onBack} className="flex-1 py-3 border border-gray-200 text-gray-600 font-semibold rounded-xl hover:bg-gray-50">← Back</button>
        <button onClick={onNext} disabled={!form.slot}
          className="flex-1 py-3 bg-[#137fec] hover:bg-blue-600 disabled:bg-gray-300 text-white font-semibold rounded-xl transition-colors">
          Continue →
        </button>
      </div>
    </div>
  );
}

function StepConfirm({ form, clinic, onSubmit, onBack, submitting, error }) {
  return (
    <div>
      <h2 className="text-xl font-bold text-gray-800 mb-1">Confirm your booking</h2>
      <p className="text-gray-500 text-sm mb-4">Please review the details below.</p>

      <div className="bg-blue-50 rounded-2xl p-5 mb-5 space-y-3">
        <Row label="Name" value={`${form.first_name} ${form.last_name || ''}`.trim()} />
        <Row label="Phone" value={form.phone} />
        {form.email && <Row label="Email" value={form.email} />}
        <div className="border-t border-blue-100 pt-3" />
        <Row label="Service" value={form.service_name || '—'} />
        {form.notes && <Row label="Notes" value={form.notes} />}
        <div className="border-t border-blue-100 pt-3" />
        <Row label="Date" value={toISTDate(form.date + 'T00:00:00')} />
        <Row label="Time" value={form.slot?.display_time} />
        <div className="border-t border-blue-100 pt-3" />
        <Row label="Clinic" value={clinic?.name} />
        {clinic?.address && <Row label="Address" value={[clinic.address, clinic.city].filter(Boolean).join(', ')} />}
        {clinic?.phone && <Row label="Phone" value={clinic.phone} />}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm mb-4">
          {error}
        </div>
      )}

      <div className="flex gap-3">
        <button onClick={onBack} disabled={submitting}
          className="flex-1 py-3 border border-gray-200 text-gray-600 font-semibold rounded-xl hover:bg-gray-50 disabled:opacity-50">
          ← Back
        </button>
        <button onClick={onSubmit} disabled={submitting}
          className="flex-1 py-3 bg-[#137fec] hover:bg-blue-600 disabled:bg-blue-300 text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2">
          {submitting
            ? <><div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" /> Booking…</>
            : 'Book Appointment'}
        </button>
      </div>

      <p className="text-center text-xs text-gray-400 mt-4">
        Your booking will be confirmed by the clinic. You'll receive a WhatsApp or email notification.
      </p>
    </div>
  );
}

function Row({ label, value }) {
  if (!value) return null;
  return (
    <div className="flex justify-between items-start gap-3">
      <span className="text-sm text-gray-500 flex-shrink-0">{label}</span>
      <span className="text-sm font-semibold text-gray-800 text-right">{value}</span>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function BookingPage() {
  const { clinicName, tenantId } = useParams();
  const navigate = useNavigate();

  const [step, setStep] = useState(0);
  const [clinic, setClinic] = useState(null);
  const [services, setServices] = useState([]);
  const [slots, setSlots] = useState([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [clinicLoading, setClinicLoading] = useState(true);
  const [clinicError, setClinicError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const [form, setForm] = useState({
    first_name: '', last_name: '', phone: '', email: '',
    service_id: '', service_name: '', notes: '',
    date: '', slot: null,
  });

  useEffect(() => {
    if (!tenantId) return;
    setClinicLoading(true);
    Promise.all([
      axios.get(`${API}/booking/${tenantId}/clinic-info`),
      axios.get(`${API}/booking/${tenantId}/services`),
    ])
      .then(([ci, sv]) => {
        setClinic(ci.data);
        setServices(sv.data);
      })
      .catch(() => setClinicError('Unable to load clinic information. Please check the link.'))
      .finally(() => setClinicLoading(false));
  }, [tenantId]);

  const handleSubmit = useCallback(async () => {
    setSubmitError('');
    setSubmitting(true);
    try {
      const payload = {
        first_name:   form.first_name.trim(),
        last_name:    form.last_name.trim(),
        phone:        form.phone,
        email:        form.email.trim(),
        service_id:   form.service_id,
        service_name: form.service_name,
        notes:        form.notes.trim(),
        datetime:     form.slot.datetime,
        doctor_id:    form.slot.doctor_ids?.[0] || null,
      };
      const res = await axios.post(`${API}/booking/${tenantId}/request`, payload);
      navigate(`/book-confirm`, {
        state: {
          appointment: res.data,
          form,
          clinic,
        },
      });
    } catch (err) {
      setSubmitError(err.response?.data?.error || 'Booking failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }, [form, tenantId, clinic, navigate]);

  if (clinicLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-10 h-10 border-4 border-[#137fec] border-t-transparent rounded-full mx-auto mb-3" />
          <p className="text-gray-500">Loading clinic info…</p>
        </div>
      </div>
    );
  }

  if (clinicError) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-white flex items-center justify-center p-4">
        <div className="text-center max-w-sm">
          <div className="text-5xl mb-3">😕</div>
          <h2 className="text-xl font-bold text-gray-800 mb-2">Booking page unavailable</h2>
          <p className="text-gray-500 text-sm">{clinicError}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-50">
      {/* Clinic Header */}
      <div className="bg-[#137fec] text-white px-4 py-5">
        <div className="max-w-md mx-auto flex items-center gap-3">
          {clinic?.logoUrl
            ? <img src={clinic.logoUrl} alt={clinic.name} className="h-10 w-10 rounded-full object-cover bg-white" />
            : <div className="h-10 w-10 rounded-full bg-white/20 flex items-center justify-center text-lg font-bold">
                {(clinic?.name || 'D')[0].toUpperCase()}
              </div>
          }
          <div>
            <h1 className="font-bold text-lg leading-tight">{clinic?.name || clinicName}</h1>
            {clinic?.tagline && <p className="text-blue-100 text-xs">{clinic.tagline}</p>}
          </div>
        </div>
      </div>

      {/* Booking Card */}
      <div className="max-w-md mx-auto px-4 py-6">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <StepIndicator current={step} total={STEPS.length} />

          {step === 0 && (
            <StepInfo form={form} setForm={setForm} onNext={() => setStep(1)} />
          )}
          {step === 1 && (
            <StepService services={services} form={form} setForm={setForm}
              onNext={() => setStep(2)} onBack={() => setStep(0)} />
          )}
          {step === 2 && (
            <StepDate form={form} setForm={setForm}
              onNext={() => setStep(3)} onBack={() => setStep(1)}
              workingHours={clinic?.working_hours || {}} />
          )}
          {step === 3 && (
            <StepTime form={form} setForm={setForm}
              onNext={() => setStep(4)} onBack={() => setStep(2)}
              tenantId={tenantId}
              loadingSlots={loadingSlots} setLoadingSlots={setLoadingSlots}
              slots={slots} setSlots={setSlots} />
          )}
          {step === 4 && (
            <StepConfirm form={form} clinic={clinic}
              onSubmit={handleSubmit} onBack={() => setStep(3)}
              submitting={submitting} error={submitError} />
          )}
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-gray-400 mt-6">
          Powered by <span className="font-semibold text-[#137fec]">Molaris DMS</span>
        </p>
      </div>
    </div>
  );
}
