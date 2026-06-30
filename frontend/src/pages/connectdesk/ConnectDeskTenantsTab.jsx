import { useState, useEffect, useCallback } from 'react';
import { Plus, Pencil, Trash2, X, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import cdApi from '../../services/cdApi.js';

// ── All editable tenant fields ────────────────────────────────────────────────
const FIELD_GROUPS = [
  {
    heading: 'Clinic Info',
    fields: [
      { key: 'name',     label: 'Clinic Name',  required: true },
      { key: 'slug',     label: 'Slug (URL key)' },
      { key: 'status',   label: 'Status', type: 'select', options: ['active','inactive','suspended'] },
      { key: 'email',    label: 'Email' },
      { key: 'phone',    label: 'Phone' },
      { key: 'website',  label: 'Website' },
    ],
  },
  {
    heading: 'Address',
    fields: [
      { key: 'address', label: 'Address' },
      { key: 'city',    label: 'City' },
      { key: 'state',   label: 'State' },
      { key: 'zipCode', label: 'ZIP Code' },
      { key: 'country', label: 'Country' },
    ],
  },
  {
    heading: 'Locale',
    fields: [
      { key: 'currency', label: 'Currency', placeholder: 'INR' },
      { key: 'timezone', label: 'Timezone', placeholder: 'Asia/Kolkata' },
    ],
  },
  {
    heading: 'Database',
    fields: [
      { key: 'mongoUri',    label: 'Mongo URI',     required: true, mono: true },
      { key: 'mongoDbName', label: 'Mongo DB Name', required: true, mono: true },
    ],
  },
  {
    heading: 'Google / Drive',
    fields: [
      { key: 'googleClientId',     label: 'Google Client ID',     mono: true },
      { key: 'googleClientSecret', label: 'Google Client Secret', mono: true },
      { key: 'googleRefreshToken', label: 'Google Refresh Token', mono: true },
      { key: 'googleDriveFolderId',label: 'Drive Root Folder ID', mono: true },
    ],
  },
  {
    heading: 'Sarvam AI',
    fields: [
      { key: 'sarvamApiKey', label: 'Sarvam API Key', mono: true },
    ],
  },
  {
    heading: 'Cloudinary',
    fields: [
      { key: 'cloudinaryCloudName', label: 'Cloud Name',  mono: true },
      { key: 'cloudinaryApiKey',    label: 'API Key',     mono: true },
      { key: 'cloudinaryApiSecret', label: 'API Secret',  mono: true },
    ],
  },
  {
    heading: 'WhatsApp (WAAPI)',
    fields: [
      { key: 'wapiBaseUrl', label: 'WAAPI Base URL', mono: true },
      { key: 'wapiToken',   label: 'WAAPI Token',    mono: true },
    ],
  },
];

const EMPTY = () => ({
  name: '', slug: '', status: 'active',
  email: '', phone: '', website: '',
  address: '', city: '', state: '', zipCode: '', country: '',
  currency: 'INR', timezone: 'Asia/Kolkata',
  mongoUri: '', mongoDbName: '',
  googleClientId: '', googleClientSecret: '', googleRefreshToken: '', googleDriveFolderId: '',
  sarvamApiKey: '',
  cloudinaryCloudName: '', cloudinaryApiKey: '', cloudinaryApiSecret: '',
  wapiBaseUrl: '', wapiToken: '',
});

// ── Inline confirm delete ─────────────────────────────────────────────────────
function DeleteConfirm({ name, onConfirm, onCancel, busy }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-slate-300">Delete <strong>{name}</strong>?</span>
      <button onClick={onConfirm} disabled={busy} className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium disabled:opacity-50 flex items-center gap-1">
        {busy ? <Loader2 size={12} className="animate-spin" /> : null} Yes, Delete
      </button>
      <button onClick={onCancel} className="px-3 py-1 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-medium">Cancel</button>
    </div>
  );
}

