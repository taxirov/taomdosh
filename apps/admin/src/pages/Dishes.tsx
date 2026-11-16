import { ReactNode, useRef, useState } from 'react';
import { api, media } from '../api';
import {
  Badge,
  Button,
  Confirm,
  fmtDate,
  Modal,
  PageHead,
  Pager,
  Search,
  Select,
  State,
  useAction,
  useDebounced,
  useLoad,
} from '../ui';

interface DishRow {
  id: string;
  slug: string | null;
  title: string;
  authorName: string | null;
  groupName: string | null;
  visibility: string;
  moderationStatus: string;
  imageUrl: string | null;
  kcalPerServing: number;
  baseServings: number;
  activeMin: number;
  passiveMin: number;
  ingredientsCount: number;
  favoritesCount: number;
  deletedAt: string | null;
  updatedAt: string;
}

interface DishFull {
  id: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  videoUrl: string | null;
  activeMin: number;
  passiveMin: number;
  baseServings: number;
  kcalPerServing: number;
  visibility: string;
  moderationStatus: string;
  mealTypes: string[];
  ingredients: { ingredientId: string; name: string; qtyG: number }[];
  steps: { n: number; text: string }[];
}

const MEAL: Record<string, string> = { breakfast: 'Nonushta', lunch: 'Tushlik', dinner: 'Kechki ovqat', snack: 'Yengil' };

