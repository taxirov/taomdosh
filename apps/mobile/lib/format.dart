import 'api/api_client.dart';
import 'i18n/strings.dart';

/// 1240000 → "1 240 000"
String groupDigits(num n) {
  final neg = n < 0;
  final s = n.abs().round().toString();
  final b = StringBuffer();
  for (var i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 == 0) b.write(' ');
    b.write(s[i]);
  }
  return '${neg ? '−' : ''}$b';
}

String money(num n) => '${groupDigits(n)} ${t('so‘m')}';

/// Kasr: 1.5 → "1,5"
String dec(num n, [int digits = 1]) {
  final s = n.toStringAsFixed(digits);
  final trimmed = s.contains('.') ? s.replaceFirst(RegExp(r'\.?0+$'), '') : s;
  return trimmed.replaceAll('.', ',');
}

/// API dan kelgan {qty, unit} → "1,2 kg", "6 dona"
String displayQty(Json? d, {int? fallbackG}) {
  if (d == null) return fallbackG == null ? '' : '$fallbackG g';
  final q = d['qty'] as num;
  return switch (d['unit']) {
    'kg' => '${dec(q)} kg',
    'l' => '${dec(q)} l',
    'ml' => '${groupDigits(q)} ml',
    'pcs' => '${groupDigits(q)} ${t('dona')}',
    _ => '${groupDigits(q)} g',
  };
}

/// Retsept birligi (dish_ingredients.display_unit)
String recipeQty(num? qty, String? unit, int grams) {
  if (qty == null || unit == null || unit == 'g') return grams >= 1000 ? '${dec(grams / 1000)} kg' : '$grams g';
  return switch (unit) {
    'pcs' => '${dec(qty)} ${t('dona')}',
    'ml' => '${groupDigits(qty)} ml',
    'l' => '${dec(qty)} l',
    'kg' => '${dec(qty)} kg',
    'tbsp' => '${dec(qty)} ${t('osh q.')}',
    'tsp' => '${dec(qty)} ${t('ch.q.')}',
    'cup' => '${dec(qty)} ${t('stakan')}',
    'pinch' => t('chimdim'),
    'to_taste' => t('ta’bga ko‘ra'),
    _ => '$grams g',
  };
}

DateTime parseTime(Object? iso) => DateTime.parse(iso as String).toLocal();

String hhmm(DateTime d) => '${d.hour.toString().padLeft(2, '0')}:${d.minute.toString().padLeft(2, '0')}';

/// 'YYYY-MM-DD' (mahalliy sana)
String ymd(DateTime d) => '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

DateTime parseYmd(String s) {
  final p = s.split('-').map(int.parse).toList();
  return DateTime(p[0], p[1], p[2]);
}

/// "Dushanba, 5-oktabr"
String longDate(DateTime d) => '${weekdaysLong()[d.weekday - 1]}, ${d.day}-${monthsGenitive()[d.month - 1]}';

/// "5-okt"
String shortDate(DateTime d) => '${d.day}-${monthsGenitive()[d.month - 1].substring(0, 3)}';

DateTime mondayOf(DateTime d) => DateTime(d.year, d.month, d.day).subtract(Duration(days: d.weekday - 1));

/// "1 soat 9 daqiqa"
String duration(Duration d) {
  if (d.isNegative) return t('0 daqiqa');
  final h = d.inHours;
  final m = d.inMinutes % 60;
  if (h == 0) return t('{m} daqiqa', {'m': m});
  if (m == 0) return t('{h} soat', {'h': h});
  return t('{h} soat {m} daqiqa', {'h': h, 'm': m});
}

String initials(String name) {
  final parts = name.trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty).toList();
  if (parts.isEmpty) return '?';
  if (parts.length == 1) return parts.first.characters1.toUpperCase();
  return (parts[0].characters1 + parts[1].characters1).toUpperCase();
}

extension on String {
  String get characters1 => isEmpty ? '' : String.fromCharCode(runes.first);
}

/// Server xato kodlari → foydalanuvchiga tushunarli matn
String errorText(Object e) {
  if (e is! ApiException) return t('Kutilmagan xato');
  return switch (e.code) {
    'network' || 'timeout' => t('Server bilan aloqa yo‘q. Internetni tekshiring.'),
    'phone_invalid' => t('Telefon raqam noto‘g‘ri'),
    'too_soon' => t('Kod yaqinda yuborildi — biroz kuting'),
    'too_many_requests' => t('Juda ko‘p urinish. Keyinroq qayta urinib ko‘ring'),
    'code_invalid' => t('Kod noto‘g‘ri'),
    'code_expired' => t('Kod eskirgan — qayta so‘rang'),
    'too_many_attempts' => t('Urinishlar tugadi — yangi kod so‘rang'),
    'meal_locked' => t('Ro‘yxat yopilgan — pishirish boshlangan'),
    'feedback_exists' => t('Bahoni allaqachon bergansiz'),
    'not_eaten' => t('Bu mahalda porsiyangiz yo‘q edi'),
    'meal_not_locked' => t('Ovqat hali pishirilmagan'),
    'admin_only' => t('Faqat guruh admini qila oladi'),
    'cook_or_admin_only' => t('Faqat navbatchi yoki admin qila oladi'),
    'invite_invalid' => t('Taklif kodi topilmadi'),
    'last_admin' => t('Guruhda kamida bitta admin qolishi kerak'),
    'already_bought' => t('Bu mahsulot allaqachon olingan'),
    'payer_or_admin_only' => t('Faqat to‘lagan kishi yoki admin o‘chira oladi'),
    _ => e.status == 404 ? t('Topilmadi') : t('Xato: {code}', {'code': e.code}),
  };
}
