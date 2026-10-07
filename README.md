# Taomdosh

Oila, talabalar va jamoalar uchun haftalik ovqatlanish ilovasi: guruh cookbook tanlaydi,
tizim har bir a'zoga shaxsiy porsiya, xarid ro'yxati va xarajat ulushini hisoblaydi.

Loyiha tuzilishi:

| Papka | Nima |
|---|---|
| `apps/api` | Backend — NestJS + PostgreSQL 16 (Drizzle ORM) + Redis |
| `apps/mobile` | Flutter ilova (Android) — [apps/mobile/README.md](apps/mobile/README.md) |

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
npm run test:e2e              # to'liq oqim (Postgres, Redis va seed kerak)
```

## API (asosiy yo'llar, `/v1` prefiksi bilan)

| Bo'lim | Yo'llar |
|---|---|
| Kirish | `POST /auth/request-code`, `/auth/verify`, `/auth/refresh`, `/auth/logout` |
| Profil | `GET/PATCH /me`, `PUT /me/profile`, `GET /me/measurements` |
| Guruh | `POST/GET /groups`, `POST /groups/join`, `GET/PATCH /groups/:id`, a'zolar, `PUT /groups/:id/meal-settings`, navbatchilik `/groups/:id/duty…` |
| Katalog | `GET /ingredients`, `GET/POST /dishes`, `/dishes/:id/favorite`, `GET/POST /cookbooks` |
| Reja va mahallar | `POST/GET /groups/:id/plans`, `DELETE /groups/:id/plans/:planId`, `GET /groups/:id/meals?from&to`, `GET /meals/:id`, `PUT /meals/:id/attendance`, `POST /meals/:id/lock`, `GET /meals/:id/cook-view`, `POST /meals/:id/feedback` |
| Xarid va zaxira | `POST /groups/:id/shopping/regenerate`, `GET/POST /groups/:id/shopping`, `PATCH/DELETE /groups/:id/shopping/:itemId`, `GET /groups/:id/pantry`, `PUT /groups/:id/pantry/:ingredientId`, `GET /groups/:id/pantry/movements` |
| Xarajat | `POST/GET /groups/:id/expenses`, `POST …/expenses/:expenseId/recalculate`, `DELETE …/expenses/:expenseId`, `GET /groups/:id/balances`, `POST/GET /groups/:id/settlements` |
| Holat | `GET /health` |

To'liq sxema: `http://localhost:3000/docs`.

## Mobil ilova

```bash
cd apps/mobile && flutter pub get && flutter run      # emulyator lokal API ga ulanadi
```

APK: GitHub **Actions → mobile → Artifacts**. Batafsil: [apps/mobile/README.md](apps/mobile/README.md).

## Serverga joylash

`docker-compose.yml` (api, postgres, redis, caddy HTTPS) — yo'riqnoma: [deploy/README.md](deploy/README.md).
