/**
 * Platforma admin paneli uchun API (`/v1/admin/...`). Har bir amal `requireAdmin` bilan himoyalangan.
 * Moderatsiya (`/admin/moderation`) va narx import/sinxronlash (`/admin/prices/import|sync`) o'z modullarida qoladi.
 */
import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsNumber, IsObject, IsOptional, IsString, Length, Matches, Max, Min, ValidateNested } from 'class-validator';
import { and, count, desc, eq, gte, ilike, inArray, isNotNull, isNull, or, SQL, sql } from 'drizzle-orm';
import { AuthUser, CurrentUser, isPlatformAdmin, requireAdmin } from '../../common/auth';
import { Db, InjectDb } from '../../common/infra.module';
import {
  cookbooks,
  cookbookTranslations,
  dishes,
  dishIngredients,
  dishTranslations,
  groupMembers,
  groupPlans,
  groups,
  ingredientCategory,
  ingredientPriceLinks,
  ingredients,
  ingredientTranslations,
  mealInstances,
  moderationStatus,
  priceSnapshots,
  priceSyncRuns,
  refreshTokens,
  userRole,
  users,
} from '../../db/schema';
import { dishNutrition } from '../../domain/portions';

// ───────────────────── DTO ─────────────────────

class PageQuery {
  @IsOptional() @IsString() @Length(0, 100) q?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) limit?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) offset?: number;
}

class UsersQuery extends PageQuery {
  @IsOptional() @IsIn(['active', 'blocked', 'deleted']) status?: 'active' | 'blocked' | 'deleted';
  @IsOptional() @IsIn(userRole.enumValues) role?: 'user' | 'admin';
}

class ContentQuery extends PageQuery {
  @IsOptional() @IsIn(moderationStatus.enumValues) status?: 'pending' | 'approved' | 'rejected';
  @IsOptional() @IsIn(['public', 'group', 'private']) visibility?: 'public' | 'group' | 'private';
  @IsOptional() @IsIn(['yes', 'no', 'all']) deleted?: 'yes' | 'no' | 'all';
}

class IngredientsQuery extends PageQuery {
  @IsOptional() @IsIn(ingredientCategory.enumValues) category?: (typeof ingredientCategory.enumValues)[number];
  @IsOptional() @IsIn(['yes', 'no']) linked?: 'yes' | 'no';
}

class UpdateUserDto {
  @IsOptional() @IsIn(userRole.enumValues) role?: 'user' | 'admin';
  @IsOptional() @IsIn(['active', 'blocked']) status?: 'active' | 'blocked';
}

class SetModerationDto {
  @IsIn(moderationStatus.enumValues) status: 'pending' | 'approved' | 'rejected';
}

class NamesDto {
  @IsOptional() @IsString() @Length(1, 80) uz?: string;
  @IsOptional() @IsString() @Length(1, 80) ru?: string;
  @IsOptional() @IsString() @Length(1, 80) en?: string;
}

class IngredientDto {
  @IsOptional() @Matches(/^[a-z0-9][a-z0-9_-]{1,59}$/) slug?: string;
  @IsOptional() @IsIn(ingredientCategory.enumValues) category?: (typeof ingredientCategory.enumValues)[number];
  @IsOptional() @IsNumber() @Min(0) @Max(950) kcal100g?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(100) protein100g?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(100) fat100g?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(100) carb100g?: number;
  @IsOptional() @IsInt() @Min(1) @Max(5000) pieceWeightG?: number | null;
  @IsOptional() @IsNumber() @Min(0.1) @Max(5) density?: number | null;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => NamesDto) names?: NamesDto;
}

class PriceLinkDto {
  @IsOptional() @IsInt() @Min(1) productId?: number | null;
}

// ───────────────────── Yordamchilar ─────────────────────

const LOCALE_ORDER = ['uz', 'ru', 'en'];
/** Admin panel o'zbekcha: avval uz, keyin ru, en */
function pick<T extends { locale: string }>(rows: T[]): T | undefined {
  for (const l of LOCALE_ORDER) {
    const r = rows.find((x) => x.locale === l);
    if (r) return r;
  }
  return rows[0];
}
const page = (q: PageQuery) => ({ limit: q.limit ?? 50, offset: q.offset ?? 0 });
const like = (q?: string) => (q?.trim() ? `%${q.trim().replace(/[%_\\]/g, (c) => '\\' + c)}%` : null);
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);

// ───────────────────── Service ─────────────────────

@Injectable()
export class AdminService {
  constructor(@InjectDb() private readonly db: Db) {}

