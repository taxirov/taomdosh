import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { and, desc, eq, ilike, inArray, isNull, or, sql } from 'drizzle-orm';
import { AuthUser, CurrentUser, isPlatformAdmin, requireAdmin, requireMember } from '../../common/auth';
import { deleteUpload, saveDishImage } from '../../common/uploads';
import { Db, InjectDb } from '../../common/infra.module';
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
  displayUnit,
  favorites,
  groupMembers,
  ingredients,
  ingredientTranslations,
  mealType,
  users,
} from '../../db/schema';
import type { MealType } from '../../db/schema';
import { Locale, normalizeLocale, pickTranslation } from '../../domain/i18n';
import { dishNutrition } from '../../domain/portions';

// ───────────────────── DTO ─────────────────────

class ListQuery {
  @IsOptional() @IsString() q?: string;
  @IsOptional() @IsIn(mealType.enumValues) mealType?: MealType;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) offset?: number;
}

class DishIngredientDto {
  @IsUUID() ingredientId: string;
  @IsInt() @Min(0) @Max(50000) qtyG: number;
  @IsOptional() @IsNumber() displayQty?: number;
  @IsOptional() @IsIn(displayUnit.enumValues) displayUnit?: (typeof displayUnit.enumValues)[number];
}

class CreateDishDto {
  @IsString() @Length(1, 100) title: string;
  @IsOptional() @IsString() @Length(0, 2000) description?: string;
  /** Guruh ichida darhol ishlaydi; ommaga chiqarish moderatsiyadan o'tadi */
  @IsUUID() groupId: string;
  @IsOptional() @IsBoolean() submitPublic?: boolean;
  @IsInt() @Min(1) @Max(600) activeMin: number;
  @IsOptional() @IsInt() @Min(0) @Max(2880) passiveMin?: number;
  @IsOptional() @IsInt() @Min(0) @Max(2880) prepAheadMin?: number;
  @IsInt() @Min(1) @Max(50) baseServings: number;
  @IsOptional() @IsBoolean() isSide?: boolean;
  @IsOptional() @IsArray() @IsIn(mealType.enumValues, { each: true }) mealTypes?: MealType[];
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => DishIngredientDto) ingredients: DishIngredientDto[];
  @IsArray() @IsString({ each: true }) steps: string[];
  @IsOptional() @IsString() imageUrl?: string;
  @IsOptional() @IsString() videoUrl?: string;
}

/** Tahrirlash: faqat yuborilgan maydonlar o'zgaradi; masalliq/bosqichlar yuborilsa — to'liq almashtiriladi */
class UpdateDishDto {
  @IsOptional() @IsString() @Length(1, 100) title?: string;
  @IsOptional() @IsString() @Length(0, 2000) description?: string;
  @IsOptional() @IsBoolean() submitPublic?: boolean;
  @IsOptional() @IsInt() @Min(1) @Max(600) activeMin?: number;
  @IsOptional() @IsInt() @Min(0) @Max(2880) passiveMin?: number;
  @IsOptional() @IsInt() @Min(0) @Max(2880) prepAheadMin?: number;
  @IsOptional() @IsInt() @Min(1) @Max(50) baseServings?: number;
  @IsOptional() @IsBoolean() isSide?: boolean;
  @IsOptional() @IsArray() @IsIn(mealType.enumValues, { each: true }) mealTypes?: MealType[];
  @IsOptional() @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => DishIngredientDto) ingredients?: DishIngredientDto[];
  @IsOptional() @IsArray() @IsString({ each: true }) steps?: string[];
  /** Bo'sh satr — video havolasini olib tashlash */
  @IsOptional() @IsString() @Length(0, 500) videoUrl?: string;
}

class CookbookMealDto {
  @IsInt() @Min(0) @Max(6) dayIndex: number;
  @IsIn(mealType.enumValues) mealType: MealType;
  @IsOptional() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) eatTime?: string;
  @IsArray() @ArrayMinSize(1) @IsUUID('all', { each: true }) dishIds: string[];
  @IsOptional() @IsArray() @IsUUID('all', { each: true }) sideDishIds?: string[];
}

