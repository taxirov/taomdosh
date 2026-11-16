# Taomdosh — Android ilova (Flutter)

UI "Taomdosh UI" dizayni asosida: terrakota / krem / xantal palitrasi, sarlavhalar Fraunces, matn Manrope
(shriftlar ilova ichida — internetsiz ham ishlaydi).

## Ishga tushirish

```bash
cd apps/mobile
flutter pub get
flutter run                                   # emulyator: API http://10.0.2.2:3000/v1 (kompyuterdagi lokal server)
flutter run --dart-define=API_URL=http://192.168.1.10:3000/v1   # haqiqiy telefon, bir Wi-Fi tarmog'ida
```

Kirish: "Telegram orqali kirish" (@taomdosh_bot, bepul) yoki "Raqam va kod bilan kirish" (test raqamlari).
Lokal API uchun `apps/api/.env` da `AUTH_TEST_PHONES=*` qo'ying — har qanday raqamga kod `111111`.

Tekshiruvlar: `flutter analyze`, `flutter test` (tarjima to'liqligi, formatlash, asosiy ekranlar soxta API bilan).

## APK yig'ish

```bash
flutter build apk --release --dart-define=API_URL=https://taomdosh.jprq.app/v1
# → build/app/outputs/flutter-apk/app-release.apk — Telegram orqali yuborish mumkin
```

GitHub'da har bir push'da `mobile` workflow APK yig'adi: **Actions → mobile → Artifacts → taomdosh-apk**.
API manzili: qo'lda ishga tushirishda `api_url` maydoni → repo **Settings → Variables → `API_URL`** →
standart `https://taomdosh.jprq.app/v1` (uy serveri + jprq; subdomen boshqacha bo'lsa `API_URL` ni
`https://<subdomen>.jprq.app/v1` qilib qo'ying).

Yig'ilgan APK'da ham manzilni o'zgartirish mumkin: **Profil → Server manzili** (yoki kirish ekranining pastida).
Standart qiymat — yig'ishdagi `API_URL`; o'zgartirilsa lokal ma'lumot tozalanadi va qaytadan kirish kerak.

## Oflayn ishlash

Barcha o'qish so'rovlari javobi telefonda saqlanadi (`lib/api/cache.dart`): bugungi va haftalik mahallar, xarid
ro'yxati, narxlar, guruh ma'lumotlari. Internet bo'lmasa oxirgi saqlangan ma'lumot ko'rsatiladi va ekran tepasida
"Oflayn" belgisi chiqadi. O'zgartirishlar (qatnashuv, "olindi", xarajat) internet bilan bajariladi.

### Imzo kaliti (muhim)

Telegram orqali tarqatilgan APK yangilanishi uchun har bir versiya **bir xil kalit** bilan imzolanishi kerak,
aks holda foydalanuvchi eski ilovani o'chirib, qayta o'rnatishi kerak bo'ladi. Bir marta kalit yarating:

```bash
keytool -genkey -v -keystore upload.jks -keyalg RSA -keysize 2048 -validity 10000 -alias taomdosh
```

- Lokal: `android/key.properties` (gitga qo'shilmaydi):
  ```
  storeFile=/to'liq/yo'l/upload.jks
  storePassword=...
  keyAlias=taomdosh
  keyPassword=...
  ```
- CI: repo **Settings → Secrets**: `ANDROID_KEYSTORE_BASE64` (`base64 -w0 upload.jks`), `ANDROID_KEYSTORE_PASSWORD`,
  `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`.

Kalit bo'lmasa, APK debug kalit bilan imzolanadi (sinov uchun yetarli). `upload.jks` ni yo'qotmang va hech kimga bermang.

## Tuzilish (`lib/`)

| Fayl | Nima |
|---|---|
| `api/api_client.dart` | HTTP, tokenlar, 401 da avtomatik refresh, fayl yuklash, server manzili |
| `api/cache.dart` | GET javoblarining lokal nusxasi (oflayn rejim) |
| `state/session.dart` | Foydalanuvchi, guruhlar, tanlangan guruh, til (provider) |
| `i18n/` | `t('o‘zbekcha matn')` — ru/en lug'at, uz-Cyrl lotindan avtomatik |
| `theme.dart`, `widgets/common.dart` | Palitra, tugmalar, kartochkalar, skeleton / bo'sh / xato / oflayn holatlari, plitkalar |
| `widgets/image_pick.dart` | Kamera/galereyadan rasm tanlash |
| `screens/admin` | Moderatsiya (platforma admini) |
| `screens/auth` | Splash, xush kelibsiz (til tanlash), telefon, Telegram kodi, profil, kunlik reja |
| `screens/today` | Bugun, qatnashuv va mehmonlar, navbatchi ekrani (porsiyalar, qulflash, baho), eslatmalar |
| `screens/cookbooks` | Cookbooklar, cookbook ichida (guruhga qo'llash), cookbook yaratish |
| `screens/dishes` | Taomlar katalogi, taom sahifasi, taom qo'shish |
| `screens/group` | Guruh (a'zolar, bola qo'shish, taklif kodi), navbatchilik, xarid, xarajat, zaxira, ovqat vaqtlari |
| `screens/profile` | Profil, vazn va bo'y |

## MVP ga kirmagan ekranlar

Dizayndagi oshpaz sahifasi, pullik retsept, kurslar/dars va homiy hikoyalari keyingi bosqichda (backend ham yo'q).
Bildirishnomalar hozircha ilova ichidagi ro'yxat (push/FCM keyingi bosqichda).
Taom rasmi/videosini yuklash yo'q — video uchun havola kiritiladi.
