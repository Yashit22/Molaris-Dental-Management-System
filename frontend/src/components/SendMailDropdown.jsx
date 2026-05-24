import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Mail, ChevronDown, FileText, Receipt, Sparkles,
  X, Loader2, CheckCircle, XCircle, Settings, BookOpen, Edit3,
} from 'lucide-react';
import API from '../services/api';

// Frontend-only presets for the manual send compose panel
const SEND_PRESETS = [
  {
    name:    'Thank You — Standard',
    subject: 'Thank you for your visit — {{date}}',
    body:    'Dear {{first_name}},\n\nThank you for visiting us today. Your appointment with {{doctor}} on {{date}} has been completed.\n\nTreatments received: {{treatments}}.\n\nFor any queries, feel free to reach out to us.\n\nWarm regards,\n{{clinic}}',
  },
  {
    name:    'Post-Visit Follow-Up',
    subject: 'Your visit is complete — follow-up care inside',
    body:    "Hi {{first_name}},\n\nYour appointment with {{doctor}} on {{date}} is now complete.\n\nTreatments completed: {{treatments}}.\n\nPlease follow the post-care instructions from your doctor. If you experience any discomfort, don't hesitate to contact us.\n\nLooking forward to seeing you again!\n\n{{clinic}}",
  },
  {
    name:    'Simple Thank You',
    subject: 'Visit Complete — {{date}}',
    body:    "Dear {{name}},\n\nThank you for your visit on {{date}} with {{doctor}}. We hope you're feeling great.\n\nWarm regards,\n{{clinic}}",
  },
];

