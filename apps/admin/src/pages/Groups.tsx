import { useState } from 'react';
import { api } from '../api';
import { Badge, fmtDate, fmtDateTime, fmtPhone, Modal, PageHead, Pager, Search, State, useDebounced, useLoad } from '../ui';

interface GroupRow {
  id: string;
  name: string;
  type: string;
  splitMode: string;
  inviteCode: string;
  createdAt: string;
  membersCount: number;
  activePlans: number;
  lastMealAt: string | null;
}

interface GroupFull {
  id: string;
  name: string;
  type: string;
  splitMode: string;
  timezone: string;
  inviteCode: string;
  createdAt: string;
  mealsCount: number;
  members: { id: string; name: string; phone: string | null; status: string; role: string; joinedAt: string; managedBy: string | null }[];
  plans: { id: string; status: string; weekStart: string; createdAt: string; cookbookTitle: string | null }[];
}

const SPLIT: Record<string, string> = { shared_pot: 'Umumiy qozon', by_portion: "Porsiyaga ko'ra" };

function GroupDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const { data: g, error, loading, reload } = useLoad(() => api<GroupFull>(`/admin/groups/${id}`), [id]);
  return (
    <Modal title={g?.name ?? 'Guruh'} onClose={onClose} wide>
      <State loading={loading} error={error} empty={!g} onRetry={reload}>
        {g && (
          <div className="grid-2">
            <div>
              <dl className="kv">
                <dt>Turi</dt>
                <dd>
                  <Badge v={g.type} />
                </dd>
                <dt>Xarajat</dt>
                <dd>{SPLIT[g.splitMode] ?? g.splitMode}</dd>
                <dt>Taklif kodi</dt>
                <dd className="mono">{g.inviteCode}</dd>
                <dt>Vaqt zonasi</dt>
                <dd>{g.timezone}</dd>
                <dt>Yaratilgan</dt>
                <dd>{fmtDate(g.createdAt)}</dd>
                <dt>Jami mahallar</dt>
                <dd>{g.mealsCount}</dd>
              </dl>
              <h4>Rejalar</h4>
              {!g.plans.length && <p className="muted">Hali reja qo'llanmagan.</p>}
              <ul className="plain-list">
                {g.plans.map((p) => (
                  <li key={p.id}>
                    <span>
                      <b>{p.cookbookTitle ?? 'Cookbook'}</b> <Badge v={p.status} />
                    </span>
                    <span className="muted small">hafta: {fmtDate(p.weekStart)}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h4>A'zolar ({g.members.length})</h4>
              <ul className="plain-list">
                {g.members.map((m) => (
                  <li key={m.id}>
                    <span>
                      <b>{m.name}</b> {m.role === 'admin' && <span className="chip">guruh admini</span>} {m.status !== 'active' && <Badge v={m.status} />}
                    </span>
                    <span className="muted small">
                      {m.managedBy ? 'bola hisobi' : fmtPhone(m.phone)} · {fmtDate(m.joinedAt)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </State>
    </Modal>
  );
}

export function GroupsPage() {
  const [q, setQ] = useState('');
  const [offset, setOffset] = useState(0);
  const dq = useDebounced(q);
  const limit = 50;
  const { data, error, loading, reload } = useLoad(() => api<{ total: number; items: GroupRow[] }>('/admin/groups', { query: { q: dq, limit, offset } }), [dq, offset]);
  const [open, setOpen] = useState<string | null>(null);
  return (
    <>
      <PageHead title="Guruhlar" sub={data ? `${data.total} ta guruh` : ' '} />
      <div className="toolbar">
        <Search value={q} onChange={(v) => (setQ(v), setOffset(0))} placeholder="Nomi yoki taklif kodi…" />
      </div>
      <State loading={loading} error={error} empty={!data?.items.length} onRetry={reload}>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Guruh</th>
                <th>Turi</th>
                <th className="num">A'zolar</th>
                <th className="num">Faol reja</th>
                <th>Oxirgi mahal</th>
                <th>Yaratilgan</th>
              </tr>
            </thead>
            <tbody>
              {data?.items.map((g) => (
                <tr key={g.id} className="clickable" onClick={() => setOpen(g.id)}>
                  <td>
                    <b>{g.name}</b>
                    <div className="muted small">{SPLIT[g.splitMode] ?? g.splitMode}</div>
                  </td>
                  <td>
                    <Badge v={g.type} />
                  </td>
                  <td className="num">{g.membersCount}</td>
                  <td className="num">{g.activePlans}</td>
                  <td>{fmtDateTime(g.lastMealAt)}</td>
                  <td>{fmtDate(g.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {data && <Pager total={data.total} limit={limit} offset={offset} onChange={setOffset} />}
      </State>
      {open && <GroupDetail id={open} onClose={() => setOpen(null)} />}
    </>
  );
}
