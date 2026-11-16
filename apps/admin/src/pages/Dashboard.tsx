import { Link } from 'react-router-dom';
import { api } from '../api';
import { Badge, Card, fmtDate, PageHead, Stat, State, useLoad } from '../ui';

export interface Stats {
  users: { total: number; active: number; blocked: number; new7d: number; admins: number };
  groups: { total: number; new7d: number; activePlans: number };
  catalog: { dishes: number; publicDishes: number; pendingDishes: number; cookbooks: number; pendingCookbooks: number };
  ingredients: { total: number; linked: number };
  meals7d: number;
  prices: {
    latestDate: string | null;
    lastRun: { date: string; status: string; attempts: number; error: string | null; source: string } | null;
    syncEnabled: boolean;
  };
  signups: { date: string; count: number }[];
}

/** So'nggi 14 kun: bo'sh kunlar 0 bilan to'ldiriladi */
function last14(rows: { date: string; count: number }[]) {
  const map = new Map(rows.map((r) => [r.date, r.count]));
  return Array.from({ length: 14 }, (_, i) => {
    const d = new Date(Date.now() - (13 - i) * 86_400_000);
    const key = d.toLocaleDateString('sv-SE', { timeZone: 'Asia/Tashkent' });
    return { date: key, count: map.get(key) ?? 0 };
  });
}

function Signups({ rows }: { rows: { date: string; count: number }[] }) {
  const data = last14(rows);
  const max = Math.max(1, ...data.map((d) => d.count));
  return (
    <div className="bars" role="img" aria-label="So'nggi 14 kunda ro'yxatdan o'tganlar">
      {data.map((d) => (
        <div key={d.date} className="bar-col" title={`${d.date}: ${d.count}`}>
          <span className="bar-n">{d.count || ''}</span>
          <div className="bar" style={{ height: `${Math.max(3, (d.count / max) * 100)}%` }} />
          <span className="bar-d">{d.date.slice(8)}</span>
        </div>
      ))}
    </div>
  );
}

export function DashboardPage() {
  const { data: s, error, loading, reload } = useLoad(() => api<Stats>('/admin/stats'), []);
  const pending = s ? s.catalog.pendingDishes + s.catalog.pendingCookbooks : 0;
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tashkent' });
  const stalePrices = s?.prices.latestDate && s.prices.latestDate < today;

  return (
    <>
      <PageHead title="Bosh sahifa" sub="Platformaning umumiy holati" />
      <State loading={loading} error={error} empty={!s} onRetry={reload}>
        {s && (
          <>
            {pending > 0 && (
              <Link to="/moderation" className="alert warn">
                <b>{pending} ta</b> kontent moderatsiyani kutmoqda ({s.catalog.pendingDishes} taom, {s.catalog.pendingCookbooks} cookbook) →
              </Link>
            )}
            <div className="stats">
              <Stat label="Foydalanuvchilar" value={s.users.total} hint={`+${s.users.new7d} shu hafta`} />
              <Stat label="Guruhlar" value={s.groups.total} hint={`${s.groups.activePlans} ta faol reja`} />
              <Stat label="Mahallar (7 kun)" value={s.meals7d} hint="rejalashtirilgan va pishirilgan" />
              <Stat label="Moderatsiya" value={pending} hint="kutilayotgan" tone={pending ? 'warn' : 'ok'} />
            </div>
            <div className="grid-2">
              <Card title="Ro'yxatdan o'tish — so'nggi 14 kun">
                <Signups rows={s.signups} />
              </Card>
              <Card title="Katalog">
                <dl className="kv">
                  <dt>Taomlar</dt>
                  <dd>
                    {s.catalog.dishes} <span className="muted">(ommaviy: {s.catalog.publicDishes})</span>
                  </dd>
                  <dt>Cookbooklar</dt>
                  <dd>{s.catalog.cookbooks}</dd>
                  <dt>Masalliqlar</dt>
                  <dd>
                    {s.ingredients.total} <span className="muted">(narxga bog'langan: {s.ingredients.linked})</span>
                  </dd>
                </dl>
                <div className="row gap wrap">
                  <Link className="btn sm" to="/dishes">
                    Taomlar
                  </Link>
                  <Link className="btn sm" to="/ingredients?linked=no">
                    Narxsiz masalliqlar
                  </Link>
                </div>
              </Card>
              <Card title="Foydalanuvchilar">
                <dl className="kv">
                  <dt>Faol</dt>
                  <dd>{s.users.active}</dd>
                  <dt>Bloklangan</dt>
                  <dd>{s.users.blocked}</dd>
                  <dt>Adminlar (rol)</dt>
                  <dd>{s.users.admins}</dd>
                  <dt>Yangi guruhlar (7 kun)</dt>
                  <dd>{s.groups.new7d}</dd>
                </dl>
              </Card>
              <Card title="Bozor narxlari" actions={<Link to="/prices">Batafsil →</Link>}>
                <dl className="kv">
                  <dt>Oxirgi narxlar</dt>
                  <dd>
                    {fmtDate(s.prices.latestDate)} {stalePrices && <Badge v="retry" label="eskirgan" />}
                  </dd>
                  <dt>Oxirgi sinxronlash</dt>
                  <dd>{s.prices.lastRun ? <>{fmtDate(s.prices.lastRun.date)} <Badge v={s.prices.lastRun.status} /></> : '—'}</dd>
                  <dt>Kunlik avtomatik</dt>
                  <dd>{s.prices.syncEnabled ? <Badge v="active" label="yoqilgan (08:00)" /> : <Badge v="deleted" label="o'chiq" />}</dd>
                </dl>
                {s.prices.lastRun?.error && <p className="error-text">{s.prices.lastRun.error}</p>}
              </Card>
            </div>
          </>
        )}
      </State>
    </>
  );
}
