import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../api/api_client.dart';
import '../i18n/strings.dart';

/// Ilova holati: foydalanuvchi, guruhlar, tanlangan guruh va til.
class Session extends ChangeNotifier {
  Session(this.api) {
    api.onLoggedOut = () {
      me = null;
      notifyListeners();
    };
  }

  final ApiClient api;

  Json? me; // GET /me: foydalanuvchi + profile + target
  List<Json> groups = [];
  Json? group; // GET /groups/:id — a'zolar, sozlamalar, rotatsiyalar
  String locale = 'uz';
  bool ready = false;
  bool offline = false; // ishga tushishda server bilan aloqa bo'lmadi

  static const _kGroup = 'current_group';
  static const _kLocale = 'locale';

  String get userId => me?['id'] as String? ?? '';
  String? get groupId => group?['id'] as String?;
  bool get isAdmin => group?['myRole'] == 'admin';
  bool get loggedIn => me != null;

  List<Json> get members => ((group?['members'] as List?) ?? []).cast<Json>();

  /// A'zoning haqiqiy ismi (avatar uchun; memberName o'zingizni "Siz" deb qaytaradi)
  String realName(String? id) {
    if (id == null) return '';
    if (id == userId) return me?['name'] as String? ?? '';
    return members.firstWhere((m) => m['userId'] == id, orElse: () => {'name': ''})['name'] as String;
  }

  String memberName(String? id) {
    if (id == null) return '';
    if (id == userId) return t('Siz');
    return members.firstWhere((m) => m['userId'] == id, orElse: () => {'name': ''})['name'] as String;
  }

  Future<void> bootstrap() async {
    offline = false;
    final p = await SharedPreferences.getInstance();
    setLocaleLocal(p.getString(_kLocale) ?? 'uz');
    await api.load();
    if (api.isLoggedIn) {
      try {
        await loadMe();
        await loadGroups();
      } on ApiException catch (e) {
        if (e.status == 401) await api.clearTokens();
        // Tarmoq yo'q — kirish ekraniga emas, "qayta urinish" ekraniga
        offline = e.status == 0;
      }
    }
    ready = true;
    notifyListeners();
  }

  void setLocaleLocal(String l) {
    locale = supportedLocales.contains(l) ? l : 'uz';
    currentLocale = locale;
    api.locale = locale;
  }

  Future<void> setLocale(String l) async {
    setLocaleLocal(l);
    final p = await SharedPreferences.getInstance();
    await p.setString(_kLocale, locale);
    notifyListeners();
    if (loggedIn) {
      try {
        me = await api.patch('/me', {'locale': locale}) as Json;
      } catch (_) {}
      notifyListeners();
    }
  }

  // ─────────── kirish ───────────

  Future<Json> requestCode(String phone) async => await api.post('/auth/request-code', {'phone': phone}) as Json;

  Future<bool> verify(String phone, String code, String name) async {
    final r =
        await api.post('/auth/verify', {'phone': phone, 'code': code, 'name': name, 'locale': locale, 'deviceName': 'android'}) as Json;
    await api.saveTokens(r['accessToken'] as String, r['refreshToken'] as String);
    await loadMe();
    await loadGroups();
    notifyListeners();
    return r['isNewUser'] == true;
  }

  Future<void> logout() async {
    final p = await SharedPreferences.getInstance();
    try {
      // refresh tokenni serverda bekor qilish
      await api.post('/auth/logout', {'refreshToken': p.getString('refresh_token') ?? ''});
    } catch (_) {}
    await api.clearTokens();
    await p.remove(_kGroup);
    me = null;
    group = null;
    groups = [];
    notifyListeners();
  }

  // ─────────── profil ───────────

  Future<void> loadMe() async {
    me = await api.get('/me') as Json;
    notifyListeners();
  }

  Future<void> saveProfile(Json profile) async {
    me = await api.put('/me/profile', profile) as Json;
    notifyListeners();
  }

  Future<void> rename(String name) async {
    me = await api.patch('/me', {'name': name}) as Json;
    notifyListeners();
  }

  // ─────────── guruhlar ───────────

  Future<void> loadGroups() async {
    groups = ((await api.get('/groups')) as List).cast<Json>();
    final p = await SharedPreferences.getInstance();
    final saved = p.getString(_kGroup);
    final id = groups.any((g) => g['id'] == saved) ? saved : (groups.isNotEmpty ? groups.first['id'] as String : null);
    if (id != null) {
      await selectGroup(id);
    } else {
      group = null;
      notifyListeners();
    }
  }

  Future<void> selectGroup(String id) async {
    group = await api.get('/groups/$id') as Json;
    final p = await SharedPreferences.getInstance();
    await p.setString(_kGroup, id);
    notifyListeners();
  }

  Future<void> reloadGroup() async {
    if (groupId != null) await selectGroup(groupId!);
  }

  Future<void> createGroup(String name, String type) async {
    final g = await api.post('/groups', {'name': name, 'type': type}) as Json;
    await loadGroups();
    await selectGroup(g['id'] as String);
  }

  Future<void> joinGroup(String code) async {
    final g = await api.post('/groups/join', {'inviteCode': code}) as Json;
    await loadGroups();
    await selectGroup(g['id'] as String);
  }
}
