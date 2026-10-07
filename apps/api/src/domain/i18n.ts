/**
 * Tillar: uz (lotin), uz-Cyrl (kirill — lotindan avtomatik), ru, en.
 * Tarjima topilmasa: so'ralgan til → uz → en → ru → birinchi mavjud.
 */

export const LOCALES = ['uz', 'uz-Cyrl', 'ru', 'en'] as const;
export type Locale = (typeof LOCALES)[number];

export function normalizeLocale(input?: string | null): Locale {
  if (!input) return 'uz';
  const l = input.trim();
  if (/^uz[-_](cyrl|cyrillic)/i.test(l)) return 'uz-Cyrl';
  const base = l.slice(0, 2).toLowerCase();
  return (['uz', 'ru', 'en'] as const).find((x) => x === base) ?? 'uz';
}

// O'zbek lotin → kirill. Avval ko'p harfli birikmalar, keyin bittalik harflar.
const MULTI: [RegExp, string][] = [
  [/O['‘’ʻ`]/g, 'Ў'],
  [/o['‘’ʻ`]/g, 'ў'],
  [/G['‘’ʻ`]/g, 'Ғ'],
  [/g['‘’ʻ`]/g, 'ғ'],
  [/Sh/g, 'Ш'],
  [/SH/g, 'Ш'],
  [/sh/g, 'ш'],
  [/Ch/g, 'Ч'],
  [/CH/g, 'Ч'],
  [/ch/g, 'ч'],
  [/Yo/g, 'Ё'],
  [/YO/g, 'Ё'],
  [/yo/g, 'ё'],
  [/Yu/g, 'Ю'],
  [/YU/g, 'Ю'],
  [/yu/g, 'ю'],
  [/Ya/g, 'Я'],
  [/YA/g, 'Я'],
  [/ya/g, 'я'],
  [/Ye/g, 'Е'],
  [/YE/g, 'Е'],
  [/ye/g, 'е'],
  [/Ts(?=[aeiou])/g, 'Ц'],
  [/ts(?=[aeiou])/g, 'ц'],
  [/['‘’ʻ`]/g, 'ъ'], // tutuq belgisi (ma'no → маъно)
];

const SINGLE: Record<string, string> = {
  A: 'А', a: 'а', B: 'Б', b: 'б', D: 'Д', d: 'д', E: 'Э', e: 'э', F: 'Ф', f: 'ф', G: 'Г', g: 'г',
  H: 'Ҳ', h: 'ҳ', I: 'И', i: 'и', J: 'Ж', j: 'ж', K: 'К', k: 'к', L: 'Л', l: 'л', M: 'М', m: 'м',
  N: 'Н', n: 'н', O: 'О', o: 'о', P: 'П', p: 'п', Q: 'Қ', q: 'қ', R: 'Р', r: 'р', S: 'С', s: 'с',
  T: 'Т', t: 'т', U: 'У', u: 'у', V: 'В', v: 'в', X: 'Х', x: 'х', Y: 'Й', y: 'й', Z: 'З', z: 'з',
  C: 'С', c: 'с', W: 'В', w: 'в',
};

/** O'zbek lotin matnini kirillga o'giradi. So'z boshidagi "e" → "э", qolgan joyda → "е". */
export function uzLatinToCyrillic(input: string): string {
  let s = input;
  for (const [re, rep] of MULTI) s = s.replace(re, rep);
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    const prev = i > 0 ? s[i - 1] : ' ';
    const wordStart = !/[\p{L}]/u.test(prev);
    if ((ch === 'e' || ch === 'E') && !wordStart) out += ch === 'e' ? 'е' : 'Е';
    else out += SINGLE[ch] ?? ch;
  }
  return out;
}

/** Tarjimalar ro'yxatidan so'ralgan tildagisini tanlaydi; uz-Cyrl uchun uz dan avtomatik o'giradi. */
export function pickTranslation<T extends { locale: string }>(
  rows: T[],
  locale: Locale,
  fields: (keyof T)[],
): T | undefined {
  if (rows.length === 0) return undefined;
  if (locale === 'uz-Cyrl') {
    const cyr = rows.find((r) => r.locale === 'uz-Cyrl');
    if (cyr) return cyr;
    const uz = rows.find((r) => r.locale === 'uz');
    if (uz) {
      const copy = { ...uz, locale: 'uz-Cyrl' } as T;
      for (const f of fields) {
        const v = copy[f];
        if (typeof v === 'string') (copy as Record<keyof T, unknown>)[f] = uzLatinToCyrillic(v);
      }
      return copy;
    }
  }
  const order = [locale, 'uz', 'en', 'ru'];
  for (const l of order) {
    const r = rows.find((x) => x.locale === l);
    if (r) return r;
  }
  return rows[0];
}
