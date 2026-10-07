/**
 * Migratsiyalarni qo'llash: `npm run db:migrate` (lokal) yoki konteyner ishga tushganda.
 */
import 'dotenv/config';
import path from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  await migrate(drizzle(pool), { migrationsFolder: path.resolve(__dirname, '../../drizzle') });
  await pool.end();
  console.log('Migratsiyalar qo\'llandi');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
