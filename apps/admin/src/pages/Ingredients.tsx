import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { Button, fmtMoney, Modal, PageHead, Pager, Search, Select, State, UNIT, useAction, useDebounced, useLoad } from '../ui';
import type { PricesData } from './Prices';

interface Ingredient {
  id: string;
  slug: string;
  category: string;
  names: Record<string, string>;
  kcal100g: number;
  protein100g: number;
  fat100g: number;
  carb100g: number;
  pieceWeightG: number | null;
  density: number | null;
  usedInDishes: number;
  price: { productId: number; name: string | null; price: number | null; unit: string | null; unitQty: number | null; date: string | null } | null;
}

export const CATEGORIES: [string, string][] = [
  ['meat', "Go'sht"],
  ['poultry', 'Parranda'],
  ['fish', 'Baliq'],
  ['dairy', 'Sut mahsulotlari'],
  ['eggs', 'Tuxum'],
  ['vegetables', 'Sabzavot'],
  ['fruits', 'Meva'],
  ['greens', "Ko'katlar"],
  ['grains', 'Don'],
  ['legumes', 'Dukkakli'],
  ['flour', 'Un'],
  ['pasta', 'Makaron'],
  ['oils', "Yog'lar"],
  ['spices', 'Ziravorlar'],
  ['sauces', 'Souslar'],
  ['nuts', "Yong'oqlar"],
  ['sweets', 'Shirinlik'],
  ['bakery', 'Non mahsulotlari'],
  ['drinks', 'Ichimliklar'],
  ['other', 'Boshqa'],
];
const catName = (c: string) => CATEGORIES.find(([k]) => k === c)?.[1] ?? c;

type Form = {
  slug: string;
  category: string;
  uz: string;
  ru: string;
  en: string;
  kcal100g: string;
  protein100g: string;
  fat100g: string;
  carb100g: string;
  pieceWeightG: string;
  density: string;
  productId: string;
};

