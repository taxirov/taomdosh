# Taomdosh

Oila, talabalar va jamoalar uchun haftalik ovqatlanish ilovasi: guruh cookbook tanlaydi,
tizim har bir a'zoga shaxsiy porsiya, xarid ro'yxati va xarajat ulushini hisoblaydi.

Loyiha tuzilishi:

| Papka | Nima |
|---|---|
| `apps/api` | Backend — NestJS + PostgreSQL 16 (Drizzle ORM) + Redis |
| `apps/mobile` | Flutter ilova (Android) — [apps/mobile/README.md](apps/mobile/README.md) |
| `apps/admin` | Veb admin panel — React + Vite, API bilan bitta portda `/admin/` manzilida |

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
| Profil | `GET/PATCH /me`, `DELETE /me` (hisobni o'chirish), `PUT /me/profile`, `GET /me/measurements` |
| Guruh | `POST/GET /groups`, `POST /groups/join`, `GET/PATCH /groups/:id`, a'zolar, `PUT /groups/:id/meal-settings`, navbatchilik `/groups/:id/duty…` |
| Katalog | `GET /ingredients`, `GET/POST /dishes`, `PATCH/DELETE /dishes/:id`, `POST/DELETE /dishes/:id/image` (rasm → `/v1/uploads/…`), `/dishes/:id/favorite`, `GET/POST /cookbooks`, `PATCH/DELETE /cookbooks/:id` |
| Moderatsiya (admin) | `GET /admin/moderation`, `POST /admin/moderation/{dishes\|cookbooks}/:id/{approve\|reject}` |
| Admin panel | `GET /admin/stats`, `GET /admin/users`, `GET/PATCH /admin/users/:id` (rol, bloklash), `GET /admin/groups`, `GET /admin/groups/:id`, `GET /admin/{dishes\|cookbooks}`, `PUT /admin/{dishes\|cookbooks}/:id/moderation`, `POST /admin/{dishes\|cookbooks}/:id/restore`, `GET/POST /admin/ingredients`, `PATCH /admin/ingredients/:id`, `PUT /admin/ingredients/:id/price-link`, `GET /admin/prices`, `GET /admin/prices/:productId/history` |
| Reja va mahallar | `POST/GET /groups/:id/plans`, `DELETE /groups/:id/plans/:planId`, `GET /groups/:id/meals?from&to`, `GET /meals/:id`, `PUT /meals/:id/attendance`, `POST /meals/:id/lock`, `GET /meals/:id/cook-view`, `POST /meals/:id/feedback` |
| Xarid va zaxira | `POST /groups/:id/shopping/regenerate`, `GET/POST /groups/:id/shopping`, `PATCH/DELETE /groups/:id/shopping/:itemId`, `GET /groups/:id/pantry`, `PUT /groups/:id/pantry/:ingredientId`, `GET /groups/:id/pantry/movements` |
| Xarajat | `POST/GET /groups/:id/expenses`, `POST …/expenses/:expenseId/recalculate`, `DELETE …/expenses/:expenseId`, `GET /groups/:id/balances`, `POST/GET /groups/:id/settlements` |
| Narxlar | `GET /prices`, `GET /groups/:id/prices`, `PUT/DELETE /groups/:id/prices/:ingredientId`, admin: `POST /admin/prices/import` (Excel), `POST /admin/prices/sync` |
| Holat | `GET /health` |

To'liq sxema: `http://localhost:3000/docs`.

## Admin panel

Platforma adminlari uchun veb panel: moderatsiya, taom va cookbooklar, masalliqlar (kaloriya, tarjimalar, bozor narxiga
bog'lash), bozor narxlari (qo'lda yangilash, Excel yuklash, tarix), foydalanuvchilar (admin roli, bloklash) va guruhlar.

- Manzil: API bilan bitta portda — `http://localhost:3000/admin/` (serverda `https://<domen>/admin/`, tunnel orqali ham).
- Kirish: @taomdosh_bot yoki telefon + kod. Faqat platforma adminlari: `.env` dagi `ADMIN_PHONES` yoki panelda admin roli berilganlar.
- Sog'liq ma'lumotlari (vazn, maqsad, kaloriya) panelda ko'rsatilmaydi.

```bash
cd apps/admin && npm install
npm run build        # dist/ → API uni /admin/ da beradi (apps/api ichidan ishga tushirilganda)
npm run dev          # ishlab chiqish: http://localhost:5173/admin/ (/v1 → localhost:3000)
```

## Mobil ilova

```bash
cd apps/mobile && flutter pub get && flutter run      # emulyator lokal API ga ulanadi
```

APK: GitHub **Actions → mobile → Artifacts**. Batafsil: [apps/mobile/README.md](apps/mobile/README.md).

## Serverga joylash

`docker-compose.yml` (api, postgres, redis, caddy HTTPS) — yo'riqnoma: [deploy/README.md](deploy/README.md).

`.env` dagi qo'shimcha sozlamalar: `PRICES_SYNC_ENABLED` (kunlik narxlar, standart `on`), `ADMIN_PHONES`
(admin panel `/admin/`, moderatsiya va narx faylini yuklash huquqi). Docker obrazi admin panelni ham o'z ichiga oladi
(qo'shimcha kontekst `adminsrc=apps/admin`). Taom rasmlari `uploads` volume'ida saqlanadi.
