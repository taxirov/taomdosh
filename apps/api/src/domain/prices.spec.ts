import {
  afterFailure,
  estimateCost,
  nameKey,
  normalizeProductName,
  parseProductUnit,
  parseUnitText,
  pricePerGram,
  shouldSyncNow,
} from './prices';
import { toGrams } from './units';
import { parseApiResponse, parseSheetRows } from '../modules/prices/price-source';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const fixture = require('../../test/fixtures/prices-api.json');

describe('birlik va miqdorni ajratish', () => {
  it('nomdagi qavsdan', () => {
    expect(parseProductUnit('Tuxum (10 dona)')).toEqual({ name: 'Tuxum', unit: 'pcs', qty: 10 });
    expect(parseProductUnit('Shakar (1 kg)')).toEqual({ name: 'Shakar', unit: 'kg', qty: 1 });
    expect(parseProductUnit('Sut (1 litr)')).toEqual({ name: 'Sut', unit: 'l', qty: 1 });
    expect(parseProductUnit('Qatiq (0,5 l)')).toEqual({ name: 'Qatiq', unit: 'l', qty: 0.5 });
  });
  it('birlik bo‘lmagan qavs nomda qoladi, standart — 1 kg', () => {
    expect(parseProductUnit('Un (oliy nav)')).toEqual({ name: 'Un (oliy nav)', unit: 'kg', qty: 1 });
    expect(parseProductUnit('Piyoz')).toEqual({ name: 'Piyoz', unit: 'kg', qty: 1 });
  });
  it('alohida birlik maydoni ustun', () => {
    expect(parseProductUnit('Tuxum (10 dona)', '10 d.')).toEqual({ name: 'Tuxum', unit: 'pcs', qty: 10 });
    expect(parseProductUnit('Paxta yoği', '1 L')).toMatchObject({ unit: 'l', qty: 1 });
    expect(parseProductUnit('Non', '1 dona')).toMatchObject({ unit: 'pcs', qty: 1 });
    expect(parseUnitText('nimadir')).toBeNull();
  });
  it('nomni odatdagi lotinga keltirish', () => {
    expect(normalizeProductName('Qöy göşti')).toBe('Qo‘y go‘shti');
    expect(normalizeProductName('Guruç')).toBe('Guruch');
    expect(nameKey('Mol göşti')).toBe(nameKey("Mol go'shti"));
  });
});

describe('grammga o‘tkazish va narx', () => {
  it('toGrams', () => {
    expect(toGrams(1, 'kg', {})).toBe(1000);
    expect(toGrams(10, 'pcs', { pieceWeightG: 55 })).toBe(550);
    expect(toGrams(10, 'pcs', {})).toBeNull();
    expect(toGrams(1, 'l', { density: 0.92 })).toBeCloseTo(920);
    expect(toGrams(1, 'l', {})).toBe(1000);
  });
  it('1 gramm narxi va taxminiy xarajat', () => {
    // 10 dona tuxum 12 692 so'm, 1 dona 55 g → 6 dona (330 g) ≈ 7 600 so'm
    const egg = pricePerGram({ price: 12692, unit: 'pcs', unitQty: 10 }, { pieceWeightG: 55 })!;
    expect(estimateCost(330, egg)).toBe(7600);
    const beef = pricePerGram({ price: 125711, unit: 'kg', unitQty: 1 }, {})!;
    expect(estimateCost(1500, beef)).toBe(188600);
    // 1 litr yog' 20 355 so'm, zichlik 0,92 → 150 ml = 138 g
    const oil = pricePerGram({ price: 20355, unit: 'l', unitQty: 1 }, { density: 0.92 })!;
    expect(estimateCost(138, oil)).toBe(3100);
    expect(pricePerGram({ price: 5000, unit: 'pcs', unitQty: 1 }, {})).toBeNull();
  });
});

describe('manba javobini o‘qish', () => {
  it('API javobi', () => {
    const items = parseApiResponse(fixture);
    expect(items).toHaveLength(30);
    expect(items.find((i) => i.productId === 10)).toMatchObject({ name: 'Tuxum', unit: 'pcs', unitQty: 10, price: 12692, prevPrice: 12574 });
    expect(items.find((i) => i.productId === 34)).toMatchObject({ name: 'Mol go‘shti', unit: 'kg', unitQty: 1 });
    expect(items.find((i) => i.productId === 37)).toMatchObject({ unit: 'l', unitQty: 1 });
    expect(items.find((i) => i.productId === 21)).toMatchObject({ unit: 'pcs', unitQty: 1 });
    expect(() => parseApiResponse({})).toThrow('products_missing');
    expect(() => parseApiResponse({ products: [] })).toThrow('products_empty');
  });
  it('Excel qatorlari: sarlavha avtomatik topiladi', () => {
    const items = parseSheetRows([
      ['Narxlar', null, null],
      ['№', 'Mahsulot nomi', 'O‘lchov birligi', 'Narx (so‘m)', 'Oldingi narx'],
      [1, 'Mol go‘shti', '1 kg', 126000, 125000],
      [2, 'Tuxum (10 dona)', null, '12 700', null],
      [3, 'Jami', null, null, null],
    ]);
    expect(items).toEqual([
      { productId: 1, name: 'Mol go‘shti', unit: 'kg', unitQty: 1, price: 126000, prevPrice: 125000 },
      { productId: 2, name: 'Tuxum', unit: 'pcs', unitQty: 10, price: 12700, prevPrice: null },
    ]);
  });
  it('Excel: sarlavhasiz jadval', () => {
    expect(parseSheetRows([['Piyoz', 3000], ['Sabzi (1 kg)', 4800]])).toMatchObject([
      { productId: null, name: 'Piyoz', price: 3000 },
      { productId: null, name: 'Sabzi', price: 4800, unit: 'kg' },
    ]);
  });
});

describe('sinxronlash jadvali (08:00 Asia/Tashkent = 03:00 UTC)', () => {
  const at = (iso: string) => new Date(iso);
  it('08:00 dan oldin — yo‘q, keyin — ha', () => {
    expect(shouldSyncNow(at('2026-11-15T02:59:00Z'), null)).toBe(false);
    expect(shouldSyncNow(at('2026-11-15T03:00:00Z'), null)).toBe(true);
  });
  it('server kech yonsa ham o‘sha kun uchun bir marta', () => {
    expect(shouldSyncNow(at('2026-11-15T14:30:00Z'), null)).toBe(true);
    expect(shouldSyncNow(at('2026-11-15T14:31:00Z'), { status: 'ok', attempts: 1, nextAttemptAt: null })).toBe(false);
  });
  it('xatoda 15 daqiqadan 2 marta qayta urinadi, keyin kunni tashlaydi', () => {
    const t0 = at('2026-11-15T03:00:00Z');
    const r1 = afterFailure(t0, 0);
    expect(r1).toEqual({ status: 'retry', attempts: 1, nextAttemptAt: at('2026-11-15T03:15:00Z') });
    expect(shouldSyncNow(at('2026-11-15T03:14:00Z'), r1)).toBe(false);
    expect(shouldSyncNow(at('2026-11-15T03:15:00Z'), r1)).toBe(true);
    const r2 = afterFailure(at('2026-11-15T03:15:00Z'), 1);
    expect(r2.status).toBe('retry');
    const r3 = afterFailure(at('2026-11-15T03:30:00Z'), 2);
    expect(r3).toEqual({ status: 'failed', attempts: 3, nextAttemptAt: null });
    expect(shouldSyncNow(at('2026-11-15T10:00:00Z'), r3)).toBe(false);
  });
});