function IngredientEditor({ ing, onClose, onSaved }: { ing: Ingredient | null; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState<Form>(() => ({
    slug: ing?.slug ?? '',
    category: ing?.category ?? 'vegetables',
    uz: ing?.names.uz ?? '',
    ru: ing?.names.ru ?? '',
    en: ing?.names.en ?? '',
    kcal100g: String(ing?.kcal100g ?? ''),
    protein100g: String(ing?.protein100g ?? 0),
    fat100g: String(ing?.fat100g ?? 0),
    carb100g: String(ing?.carb100g ?? 0),
    pieceWeightG: ing?.pieceWeightG != null ? String(ing.pieceWeightG) : '',
    density: ing?.density != null ? String(ing.density) : '',
    productId: ing?.price ? String(ing.price.productId) : '',
  }));
  const [productQ, setProductQ] = useState('');
  const prices = useLoad(() => api<PricesData>('/admin/prices'), []);
  const { run, busy } = useAction();
  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  const products = useMemo(() => {
    const all = prices.data?.products ?? [];
    const s = productQ.trim().toLowerCase();
    return s ? all.filter((p) => p.name.toLowerCase().includes(s) || String(p.productId) === s) : all;
  }, [prices.data, productQ]);
  const selected = prices.data?.products.find((p) => String(p.productId) === f.productId);

  const save = async () => {
    const num = (v: string) => (v.trim() === '' ? undefined : Number(v.replace(',', '.')));
    const body = {
      slug: f.slug.trim() || undefined,
      category: f.category,
      kcal100g: num(f.kcal100g),
      protein100g: num(f.protein100g) ?? 0,
      fat100g: num(f.fat100g) ?? 0,
      carb100g: num(f.carb100g) ?? 0,
      pieceWeightG: f.pieceWeightG.trim() ? Math.round(Number(f.pieceWeightG)) : null,
      density: f.density.trim() ? num(f.density) : null,
      names: { uz: f.uz.trim() || undefined, ru: f.ru.trim() || undefined, en: f.en.trim() || undefined },
    };
    const saved = await run(async () => {
      const r = ing
        ? await api<Ingredient & { recomputedDishes: number }>(`/admin/ingredients/${ing.id}`, { method: 'PATCH', body })
        : await api<Ingredient>('/admin/ingredients', { method: 'POST', body });
      const newPid = f.productId ? Number(f.productId) : null;
      const oldPid = ing?.price?.productId ?? null;
      if (newPid !== oldPid) await api(`/admin/ingredients/${r.id}/price-link`, { method: 'PUT', body: { productId: newPid } });
      return r;
    });
    if (saved) {
      const n = (saved as { recomputedDishes?: number }).recomputedDishes;
      onSaved();
      onClose();
      if (n) setTimeout(() => alert(`${n} ta taomning porsiya kaloriyasi qayta hisoblandi.`), 50);
    }
  };

  return (
    <Modal
      title={ing ? `Masalliq: ${ing.names.uz ?? ing.slug}` : 'Yangi masalliq'}
      onClose={onClose}
      wide
      footer={
        <>
          <Button kind="ghost" onClick={onClose}>
            Bekor qilish
          </Button>
          <Button kind="primary" disabled={busy || !f.uz.trim() || !f.slug.trim() || f.kcal100g === ''} onClick={save}>
            Saqlash
          </Button>
        </>
      }
    >
      <div className="form-grid three">
        <label className="field">
          Nomi (o'zbekcha) *
          <input className="input" value={f.uz} onChange={set('uz')} maxLength={80} />
        </label>
        <label className="field">
          Nomi (ruscha)
          <input className="input" value={f.ru} onChange={set('ru')} maxLength={80} />
        </label>
        <label className="field">
          Nomi (inglizcha)
          <input className="input" value={f.en} onChange={set('en')} maxLength={80} />
        </label>
        <label className="field">
          Slug *
          <input className="input mono" value={f.slug} onChange={set('slug')} placeholder="masalan: carrot" />
        </label>
        <label className="field">
          Kategoriya
          <select className="input" value={f.category} onChange={set('category')}>
            {CATEGORIES.map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Kaloriya (100 g) *
          <input className="input" inputMode="decimal" value={f.kcal100g} onChange={set('kcal100g')} />
        </label>
        <label className="field">
          Oqsil, g
          <input className="input" inputMode="decimal" value={f.protein100g} onChange={set('protein100g')} />
        </label>
        <label className="field">
          Yog', g
          <input className="input" inputMode="decimal" value={f.fat100g} onChange={set('fat100g')} />
        </label>
        <label className="field">
          Uglevod, g
          <input className="input" inputMode="decimal" value={f.carb100g} onChange={set('carb100g')} />
        </label>
        <label className="field">
          1 dona og'irligi, g
          <input className="input" inputMode="numeric" value={f.pieceWeightG} onChange={set('pieceWeightG')} placeholder="tuxum, piyoz…" />
        </label>
        <label className="field">
          Zichlik, g/ml
          <input className="input" inputMode="decimal" value={f.density} onChange={set('density')} placeholder="suyuqliklar uchun" />
        </label>
      </div>
      <fieldset className="price-link">
        <legend>Bozor narxiga bog'lash</legend>
        <div className="row gap wrap">
          <Search value={productQ} onChange={setProductQ} placeholder="Mahsulotni qidirish…" />
          <select className="input grow" value={f.productId} onChange={set('productId')} aria-label="Narx mahsuloti">
            <option value="">— bog'lanmagan —</option>
            {selected && !products.includes(selected) && (
              <option value={selected.productId}>
                {selected.name} — {fmtMoney(selected.price)}
              </option>
            )}
            {products.map((p) => (
              <option key={p.productId} value={p.productId}>
                {p.name} — {fmtMoney(p.price)} / {p.unitQty !== 1 ? p.unitQty + ' ' : ''}
                {UNIT[p.unit] ?? p.unit}
              </option>
            ))}
          </select>
        </div>
        {prices.data && !prices.data.products.length && <p className="muted small">Hali narxlar yuklanmagan — "Narxlar" bo'limidan sinxronlang yoki Excel yuklang.</p>}
        {ing && ing.usedInDishes > 0 && <p className="muted small">Bu masalliq {ing.usedInDishes} ta taomda ishlatilgan. Kaloriya o'zgarsa, ular qayta hisoblanadi.</p>}
      </fieldset>
    </Modal>
  );
}

export function IngredientsPage() {
  const [params] = useSearchParams();
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [linked, setLinked] = useState<'' | 'yes' | 'no'>((params.get('linked') as 'yes' | 'no') ?? '');
  const [offset, setOffset] = useState(0);
  const dq = useDebounced(q);
  const limit = 50;
  const { data, error, loading, reload } = useLoad(
    () => api<{ total: number; items: Ingredient[] }>('/admin/ingredients', { query: { q: dq, category, linked, limit, offset } }),
    [dq, category, linked, offset],
  );
  const [editing, setEditing] = useState<Ingredient | 'new' | null>(null);

  return (
    <>
      <PageHead
        title="Masalliqlar"
        sub={data ? `${data.total} ta masalliq` : ' '}
        actions={
          <Button kind="primary" onClick={() => setEditing('new')}>
            + Yangi masalliq
          </Button>
        }
      />
      <div className="toolbar">
        <Search value={q} onChange={(v) => (setQ(v), setOffset(0))} placeholder="Nomi yoki slug…" />
        <Select label="Kategoriya" value={category} onChange={(v) => (setCategory(v), setOffset(0))} options={[['', 'Barcha kategoriyalar'], ...CATEGORIES]} />
        <Select
          label="Narx"
          value={linked}
          onChange={(v) => (setLinked(v), setOffset(0))}
          options={[
            ['', 'Narx: hammasi'],
            ['yes', "Narxga bog'langan"],
            ['no', "Narxga bog'lanmagan"],
          ]}
        />
      </div>
      <State loading={loading} error={error} empty={!data?.items.length} onRetry={reload}>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Masalliq</th>
                <th>Kategoriya</th>
                <th className="num">Kkal</th>
                <th className="num">O / Y / U</th>
                <th className="num">Taomlarda</th>
                <th>Bozor narxi</th>
              </tr>
            </thead>
            <tbody>
              {data?.items.map((i) => (
                <tr key={i.id} className="clickable" onClick={() => setEditing(i)}>
                  <td>
                    <b>{i.names.uz ?? i.slug}</b>
                    <div className="muted small">
                      {[i.names.ru, i.names.en].filter(Boolean).join(' · ')} <span className="mono">{i.slug}</span>
                    </div>
                  </td>
                  <td>{catName(i.category)}</td>
                  <td className="num">{i.kcal100g}</td>
                  <td className="num muted">
                    {i.protein100g} / {i.fat100g} / {i.carb100g}
                  </td>
                  <td className="num">{i.usedInDishes}</td>
                  <td>
                    {i.price && i.price.price == null ? (
                      <span className="badge muted" title="Bog'langan mahsulotning narxi hali yuklanmagan">
                        #{i.price.productId} · narx yo'q
                      </span>
                    ) : i.price ? (
                      <>
                        {fmtMoney(i.price.price)}
                        <span className="muted small">
                          {' '}
                          / {i.price.unitQty !== 1 ? i.price.unitQty + ' ' : ''}
                          {UNIT[i.price.unit ?? ''] ?? i.price.unit}
                        </span>
                        <div className="muted small clamp-1">{i.price.name}</div>
                      </>
                    ) : (
                      <span className="badge warn">bog'lanmagan</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {data && <Pager total={data.total} limit={limit} offset={offset} onChange={setOffset} />}
      </State>
      {editing && <IngredientEditor ing={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={reload} />}
    </>
  );
}