/** Taom tafsiloti: ko'rish, asosiy maydonlarni tahrirlash, rasm, holat */
export function DishDetail({ id, onClose, onChanged, footer }: { id: string; onClose: () => void; onChanged?: () => void; footer?: ReactNode }) {
  const { data: d, error, loading, reload } = useLoad(() => api<DishFull>(`/dishes/${id}`), [id]);
  const { run, busy } = useAction();
  const [edit, setEdit] = useState<Partial<DishFull> | null>(null);
  const file = useRef<HTMLInputElement>(null);

  const save = async () => {
    if (!edit || !d) return;
    const body: Record<string, unknown> = {};
    if (edit.title !== d.title) body.title = edit.title;
    if ((edit.description ?? '') !== (d.description ?? '')) body.description = edit.description ?? '';
    for (const k of ['activeMin', 'passiveMin', 'baseServings'] as const) if (edit[k] !== d[k]) body[k] = Number(edit[k]);
    if ((edit.videoUrl ?? '') !== (d.videoUrl ?? '')) body.videoUrl = edit.videoUrl ?? '';
    if (!Object.keys(body).length) return setEdit(null);
    if (await run(() => api(`/dishes/${id}`, { method: 'PATCH', body }), 'Saqlandi')) {
      setEdit(null);
      reload();
      onChanged?.();
    }
  };

  const upload = async (f: File) => {
    const form = new FormData();
    form.append('file', f);
    if (await run(() => api(`/dishes/${id}/image`, { method: 'POST', form }), 'Rasm yuklandi')) {
      reload();
      onChanged?.();
    }
  };

  const removeImage = async () => {
    if (await run(() => api(`/dishes/${id}/image`, { method: 'DELETE' }), "Rasm o'chirildi")) {
      reload();
      onChanged?.();
    }
  };

  return (
    <Modal
      title={d?.title ?? 'Taom'}
      onClose={onClose}
      wide
      footer={
        edit ? (
          <>
            <Button kind="ghost" onClick={() => setEdit(null)}>
              Bekor qilish
            </Button>
            <Button kind="primary" disabled={busy} onClick={save}>
              Saqlash
            </Button>
          </>
        ) : (
          <>
            {d && (
              <Button kind="ghost" onClick={() => setEdit({ ...d })}>
                Tahrirlash
              </Button>
            )}
            {footer}
          </>
        )
      }
    >
      <State loading={loading} error={error} empty={!d} onRetry={reload}>
        {d && !edit && (
          <div className="dish">
            <div className="dish-media">
              <div className="dish-img" style={d.imageUrl ? { backgroundImage: `url(${media(d.imageUrl)})` } : undefined}>
                {!d.imageUrl && <span>Rasm yo'q</span>}
              </div>
              <div className="row gap wrap">
                <input ref={file} type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
                <Button size="sm" disabled={busy} onClick={() => file.current?.click()}>
                  {d.imageUrl ? 'Rasmni almashtirish' : 'Rasm yuklash'}
                </Button>
                {d.imageUrl && (
                  <Button size="sm" kind="ghost" disabled={busy} onClick={removeImage}>
                    Rasmni o'chirish
                  </Button>
                )}
              </div>
            </div>
            <div className="dish-info">
              <div className="row gap wrap">
                <Badge v={d.moderationStatus} />
                <Badge v={d.visibility} />
                {d.mealTypes.map((m) => (
                  <span key={m} className="chip">
                    {MEAL[m] ?? m}
                  </span>
                ))}
              </div>
              {d.description && <p>{d.description}</p>}
              <dl className="kv">
                <dt>Porsiya</dt>
                <dd>{d.baseServings} kishilik</dd>
                <dt>Kaloriya</dt>
                <dd>{d.kcalPerServing} kkal / porsiya</dd>
                <dt>Vaqt</dt>
                <dd>
                  {d.activeMin} daq faol{d.passiveMin ? ` + ${d.passiveMin} daq kutish` : ''}
                </dd>
                {d.videoUrl && (
                  <>
                    <dt>Video</dt>
                    <dd>
                      <a href={d.videoUrl} target="_blank" rel="noopener noreferrer">
                        {d.videoUrl}
                      </a>
                    </dd>
                  </>
                )}
              </dl>
              <h4>Masalliqlar</h4>
              <ul className="ing-list">
                {d.ingredients.map((i) => (
                  <li key={i.ingredientId}>
                    <span>{i.name}</span>
                    <b>{i.qtyG} g</b>
                  </li>
                ))}
              </ul>
              <h4>Tayyorlash</h4>
              <ol className="steps">
                {d.steps.map((s) => (
                  <li key={s.n}>{s.text}</li>
                ))}
              </ol>
            </div>
          </div>
        )}
        {d && edit && (
          <div className="form-grid">
            <label className="field span-2">
              Nomi
              <input className="input" value={edit.title ?? ''} maxLength={100} onChange={(e) => setEdit({ ...edit, title: e.target.value })} />
            </label>
            <label className="field span-2">
              Tavsif
              <textarea className="input" rows={3} value={edit.description ?? ''} maxLength={2000} onChange={(e) => setEdit({ ...edit, description: e.target.value })} />
            </label>
            <label className="field">
              Faol vaqt (daq)
              <input className="input" type="number" min={1} max={600} value={edit.activeMin} onChange={(e) => setEdit({ ...edit, activeMin: +e.target.value })} />
            </label>
            <label className="field">
              Kutish vaqti (daq)
              <input className="input" type="number" min={0} max={2880} value={edit.passiveMin} onChange={(e) => setEdit({ ...edit, passiveMin: +e.target.value })} />
            </label>
            <label className="field">
              Necha kishilik
              <input className="input" type="number" min={1} max={50} value={edit.baseServings} onChange={(e) => setEdit({ ...edit, baseServings: +e.target.value })} />
            </label>
            <label className="field">
              Video havola
              <input className="input" value={edit.videoUrl ?? ''} placeholder="https://…" onChange={(e) => setEdit({ ...edit, videoUrl: e.target.value })} />
            </label>
            <p className="muted span-2 small">Masalliqlar va qadamlarni muallif ilovadan tahrirlaydi. Admin tahriri moderatsiya holatini o'zgartirmaydi.</p>
          </div>
        )}
      </State>
    </Modal>
  );
}

const STATUS: [string, string][] = [
  ['', 'Barcha holatlar'],
  ['pending', 'Kutilmoqda'],
  ['approved', 'Tasdiqlangan'],
  ['rejected', 'Rad etilgan'],
];
const VIS: [string, string][] = [
  ['', 'Barcha ko‘rinishlar'],
  ['public', 'Ommaviy'],
  ['group', 'Guruh'],
  ['private', 'Shaxsiy'],
];
const DEL: ['no' | 'yes' | 'all', string][] = [
  ['no', 'Faol'],
  ['yes', "O'chirilganlar"],
  ['all', 'Hammasi'],
];

export function DishesPage() {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [visibility, setVisibility] = useState('');
  const [deleted, setDeleted] = useState<'no' | 'yes' | 'all'>('no');
  const [offset, setOffset] = useState(0);
  const dq = useDebounced(q);
  const limit = 30;
  const { data, error, loading, reload } = useLoad(
    () => api<{ total: number; items: DishRow[] }>('/admin/dishes', { query: { q: dq, status, visibility, deleted, limit, offset } }),
    [dq, status, visibility, deleted, offset],
  );
  const { run, busy } = useAction();
  const [open, setOpen] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<DishRow | null>(null);
  const filter = <T,>(set: (v: T) => void) => (v: T) => (set(v), setOffset(0));

  const setMod = async (d: DishRow, s: string) => {
    if (await run(() => api(`/admin/dishes/${d.id}/moderation`, { method: 'PUT', body: { status: s } }), 'Holat yangilandi')) {
      reload();
      window.dispatchEvent(new Event('pending-changed'));
    }
  };
  const remove = async (d: DishRow) => {
    setConfirm(null);
    if (await run(() => api(`/dishes/${d.id}`, { method: 'DELETE' }), "O'chirildi")) reload();
  };
  const restore = async (d: DishRow) => {
    if (await run(() => api(`/admin/dishes/${d.id}/restore`, { method: 'POST' }), 'Qaytarildi')) reload();
  };

  return (
    <>
      <PageHead title="Taomlar" sub={data ? `${data.total} ta taom` : ' '} />
      <div className="toolbar">
        <Search value={q} onChange={filter(setQ)} placeholder="Nomi yoki slug bo'yicha…" />
        <Select label="Holat" value={status} onChange={filter(setStatus)} options={STATUS} />
        <Select label="Ko'rinish" value={visibility} onChange={filter(setVisibility)} options={VIS} />
        <Select label="O'chirilgan" value={deleted} onChange={filter(setDeleted)} options={DEL} />
      </div>
      <State loading={loading} error={error} empty={!data?.items.length} onRetry={reload}>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Taom</th>
                <th>Muallif / guruh</th>
                <th>Holat</th>
                <th className="num">Kkal</th>
                <th className="num">♥</th>
                <th>Yangilangan</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data?.items.map((d) => (
                <tr key={d.id} className={d.deletedAt ? 'dim' : ''}>
                  <td>
                    <button className="cell-link" onClick={() => setOpen(d.id)}>
                      <span className="thumb sm" style={d.imageUrl ? { backgroundImage: `url(${media(d.imageUrl)})` } : undefined}>
                        {!d.imageUrl && '🍲'}
                      </span>
                      <span>
                        <b>{d.title}</b>
                        <span className="muted small">{d.slug ?? `${d.ingredientsCount} masalliq`}</span>
                      </span>
                    </button>
                  </td>
                  <td>
                    {d.authorName ?? <span className="muted">Platforma</span>}
                    {d.groupName && <div className="muted small">{d.groupName}</div>}
                  </td>
                  <td>
                    <div className="row gap-s wrap">
                      <Badge v={d.moderationStatus} />
                      <Badge v={d.visibility} />
                      {d.deletedAt && <Badge v="deleted" />}
                    </div>
                  </td>
                  <td className="num">{d.kcalPerServing}</td>
                  <td className="num">{d.favoritesCount}</td>
                  <td>{fmtDate(d.updatedAt)}</td>
                  <td className="actions">
                    {d.deletedAt ? (
                      <Button size="sm" disabled={busy} onClick={() => restore(d)}>
                        Qaytarish
                      </Button>
                    ) : (
                      <>
                        {d.moderationStatus !== 'approved' && (
                          <Button size="sm" kind="ok" disabled={busy} onClick={() => setMod(d, 'approved')}>
                            Tasdiqlash
                          </Button>
                        )}
                        {d.moderationStatus === 'approved' && d.visibility === 'public' && (
                          <Button size="sm" disabled={busy} onClick={() => setMod(d, 'rejected')} title="Ommaviy katalogdan olib tashlash">
                            Ommadan olish
                          </Button>
                        )}
                        <Button size="sm" kind="ghost" disabled={busy} onClick={() => setConfirm(d)} aria-label="O'chirish">
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
      {open && <DishDetail id={open} onClose={() => setOpen(null)} onChanged={reload} />}
      {confirm && (
        <Confirm
          danger
          yes="O'chirish"
          text={
            <>
              <b>{confirm.title}</b> katalogdan o'chirilsinmi? Rejalashtirilgan mahallar buzilmaydi, keyin "O'chirilganlar" filtridan qaytarish mumkin.
            </>
          }
          onYes={() => remove(confirm)}
          onNo={() => setConfirm(null)}
        />
      )}
    </>
  );
}
