/**
 * Porsiya rejalashtiruvchi: mahal(lar) uchun kerakli ma'lumotni bazadan yig'adi va
 * `computePortions` bilan porsiyalarni hisoblaydi.
 *
 * Ikki joyda ishlatiladi:
 *  - qulflashda (tranzaksiya ichida) — natija `meal_portions` ga muzlatiladi;
 *  - qulflanmagan mahallar uchun "kutilgan" porsiyalar — oshpaz ko'rinishi va xarid ro'yxati.
 */
import { and, eq, inArray, isNull } from 'drizzle-orm';
import type { Db } from '../../common/infra.module';
import {
  attendance,
  dishes,
  dishIngredients,
  groupMealSettings,
  groupMembers,
  ingredients,
  mealInstanceDishes,
  mealInstances,
  portionFactors,
  userProfiles,
} from '../../db/schema';
import type { MealType } from '../../db/schema';
import { computeTarget } from '../../domain/nutrition';
import {
  computePortions,
  DEFAULT_MEAL_SHARES,
  dishNutrition,
  DishForPortion,
  Eater,
  PortionRow,
  RecipeLine,
  scaleRecipe,
  totalServingsByDish,
} from '../../domain/portions';

/** Tranzaksiya yoki oddiy ulanish — ikkalasida ham ishlaydi */
export type DbLike = Pick<Db, 'select'>;

export interface PlannedDish extends DishForPortion {
  mealInstanceDishId: string;
  isSide: boolean;
  baseServings: number;
  lines: RecipeLine[];
}

export interface MealPlan {
  mealId: string;
  groupId: string;
  mealType: MealType;
  share: number;
  dishes: PlannedDish[];
  eaters: Eater[];
  guests: Map<string, number>;
  portions: PortionRow[];
  /** dishId → ΣPᵢ */
  servings: Map<string, number>;
}

/** Bir nechta mahal uchun porsiyalarni hisoblaydi (joriy qatnashuv bo'yicha) */
export async function planPortions(db: DbLike, mealIds: string[]): Promise<Map<string, MealPlan>> {
  const out = new Map<string, MealPlan>();
  if (mealIds.length === 0) return out;

  const meals = await db.select().from(mealInstances).where(inArray(mealInstances.id, mealIds));
  const groupIds = [...new Set(meals.map((m) => m.groupId))];

  const settings = await db.select().from(groupMealSettings).where(inArray(groupMealSettings.groupId, groupIds));
  const members = await db
    .select({ groupId: groupMembers.groupId, userId: groupMembers.userId })
    .from(groupMembers)
    .where(and(inArray(groupMembers.groupId, groupIds), isNull(groupMembers.leftAt)));
  const userIds = [...new Set(members.map((m) => m.userId))];
  const profiles = userIds.length
    ? await db.select().from(userProfiles).where(inArray(userProfiles.userId, userIds))
    : [];
  const factors = userIds.length
    ? await db.select().from(portionFactors).where(inArray(portionFactors.userId, userIds))
    : [];
  const att = await db.select().from(attendance).where(inArray(attendance.mealInstanceId, mealIds));

  const mDishes = await db
    .select({
      id: mealInstanceDishes.id,
      mealInstanceId: mealInstanceDishes.mealInstanceId,
      dishId: mealInstanceDishes.dishId,
      isSide: mealInstanceDishes.isSide,
      baseServings: dishes.baseServings,
    })
    .from(mealInstanceDishes)
    .innerJoin(dishes, eq(dishes.id, mealInstanceDishes.dishId))
    .where(inArray(mealInstanceDishes.mealInstanceId, mealIds));
  const dishIds = [...new Set(mDishes.map((d) => d.dishId))];
  const lines = dishIds.length
    ? await db
        .select({ dishId: dishIngredients.dishId, ingredientId: dishIngredients.ingredientId, qtyG: dishIngredients.qtyG, kcal100g: ingredients.kcal100g })
        .from(dishIngredients)
        .innerJoin(ingredients, eq(ingredients.id, dishIngredients.ingredientId))
        .where(inArray(dishIngredients.dishId, dishIds))
    : [];

  const now = new Date();
  const kcalByUser = new Map(profiles.map((p) => [p.userId, computeTarget(p, now).kcal]));
  const factorKey = (u: string, t: MealType) => `${u}:${t}`;
  const factorMap = new Map(factors.map((f) => [factorKey(f.userId, f.mealType), f.factor]));
  const linesByDish = new Map<string, typeof lines>();
  for (const l of lines) linesByDish.set(l.dishId, [...(linesByDish.get(l.dishId) ?? []), l]);

  for (const m of meals) {
    const setting = settings.find((s) => s.groupId === m.groupId && s.mealType === m.mealType);
    const share = setting?.share ?? DEFAULT_MEAL_SHARES[m.mealType];
    const mealAtt = new Map(att.filter((a) => a.mealInstanceId === m.id).map((a) => [a.userId, a]));

    const planned: PlannedDish[] = mDishes
      .filter((d) => d.mealInstanceId === m.id)
      .map((d) => {
        const ls = linesByDish.get(d.dishId) ?? [];
        const n = dishNutrition(ls, d.baseServings);
        return {
          mealInstanceDishId: d.id,
          dishId: d.dishId,
          isSide: d.isSide,
          baseServings: d.baseServings,
          kcalPerServing: n.kcalPerServing,
          gramsPerServing: n.gramsPerServing,
          lines: ls.map((l) => ({ ingredientId: l.ingredientId, qtyG: l.qtyG })),
        };
      });

    // Qatnashuv belgilanmagan a'zo — standart bo'yicha "yeyman"
    const eaters: Eater[] = members
      .filter((x) => x.groupId === m.groupId && mealAtt.get(x.userId)?.status !== 'not_eating')
      .map((x) => ({
        userId: x.userId,
        dailyKcal: kcalByUser.get(x.userId) ?? computeTarget({}, now).kcal,
        factor: factorMap.get(factorKey(x.userId, m.mealType)) ?? 1,
      }));
    const memberIds = new Set(members.filter((x) => x.groupId === m.groupId).map((x) => x.userId));
    const guests = new Map<string, number>();
    for (const a of mealAtt.values()) if (a.guests > 0 && memberIds.has(a.userId)) guests.set(a.userId, a.guests);

    const portions = computePortions(eaters, guests, share, planned);
    out.set(m.id, {
      mealId: m.id,
      groupId: m.groupId,
      mealType: m.mealType,
      share,
      dishes: planned,
      eaters,
      guests,
      portions,
      servings: totalServingsByDish(portions),
    });
  }
  return out;
}

/** Mahal uchun kerakli masalliqlar (ingredientId → gramm), retseptlar ΣPᵢ ga masshtablangan */
export function mealNeeds(plan: MealPlan): Map<string, number> {
  const need = new Map<string, number>();
  for (const d of plan.dishes) {
    const servings = plan.servings.get(d.dishId) ?? 0;
    if (servings <= 0) continue;
    for (const l of scaleRecipe(d.lines, d.baseServings, servings)) {
      need.set(l.ingredientId, (need.get(l.ingredientId) ?? 0) + l.qtyG);
    }
  }
  return need;
}
