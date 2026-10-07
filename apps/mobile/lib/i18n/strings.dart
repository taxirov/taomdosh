/// Interfeys matnlari. Kalit — o'zbekcha (lotin) matnning o'zi; ru/en lug'atda,
/// uz-Cyrl lotindan avtomatik o'giriladi. Topilmasa — o'zbekcha ko'rsatiladi.
///   t('Salom, {name}', {'name': 'Aziz'})
library;

import 'dictionary.dart';
import 'translit.dart';

const supportedLocales = ['uz', 'uz-Cyrl', 'ru', 'en'];
const localeNames = {'uz': 'O‘zbekcha', 'uz-Cyrl': 'Ўзбекча', 'ru': 'Русский', 'en': 'English'};

String currentLocale = 'uz';

final _ph = RegExp(r'\{(\w+)\}');

/// Kirillga o'girilmaydigan yoki maxsus yoziladigan so'zlar
const _cyrlWords = {'Cookbook': 'Кукбук', 'cookbook': 'кукбук', 'Cookbooklar': 'Кукбуклар', 'Cookbookda': 'Кукбукда'};
const _keepLatin = {'Telegram', 'Telegram’da', 'Telegram’dagi', 'YouTube', 'Instagram', 'Verification', 'Codes'};
final _word = RegExp(r"[A-Za-z][A-Za-z‘’'ʻ`]*");

/// Interfeys matni uchun lotin → kirill: brend nomlari lotincha qoladi
String toCyrillicUi(String s) => s.splitMapJoin(
  _word,
  onMatch: (m) {
    final w = m[0]!;
    if (_cyrlWords.containsKey(w)) return _cyrlWords[w]!;
    if (_keepLatin.contains(w) || _keepLatin.any((k) => w.startsWith(k))) return w;
    return uzLatinToCyrillic(w);
  },
  onNonMatch: uzLatinToCyrillic,
);

String t(String uz, [Map<String, Object?> args = const {}]) {
  String template;
  switch (currentLocale) {
    case 'ru':
      template = ru[uz] ?? uz;
    case 'en':
      template = en[uz] ?? uz;
    case 'uz-Cyrl':
      // O'rinbosarlarni ({name}) o'girmaslik uchun faqat matn qismlari o'giriladi
      template = uz.splitMapJoin(_ph, onMatch: (m) => m[0]!, onNonMatch: toCyrillicUi);
    default:
      template = uz;
  }
  if (args.isEmpty) return template;
  return template.replaceAllMapped(_ph, (m) => '${args[m[1]] ?? m[0]}');
}

/// Qisqa hafta kunlari (0 = dushanba)
List<String> weekdaysShort() => [t('Du'), t('Se'), t('Ch'), t('Pa'), t('Ju'), t('Sh'), t('Ya')];

List<String> weekdaysLong() => [t('Dushanba'), t('Seshanba'), t('Chorshanba'), t('Payshanba'), t('Juma'), t('Shanba'), t('Yakshanba')];

List<String> monthsGenitive() => [
  t('yanvar'),
  t('fevral'),
  t('mart'),
  t('aprel'),
  t('may'),
  t('iyun'),
  t('iyul'),
  t('avgust'),
  t('sentabr'),
  t('oktabr'),
  t('noyabr'),
  t('dekabr'),
];

String mealTypeName(String type) => switch (type) {
  'breakfast' => t('Nonushta'),
  'lunch' => t('Tushlik'),
  'dinner' => t('Kechki ovqat'),
  'snack' => t('Yengil tamaddi'),
  _ => type,
};

const mealOrder = ['breakfast', 'lunch', 'snack', 'dinner'];
