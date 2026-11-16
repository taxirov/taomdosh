import { useMemo, useRef, useState } from 'react';
import { api } from '../api';
import { Badge, Button, Card, fmtDate, fmtDateTime, fmtMoney, Modal, PageHead, Search, State, UNIT, useAction, useLoad } from '../ui';

export interface PricesData {
  syncEnabled: boolean;
  latestDate: string | null;
  runs: { date: string; status: string; attempts: number; error: string | null; source: string; nextAttemptAt: string | null; updatedAt: string }[];
  products: {
    productId: number;
    name: string;
    unit: string;
    unitQty: number;
    price: number;
    prevPrice: number | null;
    changePct: number | null;
    date: string;
    source: string;
    stale: boolean;
    ingredients: { id: string; name: string }[];
  }[];
}

function History({ productId, onClose }: { productId: number; onClose: () => void }) {
  const { data, error, loading, reload } = useLoad(
    () => api<{ name: string; history: { date: string; price: number }[] }>(`/admin/prices/${productId}/history`),
    [productId],
  );
  const pts = data?.history ?? [];
  const W = 640;
  const H = 200;
  const min = Math.min(...pts.map((p) => p.price));
  const max = Math.max(...pts.map((p) => p.price));
  const x = (i: number) => (pts.length < 2 ? W / 2 : 30 + (i * (W - 60)) / (pts.length - 1));
  const y = (v: number) => (max === min ? H / 2 : 20 + ((max - v) * (H - 50)) / (max - min));
  return (
    <Modal title={data?.name ?? 'Narx tarixi'} onClose={onClose} wide>
      <State loading={loading} error={error} empty={!data} onRetry={reload}>
        {pts.length > 0 && (
          <>
            <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label="Narx tarixi grafigi">
              <polyline points={pts.map((p, i) => `${x(i)},${y(p.price)}`).join(' ')} />
              {pts.map((p, i) => (
                <circle key={p.date} cx={x(i)} cy={y(p.price)} r="3">
                  <title>
                    {p.date}: {fmtMoney(p.price)}
                  </title>
                </circle>
              ))}
              <text x="4" y="16">
                {fmtMoney(max)}
              </text>
              <text x="4" y={H - 8}>
                {fmtMoney(min)}
              </text>
            </svg>
            <div className="table-wrap tight">
              <table className="table">
                <thead>
                  <tr>
                    <th>Sana</th>
                    <th className="num">Narx</th>
                  </tr>
                </thead>
                <tbody>
                  {[...pts].reverse().map((p) => (
                    <tr key={p.date}>
                      <td>{fmtDate(p.date)}</td>
                      <td className="num">{fmtMoney(p.price)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </State>
    </Modal>
  );
}

export function PricesPage() {
  const { data, error, loading, reload } = useLoad(() => api<PricesData>('/admin/prices'), []);
  const { run, busy } = useAction();
  const [q, setQ] = useState('');
  const [onlyUnlinked, setOnlyUnlinked] = useState(false);
  const [hist, setHist] = useState<number | null>(null);
  const file = useRef<HTMLInputElement>(null);

  const products = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (data?.products ?? []).filter((p) => (!s || p.name.toLowerCase().includes(s)) && (!onlyUnlinked || !p.ingredients.length));
  }, [data, q, onlyUnlinked]);

  const sync = async () => {
    const r = await run(() => api<{ status: string; saved: number }>('/admin/prices/sync', { method: 'POST' }));
    if (r) {
      alert(r.status === 'ok' ? `Narxlar yangilandi: ${r.saved} ta mahsulot.` : 'Narxlarni olib bo‘lmadi. Sinxronlash tarixidagi xatoni ko‘ring.');
      reload();
    }
  };
  const upload = async (f: File) => {
    const form = new FormData();
    form.append('file', f);
    const r = await run(() => api<{ rows: number; saved: number; skipped: number }>('/admin/prices/import', { method: 'POST', form }));
    if (file.current) file.current.value = '';
    if (r) {
      alert(`Excel yuklandi: ${r.rows} qator, ${r.saved} ta saqlandi, ${r.skipped} ta o'tkazib yuborildi.`);
      reload();
    }
  };

  return (
    <>
      <PageHead
        title="Bozor narxlari"
        sub={data ? <>Oxirgi narxlar: {fmtDate(data.latestDate)} · {data.products.length} ta mahsulot</> : ' '}
        actions={
          <>
            <input ref={file} type="file" accept=".xlsx" hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
            <Button disabled={busy} onClick={() => file.current?.click()}>
              Excel yuklash
            </Button>
            <Button kind="primary" disabled={busy} onClick={sync}>
              Hozir yangilash
            </Button>
          </>
        }
      />
      <State loading={loading} error={error} empty={!data} onRetry={reload}>
        {data && (
          <div className="grid-side">
            <div>
              <div className="toolbar">
                <Search value={q} onChange={setQ} placeholder="Mahsulot nomi…" />
                <label className="check">
                  <input type="checkbox" checked={onlyUnlinked} onChange={(e) => setOnlyUnlinked(e.target.checked)} /> Faqat masalliqqa bog'lanmaganlar
                </label>
              </div>
              {!products.length ? (
                <div className="state">
                  <b>Mahsulot yo'q</b>
                  <p className="muted">{data.products.length ? 'Filtrni o‘zgartiring.' : '"Hozir yangilash" yoki "Excel yuklash" bilan narxlarni oling.'}</p>
                </div>
              ) : (
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Mahsulot</th>
                        <th className="num">Narx</th>
                        <th className="num">O'zgarish</th>
                        <th>Masalliqlar</th>
                        <th>Sana</th>
                      </tr>
                    </thead>
                    <tbody>
                      {products.map((p) => (
                        <tr key={p.productId} className="clickable" onClick={() => setHist(p.productId)}>
                          <td>
                            <b>{p.name}</b>
                            <div className="muted small mono">#{p.productId}</div>
                          </td>
                          <td className="num">
                            {fmtMoney(p.price)}
                            <div className="muted small">
                              / {p.unitQty !== 1 ? p.unitQty + ' ' : ''}
                              {UNIT[p.unit] ?? p.unit}
                            </div>
                          </td>
                          <td className={`num ${p.changePct == null ? '' : p.changePct > 0 ? 'up' : p.changePct < 0 ? 'down' : ''}`}>
                            {p.changePct == null ? '—' : `${p.changePct > 0 ? '+' : ''}${p.changePct}%`}
                          </td>
                          <td>{p.ingredients.length ? p.ingredients.map((i) => i.name).join(', ') : <span className="badge warn">yo'q</span>}</td>
                          <td>
                            {fmtDate(p.date)} {p.stale && <Badge v="retry" label="eski" />}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <div className="stack">
              <Card title="Avtomatik yangilash">
                <p>
                  {data.syncEnabled ? <Badge v="active" label="Yoqilgan" /> : <Badge v="deleted" label="O'chiq" />}{' '}
                  <span className="muted small">har kuni 08:00 (Toshkent), bitta so'rov</span>
                </p>
                <p className="muted small">
                  Serverdagi <code>PRICES_SYNC_ENABLED=on</code> sozlamasi bilan boshqariladi. Masalliqni narxga "Masalliqlar" bo'limida bog'laysiz.
                </p>
              </Card>
              <Card title="Sinxronlash tarixi">
                {!data.runs.length && <p className="muted">Hali sinxronlanmagan.</p>}
                <ul className="runs">
                  {data.runs.map((r) => (
                    <li key={r.date}>
                      <div className="row between">
                        <b>{fmtDate(r.date)}</b>
                        <Badge v={r.status} />
                      </div>
                      <span className="muted small">
                        {r.source === 'excel' ? 'Excel' : 'Avtomatik'} · {r.attempts} urinish · {fmtDateTime(r.updatedAt)}
                      </span>
                      {r.error && <span className="error-text small">{r.error}</span>}
                    </li>
                  ))}
                </ul>
              </Card>
            </div>
          </div>
        )}
      </State>
      {hist && <History productId={hist} onClose={() => setHist(null)} />}
    </>
  );
}