  // ─────────── umumiy ko'rsatkichlar ───────────

  async stats() {
    const one = async (q: Promise<{ n: number }[]>) => Number((await q)[0]?.n ?? 0);
    const c = () => count().as('n');
    const [usersTotal, usersActive, usersBlocked, usersNew, admins, groupsTotal, groupsNew] = await Promise.all([
      one(this.db.select({ n: c() }).from(users).where(sql`${users.status} <> 'deleted'`)),
      one(this.db.select({ n: c() }).from(users).where(eq(users.status, 'active'))),
      one(this.db.select({ n: c() }).from(users).where(eq(users.status, 'blocked'))),
      one(this.db.select({ n: c() }).from(users).where(and(gte(users.createdAt, daysAgo(7)), sql`${users.status} <> 'deleted'`))),
      one(this.db.select({ n: c() }).from(users).where(eq(users.role, 'admin'))),
      one(this.db.select({ n: c() }).from(groups)),
      one(this.db.select({ n: c() }).from(groups).where(gte(groups.createdAt, daysAgo(7)))),
    ]);
    const live = isNull(dishes.deletedAt);
    const [dishesTotal, dishesPublic, dishesPending, cbTotal, cbPending, ingTotal, ingLinked, plansActive, meals7] = await Promise.all([
      one(this.db.select({ n: c() }).from(dishes).where(live)),
      one(this.db.select({ n: c() }).from(dishes).where(and(live, eq(dishes.visibility, 'public'), eq(dishes.moderationStatus, 'approved')))),
      one(this.db.select({ n: c() }).from(dishes).where(and(live, eq(dishes.moderationStatus, 'pending')))),
      one(this.db.select({ n: c() }).from(cookbooks).where(isNull(cookbooks.deletedAt))),
      one(this.db.select({ n: c() }).from(cookbooks).where(and(isNull(cookbooks.deletedAt), eq(cookbooks.moderationStatus, 'pending')))),
      one(this.db.select({ n: c() }).from(ingredients)),
      one(this.db.select({ n: c() }).from(ingredientPriceLinks)),
      one(this.db.select({ n: c() }).from(groupPlans).where(eq(groupPlans.status, 'active'))),
      one(this.db.select({ n: c() }).from(mealInstances).where(gte(mealInstances.eatAt, daysAgo(7)))),
    ]);
    const [lastRun] = await this.db.select().from(priceSyncRuns).orderBy(desc(priceSyncRuns.date)).limit(1);
    const [latest] = await this.db.select({ date: priceSnapshots.date }).from(priceSnapshots).orderBy(desc(priceSnapshots.date)).limit(1);
    // So'nggi 14 kunda ro'yxatdan o'tganlar (grafik uchun)
    const signups = await this.db.execute<{ d: string; n: number }>(sql`
      select to_char(date_trunc('day', created_at at time zone 'Asia/Tashkent'), 'YYYY-MM-DD') as d, count(*)::int as n
      from users where created_at >= now() - interval '14 days' and status <> 'deleted'
      group by 1 order by 1`);
    return {
      users: { total: usersTotal, active: usersActive, blocked: usersBlocked, new7d: usersNew, admins },
      groups: { total: groupsTotal, new7d: groupsNew, activePlans: plansActive },
      catalog: { dishes: dishesTotal, publicDishes: dishesPublic, pendingDishes: dishesPending, cookbooks: cbTotal, pendingCookbooks: cbPending },
      ingredients: { total: ingTotal, linked: ingLinked },
      meals7d: meals7,
      prices: {
        latestDate: latest?.date ?? null,
        lastRun: lastRun ? { date: lastRun.date, status: lastRun.status, attempts: lastRun.attempts, error: lastRun.error, source: lastRun.source } : null,
        syncEnabled: (process.env.PRICES_SYNC_ENABLED ?? 'off') === 'on',
      },
      signups: (signups.rows ?? signups).map((r: { d: string; n: number }) => ({ date: r.d, count: Number(r.n) })),
    };
  }

  // ─────────── foydalanuvchilar ───────────

