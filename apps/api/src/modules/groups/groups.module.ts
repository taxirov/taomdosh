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
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
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
import { and, between, eq, isNull } from 'drizzle-orm';
import { randomInt } from 'node:crypto';
import { AuthUser, CurrentUser, requireMember } from '../../common/auth';
import { Db, InjectDb } from '../../common/infra.module';
import {
  dutyAssignments,
  dutyRole,
  dutyRotations,
  groupMealSettings,
  groupMembers,
  groups,
  groupType,
  mealType,
  splitMode,
  userProfiles,
  users,
} from '../../db/schema';
import type { DutyRole, GroupType, MealType, SplitMode } from '../../db/schema';
import { resolveDuty } from '../../domain/duty';
import { addDays, daysBetween } from '../../domain/schedule';
import { ProfileDto, UsersModule, UsersService } from '../users/users.module';

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export const DEFAULT_MEAL_SETTINGS: { mealType: MealType; share: number; defaultTime: string; enabled: boolean }[] = [
  { mealType: 'breakfast', share: 0.25, defaultTime: '08:00', enabled: true },
  { mealType: 'lunch', share: 0.35, defaultTime: '13:00', enabled: true },
  { mealType: 'dinner', share: 0.3, defaultTime: '19:00', enabled: true },
  { mealType: 'snack', share: 0.1, defaultTime: '16:30', enabled: false },
];

/** Oila — umumiy qozon; talabalar va jamoa — porsiya bo'yicha */
export const defaultSplitMode = (t: GroupType): SplitMode => (t === 'family' ? 'shared_pot' : 'by_portion');

// ───────────────────── DTO ─────────────────────

class CreateGroupDto {
  @IsString() @Length(1, 60) name: string;
  @IsIn(groupType.enumValues) type: GroupType;
  @IsOptional() @IsString() timezone?: string;
}

class UpdateGroupDto {
  @IsOptional() @IsString() @Length(1, 60) name?: string;
  @IsOptional() @IsIn(groupType.enumValues) type?: GroupType;
  @IsOptional() @IsIn(splitMode.enumValues) splitMode?: SplitMode;
}

class JoinDto {
  @IsString() @Length(4, 16) inviteCode: string;
}

class ManagedMemberDto extends ProfileDto {
  @IsString() @Length(1, 60) name: string;
}

class MealSettingDto {
  @IsIn(mealType.enumValues) mealType: MealType;
  @IsNumber() @Min(0) @Max(1) share: number;
  @Matches(HHMM) defaultTime: string;
  @IsBoolean() enabled: boolean;
}

class MealSettingsDto {
  @IsArray() @ArrayMaxSize(4) @ValidateNested({ each: true }) @Type(() => MealSettingDto) items: MealSettingDto[];
}

class RotationDto {
  @IsIn(dutyRole.enumValues) dutyRole: DutyRole;
  @IsArray() @IsUUID('all', { each: true }) memberOrder: string[];
  @IsOptional() @IsBoolean() enabled?: boolean;
}

class ManualDutyDto {
  @IsIn(dutyRole.enumValues) dutyRole: DutyRole;
  @IsUUID() userId: string;
}

class DutyRangeQuery {
  @IsDateString() from: string;
  @IsDateString() to: string;
}

// ───────────────────── Service ─────────────────────

function newInviteCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // o'xshash belgilarsiz
  return Array.from({ length: 6 }, () => alphabet[randomInt(alphabet.length)]).join('');
}

@Injectable()
export class GroupsService {
  constructor(
    @InjectDb() private readonly db: Db,
    private readonly usersService: UsersService,
  ) {}

  async create(userId: string, dto: CreateGroupDto) {
    return this.db.transaction(async (tx) => {
      const [g] = await tx
        .insert(groups)
        .values({
          name: dto.name.trim(),
          type: dto.type,
          splitMode: defaultSplitMode(dto.type),
          timezone: dto.timezone ?? 'Asia/Tashkent',
          inviteCode: newInviteCode(),
        })
        .returning();
      await tx.insert(groupMembers).values({ groupId: g.id, userId, role: 'admin' });
      await tx.insert(groupMealSettings).values(DEFAULT_MEAL_SETTINGS.map((s) => ({ ...s, groupId: g.id })));
      await tx.insert(dutyRotations).values({ groupId: g.id, dutyRole: 'cook', memberOrder: [userId] });
      return g;
    });
  }

