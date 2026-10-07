/**
 * Mahal vaqtlari:
 *   Ovqat vaqti        — cookbookdan yoki guruh sozlamasidan
 *   Pishirish boshlanishi = ovqat vaqti − mahaldagi eng uzun taomning (faol + passiv) vaqti
 *   Eslatma            = boshlanishdan 30 daqiqa oldin
 *   Qulflash           = pishirish boshlanishi
 *   Oldindan tayyorgarlik (ivitish, marinad) = bir kun oldin 20:00 da
 */

export const REMIND_BEFORE_MIN = 30;
export const PREP_AHEAD_HOUR = 20;
const MIN = 60_000;

/** Vaqt zonasining berilgan lahzadagi UTC dan siljishi, daqiqada (Asia/Tashkent → +300). */
export function tzOffsetMinutes(timeZone: string, at: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(at);
  const v = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const asUtc = Date.UTC(v('year'), v('month') - 1, v('day'), v('hour'), v('minute'), v('second'));
  return Math.round((asUtc - at.getTime()) / MIN);
}

/** Mahalliy sana + "HH:MM" → UTC lahza (berilgan vaqt zonasida) */
export function zonedTime(dateStr: string, hhmm: string, timeZone: string): Date {
  const [y, mo, d] = dateStr.split('-').map(Number);
  const [h, mi] = hhmm.split(':').map(Number);
  const naiveUtc = Date.UTC(y, mo - 1, d, h, mi);
  // Ikki marta aniqlashtirish — yozgi vaqtga o'tish kunlari uchun
  let offset = tzOffsetMinutes(timeZone, new Date(naiveUtc));
  let t = naiveUtc - offset * MIN;
  const offset2 = tzOffsetMinutes(timeZone, new Date(t));
  if (offset2 !== offset) {
    offset = offset2;
    t = naiveUtc - offset * MIN;
  }
  return new Date(t);
}

/** UTC lahzadan guruh vaqt zonasidagi sana 'YYYY-MM-DD' */
export function localDate(at: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
  return parts; // en-CA → YYYY-MM-DD
}

export function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return t.toISOString().slice(0, 10);
}

/** Hafta dushanbasi (ISO hafta) */
export function weekMonday(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = yakshanba
  return addDays(dateStr, dow === 0 ? -6 : 1 - dow);
}

export function daysBetween(a: string, b: string): number {
  const ta = Date.parse(`${a}T00:00:00Z`);
  const tb = Date.parse(`${b}T00:00:00Z`);
  return Math.round((tb - ta) / 86_400_000);
}

export interface DishTiming {
  activeMin: number;
  passiveMin: number;
  prepAheadMin: number;
}

export interface MealTimes {
  eatAt: Date;
  startAt: Date;
  remindAt: Date;
  lockAt: Date;
  prepAt: Date | null;
}

export function computeMealTimes(dateStr: string, eatTime: string, timeZone: string, dishes: DishTiming[]): MealTimes {
  const eatAt = zonedTime(dateStr, eatTime, timeZone);
  const longest = dishes.reduce((m, d) => Math.max(m, d.activeMin + d.passiveMin), 0);
  const startAt = new Date(eatAt.getTime() - longest * MIN);
  const remindAt = new Date(startAt.getTime() - REMIND_BEFORE_MIN * MIN);
  const needsPrep = dishes.some((d) => d.prepAheadMin > 0);
  const prepAt = needsPrep
    ? zonedTime(addDays(dateStr, -1), `${String(PREP_AHEAD_HOUR).padStart(2, '0')}:00`, timeZone)
    : null;
  return { eatAt, startAt, remindAt, lockAt: startAt, prepAt };
}