  async users(q: UsersQuery) {
    const { limit, offset } = page(q);
    const conds: SQL[] = [];
    const s = like(q.q);
    if (s) conds.push(or(ilike(users.name, s), ilike(users.phone, s))!);
    if (q.status) conds.push(eq(users.status, q.status));
    else conds.push(sql`${users.status} <> 'deleted'`);
    if (q.role) conds.push(eq(users.role, q.role));
    const where = and(...conds);
    const [rows, [{ n }]] = await Promise.all([
      this.db
        .select({
          id: users.id,
          name: users.name,
          phone: users.phone,
          role: users.role,
          status: users.status,
          locale: users.locale,
          managedBy: users.managedBy,
          createdAt: users.createdAt,
          groupsCount: sql<number>`(select count(*)::int from ${groupMembers} gm where gm.user_id = "users"."id" and gm.left_at is null)`,
        })
        .from(users)
        .where(where)
        .orderBy(desc(users.createdAt))
        .limit(limit)
        .offset(offset),
      this.db.select({ n: count() }).from(users).where(where),
    ]);
    return { total: Number(n), items: rows.map((r) => ({ ...r, isAdmin: isPlatformAdmin(r), envAdmin: r.role !== 'admin' && isPlatformAdmin(r) })) };
  }

  async user(id: string) {
    const u = await this.db.query.users.findFirst({ where: eq(users.id, id) });
    if (!u) throw new NotFoundException('user_not_found');
    const memberships = await this.db
      .select({ id: groups.id, name: groups.name, type: groups.type, role: groupMembers.role, joinedAt: groupMembers.joinedAt, leftAt: groupMembers.leftAt })
      .from(groupMembers)
      .innerJoin(groups, eq(groups.id, groupMembers.groupId))
      .where(eq(groupMembers.userId, id))
      .orderBy(desc(groupMembers.joinedAt));
    const [{ n: dishesCount }] = await this.db.select({ n: count() }).from(dishes).where(and(eq(dishes.authorId, id), isNull(dishes.deletedAt)));
    const [{ n: sessions }] = await this.db
      .select({ n: count() })
      .from(refreshTokens)
      .where(and(eq(refreshTokens.userId, id), isNull(refreshTokens.revokedAt), gte(refreshTokens.expiresAt, new Date())));
    // Sog'liq ma'lumotlari (vazn, maqsad) admin panelga chiqarilmaydi
    return {
      id: u.id,
      name: u.name,
      phone: u.phone,
      role: u.role,
      status: u.status,
      locale: u.locale,
      managedBy: u.managedBy,
      createdAt: u.createdAt,
      isAdmin: isPlatformAdmin(u),
      envAdmin: u.role !== 'admin' && isPlatformAdmin(u),
      groups: memberships,
      dishesCount: Number(dishesCount),
      activeSessions: Number(sessions),
    };
  }

  async updateUser(adminId: string, id: string, dto: UpdateUserDto) {
    if (id === adminId) throw new ForbiddenException('cannot_change_self');
    const [u] = await this.db.select().from(users).where(eq(users.id, id));
    if (!u) throw new NotFoundException('user_not_found');
    if (u.status === 'deleted') throw new BadRequestException('user_deleted');
    const patch: Partial<typeof users.$inferInsert> = {};
    if (dto.role) patch.role = dto.role;
    if (dto.status) patch.status = dto.status;
    if (!Object.keys(patch).length) return this.user(id);
    await this.db.transaction(async (tx) => {
      await tx.update(users).set(patch).where(eq(users.id, id));
      // Bloklanganda barcha sessiyalar bekor qilinadi: refresh ishlamaydi, access token ko'pi bilan 15 daqiqada tugaydi
      if (dto.status === 'blocked') {
        await tx.update(refreshTokens).set({ revokedAt: new Date() }).where(and(eq(refreshTokens.userId, id), isNull(refreshTokens.revokedAt)));
      }
    });
    return this.user(id);
  }

  // ─────────── guruhlar ───────────

  async groups(q: PageQuery) {
    const { limit, offset } = page(q);
    const s = like(q.q);
    const where = s ? or(ilike(groups.name, s), ilike(groups.inviteCode, s)) : undefined;
    const [rows, [{ n }]] = await Promise.all([
      this.db
        .select({
          id: groups.id,
          name: groups.name,
          type: groups.type,
          splitMode: groups.splitMode,
          inviteCode: groups.inviteCode,
          createdAt: groups.createdAt,
          membersCount: sql<number>`(select count(*)::int from ${groupMembers} gm where gm.group_id = "groups"."id" and gm.left_at is null)`,
          activePlans: sql<number>`(select count(*)::int from ${groupPlans} gp where gp.group_id = "groups"."id" and gp.status = 'active')`,
          lastMealAt: sql<string | null>`(select max(mi.eat_at) from ${mealInstances} mi where mi.group_id = "groups"."id")`,
        })
        .from(groups)
        .where(where)
        .orderBy(desc(groups.createdAt))
        .limit(limit)
        .offset(offset),
      this.db.select({ n: count() }).from(groups).where(where),
    ]);
    return { total: Number(n), items: rows };
  }

