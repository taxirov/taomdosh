import { useState } from 'react';
import { api, media } from '../api';
import { Button, Card, fmtDateTime, PageHead, State, useAction, useLoad } from '../ui';
import { DishDetail } from './Dishes';

interface Pending {
  dishes: { id: string; title: string; description: string | null; authorName: string | null; imageUrl: string | null; kcalPerServing: number; ingredientsCount: number; stepsCount: number; updatedAt: string }[];
  cookbooks: { id: string; title: string; description: string | null; authorName: string | null; days: number; mealsCount: number; updatedAt: string }[];
}

export function ModerationPage() {
  const { data, error, loading, reload, setData } = useLoad(() => api<Pending>('/admin/moderation'), []);
  const { run, busy } = useAction();
  const [open, setOpen] = useState<string | null>(null);

  const decide = async (kind: 'dishes' | 'cookbooks', id: string, approve: boolean) => {
    const ok = await run(() => api(`/admin/moderation/${kind}/${id}/${approve ? 'approve' : 'reject'}`, { method: 'POST' }), approve ? 'Tasdiqlandi — endi ommaga ko‘rinadi' : 'Rad etildi');
    if (ok && data) {
      setData({ ...data, [kind]: (data[kind] as { id: string }[]).filter((x) => x.id !== id) } as Pending);
      window.dispatchEvent(new Event('pending-changed'));
      setOpen(null);
    }
  };

  const empty = !!data && !data.dishes.length && !data.cookbooks.length;
  return (
    <>
      <PageHead title="Moderatsiya" sub="Foydalanuvchilar ommaga chiqarishni so'ragan taom va cookbooklar" actions={<Button onClick={reload}>Yangilash</Button>} />
      <State loading={loading} error={error} empty={!data} onRetry={reload}>
        {empty && (
          <div className="state">
            <b>Navbat bo'sh 🎉</b>
            <p className="muted">Ko'rib chiqiladigan kontent yo'q.</p>
          </div>
        )}
        {data && data.dishes.length > 0 && (
          <Card title={`Taomlar (${data.dishes.length})`}>
            <div className="mod-list">
              {data.dishes.map((d) => (
                <div key={d.id} className="mod-item">
                  <div className="thumb" style={d.imageUrl ? { backgroundImage: `url(${media(d.imageUrl)})` } : undefined}>
                    {!d.imageUrl && '🍲'}
                  </div>
                  <div className="mod-body">
                    <b>{d.title}</b>
                    <span className="muted">
                      {d.authorName ?? 'Noma’lum'} · {fmtDateTime(d.updatedAt)} · {d.kcalPerServing} kkal · {d.ingredientsCount} masalliq · {d.stepsCount} qadam
                    </span>
                    {d.description && <p className="clamp">{d.description}</p>}
                  </div>
                  <div className="row gap">
                    <Button size="sm" onClick={() => setOpen(d.id)}>
                      Ko'rish
                    </Button>
                    <Button size="sm" kind="danger" disabled={busy} onClick={() => decide('dishes', d.id, false)}>
                      Rad etish
                    </Button>
                    <Button size="sm" kind="ok" disabled={busy} onClick={() => decide('dishes', d.id, true)}>
                      Tasdiqlash
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}
        {data && data.cookbooks.length > 0 && (
          <Card title={`Cookbooklar (${data.cookbooks.length})`}>
            <div className="mod-list">
              {data.cookbooks.map((c) => (
                <div key={c.id} className="mod-item">
                  <div className="thumb">📖</div>
                  <div className="mod-body">
                    <b>{c.title}</b>
                    <span className="muted">
                      {c.authorName ?? 'Noma’lum'} · {fmtDateTime(c.updatedAt)} · {c.days} kun · {c.mealsCount} mahal
                    </span>
                    {c.description && <p className="clamp">{c.description}</p>}
                  </div>
                  <div className="row gap">
                    <Button size="sm" kind="danger" disabled={busy} onClick={() => decide('cookbooks', c.id, false)}>
                      Rad etish
                    </Button>
                    <Button size="sm" kind="ok" disabled={busy} onClick={() => decide('cookbooks', c.id, true)}>
                      Tasdiqlash
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}
      </State>
      {open && (
        <DishDetail
          id={open}
          onClose={() => setOpen(null)}
          footer={
            <>
              <Button kind="danger" disabled={busy} onClick={() => decide('dishes', open, false)}>
                Rad etish
              </Button>
              <Button kind="ok" disabled={busy} onClick={() => decide('dishes', open, true)}>
                Tasdiqlash
              </Button>
            </>
          }
        />
      )}
    </>
  );
}
