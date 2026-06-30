import { useState, useEffect } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Building2, Users, LogOut, ShieldCheck } from 'lucide-react';
import cdApi from '../../services/cdApi.js';

const NAV = [
  { to: '/connect-desk/tenants', icon: Building2, label: 'Tenants' },
  { to: '/connect-desk/users',   icon: Users,     label: 'Users'   },
];

export default function ConnectDeskLayout() {
  const navigate = useNavigate();
  const [admin, setAdmin] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem('cd_token');
    if (!token) { navigate('/connect-desk/login', { replace: true }); return; }
    cdApi.get('/me').then(r => setAdmin(r.data)).catch(() => {
      localStorage.removeItem('cd_token');
      navigate('/connect-desk/login', { replace: true });
    });
  }, [navigate]);

  function logout() {
    localStorage.removeItem('cd_token');
    navigate('/connect-desk/login', { replace: true });
  }

  return (
    <div className="min-h-screen bg-slate-950 flex">
      {/* Sidebar */}
      <aside className="w-56 flex-shrink-0 bg-slate-900 border-r border-slate-800 flex flex-col">
        {/* Logo */}
        <div className="px-5 py-5 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#137fec] flex items-center justify-center shadow shadow-blue-500/30">
              <ShieldCheck size={16} className="text-white" />
            </div>
            <div>
              <p className="text-sm font-bold text-white leading-none">Connect Desk</p>
              <p className="text-[10px] text-slate-500 mt-0.5">Super Admin</p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-[#137fec] text-white'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`
              }
            >
              <Icon size={16} />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Footer */}
        <div className="px-3 py-4 border-t border-slate-800">
          {admin && (
            <p className="text-[11px] text-slate-500 truncate px-3 mb-2">{admin.email}</p>
          )}
          <button
            onClick={logout}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-400 hover:text-red-400 hover:bg-slate-800 transition-colors w-full"
          >
            <LogOut size={16} /> Sign Out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