  async group(id: string) {
    const [g] = await this.db.select().from(groups).where(eq(groups.id, id));
    if (!g) throw new NotFoundException('group_not_found');
    const members = await this.db
      .select({ id: users.id, name: users.name, phone: users.phone, status: users.status, role: groupMembers.role, joinedAt: groupMembers.joinedAt, managedBy: users.managedBy })
      .from(groupMembers)
      .innerJoin(users, eq(users.id, groupMembers.userId))
      .where(and(eq(groupMembers.groupId, id), isNull(groupMembers.leftAt)))
      .orderBy(groupMembers.joinedAt);
    const plans = await this.db
      .select({ id: groupPlans.id, status: groupPlans.status, weekStart: groupPlans.weekStart, createdAt: groupPlans.createdAt, cookbookTitle: cookbookTranslations.title })
      .from(groupPlans)
      .leftJoin(cookbookTranslations, and(eq(cookbookTranslations.cookbookId, groupPlans.cookbookId), eq(cookbookTranslations.locale, 'uz')))
      .where(eq(groupPlans.groupId, id))
      .orderBy(desc(groupPlans.createdAt))
      .limit(10);
    const [{ n: mealsCount }] = await this.db.select({ n: count() }).from(mealInstances).where(eq(mealInstances.groupId, id));
    return { ...g, members, plans, mealsCount: Number(mealsCount) };
  }

  // ─────────── katalog ───────────

  private contentWhere(q: ContentQuery, t: typeof dishes | typeof cookbooks) {
    const conds: SQL[] = [];
    if (q.status) conds.push(eq(t.moderationStatus, q.status));
    if (q.visibility) conds.push(eq(t.visibility, q.visibility));
    if ((q.deleted ?? 'no') === 'no') conds.push(isNull(t.deletedAt));
    if (q.deleted === 'yes') conds.push(isNotNull(t.deletedAt));
    return conds;
  }

