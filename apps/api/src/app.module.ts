import { Controller, Get, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { sql } from 'drizzle-orm';
import { JwtAuthGuard, Public } from './common/auth';
import { Db, InfraModule, InjectDb } from './common/infra.module';
import { AuthModule } from './modules/auth/auth.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { GroupsModule } from './modules/groups/groups.module';
import { MealsModule } from './modules/meals/meals.module';
import { ShoppingModule } from './modules/shopping/shopping.module';
import { ExpensesModule } from './modules/expenses/expenses.module';
import { UsersModule } from './modules/users/users.module';

/** Konteyner va yuklama muvozanatlagich uchun: baza ulanishini ham tekshiradi */
@Controller('health')
class HealthController {
  constructor(@InjectDb() private readonly db: Db) {}

  @Public()
  @Get()
  async health() {
    await this.db.execute(sql`select 1`);
    return { ok: true };
  }
}

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => ({ secret: cfg.getOrThrow<string>('JWT_ACCESS_SECRET') }),
    }),
    InfraModule,
    AuthModule,
    UsersModule,
    GroupsModule,
    CatalogModule,
    MealsModule,
    ShoppingModule,
    ExpensesModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: JwtAuthGuard }],
})
export class AppModule {}
