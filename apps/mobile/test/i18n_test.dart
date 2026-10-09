import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:taomdosh/i18n/dictionary.dart';
import 'package:taomdosh/i18n/strings.dart';
import 'package:taomdosh/i18n/translit.dart';

/// lib/ dagi barcha t('...') kalitlari
Set<String> usedKeys() {
  final re = RegExp(r"\bt\(\s*'((?:[^'\\]|\\.)*)'");
  final keys = <String>{};
  for (final f in Directory('lib').listSync(recursive: true).whereType<File>().where((f) => f.path.endsWith('.dart'))) {
    for (final m in re.allMatches(f.readAsStringSync())) {
      keys.add(m[1]!.replaceAll(r"\'", "'"));
    }
  }
  return keys;
}

Set<String> placeholders(String s) => RegExp(r'\{(\w+)\}').allMatches(s).map((m) => m[1]!).toSet();

void main() {
  tearDown(() => currentLocale = 'uz');

  test('har bir interfeys matni ru va en lug‘atda bor', () {
    final keys = usedKeys();
    expect(keys.length, greaterThan(300));
    expect(keys.where((k) => !ru.containsKey(k)), isEmpty, reason: 'ru tarjimasi yo‘q');
    expect(keys.where((k) => !en.containsKey(k)), isEmpty, reason: 'en tarjimasi yo‘q');
  });

  test('tarjimalarda o‘rinbosarlar ({name}) saqlangan', () {
    for (final k in ru.keys) {
      expect(placeholders(ru[k]!), placeholders(k), reason: 'ru: $k');
      expect(placeholders(en[k]!), placeholders(k), reason: 'en: $k');
    }
  });

  test('t(): tanlangan til va o‘rinbosarlar', () {
    expect(t('Salom, {name}', {'name': 'Aziz'}), 'Salom, Aziz');
    currentLocale = 'ru';
    expect(t('Salom, {name}', {'name': 'Aziz'}), 'Привет, Aziz');
    currentLocale = 'en';
    expect(t('Bugun'), 'Today');
    expect(t('lug‘atda yo‘q matn'), 'lug‘atda yo‘q matn');
  });

  test('uz-Cyrl: lotindan avtomatik, o‘rinbosar va brendlar o‘girilmaydi', () {
    currentLocale = 'uz-Cyrl';
    expect(t('Salom, {name}', {'name': 'Aziz'}), 'Салом, Aziz');
    expect(t('Xarid ro‘yxati'), 'Харид рўйхати');
    expect(t('Cookbook tanlash'), 'Кукбук танлаш');
    expect(t('Taklif matni nusxalandi — Telegram’da yuboring'), 'Таклиф матни нусхаланди — Telegram’da юборинг');
  });

  test('lotin → kirill qoidalari (backend bilan bir xil)', () {
    expect(uzLatinToCyrillic('O‘zbekiston'), 'Ўзбекистон');
    expect(uzLatinToCyrillic('Shanba, choy, yog‘'), 'Шанба, чой, ёғ');
    expect(uzLatinToCyrillic('ertaga mehmon'), 'эртага меҳмон');
    expect(uzLatinToCyrillic('ma’no'), 'маъно');
  });
}
