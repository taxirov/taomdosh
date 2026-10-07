/**
 * Kunlik energiya ehtiyoji (Eᵢ) va makrolar.
 * Kattalar: Mifflin–St Jeor × faollik koeffitsienti, keyin maqsad tuzatmasi.
 * 18 yoshgacha: yosh/jins bo'yicha me'yor jadvali, ozish tuzatmasi qo'llanmaydi.
 * Bu tibbiy maslahat emas — umumiy wellness hisobi.
 */
import type { ActivityLevel, Goal, Sex } from '../db/schema';

export const FORMULA_VERSION = 'msj-2026.1';

export const ACTIVITY_FACTORS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

/** Maqsad tuzatmasi: ozish −15%, semirish +10%. */
export const GOAL_ADJUSTMENT: Record<Goal, number> = { lose: 0.85, maintain: 1, gain: 1.1 };

/** Profil to'ldirilmagan kattalar uchun standart qiymat. */
export const DEFAULT_ADULT_KCAL = 2000;

/**
 * Bolalar va o'smirlar uchun taxminiy kunlik me'yor (o'rtacha faollik), kkal.
 * Indeks — to'liq yosh. Manba: WHO/FAO energiya ehtiyoji jadvallarining yaxlitlangan qiymatlari.
 */
const CHILD_KCAL: Record<Sex, number[]> = {
  //      0    1    2    3     4     5     6     7     8     9     10    11    12    13    14    15    16    17
  male: [700, 950, 1050, 1250, 1350, 1450, 1550, 1650, 1750, 1850, 2000, 2150, 2300, 2450, 2600, 2750, 2850, 2900],
  female: [650, 850, 1000, 1150, 1250, 1350, 1450, 1550, 1650, 1750, 1850, 1950, 2050, 2150, 2200, 2250, 2250, 2250],
};

export interface ProfileInput {
  birthDate?: string | null; // YYYY-MM-DD
  sex?: Sex | null;
  heightCm?: number | null;
  weightKg?: number | null;
  activityLevel?: ActivityLevel | null;
  goal?: Goal | null;
}

export interface NutritionTarget {
  kcal: number;
  proteinG: number;
  fatG: number;
  carbG: number;
  isChild: boolean;
  isEstimate: boolean; // profil to'liq emas — standart qiymat ishlatildi
  formulaVersion: string;
}

export function ageOn(birthDate: string, on: Date = new Date()): number {
  const [y, m, d] = birthDate.split('-').map(Number);
  let age = on.getUTCFullYear() - y;
  const beforeBirthday = on.getUTCMonth() + 1 < m || (on.getUTCMonth() + 1 === m && on.getUTCDate() < d);
  if (beforeBirthday) age -= 1;
  return Math.max(0, age);
}

/** Mifflin–St Jeor bazal almashinuv (BMR), kkal. */
export function mifflinStJeor(sex: Sex, weightKg: number, heightCm: number, age: number): number {
  return 10 * weightKg + 6.25 * heightCm - 5 * age + (sex === 'male' ? 5 : -161);
}

export function computeTarget(p: ProfileInput, on: Date = new Date()): NutritionTarget {
  const age = p.birthDate ? ageOn(p.birthDate, on) : null;
  const goal: Goal = p.goal ?? 'maintain';

  // 18 yoshgacha — jadvaldan, ozish tuzatmasisiz
  if (age !== null && age < 18) {
    const kcal = CHILD_KCAL[p.sex ?? 'female'][age];
    const adjusted = goal === 'gain' ? kcal * GOAL_ADJUSTMENT.gain : kcal;
    return withMacros(Math.round(adjusted), 'maintain', p.weightKg ?? null, true, !p.sex);
  }

  if (age === null || !p.sex || !p.heightCm || !p.weightKg) {
    return withMacros(DEFAULT_ADULT_KCAL, goal, p.weightKg ?? null, false, true);
  }

  const bmr = mifflinStJeor(p.sex, p.weightKg, p.heightCm, age);
  const tdee = bmr * ACTIVITY_FACTORS[p.activityLevel ?? 'light'];
  let kcal = tdee * GOAL_ADJUSTMENT[goal];
  // Xavfsiz pastki chegara: BMR dan kam bo'lmasin
  kcal = Math.max(kcal, bmr, p.sex === 'male' ? 1500 : 1200);
  return withMacros(Math.round(kcal), goal, p.weightKg, false, false);
}

function withMacros(kcal: number, goal: Goal, weightKg: number | null, isChild: boolean, isEstimate: boolean): NutritionTarget {
  // Oqsil: ozishda 1.6 g/kg, boshqalarda 1.2 g/kg (vazn noma'lum bo'lsa — 20% energiya)
  const proteinPerKg = goal === 'lose' ? 1.6 : 1.2;
  let proteinG = weightKg ? weightKg * proteinPerKg : (kcal * 0.2) / 4;
  proteinG = Math.min(proteinG, (kcal * 0.35) / 4);
  const fatG = (kcal * 0.3) / 9;
  const carbG = Math.max(0, (kcal - proteinG * 4 - fatG * 9) / 4);
  return {
    kcal,
    proteinG: Math.round(proteinG),
    fatG: Math.round(fatG),
    carbG: Math.round(carbG),
    isChild,
    isEstimate,
    formulaVersion: FORMULA_VERSION,
  };
}