// ── Tenant form modal ─────────────────────────────────────────────────────────
function TenantModal({ tenant, onClose, onSaved }) {
  const isEdit = !!tenant?._id;
  const [form, setForm]   = useState(isEdit ? { ...EMPTY(), ...tenant } : EMPTY());
  const [busy, setBusy]   = useState(false);
  const [error, setError] = useState('');
  const [open, setOpen]   = useState({});

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  async function save() {
    setError('');
    if (!form.name || !form.mongoUri || !form.mongoDbName) {
      setError('Clinic Name, Mongo URI and Mongo DB Name are required.');
      return;
    }
    setBusy(true);
    try {
      if (isEdit) {
        await cdApi.put(`/tenants/${tenant._id}`, form);
      } else {
        await cdApi.post('/tenants', form);
      }
      onSaved();
    } catch (err) {
      setError(err.response?.data?.message || err.response?.data?.error || 'Save failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end bg-black/60" onClick={onClose}>
      <div
        className="w-full max-w-2xl h-full bg-slate-900 shadow-2xl overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-slate-900 border-b border-slate-800 px-6 py-4 flex items-center justify-between z-10">
          <h2 className="text-base font-bold text-white">{isEdit ? 'Edit Tenant' : 'New Tenant'}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X size={20} /></button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {FIELD_GROUPS.map(g => {
            const expanded = open[g.heading] !== false; // default open
            return (
              <div key={g.heading} className="bg-slate-800/60 rounded-xl border border-slate-700">
                <button
                  type="button"
                  onClick={() => setOpen(o => ({ ...o, [g.heading]: !expanded }))}
                  className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-slate-300 hover:text-white"
                >
                  {g.heading}
                  {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
                {expanded && (
                  <div className="px-4 pb-4 grid grid-cols-1 gap-3">
                    {g.fields.map(f => (
                      <div key={f.key}>
                        <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                          {f.label}{f.required && <span className="text-red-400 ml-0.5">*</span>}
                        </label>
                        {f.type === 'select' ? (
                          <select
                            value={form[f.key] || ''}
                            onChange={e => set(f.key, e.target.value)}
                            className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-sm text-white focus:outline-none focus:border-[#137fec]"
                          >
                            {f.options.map(o => <option key={o} value={o}>{o}</option>)}
                          </select>
                        ) : (
                          <input
                            value={form[f.key] || ''}
                            onChange={e => set(f.key, e.target.value)}
                            placeholder={f.placeholder || ''}
                            className={`w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-sm text-white focus:outline-none focus:border-[#137fec] ${f.mono ? 'font-mono text-xs' : ''}`}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {error && (
            <div className="text-sm text-red-400 bg-red-900/20 border border-red-800 rounded-lg px-4 py-2">{error}</div>
          )}

          <div className="flex gap-3 pt-1">
            <button onClick={onClose} className="flex-1 py-2.5 border border-slate-600 text-slate-300 rounded-xl text-sm font-medium hover:bg-slate-800">
              Cancel
            </button>
            <button onClick={save} disabled={busy} className="flex-1 py-2.5 bg-[#137fec] hover:bg-blue-500 text-white rounded-xl text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2">
              {busy && <Loader2 size={14} className="animate-spin" />}
              {isEdit ? 'Save Changes' : 'Create Tenant'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main tab ──────────────────────────────────────────────────────────────────
export default function ConnectDeskTenantsTab() {
  const [tenants, setTenants]       = useState([]);
  const [loading, setLoading]       = useState(true);
  const [modalTenant, setModalTenant] = useState(undefined); // undefined = closed, null = new, obj = edit
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await cdApi.get('/tenants');
      setTenants(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleDelete(tenant) {
    setDeleteBusy(true);
    try {
      await cdApi.delete(`/tenants/${tenant._id}`);
      setDeleteTarget(null);
      load();
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <div className="p-6">
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">Tenants</h1>
          <p className="text-sm text-slate-400 mt-0.5">{tenants.length} clinic{tenants.length !== 1 ? 's' : ''}</p>
        </div>
        <button
          onClick={() => setModalTenant(null)}
          className="flex items-center gap-2 px-4 py-2 bg-[#137fec] hover:bg-blue-500 text-white rounded-xl text-sm font-bold transition-colors"
        >
          <Plus size={16} /> New Tenant
        </button>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="animate-spin text-slate-400" size={28} /></div>
      ) : tenants.length === 0 ? (
        <div className="text-center py-20 text-slate-500 text-sm">No tenants yet.</div>
      ) : (
        <div className="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-left">
                <th className="px-4 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-wide">Clinic</th>
                <th className="px-4 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-wide">Status</th>
                <th className="px-4 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-wide">Database</th>
                <th className="px-4 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-wide">Created</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {tenants.map(t => (
                <tr key={t._id} className="border-b border-slate-800/60 hover:bg-slate-800/30 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-white">{t.name}</p>
                    {t.slug && <p className="text-xs text-slate-500 font-mono">{t.slug}</p>}
                    {t.email && <p className="text-xs text-slate-500">{t.email}</p>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${
                      t.status === 'active' ? 'bg-green-900/50 text-green-400' :
                      t.status === 'inactive' ? 'bg-slate-700 text-slate-400' :
                      'bg-red-900/50 text-red-400'
                    }`}>{t.status || 'active'}</span>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-xs font-mono text-slate-400 truncate max-w-[200px]">{t.mongoDbName}</p>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {t.createdAt ? new Date(t.createdAt).toLocaleDateString('en-GB') : '—'}
                  </td>
                  <td className="px-4 py-3">
                    {deleteTarget?._id === t._id ? (
                      <DeleteConfirm
                        name={t.name}
                        busy={deleteBusy}
                        onConfirm={() => handleDelete(t)}
                        onCancel={() => setDeleteTarget(null)}
                      />
                    ) : (
                      <div className="flex items-center gap-1 justify-end">
                        <button
                          onClick={() => setModalTenant(t)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
                          title="Edit"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => setDeleteTarget(t)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-900/30 transition-colors"
                          title="Delete"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      {modalTenant !== undefined && (
        <TenantModal
          tenant={modalTenant}
          onClose={() => setModalTenant(undefined)}
          onSaved={() => { setModalTenant(undefined); load(); }}
        />
      )}
    </div>
  );
}
