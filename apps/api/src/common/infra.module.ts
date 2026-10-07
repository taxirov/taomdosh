import { Global, Inject, Injectable, Module, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import Redis from 'ioredis';
import { Pool } from 'pg';
import * as schema from '../db/schema';

export type Db = NodePgDatabase<typeof schema>;
export const DB = Symbol('DB');
export const REDIS = Symbol('REDIS');
const PG_POOL = Symbol('PG_POOL');

/** @InjectDb() — Drizzle bazasi */
export const InjectDb = () => Inject(DB);
/** @InjectRedis() — ioredis klient */
export const InjectRedis = () => Inject(REDIS);

@Injectable()
class Closer implements OnModuleDestroy {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}
  async onModuleDestroy() {
    await this.pool.end();
    this.redis.disconnect();
  }
}

@Global()
@Module({
  providers: [
    {
      provide: PG_POOL,
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => new Pool({ connectionString: cfg.getOrThrow('DATABASE_URL'), max: 10 }),
    },
    { provide: DB, inject: [PG_POOL], useFactory: (pool: Pool) => drizzle(pool, { schema }) },
    {
      provide: REDIS,
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => new Redis(cfg.get('REDIS_URL') ?? 'redis://localhost:6379', { maxRetriesPerRequest: 3 }),
    },
    Closer,
  ],
  exports: [DB, REDIS],
})
export class InfraModule {}
