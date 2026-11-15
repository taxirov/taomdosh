# Taomdosh — Claude uchun loyiha yo'riqnomasi

Foydalanuvchi bilan **o'zbek tilida** (lotin) gaplashing. Kod izohlari ham o'zbekcha.

## Mahsulot
Oila, talabalar va jamoalar uchun haftalik ovqatlanish ilovasi (tibbiy emas, wellness).
Guruh cookbook tanlaydi → tizim har a'zoga shaxsiy porsiya, xarid ro'yxati va xarajat ulushini hisoblaydi.
To'liq dizayn: claude.ai dagi "Taomdosh — System design va Database dizayn" hujjati.

## Qabul qilingan qarorlar (MVP)
- Faqat **Android** (APK Telegram orqali yaqinlarga tarqatiladi), Flutter.
- Backend: NestJS 11 + PostgreSQL 16 + Redis, ORM — **Drizzle** (Prisma ishlatilmaydi: dvigatel binarlari bulut muhitida yuklanmaydi).
- Server: **DigitalOcean** Droplet yoki uy laptopi + jprq.io tunneli (`deploy/setup.sh` `MODE=jprq`, `docker-compose.home.yml`), Docker Compose; API obrazi `ghcr.io/taxirov/taomdosh-api`. Ommaga chiqishdan oldin UzCloud ga ko'chiriladi (ma'lumot lokalizatsiyasi) — kod hostingga bog'lanmagan bo'lsin.
- Kirish: asosiy yo'l — **@taomdosh_bot** orqali bepul (`/auth/telegram/start` → botda Start + "Raqamni yuborish" → `/auth/telegram/check`; `auth/telegram-bot.service.ts`, long polling, `TELEGRAM_BOT_TOKEN`). Zaxira: telefon + Telegram Gateway kodi (pullik, ixtiyoriy). `AUTH_TEST_PHONES` dagi raqamlar uchun doimiy `AUTH_TEST_CODE`.
- MVP doirasi: kirish, profil (kaloriya), guruh, katalog (rasm, tahrirlash, moderatsiya), haftalik reja, qatnashuv ("yeyman/yemayman", mehmon), qulflash va porsiyalar, navbatchilik, xarid ro'yxati + zaxira, xarajat va qarzlar, bozor narxlari va taxminiy xarajat, oflayn kesh.
- Keyingi bosqich: oshpazlar, pullik retsept/kurs, to'lovlar, stories, push (FCM), real vaqt (WebSocket), ovoz berish.
- Narxlar manbasi (narxtahlil.uz) faqat backendda, alohida adapter ortida. **Ilovada va API javoblarida manba nomi ko'rsatilmaydi; telefon manbaga hech qachon to'g'ridan-to'g'ri murojaat qilmaydi.**
- Platforma admini: `users.role = admin` yoki telefoni `.env` dagi `ADMIN_PHONES` da (`requireAdmin`, `GET /me` → `isAdmin`). Guruh admini (`group_members.role`) bilan adashtirmang.
- Tillar: uz, uz-Cyrl (lotindan avtomatik — `domain/i18n.ts`), ru, en.

