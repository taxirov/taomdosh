import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

/// GET javoblarining lokal nusxasi: internet bo'lmaganda oxirgi ma'lumotni ko'rsatish uchun.
/// Bugungi/haftalik mahallar, xarid ro'yxati, narxlar, guruh ma'lumotlari va boshqa o'qish so'rovlari.
/// Eng eski yozuvlar chiqarib tashlanadi (sanaga bog'liq kalitlar to'planib qolmasligi uchun).
class ApiCache {
  static const _prefix = 'cache:';
  static const _indexKey = 'cache_index';
  static const maxEntries = 80;

  Future<void> put(String key, String body) async {
    final p = await SharedPreferences.getInstance();
    final index = _readIndex(p);
    index[key] = DateTime.now().millisecondsSinceEpoch;
    if (index.length > maxEntries) {
      final oldest = index.entries.toList()..sort((a, b) => a.value.compareTo(b.value));
      for (final e in oldest.take(index.length - maxEntries)) {
        index.remove(e.key);
        await p.remove('$_prefix${e.key}');
      }
    }
    await p.setString('$_prefix$key', body);
    await p.setString(_indexKey, jsonEncode(index));
  }

  Future<String?> get(String key) async => (await SharedPreferences.getInstance()).getString('$_prefix$key');

  /// Chiqish, hisobni o'chirish yoki server almashganda — boshqa foydalanuvchi ma'lumoti qolmasin
  Future<void> clear() async {
    final p = await SharedPreferences.getInstance();
    for (final k in p.getKeys().where((k) => k.startsWith(_prefix)).toList()) {
      await p.remove(k);
    }
    await p.remove(_indexKey);
  }

  Map<String, int> _readIndex(SharedPreferences p) {
    try {
      return (jsonDecode(p.getString(_indexKey) ?? '{}') as Map).map((k, v) => MapEntry(k as String, (v as num).toInt()));
    } catch (_) {
      return {};
    }
  }
}
