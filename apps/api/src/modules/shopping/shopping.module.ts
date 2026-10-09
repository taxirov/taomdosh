import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsDateString, IsIn, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { and, between, desc, eq, inArray, sql } from 'drizzle-orm';
import { AuthUser, CurrentUser, requireMember } from '../../common/auth';
import { Db, InjectDb } from '../../common/infra.module';
import {
  groups,
  ingredients,
  mealInstances,
  pantryItems,
  pantryMovements,
  shoppingItems,
  shoppingStatus,
  users,
} from '../../db/schema';
import { Locale, normalizeLocale, pickTranslation } from '../../domain/i18n';
import { addDays, daysBetween, localDate } from '../../domain/schedule';
import { toDisplay } from '../../domain/units';
import { GroupsModule, GroupsService } from '../groups/groups.module';
import { mealNeeds, planPortions } from '../meals/portion-planner';

/** Standart xarid davri — bugundan 7 kun */
export const DEFAULT_PERIOD_DAYS = 7;
/** Sotib olinmaydigan masalliqlar (retseptda bor, xarid ro'yxatiga tushmaydi) */
export const NOT_SHOPPED = ['water'];

// ───────────────────── DTO ─────────────────────

class RegenerateDto {
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
}

class ListQuery {
  @IsOptional() @IsIn(shoppingStatus.enumValues) status?: (typeof shoppingStatus.enumValues)[number];
}

class AddItemDto {
  @IsUUID() ingredientId: string;
  @IsInt() @Min(1) @Max(100_000) qtyG: number;
  @IsOptional() @IsUUID() assigneeId?: string;
}

class UpdateItemDto {
  @IsOptional() @IsIn(shoppingStatus.enumValues) status?: (typeof shoppingStatus.enumValues)[number];
  /** Aslida qancha olingani (masalan, 1 kg o'rniga 1,2 kg) */
  @IsOptional() @IsInt() @Min(1) @Max(100_000) qtyG?: number;
  @IsOptional() @IsUUID() assigneeId?: string;
}

class PantrySetDto {
  @IsInt() @Min(0) @Max(1_000_000) qtyG: number;
}

// ───────────────────── Service ─────────────────────

@Injectable()
export class ShoppingService {
  constructor(
    @InjectDb() private readonly db: Db,
    private readonly groupsService: GroupsService,
  ) {}

  private async today(groupId: string) {
    const [g] = await this.db.select({ tz: groups.timezone }).from(groups).where(eq(groups.id, groupId));
    return localDate(new Date(), g.tz);
  }

  /** Davr ehtiyoji: qulflanmagan mahallar masalliqlari (kutilgan porsiyalar bilan) − zaxira */
  async computeNeeds(groupId: string, from: string, to: string): Promise<Map<string, number>> {
    const meals = await this.db
      .select({ id: mealInstances.id })
      .from(mealInstances)
      .where(and(eq(mealInstances.groupId, groupId), eq(mealInstances.status, 'planned'), between(mealInstances.date, from, to)));
    const plans = await planPortions(this.db, meals.map((m) => m.id));
    const need = new Map<string, number>();
    for (const p of plans.values()) {
      for (const [ing, g] of mealNeeds(p)) need.set(ing, (need.get(ing) ?? 0) + g);
    }
    if (need.size === 0) return need;
    const stock = await this.db
      .select()
      .from(pantryItems)
      .where(and(eq(pantryItems.groupId, groupId), inArray(pantryItems.ingredientId, [...need.keys()])));
    for (const s of stock) need.set(s.ingredientId, (need.get(s.ingredientId) ?? 0) - s.qtyG);
    for (const [k, v] of need) if (v <= 0) need.delete(k);
    const skip = await this.db
      .select({ id: ingredients.id })
      .from(ingredients)
      .where(inArray(ingredients.slug, NOT_SHOPPED));
    for (const r of skip) need.delete(r.id);
    return need;
  }

  /** Avtomatik ro'yxatni qayta tuzish; qo'lda qo'shilganlar va olinganlar saqlanadi */
  async regenerate(groupId: string, userId: string, locale: Locale, dto: RegenerateDto) {
    await requireMember(this.db, groupId, userId);
    const from = dto.from?.slice(0, 10) ?? (await this.today(groupId));
    const to = dto.to?.slice(0, 10) ?? addDays(from, DEFAULT_PERIOD_DAYS - 1);
    const n = daysBetween(from, to);
    if (n < 0 || n > 31) throw new BadRequestException('range_invalid');
    const need = await this.computeNeeds(groupId, from, to);
    const assigneeId = await this.groupsService.dutyFor(groupId, from, 'shopping');
    await this.db.transaction(async (tx) => {
      await tx
        .delete(shoppingItems)
        .where(and(eq(shoppingItems.groupId, groupId), eq(shoppingItems.status, 'pending'), eq(shoppingItems.isManual, false)));
      if (need.size) {
        await tx.insert(shoppingItems).values(
          [...need].map(([ingredientId, qtyG]) => ({ groupId, ingredientId, qtyG, periodStart: from, periodEnd: to, assigneeId })),
        );
      }
    });
    return this.list(groupId, userId, locale, {});
  }