## Tuzilish (apps/api)
- `src/db/schema.ts` — barcha jadvallar (5 domen). O'zgartirgandan keyin: `npm run db:generate` → `npm run db:migrate`.
- `src/domain/*` — sof hisob-kitob funksiyalari (testlangan, `domain.spec.ts`, `prices.spec.ts`): nutrition (Mifflin–St Jeor), portions (Pᵢ = Eᵢ·sₘ·kᵢ/ΣK_d, qozon hajmi, kᵢ o'rganish), schedule (vaqt zonasi, pishirish/eslatma/qulflash vaqtlari), money (bo'lish, qarzlarni soddalashtirish), duty (navbat aylanishi), units (bozor uchun kg/dona; `toGrams` — teskari o'tkazish), prices (nomdan birlik/miqdor ajratish, 1 gramm narxi, taxminiy xarajat, sinxronlash jadvali).
- `src/common` — Drizzle/Redis provayderlari, JWT guard (`@Public()`, `@CurrentUser()`, `requireMember`, `requireAdmin`), `uploads.ts` (rasmni siqib diskka saqlash, `/v1/uploads/...` statik).
- `src/modules`: auth ✅, users ✅, groups ✅ (navbatchilik bilan), catalog ✅ (taom, cookbook, sevimlilar),
  meals ✅ (reja, qatnashuv, qulflash poller'i, oshpaz ko'rinishi, baho; `portion-planner.ts` — kutilgan/muzlatiladigan porsiyalar),
  shopping ✅ (xarid ro'yxati, zaxira, ledger; qator narxi, `shopping/estimate`, `plans/:planId/estimate`), expenses ✅ (ulushlar, balanslar, qarzlar),
  prices ✅ (`price-source.ts` — manba adapterlari: API va Excel; `prices.module.ts` — kunlik sinxronlash, `GET /prices`, guruh narxlari, admin import).
- Katalog: `PATCH/DELETE /dishes/:id`, `/cookbooks/:id` (muallif yoki admin), `POST/DELETE /dishes/:id/image`, moderatsiya `GET /admin/moderation`, `POST /admin/moderation/{dishes|cookbooks}/:id/{approve|reject}`.
- Profil: `DELETE /me` — hisobni o'chirish (`UsersService.deleteAccount`).
- `src/db/seed` — 134 masalliq, 46 taom (uz/ru/en), 3 cookbook, 35 ta masalliq↔narx bog'lanishi (`data/price-links.ts`); `npm run db:seed` qayta ishga tushirishga xavfsiz.
- `test/*.e2e-spec.ts` — `flow` (to'liq oqim), `prices`, `catalog`, `account` (`npm run test:e2e`, haqiqiy Postgres + Redis + seed kerak). Testlar tashqi saytga chiqmaydi: narx manbasi `PRICE_SOURCE` provayderi soxta adapter bilan almashtiriladi (`test/fixtures/prices-api.json`).
- Poller: `MEAL_LOCK_POLLER=off` uni o'chiradi (e2e testda `MealsService.lockDue(now)` qo'lda chaqiriladi).
- Narxlar: `PRICES_SYNC_ENABLED=on` bo'lsa har kuni 08:00 (Asia/Tashkent) da manbaga **bitta** so'rov (User-Agent `Taomdosh/1.0`); xatoda 15 daqiqadan 2 marta qayta urinadi, keyin kun tashlab ketiladi (oxirgi narxlar ishlatiladi); server kech yonsa o'sha kun uchun bir marta oladi. Holat `price_sync_runs` da, tarix `price_snapshots` da (har mahsulotga kuniga bitta yozuv). Testda `PricesService.syncIfDue(now)` qo'lda chaqiriladi.
- Fayllar: `UPLOADS_DIR` (Docker'da `/data/uploads`, `uploads` volume). Bazada nisbiy manzil (`/uploads/dishes/<id>-<hex>.jpg`), ilova uni API manzili bilan to'ldiradi (`mediaUrl`).
- Kelishuvlar: bola (boshqariladigan hisob) porsiyasi xarajatda ota-onaga yoziladi; qatnashuv belgilanmagan a'zo — "yeyman";
  xarid ro'yxatini qayta tuzish faqat avtomatik `pending` qatorlarni almashtiradi (qo'lda qo'shilgan va olinganlar qoladi);
  narx ustuvorligi: guruhning o'z narxi (`group_ingredient_prices`) → oxirgi bozor narxi; taxminiy summa 100 so'mgacha yaxlitlanadi, narxi yo'q masalliq jamiga kirmaydi (`missing` da qaytadi);
  taom/cookbook o'chirish yumshoq (`deleted_at`): katalogdan yo'qoladi, rejalashtirilgan mahallar va qo'llangan rejalar buzilmaydi; ommaviy kontent mazmuni o'zgarsa `pending` ga qaytadi;
  moderatsiya: tasdiqlash → `visibility=public, approved`; rad etish → `rejected`, muallif (va guruhi) uchun qoladi;
  hisob o'chirilganda shaxsiy ma'lumot tozalanadi, xarajat/porsiya tarixi "O‘chirilgan hisob" nomi bilan qoladi, guruh adminsiz qolmaydi.

## Qilinadigan ishlar (tartib bilan)
1–7-bandlar va narxlar / katalog (rasm, tahrir, moderatsiya) / oflayn kesh / UI yaxshilash bosqichi bajarildi ✅. Keyingi bosqich — "Qabul qilingan qarorlar"dagi ro'yxat (push, ovoz berish, oshpazlar, to'lovlar...).

1. ✅ **MealsModule** — `POST /groups/:id/plans` (cookbookni haftaga qo'llash → `meal_instances` + `meal_instance_dishes`, vaqtlar `computeMealTimes`, oshpaz `GroupsService.cookFor`); `GET /groups/:id/meals?from&to`; `PUT /meals/:id/attendance` (status, guests; `lockAt` dan keyin — rad); qulflash: har 30 s poller (`status=planned AND lock_at<=now`, `FOR UPDATE SKIP LOCKED`) bitta tranzaksiyada porsiyalarni (`computePortions`) muzlatadi, `total_servings` to'ldiradi, zaxiradan masalliq ayiradi (`pantry_movements` reason=cooking); `GET /meals/:id/cook-view` (navbatchiga: har a'zo grammi + masshtablangan retsept, vazn/maqsad ko'rsatilmaydi); `POST /meals/:id/feedback` (`updateFactor`).
2. ✅ **ShoppingModule** — ehtiyoj = davrdagi qulflanmagan mahallar (kutilgan porsiyalar bilan) masalliqlari − zaxira; `POST .../shopping/regenerate`, ro'yxat (`toDisplay`), qo'lda qo'shish, "olindi" → zaxiraga (`purchase`); zaxira ro'yxati va tuzatish.
3. ✅ **ExpensesModule** — xarajat qo'shish; `shared_pot` — ulush yo'q; `by_portion` — davrdagi `meal_portions.kcal` ulushiga ko'ra `splitByWeights` (mehmon → host); balanslar va `simplifyDebts`; `settlements`.
4. ✅ **Seed** (`src/db/seed/seed.ts`) — ~120 masalliq (kkal/100 g, oqsil, yog', uglevod, dona og'irligi) va 30–50 mahalliy taom (palov, mastava, sho'rva, lag'mon, manti, chuchvara, dimlama, norin, somsa, qovurma, salatlar, nonushtalar) uz/ru/en, 2–3 tayyor haftalik cookbook (moderation=approved, visibility=public).
5. ✅ e2e test (`test/`): kirish → guruh → cookbook qo'llash → qatnashuv → qulflash → xarid → xarajat → qarzlar.
6. ✅ `Dockerfile` + `docker-compose.yml` (api, postgres, redis, caddy HTTPS) va DigitalOcean'ga joylash yo'riqnomasi (`deploy/README.md`).
7. ✅ **Flutter ilova** (`apps/mobile`) — "Taomdosh UI" dizaynidagi MVP ekranlari (oshpaz/kurs/stories keyingi bosqichda); terrakota/krem/xantal palitrasi.

## Tuzilish (apps/mobile)
- `lib/api/api_client.dart` — HTTP + refresh, `upload()` (multipart), `mediaUrl()`; `API_URL` `--dart-define` orqali (standart `http://10.0.2.2:3000/v1`), foydalanuvchi Profil → "Server manzili" da o'zgartira oladi (`currentApiBase`, `normalizeServerUrl`).
- `lib/api/cache.dart` — GET javoblari keshi (oflayn): tarmoq xatosida oxirgi javob qaytadi, `api.offline` yonadi va `OfflineBar` barcha ekranlar tepasida chiqadi (`app.dart`). Chiqish/server almashganda kesh tozalanadi.
- `lib/state/session.dart` — provider holati (me, guruhlar, tanlangan guruh, til).
- `lib/i18n` — barcha matnlar `t('o‘zbekcha')`; yangi matn qo'shsangiz `dictionary.dart` ga ru/en ham yozing (`test/i18n_test.dart` tekshiradi).
- `lib/screens/*` — ekranlar (`admin/moderation.dart` — platforma admini uchun); umumiy vidjetlar `lib/widgets/common.dart`. Shriftlar `assets/fonts` da (google_fonts ishlatilmaydi).
- UI kelishuvlari ("Taomdosh UI" dizayni): ekran chekkasi `fromLTRB(20, 24, 20, …)`; kartochka radiusi 16–20; asosiy tugma 54 px; **bosiladigan joy kamida 48 px** (`CircleBtn`, `ChoicePill`, `Segmented`, `AppSwitch`, `CheckMark`); sahifa o'tishi faqat `route()` orqali; yuklanishda `Skeleton`/`SkeletonList` (`Loader(skeleton:)`), bo'sh holatda `EmptyView(title, text, action)`, xatoda `ErrorView` ("Qayta urinish"); ro'yxat qatorlari `KeyValueRow`, plitkalar `TileGrid` + `QuickTile`, ko'rsatkichlar `StatTile`; rasmi yo'q taom — `DishImage` zaxira ko'rinishi. Takrorlanadigan qism bo'lsa — avval `common.dart` ga chiqaring.
- Tor ekran (360 px) va katta shrift: qat'iy nisbatli `GridView` va bir qatorga majburlangan `Row` ishlatmang — `Wrap`, `Flexible`, `FittedBox`.
- Testlar: `test/helpers.dart` (`pumpScreen` — soxta API, haqiqiy shriftlar, ekran o'lchami va shrift masshtabi); har ekran testi 360 px + 1.3× shriftda `takeException()` ni tekshiradi (`screens_test.dart`, `shopping_test.dart`, `catalog_test.dart`, `offline_test.dart`).
- Tekshiruv: `flutter analyze`, `flutter test`, `dart format` (kenglik 140). Bu bulut muhitida Android SDK yuklanmaydi — APK GitHub Actions (`.github/workflows/mobile.yml`) da yig'iladi: `API_URL` = `api_url` kiritmasi → repo o'zgaruvchisi `API_URL` → `https://taomdosh.jprq.app/v1`.

## Lokal ishga tushirish
README.md ga qarang. Testlar: `cd apps/api && npm test`, `npm run test:e2e`; tiplar: `npm run typecheck`. Ilova: `cd apps/mobile && flutter test`.
