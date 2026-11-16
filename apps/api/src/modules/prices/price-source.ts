/**
 * Narx manbalari — alohida adapterlar. Modulning qolgan qismi manbani bilmaydi:
 * faqat PriceItem ro'yxatini oladi. Yangi manba qo'shish = shu interfeysni amalga oshirish.
 */
import { normalizeProductName, parseProductUnit, parseUnitText } from '../../domain/prices';
import type { PriceUnit } from '../../domain/units';

export interface PriceItem {
  productId: number | null; // Excel qatorida bo'lmasligi mumkin — nom bo'yicha bog'lanadi
  name: string;
  unit: PriceUnit;
  unitQty: number;
  price: number;
  prevPrice: number | null;
}

export interface PriceSource {
  readonly id: 'api' | 'excel';
  fetch(): Promise<PriceItem[]>;
}

export const PRICE_SOURCE = Symbol('PRICE_SOURCE');
export const DEFAULT_SOURCE_URL = 'https://www.narxtahlil.uz/api/products/performance/';
export const USER_AGENT = 'Taomdosh/1.0';

const num = (v: unknown): number | null => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string') {
    const n = Number(v.replace(/\s/g, '').replace(',', '.'));
    return v.trim() !== '' && Number.isFinite(n) ? n : null;
  }
  return null;
};

/** API javobi ({ products: [...] }) → PriceItem[]. Yaroqsiz qatorlar tashlab ketiladi. */
export function parseApiResponse(body: unknown): PriceItem[] {
  const products = (body as { products?: unknown })?.products;
  if (!Array.isArray(products)) throw new Error('products_missing');
  const out: PriceItem[] = [];
  for (const p of products as Record<string, unknown>[]) {
    const productId = num(p.product_id);
    const price = num(p.price);
    if (productId === null || price === null || price <= 0 || typeof p.name !== 'string') continue;
    const u = parseProductUnit(p.name, typeof p.unit === 'string' ? p.unit : null);
    const prev = num(p.prevPrice);
    out.push({
      productId,
      name: normalizeProductName(u.name),
      unit: u.unit,
      unitQty: u.qty,
      price: Math.round(price),
      prevPrice: prev !== null && prev > 0 ? Math.round(prev) : null,
    });
  }
  if (out.length === 0) throw new Error('products_empty');
  return out;
}

/** Kuniga bitta so'rov: respublika o'rtacha narxlari */
export class NarxtahlilApiSource implements PriceSource {
  readonly id = 'api' as const;
  constructor(private readonly url: string = DEFAULT_SOURCE_URL) {}

  async fetch(): Promise<PriceItem[]> {
    const res = await fetch(this.url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`http_${res.status}`);
    return parseApiResponse(await res.json());
  }
}

const HEAD = {
  name: /(mahsulot|nom|tovar|name|product|наимен|товар|продукт|маҳсулот)/i,
  price: /(narx|price|цена|нарх)/i,
  prev: /(oldingi|avvalgi|prev|предыд|олдинги)/i,
  unit: /(birlik|o.?lchov|unit|ед\.?|бирлик)/i,
  id: /^(id|product_?id|kod|код|№)$/i,
};

/**
 * Zaxira manba: admin qo'lda yuklagan Excel (.xlsx) fayl.
 * Sarlavha qatori avtomatik topiladi (nom / narx / birlik / oldingi narx / id ustunlari);
 * topilmasa — birinchi matnli ustun nom, birinchi sonli ustun narx deb olinadi.
 */
export class ExcelSource implements PriceSource {
  readonly id = 'excel' as const;
  constructor(private readonly file: Buffer) {}

  async fetch(): Promise<PriceItem[]> {
    // Og'ir kutubxona faqat kerak bo'lganda yuklanadi (kichik serverda xotira tejash)
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ExcelJS = require('exceljs') as typeof import('exceljs');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(this.file as unknown as ArrayBuffer);
    const rows: unknown[][] = [];
    const ws = wb.worksheets[0];
    if (!ws) throw new Error('sheet_missing');
    ws.eachRow((row) => {
      const vals = (row.values as unknown[]).slice(1).map((c) => cellValue(c));
      rows.push(vals);
    });
    return parseSheetRows(rows);
  }
}

function cellValue(c: unknown): unknown {
  if (c && typeof c === 'object') {
    const o = c as { result?: unknown; text?: unknown; richText?: { text: string }[] };
    if (o.result !== undefined) return o.result;
    if (o.richText) return o.richText.map((t) => t.text).join('');
    if (o.text !== undefined) return o.text;
    return null;
  }
  return c;
}

export function parseSheetRows(rows: unknown[][]): PriceItem[] {
  let col: { name: number; price: number; prev: number; unit: number; id: number } | null = null;
  let start = 0;
  for (let r = 0; r < Math.min(rows.length, 15) && !col; r++) {
    const cells = rows[r].map((c) => (typeof c === 'string' ? c.trim() : ''));
    const find = (re: RegExp, skip: number[] = []) => cells.findIndex((c, i) => !!c && re.test(c) && !skip.includes(i));
    const prev = find(HEAD.prev);
    const price = find(HEAD.price, prev >= 0 ? [prev] : []);
    const name = find(HEAD.name, [price, prev]);
    if (name >= 0 && price >= 0) {
      col = { name, price, prev, unit: find(HEAD.unit), id: find(HEAD.id) };
      start = r + 1;
    }
  }
  if (!col) {
    const sample = rows.find((r) => r.some((c) => typeof c === 'string' && c.trim()) && r.some((c) => num(c) !== null && typeof c !== 'string'));
    if (!sample) throw new Error('columns_not_found');
    col = {
      name: sample.findIndex((c) => typeof c === 'string' && c.trim() !== ''),
      price: sample.findIndex((c) => typeof c === 'number'),
      prev: -1,
      unit: -1,
      id: -1,
    };
  }
  const out: PriceItem[] = [];
  for (const row of rows.slice(start)) {
    const rawName = row[col.name];
    const price = num(row[col.price]);
    if (typeof rawName !== 'string' || !rawName.trim() || price === null || price <= 0) continue;
    const unitCell = col.unit >= 0 && typeof row[col.unit] === 'string' ? (row[col.unit] as string) : null;
    const u = parseProductUnit(rawName, unitCell && parseUnitText(unitCell) ? unitCell : null);
    const prev = col.prev >= 0 ? num(row[col.prev]) : null;
    const id = col.id >= 0 ? num(row[col.id]) : null;
    out.push({
      productId: id !== null && Number.isInteger(id) ? id : null,
      name: normalizeProductName(u.name),
      unit: u.unit,
      unitQty: u.qty,
      price: Math.round(price),
      prevPrice: prev !== null && prev > 0 ? Math.round(prev) : null,
    });
  }
  if (out.length === 0) throw new Error('products_empty');
  return out;
}
