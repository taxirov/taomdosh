import { useState } from 'react';
import { api } from '../api';
import { Badge, Button, Confirm, fmtDate, PageHead, Pager, Search, Select, State, useAction, useDebounced, useLoad } from '../ui';

interface CookbookRow {
  id: string;
  slug: string | null;
  title: string;
  authorName: string | null;
  visibility: string;
  moderationStatus: string;
  days: number;
  mealsCount: number;
  deletedAt: string | null;
  updatedAt: string;
}

export function CookbooksPage() {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [deleted, setDeleted] = useState<'no' | 'yes' | 'all'>('no');
  const [offset, setOffset] = useState(0);
  const dq = useDebounced(q);
  const limit = 30;
  const { data, error, loading, reload } = useLoad(
    () => api<{ total: number; items: CookbookRow[] }>('/admin/cookbooks', { query: { q: dq, status, deleted, limit, offset } }),
    [dq, status, deleted, offset],
  );
  const { run, busy } = useAction();
  const [confirm, setConfirm] = useState<CookbookRow | null>(null);

  const setMod = async (c: CookbookRow, s: string) => {
    if (await run(() => api(`/admin/cookbooks/${c.id}/moderation`, { method: 'PUT', body: { status: s } }), 'Holat yangilandi')) {
      reload();
      window.dispatchEvent(new Event('pending-changed'));
    }
  };

  return (
    <>
      <PageHead title="Cookbooklar" sub={data ? `${data.total} ta cookbook` : ' '} />
      <div className="toolbar">
        <Search value={q} onChange={(v) => (setQ(v), setOffset(0))} />
        <Select
          label="Holat"
          value={status}
          onChange={(v) => (setStatus(v), setOffset(0))}
          options={[
            ['', 'Barcha holatlar'],
            ['pending', 'Kutilmoqda'],
            ['approved', 'Tasdiqlangan'],
            ['rejected', 'Rad etilgan'],
          ]}
        />
        <Select
          label="O'chirilgan"
          value={deleted}
          onChange={(v) => (setDeleted(v), setOffset(0))}
          options={[
            ['no', 'Faol'],
            ['yes', "O'chirilganlar"],
            ['all', 'Hammasi'],
          ]}
        />
      </div>
      <State loading={loading} error={error} empty={!data?.items.length} onRetry={reload}>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Cookbook</th>
                <th>Muallif</th>
                <th>Holat</th>
                <th className="num">Kun</th>
                <th className="num">Mahal</th>
                <th>Yangilangan</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data?.items.map((c) => (
                <tr key={c.id} className={c.deletedAt ? 'dim' : ''}>
                  <td>
                    <b>{c.title}</b>
                    {c.slug && <div className="muted small">{c.slug}</div>}
                  </td>
                  <td>{c.authorName ?? <span className="muted">Platforma</span>}</td>
                  <td>
                    <div className="row gap-s wrap">
                      <Badge v={c.moderationStatus} />
                      <Badge v={c.visibility} />
                      {c.deletedAt && <Badge v="deleted" />}
                    </div>
                  </td>
                  <td className="num">{c.days}</td>
                  <td className="num">{c.mealsCount}</td>
                  <td>{fmtDate(c.updatedAt)}</td>
                  <td className="actions">
                    {c.deletedAt ? (
                      <Button size="sm" disabled={busy} onClick={async () => (await run(() => api(`/admin/cookbooks/${c.id}/restore`, { method: 'POST' }), 'Qaytarildi')) && reload()}>
                        Qaytarish
                      </Button>
                    ) : (
                      <>
                        {c.moderationStatus !== 'approved' && (
                          <Button size="sm" kind="ok" disabled={busy} onClick={() => setMod(c, 'approved')}>
                            Tasdiqlash
                          </Button>
                        )}
                        {c.moderationStatus === 'approved' && c.visibility === 'public' && (
                          <Button size="sm" disabled={busy} onClick={() => setMod(c, 'rejected')}>
                            Ommadan olish
                          </Button>
                        )}
                        <Button size="sm" kind="ghost" disabled={busy} onClick={() => setConfirm(c)} aria-label="O'chirish">
                          🗑
                        </Button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {data && <Pager total={data.total} limit={limit} offset={offset} onChange={setOffset} />}
      </State>
      {confirm && (
        <Confirm
          danger
          yes="O'chirish"
          text={
            <>
              <b>{confirm.title}</b> o'chirilsinmi? Guruhlarda qo'llangan rejalar ishlayveradi.
            </>
          }
          onYes={async () => {
            const c = confirm;
            setConfirm(null);
            if (await run(() => api(`/cookbooks/${c.id}`, { method: 'DELETE' }), "O'chirildi")) reload();
          }}
          onNo={() => setConfirm(null)}
        />
      )}
    </>
  );
}
