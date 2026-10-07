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
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsDateString, IsIn, IsInt, IsOptional, IsString, IsUUID, Length, Max, Min } from 'class-validator';
import { and, between, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { AuthUser, CurrentUser, requireMember } from '../../common/auth';
import { Db, InjectDb } from '../../common/infra.module';
import {
  expenseCategory,
  expenses,
  expenseShares,
  groupMembers,
  groups,
  mealInstances,
  mealPortions,
  settlements,
  users,
} from '../../db/schema';
import { computeBalances, simplifyDebts, splitByWeights } from '../../domain/money';
import { addDays, daysBetween, localDate, weekMonday } from '../../domain/schedule';

const MAX_AMOUNT = 1_000_000_000_000; // 1 trln so'm

// ───────────────────── DTO ─────────────────────

class CreateExpenseDto {
  @IsInt() @Min(1) @Max(MAX_AMOUNT) amount: number;
  @IsOptional() @IsIn(expenseCategory.enumValues) category?: (typeof expenseCategory.enumValues)[number];
  @IsOptional() @IsString() @Length(0, 200) note?: string;
  /** Kim to'lagan; bo'sh — o'zi */
  @IsOptional() @IsUUID() paidBy?: string;
  @IsOptional() @IsDateString() spentAt?: string;
  /** Ulush qaysi davr porsiyalaridan; bo'sh — xarajat sanasining haftasi */
  @IsOptional() @IsDateString() periodStart?: string;
  @IsOptional() @IsDateString() periodEnd?: string;
}

class RangeQuery {
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
}

class SettlementDto {
  @IsUUID() toUser: string;
  @IsOptional() @IsUUID() fromUser?: string;
  @IsInt() @Min(1) @Max(MAX_AMOUNT) amount: number;
}

// ───────────────────── Service ─────────────────────

@Injectable()
export class ExpensesService {
  constructor(@InjectDb() private readonly db: Db) {}

  private async group(groupId: string) {
    const [g] = await this.db.select().from(groups).where(eq(groups.id, groupId));
    if (!g) throw new NotFoundException('group_not_found');
    return g;
  }

  /**
   * Davrdagi porsiyalar kaloriyasi bo'yicha og'irliklar.
   * Mehmon porsiyasi — olib kelgan a'zoga, bola (boshqariladigan hisob) porsiyasi — ota-onaga.
   * Porsiya bo'lmasa — faol a'zolar o'rtasida teng.
   */
  async weights(groupId: string, from: string, to: string) {
    const payer = sql<string>`coalesce(${mealPortions.userId}, ${mealPortions.hostUserId})`;
    const rows = await this.db
      .select({ userId: payer, kcal: sql<number>`sum(${mealPortions.kcal})::int` })
      .from(mealPortions)
      .innerJoin(mealInstances, eq(mealInstances.id, mealPortions.mealInstanceId))
      .where(
        and(
          eq(mealInstances.groupId, groupId),
          inArray(mealInstances.status, ['locked', 'cooked']),
          between(mealInstances.date, from, to),
        ),
      )
      .groupBy(payer);
    let base = rows.map((r) => ({ userId: r.userId, weight: Number(r.kcal) }));
    if (!base.some((w) => w.weight > 0)) {
      const members = await this.db
        .select({ userId: groupMembers.userId })
        .from(groupMembers)
        .where(and(eq(groupMembers.groupId, groupId), isNull(groupMembers.leftAt)));
      base = members.map((m) => ({ userId: m.userId, weight: 1 }));
    }
    const ids = base.map((b) => b.userId);
    const managers = ids.length
      ? new Map(
          (await this.db.select({ id: users.id, managedBy: users.managedBy }).from(users).where(inArray(users.id, ids))).map((u) => [
            u.id,
            u.managedBy,
          ]),
        )
      : new Map<string, string | null>();
    const merged = new Map<string, number>();
    for (const b of base) {
      const who = managers.get(b.userId) ?? b.userId;
      merged.set(who, (merged.get(who) ?? 0) + b.weight);
    }
    return [...merged].map(([userId, weight]) => ({ userId, weight }));
  }

  async create(groupId: string, userId: string, dto: CreateExpenseDto) {
    await requireMember(this.db, groupId, userId);
    const paidBy = dto.paidBy ?? userId;
    if (paidBy !== userId) await requireMember(this.db, groupId, paidBy);
    const g = await this.group(groupId);
    const spentAt = dto.spentAt ? new Date(dto.spentAt) : new Date();
    let periodStart: string | null = null;
    let periodEnd: string | null = null;
    if (g.splitMode === 'by_portion') {
      const monday = weekMonday(localDate(spentAt, g.timezone));
      periodStart = dto.periodStart?.slice(0, 10) ?? monday;
      periodEnd = dto.periodEnd?.slice(0, 10) ?? addDays(periodStart, 6);
      const n = daysBetween(periodStart, periodEnd);
      if (n < 0 || n > 62) throw new BadRequestException('range_invalid');
    }
    const id = await this.db.transaction(async (tx) => {
      const [e] = await tx
        .insert(expenses)
        .values({ groupId, paidBy, amount: dto.amount, category: dto.category ?? 'groceries', note: dto.note, spentAt, periodStart, periodEnd })
        .returning();
      return e.id;
    });
    if (g.splitMode === 'by_portion') await this.writeShares(id);
    return this.getOne(groupId, id);
  }

  /** Ulushlarni (qayta) hisoblash — davrdagi mahallar keyinroq qulflangan bo'lsa */
  private async writeShares(expenseId: string) {
    const [e] = await this.db.select().from(expenses).where(eq(expenses.id, expenseId));
    if (!e.periodStart || !e.periodEnd) return;
    const shares = splitByWeights(e.amount, await this.weights(e.groupId, e.periodStart, e.periodEnd));
    await this.db.transaction(async (tx) => {
      await tx.delete(expenseShares).where(eq(expenseShares.expenseId, expenseId));
      if (shares.size) {
        await tx.insert(expenseShares).values([...shares].map(([uid, amount]) => ({ expenseId, userId: uid, amount })));
      }
    });
  }

  async recalculate(groupId: string, userId: string, expenseId: string) {
    await requireMember(this.db, groupId, userId);
    const e = await this.expenseOr404(groupId, expenseId);
    await this.writeShares(e.id);
    return this.getOne(groupId, expenseId);
  }

  private async expenseOr404(groupId: string, expenseId: string) {
    const [e] = await this.db
      .select()
      .from(expenses)
      .where(and(eq(expenses.id, expenseId), eq(expenses.groupId, groupId)));
    if (!e) throw new NotFoundException('expense_not_found');
    return e;
  }

  private async getOne(groupId: string, expenseId: string) {
    const e = await this.expenseOr404(groupId, expenseId);
    const [view] = await this.withShares([e]);
    return view;
  }

  private async withShares(rows: (typeof expenses.$inferSelect)[]) {
    const ids = rows.map((r) => r.id);
    const shares = ids.length ? await this.db.select().from(expenseShares).where(inArray(expenseShares.expenseId, ids)) : [];
    const names = await this.names([...rows.map((r) => r.paidBy), ...shares.map((s) => s.userId)]);
    return rows.map((r) => ({
      ...r,
      paidByName: names.get(r.paidBy) ?? '',
      shares: shares
        .filter((s) => s.expenseId === r.id)
        .map((s) => ({ userId: s.userId, name: names.get(s.userId) ?? '', amount: s.amount })),
    }));
  }

  async list(groupId: string, userId: string, q: RangeQuery) {
    await requireMember(this.db, groupId, userId);
    const conds = [eq(expenses.groupId, groupId)];
    if (q.from) conds.push(sql`${expenses.spentAt} >= ${new Date(q.from)}`);
    if (q.to) conds.push(sql`${expenses.spentAt} < ${new Date(addDays(q.to.slice(0, 10), 1))}`);
    const rows = await this.db
      .select()
      .from(expenses)
      .where(and(...conds))
      .orderBy(desc(expenses.spentAt))
      .limit(200);
    return this.withShares(rows);
  }

  async remove(groupId: string, userId: string, expenseId: string) {
    const me = await requireMember(this.db, groupId, userId);
    const e = await this.expenseOr404(groupId, expenseId);
    if (e.paidBy !== userId && me.role !== 'admin') throw new ForbiddenException('payer_or_admin_only');
    await this.db.delete(expenses).where(eq(expenses.id, expenseId));
    return { ok: true };
  }

  /** Balanslar (musbat — unga qarzdor) va minimal o'tkazmalar */
  async balances(groupId: string, userId: string) {
    await requireMember(this.db, groupId, userId);
    const g = await this.group(groupId);
    const exp = await this.db.select().from(expenses).where(eq(expenses.groupId, groupId));
    const shares = exp.length
      ? await this.db.select().from(expenseShares).where(inArray(expenseShares.expenseId, exp.map((e) => e.id)))
      : [];
    const st = await this.db.select().from(settlements).where(eq(settlements.groupId, groupId));
    const balances = computeBalances(
      exp.map((e) => ({ paidBy: e.paidBy, shares: shares.filter((s) => s.expenseId === e.id) })),
      st.map((s) => ({ from: s.fromUser, to: s.toUser, amount: s.amount })),
    );
    const transfers = simplifyDebts(balances);
    const names = await this.names([...balances.keys()]);
    const totalSpent = exp.reduce((s, e) => s + e.amount, 0);
    return {
      splitMode: g.splitMode,
      currency: g.currency,
      totalSpent,
      balances: [...balances].map(([id, balance]) => ({ userId: id, name: names.get(id) ?? '', balance })),
      transfers: transfers.map((t) => ({ ...t, fromName: names.get(t.from) ?? '', toName: names.get(t.to) ?? '' })),
    };
  }

  /** Qarzni yopish: fromUser → toUser */
  async settle(groupId: string, userId: string, dto: SettlementDto) {
    await requireMember(this.db, groupId, userId);
    const fromUser = dto.fromUser ?? userId;
    if (fromUser === dto.toUser) throw new BadRequestException('same_user');
    // Faqat ishtirokchilardan biri yozishi mumkin
    if (userId !== fromUser && userId !== dto.toUser) throw new ForbiddenException('not_allowed');
    await requireMember(this.db, groupId, fromUser);
    await requireMember(this.db, groupId, dto.toUser);
    const [s] = await this.db.insert(settlements).values({ groupId, fromUser, toUser: dto.toUser, amount: dto.amount }).returning();
    return s;
  }

  async listSettlements(groupId: string, userId: string) {
    await requireMember(this.db, groupId, userId);
    const rows = await this.db
      .select()
      .from(settlements)
      .where(eq(settlements.groupId, groupId))
      .orderBy(desc(settlements.settledAt))
      .limit(200);
    const names = await this.names(rows.flatMap((r) => [r.fromUser, r.toUser]));
    return rows.map((r) => ({ ...r, fromName: names.get(r.fromUser) ?? '', toName: names.get(r.toUser) ?? '' }));
  }

  private async names(ids: string[]) {
    const uniq = [...new Set(ids)];
    if (!uniq.length) return new Map<string, string>();
    const rows = await this.db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, uniq));
    return new Map(rows.map((r) => [r.id, r.name]));
  }
}

// ───────────────────── Controller ─────────────────────

@ApiTags('expenses')
@ApiBearerAuth()
@Controller('groups/:id')
export class ExpensesController {
  constructor(private readonly svc: ExpensesService) {}

  @Post('expenses')
  create(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateExpenseDto) {
    return this.svc.create(id, u.id, dto);
  }

  @Get('expenses')
  list(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Query() q: RangeQuery) {
    return this.svc.list(id, u.id, q);
  }

  @Post('expenses/:expenseId/recalculate')
  recalc(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Param('expenseId', ParseUUIDPipe) expenseId: string) {
    return this.svc.recalculate(id, u.id, expenseId);
  }

  @Delete('expenses/:expenseId')
  remove(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Param('expenseId', ParseUUIDPipe) expenseId: string) {
    return this.svc.remove(id, u.id, expenseId);
  }

  @Get('balances')
  balances(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.balances(id, u.id);
  }

  @Post('settlements')
  settle(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SettlementDto) {
    return this.svc.settle(id, u.id, dto);
  }

  @Get('settlements')
  settlements(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.listSettlements(id, u.id);
  }
}

@Module({ controllers: [ExpensesController], providers: [ExpensesService] })
export class ExpensesModule {}
