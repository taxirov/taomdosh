import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Injectable,
  Logger,
  Module,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsDateString, IsIn, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { and, asc, between, eq, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import { AuthUser, CurrentUser, requireMember } from '../../common/auth';
import { Db, InjectDb } from '../../common/infra.module';
import {
  attendance,
  attendanceStatus,
  cookbooks,
  dishes,
  feedbackVerdict,
  groupMealSettings,
  groupMembers,
  groupPlans,
  groups,
  mealFeedback,
  mealInstanceDishes,
  mealInstances,
  mealPortions,
  pantryItems,
  pantryMovements,
  portionFactors,
  userProfiles,
  users,
} from '../../db/schema';
import type { MealType } from '../../db/schema';
import { Locale, normalizeLocale, pickTranslation } from '../../domain/i18n';
import { updateFactor } from '../../domain/portions';
import { addDays, computeMealTimes, daysBetween, weekMonday } from '../../domain/schedule';
import { toDisplay } from '../../domain/units';
import { GroupsModule, GroupsService } from '../groups/groups.module';
import { mealNeeds, planPortions } from './portion-planner';

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

export const LOCK_POLL_MS = 30_000;
const MEAL_ORDER: MealType[] = ['breakfast', 'lunch', 'snack', 'dinner'];

// ───────────────────── DTO ─────────────────────

class ApplyCookbookDto {
  @IsUUID() cookbookId: string;
  /** Haftaning istalgan kuni — dushanbaga keltiriladi */
  @IsDateString() weekStart: string;
}

class RangeQuery {
  @IsDateString() from: string;
  @IsDateString() to: string;
}

class AttendanceDto {
  @IsIn(attendanceStatus.enumValues) status: (typeof attendanceStatus.enumValues)[number];
  @IsOptional() @IsInt() @Min(0) @Max(20) guests?: number;
  /** Boshqariladigan a'zo (bola) uchun — ota-ona belgilaydi */
  @IsOptional() @IsUUID() userId?: string;
}

class FeedbackDto {
  @IsIn(feedbackVerdict.enumValues) verdict: (typeof feedbackVerdict.enumValues)[number];
  @IsOptional() @IsUUID() userId?: string;
}

// ───────────────────── Service ─────────────────────

@Injectable()
export class MealsService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(MealsService.name);
  private timer: NodeJS.Timeout | null = null;
  private polling = false;

  constructor(
    @InjectDb() private readonly db: Db,
    private readonly groupsService: GroupsService,
    private readonly cfg: ConfigService,
  ) {}

  onModuleInit() {
    if (this.cfg.get('MEAL_LOCK_POLLER') === 'off') return;
    this.timer = setInterval(() => void this.tick(), LOCK_POLL_MS);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick() {
    if (this.polling) return;
    this.polling = true;
    try {
      const n = await this.lockDue();
      if (n) this.log.log(`${n} ta mahal qulflandi`);
    } catch (e) {
      this.log.error('Qulflashda xato', e as Error);
    } finally {
      this.polling = false;
    }
  }

  // ─────────── reja ───────────

  /** Cookbookni haftaga qo'llash: meal_instances + meal_instance_dishes */
  async applyCookbook(groupId: string, userId: string, locale: Locale, dto: ApplyCookbookDto) {
    await requireMember(this.db, groupId, userId, { admin: true });
    const weekStart = weekMonday(dto.weekStart.slice(0, 10));
    const [group] = await this.db.select().from(groups).where(eq(groups.id, groupId));
    const cb = await this.db.query.cookbooks.findFirst({
      where: and(
        eq(cookbooks.id, dto.cookbookId),
        or(and(eq(cookbooks.visibility, 'public'), eq(cookbooks.moderationStatus, 'approved')), eq(cookbooks.authorId, userId)),
      ),
      with: { meals: { with: { dishes: { with: { dish: true } } } } },
    });
    if (!cb) throw new NotFoundException('cookbook_not_found');
    const settings = await this.db.select().from(groupMealSettings).where(eq(groupMealSettings.groupId, groupId));
    const now = new Date();

    // Oshpaz kunlar bo'yicha (tranzaksiyadan oldin — o'qish)
    const cooks = new Map<string, string | null>();
    for (let i = 0; i < 7; i++) {
      const date = addDays(weekStart, i);
      cooks.set(date, await this.groupsService.cookFor(groupId, date));
    }

    const result = await this.db.transaction(async (tx) => {
      // Shu haftaning oldingi rejasi bekor qilinadi, uning hali qulflanmagan mahallari o'chiriladi
      const prev = await tx
        .select({ id: groupPlans.id })
        .from(groupPlans)
        .where(and(eq(groupPlans.groupId, groupId), eq(groupPlans.weekStart, weekStart), eq(groupPlans.status, 'active')));
      if (prev.length) {
        const prevIds = prev.map((p) => p.id);
        await tx.delete(mealInstances).where(and(inArray(mealInstances.planId, prevIds), eq(mealInstances.status, 'planned')));
        await tx.update(groupPlans).set({ status: 'cancelled' }).where(inArray(groupPlans.id, prevIds));
      }
      const [plan] = await tx.insert(groupPlans).values({ groupId, cookbookId: cb.id, weekStart }).returning();

      let created = 0;
      let skipped = 0;
      for (const cm of cb.meals) {
        if (cm.dayIndex > 6 || cm.dishes.length === 0) {
          skipped++;
          continue;
        }
        const setting = settings.find((s) => s.mealType === cm.mealType);
        if (setting && !setting.enabled) {
          skipped++;
          continue;
        }
        const date = addDays(weekStart, cm.dayIndex);
        const eatTime = cm.eatTime ?? setting?.defaultTime ?? '13:00';
        const times = computeMealTimes(date, eatTime, group.timezone, cm.dishes.map((d) => d.dish));
        if (times.lockAt <= now) {
          skipped++; // o'tib ketgan mahal
          continue;
        }
        const [existing] = await tx
          .select()
          .from(mealInstances)
          .where(and(eq(mealInstances.groupId, groupId), eq(mealInstances.date, date), eq(mealInstances.mealType, cm.mealType)));
        if (existing) {
          if (existing.status === 'locked' || existing.status === 'cooked') {
            skipped++;
            continue;
          }
          await tx.delete(mealInstances).where(eq(mealInstances.id, existing.id));
        }
        const [mi] = await tx
          .insert(mealInstances)
          .values({ groupId, planId: plan.id, date, mealType: cm.mealType, ...times, cookUserId: cooks.get(date) ?? null })
          .returning();
        await tx
          .insert(mealInstanceDishes)
          .values(cm.dishes.map((d) => ({ mealInstanceId: mi.id, dishId: d.dishId, isSide: d.isSide })));
        created++;
      }
      return { plan, created, skipped };
    });
    const meals = await this.listMeals(groupId, userId, locale, weekStart, addDays(weekStart, 6));
    return { ...result, meals };
  }

  async listPlans(groupId: string, userId: string) {
    await requireMember(this.db, groupId, userId);
    return this.db
      .select()
      .from(groupPlans)
      .where(eq(groupPlans.groupId, groupId))
      .orderBy(sql`${groupPlans.weekStart} desc`)
      .limit(50);
  }

  /** Rejani bekor qilish: qulflanmagan mahallari o'chiriladi, qulflanganlari qoladi */
  async cancelPlan(groupId: string, userId: string, planId: string) {
    await requireMember(this.db, groupId, userId, { admin: true });
    return this.db.transaction(async (tx) => {
      const [p] = await tx
        .update(groupPlans)
        .set({ status: 'cancelled' })
        .where(and(eq(groupPlans.id, planId), eq(groupPlans.groupId, groupId)))
        .returning();
      if (!p) throw new NotFoundException('plan_not_found');
      const del = await tx
        .delete(mealInstances)
        .where(and(eq(mealInstances.planId, planId), eq(mealInstances.status, 'planned')))
        .returning({ id: mealInstances.id });
      return { ok: true, removedMeals: del.length };
    });
  }

  // ─────────── mahallar ───────────

  async listMeals(groupId: string, userId: string, locale: Locale, from: string, to: string) {
    await requireMember(this.db, groupId, userId);
    const n = daysBetween(from, to);
    if (n < 0 || n > 62) throw new BadRequestException('range_invalid');
    const rows = await this.db.query.mealInstances.findMany({
      where: and(eq(mealInstances.groupId, groupId), between(mealInstances.date, from, to)),
      with: { dishes: { with: { dish: { with: { translations: true } } } }, attendance: true },
    });
    rows.sort((a, b) => a.date.localeCompare(b.date) || MEAL_ORDER.indexOf(a.mealType) - MEAL_ORDER.indexOf(b.mealType));
    const members = await this.activeMembers(groupId);
    const myPortions = rows.length
      ? await this.db
          .select()
          .from(mealPortions)
          .where(and(inArray(mealPortions.mealInstanceId, rows.map((r) => r.id)), eq(mealPortions.userId, userId)))
      : [];
    return rows.map((m) => this.mealView(m, members, myPortions.filter((p) => p.mealInstanceId === m.id), userId, locale));
  }

  async getMeal(mealId: string, userId: string, locale: Locale) {
    const m = await this.db.query.mealInstances.findFirst({
      where: eq(mealInstances.id, mealId),
      with: { dishes: { with: { dish: { with: { translations: true } } } }, attendance: true },
    });
    if (!m) throw new NotFoundException('meal_not_found');
    await requireMember(this.db, m.groupId, userId);
    const members = await this.activeMembers(m.groupId);
    const mine = await this.db
      .select()
      .from(mealPortions)
      .where(and(eq(mealPortions.mealInstanceId, mealId), eq(mealPortions.userId, userId)));
    return this.mealView(m, members, mine, userId, locale);
  }

  private async activeMembers(groupId: string) {
    return this.db
      .select({ userId: users.id, name: users.name, managedBy: users.managedBy, role: groupMembers.role })
      .from(groupMembers)
      .innerJoin(users, eq(users.id, groupMembers.userId))
      .where(and(eq(groupMembers.groupId, groupId), isNull(groupMembers.leftAt)));
  }

  private mealView(
    m: typeof mealInstances.$inferSelect & {
      dishes: (typeof mealInstanceDishes.$inferSelect & {
        dish: typeof dishes.$inferSelect & { translations: { locale: string; title: string }[] };
      })[];
      attendance: (typeof attendance.$inferSelect)[];
    },
    members: { userId: string; name: string }[],
    myPortions: (typeof mealPortions.$inferSelect)[],
    userId: string,
    locale: Locale,
  ) {
    const att = new Map(m.attendance.map((a) => [a.userId, a]));
    const list = members.map((x) => ({
      userId: x.userId,
      name: x.name,
      status: att.get(x.userId)?.status ?? 'eating',
      guests: att.get(x.userId)?.guests ?? 0,
    }));
    const mine = list.find((x) => x.userId === userId);
    return {
      id: m.id,
      planId: m.planId,
      date: m.date,
      mealType: m.mealType,
      eatAt: m.eatAt,
      startAt: m.startAt,
      remindAt: m.remindAt,
      lockAt: m.lockAt,
      prepAt: m.prepAt,
      status: m.status,
      cookUserId: m.cookUserId,
      isCook: m.cookUserId === userId,
      dishes: m.dishes.map((d) => ({
        dishId: d.dishId,
        isSide: d.isSide,
        title: pickTranslation(d.dish.translations, locale, ['title'])?.title ?? '',
        imageUrl: d.dish.imageUrl,
        kcalPerServing: d.dish.kcalPerServing,
        totalServings: d.totalServings,
      })),
      attendance: list,
      eatingCount: list.filter((x) => x.status === 'eating').length,
      guestsCount: list.reduce((s, x) => s + x.guests, 0),
      myAttendance: mine ? { status: mine.status, guests: mine.guests } : null,
      myPortions: myPortions.map((p) => ({ dishId: p.dishId, factor: p.factor, grams: p.grams, kcal: p.kcal })),
    };
  }

  /** Kim nomidan amal qilinmoqda: o'zi yoki boshqariladigan a'zo (bola) */
  private async actingFor(groupId: string, userId: string, targetId?: string): Promise<string> {
    const me = await requireMember(this.db, groupId, userId);
    if (!targetId || targetId === userId) return userId;
    await requireMember(this.db, groupId, targetId);
    const [t] = await this.db.select().from(users).where(eq(users.id, targetId));
    if (t?.managedBy !== userId && me.role !== 'admin') throw new ForbiddenException('not_allowed');
    return targetId;
  }

  private async mealOr404(mealId: string) {
    const [m] = await this.db.select().from(mealInstances).where(eq(mealInstances.id, mealId));
    if (!m) throw new NotFoundException('meal_not_found');
    return m;
  }

  /** "Yeyman / yemayman" va mehmonlar; qulflash vaqtidan keyin o'zgartirib bo'lmaydi */
  async setAttendance(mealId: string, userId: string, locale: Locale, dto: AttendanceDto) {
    const m = await this.mealOr404(mealId);
    const target = await this.actingFor(m.groupId, userId, dto.userId);
    await this.db.transaction(async (tx) => {
      // Qulflash bilan poyga bo'lmasligi uchun mahal qatori bloklanadi
      const [cur] = await tx.select().from(mealInstances).where(eq(mealInstances.id, mealId)).for('update');
      if (cur.status !== 'planned' || cur.lockAt <= new Date()) throw new ConflictException('meal_locked');
      const values = { mealInstanceId: mealId, userId: target, status: dto.status, guests: dto.guests ?? 0 };
      await tx
        .insert(attendance)
        .values(values)
        .onConflictDoUpdate({ target: [attendance.mealInstanceId, attendance.userId], set: { status: values.status, guests: values.guests } });
    });
    return this.getMeal(mealId, userId, locale);
  }

  // ─────────── qulflash ───────────

  /** Vaqti kelgan mahallarni birma-bir qulflaydi; qaytaradi: qulflanganlar soni */
  async lockDue(now: Date = new Date()): Promise<number> {
    let count = 0;
    for (;;) {
      const done = await this.db.transaction(async (tx) => {
        const [m] = await tx
          .select({ id: mealInstances.id })
          .from(mealInstances)
          .where(and(eq(mealInstances.status, 'planned'), lte(mealInstances.lockAt, now)))
          .orderBy(asc(mealInstances.lockAt))
          .limit(1)
          .for('update', { skipLocked: true });
        if (!m) return false;
        await this.lockMeal(tx, m.id, now);
        return true;
      });
      if (!done) break;
      count++;
    }
    // Ovqat vaqti o'tgan qulflangan mahallar — "pishirildi"
    await this.db
      .update(mealInstances)
      .set({ status: 'cooked' })
      .where(and(eq(mealInstances.status, 'locked'), lte(mealInstances.eatAt, now)));
    return count;
  }

  /** Navbatchi yoki admin pishirishni erta boshlasa — darhol qulflash */
  async lockNow(mealId: string, userId: string, locale: Locale) {
    const m = await this.mealOr404(mealId);
    const me = await requireMember(this.db, m.groupId, userId);
    if (m.cookUserId !== userId && me.role !== 'admin') throw new ForbiddenException('cook_or_admin_only');
    await this.db.transaction(async (tx) => {
      const [cur] = await tx.select().from(mealInstances).where(eq(mealInstances.id, mealId)).for('update');
      if (cur.status !== 'planned') throw new ConflictException('meal_locked');
      const now = new Date();
      if (cur.lockAt > now) await tx.update(mealInstances).set({ lockAt: now }).where(eq(mealInstances.id, mealId));
      await this.lockMeal(tx, mealId, now);
    });
    return this.getMeal(mealId, userId, locale);
  }

  /**
   * Bitta tranzaksiyada: porsiyalarni muzlatish, total_servings, zaxiradan ayirish.
   * Chaqiruvchi mahal qatorini FOR UPDATE bilan bloklagan bo'lishi kerak.
   */
  private async lockMeal(tx: Tx, mealId: string, now: Date) {
    const plan = (await planPortions(tx, [mealId])).get(mealId)!;
    if (plan.portions.length === 0) {
      // Hech kim yemaydi — pishirilmaydi
      await tx.update(mealInstances).set({ status: 'cancelled', lockedAt: now }).where(eq(mealInstances.id, mealId));
      return;
    }
    await tx.insert(mealPortions).values(plan.portions.map((p) => ({ ...p, mealInstanceId: mealId })));
    for (const d of plan.dishes) {
      await tx
        .update(mealInstanceDishes)
        .set({ totalServings: plan.servings.get(d.dishId) ?? 0 })
        .where(eq(mealInstanceDishes.id, d.mealInstanceDishId));
    }
    const need = mealNeeds(plan);
    if (need.size) {
      const stock = await tx
        .select()
        .from(pantryItems)
        .where(and(eq(pantryItems.groupId, plan.groupId), inArray(pantryItems.ingredientId, [...need.keys()])))
        .for('update');
      for (const s of stock) {
        const take = Math.min(s.qtyG, need.get(s.ingredientId) ?? 0);
        if (take <= 0) continue;
        await tx
          .update(pantryItems)
          .set({ qtyG: s.qtyG - take })
          .where(and(eq(pantryItems.groupId, plan.groupId), eq(pantryItems.ingredientId, s.ingredientId)));
        await tx.insert(pantryMovements).values({
          groupId: plan.groupId,
          ingredientId: s.ingredientId,
          deltaG: -take,
          reason: 'cooking',
          refId: mealId,
        });
      }
    }
    await tx.update(mealInstances).set({ status: 'locked', lockedAt: now }).where(eq(mealInstances.id, mealId));
  }

  // ─────────── oshpaz ko'rinishi ───────────

  /**
   * Navbatchiga: har a'zoga necha gramm suzish va masshtablangan retsept.
   * Vazn, maqsad, kaloriya ko'rsatilmaydi. Qulflanmagan bo'lsa — joriy qatnashuv bo'yicha taxmin.
   */
  async cookView(mealId: string, userId: string, locale: Locale) {
    const m = await this.mealOr404(mealId);
    await requireMember(this.db, m.groupId, userId);
    const isFinal = m.status === 'locked' || m.status === 'cooked';
    const plan = (await planPortions(this.db, [mealId])).get(mealId)!;

    let portions: { dishId: string; userId: string | null; hostUserId: string | null; grams: number }[];
    let servings: Map<string, number>;
    if (isFinal) {
      portions = await this.db.select().from(mealPortions).where(eq(mealPortions.mealInstanceId, mealId));
      const md = await this.db.select().from(mealInstanceDishes).where(eq(mealInstanceDishes.mealInstanceId, mealId));
      servings = new Map(md.map((d) => [d.dishId, d.totalServings ?? 0]));
    } else {
      portions = plan.portions;
      servings = plan.servings;
    }

    const dishIds = plan.dishes.map((d) => d.dishId);
    const dishRows = dishIds.length
      ? await this.db.query.dishes.findMany({
          where: inArray(dishes.id, dishIds),
          with: {
            translations: true,
            ingredients: { with: { ingredient: { with: { translations: true } } }, orderBy: (x, { asc: a }) => [a(x.position)] },
            steps: { with: { translations: true }, orderBy: (x, { asc: a }) => [a(x.n)] },
          },
        })
      : [];
    const userIds = [...new Set(portions.flatMap((p) => [p.userId, p.hostUserId]).filter((x): x is string => !!x))];
    const names = new Map(
      userIds.length
        ? (await this.db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, userIds))).map((u) => [u.id, u.name])
        : [],
    );

    return {
      mealId,
      date: m.date,
      mealType: m.mealType,
      status: m.status,
      isFinal,
      eatAt: m.eatAt,
      startAt: m.startAt,
      cookUserId: m.cookUserId,
      dishes: plan.dishes.map((pd) => {
        const d = dishRows.find((x) => x.id === pd.dishId)!;
        const total = servings.get(pd.dishId) ?? 0;
        const k = total / Math.max(1, d.baseServings);
        const rows = portions.filter((p) => p.dishId === pd.dishId);
        return {
          dishId: pd.dishId,
          isSide: pd.isSide,
          title: pickTranslation(d.translations, locale, ['title'])?.title ?? '',
          totalServings: total,
          totalGrams: rows.reduce((s, p) => s + p.grams, 0),
          activeMin: d.activeMin,
          passiveMin: d.passiveMin,
          portions: rows.map((p) => ({
            userId: p.userId,
            name: p.userId ? (names.get(p.userId) ?? '') : null,
            isGuest: p.userId === null,
            hostUserId: p.hostUserId,
            hostName: p.hostUserId ? (names.get(p.hostUserId) ?? '') : null,
            grams: p.grams,
          })),
          ingredients: d.ingredients.map((i) => {
            const qtyG = Math.round(i.qtyG * k);
            return {
              ingredientId: i.ingredientId,
              name: pickTranslation(i.ingredient.translations, locale, ['name'])?.name ?? i.ingredient.slug,
              qtyG,
              displayQty: i.displayQty != null ? Math.round(i.displayQty * k * 10) / 10 : null,
              displayUnit: i.displayUnit,
              market: toDisplay(qtyG, i.ingredient),
            };
          }),
          steps: d.steps.map((s) => ({
            n: s.n,
            durationMin: s.durationMin,
            text: pickTranslation(s.translations, locale, ['text'])?.text ?? '',
          })),
        };
      }),
    };
  }

  // ─────────── baho ───────────

  /** Ovqatdan keyin "ko'p / yetarli / yetmadi" → kᵢ yangilanadi */
  async feedback(mealId: string, userId: string, dto: FeedbackDto) {
    const m = await this.mealOr404(mealId);
    const target = await this.actingFor(m.groupId, userId, dto.userId);
    if (m.status !== 'locked' && m.status !== 'cooked') throw new ConflictException('meal_not_locked');
    const [ate] = await this.db
      .select({ id: mealPortions.id })
      .from(mealPortions)
      .where(and(eq(mealPortions.mealInstanceId, mealId), eq(mealPortions.userId, target)))
      .limit(1);
    if (!ate) throw new ForbiddenException('not_eaten');

    return this.db.transaction(async (tx) => {
      const ins = await tx
        .insert(mealFeedback)
        .values({ mealInstanceId: mealId, userId: target, verdict: dto.verdict })
        .onConflictDoNothing()
        .returning();
      if (!ins.length) throw new ConflictException('feedback_exists');
      const [p] = await tx.select({ goal: userProfiles.goal }).from(userProfiles).where(eq(userProfiles.userId, target));
      const [f] = await tx
        .select()
        .from(portionFactors)
        .where(and(eq(portionFactors.userId, target), eq(portionFactors.mealType, m.mealType)));
      const next = updateFactor(f?.factor ?? 1, dto.verdict, p?.goal ?? 'maintain');
      await tx
        .insert(portionFactors)
        .values({ userId: target, mealType: m.mealType, factor: next.factor })
        .onConflictDoUpdate({ target: [portionFactors.userId, portionFactors.mealType], set: { factor: next.factor } });
      return next;
    });
  }
}

