# Taomdosh — Claude uchun loyiha yo'riqnomasi

Foydalanuvchi bilan **o'zbek tilida** (lotin) gaplashing. Kod izohlari ham o'zbekcha.

## Mahsulot
Oila, talabalar va jamoalar uchun haftalik ovqatlanish ilovasi (tibbiy emas, wellness).
Guruh cookbook tanlaydi → tizim har a'zoga shaxsiy porsiya, xarid ro'yxati va xarajat ulushini hisoblaydi.
To'liq dizayn: claude.ai dagi "Taomdosh — System design va Database dizayn" hujjati.

## Qabul qilingan qarorlar (MVP)
- Faqat **Android** (APK Telegram orqali yaqinlarga tarqatiladi), Flutter.
- Backend: NestJS 11 + PostgreSQL 16 + Redis, ORM — **Drizzle** (Prisma ishlatilmaydi: dvigatel binarlari bulut muhitida yuklanmaydi).
- Server: **DigitalOcean** Droplet (Frankfurt, 2 GB), Docker Compose. Ommaga chiqishdan oldin UzCloud ga ko'chiriladi (ma'lumot lokalizatsiyasi) — kod hostingga bog'lanmagan bo'lsin.
- Kirish: asosiy yo'l — **@taomdosh_bot** orqali bepul (`/auth/telegram/start` → botda Start + "Raqamni yuborish" → `/auth/telegram/check`; `auth/telegram-bot.service.ts`, long polling, `TELEGRAM_BOT_TOKEN`). Zaxira: telefon + Telegram Gateway kodi (pullik, ixtiyoriy). `AUTH_TEST_PHONES` dagi raqamlar uchun doimiy `AUTH_TEST_CODE`.
- MVP doirasi: kirish, profil (kaloriya), guruh, katalog, haftalik reja, qatnashuv ("yeyman/yemayman", mehmon), qulflash va porsiyalar, navbatchilik, xarid ro'yxati + zaxira, xarajat va qarzlar.
- Keyingi bosqich: oshpazlar, pullik retsept/kurs, to'lovlar, stories, push (FCM), real vaqt (WebSocket).
- Tillar: uz, uz-Cyrl (lotindan avtomatik — `domain/i18n.ts`), ru, en.

## Tuzilish (apps/api)
- `src/db/schema.ts` — barcha jadvallar (5 domen). O'zgartirgandan keyin: `npm run db:generate` → `npm run db:migrate`.
- `src/domain/*` — sof hisob-kitob funksiyalari (testlangan, `domain.spec.ts`): nutrition (Mifflin–St Jeor), portions (Pᵢ = Eᵢ·sₘ·kᵢ/ΣK_d, qozon hajmi, kᵢ o'rganish), schedule (vaqt zonasi, pishirish/eslatma/qulflash vaqtlari), money (bo'lish, qarzlarni soddalashtirish), duty (navbat aylanishi), units (bozor uchun kg/dona).
- `src/common` — Drizzle/Redis provayderlari, JWT guard (`@Public()`, `@CurrentUser()`, `requireMember`).
- `src/modules`: auth ✅, users ✅, groups ✅ (navbatchilik bilan), catalog ✅ (taom, cookbook, sevimlilar),
  meals ✅ (reja, qatnashuv, qulflash poller'i, oshpaz ko'rinishi, baho; `portion-planner.ts` — kutilgan/muzlatiladigan porsiyalar),
  shopping ✅ (xarid ro'yxati, zaxira, ledger), expenses ✅ (ulushlar, balanslar, qarzlar).
- `src/db/seed` — 134 masalliq, 46 taom (uz/ru/en), 3 cookbook; `npm run db:seed` qayta ishga tushirishga xavfsiz.
- `test/flow.e2e-spec.ts` — to'liq oqim (`npm run test:e2e`, haqiqiy Postgres + Redis + seed kerak).
- Poller: `MEAL_LOCK_POLLER=off` uni o'chiradi (e2e testda `MealsService.lockDue(now)` qo'lda chaqiriladi).
- Kelishuvlar: bola (boshqariladigan hisob) porsiyasi xarajatda ota-onaga yoziladi; qatnashuv belgilanmagan a'zo — "yeyman";
  xarid ro'yxatini qayta tuzish faqat avtomatik `pending` qatorlarni almashtiradi (qo'lda qo'shilgan va olinganlar qoladi).