class CreateCookbookDto {
  @IsString() @Length(1, 100) title: string;
  @IsOptional() @IsString() @Length(0, 2000) description?: string;
  @IsOptional() @IsBoolean() submitPublic?: boolean;
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => CookbookMealDto) meals: CookbookMealDto[];
}

class UpdateCookbookDto {
  @IsOptional() @IsString() @Length(1, 100) title?: string;
  @IsOptional() @IsString() @Length(0, 2000) description?: string;
  @IsOptional() @IsBoolean() submitPublic?: boolean;
  @IsOptional() @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => CookbookMealDto) meals?: CookbookMealDto[];
}

/** Faqat http(s) havola (video tashqi ilovada ochiladi) */
function cleanVideoUrl(url: string | undefined): string | null | undefined {
  if (url === undefined) return undefined;
  const v = url.trim();
  if (!v) return null;
  if (!/^https?:\/\/\S+$/i.test(v)) throw new BadRequestException('video_url_invalid');
  return v;
}

// ───────────────────── Service ─────────────────────

@Injectable()
export class CatalogService {
  constructor(@InjectDb() private readonly db: Db) {}

  private async myGroupIds(userId: string): Promise<string[]> {
    const rows = await this.db
      .select({ id: groupMembers.groupId })
      .from(groupMembers)
      .where(and(eq(groupMembers.userId, userId), isNull(groupMembers.leftAt)));
    return rows.map((r) => r.id);
  }

  /** Foydalanuvchi ko'ra oladigan taomlar: tasdiqlangan ommaviy + o'z guruhlari taomlari */
  private visibleDish(groupIds: string[]) {
    const pub = and(eq(dishes.visibility, 'public'), eq(dishes.moderationStatus, 'approved'));
    return and(isNull(dishes.deletedAt), groupIds.length ? or(pub, inArray(dishes.groupId, groupIds)) : pub);
  }

  private visibleCookbook(userId: string) {
    return and(
      isNull(cookbooks.deletedAt),
      or(and(eq(cookbooks.visibility, 'public'), eq(cookbooks.moderationStatus, 'approved')), eq(cookbooks.authorId, userId)),
    );
  }

  private async isAdmin(userId: string) {
    const [u] = await this.db.select({ role: users.role, phone: users.phone }).from(users).where(eq(users.id, userId));
    return isPlatformAdmin(u);
  }

  /** Tahrirlash/o'chirish huquqi: muallif yoki platforma admini */
  private async ownDish(userId: string, id: string) {
    const [d] = await this.db.select().from(dishes).where(and(eq(dishes.id, id), isNull(dishes.deletedAt)));
    if (!d) throw new NotFoundException('dish_not_found');
    if (d.authorId !== userId && !(await this.isAdmin(userId))) throw new ForbiddenException('author_only');
    return d;
  }

  private async ownCookbook(userId: string, id: string) {
    const [c] = await this.db.select().from(cookbooks).where(and(eq(cookbooks.id, id), isNull(cookbooks.deletedAt)));
    if (!c) throw new NotFoundException('cookbook_not_found');
    if (c.authorId !== userId && !(await this.isAdmin(userId))) throw new ForbiddenException('author_only');
    return c;
  }

