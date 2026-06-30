import { useState, useEffect, useCallback } from 'react';
import { Pencil, Trash2, X, Loader2, Search, ChevronDown, Stethoscope } from 'lucide-react';
import cdApi from '../../services/cdApi.js';

const STATUS_OPTIONS = ['pending', 'active', 'inactive', 'rejected'];
const ROLE_OPTIONS   = ['Owner', 'Doctor', 'Receptionist', 'Assistant'];

const STATUS_BADGE = {
  pending:  'bg-yellow-900/40 text-yellow-400',
  active:   'bg-green-900/40 text-green-400',
  inactive: 'bg-slate-700 text-slate-400',
  rejected: 'bg-red-900/40 text-red-400',
};

// ── Inline confirm delete ─────────────────────────────────────────────────────
function DeleteConfirm({ name, onConfirm, onCancel, busy }) {
  return (
    <div className="flex items-center gap-2 text-sm flex-wrap">
      <span className="text-slate-300">Delete <strong>{name}</strong>?</span>
      <button onClick={onConfirm} disabled={busy} className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium disabled:opacity-50 flex items-center gap-1">
        {busy && <Loader2 size={12} className="animate-spin" />} Yes, Delete
      </button>
      <button onClick={onCancel} className="px-3 py-1 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-medium">Cancel</button>
    </div>
  );
}

