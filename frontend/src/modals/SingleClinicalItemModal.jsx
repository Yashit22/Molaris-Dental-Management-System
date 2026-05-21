import React, { useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import API from '../services/api';

const CONFIG = {
  findings: {
    title: 'Add Clinical Finding',
    endpoint: '/clinical-findings',
    fields: [
      { name: 'name',        label: 'Name',        required: true,  type: 'text', placeholder: 'e.g. Bleeding on probing' },
      { name: 'category',    label: 'Category',    required: false, type: 'text', placeholder: 'e.g. Periodontal' },
      { name: 'description', label: 'Description', required: false, type: 'textarea', placeholder: 'Short clinical note (optional)' },
    ],
  },
  diagnoses: {
    title: 'Add Diagnosis',
    endpoint: '/diagnoses',
    fields: [
      { name: 'name',        label: 'Name',        required: true,  type: 'text', placeholder: 'e.g. Irreversible pulpitis' },
      { name: 'code',        label: 'ICD / Dental Code', required: false, type: 'text', placeholder: 'e.g. K04.01' },
      { name: 'category',    label: 'Category',    required: false, type: 'text', placeholder: 'e.g. Pulp & Periapical' },
      { name: 'description', label: 'Description', required: false, type: 'textarea', placeholder: 'Short clinical note (optional)' },
    ],
  },
  treatments: {
    title: 'Add Suggested Treatment',
    endpoint: '/suggested-treatments',
    fields: [
      { name: 'name',        label: 'Name',        required: true,  type: 'text', placeholder: 'e.g. RCT — molar' },
      { name: 'category',    label: 'Category',    required: false, type: 'text', placeholder: 'e.g. Endodontic' },
      { name: 'cost',        label: 'Default Cost (₹)', required: false, type: 'number', placeholder: '0' },
      { name: 'description', label: 'Description', required: false, type: 'textarea', placeholder: 'Short note (optional)' },
    ],
  },
};

export default function SingleClinicalItemModal({ tab, onClose, onSaved }) {
  const cfg = CONFIG[tab];
  const [form, setForm] = useState(() => Object.fromEntries(cfg.fields.map(f => [f.name, f.name === 'cost' ? 0 : ''])));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { setError('Name is required.'); return; }
    setSaving(true);
    setError('');
    try {
      const payload = {
        ...form,
        name: String(form.name).trim(),
        is_active: true,
        ...(tab === 'treatments' ? { cost: Number(form.cost) || 0 } : {}),
      };
      await API.post(cfg.endpoint, payload);
      onSaved?.();
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setSaving(false);
    }
  };

  const inputCls = 'w-full mt-1 px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-[#137fec] outline-none bg-white dark:bg-slate-800';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
          <h3 className="font-bold text-lg text-slate-800 dark:text-white">{cfg.title}</h3>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700"><X size={20} /></button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          {cfg.fields.map(f => (
            <div key={f.name}>
              <label className="text-xs font-bold text-slate-500 uppercase">
                {f.label}{f.required && <span className="text-red-500"> *</span>}
              </label>
              {f.type === 'textarea' ? (
                <textarea
                  value={form[f.name]}
                  onChange={e => setForm({ ...form, [f.name]: e.target.value })}
                  placeholder={f.placeholder}
                  rows={3}
                  className={`${inputCls} resize-none`}
                />
              ) : (
                <input
                  type={f.type}
                  required={f.required}
                  autoFocus={f.name === 'name'}
                  min={f.type === 'number' ? 0 : undefined}
                  value={form[f.name]}
                  onChange={e => setForm({ ...form, [f.name]: e.target.value })}
                  placeholder={f.placeholder}
                  className={inputCls}
                />
              )}
            </div>
          ))}
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800">Cancel</button>
            <button type="submit" disabled={saving} className="px-5 py-2 rounded-lg bg-[#137fec] text-white text-sm font-bold hover:bg-blue-600 disabled:opacity-60 flex items-center gap-2">
              {saving && <Loader2 size={14} className="animate-spin" />}
              {saving ? 'Saving…' : 'Add'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
