/**
 * Narxlar: mahsulot nomidan birlik va miqdorni ajratish, narxni 1 grammga keltirish,
 * taxminiy xarajat va kunlik sinxronlash jadvali (08:00, 2 marta qayta urinish).
 */
import { localDate, zonedTime } from './schedule';
import { PriceUnit, toGrams } from './units';

export const PRICES_TZ = 'Asia/Tashkent';
export const SYNC_HOUR = '08:00';
export const MAX_ATTEMPTS = 3; // 1 urinish + 2 qayta urinish
export const RETRY_MIN = 15;

export interface ParsedUnit {
  name: string; // birlik qavsi olib tashlangan nom
  unit: PriceUnit;
  qty: number;
}

const UNIT_WORDS: [RegExp, PriceUnit][] = [
  [/^(kg|кг|kilogramm|kilo)\.?$/i, 'kg'],
  [/^(g|gr|г|гр|gramm)\.?$/i, 'g'],
  [/^(l|л|litr|литр|liter)\.?$/i, 'l'],
  [/^(ml|мл)\.?$/i, 'ml'],
  [/^(dona|d|ta|шт|штук|pcs|pc)\.?$/i, 'pcs'],
];

/** "10 d.", "1 kg", "1 L", "0,5 litr", "dona" → birlik va miqdor */
export function parseUnitText(text: string | null | undefined): { unit: PriceUnit; qty: number } | null {
  if (!text) return null;
  const m = text.trim().match(/^(\d+(?:[.,]\d+)?)?\s*([^\d\s].*)$/);
  if (!m) return null;
  const word = m[2].trim();
  const found = UNIT_WORDS.find(([re]) => re.test(word));
  if (!found) return null;
  const qty = m[1] ? Number(m[1].replace(',', '.')) : 1;
  return qty > 0 ? { unit: found[1], qty } : null;
}

/**
 * Mahsulot nomi va (bo'lsa) alohida birlik maydonidan birlikni aniqlaydi.
 * "Tuxum (10 dona)" → Tuxum, 10 dona; "Un (oliy nav)" — qavs birlik emas, nomda qoladi.
 * Hech narsa topilmasa — 1 kg (bozor narxlari odatda kilogramm uchun).
 */
export function parseProductUnit(rawName: string, unitField?: string | null): ParsedUnit {
  let name = rawName.trim();
  let fromName: { unit: PriceUnit; qty: number } | null = null;
  const m = name.match(/\(([^()]*)\)\s*$/);
  if (m) {
    fromName = parseUnitText(m[1]);
    if (fromName) name = name.slice(0, m.index).trim();
  }
  const parsed = parseUnitText(unitField) ?? fromName ?? { unit: 'kg' as PriceUnit, qty: 1 };
  return { name, ...parsed };
}

/** Manbadagi lotin yozuvi (ö, ğ, ş, ç) → odatdagi o'zbek lotini */
export function normalizeProductName(name: string): string {
  return name
    .replace(/ö/g, 'o‘')
    .replace(/Ö/g, 'O‘')
    .replace(/ğ/g, 'g‘')
    .replace(/Ğ/g, 'G‘')
    .replace(/ş/g, 'sh')
    .replace(/Ş/g, 'Sh')
    .replace(/ç/g, 'ch')
    .replace(/Ç/g, 'Ch')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Nomlarni solishtirish uchun kalit (Excel qatorini ma'lum mahsulotga bog'lash) */
export function nameKey(name: string): string {
  return normalizeProductName(name)
    .toLowerCase()
    .replace(/[‘’ʻʼ'`]/g, '')
    .replace(/[^a-z0-9а-яё]+/gi, ' ')
    .trim();
}

export interface UnitPrice {
  price: number; // so'm
  unit: PriceUnit;
  unitQty: number;
}

/** 1 gramm narxi (so'm). Birlikni grammga o'tkazib bo'lmasa — null. */
export function pricePerGram(p: UnitPrice, ing: { pieceWeightG?: number | null; density?: number | null }): number | null {
  const grams = toGrams(p.unitQty, p.unit, ing);
  if (!grams || !(p.price > 0)) return null;
  return p.price / grams;
}

/** Taxminiy xarajat: 100 so'mgacha yaxlitlanadi (taxmin — tiyinigacha aniqlik chalg'itadi) */
export function estimateCost(qtyG: number, perGram: number): number {
  return Math.max(0, Math.round((qtyG * perGram) / 100) * 100);
}

// ─────────── sinxronlash jadvali ───────────

export interface SyncRun {
  status: 'ok' | 'retry' | 'failed';
  attempts: number;
  nextAttemptAt: Date | null;
}

/**
 * Hozir manbaga murojaat qilish kerakmi?
 *  - 08:00 dan oldin — yo'q;
 *  - bugun hali urinilmagan (server 08:00 da o'chiq bo'lgan bo'lsa ham) — ha;
 *  - xato bo'lgan va keyingi urinish vaqti kelgan — ha; 3 urinishdan keyin kun tashlab ketiladi.
 */
export function shouldSyncNow(now: Date, todayRun: SyncRun | null | undefined): boolean {
  const today = localDate(now, PRICES_TZ);
  if (now.getTime() < zonedTime(today, SYNC_HOUR, PRICES_TZ).getTime()) return false;
  if (!todayRun) return true;
  if (todayRun.status !== 'retry') return false;
  if (todayRun.attempts >= MAX_ATTEMPTS) return false;
  return !todayRun.nextAttemptAt || todayRun.nextAttemptAt.getTime() <= now.getTime();
}

/** Muvaffaqiyatsiz urinishdan keyingi holat */
export function afterFailure(now: Date, attemptsSoFar: number): SyncRun {
  const attempts = attemptsSoFar + 1;
  if (attempts >= MAX_ATTEMPTS) return { status: 'failed', attempts, nextAttemptAt: null };
  return { status: 'retry', attempts, nextAttemptAt: new Date(now.getTime() + RETRY_MIN * 60_000) };
}