  async ingredients(locale: Locale, q?: string) {
    const rows = await this.db.query.ingredients.findMany({
      with: { translations: true },
      where: q
        ? inArray(
            ingredients.id,
            this.db
              .select({ id: ingredientTranslations.ingredientId })
              .from(ingredientTranslations)
              .where(ilike(ingredientTranslations.name, `%${q}%`)),
          )
        : undefined,
      limit: 500,
    });
    return rows
      .map(({ translations, ...i }) => ({ ...i, name: pickTranslation(translations, locale, ['name'])?.name ?? i.slug }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async listDishes(userId: string, locale: Locale, q: ListQuery) {
    const groupIds = await this.myGroupIds(userId);
    const conds = [this.visibleDish(groupIds)];
    if (q.mealType) conds.push(sql`${q.mealType}::meal_type = ANY(${dishes.mealTypes})`);
    if (q.q) {
      conds.push(
        inArray(
          dishes.id,
          this.db.select({ id: dishTranslations.dishId }).from(dishTranslations).where(ilike(dishTranslations.title, `%${q.q}%`)),
        ),
      );
    }
    const rows = await this.db.query.dishes.findMany({
      where: and(...conds),
      with: { translations: true },
      limit: q.limit ?? 50,
      offset: q.offset ?? 0,
      orderBy: (d, { desc }) => [desc(d.favoritesCount), d.id],
    });
    const favs = new Set(
      (await this.db.select({ id: favorites.dishId }).from(favorites).where(eq(favorites.userId, userId))).map((f) => f.id),
    );
    return rows.map(({ translations, ...d }) => ({
      ...d,
      ...this.dishText(translations, locale),
      isFavorite: favs.has(d.id),
    }));
  }

  private dishText(rows: { locale: string; title: string; description: string | null }[], locale: Locale) {
    const t = pickTranslation(rows, locale, ['title', 'description']);
    return { title: t?.title ?? '', description: t?.description ?? null };
  }

  async getDish(userId: string, locale: Locale, id: string) {
    const groupIds = await this.myGroupIds(userId);
    // Admin moderatsiya uchun istalgan (o'chirilmagan) taomni ko'ra oladi
    const admin = await this.isAdmin(userId);
    const d = await this.db.query.dishes.findFirst({
      where: admin ? and(eq(dishes.id, id), isNull(dishes.deletedAt)) : and(eq(dishes.id, id), this.visibleDish(groupIds)),
      with: {
        translations: true,
        ingredients: { with: { ingredient: { with: { translations: true } } }, orderBy: (x, { asc }) => [asc(x.position)] },
        steps: { with: { translations: true }, orderBy: (x, { asc }) => [asc(x.n)] },
      },
    });
    if (!d) throw new NotFoundException('dish_not_found');
    const { translations, ingredients: ings, steps, ...rest } = d;
    const [fav] = await this.db
      .select()
      .from(favorites)
      .where(and(eq(favorites.userId, userId), eq(favorites.dishId, id)));
    return {
      ...rest,
      ...this.dishText(translations, locale),
      isFavorite: !!fav,
      canEdit: rest.authorId === userId || admin,
      ingredients: ings.map((i) => ({
        ingredientId: i.ingredientId,
        name: pickTranslation(i.ingredient.translations, locale, ['name'])?.name ?? i.ingredient.slug,
        qtyG: i.qtyG,
        displayQty: i.displayQty,
        displayUnit: i.displayUnit,
      })),
      steps: steps.map((s) => ({ n: s.n, durationMin: s.durationMin, text: pickTranslation(s.translations, locale, ['text'])?.text ?? '' })),
    };
  }

  async createDish(userId: string, locale: Locale, dto: CreateDishDto) {
    await requireMember(this.db, dto.groupId, userId);
    const ingIds = dto.ingredients.map((i) => i.ingredientId);
    const ingRows = await this.db.select().from(ingredients).where(inArray(ingredients.id, ingIds));
    if (ingRows.length !== new Set(ingIds).size) throw new BadRequestException('ingredient_not_found');
    const kcalById = new Map(ingRows.map((i) => [i.id, i.kcal100g]));
    const nutrition = dishNutrition(
      dto.ingredients.map((i) => ({ qtyG: i.qtyG, kcal100g: kcalById.get(i.ingredientId)! })),
      dto.baseServings,
    );
    const textLocale = locale === 'uz-Cyrl' ? 'uz-Cyrl' : locale;
    const dishId = await this.db.transaction(async (tx) => {
      const [d] = await tx
        .insert(dishes)
        .values({
          authorId: userId,
          // Shaxsiy taom guruhda darhol ishlaydi, ommaga chiqish — moderatsiyadan keyin
          visibility: 'group',
          groupId: dto.groupId,
          moderationStatus: dto.submitPublic ? 'pending' : 'approved',
          activeMin: dto.activeMin,
          passiveMin: dto.passiveMin ?? 0,
          prepAheadMin: dto.prepAheadMin ?? 0,
          baseServings: dto.baseServings,
          kcalPerServing: nutrition.kcalPerServing,
          isSide: dto.isSide ?? false,
          mealTypes: dto.mealTypes ?? [],
          imageUrl: dto.imageUrl,
          videoUrl: cleanVideoUrl(dto.videoUrl),
        })
        .returning();
      await tx.insert(dishTranslations).values({ dishId: d.id, locale: textLocale, title: dto.title, description: dto.description });
      await tx.insert(dishIngredients).values(dto.ingredients.map((i, position) => ({ ...i, dishId: d.id, position })));
      for (const [idx, text] of dto.steps.entries()) {
        const [s] = await tx.insert(dishSteps).values({ dishId: d.id, n: idx + 1 }).returning();
        await tx.insert(dishStepTranslations).values({ stepId: s.id, locale: textLocale, text });
      }
      return d.id;
    });
    return this.getDish(userId, locale, dishId);
  }

  /** Taomni tahrirlash (muallif yoki admin). Ommaviy taom o'zgarsa — qayta moderatsiyaga tushadi. */
  async updateDish(userId: string, locale: Locale, id: string, dto: UpdateDishDto) {
    const d = await this.ownDish(userId, id);
    const patch: Partial<typeof dishes.$inferInsert> = {};
    for (const k of ['activeMin', 'passiveMin', 'prepAheadMin', 'baseServings', 'isSide', 'mealTypes'] as const) {
      if (dto[k] !== undefined) (patch as Record<string, unknown>)[k] = dto[k];
    }
    const video = cleanVideoUrl(dto.videoUrl);
    if (video !== undefined) patch.videoUrl = video;
    if (dto.ingredients) {
      const ingIds = dto.ingredients.map((i) => i.ingredientId);
      const ingRows = await this.db.select().from(ingredients).where(inArray(ingredients.id, ingIds));
      if (ingRows.length !== new Set(ingIds).size) throw new BadRequestException('ingredient_not_found');
    }
    // Ommaga chiqarish holati
    if (dto.submitPublic === true && !(d.visibility === 'public' && d.moderationStatus === 'approved')) patch.moderationStatus = 'pending';
    if (dto.submitPublic === false) {
      patch.visibility = d.groupId ? 'group' : 'private';
      patch.moderationStatus = 'approved';
    }
    const contentChanged = !!(dto.title || dto.description !== undefined || dto.ingredients || dto.steps || video !== undefined);
    // Muallif o'zgartirsa — qayta moderatsiya; platforma admini tahriri (muallif bo'lmasa) holatni o'zgartirmaydi
    const byAdmin = d.authorId !== userId;
    if (d.visibility === 'public' && d.authorId && contentChanged && dto.submitPublic !== false && !byAdmin) patch.moderationStatus = 'pending';

    await this.db.transaction(async (tx) => {
      if (dto.ingredients) {
        await tx.delete(dishIngredients).where(eq(dishIngredients.dishId, id));
        await tx.insert(dishIngredients).values(dto.ingredients.map((i, position) => ({ ...i, dishId: id, position })));
      }
      if (dto.ingredients || dto.baseServings) {
        const lines = await tx
          .select({ qtyG: dishIngredients.qtyG, kcal100g: ingredients.kcal100g })
          .from(dishIngredients)
          .innerJoin(ingredients, eq(ingredients.id, dishIngredients.ingredientId))
          .where(eq(dishIngredients.dishId, id));
        patch.kcalPerServing = dishNutrition(lines, dto.baseServings ?? d.baseServings).kcalPerServing;
      }
      if (dto.steps) {
        await tx.delete(dishSteps).where(eq(dishSteps.dishId, id));
        for (const [idx, text] of dto.steps.entries()) {
          const [s] = await tx.insert(dishSteps).values({ dishId: id, n: idx + 1 }).returning();
          await tx.insert(dishStepTranslations).values({ stepId: s.id, locale, text });
        }
      }
      if (dto.title || dto.description !== undefined) {
        const rows = await tx.select().from(dishTranslations).where(eq(dishTranslations.dishId, id));
        // Muallif yozgan tildagi matn yangilanadi (bitta tarjima bo'lsa — o'sha)
        const row = rows.find((r) => r.locale === locale) ?? (rows.length === 1 ? rows[0] : undefined);
        const values = {
          dishId: id,
          locale: row?.locale ?? locale,
          title: dto.title ?? row?.title ?? '',
          description: dto.description !== undefined ? dto.description : (row?.description ?? null),
        };
        await tx
          .insert(dishTranslations)
          .values(values)
          .onConflictDoUpdate({ target: [dishTranslations.dishId, dishTranslations.locale], set: values });
      }
      if (Object.keys(patch).length) await tx.update(dishes).set(patch).where(eq(dishes.id, id));
    });
    return this.getDish(userId, locale, id);
  }

  /** O'chirish: katalog va qidiruvdan yo'qoladi; avval rejalashtirilgan mahallar va tarix buzilmaydi */
  async deleteDish(userId: string, id: string) {
    await this.ownDish(userId, id);
    await this.db.update(dishes).set({ deletedAt: new Date() }).where(eq(dishes.id, id));
    await this.db.delete(favorites).where(eq(favorites.dishId, id));
    return { ok: true };
  }

  /** Taom rasmi: siqib (1280 px, JPEG) diskka saqlanadi; eski fayl o'chiriladi */
  async setDishImage(userId: string, locale: Locale, id: string, file: Buffer | undefined) {
    const d = await this.ownDish(userId, id);
    if (!file?.length) throw new BadRequestException('file_required');
    const imageUrl = await saveDishImage(id, file);
    await this.db.update(dishes).set({ imageUrl }).where(eq(dishes.id, id));
    await deleteUpload(d.imageUrl);
    return this.getDish(userId, locale, id);
  }

  async deleteDishImage(userId: string, locale: Locale, id: string) {
    const d = await this.ownDish(userId, id);
    await this.db.update(dishes).set({ imageUrl: null }).where(eq(dishes.id, id));
    await deleteUpload(d.imageUrl);
    return this.getDish(userId, locale, id);
  }

  async setFavorite(userId: string, dishId: string, on: boolean) {
    await this.db.transaction(async (tx) => {
      if (on) {
        const ins = await tx.insert(favorites).values({ userId, dishId }).onConflictDoNothing().returning();
        if (ins.length) await tx.update(dishes).set({ favoritesCount: sql`${dishes.favoritesCount} + 1` }).where(eq(dishes.id, dishId));
      } else {
        const del = await tx.delete(favorites).where(and(eq(favorites.userId, userId), eq(favorites.dishId, dishId))).returning();
        if (del.length) await tx.update(dishes).set({ favoritesCount: sql`greatest(${dishes.favoritesCount} - 1, 0)` }).where(eq(dishes.id, dishId));
      }
    });
    return { isFavorite: on };
  }

  async listCookbooks(userId: string, locale: Locale) {
    const rows = await this.db.query.cookbooks.findMany({
      where: this.visibleCookbook(userId),
      with: { translations: true, meals: { columns: { id: true } } },
      limit: 100,
    });
    return rows.map(({ translations, meals, ...c }) => ({
      ...c,
      ...this.dishText(translations, locale),
      mealsCount: meals.length,
    }));
  }

  async getCookbook(userId: string, locale: Locale, id: string) {
    const admin = await this.isAdmin(userId);
    const c = await this.db.query.cookbooks.findFirst({
      where: admin ? and(eq(cookbooks.id, id), isNull(cookbooks.deletedAt)) : and(eq(cookbooks.id, id), this.visibleCookbook(userId)),
      with: {
        translations: true,
        meals: { with: { dishes: { with: { dish: { with: { translations: true } } } } } },
      },
    });
    if (!c) throw new NotFoundException('cookbook_not_found');
    const { translations, meals, ...rest } = c;
    const order: MealType[] = ['breakfast', 'lunch', 'snack', 'dinner'];
    return {
      ...rest,
      ...this.dishText(translations, locale),
      canEdit: rest.authorId === userId || admin,
      meals: meals
        .sort((a, b) => a.dayIndex - b.dayIndex || order.indexOf(a.mealType) - order.indexOf(b.mealType))
        .map((m) => ({
          dayIndex: m.dayIndex,
          mealType: m.mealType,
          eatTime: m.eatTime,
          dishes: m.dishes.map((x) => ({
            dishId: x.dishId,
            isSide: x.isSide,
            title: this.dishText(x.dish.translations, locale).title,
            kcalPerServing: x.dish.kcalPerServing,
            imageUrl: x.dish.imageUrl,
          })),
        })),
    };
  }

  async createCookbook(userId: string, locale: Locale, dto: CreateCookbookDto) {
    const allIds = dto.meals.flatMap((m) => [...m.dishIds, ...(m.sideDishIds ?? [])]);
    const groupIds = await this.myGroupIds(userId);
    const found = await this.db
      .select({ id: dishes.id })
      .from(dishes)
      .where(and(inArray(dishes.id, allIds), this.visibleDish(groupIds)));
    if (found.length !== new Set(allIds).size) throw new BadRequestException('dish_not_found');
    const id = await this.db.transaction(async (tx) => {
      const [c] = await tx
        .insert(cookbooks)
        .values({
          authorId: userId,
          visibility: dto.submitPublic ? 'public' : 'private',
          moderationStatus: dto.submitPublic ? 'pending' : 'approved',
          days: Math.max(...dto.meals.map((m) => m.dayIndex)) + 1,
        })
        .returning();
      await tx.insert(cookbookTranslations).values({ cookbookId: c.id, locale, title: dto.title, description: dto.description });
      await this.insertCookbookMeals(tx, c.id, dto.meals);
      return c.id;
    });
    return this.getCookbook(userId, locale, id);
  }

  private async insertCookbookMeals(tx: Pick<Db, 'insert'>, cookbookId: string, meals: CookbookMealDto[]) {
    for (const m of meals) {
      const [cm] = await tx
        .insert(cookbookMeals)
        .values({ cookbookId, dayIndex: m.dayIndex, mealType: m.mealType, eatTime: m.eatTime })
        .returning();
      await tx.insert(cookbookMealDishes).values([
        ...m.dishIds.map((dishId) => ({ cookbookMealId: cm.id, dishId, isSide: false })),
        ...(m.sideDishIds ?? []).map((dishId) => ({ cookbookMealId: cm.id, dishId, isSide: true })),
      ]);
    }
  }

  /** Cookbookni tahrirlash (muallif yoki admin). Qo'llangan rejalar o'zgarmaydi — ular mahallarga ko'chirilgan. */
  async updateCookbook(userId: string, locale: Locale, id: string, dto: UpdateCookbookDto) {
    const c = await this.ownCookbook(userId, id);
    if (dto.meals) {
      const allIds = dto.meals.flatMap((m) => [...m.dishIds, ...(m.sideDishIds ?? [])]);
      const groupIds = await this.myGroupIds(userId);
      const found = await this.db
        .select({ id: dishes.id })
        .from(dishes)
        .where(and(inArray(dishes.id, allIds), this.visibleDish(groupIds)));
      if (found.length !== new Set(allIds).size) throw new BadRequestException('dish_not_found');
      const keys = dto.meals.map((m) => `${m.dayIndex}:${m.mealType}`);
      if (new Set(keys).size !== keys.length) throw new BadRequestException('meal_duplicate');
    }
    const patch: Partial<typeof cookbooks.$inferInsert> = {};
    if (dto.meals) patch.days = Math.max(...dto.meals.map((m) => m.dayIndex)) + 1;
    if (dto.submitPublic === true) {
      patch.visibility = 'public';
      if (c.moderationStatus !== 'approved' || c.visibility !== 'public') patch.moderationStatus = 'pending';
    }
    if (dto.submitPublic === false) {
      patch.visibility = 'private';
      patch.moderationStatus = 'approved';
    }
    const contentChanged = !!(dto.title || dto.description !== undefined || dto.meals);
    if (c.visibility === 'public' && c.authorId && contentChanged && dto.submitPublic !== false) patch.moderationStatus = 'pending';
    await this.db.transaction(async (tx) => {
      if (dto.meals) {
        await tx.delete(cookbookMeals).where(eq(cookbookMeals.cookbookId, id));
        await this.insertCookbookMeals(tx, id, dto.meals);
      }
      if (dto.title || dto.description !== undefined) {
        const rows = await tx.select().from(cookbookTranslations).where(eq(cookbookTranslations.cookbookId, id));
        const row = rows.find((r) => r.locale === locale) ?? (rows.length === 1 ? rows[0] : undefined);
        const values = {
          cookbookId: id,
          locale: row?.locale ?? locale,
          title: dto.title ?? row?.title ?? '',
          description: dto.description !== undefined ? dto.description : (row?.description ?? null),
        };
        await tx
          .insert(cookbookTranslations)
          .values(values)
          .onConflictDoUpdate({ target: [cookbookTranslations.cookbookId, cookbookTranslations.locale], set: values });
      }
      if (Object.keys(patch).length) await tx.update(cookbooks).set(patch).where(eq(cookbooks.id, id));
    });
    return this.getCookbook(userId, locale, id);
  }

  async deleteCookbook(userId: string, id: string) {
    await this.ownCookbook(userId, id);
    await this.db.update(cookbooks).set({ deletedAt: new Date() }).where(eq(cookbooks.id, id));
    return { ok: true };
  }

  // ─────────── moderatsiya (platforma admini) ───────────

  /** Ommaga chiqarish so'ralgan, hali ko'rib chiqilmagan taom va cookbooklar */
  async pendingModeration(userId: string, locale: Locale) {
    await requireAdmin(this.db, userId);
    const dishRows = await this.db.query.dishes.findMany({
      where: and(eq(dishes.moderationStatus, 'pending'), isNull(dishes.deletedAt)),
      with: { translations: true, ingredients: { columns: { ingredientId: true } }, steps: { columns: { id: true } } },
      orderBy: [desc(dishes.updatedAt)],
      limit: 100,
    });
    const cbRows = await this.db.query.cookbooks.findMany({
      where: and(eq(cookbooks.moderationStatus, 'pending'), isNull(cookbooks.deletedAt)),
      with: { translations: true, meals: { columns: { id: true } } },
      orderBy: [desc(cookbooks.updatedAt)],
      limit: 100,
    });
    const authorIds = [...new Set([...dishRows, ...cbRows].map((r) => r.authorId).filter((x): x is string => !!x))];
    const authors = authorIds.length
      ? await this.db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, authorIds))
      : [];
    const nameOf = (id: string | null) => authors.find((a) => a.id === id)?.name ?? null;
    return {
      dishes: dishRows.map((d) => ({
        id: d.id,
        ...this.dishText(d.translations, locale),
        authorName: nameOf(d.authorId),
        imageUrl: d.imageUrl,
        kcalPerServing: d.kcalPerServing,
        ingredientsCount: d.ingredients.length,
        stepsCount: d.steps.length,
        updatedAt: d.updatedAt,
      })),
      cookbooks: cbRows.map((c) => ({
        id: c.id,
        ...this.dishText(c.translations, locale),
        authorName: nameOf(c.authorId),
        days: c.days,
        mealsCount: c.meals.length,
        updatedAt: c.updatedAt,
      })),
    };
  }

  /** Tasdiqlash — ommaga ko'rinadi; rad etish — muallif (va guruhi) uchun qoladi */
  async moderate(userId: string, kind: 'dishes' | 'cookbooks', id: string, approve: boolean) {
    await requireAdmin(this.db, userId);
    if (kind === 'dishes') {
      const [d] = await this.db.select().from(dishes).where(and(eq(dishes.id, id), isNull(dishes.deletedAt)));
      if (!d) throw new NotFoundException('dish_not_found');
      if (d.moderationStatus !== 'pending') throw new BadRequestException('not_pending');
      await this.db
        .update(dishes)
        .set(approve ? { moderationStatus: 'approved', visibility: 'public' } : { moderationStatus: 'rejected', visibility: d.groupId ? 'group' : 'private' })
        .where(eq(dishes.id, id));
    } else {
      const [c] = await this.db.select().from(cookbooks).where(and(eq(cookbooks.id, id), isNull(cookbooks.deletedAt)));
      if (!c) throw new NotFoundException('cookbook_not_found');
      if (c.moderationStatus !== 'pending') throw new BadRequestException('not_pending');
      await this.db
        .update(cookbooks)
        .set(approve ? { moderationStatus: 'approved', visibility: 'public' } : { moderationStatus: 'rejected', visibility: 'private' })
        .where(eq(cookbooks.id, id));
    }
    return { id, status: approve ? 'approved' : 'rejected' };
  }
}

// ───────────────────── Controller ─────────────────────

@ApiTags('catalog')
@ApiBearerAuth()
@Controller()
export class CatalogController {
  constructor(private readonly svc: CatalogService) {}

