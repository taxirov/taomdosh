// API mijozi: tokenlar localStorage da, 401 bo'lsa refresh bilan bir marta qayta urinadi.
const BASE = '/v1';
const KEY = 'taomdosh-admin-auth';

export interface Tokens {
  accessToken: string;
  refreshToken: string;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(code);
  }
}

export function getTokens(): Tokens | null {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? 'null');
  } catch {
    return null;
  }
}

export function setTokens(t: Tokens | null) {
  if (t) localStorage.setItem(KEY, JSON.stringify(t));
  else localStorage.removeItem(KEY);
  window.dispatchEvent(new Event('auth-changed'));
}

let refreshing: Promise<boolean> | null = null;
async function refresh(): Promise<boolean> {
  const t = getTokens();
  if (!t) return false;
  refreshing ??= fetch(`${BASE}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken: t.refreshToken }),
  })
    .then(async (r) => {
      if (!r.ok) {
        setTokens(null);
        return false;
      }
      setTokens(await r.json());
      return true;
    })
    .catch(() => false)
    .finally(() => (refreshing = null));
  return refreshing;
}

type Query = Record<string, string | number | boolean | null | undefined>;

export async function api<T = unknown>(
  path: string,
  opts: { method?: string; body?: unknown; query?: Query; form?: FormData; auth?: boolean } = {},
  retry = true,
): Promise<T> {
  const qs = opts.query
    ? '?' +
      Object.entries(opts.query)
        .filter(([, v]) => v !== undefined && v !== null && v !== '')
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join('&')
    : '';
  const headers: Record<string, string> = { 'Accept-Language': 'uz' };
  const t = getTokens();
  if (opts.auth !== false && t) headers.Authorization = `Bearer ${t.accessToken}`;
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${BASE}${path}${qs === '?' ? '' : qs}`, {
    method: opts.method ?? 'GET',
    headers,
    body: opts.form ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
  });
  if (res.status === 401 && retry && opts.auth !== false && (await refresh())) return api<T>(path, opts, false);
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const msg = Array.isArray(data?.message) ? data.message.join(', ') : (data?.message ?? res.statusText);
    throw new ApiError(res.status, String(msg));
  }
  return data as T;
}

/** Bazadagi nisbiy rasm manzili (/uploads/...) → to'liq URL */
export const media = (url: string | null | undefined) => (!url ? null : /^https?:/.test(url) ? url : `${BASE}${url}`);

/** Server xato kodlari → o'zbekcha matn */
const ERRORS: Record<string, string> = {
  admin_only: "Bu bo'lim faqat platforma adminlari uchun",
  account_blocked: 'Hisob bloklangan',
  code_invalid: "Kod noto'g'ri",
  too_soon: 'Kodni qayta so‘rashdan oldin biroz kuting',
  too_many_requests: "Juda ko'p urinish. Keyinroq qayta urinib ko'ring",
  too_many_attempts: "Juda ko'p noto'g'ri urinish. Yangi kod so'rang",
  login_expired: "Kirish muddati tugadi. Qaytadan boshlang",
  cannot_change_self: "O'zingizning rolingiz yoki holatingizni o'zgartira olmaysiz",
  slug_taken: 'Bu slug band',
  product_not_found: 'Bunday narx mahsuloti topilmadi',
  file_required: 'Fayl tanlang',
  user_deleted: "Hisob o'chirilgan",
};
export const errorText = (e: unknown) => {
  if (e instanceof ApiError) return ERRORS[e.code] ?? (e.code.startsWith('excel_invalid') ? "Excel fayl formati noto'g'ri" : e.code);
  if (e instanceof TypeError) return 'Server bilan aloqa yo‘q';
  return String((e as Error)?.message ?? e);
};
