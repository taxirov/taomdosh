import { Body, Controller, Get, Injectable, Module, Patch, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsDateString, IsIn, IsInt, IsNumber, IsOptional, IsString, Length, Max, Min } from 'class-validator';
import { desc, eq, inArray } from 'drizzle-orm';
import { AuthUser, CurrentUser } from '../../common/auth';
import { Db, InjectDb } from '../../common/infra.module';
import { activityLevel, bodyMeasurements, goalEnum, nutritionTargets, sexEnum, userProfiles, users } from '../../db/schema';
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

@Injectable()
export class UsersService {
  constructor(@InjectDb() private readonly db: Db) {}

  async me(userId: string) {
    const user = await this.db.query.users.findFirst({ where: eq(users.id, userId), with: { profile: true } });
    const target = await this.currentTarget(userId);
    return { ...user, target };
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

  @Get('measurements')
  measurements(@CurrentUser() u: AuthUser) {
    return this.users.measurements(u.id);
  }
}

@Module({ controllers: [UsersController], providers: [UsersService], exports: [UsersService] })
export class UsersModule {}