  @Get('ingredients')
  ingredients(@CurrentUser() u: AuthUser, @Query('q') q?: string) {
    return this.svc.ingredients(normalizeLocale(u.locale), q);
  }

  @Get('dishes')
  dishes(@CurrentUser() u: AuthUser, @Query() q: ListQuery) {
    return this.svc.listDishes(u.id, normalizeLocale(u.locale), q);
  }

  @Get('dishes/:id')
  dish(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.getDish(u.id, normalizeLocale(u.locale), id);
  }

  @Post('dishes')
  createDish(@CurrentUser() u: AuthUser, @Body() dto: CreateDishDto) {
    return this.svc.createDish(u.id, normalizeLocale(u.locale), dto);
  }

  /** Tahrirlash — faqat muallif (yoki platforma admini) */
  @Patch('dishes/:id')
  updateDish(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateDishDto) {
    return this.svc.updateDish(u.id, normalizeLocale(u.locale), id, dto);
  }

  @Delete('dishes/:id')
  deleteDish(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.deleteDish(u.id, id);
  }

  /** Rasm yuklash (multipart, `file` maydoni, 10 MB gacha) — serverda 1280 px JPEG ga siqiladi */
  @Post('dishes/:id/image')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  dishImage(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @UploadedFile() file?: { buffer: Buffer }) {
    return this.svc.setDishImage(u.id, normalizeLocale(u.locale), id, file?.buffer);
  }