export default function SendMailDropdown({ patientId, patient }) {
  const [open, setOpen]               = useState(false);
  const [loadState, setLoadState]     = useState('idle'); // idle | loading | ready
  const [emailStatus, setEmailStatus] = useState(null);
  const [selected, setSelected]       = useState({ smart_report: true, invoice: false, ai_report: false });
  const [emailTo, setEmailTo]         = useState('');
  const [customSubject, setCustomSubject] = useState('');
  const [customBody, setCustomBody]       = useState('');
  const [showEditor, setShowEditor]   = useState(false);
  const [presetOpen, setPresetOpen]   = useState(false);
  const [sending, setSending]         = useState(false);
  const [result, setResult]           = useState(null); // { ok, message }
  const panelRef = useRef(null);
  const navigate = useNavigate();

  // Pre-fill email whenever patient loads
  useEffect(() => {
    if (patient?.contact?.email) setEmailTo(patient.contact.email);
  }, [patient?.contact?.email]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function onDown(e) {
      if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  async function handleOpen() {
    setOpen(o => !o);
    setResult(null);
    if (loadState !== 'idle') return; // already loaded
    setLoadState('loading');
    try {
      const res = await API.get(`/email/patient-status/${patientId}`);
      setEmailStatus(res.data);
      setSelected({
        smart_report: true,
        invoice:      !!res.data.latestInvoice,
        ai_report:    !!res.data.latestAiReport,
      });
    } catch {
      setEmailStatus({ emailEnabled: false, hasSmtp: false, latestInvoice: null, latestAiReport: null });
    } finally {
      setLoadState('ready');
    }
  }

  function applyPreset(preset) {
    setCustomSubject(preset.subject);
    setCustomBody(preset.body);
    setShowEditor(true);
    setPresetOpen(false);
  }

  function toggle(key) {
    setSelected(s => ({ ...s, [key]: !s[key] }));
  }

  function selectAll() {
    setSelected({
      smart_report: true,
      invoice:   !!emailStatus?.latestInvoice,
      ai_report: !!emailStatus?.latestAiReport,
    });
  }

  async function handleSend() {
    const include = Object.keys(selected).filter(k => selected[k]);
    if (!include.length || !emailTo.trim()) return;
    setSending(true);
    setResult(null);
    try {
      const payload = { patient_id: patientId, to: emailTo.trim(), include };
      if (customSubject.trim()) payload.subject = customSubject.trim();
      if (customBody.trim())    payload.body    = customBody.trim();
      const res = await API.post('/email/send-treatment-summary', payload);
      const count = res.data.attachments?.length || 0;
      setResult({ ok: true, message: `Sent to ${res.data.to} — ${count} attachment${count !== 1 ? 's' : ''}` });
    } catch (err) {
      setResult({ ok: false, message: err.response?.data?.error || err.message });
    } finally {
      setSending(false);
    }
  }

  const anySelected = Object.values(selected).some(Boolean);

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={handleOpen}
        className="px-4 py-2 border border-slate-300 text-slate-600 font-medium rounded-lg hover:bg-slate-50 flex items-center gap-2 transition-colors text-sm"
      >
        <Mail size={16} />
        Send Mail
        <ChevronDown size={14} className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute bottom-full mb-2 right-0 w-80 bg-white rounded-2xl shadow-2xl border border-slate-200 z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <p className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
              <Mail size={14} className="text-[#137fec]" /> Send to Patient
            </p>
            <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
              <X size={15} />
            </button>
          </div>

          <div className="p-4 space-y-3">
            {/* Loading */}
            {loadState === 'loading' && (
              <div className="flex justify-center py-6">
                <Loader2 size={22} className="animate-spin text-[#137fec]" />
              </div>
            )}

            {/* Email not configured */}
            {loadState === 'ready' && !emailStatus?.emailEnabled && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-1">
                <p className="text-xs font-semibold text-amber-700">Email not configured</p>
                <p className="text-xs text-amber-600">
                  {emailStatus?.hasSmtp
                    ? 'Email is configured but not enabled. Enable it in Settings.'
                    : 'Set up your SMTP credentials in Settings to send emails.'}
                </p>
                <button
                  onClick={() => { setOpen(false); navigate('/settings'); }}
                  className="mt-1 text-xs text-[#137fec] underline flex items-center gap-1 hover:text-blue-700"
                >
                  <Settings size={11} /> Go to Settings → Email
                </button>
              </div>
            )}

            {/* Main UI */}
            {loadState === 'ready' && emailStatus?.emailEnabled && (
              <>
                {/* What to include */}
                <div className="flex items-center justify-between mb-1">
                  <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Include</p>
                  <button onClick={selectAll} className="text-[11px] text-[#137fec] hover:underline font-medium">
                    Select All
                  </button>
                </div>

                {/* Smart Report — always available */}
                <ItemRow
                  checked={selected.smart_report}
                  onChange={() => toggle('smart_report')}
                  icon={<FileText size={14} className="text-blue-500" />}
                  label="Smart Report"
                  sub="Treatments, prescriptions & notes"
                  available
                />

                {/* Invoice */}
                <ItemRow
                  checked={selected.invoice}
                  onChange={() => toggle('invoice')}
                  icon={<Receipt size={14} className="text-green-500" />}
                  label="Invoice"
                  sub={
                    emailStatus.latestInvoice
                      ? `${emailStatus.latestInvoice.invoice_id} · ₹${emailStatus.latestInvoice.total_amount} · ${emailStatus.latestInvoice.status}`
                      : 'No invoice on file'
                  }
                  available={!!emailStatus.latestInvoice}
                />

                {/* AI Report */}
                <ItemRow
                  checked={selected.ai_report}
                  onChange={() => toggle('ai_report')}
                  icon={<Sparkles size={14} className="text-purple-500" />}
                  label="AI Report"
                  sub={
                    emailStatus.latestAiReport
                      ? `${emailStatus.latestAiReport.templateId} · ${new Date(emailStatus.latestAiReport.createdAt).toLocaleDateString('en-IN')}`
                      : 'Not generated yet'
                  }
                  available={!!emailStatus.latestAiReport}
                />

                {/* Message composer */}
                <div className="pt-1 border-t border-slate-100 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Message</p>
                    <div className="flex items-center gap-2">
                      {/* Preset picker */}
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => setPresetOpen(p => !p)}
                          className="flex items-center gap-1 text-[11px] font-semibold text-[#137fec] hover:text-blue-700"
                        >
                          <BookOpen size={11} /> Presets
                          <ChevronDown size={11} className={`transition-transform ${presetOpen ? 'rotate-180' : ''}`} />
                        </button>
                        {presetOpen && (
                          <div className="absolute right-0 top-5 w-64 border border-slate-200 rounded-xl shadow-lg bg-white z-20 overflow-hidden">
                            {SEND_PRESETS.map((p, i) => (
                              <button
                                key={i}
                                type="button"
                                onClick={() => applyPreset(p)}
                                className="w-full text-left px-3 py-2.5 hover:bg-slate-50 transition-colors border-b border-slate-50 last:border-0"
                              >
                                <p className="text-xs font-semibold text-slate-700">{p.name}</p>
                                <p className="text-[10px] text-slate-400 truncate mt-0.5">{p.subject}</p>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowEditor(e => !e)}
                        className="text-[11px] text-slate-500 hover:text-slate-700 flex items-center gap-0.5"
                      >
                        <Edit3 size={11} /> {showEditor ? 'Hide' : 'Edit'}
                      </button>
                    </div>
                  </div>

                  {!showEditor && !customSubject && !customBody && (
                    <p className="text-xs text-slate-400 italic">Using built-in default — click Presets or Edit to customise.</p>
                  )}

                  {!showEditor && (customSubject || customBody) && (
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 space-y-0.5">
                      {customSubject && <p className="text-xs font-semibold text-slate-700 truncate">{customSubject}</p>}
                      {customBody    && <p className="text-xs text-slate-400 line-clamp-2 whitespace-pre-line">{customBody}</p>}
                    </div>
                  )}

                  {showEditor && (
                    <div className="space-y-2 border border-slate-200 rounded-xl p-3 bg-slate-50">
                      <div>
                        <label className="text-[11px] text-slate-500 block mb-0.5">Subject</label>
                        <input
                          type="text"
                          value={customSubject}
                          onChange={e => setCustomSubject(e.target.value)}
                          placeholder="Subject line… e.g. Thank you for your visit — {{date}}"
                          className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-[#137fec] outline-none bg-white"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] text-slate-500 block mb-0.5">Body</label>
                        <textarea
                          value={customBody}
                          onChange={e => setCustomBody(e.target.value)}
                          rows={5}
                          placeholder="Dear {{first_name}}, … use {{name}}, {{doctor}}, {{date}}, {{treatments}}, {{clinic}}"
                          className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-[#137fec] outline-none bg-white resize-none font-mono"
                        />
                      </div>
                      <p className="text-[10px] text-slate-400">Leave blank to use the system default message.</p>
                    </div>
                  )}
                </div>

                {/* Email address */}
                <div>
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wide block mb-1">Send to</label>
                  <input
                    type="email"
                    value={emailTo}
                    onChange={e => setEmailTo(e.target.value)}
                    placeholder="patient@example.com"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-[#137fec] outline-none"
                  />
                </div>

                {/* Result banner */}
                {result && (
                  <div className={`flex items-start gap-2 p-3 rounded-xl text-xs font-medium ${
                    result.ok ? 'bg-green-50 text-green-700 border border-green-100' : 'bg-red-50 text-red-700 border border-red-100'
                  }`}>
                    {result.ok
                      ? <CheckCircle size={13} className="flex-shrink-0 mt-0.5" />
                      : <XCircle    size={13} className="flex-shrink-0 mt-0.5" />}
                    {result.message}
                  </div>
                )}

                {/* Send button */}
                <button
                  onClick={handleSend}
                  disabled={sending || !anySelected || !emailTo.trim()}
                  className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#137fec] hover:bg-blue-600 text-white font-semibold rounded-xl text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {sending
                    ? <><Loader2 size={14} className="animate-spin" /> Sending…</>
                    : <><Mail size={14} /> Send Email</>}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ItemRow({ checked, onChange, icon, label, sub, available }) {
  return (
    <label className={`flex items-center gap-3 p-3 rounded-xl border transition-colors ${
      available
        ? 'border-slate-100 hover:bg-slate-50 cursor-pointer'
        : 'border-slate-100 opacity-40 cursor-not-allowed'
    }`}>
      <input
        type="checkbox"
        checked={checked}
        disabled={!available}
        onChange={onChange}
        className="accent-[#137fec] w-4 h-4 flex-shrink-0"
      />
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <span className="flex-shrink-0">{icon}</span>
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-700">{label}</p>
          <p className="text-xs text-slate-400 truncate">{sub}</p>
        </div>
      </div>
    </label>
  );
}
