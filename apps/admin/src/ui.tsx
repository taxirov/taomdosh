import { createContext, ReactNode, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { errorText } from './api';

// ─────────── ma'lumot yuklash ───────────

export function useLoad<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const seq = useRef(0);
  const reload = useCallback(() => {
    const n = ++seq.current;
    setLoading(true);
    setError(null);
    fn()
      .then((d) => n === seq.current && setData(d))
      .catch((e) => n === seq.current && setError(errorText(e)))
      .finally(() => n === seq.current && setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(reload, [reload]);
  return { data, error, loading, reload, setData };
}

export function useDebounced<T>(value: T, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

// ─────────── toast ───────────

type Toast = { id: number; text: string; kind: 'ok' | 'err' };
const ToastCtx = createContext<(text: string, kind?: 'ok' | 'err') => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((text: string, kind: 'ok' | 'err' = 'ok') => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x, { id, text, kind }]);
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), kind === 'err' ? 5000 : 2600);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" role="status">
        {items.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/** Amalni bajaradi: xatoni toast qiladi, muvaffaqiyatda matn chiqaradi */
export function useAction() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const run = useCallback(
    async <T,>(fn: () => Promise<T>, ok?: string): Promise<T | undefined> => {
      setBusy(true);
      try {
        const r = await fn();
        if (ok) toast(ok);
        return r;
      } catch (e) {
        toast(errorText(e), 'err');
        return undefined;
      } finally {
        setBusy(false);
      }
    },
    [toast],
  );
  return { run, busy };
}

// ─────────── tuzilma ───────────

export function PageHead({ title, sub, actions }: { title: string; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="page-head">
      <div>
        <h1>{title}</h1>
        {sub && <p className="muted">{sub}</p>}
      </div>
      {actions && <div className="row gap">{actions}</div>}
    </header>
  );
}

export function Card({ title, actions, children, className = '' }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <div className="card-head">
          {title && <h3>{title}</h3>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: 'warn' | 'ok' | 'accent' }) {
  return (
    <div className={`stat ${tone ?? ''}`}>
      <span className="stat-label">{label}</span>
      <b className="stat-value">{value}</b>
      {hint && <span className="stat-hint">{hint}</span>}
    </div>
  );
}

const BADGE: Record<string, [string, string]> = {
  pending: ['Kutilmoqda', 'warn'],
  approved: ['Tasdiqlangan', 'ok'],
  rejected: ['Rad etilgan', 'err'],
  public: ['Ommaviy', 'accent'],
  group: ['Guruh', 'muted'],
  private: ['Shaxsiy', 'muted'],
  active: ['Faol', 'ok'],
  blocked: ['Bloklangan', 'err'],
  deleted: ["O'chirilgan", 'muted'],
  admin: ['Admin', 'accent'],
  user: ['Foydalanuvchi', 'muted'],
  member: ["A'zo", 'muted'],
  ok: ['OK', 'ok'],
  retry: ['Qayta urinadi', 'warn'],
  failed: ['Xato', 'err'],
  family: ['Oila', 'muted'],
  students: ['Talabalar', 'muted'],
  team: ['Jamoa', 'muted'],
  finished: ['Tugagan', 'muted'],
  cancelled: ['Bekor qilingan', 'muted'],
};
export function Badge({ v, label }: { v: string; label?: string }) {
  const [text, tone] = BADGE[v] ?? [v, 'muted'];
  return <span className={`badge ${tone}`}>{label ?? text}</span>;
}

export function Button({
  children,
  kind = 'default',
  size,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { kind?: 'default' | 'primary' | 'danger' | 'ghost' | 'ok'; size?: 'sm' }) {
  return (
    <button type="button" className={`btn ${kind} ${size ?? ''}`} {...rest}>
      {children}
    </button>
  );
}

export function Search({ value, onChange, placeholder = 'Qidirish…' }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className="search">
      <svg viewBox="0 0 24 24" aria-hidden>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} />
    </label>
  );
}

