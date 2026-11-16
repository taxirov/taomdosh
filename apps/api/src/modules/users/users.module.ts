import { Body, Controller, Delete, Get, Injectable, Module, Patch, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsDateString, IsIn, IsInt, IsNumber, IsOptional, IsString, Length, Max, Min } from 'class-validator';
import { and, asc, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { AuthUser, CurrentUser, isPlatformAdmin } from '../../common/auth';
import { Db, InjectDb } from '../../common/infra.module';
import {
  activityLevel,
  bodyMeasurements,
  consents,
  devices,
  dishes,
  dutyRotations,
  favorites,
  goalEnum,
  groupMembers,
  nutritionTargets,
  portionFactors,
  refreshTokens,
  sexEnum,
  userProfiles,
  users,
} from '../../db/schema';
import type { ActivityLevel, Goal, Sex } from '../../db/schema';
import { normalizeLocale } from '../../domain/i18n';
import { computeTarget, NutritionTarget } from '../../domain/nutrition';

class UpdateMeDto {
  @IsOptional() @IsString() @Length(1, 60) name?: string;
  @IsOptional() @IsString() locale?: string;
}

export class ProfileDto {
  @IsOptional() @IsDateString() birthDate?: string;
  @IsOptional() @IsIn(sexEnum.enumValues) sex?: Sex;
  @IsOptional() @IsInt() @Min(50) @Max(250) heightCm?: number;
  @IsOptional() @IsNumber() @Min(2) @Max(350) weightKg?: number;
  @IsOptional() @IsIn(activityLevel.enumValues) activityLevel?: ActivityLevel;
  @IsOptional() @IsIn(goalEnum.enumValues) goal?: Goal;
  @IsOptional() @IsNumber() @Min(2) @Max(350) targetWeightKg?: number;
}

/** O'chirilgan hisob tarixda shu nom bilan ko'rinadi */
export const DELETED_NAME = 'O‘chirilgan hisob';

@Injectable()
export class UsersService {
  constructor(@InjectDb() private readonly db: Db) {}

  async me(userId: string) {
    const user = await this.db.query.users.findFirst({ where: eq(users.id, userId), with: { profile: true } });
    const target = await this.currentTarget(userId);
    // isAdmin — platforma admini (moderatsiya ekrani uchun)
    return { ...user, isAdmin: isPlatformAdmin(user), target };
  }

  async updateMe(userId: string, dto: UpdateMeDto) {
    const patch: Partial<typeof users.$inferInsert> = {};
    if (dto.name) patch.name = dto.name.trim();
    if (dto.locale) patch.locale = normalizeLocale(dto.locale);
    if (Object.keys(patch).length) await this.db.update(users).set(patch).where(eq(users.id, userId));
    return this.me(userId);
  }

  /** Profilni saqlaydi, vazn o'zgarsa o'lchov yozadi va kunlik me'yorni qayta hisoblaydi */
  async upsertProfile(userId: string, dto: ProfileDto) {
    const [prev] = await this.db.select().from(userProfiles).where(eq(userProfiles.userId, userId));
    const values = {
      userId,
      birthDate: dto.birthDate?.slice(0, 10) ?? prev?.birthDate ?? null,
      sex: dto.sex ?? prev?.sex ?? null,
      heightCm: dto.heightCm ?? prev?.heightCm ?? null,
      weightKg: dto.weightKg ?? prev?.weightKg ?? null,
      activityLevel: dto.activityLevel ?? prev?.activityLevel ?? 'light',
      goal: dto.goal ?? prev?.goal ?? 'maintain',
      targetWeightKg: dto.targetWeightKg ?? prev?.targetWeightKg ?? null,
    };
    await this.db.insert(userProfiles).values(values).onConflictDoUpdate({ target: userProfiles.userId, set: values });
    if (dto.weightKg !== undefined && dto.weightKg !== prev?.weightKg) {
      await this.db.insert(bodyMeasurements).values({ userId, weightKg: dto.weightKg, heightCm: values.heightCm });
    }
    const t = computeTarget(values);
    await this.db.insert(nutritionTargets).values({
      userId,
      kcal: t.kcal,
      proteinG: t.proteinG,
      fatG: t.fatG,
      carbG: t.carbG,
      formulaVersion: t.formulaVersion,
    });
    return this.me(userId);
  }

  /**
   * Hisobni o'chirish: shaxsiy ma'lumotlar (telefon, ism, profil, o'lchovlar, qurilmalar, sevimlilar)
   * o'chiriladi, sessiyalar bekor qilinadi, guruhlardan chiqariladi. Boshqariladigan (bola) hisoblar ham.
   * Xarajat va porsiya tarixi guruh hisob-kitobi buzilmasligi uchun "O'chirilgan hisob" nomi bilan qoladi.
   */
  async deleteAccount(userId: string) {
    await this.db.transaction(async (tx) => {
      const managed = await tx.select({ id: users.id }).from(users).where(eq(users.managedBy, userId));
      const ids = [userId, ...managed.map((m) => m.id)];
      const now = new Date();

      const memberships = await tx
        .select()
        .from(groupMembers)
        .where(and(inArray(groupMembers.userId, ids), isNull(groupMembers.leftAt)));
      await tx.update(groupMembers).set({ leftAt: now, role: 'member' }).where(and(inArray(groupMembers.userId, ids), isNull(groupMembers.leftAt)));
      for (const groupId of new Set(memberships.map((m) => m.groupId))) {
        // Navbatchilik aylanishidan chiqarish
        const rots = await tx.select().from(dutyRotations).where(eq(dutyRotations.groupId, groupId));
        for (const r of rots) {
          await tx
            .update(dutyRotations)
            .set({ memberOrder: r.memberOrder.filter((id) => !ids.includes(id)) })
            .where(and(eq(dutyRotations.groupId, groupId), eq(dutyRotations.dutyRole, r.dutyRole)));
        }
        // Guruh adminsiz qolmasin: eng avval qo'shilgan (telefoni bor) a'zo admin bo'ladi
        const left = await tx
          .select({ id: groupMembers.id, role: groupMembers.role })
          .from(groupMembers)
          .innerJoin(users, eq(users.id, groupMembers.userId))
          .where(and(eq(groupMembers.groupId, groupId), isNull(groupMembers.leftAt), isNull(users.managedBy)))
          .orderBy(asc(groupMembers.joinedAt));
        if (left.length && !left.some((m) => m.role === 'admin')) {
          await tx.update(groupMembers).set({ role: 'admin' }).where(eq(groupMembers.id, left[0].id));
        }
      }

      const favs = await tx.delete(favorites).where(inArray(favorites.userId, ids)).returning({ dishId: favorites.dishId });
      if (favs.length) {
        await tx
          .update(dishes)
          .set({ favoritesCount: sql`greatest(${dishes.favoritesCount} - 1, 0)` })
          .where(inArray(dishes.id, favs.map((f) => f.dishId)));
      }
      await tx.update(refreshTokens).set({ revokedAt: now }).where(and(inArray(refreshTokens.userId, ids), isNull(refreshTokens.revokedAt)));
      await tx.delete(devices).where(inArray(devices.userId, ids));
      await tx.delete(userProfiles).where(inArray(userProfiles.userId, ids));
      await tx.delete(bodyMeasurements).where(inArray(bodyMeasurements.userId, ids));
      await tx.delete(nutritionTargets).where(inArray(nutritionTargets.userId, ids));
      await tx.delete(portionFactors).where(inArray(portionFactors.userId, ids));
      await tx.delete(consents).where(inArray(consents.userId, ids));
      await tx
        .update(users)
        .set({ status: 'deleted', phone: null, name: DELETED_NAME, role: 'user' })
        .where(or(eq(users.id, userId), eq(users.managedBy, userId)));
    });
    return { ok: true };
  }

  async currentTarget(userId: string): Promise<NutritionTarget> {
    const [p] = await this.db.select().from(userProfiles).where(eq(userProfiles.userId, userId));
    return computeTarget(p ?? {});
  }

  async measurements(userId: string) {
    return this.db
      .select()
      .from(bodyMeasurements)
      .where(eq(bodyMeasurements.userId, userId))
      .orderBy(desc(bodyMeasurements.measuredAt))
      .limit(200);
  }

  /** Bir nechta a'zoning kunlik energiya ehtiyoji va maqsadi (porsiya hisobi uchun) */
  async dailyNeeds(userIds: string[]): Promise<Map<string, { kcal: number; goal: Goal }>> {
    const out = new Map<string, { kcal: number; goal: Goal }>();
    if (userIds.length === 0) return out;
    const rows = await this.db.select().from(userProfiles).where(inArray(userProfiles.userId, userIds));
    const byId = new Map(rows.map((r) => [r.userId, r]));
    for (const id of userIds) {
      const p = byId.get(id);
      out.set(id, { kcal: computeTarget(p ?? {}).kcal, goal: p?.goal ?? 'maintain' });
    }
    return out;
  }
}

@ApiTags('me')
@ApiBearerAuth()
@Controller('me')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  me(@CurrentUser() u: AuthUser) {
    return this.users.me(u.id);
  }

  @Patch()
  update(@CurrentUser() u: AuthUser, @Body() dto: UpdateMeDto) {
    return this.users.updateMe(u.id, dto);
  }

  /** Yosh, jins, bo'y, vazn, faollik, maqsad → kunlik kaloriya va makrolar */
  @Put('profile')
  profile(@CurrentUser() u: AuthUser, @Body() dto: ProfileDto) {
    return this.users.upsertProfile(u.id, dto);
  }

  /** Hisobni butunlay o'chirish (qaytarib bo'lmaydi) */
  @Delete()
  deleteAccount(@CurrentUser() u: AuthUser) {
    return this.users.deleteAccount(u.id);
  }

  @Get('measurements')
  measurements(@CurrentUser() u: AuthUser) {
    return this.users.measurements(u.id);
  }
}

@Module({ controllers: [UsersController], providers: [UsersService], exports: [UsersService] })
export class UsersModule {}
