# Taomdosh

Oila, talabalar va jamoalar uchun haftalik ovqatlanish ilovasi: guruh cookbook tanlaydi,
tizim har bir a'zoga shaxsiy porsiya, xarid ro'yxati va xarajat ulushini hisoblaydi.

Loyiha tuzilishi:

| Papka | Nima |
|---|---|
| `apps/api` | Backend — NestJS + PostgreSQL 16 (Drizzle ORM) + Redis |
| `apps/mobile` | Flutter ilova (Android) — keyingi bosqich |

Arxitektura va ma'lumotlar bazasi hujjati: "Taomdosh — System design va Database dizayn".

## Backend'ni lokal ishga tushirish

```bash
cd apps/api
cp .env.example .env          # AUTH_TEST_PHONES=* — lokal test uchun
docker compose -f ../../docker-compose.dev.yml up -d   # Postgres + Redis
npm install
npm run db:migrate
npm run db:seed               # masalliqlar, taomlar, tayyor cookbooklar
npm run start:dev             # http://localhost:3000/docs — API hujjati
npm test                      # hisob-kitob mantiqi testlari
```
