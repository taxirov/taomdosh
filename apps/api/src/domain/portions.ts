/**
 * Shaxsiy porsiya va qozon hajmi.
 *
 *   Pᵢ = Eᵢ × sₘ × kᵢ / Σ K_d
 *
 * Eᵢ — a'zoning kunlik energiya ehtiyoji, sₘ — mahal ulushi,
 * kᵢ — o'rganilgan shaxsiy koeffitsient, K_d — mahaldagi har bir taomning bitta standart porsiyasi kaloriyasi.
 * Pᵢ — standart porsiyaga nisbatan koeffitsient; mahaldagi har bir taomdan a'zo Pᵢ porsiya oladi.
 *
 * Qozon hajmi = retsept miqdori × ΣPᵢ / retseptning asosiy porsiyasi.
 */

export const DEFAULT_MEAL_SHARES = { breakfast: 0.25, lunch: 0.35, dinner: 0.3, snack: 0.1 } as const;

export const FACTOR_MIN = 0.7;
export const FACTOR_MAX = 1.3;
export const FACTOR_STEP = 0.05;

/** Bitta porsiya juda kichik yoki ulkan bo'lib ketmasligi uchun chegaralar */
export const PORTION_MIN = 0.4;
export const PORTION_MAX = 2.5;

/** Mehmon — o'rtacha katta yoshli, standart porsiya */
export const GUEST_PORTION = 1;

export interface Eater {
  userId: string;
  dailyKcal: number;
  factor: number; // kᵢ
}

export interface DishForPortion {
  dishId: string;
  kcalPerServing: number; // K_d
  gramsPerServing: number; // tayyor taomning bitta porsiyasi grammi (masalliqlar yig'indisi / base_servings)
}

export interface PortionRow {
  dishId: string;
  userId: string | null; // mehmon — null
  hostUserId: string | null;
  factor: number;
  grams: number;
  kcal: number;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/** Pᵢ — a'zoning mahaldagi porsiya koeffitsienti */
export function portionFactor(e: Eater, mealShare: number, dishes: DishForPortion[]): number {
  const totalKcal = dishes.reduce((s, d) => s + d.kcalPerServing, 0);
  if (totalKcal <= 0) return 1; // kaloriya ma'lumoti yo'q — standart porsiya
  const p = (e.dailyKcal * mealShare * e.factor) / totalKcal;
  return round2(clamp(p, PORTION_MIN, PORTION_MAX));
}

/**
 * Mahal uchun barcha porsiyalarni hisoblaydi (qulflash lahzasida chaqiriladi).
 * guests — a'zo user_id → mehmonlar soni.
 */
export function computePortions(
  eaters: Eater[],
  guests: Map<string, number>,
  mealShare: number,
  dishes: DishForPortion[],
): PortionRow[] {
  const rows: PortionRow[] = [];
  for (const e of eaters) {
    const p = portionFactor(e, mealShare, dishes);
    for (const d of dishes) {
      rows.push({
        dishId: d.dishId,
        userId: e.userId,
        hostUserId: null,
        factor: p,
        grams: Math.round(d.gramsPerServing * p),
        kcal: Math.round(d.kcalPerServing * p),
      });
    }
  }
  for (const [hostId, count] of guests) {
    for (let g = 0; g < count; g++) {
      for (const d of dishes) {
        rows.push({
          dishId: d.dishId,
          userId: null,
          hostUserId: hostId,
          factor: GUEST_PORTION,
          grams: Math.round(d.gramsPerServing * GUEST_PORTION),
          kcal: Math.round(d.kcalPerServing * GUEST_PORTION),
        });
      }
    }
  }
  return rows;
}

/** Taom bo'yicha jami porsiya soni (ΣPᵢ) */
export function totalServingsByDish(rows: PortionRow[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) m.set(r.dishId, round2((m.get(r.dishId) ?? 0) + r.factor));
  return m;
}

export interface RecipeLine {
  ingredientId: string;
  qtyG: number; // base_servings uchun
}

/** Retseptni ΣPᵢ porsiyaga masshtablash */
export function scaleRecipe(lines: RecipeLine[], baseServings: number, servings: number): RecipeLine[] {
  const k = servings / Math.max(1, baseServings);
  return lines.map((l) => ({ ingredientId: l.ingredientId, qtyG: Math.round(l.qtyG * k) }));
}

/**
 * Ovqatdan keyingi baho bo'yicha kᵢ ni yangilash.
 * "Yetmadi" → +5%, "ortdi" → −5%, 0.7–1.3 oralig'ida.
 * Ozish maqsadidagi a'zoda "yetmadi" kᵢ ni oshirmaydi (o'rniga kam kaloriyali qo'shimcha taklif qilinadi).
 */
export function updateFactor(
  current: number,
  verdict: 'too_much' | 'enough' | 'not_enough',
  goal: 'lose' | 'maintain' | 'gain',
): { factor: number; suggestLightSide: boolean } {
  if (verdict === 'enough') return { factor: current, suggestLightSide: false };
  if (verdict === 'not_enough' && goal === 'lose') return { factor: current, suggestLightSide: true };
  const next = verdict === 'not_enough' ? current + FACTOR_STEP : current - FACTOR_STEP;
  return { factor: round2(clamp(next, FACTOR_MIN, FACTOR_MAX)), suggestLightSide: false };
}

/** Taomning kaloriyasi va porsiya grammini masalliqlardan hisoblash */
export function dishNutrition(
  lines: { qtyG: number; kcal100g: number }[],
  baseServings: number,
): { kcalPerServing: number; gramsPerServing: number } {
  const totalKcal = lines.reduce((s, l) => s + (l.qtyG * l.kcal100g) / 100, 0);
  const totalG = lines.reduce((s, l) => s + l.qtyG, 0);
  const n = Math.max(1, baseServings);
  return { kcalPerServing: Math.round(totalKcal / n), gramsPerServing: Math.round(totalG / n) };
}
