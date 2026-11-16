import { useState } from 'react';
import { api } from '../api';
import { Badge, Button, Confirm, fmtDate, fmtPhone, Modal, PageHead, Pager, Search, Select, State, useAction, useDebounced, useLoad } from '../ui';

interface UserRow {
  id: string;
  name: string;
  phone: string | null;
  role: string;
  status: string;
  locale: string;
  managedBy: string | null;
  createdAt: string;
  groupsCount: number;
  isAdmin: boolean;
  envAdmin: boolean;
}

interface UserFull extends UserRow {
  groups: { id: string; name: string; type: string; role: string; joinedAt: string; leftAt: string | null }[];
  dishesCount: number;
  activeSessions: number;
}

const LOCALE: Record<string, string> = { uz: "O'zbekcha", 'uz-Cyrl': 'Ўзбекча', ru: 'Русский', en: 'English' };

function UserDetail({ id, meId, onClose, onChanged }: { id: string; meId: string; onClose: () => void; onChanged: () => void }) {
  const { data: u, error, loading, reload, setData } = useLoad(() => api<UserFull>(`/admin/users/${id}`), [id]);
  const { run, busy } = useAction();
  const [confirm, setConfirm] = useState<null | { body: { role?: string; status?: string }; text: string; danger?: boolean; yes: string }>(null);

  const patch = async (body: { role?: string; status?: string }) => {
    setConfirm(null);
    const r = await run(() => api<UserFull>(`/admin/users/${id}`, { method: 'PATCH', body }), 'Saqlandi');
    if (r) {
      setData(r);
      onChanged();
    }
  };
  const self = id === meId;

  return (
    <Modal title={u?.name ?? 'Foydalanuvchi'} onClose={onClose}>
      <State loading={loading} error={error} empty={!u} onRetry={reload}>
        {u && (
          <>
            <div className="row gap wrap">
              <Badge v={u.status} />
              {u.isAdmin && <Badge v="admin" label={u.envAdmin ? 'Admin (.env)' : 'Admin'} />}
              {u.managedBy && <span className="chip">Boshqariladigan hisob</span>}
            </div>
            <dl className="kv">
              <dt>Telefon</dt>
              <dd>{fmtPhone(u.phone)}</dd>
              <dt>Til</dt>
              <dd>{LOCALE[u.locale] ?? u.locale}</dd>
              <dt>Ro'yxatdan o'tgan</dt>
              <dd>{fmtDate(u.createdAt)}</dd>
              <dt>Yaratgan taomlari</dt>
              <dd>{u.dishesCount}</dd>
              <dt>Faol sessiyalar</dt>
              <dd>{u.activeSessions}</dd>
            </dl>
            <h4>Guruhlari</h4>
            {!u.groups.length && <p className="muted">Guruhga a'zo emas.</p>}
            <ul className="plain-list">
              {u.groups.map((g) => (
                <li key={g.id} className={g.leftAt ? 'dim' : ''}>
                  <span>
                    <b>{g.name}</b> <Badge v={g.type} />
                  </span>
                  <span className="muted small">
                    {g.role === 'admin' ? 'guruh admini' : "a'zo"} · {fmtDate(g.joinedAt)}
                    {g.leftAt && ` — chiqqan ${fmtDate(g.leftAt)}`}
                  </span>
                </li>
              ))}
            </ul>
            <p className="muted small">Sog'liq ma'lumotlari (vazn, maqsad, kaloriya) admin panelda ko'rsatilmaydi.</p>
            {self ? (
              <p className="muted small">Bu sizning hisobingiz — o'zingizning rol va holatingizni o'zgartira olmaysiz.</p>
            ) : (
              u.status !== 'deleted' && (
                <div className="row gap wrap section-actions">
                  {u.status === 'active' ? (
                    <Button
                      kind="danger"
                      disabled={busy}
                      onClick={() =>
                        setConfirm({
                          body: { status: 'blocked' },
                          danger: true,
                          yes: 'Bloklash',
                          text: `${u.name} bloklansinmi? Barcha sessiyalari bekor qilinadi va u qayta kira olmaydi.`,
                        })
                      }
                    >
                      Bloklash
                    </Button>
                  ) : (
                    <Button kind="ok" disabled={busy} onClick={() => patch({ status: 'active' })}>
                      Blokdan chiqarish
                    </Button>
                  )}
                  {u.role === 'admin' ? (
                    <Button disabled={busy} onClick={() => setConfirm({ body: { role: 'user' }, yes: 'Olib tashlash', text: `${u.name} dan admin roli olinsinmi?` })}>
                      Admin rolini olish
                    </Button>
                  ) : (
                    <Button
                      disabled={busy}
                      onClick={() =>
                        setConfirm({ body: { role: 'admin' }, yes: 'Admin qilish', text: `${u.name} platforma admini qilinsinmi? U moderatsiya, katalog va foydalanuvchilarni boshqara oladi.` })
                      }
                    >
                      Admin qilish
                    </Button>
                  )}
                </div>
              )
            )}
            {u.envAdmin && u.role !== 'admin' && <p className="muted small">Bu raqam serverdagi ADMIN_PHONES ro'yxatida — u yerdan olib tashlanmaguncha admin bo'lib qoladi.</p>}
          </>
        )}
      </State>
      {confirm && <Confirm text={confirm.text} danger={confirm.danger} yes={confirm.yes} onYes={() => patch(confirm.body)} onNo={() => setConfirm(null)} />}
    </Modal>
  );
}

export function UsersPage({ meId }: { meId: string }) {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [role, setRole] = useState('');
  const [offset, setOffset] = useState(0);
  const dq = useDebounced(q);
  const limit = 50;
  const { data, error, loading, reload } = useLoad(
    () => api<{ total: number; items: UserRow[] }>('/admin/users', { query: { q: dq, status, role, limit, offset } }),
    [dq, status, role, offset],
  );
  const [open, setOpen] = useState<string | null>(null);

  return (
    <>
      <PageHead title="Foydalanuvchilar" sub={data ? `${data.total} ta` : ' '} />
      <div className="toolbar">
        <Search value={q} onChange={(v) => (setQ(v), setOffset(0))} placeholder="Ism yoki telefon…" />
        <Select
          label="Holat"
          value={status}
          onChange={(v) => (setStatus(v), setOffset(0))}
          options={[
            ['', 'Faol va bloklangan'],
            ['active', 'Faol'],
            ['blocked', 'Bloklangan'],
            ['deleted', "O'chirilgan"],
          ]}
        />
        <Select
          label="Rol"
          value={role}
          onChange={(v) => (setRole(v), setOffset(0))}
          options={[
            ['', 'Barcha rollar'],
            ['admin', 'Adminlar'],
            ['user', 'Foydalanuvchilar'],
          ]}
        />
      </div>
      <State loading={loading} error={error} empty={!data?.items.length} onRetry={reload}>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Ism</th>
                <th>Telefon</th>
                <th>Holat</th>
                <th className="num">Guruhlar</th>
                <th>Ro'yxatdan o'tgan</th>
              </tr>
            </thead>
            <tbody>
              {data?.items.map((u) => (
                <tr key={u.id} className="clickable" onClick={() => setOpen(u.id)}>
                  <td>
                    <div className="row gap-s">
                      <span className="avatar sm">{u.name.slice(0, 1).toUpperCase()}</span>
                      <b>{u.name}</b>
                      {u.id === meId && <span className="chip">siz</span>}
                    </div>
                  </td>
                  <td className="mono">{u.managedBy ? <span className="muted">bola hisobi</span> : fmtPhone(u.phone)}</td>
                  <td>
                    <div className="row gap-s wrap">
                      <Badge v={u.status} />
                      {u.isAdmin && <Badge v="admin" />}
                    </div>
                  </td>
                  <td className="num">{u.groupsCount}</td>
                  <td>{fmtDate(u.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {data && <Pager total={data.total} limit={limit} offset={offset} onChange={setOffset} />}
      </State>
      {open && <UserDetail id={open} meId={meId} onClose={() => setOpen(null)} onChanged={reload} />}
    </>
  );
}
