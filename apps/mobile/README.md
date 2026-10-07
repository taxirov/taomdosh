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

Lokal API uchun `apps/api/.env` da `AUTH_TEST_PHONES=*` qo'ying — har qanday raqamga kod `111111`.

Tekshiruvlar: `flutter analyze`, `flutter test` (tarjima to'liqligi, formatlash, asosiy ekranlar soxta API bilan).

## APK yig'ish

```bash
flutter build apk --release --dart-define=API_URL=https://api.taomdosh.uz/v1
# → build/app/outputs/flutter-apk/app-release.apk — Telegram orqali yuborish mumkin
```

GitHub'da har bir push'da `mobile` workflow APK yig'adi: **Actions → mobile → Artifacts → taomdosh-apk**.
API manzili repo **Settings → Variables → `API_URL`** dan olinadi.

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
| `api/api_client.dart` | HTTP, tokenlar, 401 da avtomatik refresh |
| `state/session.dart` | Foydalanuvchi, guruhlar, tanlangan guruh, til (provider) |
| `i18n/` | `t('o‘zbekcha matn')` — ru/en lug'at, uz-Cyrl lotindan avtomatik |
| `theme.dart`, `widgets/common.dart` | Palitra, tugmalar, kartochkalar, yuklash/xato holatlari |
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