// ── Edit user drawer ──────────────────────────────────────────────────────────
function UserDrawer({ user, tenants, onClose, onSaved }) {
  const [form, setForm]   = useState({
    firstName:   user.firstName  || '',
    lastName:    user.lastName   || '',
    email:       user.email      || '',
    phone:       user.phone      || '',
    role:        user.role       || 'Doctor',
    status:      user.status     || 'pending',
    tenantId:    user.tenantId   ? String(user.tenantId) : '',
    doctorId:    user.doctorId   ? String(user.doctorId) : '',
    newPassword: '',
  });
  const [busy, setBusy]   = useState(false);
  const [error, setError] = useState('');
  const [tenantDoctors, setTenantDoctors] = useState([]);
  const [docsLoading, setDocsLoading]     = useState(false);

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  // Load the assigned tenant's doctors whenever the tenant changes (for Doctor linking)
  useEffect(() => {
    if (!form.tenantId) { setTenantDoctors([]); return; }
    let cancelled = false;
    setDocsLoading(true);
    cdApi.get(`/tenants/${form.tenantId}/doctors`)
      .then(r => { if (!cancelled) setTenantDoctors(r.data || []); })
      .catch(() => { if (!cancelled) setTenantDoctors([]); })
      .finally(() => { if (!cancelled) setDocsLoading(false); });
    return () => { cancelled = true; };
  }, [form.tenantId]);

  async function save() {
    setError('');
    // A Doctor-role user must be linked to a Doctor record
    if (form.role === 'Doctor' && form.tenantId && !form.doctorId) {
      setError('Doctor-role users must be assigned a doctor from the clinic.');
      return;
    }
    setBusy(true);
    try {
      const payload = { ...form };
      if (!payload.newPassword) delete payload.newPassword;
      if (!payload.tenantId)    payload.tenantId = null;
      // Only persist doctorId for Doctor role; clear it otherwise
      payload.doctorId = payload.role === 'Doctor' ? (payload.doctorId || null) : null;
      await cdApi.patch(`/users/${user._id}`, payload);
      onSaved();
    } catch (err) {
      setError(err.response?.data?.message || err.response?.data?.error || 'Save failed.');
    } finally {
      setBusy(false);
    }
  }

  const Field = ({ label, k, type = 'text', mono = false, children }) => (
    <div>
      <label className="block text-[11px] font-semibold text-slate-400 mb-1">{label}</label>
      {children || (
        <input
          type={type}
          value={form[k] || ''}
          onChange={e => set(k, e.target.value)}
          className={`w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-sm text-white focus:outline-none focus:border-[#137fec] ${mono ? 'font-mono text-xs' : ''}`}
        />
      )}
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end bg-black/60" onClick={onClose}>
      <div className="w-full max-w-md h-full bg-slate-900 shadow-2xl overflow-y-auto" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="sticky top-0 bg-slate-900 border-b border-slate-800 px-5 py-4 flex items-center justify-between z-10">
          <div>
            <h2 className="text-base font-bold text-white">Edit User</h2>
            <p className="text-[11px] text-slate-500 font-mono">{user._id}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X size={20} /></button>
        </div>

        <div className="px-5 py-5 space-y-4">
          {/* Name */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="First Name" k="firstName" />
            <Field label="Last Name"  k="lastName"  />
          </div>

          <Field label="Email" k="email" type="email" />
          <Field label="Phone" k="phone" />

          {/* Role */}
          <Field label="Role" k="role">
            <select value={form.role} onChange={e => set('role', e.target.value)}
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-sm text-white focus:outline-none focus:border-[#137fec]">
              {ROLE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </Field>

          {/* Status */}
          <Field label="Status" k="status">
            <select value={form.status} onChange={e => set('status', e.target.value)}
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-sm text-white focus:outline-none focus:border-[#137fec]">
              {STATUS_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </Field>

          {/* Tenant assignment */}
          <Field label="Tenant (Clinic)" k="tenantId">
            <select value={form.tenantId} onChange={e => set('tenantId', e.target.value)}
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-sm text-white focus:outline-none focus:border-[#137fec]">
              <option value="">— No clinic assigned —</option>
              {tenants.map(t => (
                <option key={t._id} value={String(t._id)}>{t.name} ({t.mongoDbName})</option>
              ))}
            </select>
          </Field>

          {/* Tenant ID raw */}
          <Field label="Tenant ID (raw ObjectId — override)" k="tenantId" mono>
            <input
              value={form.tenantId || ''}
              onChange={e => set('tenantId', e.target.value)}
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-xs font-mono text-white focus:outline-none focus:border-[#137fec]"
              placeholder="MongoDB ObjectId string"
            />
          </Field>

          {/* Doctor link — only for Doctor-role users */}
          {form.role === 'Doctor' && (
            <div className="bg-blue-950/30 border border-blue-900/50 rounded-xl p-4 space-y-2">
              <div className="flex items-center gap-2">
                <Stethoscope size={14} className="text-[#137fec]" />
                <p className="text-xs font-semibold text-blue-300 uppercase tracking-wide">Linked Doctor <span className="text-red-400">*</span></p>
              </div>
              {!form.tenantId ? (
                <p className="text-xs text-slate-500 italic">Assign a clinic first to pick a doctor.</p>
              ) : docsLoading ? (
                <div className="flex items-center gap-2 text-xs text-slate-400 py-1"><Loader2 size={12} className="animate-spin" /> Loading clinic doctors…</div>
              ) : tenantDoctors.length === 0 ? (
                <p className="text-xs text-amber-400 italic">No doctors found in this clinic. Add a doctor in the clinic app first.</p>
              ) : (
                <select value={form.doctorId} onChange={e => set('doctorId', e.target.value)}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-sm text-white focus:outline-none focus:border-[#137fec]">
                  <option value="">— Select doctor —</option>
                  {tenantDoctors.map(d => (
                    <option key={d._id} value={String(d._id)}>
                      {d.name}{d.specialization ? ` · ${d.specialization}` : ''}{d.is_active === false ? ' (inactive)' : ''}
                    </option>
                  ))}
                </select>
              )}
              <p className="text-[10px] text-slate-500">This doctor's appointments &amp; treatments are all this user will see.</p>
            </div>
          )}

          {/* Password reset */}
          <div className="bg-slate-800 rounded-xl p-4 space-y-2">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Set New Password</p>
            <input
              type="password"
              value={form.newPassword}
              onChange={e => set('newPassword', e.target.value)}
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-sm text-white focus:outline-none focus:border-[#137fec]"
              placeholder="Leave blank to keep current password"
            />
          </div>

          {/* Metadata read-only */}
          <div className="bg-slate-800/50 rounded-xl p-4 space-y-1 text-xs text-slate-500 font-mono">
            <p><span className="text-slate-600">product:</span> {user.product}</p>
            <p><span className="text-slate-600">createdAt:</span> {user.createdAt ? new Date(user.createdAt).toLocaleString() : '—'}</p>
            <p><span className="text-slate-600">updatedAt:</span> {user.updatedAt ? new Date(user.updatedAt).toLocaleString() : '—'}</p>
          </div>

          {error && (
            <div className="text-sm text-red-400 bg-red-900/20 border border-red-800 rounded-lg px-4 py-2">{error}</div>
          )}

          <div className="flex gap-3 pt-1">
            <button onClick={onClose} className="flex-1 py-2.5 border border-slate-600 text-slate-300 rounded-xl text-sm font-medium hover:bg-slate-800">
              Cancel
            </button>
            <button onClick={save} disabled={busy} className="flex-1 py-2.5 bg-[#137fec] hover:bg-blue-500 text-white rounded-xl text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2">
              {busy && <Loader2 size={14} className="animate-spin" />} Save Changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main tab ──────────────────────────────────────────────────────────────────
export default function ConnectDeskUsersTab() {
  const [users, setUsers]         = useState([]);
  const [tenants, setTenants]     = useState([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [editUser, setEditUser]   = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const tenantMap = Object.fromEntries(tenants.map(t => [String(t._id), t.name]));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterStatus) params.set('status', filterStatus);
      if (search)       params.set('search', search);
      const [usersRes, tenantsRes] = await Promise.all([
        cdApi.get(`/users?${params}`),
        cdApi.get('/tenants'),
      ]);
      setUsers(usersRes.data);
      setTenants(tenantsRes.data);
    } finally {
      setLoading(false);
    }
  }, [search, filterStatus]);

  useEffect(() => { load(); }, [load]);

  async function handleDelete(user) {
    setDeleteBusy(true);
    try {
      await cdApi.delete(`/users/${user._id}`);
      setDeleteTarget(null);
      load();
    } finally {
      setDeleteBusy(false);
    }
  }

  // Quick-status toggle directly from the table
  async function quickStatus(user, status) {
    try {
      await cdApi.patch(`/users/${user._id}`, { status });
      load();
    } catch (e) { console.error(e); }
  }

  return (
    <div className="p-6">
      {/* Page header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-white">Users</h1>
          <p className="text-sm text-slate-400 mt-0.5">{users.length} user{users.length !== 1 ? 's' : ''}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-5">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search name or email…"
            className="w-full pl-8 pr-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-[#137fec]"
          />
        </div>
        <div className="relative">
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
            className="appearance-none pl-3 pr-8 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-[#137fec]"
          >
            <option value="">All statuses</option>
            {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="animate-spin text-slate-400" size={28} /></div>
      ) : users.length === 0 ? (
        <div className="text-center py-20 text-slate-500 text-sm">No users found.</div>
      ) : (
        <div className="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden overflow-x-auto">
          <table className="w-full text-sm min-w-[700px]">
            <thead>
              <tr className="border-b border-slate-800 text-left">
                <th className="px-4 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-wide">User</th>
                <th className="px-4 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-wide">Role</th>
                <th className="px-4 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-wide">Status</th>
                <th className="px-4 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-wide">Tenant</th>
                <th className="px-4 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-wide">Registered</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u._id} className="border-b border-slate-800/60 hover:bg-slate-800/30 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-white">{u.firstName} {u.lastName}</p>
                    <p className="text-xs text-slate-500">{u.email}</p>
                    {u.phone && <p className="text-xs text-slate-600">{u.phone}</p>}
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs text-slate-300 bg-slate-700 px-2 py-0.5 rounded-full">{u.role}</span>
                    {u.role === 'Doctor' && !u.doctorId && (
                      <p className="text-[10px] text-amber-400 mt-1">⚠ no doctor linked</p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {/* Quick-status dropdown */}
                    <select
                      value={u.status}
                      onChange={e => quickStatus(u, e.target.value)}
                      className={`text-xs font-bold px-2 py-1 rounded-full border-0 focus:outline-none cursor-pointer ${STATUS_BADGE[u.status] || 'bg-slate-700 text-slate-400'}`}
                    >
                      {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    {u.tenantId ? (
                      <div>
                        <p className="text-xs text-slate-300">{tenantMap[String(u.tenantId)] || 'Unknown'}</p>
                        <p className="text-[10px] font-mono text-slate-600">{String(u.tenantId)}</p>
                      </div>
                    ) : (
                      <span className="text-xs text-slate-600 italic">unassigned</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {u.createdAt ? new Date(u.createdAt).toLocaleDateString('en-GB') : '—'}
                  </td>
                  <td className="px-4 py-3">
                    {deleteTarget?._id === u._id ? (
                      <DeleteConfirm
                        name={`${u.firstName} ${u.lastName}`}
                        busy={deleteBusy}
                        onConfirm={() => handleDelete(u)}
                        onCancel={() => setDeleteTarget(null)}
                      />
                    ) : (
                      <div className="flex items-center gap-1 justify-end">
                        <button
                          onClick={() => setEditUser(u)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
                          title="Edit"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => setDeleteTarget(u)}
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

      {/* Edit drawer */}
      {editUser && (
        <UserDrawer
          user={editUser}
          tenants={tenants}
          onClose={() => setEditUser(null)}
          onSaved={() => { setEditUser(null); load(); }}
        />
      )}
    </div>
  );
}