  async list(groupId: string, userId: string, locale: Locale, q: ListQuery) {
    await requireMember(this.db, groupId, userId);
    const rows = await this.db.query.shoppingItems.findMany({
      where: q.status
        ? and(eq(shoppingItems.groupId, groupId), eq(shoppingItems.status, q.status))
        : eq(shoppingItems.groupId, groupId),
      orderBy: [desc(shoppingItems.createdAt)],
      limit: 500,
    });
    const view = await this.ingredientView(rows.map((r) => r.ingredientId), locale);
    const names = await this.userNames(rows.map((r) => r.assigneeId));
    const order = { pending: 0, bought: 1, skipped: 2 } as const;
    return rows
      .map((r) => {
        const i = view.get(r.ingredientId)!;
        return {
          id: r.id,
          ingredientId: r.ingredientId,
          name: i.name,
          category: i.category,
          qtyG: r.qtyG,
          display: toDisplay(r.qtyG, i),
          status: r.status,
          isManual: r.isManual,
          periodStart: r.periodStart,
          periodEnd: r.periodEnd,
          assigneeId: r.assigneeId,
          assigneeName: r.assigneeId ? (names.get(r.assigneeId) ?? null) : null,
          boughtAt: r.boughtAt,
        };
      })
      .sort((a, b) => order[a.status] - order[b.status] || a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
  }

  async addItem(groupId: string, userId: string, locale: Locale, dto: AddItemDto) {
    await requireMember(this.db, groupId, userId);
    if (dto.assigneeId) await requireMember(this.db, groupId, dto.assigneeId);
    const [ing] = await this.db.select({ id: ingredients.id }).from(ingredients).where(eq(ingredients.id, dto.ingredientId));
    if (!ing) throw new BadRequestException('ingredient_not_found');
    const today = await this.today(groupId);
    await this.db.insert(shoppingItems).values({
      groupId,
      ingredientId: dto.ingredientId,
      qtyG: dto.qtyG,
      periodStart: today,
      periodEnd: today,
      assigneeId: dto.assigneeId ?? userId,
      isManual: true,
    });
    return this.list(groupId, userId, locale, {});
  }

  /** "Olindi" → zaxiraga qo'shiladi (purchase). Olingan narsani qayta o'zgartirib bo'lmaydi. */
  async updateItem(groupId: string, userId: string, itemId: string, locale: Locale, dto: UpdateItemDto) {
    await requireMember(this.db, groupId, userId);
    if (dto.assigneeId) await requireMember(this.db, groupId, dto.assigneeId);
    await this.db.transaction(async (tx) => {
      const [it] = await tx
        .select()
        .from(shoppingItems)
        .where(and(eq(shoppingItems.id, itemId), eq(shoppingItems.groupId, groupId)))
        .for('update');
      if (!it) throw new NotFoundException('item_not_found');
      if (it.status === 'bought') throw new ConflictException('already_bought');
      const qtyG = dto.qtyG ?? it.qtyG;
      const patch: Partial<typeof shoppingItems.$inferInsert> = { qtyG };
      if (dto.assigneeId) patch.assigneeId = dto.assigneeId;
      if (dto.status) patch.status = dto.status;
      if (dto.status === 'bought') {
        patch.boughtAt = new Date();
        await this.addToPantry(tx, groupId, it.ingredientId, qtyG, 'purchase', it.id, userId);
      }
      await tx.update(shoppingItems).set(patch).where(eq(shoppingItems.id, itemId));
    });
    return this.list(groupId, userId, locale, {});
  }

  async deleteItem(groupId: string, userId: string, itemId: string) {
    await requireMember(this.db, groupId, userId);
    const del = await this.db
      .delete(shoppingItems)
      .where(and(eq(shoppingItems.id, itemId), eq(shoppingItems.groupId, groupId), inArray(shoppingItems.status, ['pending', 'skipped'])))
      .returning({ id: shoppingItems.id });
    if (!del.length) throw new NotFoundException('item_not_found');
    return { ok: true };
  }

  private async addToPantry(
    tx: Pick<Db, 'insert'>,
    groupId: string,
    ingredientId: string,
    deltaG: number,
    reason: 'purchase' | 'manual',
    refId: string | null,
    createdBy: string,
  ) {
    const [row] = await tx
      .insert(pantryItems)
      .values({ groupId, ingredientId, qtyG: Math.max(0, deltaG) })
      .onConflictDoUpdate({
        target: [pantryItems.groupId, pantryItems.ingredientId],
        set: { qtyG: sqlGreatest0(deltaG) },
      })
      .returning();
    await tx.insert(pantryMovements).values({ groupId, ingredientId, deltaG, reason, refId, createdBy });
    return row;
  }

  // ─────────── zaxira ───────────

  async pantry(groupId: string, userId: string, locale: Locale) {
    await requireMember(this.db, groupId, userId);
    const rows = await this.db.select().from(pantryItems).where(eq(pantryItems.groupId, groupId));
    const view = await this.ingredientView(rows.map((r) => r.ingredientId), locale);
    return rows
      .filter((r) => r.qtyG > 0)
      .map((r) => {
        const i = view.get(r.ingredientId)!;
        return { ingredientId: r.ingredientId, name: i.name, category: i.category, qtyG: r.qtyG, display: toDisplay(r.qtyG, i), updatedAt: r.updatedAt };
      })
      .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
  }

  /** Zaxirani tuzatish: aniq miqdorni o'rnatadi, farq ledgerga "manual" bo'lib yoziladi */
  async setPantry(groupId: string, userId: string, ingredientId: string, locale: Locale, dto: PantrySetDto) {
    await requireMember(this.db, groupId, userId);
    const [ing] = await this.db.select({ id: ingredients.id }).from(ingredients).where(eq(ingredients.id, ingredientId));
    if (!ing) throw new NotFoundException('ingredient_not_found');
    await this.db.transaction(async (tx) => {
      const [cur] = await tx
        .select()
        .from(pantryItems)
        .where(and(eq(pantryItems.groupId, groupId), eq(pantryItems.ingredientId, ingredientId)))
        .for('update');
      const delta = dto.qtyG - (cur?.qtyG ?? 0);
      if (delta === 0) return;
      await this.addToPantry(tx, groupId, ingredientId, delta, 'manual', null, userId);
    });
    return this.pantry(groupId, userId, locale);
  }

  async movements(groupId: string, userId: string, locale: Locale) {
    await requireMember(this.db, groupId, userId);
    const rows = await this.db
      .select()
      .from(pantryMovements)
      .where(eq(pantryMovements.groupId, groupId))
      .orderBy(desc(pantryMovements.createdAt))
      .limit(200);
    const view = await this.ingredientView(rows.map((r) => r.ingredientId), locale);
    return rows.map((r) => ({ ...r, name: view.get(r.ingredientId)!.name }));
  }

  // ─────────── yordamchilar ───────────

  private async ingredientView(ids: string[], locale: Locale) {
    const out = new Map<string, { name: string; category: string; pieceWeightG: number | null; density: number | null }>();
    const uniq = [...new Set(ids)];
    if (!uniq.length) return out;
    const rows = await this.db.query.ingredients.findMany({ where: inArray(ingredients.id, uniq), with: { translations: true } });
    for (const r of rows) {
      out.set(r.id, {
        name: pickTranslation(r.translations, locale, ['name'])?.name ?? r.slug,
        category: r.category,
        pieceWeightG: r.pieceWeightG,
        density: r.density,
      });
    }
    return out;
  }

  private async userNames(ids: (string | null)[]) {
    const uniq = [...new Set(ids.filter((x): x is string => !!x))];
    if (!uniq.length) return new Map<string, string>();
    const rows = await this.db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, uniq));
    return new Map(rows.map((r) => [r.id, r.name]));
  }
}

