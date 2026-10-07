import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard } from './common/auth';
import { InfraModule } from './common/infra.module';
import { AuthModule } from './modules/auth/auth.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { GroupsModule } from './modules/groups/groups.module';
import { UsersModule } from './modules/users/users.module';

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
    // TODO (keyingi sessiya): MealsModule, ShoppingModule, ExpensesModule — CLAUDE.md ga qarang
  ],
  providers: [{ provide: APP_GUARD, useClass: JwtAuthGuard }],
})
export class AppModule {}
