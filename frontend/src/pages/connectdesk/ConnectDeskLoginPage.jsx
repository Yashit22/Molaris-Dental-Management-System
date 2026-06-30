import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import cdApi from '../../services/cdApi.js';

export default function ConnectDeskLoginPage() {
  const navigate = useNavigate();
  const [form, setForm]   = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy]   = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const { data } = await cdApi.post('/login', form);
      localStorage.setItem('cd_token', data.token);
      navigate('/connect-desk');
    } catch (err) {
      setError(err.response?.data?.message || 'Login failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo / Title */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[#137fec] mb-4 shadow-lg shadow-blue-500/30">
            <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white">Connect Desk</h1>
          <p className="text-slate-400 text-sm mt-1">Super Admin Console</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-slate-800 rounded-2xl p-6 shadow-2xl space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1.5">Email</label>
            <input
              type="email"
              value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              className="w-full px-3 py-2.5 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm placeholder-slate-500 focus:outline-none focus:border-[#137fec]"
              placeholder="admin@example.com"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1.5">Password</label>
            <input
              type="password"
              value={form.password}
              onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
              className="w-full px-3 py-2.5 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm placeholder-slate-500 focus:outline-none focus:border-[#137fec]"
              placeholder="••••••••"
              required
            />
          </div>

          {error && (
            <div className="text-sm text-red-400 bg-red-900/30 border border-red-800 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full py-2.5 bg-[#137fec] hover:bg-blue-500 disabled:opacity-50 text-white font-bold rounded-lg transition-colors text-sm"
          >
            {busy ? 'Signing in…' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}