  private async authorNames(ids: (string | null)[]) {
    const uniq = [...new Set(ids.filter((x): x is string => !!x))];
    const rows = uniq.length ? await this.db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, uniq)) : [];
    return new Map(rows.map((r) => [r.id, r.name]));
  }

  async dishes(q: ContentQuery) {
    const { limit, offset } = page(q);
    const conds = this.contentWhere(q, dishes);
    const s = like(q.q);
    if (s) {
      conds.push(
        or(
          ilike(dishes.slug, s),
          inArray(dishes.id, this.db.select({ id: dishTranslations.dishId }).from(dishTranslations).where(ilike(dishTranslations.title, s))),
        )!,
      );
    }
    const where = and(...conds);
    const [rows, [{ n }]] = await Promise.all([
      this.db.query.dishes.findMany({
        where,
        with: { translations: true, ingredients: { columns: { ingredientId: true } } },
        orderBy: [desc(dishes.updatedAt)],
        limit,
        offset,
      }),
      this.db.select({ n: count() }).from(dishes).where(where),
    ]);
    const names = await this.authorNames(rows.map((r) => r.authorId));
    const groupIds = [...new Set(rows.map((r) => r.groupId).filter((x): x is string => !!x))];
    const gRows = groupIds.length ? await this.db.select({ id: groups.id, name: groups.name }).from(groups).where(inArray(groups.id, groupIds)) : [];
    const gName = new Map(gRows.map((g) => [g.id, g.name]));
    return {
      total: Number(n),
      items: rows.map((d) => ({
        id: d.id,
        slug: d.slug,
        title: pick(d.translations)?.title ?? d.slug ?? '—',
        locales: d.translations.map((t) => t.locale),
        authorId: d.authorId,
        authorName: d.authorId ? (names.get(d.authorId) ?? null) : null,
        groupName: d.groupId ? (gName.get(d.groupId) ?? null) : null,
        visibility: d.visibility,
        moderationStatus: d.moderationStatus,
        imageUrl: d.imageUrl,
        videoUrl: d.videoUrl,
        kcalPerServing: d.kcalPerServing,
        baseServings: d.baseServings,
        activeMin: d.activeMin,
        passiveMin: d.passiveMin,
        mealTypes: d.mealTypes,
        ingredientsCount: d.ingredients.length,
        favoritesCount: d.favoritesCount,
        deletedAt: d.deletedAt,
        updatedAt: d.updatedAt,
      })),
    };
  }

  async cookbooks(q: ContentQuery) {
    const { limit, offset } = page(q);
    const conds = this.contentWhere(q, cookbooks);
    const s = like(q.q);
    if (s) {
      conds.push(
        or(
          ilike(cookbooks.slug, s),
          inArray(
            cookbooks.id,
            this.db.select({ id: cookbookTranslations.cookbookId }).from(cookbookTranslations).where(ilike(cookbookTranslations.title, s)),
          ),
        )!,
      );
    }
    const where = and(...conds);
    const [rows, [{ n }]] = await Promise.all([
      this.db.query.cookbooks.findMany({
        where,
        with: { translations: true, meals: { columns: { id: true } } },
        orderBy: [desc(cookbooks.updatedAt)],
        limit,
        offset,
      }),
      this.db.select({ n: count() }).from(cookbooks).where(where),
    ]);
    const names = await this.authorNames(rows.map((r) => r.authorId));
    return {
      total: Number(n),
      items: rows.map((c) => ({
        id: c.id,
        slug: c.slug,
        title: pick(c.translations)?.title ?? c.slug ?? '—',
        authorName: c.authorId ? (names.get(c.authorId) ?? null) : null,
        visibility: c.visibility,
        moderationStatus: c.moderationStatus,
        days: c.days,
        mealsCount: c.meals.length,
        coverUrl: c.coverUrl,
        deletedAt: c.deletedAt,
        updatedAt: c.updatedAt,
      })),
    };
  }

  /**
   * Holatni to'g'ridan-to'g'ri o'rnatish (moderatsiyadan farqli: istalgan holatdan).
   * approved → ommaviy; rejected → muallif guruhi/o'zi uchun; pending → navbatga qaytadi (ko'rinish o'zgarmaydi).
   */
  async setModeration(kind: 'dishes' | 'cookbooks', id: string, status: 'pending' | 'approved' | 'rejected') {
    if (kind === 'dishes') {
      const [d] = await this.db.select().from(dishes).where(eq(dishes.id, id));
      if (!d) throw new NotFoundException('dish_not_found');
      const visibility = status === 'approved' ? 'public' : status === 'rejected' ? (d.groupId ? 'group' : 'private') : d.visibility;
      await this.db.update(dishes).set({ moderationStatus: status, visibility }).where(eq(dishes.id, id));
    } else {
      const [c] = await this.db.select().from(cookbooks).where(eq(cookbooks.id, id));
      if (!c) throw new NotFoundException('cookbook_not_found');
      const visibility = status === 'approved' ? 'public' : status === 'rejected' ? 'private' : c.visibility;
      await this.db.update(cookbooks).set({ moderationStatus: status, visibility }).where(eq(cookbooks.id, id));
    }
    return { id, status };
  }

  /** O'chirilgan taom/cookbookni qaytarish */
  async restore(kind: 'dishes' | 'cookbooks', id: string) {
    const t = kind === 'dishes' ? dishes : cookbooks;
    const res = await this.db.update(t).set({ deletedAt: null }).where(eq(t.id, id)).returning({ id: t.id });
    if (!res.length) throw new NotFoundException(kind === 'dishes' ? 'dish_not_found' : 'cookbook_not_found');
    return { id, restored: true };
  }

  // ─────────── masalliqlar ───────────

  async ingredients(q: IngredientsQuery) {
    const { limit, offset } = page(q);
    const conds: SQL[] = [];
    const s = like(q.q);
    if (s) {
      conds.push(
        or(
          ilike(ingredients.slug, s),
          inArray(
            ingredients.id,
            this.db.select({ id: ingredientTranslations.ingredientId }).from(ingredientTranslations).where(ilike(ingredientTranslations.name, s)),
          ),
        )!,
      );
    }
    if (q.category) conds.push(eq(ingredients.category, q.category));
    const linkedIds = this.db.select({ id: ingredientPriceLinks.ingredientId }).from(ingredientPriceLinks);
    if (q.linked === 'yes') conds.push(inArray(ingredients.id, linkedIds));
    if (q.linked === 'no') conds.push(sql`${ingredients.id} not in ${linkedIds}`);
    const where = and(...conds);
    const [rows, [{ n }]] = await Promise.all([
      this.db.query.ingredients.findMany({ where, with: { translations: true }, orderBy: [ingredients.category, ingredients.slug], limit, offset }),
      this.db.select({ n: count() }).from(ingredients).where(where),
    ]);
    const ids = rows.map((r) => r.id);
    const links = ids.length ? await this.db.select().from(ingredientPriceLinks).where(inArray(ingredientPriceLinks.ingredientId, ids)) : [];
    const linkOf = new Map(links.map((l) => [l.ingredientId, l.productId]));
    const products = await this.latestProducts([...new Set(links.map((l) => l.productId))]);
    const usage = ids.length
      ? await this.db
          .select({ id: dishIngredients.ingredientId, n: count() })
          .from(dishIngredients)
          .where(inArray(dishIngredients.ingredientId, ids))
          .groupBy(dishIngredients.ingredientId)
      : [];
    const usedIn = new Map(usage.map((u) => [u.id, Number(u.n)]));
    return {
      total: Number(n),
      items: rows.map((r) => {
        const productId = linkOf.get(r.id) ?? null;
        const p = productId ? products.get(productId) : undefined;
        return {
          id: r.id,
          slug: r.slug,
          category: r.category,
          names: Object.fromEntries(r.translations.map((t) => [t.locale, t.name])) as Record<string, string>,
          kcal100g: r.kcal100g,
          protein100g: r.protein100g,
          fat100g: r.fat100g,
          carb100g: r.carb100g,
          pieceWeightG: r.pieceWeightG,
          density: r.density,
          usedInDishes: usedIn.get(r.id) ?? 0,
          price: productId ? { productId, name: p?.name ?? null, price: p?.price ?? null, unit: p?.unit ?? null, unitQty: p?.unitQty ?? null, date: p?.date ?? null } : null,
        };
      }),
    };
  }

  private async latestProducts(productIds: number[]) {
    if (!productIds.length) return new Map<number, typeof priceSnapshots.$inferSelect>();
    const rows = await this.db
      .selectDistinctOn([priceSnapshots.productId])
      .from(priceSnapshots)
      .where(inArray(priceSnapshots.productId, productIds))
      .orderBy(priceSnapshots.productId, desc(priceSnapshots.date));
    return new Map(rows.map((r) => [r.productId, r]));
  }

  async createIngredient(dto: IngredientDto) {
    if (!dto.slug || !dto.category || dto.kcal100g === undefined || !dto.names?.uz) throw new BadRequestException('slug_category_kcal_uz_required');
    const [exists] = await this.db.select({ id: ingredients.id }).from(ingredients).where(eq(ingredients.slug, dto.slug));
    if (exists) throw new BadRequestException('slug_taken');
    const id = await this.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(ingredients)
        .values({
          slug: dto.slug!,
          category: dto.category!,
          kcal100g: dto.kcal100g!,
          protein100g: dto.protein100g ?? 0,
          fat100g: dto.fat100g ?? 0,
          carb100g: dto.carb100g ?? 0,
          pieceWeightG: dto.pieceWeightG ?? null,
          density: dto.density ?? null,
        })
        .returning({ id: ingredients.id });
      await this.saveNames(tx, row.id, dto.names!);
      return row.id;
    });
    return this.ingredientById(id);
  }

  async updateIngredient(id: string, dto: IngredientDto) {
    const [ing] = await this.db.select().from(ingredients).where(eq(ingredients.id, id));
    if (!ing) throw new NotFoundException('ingredient_not_found');
    if (dto.slug && dto.slug !== ing.slug) {
      const [taken] = await this.db.select({ id: ingredients.id }).from(ingredients).where(eq(ingredients.slug, dto.slug));
      if (taken) throw new BadRequestException('slug_taken');
    }
    const patch: Partial<typeof ingredients.$inferInsert> = {};
    for (const k of ['slug', 'category', 'kcal100g', 'protein100g', 'fat100g', 'carb100g', 'pieceWeightG', 'density'] as const) {
      if (dto[k] !== undefined) (patch as Record<string, unknown>)[k] = dto[k];
    }
    let recomputed = 0;
    await this.db.transaction(async (tx) => {
      if (Object.keys(patch).length) await tx.update(ingredients).set(patch).where(eq(ingredients.id, id));
      if (dto.names) await this.saveNames(tx, id, dto.names);
      // Kaloriya o'zgarsa — shu masalliq bor taomlarning porsiya kaloriyasi qayta hisoblanadi
      if (dto.kcal100g !== undefined && dto.kcal100g !== ing.kcal100g) recomputed = await this.recomputeDishKcal(tx, id);
    });
    return { ...(await this.ingredientById(id)), recomputedDishes: recomputed };
  }

  private async saveNames(tx: Db, id: string, names: NamesDto) {
    for (const locale of LOCALE_ORDER) {
      const name = names[locale as keyof NamesDto]?.trim();
      if (!name) continue;
      await tx
        .insert(ingredientTranslations)
        .values({ ingredientId: id, locale, name })
        .onConflictDoUpdate({ target: [ingredientTranslations.ingredientId, ingredientTranslations.locale], set: { name } });
    }
  }

  private async recomputeDishKcal(tx: Db, ingredientId: string) {
    const affected = await tx.selectDistinct({ id: dishIngredients.dishId }).from(dishIngredients).where(eq(dishIngredients.ingredientId, ingredientId));
    for (const { id } of affected) {
      const [d] = await tx.select({ baseServings: dishes.baseServings }).from(dishes).where(eq(dishes.id, id));
      const lines = await tx
        .select({ qtyG: dishIngredients.qtyG, kcal100g: ingredients.kcal100g })
        .from(dishIngredients)
        .innerJoin(ingredients, eq(ingredients.id, dishIngredients.ingredientId))
        .where(eq(dishIngredients.dishId, id));
      await tx.update(dishes).set({ kcalPerServing: dishNutrition(lines, d.baseServings).kcalPerServing }).where(eq(dishes.id, id));
    }
    return affected.length;
  }

  private async ingredientById(id: string) {
    const r = await this.db.query.ingredients.findFirst({ where: eq(ingredients.id, id), with: { translations: true } });
    if (!r) throw new NotFoundException('ingredient_not_found');
    const [link] = await this.db.select().from(ingredientPriceLinks).where(eq(ingredientPriceLinks.ingredientId, id));
    return {
      id: r.id,
      slug: r.slug,
      category: r.category,
      names: Object.fromEntries(r.translations.map((t) => [t.locale, t.name])) as Record<string, string>,
      kcal100g: r.kcal100g,
      protein100g: r.protein100g,
      fat100g: r.fat100g,
      carb100g: r.carb100g,
      pieceWeightG: r.pieceWeightG,
      density: r.density,
      productId: link?.productId ?? null,
    };
  }

  /** Masalliqni narx mahsulotiga bog'lash (productId: null — bog'lanishni olib tashlash) */
  async setPriceLink(ingredientId: string, productId: number | null | undefined) {
    const [ing] = await this.db.select({ id: ingredients.id }).from(ingredients).where(eq(ingredients.id, ingredientId));
    if (!ing) throw new NotFoundException('ingredient_not_found');
    if (!productId) {
      await this.db.delete(ingredientPriceLinks).where(eq(ingredientPriceLinks.ingredientId, ingredientId));
      return { ingredientId, productId: null };
    }
    const [p] = await this.db.select({ id: priceSnapshots.productId }).from(priceSnapshots).where(eq(priceSnapshots.productId, productId)).limit(1);
    if (!p) throw new BadRequestException('product_not_found');
    await this.db
      .insert(ingredientPriceLinks)
      .values({ ingredientId, productId })
      .onConflictDoUpdate({ target: ingredientPriceLinks.ingredientId, set: { productId } });
    return { ingredientId, productId };
  }

  // ─────────── narxlar ───────────

  /** Narxlar sahifasi: sinxronlash tarixi + har mahsulotning oxirgi narxi va bog'langan masalliqlari */
  async prices() {
    const runs = await this.db.select().from(priceSyncRuns).orderBy(desc(priceSyncRuns.date)).limit(14);
    const latest = await this.db
      .selectDistinctOn([priceSnapshots.productId])
      .from(priceSnapshots)
      .orderBy(priceSnapshots.productId, desc(priceSnapshots.date));
    const links = await this.db
      .select({ productId: ingredientPriceLinks.productId, ingredientId: ingredientPriceLinks.ingredientId, slug: ingredients.slug })
      .from(ingredientPriceLinks)
      .innerJoin(ingredients, eq(ingredients.id, ingredientPriceLinks.ingredientId));
    const names = links.length
      ? await this.db
          .select()
          .from(ingredientTranslations)
          .where(and(inArray(ingredientTranslations.ingredientId, links.map((l) => l.ingredientId)), eq(ingredientTranslations.locale, 'uz')))
      : [];
    const nameOf = new Map(names.map((n) => [n.ingredientId, n.name]));
    const byProduct = new Map<number, { id: string; name: string }[]>();
    for (const l of links) byProduct.set(l.productId, [...(byProduct.get(l.productId) ?? []), { id: l.ingredientId, name: nameOf.get(l.ingredientId) ?? l.slug }]);
    const latestDate = latest.reduce<string | null>((m, r) => (!m || r.date > m ? r.date : m), null);
    return {
      syncEnabled: (process.env.PRICES_SYNC_ENABLED ?? 'off') === 'on',
      latestDate,
      runs,
      products: latest
        .map((r) => ({
          productId: r.productId,
          name: r.name,
          unit: r.unit,
          unitQty: r.unitQty,
          price: r.price,
          prevPrice: r.prevPrice,
          changePct: r.prevPrice ? Math.round(((r.price - r.prevPrice) / r.prevPrice) * 1000) / 10 : null,
          date: r.date,
          source: r.source,
          stale: !!latestDate && r.date < latestDate,
          ingredients: byProduct.get(r.productId) ?? [],
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    };
  }

  async priceHistory(productId: number) {
    const rows = await this.db
      .select({ date: priceSnapshots.date, price: priceSnapshots.price, source: priceSnapshots.source, name: priceSnapshots.name })
      .from(priceSnapshots)
      .where(eq(priceSnapshots.productId, productId))
      .orderBy(desc(priceSnapshots.date))
      .limit(90);
    if (!rows.length) throw new NotFoundException('product_not_found');
    return { productId, name: rows[0].name, history: rows.reverse() };
  }
}

// ───────────────────── Controller ─────────────────────

function parseKind(kind: string): 'dishes' | 'cookbooks' {
  if (kind !== 'dishes' && kind !== 'cookbooks') throw new NotFoundException('kind_not_found');
  return kind;
}

@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin')
export class AdminController {
  constructor(
    private readonly svc: AdminService,
    @InjectDb() private readonly db: Db,
  ) {}

  private guard(u: AuthUser) {
    return requireAdmin(this.db, u.id);
  }

  @Get('stats')
  async stats(@CurrentUser() u: AuthUser) {
    await this.guard(u);
    return this.svc.stats();
  }

  @Get('users')
  async users(@CurrentUser() u: AuthUser, @Query() q: UsersQuery) {
    await this.guard(u);
    return this.svc.users(q);
  }

  @Get('users/:id')
  async user(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.guard(u);
    return this.svc.user(id);
  }

  @Patch('users/:id')
  async updateUser(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateUserDto) {
    await this.guard(u);
    return this.svc.updateUser(u.id, id, dto);
  }

  @Get('groups')
  async groups(@CurrentUser() u: AuthUser, @Query() q: PageQuery) {
    await this.guard(u);
    return this.svc.groups(q);
  }

  @Get('groups/:id')
  async group(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.guard(u);
    return this.svc.group(id);
  }

  @Get('dishes')
  async dishes(@CurrentUser() u: AuthUser, @Query() q: ContentQuery) {
    await this.guard(u);
    return this.svc.dishes(q);
  }

  @Get('cookbooks')
  async cookbooks(@CurrentUser() u: AuthUser, @Query() q: ContentQuery) {
    await this.guard(u);
    return this.svc.cookbooks(q);
  }

  @Put(':kind/:id/moderation')
  async setModeration(@CurrentUser() u: AuthUser, @Param('kind') kind: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SetModerationDto) {
    await this.guard(u);
    return this.svc.setModeration(parseKind(kind), id, dto.status);
  }

  @Post(':kind/:id/restore')
  async restore(@CurrentUser() u: AuthUser, @Param('kind') kind: string, @Param('id', ParseUUIDPipe) id: string) {
    await this.guard(u);
    return this.svc.restore(parseKind(kind), id);
  }

  @Get('ingredients')
  async ingredients(@CurrentUser() u: AuthUser, @Query() q: IngredientsQuery) {
    await this.guard(u);
    return this.svc.ingredients(q);
  }

  @Post('ingredients')
  async createIngredient(@CurrentUser() u: AuthUser, @Body() dto: IngredientDto) {
    await this.guard(u);
    return this.svc.createIngredient(dto);
  }

  @Patch('ingredients/:id')
  async updateIngredient(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: IngredientDto) {
    await this.guard(u);
    return this.svc.updateIngredient(id, dto);
  }

  @Put('ingredients/:id/price-link')
  async setPriceLink(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: PriceLinkDto) {
    await this.guard(u);
    return this.svc.setPriceLink(id, dto.productId);
  }

  @Get('prices')
  async prices(@CurrentUser() u: AuthUser) {
    await this.guard(u);
    return this.svc.prices();
  }

  @Get('prices/:productId/history')
  async priceHistory(@CurrentUser() u: AuthUser, @Param('productId', ParseIntPipe) productId: number) {
    await this.guard(u);
    return this.svc.priceHistory(productId);
  }
}

@Module({ controllers: [AdminController], providers: [AdminService] })
export class AdminModule {}
