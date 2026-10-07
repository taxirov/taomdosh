/**
 * Navbatchilik: avtomatik aylanish + qo'lda almashtirish.
 * Avtomatik navbat sanaga bog'langan va deterministik: kunlar soni (aylanish boshidan) mod a'zolar soni.
 * Shunday qilib, navbat kimda ekanligini istalgan kun uchun bazaga yozmasdan hisoblash mumkin;
 * qo'lda almashtirilgan kunlar duty_assignments jadvalida saqlanadi va ustun turadi.
 */
import { daysBetween } from './schedule';

/** Aylanish hisobining boshlang'ich sanasi (dushanba) */
export const ROTATION_EPOCH = '2024-01-01';

export function autoDutyUser(memberOrder: string[], date: string): string | null {
  if (memberOrder.length === 0) return null;
  const n = memberOrder.length;
  const idx = ((daysBetween(ROTATION_EPOCH, date) % n) + n) % n;
  return memberOrder[idx];
}

export function resolveDuty(
  memberOrder: string[],
  date: string,
  manual: Map<string, string>, // date → userId
): { userId: string | null; isManual: boolean } {
  const m = manual.get(date);
  if (m) return { userId: m, isManual: true };
  return { userId: autoDutyUser(memberOrder, date), isManual: false };
}