  async listMine(userId: string) {
    return this.db
      .select({ id: groups.id, name: groups.name, type: groups.type, role: groupMembers.role })
      .from(groupMembers)
      .innerJoin(groups, eq(groups.id, groupMembers.groupId))
      .where(and(eq(groupMembers.userId, userId), isNull(groupMembers.leftAt)));
  }

  async get(groupId: string, userId: string) {
    const me = await requireMember(this.db, groupId, userId);
    const [g] = await this.db.select().from(groups).where(eq(groups.id, groupId));
    const members = await this.db
      .select({
        userId: users.id,
        name: users.name,
        role: groupMembers.role,
        managedBy: users.managedBy,
        joinedAt: groupMembers.joinedAt,
      })
      .from(groupMembers)
      .innerJoin(users, eq(users.id, groupMembers.userId))
      .where(and(eq(groupMembers.groupId, groupId), isNull(groupMembers.leftAt)));
    const mealSettings = await this.db.select().from(groupMealSettings).where(eq(groupMealSettings.groupId, groupId));
    const rotations = await this.db.select().from(dutyRotations).where(eq(dutyRotations.groupId, groupId));
    // Sog'liq ma'lumoti (vazn, maqsad, kaloriya) guruhga ko'rsatilmaydi — faqat ism va rol
    return { ...g, inviteCode: g.inviteCode, myRole: me.role, members, mealSettings, rotations };
  }

  async update(groupId: string, userId: string, dto: UpdateGroupDto) {
    await requireMember(this.db, groupId, userId, { admin: true });
    const patch: Partial<typeof groups.$inferInsert> = {};
    if (dto.name) patch.name = dto.name.trim();
    if (dto.type) {
      patch.type = dto.type;
      patch.splitMode = dto.splitMode ?? defaultSplitMode(dto.type);
    } else if (dto.splitMode) patch.splitMode = dto.splitMode;
    if (Object.keys(patch).length) await this.db.update(groups).set(patch).where(eq(groups.id, groupId));
    return this.get(groupId, userId);
  }

  async join(userId: string, code: string) {
    const [g] = await this.db.select().from(groups).where(eq(groups.inviteCode, code.trim().toUpperCase()));
    if (!g) throw new NotFoundException('invite_invalid');
    await this.addMember(g.id, userId);
    return this.get(g.id, userId);
  }

  private async addMember(groupId: string, userId: string) {
    await this.db
      .insert(groupMembers)
      .values({ groupId, userId, role: 'member' })
      .onConflictDoUpdate({ target: [groupMembers.groupId, groupMembers.userId], set: { leftAt: null, joinedAt: new Date() } });
    const [rot] = await this.db
      .select()
      .from(dutyRotations)
      .where(and(eq(dutyRotations.groupId, groupId), eq(dutyRotations.dutyRole, 'cook')));
    if (rot && !rot.memberOrder.includes(userId)) {
      await this.db
        .update(dutyRotations)
        .set({ memberOrder: [...rot.memberOrder, userId] })
        .where(and(eq(dutyRotations.groupId, groupId), eq(dutyRotations.dutyRole, 'cook')));
    }
  }

  /** Bola yoki telefoni yo'q a'zo: boshqariladigan hisob. Navbatchilikka avtomatik qo'shilmaydi. */
  async addManagedMember(groupId: string, userId: string, dto: ManagedMemberDto) {
    await requireMember(this.db, groupId, userId);
    const [child] = await this.db.insert(users).values({ name: dto.name.trim(), managedBy: userId }).returning();
    const { name: _n, ...profile } = dto;
    await this.usersService.upsertProfile(child.id, profile);
    await this.db.insert(groupMembers).values({ groupId, userId: child.id, role: 'member' });
    return this.get(groupId, userId);
  }

  async updateManagedProfile(groupId: string, userId: string, childId: string, dto: ProfileDto) {
    await requireMember(this.db, groupId, userId);
    const [child] = await this.db.select().from(users).where(eq(users.id, childId));
    if (!child || child.managedBy !== userId) throw new NotFoundException('member_not_found');
    await this.usersService.upsertProfile(childId, dto);
    const [p] = await this.db.select().from(userProfiles).where(eq(userProfiles.userId, childId));
    return p;
  }

