import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Mail, ChevronDown, FileText, Receipt, Sparkles,
  X, Loader2, CheckCircle, XCircle, Settings, BookOpen, Edit3, MessageSquare,
} from 'lucide-react';
import API from '../services/api';

// Helper: replace {{placeholder}} with actual values
function applyVars(template, vars) {
  if (!template) return '';
  return template.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? `{{${k}}}`);
}

export default function SendMailDropdown({ patientId, patient }) {
  const [open, setOpen]               = useState(false);
  const [loadState, setLoadState]     = useState('idle'); // idle | loading | ready
  const [emailStatus, setEmailStatus] = useState(null);
  const [selected, setSelected]       = useState({ smart_report: true, invoice: false, ai_report: false });
  const [emailTo, setEmailTo]         = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody]     = useState('');
  const [showEmailEditor, setShowEmailEditor] = useState(false);
  const [whatsappPhone, setWhatsappPhone] = useState('');
  const [whatsappText, setWhatsappText] = useState('');
  const [showWhatsappEditor, setShowWhatsappEditor] = useState(false);
  const [sendMode, setSendMode]       = useState('email'); // email | whatsapp
  const [sending, setSending]         = useState(false);
  const [result, setResult]           = useState(null); // { ok, message }
  const [emailSettings, setEmailSettings] = useState(null);
  const panelRef = useRef(null);
  const navigate = useNavigate();

  // Build variable map for placeholder substitution
  function getVars() {
    const patientName = patient ? `${patient.first_name} ${patient.last_name || ''}`.trim() : '';
    const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    return {
      patientName,
      name: patientName,
      first_name: patient?.first_name || patientName,
      lastName: patient?.last_name || '',
      doctor: 'Your Doctor',
      doctorName: 'Your Doctor',
      date: today,
      treatments: 'your treatments',
      clinic: emailSettings?.clinic?.name || 'Your Clinic',
      clinicName: emailSettings?.clinic?.name || 'Your Clinic',
    };
  }

  // Pre-fill email and phone whenever patient loads
  useEffect(() => {
    if (patient?.contact?.email) setEmailTo(patient.contact.email);
    if (patient?.contact?.mobile) setWhatsappPhone(patient.contact.mobile);
  }, [patient?.contact?.email, patient?.contact?.mobile]);

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
    if (loadState !== 'idle') return;
    setLoadState('loading');
    try {
      const [statusRes, settingsRes] = await Promise.all([
        API.get(`/email/patient-status/${patientId}`),
        API.get('/settings/email').catch(() => ({ data: {} })),
      ]);

      setEmailStatus(statusRes.data);
      setEmailSettings(settingsRes.data);

      const vars = getVars();

      // Pre-fill email with default template
      const defaultSubject = 'Thank you for your visit — {{date}}';
      const defaultBody = 'Dear {{first_name}},\n\nThank you for visiting us. Please find your documents attached.\n\nWarm regards,\n{{doctor}}';

      setEmailSubject(applyVars(defaultSubject, vars));
      setEmailBody(applyVars(defaultBody, vars));

      // Pre-fill WhatsApp
      const waDefaultText = 'Hi {{first_name}}, thank you for visiting us. Your documents are ready.';
      setWhatsappText(applyVars(waDefaultText, vars));

      setSelected({
        smart_report: true,
        invoice:      !!statusRes.data.latestInvoice,
        ai_report:    !!statusRes.data.latestAiReport,
      });
    } catch (err) {
      console.error(err);
      setEmailStatus({ emailEnabled: false, hasSmtp: false, latestInvoice: null, latestAiReport: null });
      setEmailSettings({});
    } finally {
      setLoadState('ready');
    }
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

  async function handleSendEmail() {
    const include = Object.keys(selected).filter(k => selected[k]);
    if (!include.length || !emailTo.trim()) return;
    setSending(true);
    setResult(null);
    try {
      const payload = {
        patient_id: patientId,
        to: emailTo.trim(),
        include,
        subject: emailSubject.trim(),
        body: emailBody.trim(),
      };
      const res = await API.post('/email/send-treatment-summary', payload);
      const count = res.data.attachments?.length || 0;
      setResult({ ok: true, message: `Sent to ${res.data.to} — ${count} attachment${count !== 1 ? 's' : ''}` });
    } catch (err) {
      setResult({ ok: false, message: err.response?.data?.error || err.message });
    } finally {
      setSending(false);
    }
  }

  async function handleSendWhatsApp() {
    const include = Object.keys(selected).filter(k => selected[k]);
    if (!include.length || !whatsappPhone.trim()) return;
    setSending(true);
    setResult(null);
    try {
      const payload = {
        patient_id: patientId,
        to: whatsappPhone.trim(),
        include,
        text: whatsappText.trim(),
      };
      const res = await API.post('/whatsapp/send-treatment-summary', payload);
      setResult({ ok: true, message: `Sent on WhatsApp to ${res.data.to}` });
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
        Send
        <ChevronDown size={14} className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute bottom-full mb-2 right-0 w-96 bg-white rounded-2xl shadow-2xl border border-slate-200 z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <p className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
              <Mail size={14} className="text-[#137fec]" /> Share with Patient
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

            {/* Not configured */}
            {loadState === 'ready' && !emailStatus?.emailEnabled && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-1">
                <p className="text-xs font-semibold text-amber-700">Email not configured</p>
                <p className="text-xs text-amber-600">Set up SMTP credentials in Settings to send emails.</p>
                <button
                  onClick={() => { setOpen(false); navigate('/settings'); }}
                  className="mt-1 text-xs text-[#137fec] underline flex items-center gap-1 hover:text-blue-700"
                >
                  <Settings size={11} /> Go to Settings
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

                {/* Smart Report */}
                <ItemRow
                  checked={selected.smart_report}
                  onChange={() => toggle('smart_report')}
                  icon={<FileText size={14} className="text-blue-500" />}
                  label="Treatment Summary"
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
                      ? `${emailStatus.latestInvoice.invoice_id} · ₹${emailStatus.latestInvoice.total_amount}`
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
                      ? `Generated · ${new Date(emailStatus.latestAiReport.createdAt).toLocaleDateString('en-IN')}`
                      : 'Not generated yet'
                  }
                  available={!!emailStatus.latestAiReport}
                />

                {/* Send mode tabs */}
                <div className="flex gap-2 pt-2 border-t border-slate-100">
                  <button
                    onClick={() => setSendMode('email')}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-semibold transition-colors ${
                      sendMode === 'email'
                        ? 'bg-[#137fec] text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    <Mail size={13} /> Email
                  </button>
                  <button
                    onClick={() => setSendMode('whatsapp')}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-semibold transition-colors ${
                      sendMode === 'whatsapp'
                        ? 'bg-[#137fec] text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    <MessageSquare size={13} /> WhatsApp
                  </button>
                </div>

                {/* Email Section */}
                {sendMode === 'email' && (
                  <div className="space-y-3 pt-3 border-t border-slate-100">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-[11px] font-bold text-slate-500 uppercase">Email</label>
                        <button
                          onClick={() => setShowEmailEditor(e => !e)}
                          className="text-[11px] text-slate-500 hover:text-slate-700 flex items-center gap-0.5"
                        >
                          <Edit3 size={11} /> {showEmailEditor ? 'Done' : 'Edit'}
                        </button>
                      </div>
                      <input
                        type="email"
                        value={emailTo}
                        onChange={e => setEmailTo(e.target.value)}
                        placeholder="patient@example.com"
                        className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-[#137fec] outline-none"
                      />
                    </div>

                    {showEmailEditor && (
                      <div className="space-y-2 border border-slate-200 rounded-lg p-3 bg-slate-50">
                        <div>
                          <label className="text-[11px] text-slate-500 block mb-1">Subject</label>
                          <input
                            type="text"
                            value={emailSubject}
                            onChange={e => setEmailSubject(e.target.value)}
                            placeholder="Subject…"
                            className="w-full px-2 py-1 border border-slate-300 rounded text-xs focus:ring-2 focus:ring-[#137fec] outline-none"
                          />
                        </div>
                        <div>
                          <label className="text-[11px] text-slate-500 block mb-1">Message</label>
                          <textarea
                            value={emailBody}
                            onChange={e => setEmailBody(e.target.value)}
                            rows={4}
                            className="w-full px-2 py-1 border border-slate-300 rounded text-xs focus:ring-2 focus:ring-[#137fec] outline-none resize-none font-mono"
                          />
                        </div>
                        <p className="text-[10px] text-slate-400">Placeholders: {{patientName}}, {{first_name}}, {{date}}, {{doctor}}, {{clinic}}</p>
                      </div>
                    )}

                    {!showEmailEditor && (
                      <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-[11px] space-y-1 max-h-24 overflow-y-auto">
                        <p className="font-semibold text-slate-700">{emailSubject}</p>
                        <p className="text-slate-500 whitespace-pre-line">{emailBody}</p>
                      </div>
                    )}
                  </div>
                )}

                {/* WhatsApp Section */}
                {sendMode === 'whatsapp' && (
                  <div className="space-y-3 pt-3 border-t border-slate-100">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-[11px] font-bold text-slate-500 uppercase">Phone</label>
                        <button
                          onClick={() => setShowWhatsappEditor(e => !e)}
                          className="text-[11px] text-slate-500 hover:text-slate-700 flex items-center gap-0.5"
                        >
                          <Edit3 size={11} /> {showWhatsappEditor ? 'Done' : 'Edit'}
                        </button>
                      </div>
                      <input
                        type="tel"
                        value={whatsappPhone}
                        onChange={e => setWhatsappPhone(e.target.value)}
                        placeholder="+91 98765 43210"
                        className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-[#137fec] outline-none"
                      />
                    </div>

                    {showWhatsappEditor && (
                      <div className="border border-slate-200 rounded-lg p-3 bg-slate-50">
                        <label className="text-[11px] text-slate-500 block mb-1">Message</label>
                        <textarea
                          value={whatsappText}
                          onChange={e => setWhatsappText(e.target.value)}
                          rows={3}
                          className="w-full px-2 py-1 border border-slate-300 rounded text-xs focus:ring-2 focus:ring-[#137fec] outline-none resize-none"
                        />
                        <p className="text-[10px] text-slate-400 mt-1">Placeholders: {{patientName}}, {{first_name}}, {{date}}, {{doctor}}, {{clinic}}</p>
                      </div>
                    )}

                    {!showWhatsappEditor && (
                      <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-[11px] max-h-20 overflow-y-auto whitespace-pre-line text-slate-500">
                        {whatsappText}
                      </div>
                    )}
                  </div>
                )}

                {/* Result banner */}
                {result && (
                  <div className={`flex items-start gap-2 p-3 rounded-xl text-xs font-medium ${
                    result.ok ? 'bg-green-50 text-green-700 border border-green-100' : 'bg-red-50 text-red-700 border border-red-100'
                  }`}>
                    {result.ok
                      ? <CheckCircle size={13} className="flex-shrink-0 mt-0.5" />
                      : <XCircle size={13} className="flex-shrink-0 mt-0.5" />}
                    {result.message}
                  </div>
                )}

                {/* Send button */}
                <button
                  onClick={sendMode === 'email' ? handleSendEmail : handleSendWhatsApp}
                  disabled={sending || !anySelected || (sendMode === 'email' ? !emailTo.trim() : !whatsappPhone.trim())}
                  className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#137fec] hover:bg-blue-600 text-white font-semibold rounded-xl text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {sending ? (
                    <><Loader2 size={14} className="animate-spin" /> Sending…</>
                  ) : (
                    <>{sendMode === 'email' ? <Mail size={14} /> : <MessageSquare size={14} />}
                    Send via {sendMode === 'email' ? 'Email' : 'WhatsApp'}</>
                  )}
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
