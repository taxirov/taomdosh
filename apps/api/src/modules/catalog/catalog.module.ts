import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
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
import { and, eq, ilike, inArray, isNull, or, sql } from 'drizzle-orm';
import { AuthUser, CurrentUser, requireMember } from '../../common/auth';
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
    return groupIds.length ? or(pub, inArray(dishes.groupId, groupIds)) : pub;
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
    const d = await this.db.query.dishes.findFirst({
      where: and(eq(dishes.id, id), this.visibleDish(groupIds)),
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
          videoUrl: dto.videoUrl,
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
      where: or(and(eq(cookbooks.visibility, 'public'), eq(cookbooks.moderationStatus, 'approved')), eq(cookbooks.authorId, userId)),
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
    const c = await this.db.query.cookbooks.findFirst({
      where: and(
        eq(cookbooks.id, id),
        or(and(eq(cookbooks.visibility, 'public'), eq(cookbooks.moderationStatus, 'approved')), eq(cookbooks.authorId, userId)),
      ),
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
      for (const m of dto.meals) {
        const [cm] = await tx
          .insert(cookbookMeals)
          .values({ cookbookId: c.id, dayIndex: m.dayIndex, mealType: m.mealType, eatTime: m.eatTime })
          .returning();
        await tx.insert(cookbookMealDishes).values([
          ...m.dishIds.map((dishId) => ({ cookbookMealId: cm.id, dishId, isSide: false })),
          ...(m.sideDishIds ?? []).map((dishId) => ({ cookbookMealId: cm.id, dishId, isSide: true })),
        ]);
      }
      return c.id;
    });
    return this.getCookbook(userId, locale, id);
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
}

@Module({ controllers: [CatalogController], providers: [CatalogService], exports: [CatalogService] })
export class CatalogModule {}