  async removeMember(groupId: string, userId: string, targetId: string) {
    if (targetId !== userId) await requireMember(this.db, groupId, userId, { admin: true });
    const target = await requireMember(this.db, groupId, targetId);
    if (target.role === 'admin') {
      const admins = await this.db
        .select()
        .from(groupMembers)
        .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.role, 'admin'), isNull(groupMembers.leftAt)));
      if (admins.length === 1) throw new BadRequestException('last_admin');
    }
    await this.db.update(groupMembers).set({ leftAt: new Date() }).where(eq(groupMembers.id, target.id));
    const rots = await this.db.select().from(dutyRotations).where(eq(dutyRotations.groupId, groupId));
    for (const r of rots) {
      await this.db
        .update(dutyRotations)
        .set({ memberOrder: r.memberOrder.filter((id) => id !== targetId) })
        .where(and(eq(dutyRotations.groupId, groupId), eq(dutyRotations.dutyRole, r.dutyRole)));
    }
    return { ok: true };
  }

  async setRole(groupId: string, userId: string, targetId: string, role: 'admin' | 'member') {
    await requireMember(this.db, groupId, userId, { admin: true });
    const target = await requireMember(this.db, groupId, targetId);
    await this.db.update(groupMembers).set({ role }).where(eq(groupMembers.id, target.id));
    return this.get(groupId, userId);
  }

  async setMealSettings(groupId: string, userId: string, dto: MealSettingsDto) {
    await requireMember(this.db, groupId, userId, { admin: true });
    for (const s of dto.items) {
      await this.db
        .insert(groupMealSettings)
        .values({ groupId, ...s })
        .onConflictDoUpdate({
          target: [groupMealSettings.groupId, groupMealSettings.mealType],
          set: { share: s.share, defaultTime: s.defaultTime, enabled: s.enabled },
        });
    }
    return this.db.select().from(groupMealSettings).where(eq(groupMealSettings.groupId, groupId));
  }

  async setRotation(groupId: string, userId: string, dto: RotationDto) {
    await requireMember(this.db, groupId, userId, { admin: true });
    for (const id of dto.memberOrder) await requireMember(this.db, groupId, id);
    await this.db
      .insert(dutyRotations)
      .values({ groupId, dutyRole: dto.dutyRole, memberOrder: dto.memberOrder, enabled: dto.enabled ?? true })
      .onConflictDoUpdate({
        target: [dutyRotations.groupId, dutyRotations.dutyRole],
        set: { memberOrder: dto.memberOrder, enabled: dto.enabled ?? true },
      });
    return { ok: true };
  }

  /** Qo'lda navbat almashtirish (masalan, "bugun men pishiraman") */
  async setManualDuty(groupId: string, userId: string, date: string, dto: ManualDutyDto) {
    await requireMember(this.db, groupId, userId);
    await requireMember(this.db, groupId, dto.userId);
    await this.db
      .insert(dutyAssignments)
      .values({ groupId, date, dutyRole: dto.dutyRole, userId: dto.userId, isManual: true })
      .onConflictDoUpdate({
        target: [dutyAssignments.groupId, dutyAssignments.date, dutyAssignments.dutyRole],
        set: { userId: dto.userId, isManual: true },
      });
    return this.duty(groupId, userId, date, date);
  }

  async clearManualDuty(groupId: string, userId: string, date: string, role: DutyRole) {
    await requireMember(this.db, groupId, userId);
    await this.db
      .delete(dutyAssignments)
      .where(and(eq(dutyAssignments.groupId, groupId), eq(dutyAssignments.date, date), eq(dutyAssignments.dutyRole, role)));
    return this.duty(groupId, userId, date, date);
  }

  async duty(groupId: string, userId: string, from: string, to: string) {
    await requireMember(this.db, groupId, userId);
    const n = daysBetween(from, to);
    if (n < 0 || n > 62) throw new BadRequestException('range_invalid');
    const rots = await this.db.select().from(dutyRotations).where(eq(dutyRotations.groupId, groupId));
    const manual = await this.db
      .select()
      .from(dutyAssignments)
      .where(and(eq(dutyAssignments.groupId, groupId), between(dutyAssignments.date, from, to)));
    const out: { date: string; dutyRole: DutyRole; userId: string | null; isManual: boolean }[] = [];
    for (let i = 0; i <= n; i++) {
      const date = addDays(from, i);
      for (const r of rots.filter((x) => x.enabled)) {
        const m = new Map(manual.filter((x) => x.dutyRole === r.dutyRole).map((x) => [x.date, x.userId]));
        out.push({ date, dutyRole: r.dutyRole, ...resolveDuty(r.memberOrder, date, m) });
      }
    }
    return out;
  }

  /** Shu kun navbatchi oshpaz */
  async cookFor(groupId: string, date: string): Promise<string | null> {
    const [rot] = await this.db
      .select()
      .from(dutyRotations)
      .where(and(eq(dutyRotations.groupId, groupId), eq(dutyRotations.dutyRole, 'cook')));
    const manual = await this.db
      .select()
      .from(dutyAssignments)
      .where(and(eq(dutyAssignments.groupId, groupId), eq(dutyAssignments.date, date), eq(dutyAssignments.dutyRole, 'cook')));
    if (!rot?.enabled && manual.length === 0) return null;
    return resolveDuty(rot?.memberOrder ?? [], date, new Map(manual.map((m) => [m.date, m.userId]))).userId;
  }
}