/** qty_g = greatest(qty_g + delta, 0) */
function sqlGreatest0(delta: number) {
  return sql`greatest(${pantryItems.qtyG} + ${delta}, 0)`;
}

// ───────────────────── Controller ─────────────────────

@ApiTags('shopping')
@ApiBearerAuth()
@Controller('groups/:id')
export class ShoppingController {
  constructor(private readonly svc: ShoppingService) {}

  @Post('shopping/regenerate')
  regenerate(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RegenerateDto) {
    return this.svc.regenerate(id, u.id, normalizeLocale(u.locale), dto);
  }

  @Get('shopping')
  list(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Query() q: ListQuery) {
    return this.svc.list(id, u.id, normalizeLocale(u.locale), q);
  }

  @Post('shopping')
  add(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AddItemDto) {
    return this.svc.addItem(id, u.id, normalizeLocale(u.locale), dto);
  }

  @Patch('shopping/:itemId')
  update(
    @CurrentUser() u: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() dto: UpdateItemDto,
  ) {
    return this.svc.updateItem(id, u.id, itemId, normalizeLocale(u.locale), dto);
  }

  @Delete('shopping/:itemId')
  remove(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Param('itemId', ParseUUIDPipe) itemId: string) {
    return this.svc.deleteItem(id, u.id, itemId);
  }

  @Get('pantry')
  pantry(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.pantry(id, u.id, normalizeLocale(u.locale));
  }

  @Get('pantry/movements')
  movements(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.movements(id, u.id, normalizeLocale(u.locale));
  }

  @Put('pantry/:ingredientId')
  setPantry(
    @CurrentUser() u: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('ingredientId', ParseUUIDPipe) ingredientId: string,
    @Body() dto: PantrySetDto,
  ) {
    return this.svc.setPantry(id, u.id, ingredientId, normalizeLocale(u.locale), dto);
  }
}

@Module({ imports: [GroupsModule], controllers: [ShoppingController], providers: [ShoppingService], exports: [ShoppingService] })
export class ShoppingModule {}