export function Select<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: [T, string][];
  label: string;
}) {
  return (
    <select className="select" value={value} onChange={(e) => onChange(e.target.value as T)} aria-label={label}>
      {options.map(([v, t]) => (
        <option key={v} value={v}>
          {t}
        </option>
      ))}
    </select>
  );
}

export function Pager({ total, limit, offset, onChange }: { total: number; limit: number; offset: number; onChange: (o: number) => void }) {
  if (total <= limit) return total ? <div className="pager muted">Jami: {total}</div> : null;
  const page = Math.floor(offset / limit) + 1;
  const pages = Math.ceil(total / limit);
  return (
    <div className="pager">
      <span className="muted">
        {offset + 1}–{Math.min(offset + limit, total)} / {total}
      </span>
      <Button size="sm" disabled={page <= 1} onClick={() => onChange(offset - limit)}>
        ← Oldingi
      </Button>
      <span>
        {page} / {pages}
      </span>
      <Button size="sm" disabled={page >= pages} onClick={() => onChange(offset + limit)}>
        Keyingi →
      </Button>
    </div>
  );
}

export function State({ loading, error, empty, onRetry, children }: { loading: boolean; error: string | null; empty?: boolean; onRetry?: () => void; children: ReactNode }) {
  if (error)
    return (
      <div className="state err">
        <b>Xatolik</b>
        <p>{error}</p>
        {onRetry && <Button onClick={onRetry}>Qayta urinish</Button>}
      </div>
    );
  if (loading && empty !== false)
    return (
      <div className="skeleton-list">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="skeleton" />
        ))}
      </div>
    );
  if (empty)
    return (
      <div className="state">
        <b>Hech narsa topilmadi</b>
        <p className="muted">Filtr yoki qidiruvni o'zgartirib ko'ring.</p>
      </div>
    );
  return <div className={loading ? 'is-loading' : ''}>{children}</div>;
}

export function Modal({ title, onClose, children, footer, wide }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="modal" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`dialog ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="dialog-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Yopish">
            ✕
          </button>
        </div>
        <div className="dialog-body">{children}</div>
        {footer && <div className="dialog-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Confirm({ text, onYes, onNo, danger, yes = 'Ha' }: { text: ReactNode; onYes: () => void; onNo: () => void; danger?: boolean; yes?: string }) {
  return (
    <Modal
      title="Tasdiqlang"
      onClose={onNo}
      footer={
        <>
          <Button kind="ghost" onClick={onNo}>
            Bekor qilish
          </Button>
          <Button kind={danger ? 'danger' : 'primary'} onClick={onYes}>
            {yes}
          </Button>
        </>
      }
    >
      <p>{text}</p>
    </Modal>
  );
}

// ─────────── formatlash ───────────

/** dd.mm.yyyy (Toshkent vaqti); "2026-11-17" kabi sana satri ham qabul qilinadi */
function parts(s: string) {
  const d = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T12:00:00+05:00`) : new Date(s);
  const f = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Tashkent' });
  const o = Object.fromEntries(f.formatToParts(d).map((p) => [p.type, p.value]));
  return { date: `${o.day}.${o.month}.${o.year}`, time: `${o.hour}:${o.minute}` };
}
export const fmtDate = (s: string | null | undefined) => (s ? parts(s).date : '—');
export const fmtDateTime = (s: string | null | undefined) => {
  if (!s) return '—';
  const p = parts(s);
  return `${p.date} ${p.time}`;
};
export const fmtMoney = (n: number | null | undefined) => (n == null ? '—' : `${Math.round(n).toLocaleString('ru-RU').replace(/,/g, ' ')} so'm`);
export const fmtNum = (n: number | null | undefined, d = 0) => (n == null ? '—' : n.toLocaleString('ru-RU', { maximumFractionDigits: d }));
export const fmtPhone = (p: string | null) => (p ? p.replace(/^\+998(\d{2})(\d{3})(\d{2})(\d{2})$/, '+998 $1 $2 $3 $4') : '—');
export const UNIT: Record<string, string> = { kg: 'kg', g: 'g', l: 'l', ml: 'ml', pcs: 'dona' };