// ───────────────────── Controller ─────────────────────

@ApiTags('groups')
@ApiBearerAuth()
@Controller('groups')
export class GroupsController {
  constructor(private readonly svc: GroupsService) {}

  @Post()
  create(@CurrentUser() u: AuthUser, @Body() dto: CreateGroupDto) {
    return this.svc.create(u.id, dto);
  }

  @Get()
  list(@CurrentUser() u: AuthUser) {
    return this.svc.listMine(u.id);
  }

  @Post('join')
  join(@CurrentUser() u: AuthUser, @Body() dto: JoinDto) {
    return this.svc.join(u.id, dto.inviteCode);
  }

  @Get(':id')
  get(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.get(id, u.id);
  }

  @Patch(':id')
  update(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateGroupDto) {
    return this.svc.update(id, u.id, dto);
  }

  /** Bola yoki telefonsiz a'zo qo'shish */
  @Post(':id/managed-members')
  addManaged(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ManagedMemberDto) {
    return this.svc.addManagedMember(id, u.id, dto);
  }

  @Put(':id/managed-members/:memberId/profile')
  updateManaged(
    @CurrentUser() u: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('memberId', ParseUUIDPipe) memberId: string,
    @Body() dto: ProfileDto,
  ) {
    return this.svc.updateManagedProfile(id, u.id, memberId, dto);
  }

  @Delete(':id/members/:memberId')
  remove(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Param('memberId', ParseUUIDPipe) memberId: string) {
    return this.svc.removeMember(id, u.id, memberId);
  }

  @Put(':id/members/:memberId/role')
  setRole(
    @CurrentUser() u: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('memberId', ParseUUIDPipe) memberId: string,
    @Body('role') role: string,
  ) {
    if (role !== 'admin' && role !== 'member') throw new BadRequestException('role_invalid');
    return this.svc.setRole(id, u.id, memberId, role);
  }

  @Put(':id/meal-settings')
  mealSettings(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: MealSettingsDto) {
    return this.svc.setMealSettings(id, u.id, dto);
  }

  @Get(':id/duty')
  duty(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Query() q: DutyRangeQuery) {
    return this.svc.duty(id, u.id, q.from.slice(0, 10), q.to.slice(0, 10));
  }

  @Put(':id/duty/rotation')
  rotation(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RotationDto) {
    return this.svc.setRotation(id, u.id, dto);
  }

  @Put(':id/duty/:date')
  manualDuty(
    @CurrentUser() u: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('date') date: string,
    @Body() dto: ManualDutyDto,
  ) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new BadRequestException('date_invalid');
    return this.svc.setManualDuty(id, u.id, date, dto);
  }

  @Delete(':id/duty/:date/:role')
  clearDuty(
    @CurrentUser() u: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('date') date: string,
    @Param('role') role: DutyRole,
  ) {
    if (!dutyRole.enumValues.includes(role)) throw new BadRequestException('role_invalid');
    return this.svc.clearManualDuty(id, u.id, date, role);
  }
}

@Module({ imports: [UsersModule], controllers: [GroupsController], providers: [GroupsService], exports: [GroupsService] })
export class GroupsModule {}
