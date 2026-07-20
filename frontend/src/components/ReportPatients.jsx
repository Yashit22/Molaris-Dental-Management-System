import React, { useEffect, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area, PieChart, Pie, Cell, Legend,
} from 'recharts';
import { Loader2, Users, UserPlus, RefreshCw, AlertTriangle } from 'lucide-react';
import API from '../services/api';

const COLORS = ['#137fec', '#22c55e', '#eab308', '#f97316', '#ef4444', '#8b5cf6', '#ec4899'];

function useAnalytics(section, from, to) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  useEffect(() => {
    setLoading(true);
    setError('');
    const url = section === 'recall'
      ? `/analytics?section=recall`
      : `/analytics?section=${section}&from=${from}&to=${to}`;
    API.get(url)
      .then(r => setData(r.data))
      .catch(e => setError(e.response?.data?.error || e.message))
      .finally(() => setLoading(false));
  }, [section, from, to]);

  return { data, loading, error };
}

function Loading() {
  return <div className="flex items-center justify-center h-64"><Loader2 size={32} className="animate-spin text-[#137fec]" /></div>;
}
function Err({ msg }) {
  return <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-red-700 text-sm">{msg}</div>;
}

// ── Appointments ──────────────────────────────────────────────────────────────
function Appointments({ from, to }) {
  const { data, loading, error } = useAnalytics('appointments', from, to);
  if (loading) return <Loading />;
  if (error)   return <Err msg={error} />;
  const d = data || {};

  const kpis = [
    { label: 'Total',      value: d.total     || 0, color: 'text-blue-600',  bg: 'bg-blue-50'  },
    { label: 'Completed',  value: d.completed || 0, color: 'text-green-600', bg: 'bg-green-50' },
    { label: 'Cancelled',  value: d.cancelled || 0, color: 'text-red-600',   bg: 'bg-red-50'   },
    { label: 'No Show',    value: d.no_show   || 0, color: 'text-orange-600',bg: 'bg-orange-50'},
  ];

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        {kpis.map(k => (
          <div key={k.label} className="bg-white p-4 md:p-6 rounded-2xl border shadow-sm">
            <p className={`text-xs md:text-sm font-medium ${k.color}`}>{k.label}</p>
            <p className="text-2xl md:text-3xl font-bold text-slate-800 mt-1">{k.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
        <div className="lg:col-span-2 bg-white p-4 md:p-6 rounded-2xl border shadow-sm">
          <h3 className="font-bold text-slate-800 mb-4 text-sm md:text-base">Daily Appointment Trend</h3>
          {d.trend?.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={d.trend} margin={{ left: -10, right: 10 }}>
                <defs>
                  <linearGradient id="aptGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#137fec" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#137fec" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11 }} width={35} />
                <Tooltip />
                <Area type="monotone" dataKey="count" stroke="#137fec" strokeWidth={2.5} fill="url(#aptGrad)" name="Appointments" />
              </AreaChart>
            </ResponsiveContainer>
          ) : <p className="text-slate-400 text-sm text-center py-16">No data in this period.</p>}
        </div>

        <div className="bg-white p-4 md:p-6 rounded-2xl border shadow-sm">
          <h3 className="font-bold text-slate-800 mb-4 text-sm md:text-base">By Status</h3>
          {d.by_status?.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={d.by_status} cx="50%" cy="45%" innerRadius={48} outerRadius={72} paddingAngle={3} dataKey="value" nameKey="name">
                  {d.by_status.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip />
                <Legend verticalAlign="bottom" height={36} />
              </PieChart>
            </ResponsiveContainer>
          ) : <p className="text-slate-400 text-sm text-center py-16">No data.</p>}
        </div>
      </div>
    </div>
  );
}

// ── Patients Report ───────────────────────────────────────────────────────────
function PatientsReport({ from, to }) {
  const { data, loading, error } = useAnalytics('patients', from, to);
  const [openList, setOpenList] = useState(null); // 'new' | 'return' | null

  // Reset any open drill-down when the selected period changes.
  useEffect(() => { setOpenList(null); }, [from, to]);

  if (loading) return <Loading />;
  if (error)   return <Err msg={error} />;
  const d = data || {};

  const toggle = (key) => setOpenList(prev => (prev === key ? null : key));

  const listRows   = openList === 'new' ? (d.new_patient_rows || []) : (d.return_patient_rows || []);
  const listTitle  = openList === 'new' ? 'New Patients' : 'Return Patients';
  const dateLabel  = openList === 'new' ? 'Registered' : 'Last Visit';
  const dateField  = openList === 'new' ? 'created_at' : 'last_visit_date';

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="grid grid-cols-2 gap-3 md:gap-4">
        <button
          type="button"
          onClick={() => toggle('new')}
          aria-pressed={openList === 'new'}
          className={`text-left bg-white p-4 md:p-6 rounded-2xl border shadow-sm flex gap-3 md:gap-4 items-center transition hover:shadow-md hover:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-200 ${openList === 'new' ? 'ring-2 ring-blue-300 border-blue-300' : ''}`}
        >
          <div className="size-10 md:size-12 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0">
            <UserPlus size={20} className="text-blue-600" />
          </div>
          <div className="min-w-0">
            <p className="text-slate-500 text-xs md:text-sm">New Patients</p>
            <p className="text-2xl md:text-3xl font-bold text-slate-800">{d.new_patients || 0}</p>
          </div>
        </button>
        <button
          type="button"
          onClick={() => toggle('return')}
          aria-pressed={openList === 'return'}
          className={`text-left bg-white p-4 md:p-6 rounded-2xl border shadow-sm flex gap-3 md:gap-4 items-center transition hover:shadow-md hover:border-green-300 focus:outline-none focus:ring-2 focus:ring-green-200 ${openList === 'return' ? 'ring-2 ring-green-300 border-green-300' : ''}`}
        >
          <div className="size-10 md:size-12 rounded-xl bg-green-50 flex items-center justify-center flex-shrink-0">
            <RefreshCw size={20} className="text-green-600" />
          </div>
          <div className="min-w-0">
            <p className="text-slate-500 text-xs md:text-sm">Return Patients</p>
            <p className="text-2xl md:text-3xl font-bold text-slate-800">{d.return_patients || 0}</p>
          </div>
        </button>
      </div>

      {/* Drill-down list for the clicked box */}
      {openList && (
        <div className="bg-white border rounded-2xl shadow-sm overflow-hidden">
          <div className="p-4 border-b bg-slate-50 flex items-center justify-between">
            <h3 className="font-bold text-slate-800 text-sm md:text-base">{listTitle} ({listRows.length})</h3>
            <button type="button" onClick={() => setOpenList(null)} className="text-slate-400 hover:text-slate-600 text-xs font-medium">Close</button>
          </div>
          {listRows.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[380px]">
                <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
                  <tr>
                    <th className="p-3 text-left">Patient ID</th>
                    <th className="p-3 text-left">Name</th>
                    <th className="p-3 text-left">Mobile</th>
                    <th className="p-3 text-left">{dateLabel}</th>
                  </tr>
                </thead>
                <tbody>
                  {listRows.map((r, i) => (
                    <tr key={r._id || i} className="border-t border-slate-50 hover:bg-slate-50">
                      <td className="p-3 text-slate-400 font-mono text-xs">{r.patientId}</td>
                      <td className="p-3 font-medium">{r.name}</td>
                      <td className="p-3 text-slate-500">{r.mobile || '—'}</td>
                      <td className="p-3 text-slate-500">
                        {r[dateField] ? new Date(r[dateField]).toLocaleDateString('en-GB') : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-slate-400 text-sm text-center py-12">No {listTitle.toLowerCase()} in this period.</p>
          )}
        </div>
      )}

      {/* Top treatments */}
      <div className="bg-white p-4 md:p-6 rounded-2xl border shadow-sm">
        <h3 className="font-bold text-slate-800 mb-4 md:mb-6 text-sm md:text-base">Most Requested Treatments</h3>
        {d.top_treatments?.length > 0 ? (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={d.top_treatments} margin={{ left: -10, right: 10 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10 }} interval={0} angle={-30} textAnchor="end" height={50} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11 }} width={35} />
              <Tooltip />
              <Bar dataKey="count" radius={[4, 4, 0, 0]} name="Count">
                {d.top_treatments.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : <p className="text-slate-400 text-sm text-center py-12">No treatment data in this period.</p>}
      </div>
    </div>
  );
}

// ── Recall ────────────────────────────────────────────────────────────────────
function Recall() {
  const { data, loading, error } = useAnalytics('recall', null, null);
  if (loading) return <Loading />;
  if (error)   return <Err msg={error} />;
  const rows = data?.rows || [];

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
        <AlertTriangle size={18} className="text-amber-600 mt-0.5 flex-shrink-0" />
        <p className="text-sm text-amber-700">
          Showing <strong>{rows.length}</strong> patient{rows.length !== 1 ? 's' : ''} who haven't visited in over 6 months.
        </p>
      </div>

      <div className="bg-white border rounded-2xl shadow-sm overflow-hidden">
        <div className="p-4 border-b bg-slate-50"><h3 className="font-bold text-slate-800 text-sm md:text-base">Recall Due</h3></div>
        {rows.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[380px]">
              <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
                <tr>
                  <th className="p-3 text-left">Patient ID</th>
                  <th className="p-3 text-left">Name</th>
                  <th className="p-3 text-left">Mobile</th>
                  <th className="p-3 text-left">Last Visit</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-t border-slate-50 hover:bg-slate-50">
                    <td className="p-3 text-slate-400 font-mono text-xs">{r.patientId}</td>
                    <td className="p-3 font-medium">{r.name}</td>
                    <td className="p-3 text-slate-500">{r.mobile || '—'}</td>
                    <td className="p-3 text-red-600 font-medium">
                      {r.last_visit_date ? new Date(r.last_visit_date).toLocaleDateString('en-GB') : 'Never'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-slate-400 text-sm text-center py-12">All patients have visited within 6 months.</p>
        )}
      </div>
    </div>
  );
}

// ── No-Show ───────────────────────────────────────────────────────────────────
function NoShow({ from, to }) {
  const { data, loading, error } = useAnalytics('no_show', from, to);
  if (loading) return <Loading />;
  if (error)   return <Err msg={error} />;
  const d = data || {};

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4">
        {[
          { label: 'Total Appointments', value: d.total           || 0 },
          { label: 'No Shows',           value: d.no_show_count   || 0, sub: `${d.no_show_rate || 0}%`,   color: 'text-orange-600' },
          { label: 'Cancellations',      value: d.cancelled_count || 0, sub: `${d.cancelled_rate || 0}%`, color: 'text-red-600'    },
        ].map(k => (
          <div key={k.label} className="bg-white p-4 md:p-6 rounded-2xl border shadow-sm">
            <p className="text-slate-500 text-xs md:text-sm">{k.label}</p>
            <p className="text-2xl md:text-3xl font-bold text-slate-800 mt-1">{k.value}</p>
            {k.sub && <p className={`text-xs md:text-sm font-semibold mt-1 ${k.color}`}>{k.sub} rate</p>}
          </div>
        ))}
      </div>

      <div className="bg-white p-4 md:p-6 rounded-2xl border shadow-sm">
        <h3 className="font-bold text-slate-800 mb-4 md:mb-6 text-sm md:text-base">Monthly No-Show & Cancellation Trend</h3>
        {d.by_month?.length > 0 ? (
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={d.by_month} margin={{ left: -10, right: 10 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 11 }} interval="preserveStartEnd" />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11 }} width={35} />
              <Tooltip />
              <Legend />
              <Bar dataKey="no_show"   fill="#f97316" radius={[4, 4, 0, 0]} name="No Show" />
              <Bar dataKey="cancelled" fill="#ef4444" radius={[4, 4, 0, 0]} name="Cancelled" />
            </BarChart>
          </ResponsiveContainer>
        ) : <p className="text-slate-400 text-sm text-center py-16">No appointment data in this period.</p>}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function ReportPatients({ from, to, section }) {
  if (section === 'appointments') return <Appointments from={from} to={to} />;
  if (section === 'patients')     return <PatientsReport from={from} to={to} />;
  if (section === 'recall')       return <Recall />;
  if (section === 'no_show')      return <NoShow from={from} to={to} />;
  return <Appointments from={from} to={to} />;
}
