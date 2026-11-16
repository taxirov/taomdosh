import { StrictMode, useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, NavLink, Route, Routes } from 'react-router-dom';
import { api, ApiError, getTokens, setTokens } from './api';
import { CookbooksPage } from './pages/Cookbooks';
import { DashboardPage } from './pages/Dashboard';
import { DishesPage } from './pages/Dishes';
import { GroupsPage } from './pages/Groups';
import { IngredientsPage } from './pages/Ingredients';
import { LoginPage } from './pages/Login';
import { ModerationPage } from './pages/Moderation';
import { PricesPage } from './pages/Prices';
import { UsersPage } from './pages/Users';
import './styles.css';
import { Button, ToastProvider } from './ui';

export interface Me {
  id: string;
  name: string;
  phone: string | null;
  isAdmin: boolean;
}

const NAV: { to: string; label: string; icon: string; badge?: 'pending' }[] = [
  { to: '/', label: 'Bosh sahifa', icon: 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z' },
  { to: '/moderation', label: 'Moderatsiya', icon: 'M9 12l2 2 4-4M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z', badge: 'pending' },
  { to: '/dishes', label: 'Taomlar', icon: 'M4 13h16a8 8 0 0 1-16 0zM12 4v3M8 5l1 2M16 5l-1 2' },
  { to: '/cookbooks', label: 'Cookbooklar', icon: 'M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3zM5 17a3 3 0 0 1 3-3h11' },
  { to: '/ingredients', label: 'Masalliqlar', icon: 'M12 21c-4 0-7-3-7-7 0-5 7-11 7-11s7 6 7 11c0 4-3 7-7 7z' },
  { to: '/prices', label: 'Narxlar', icon: 'M20 12l-8 8-9-9V3h8zM7.5 7.5h.01' },
  { to: '/users', label: 'Foydalanuvchilar', icon: 'M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM22 19v-1a4 4 0 0 0-3-3.9M16 4.1a3 3 0 0 1 0 5.8' },
  { to: '/groups', label: 'Guruhlar', icon: 'M3 21V9l9-6 9 6v12M9 21v-6h6v6' },
];

function Shell({ me, onLogout }: { me: Me; onLogout: () => void }) {
  const [pending, setPending] = useState(0);
  const [open, setOpen] = useState(false);
  const refreshPending = useCallback(() => {
    api<{ catalog: { pendingDishes: number; pendingCookbooks: number } }>('/admin/stats')
      .then((s) => setPending(s.catalog.pendingDishes + s.catalog.pendingCookbooks))
      .catch(() => {});
  }, []);
  useEffect(() => {
    refreshPending();
    const t = setInterval(refreshPending, 60_000);
    window.addEventListener('pending-changed', refreshPending);
    return () => {
      clearInterval(t);
      window.removeEventListener('pending-changed', refreshPending);
    };
  }, [refreshPending]);

  return (
    <div className={`app ${open ? 'nav-open' : ''}`}>
      <aside className="sidebar">
        <div className="brand">
          <svg viewBox="0 0 40 40" className="logo" aria-hidden>
            <rect width="40" height="40" rx="11" fill="var(--terracotta)" />
            <circle cx="20" cy="20" r="9.5" fill="var(--cream)" />
            <circle cx="20" cy="20" r="4" fill="var(--mustard)" />
            {[0, 90, 180, 270].map((a) => (
              <circle key={a} cx={20 + 14.5 * Math.cos((a * Math.PI) / 180)} cy={20 + 14.5 * Math.sin((a * Math.PI) / 180)} r="1.8" fill="var(--cream)" />
            ))}
          </svg>
          <div>
            <div className="brand-name">Taomdosh</div>
            <div className="brand-sub">Admin panel</div>
          </div>
        </div>
        <nav onClick={() => setOpen(false)}>
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.to === '/'} className="nav">
              <svg viewBox="0 0 24 24" aria-hidden>
                <path d={n.icon} />
              </svg>
              {n.label}
              {n.badge && pending > 0 && <span className="nav-badge">{pending}</span>}
            </NavLink>
          ))}
        </nav>
        <div className="side-foot">
          <div className="me">
            <div className="avatar">{me.name.slice(0, 1).toUpperCase()}</div>
            <div className="me-text">
              <b>{me.name}</b>
              <span className="muted">{me.phone ?? ''}</span>
            </div>
          </div>
          <Button kind="ghost" size="sm" onClick={onLogout}>
            Chiqish
          </Button>
        </div>
      </aside>
      <div className="scrim" onClick={() => setOpen(false)} />
      <main>
        <button className="menu-btn" onClick={() => setOpen(true)} aria-label="Menyu">
          ☰
        </button>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/moderation" element={<ModerationPage />} />
          <Route path="/dishes" element={<DishesPage />} />
          <Route path="/cookbooks" element={<CookbooksPage />} />
          <Route path="/ingredients" element={<IngredientsPage />} />
          <Route path="/prices" element={<PricesPage />} />
          <Route path="/users" element={<UsersPage meId={me.id} />} />
          <Route path="/groups" element={<GroupsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}

function App() {
  const [me, setMe] = useState<Me | null>(null);
  const [state, setState] = useState<'loading' | 'login' | 'denied' | 'ready'>('loading');

  const load = useCallback(async () => {
    if (!getTokens()) return setState('login');
    setState('loading');
    try {
      const m = await api<Me>('/me');
      setMe(m);
      setState(m.isAdmin ? 'ready' : 'denied');
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        setTokens(null);
        setState('login');
      } else setState('login');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const logout = async () => {
    const t = getTokens();
    if (t) await api('/auth/logout', { method: 'POST', body: { refreshToken: t.refreshToken }, auth: false }).catch(() => {});
    setTokens(null);
    setMe(null);
    setState('login');
  };

  useEffect(() => {
    const onChange = () => !getTokens() && setState('login');
    window.addEventListener('auth-changed', onChange);
    return () => window.removeEventListener('auth-changed', onChange);
  }, []);

  if (state === 'loading') return <div className="boot">Yuklanmoqda…</div>;
  if (state === 'login') return <LoginPage onDone={load} />;
  if (state === 'denied')
    return (
      <div className="center-screen">
        <div className="card narrow">
          <h2>Ruxsat yo'q</h2>
          <p className="muted">
            <b>{me?.name}</b> ({me?.phone}) platforma admini emas. Admin qilish uchun serverdagi <code>.env</code> faylida{' '}
            <code>ADMIN_PHONES</code> ga raqamni qo'shing yoki boshqa admin sizga rol bersin.
          </p>
          <Button kind="primary" onClick={logout}>
            Boshqa raqam bilan kirish
          </Button>
        </div>
      </div>
    );
  return <Shell me={me!} onLogout={logout} />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename="/admin">
      <ToastProvider>
        <App />
      </ToastProvider>
    </BrowserRouter>
  </StrictMode>,
);
