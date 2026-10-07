/**
 * Boshlang'ich ma'lumot: masalliqlar, mahalliy taomlar va tayyor haftalik cookbooklar.
 * `npm run db:seed` — qayta ishga tushirish xavfsiz (slug bo'yicha yangilaydi).
 */
import 'dotenv/config';
import { eq, inArray } from 'drizzle-orm';
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from '../schema';
import {
  cookbookMealDishes,
  cookbookMeals,
  cookbooks,
  cookbookTranslations,
  dishes,
  dishIngredients,
  dishSteps,
  dishStepTranslations,
  dishTranslations,
  ingredients,
  ingredientTranslations,
} from '../schema';
import { dishNutrition } from '../../domain/portions';
import { COOKBOOKS } from './data/cookbooks';
import { DISHES } from './data/dishes';
import { INGREDIENTS } from './data/ingredients';

type Db = NodePgDatabase<typeof schema>;
const LOCALES = ['uz', 'ru', 'en'] as const;

export async function seedIngredients(db: Db): Promise<Map<string, typeof ingredients.$inferSelect>> {
  for (const i of INGREDIENTS) {
    const values = {
      slug: i.slug,
      category: i.category,
      kcal100g: i.kcal,
      protein100g: i.protein,
      fat100g: i.fat,
      carb100g: i.carb,
      pieceWeightG: i.pieceG ?? null,
      density: i.density ?? null,
    };
    const [row] = await db
      .insert(ingredients)
      .values(values)
      .onConflictDoUpdate({ target: ingredients.slug, set: values })
      .returning({ id: ingredients.id });
    for (const l of LOCALES) {
      await db
        .insert(ingredientTranslations)
        .values({ ingredientId: row.id, locale: l, name: i[l] })
        .onConflictDoUpdate({ target: [ingredientTranslations.ingredientId, ingredientTranslations.locale], set: { name: i[l] } });
    }
  }
  const all = await db.select().from(ingredients).where(inArray(ingredients.slug, INGREDIENTS.map((i) => i.slug)));
  return new Map(all.map((i) => [i.slug, i]));
}

/** Bozor/oshxona uchun ko'rinish birligi: tuxum — dona, suyuqlik — ml, qolgani — gramm */
function displayFor(ing: typeof ingredients.$inferSelect, qtyG: number) {
  if (ing.category === 'eggs' && ing.pieceWeightG) return { displayQty: Math.round((qtyG / ing.pieceWeightG) * 10) / 10, displayUnit: 'pcs' as const };
  if (ing.density) return { displayQty: Math.round(qtyG / ing.density), displayUnit: 'ml' as const };
  return { displayQty: qtyG, displayUnit: 'g' as const };
}

export async function seedDishes(db: Db, ingBySlug: Map<string, typeof ingredients.$inferSelect>) {
  const ids = new Map<string, string>();
  for (const d of DISHES) {
    const lines = d.ing.map(([slug, qtyG]) => {
      const ing = ingBySlug.get(slug);
      if (!ing) throw new Error(`${d.slug}: masalliq topilmadi — ${slug}`);
      return { ing, qtyG };
    });
    const n = dishNutrition(lines.map((l) => ({ qtyG: l.qtyG, kcal100g: l.ing.kcal100g })), d.servings);
    const values = {
      slug: d.slug,
      cuisine: 'uzbek',
      visibility: 'public' as const,
      moderationStatus: 'approved' as const,
      activeMin: d.activeMin,
      passiveMin: d.passiveMin ?? 0,
      prepAheadMin: d.prepAheadMin ?? 0,
      baseServings: d.servings,
      kcalPerServing: n.kcalPerServing,
      isSide: d.isSide ?? false,
      mealTypes: d.mealTypes,
    };
    await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(dishes)
        .values(values)
        .onConflictDoUpdate({ target: dishes.slug, set: values })
        .returning({ id: dishes.id });
      ids.set(d.slug, row.id);
      await tx.delete(dishTranslations).where(eq(dishTranslations.dishId, row.id));
      await tx.delete(dishIngredients).where(eq(dishIngredients.dishId, row.id));
      await tx.delete(dishSteps).where(eq(dishSteps.dishId, row.id));
      await tx.insert(dishTranslations).values(
        LOCALES.map((l) => ({ dishId: row.id, locale: l, title: d.title[l], description: d.desc?.[l] ?? null })),
      );
      await tx.insert(dishIngredients).values(
        lines.map((l, position) => ({ dishId: row.id, ingredientId: l.ing.id, qtyG: l.qtyG, position, ...displayFor(l.ing, l.qtyG) })),
      );
      for (const [idx, [uz, ru, en, min]] of d.steps.entries()) {
        const [s] = await tx.insert(dishSteps).values({ dishId: row.id, n: idx + 1, durationMin: min ?? null }).returning();
        await tx.insert(dishStepTranslations).values([
          { stepId: s.id, locale: 'uz', text: uz },
          { stepId: s.id, locale: 'ru', text: ru },
          { stepId: s.id, locale: 'en', text: en },
        ]);
      }
    });
  }
  return ids;
}

export async function seedCookbooks(db: Db, dishIds: Map<string, string>) {
  for (const c of COOKBOOKS) {
    const values = {
      slug: c.slug,
      visibility: 'public' as const,
      moderationStatus: 'approved' as const,
      days: Math.max(...c.meals.map(([d]) => d)) + 1,
    };
    await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(cookbooks)
        .values(values)
        .onConflictDoUpdate({ target: cookbooks.slug, set: values })
        .returning({ id: cookbooks.id });
      await tx.delete(cookbookTranslations).where(eq(cookbookTranslations.cookbookId, row.id));
      await tx.delete(cookbookMeals).where(eq(cookbookMeals.cookbookId, row.id));
      await tx
        .insert(cookbookTranslations)
        .values(LOCALES.map((l) => ({ cookbookId: row.id, locale: l, title: c.title[l], description: c.desc[l] })));
      for (const [dayIndex, mealType, main, sides] of c.meals) {
        const [cm] = await tx.insert(cookbookMeals).values({ cookbookId: row.id, dayIndex, mealType }).returning();
        const dish = (slug: string) => {
          const id = dishIds.get(slug);
          if (!id) throw new Error(`${c.slug}: taom topilmadi — ${slug}`);
          return id;
        };
        await tx.insert(cookbookMealDishes).values([
          ...main.map((s) => ({ cookbookMealId: cm.id, dishId: dish(s), isSide: false })),
          ...(sides ?? []).map((s) => ({ cookbookMealId: cm.id, dishId: dish(s), isSide: true })),
        ]);
      }
    });
  }
}

export async function seed(db: Db) {
  const ing = await seedIngredients(db);
  const dishIds = await seedDishes(db, ing);
  await seedCookbooks(db, dishIds);
  return { ingredients: ing.size, dishes: dishIds.size, cookbooks: COOKBOOKS.length };
}

if (require.main === module) {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  seed(drizzle(pool, { schema }))
    .then((r) => console.log(`Seed tayyor: ${r.ingredients} masalliq, ${r.dishes} taom, ${r.cookbooks} cookbook`))
    .catch((e) => {
      console.error(e);
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}