## Qilinadigan ishlar (tartib bilan)
1–7-bandlar bajarildi ✅. Keyingi bosqich — "Qabul qilingan qarorlar"dagi ro'yxat (push, oshpazlar, to'lovlar...).

1. ✅ **MealsModule** — `POST /groups/:id/plans` (cookbookni haftaga qo'llash → `meal_instances` + `meal_instance_dishes`, vaqtlar `computeMealTimes`, oshpaz `GroupsService.cookFor`); `GET /groups/:id/meals?from&to`; `PUT /meals/:id/attendance` (status, guests; `lockAt` dan keyin — rad); qulflash: har 30 s poller (`status=planned AND lock_at<=now`, `FOR UPDATE SKIP LOCKED`) bitta tranzaksiyada porsiyalarni (`computePortions`) muzlatadi, `total_servings` to'ldiradi, zaxiradan masalliq ayiradi (`pantry_movements` reason=cooking); `GET /meals/:id/cook-view` (navbatchiga: har a'zo grammi + masshtablangan retsept, vazn/maqsad ko'rsatilmaydi); `POST /meals/:id/feedback` (`updateFactor`).
2. ✅ **ShoppingModule** — ehtiyoj = davrdagi qulflanmagan mahallar (kutilgan porsiyalar bilan) masalliqlari − zaxira; `POST .../shopping/regenerate`, ro'yxat (`toDisplay`), qo'lda qo'shish, "olindi" → zaxiraga (`purchase`); zaxira ro'yxati va tuzatish.
3. ✅ **ExpensesModule** — xarajat qo'shish; `shared_pot` — ulush yo'q; `by_portion` — davrdagi `meal_portions.kcal` ulushiga ko'ra `splitByWeights` (mehmon → host); balanslar va `simplifyDebts`; `settlements`.
4. ✅ **Seed** (`src/db/seed/seed.ts`) — ~120 masalliq (kkal/100 g, oqsil, yog', uglevod, dona og'irligi) va 30–50 mahalliy taom (palov, mastava, sho'rva, lag'mon, manti, chuchvara, dimlama, norin, somsa, qovurma, salatlar, nonushtalar) uz/ru/en, 2–3 tayyor haftalik cookbook (moderation=approved, visibility=public).
5. ✅ e2e test (`test/`): kirish → guruh → cookbook qo'llash → qatnashuv → qulflash → xarid → xarajat → qarzlar.
6. ✅ `Dockerfile` + `docker-compose.yml` (api, postgres, redis, caddy HTTPS) va DigitalOcean'ga joylash yo'riqnomasi (`deploy/README.md`).
7. ✅ **Flutter ilova** (`apps/mobile`) — "Taomdosh UI" dizaynidagi MVP ekranlari (oshpaz/kurs/stories keyingi bosqichda); terrakota/krem/xantal palitrasi.

## Tuzilish (apps/mobile)
- `lib/api/api_client.dart` — HTTP + refresh; `API_URL` `--dart-define` orqali (standart `http://10.0.2.2:3000/v1`).
- `lib/state/session.dart` — provider holati (me, guruhlar, tanlangan guruh, til).
- `lib/i18n` — barcha matnlar `t('o‘zbekcha')`; yangi matn qo'shsangiz `dictionary.dart` ga ru/en ham yozing (`test/i18n_test.dart` tekshiradi).
- `lib/screens/*` — ekranlar; umumiy vidjetlar `lib/widgets/common.dart`. Shriftlar `assets/fonts` da (google_fonts ishlatilmaydi).
- Tekshiruv: `flutter analyze`, `flutter test`, `dart format` (kenglik 140). Bu bulut muhitida Android SDK yuklanmaydi — APK GitHub Actions (`.github/workflows/mobile.yml`) da yig'iladi.

## Lokal ishga tushirish
README.md ga qarang. Testlar: `cd apps/api && npm test`, `npm run test:e2e`; tiplar: `npm run typecheck`. Ilova: `cd apps/mobile && flutter test`.