// ───────────────────── Controller ─────────────────────

@ApiTags('meals')
@ApiBearerAuth()
@Controller()
export class MealsController {
  constructor(private readonly svc: MealsService) {}

  /** Cookbookni haftaga qo'llash */
  @Post('groups/:id/plans')
  apply(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ApplyCookbookDto) {
    return this.svc.applyCookbook(id, u.id, normalizeLocale(u.locale), dto);
  }

  @Get('groups/:id/plans')
  plans(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.listPlans(id, u.id);
  }

  @Delete('groups/:id/plans/:planId')
  cancelPlan(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Param('planId', ParseUUIDPipe) planId: string) {
    return this.svc.cancelPlan(id, u.id, planId);
  }

  @Get('groups/:id/meals')
  meals(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Query() q: RangeQuery) {
    return this.svc.listMeals(id, u.id, normalizeLocale(u.locale), q.from.slice(0, 10), q.to.slice(0, 10));
  }

  @Get('meals/:id')
  meal(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.getMeal(id, u.id, normalizeLocale(u.locale));
  }

  @Put('meals/:id/attendance')
  attendance(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AttendanceDto) {
    return this.svc.setAttendance(id, u.id, normalizeLocale(u.locale), dto);
  }

  @Post('meals/:id/lock')
  lock(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.lockNow(id, u.id, normalizeLocale(u.locale));
  }

  @Get('meals/:id/cook-view')
  cookView(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.cookView(id, u.id, normalizeLocale(u.locale));
  }

  @Post('meals/:id/feedback')
  feedback(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: FeedbackDto) {
    return this.svc.feedback(id, u.id, dto);
  }
}

@Module({ imports: [GroupsModule], controllers: [MealsController], providers: [MealsService], exports: [MealsService] })
export class MealsModule {}