  @Delete('dishes/:id/image')
  deleteDishImage(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.deleteDishImage(u.id, normalizeLocale(u.locale), id);
  }

  @Post('dishes/:id/favorite')
  fav(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.setFavorite(u.id, id, true);
  }

  @Delete('dishes/:id/favorite')
  unfav(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.setFavorite(u.id, id, false);
  }

  @Get('cookbooks')
  cookbooks(@CurrentUser() u: AuthUser) {
    return this.svc.listCookbooks(u.id, normalizeLocale(u.locale));
  }

  @Get('cookbooks/:id')
  cookbook(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.getCookbook(u.id, normalizeLocale(u.locale), id);
  }

  @Post('cookbooks')
  createCookbook(@CurrentUser() u: AuthUser, @Body() dto: CreateCookbookDto) {
    return this.svc.createCookbook(u.id, normalizeLocale(u.locale), dto);
  }

  @Patch('cookbooks/:id')
  updateCookbook(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCookbookDto) {
    return this.svc.updateCookbook(u.id, normalizeLocale(u.locale), id, dto);
  }

  @Delete('cookbooks/:id')
  deleteCookbook(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.deleteCookbook(u.id, id);
  }
}

@ApiTags('moderation')
@ApiBearerAuth()
@Controller('admin/moderation')
export class ModerationController {
  constructor(private readonly svc: CatalogService) {}

  /** Kutilayotganlar ro'yxati (faqat platforma admini) */
  @Get()
  pending(@CurrentUser() u: AuthUser) {
    return this.svc.pendingModeration(u.id, normalizeLocale(u.locale));
  }

  @Post(':kind/:id/approve')
  approve(@CurrentUser() u: AuthUser, @Param('kind') kind: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.moderate(u.id, parseKind(kind), id, true);
  }

  @Post(':kind/:id/reject')
  reject(@CurrentUser() u: AuthUser, @Param('kind') kind: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.moderate(u.id, parseKind(kind), id, false);
  }
}

function parseKind(kind: string): 'dishes' | 'cookbooks' {
  if (kind !== 'dishes' && kind !== 'cookbooks') throw new NotFoundException('kind_not_found');
  return kind;
}

@Module({ controllers: [CatalogController, ModerationController], providers: [CatalogService], exports: [CatalogService] })
export class CatalogModule {}
