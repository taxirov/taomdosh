import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

import 'cache.dart';

/// API manzili: `flutter build apk --dart-define=API_URL=https://api.taomdosh.uz/v1`.
/// Standart — Android emulyatordan kompyuterdagi lokal server.
const apiUrl = String.fromEnvironment('API_URL', defaultValue: 'http://10.0.2.2:3000/v1');

typedef Json = Map<String, dynamic>;

/// Joriy server manzili (sozlamalarda o'zgartirilishi mumkin). Rasm manzillari ham shundan yasaladi.
String currentApiBase = apiUrl;

/// Serverdagi nisbiy manzil ("/uploads/dishes/x.jpg") → to'liq havola; tashqi havola o'zgarmaydi
String mediaUrl(String url) => url.startsWith('/') ? '$currentApiBase$url' : url;

/// Foydalanuvchi kiritgan server manzilini tartibga keltiradi: "taomdosh.jprq.app" → "https://taomdosh.jprq.app/v1".
/// Yaroqsiz bo'lsa — null.
String? normalizeServerUrl(String input) {
  var v = input.trim();
  if (v.isEmpty) return null;
  if (!v.contains('://')) v = 'https://$v';
  final uri = Uri.tryParse(v);
  final valid = uri != null && (uri.isScheme('http') || uri.isScheme('https')) && uri.host.contains(RegExp(r'[a-zA-Z0-9]'));
  if (!valid) return null;
  var path = uri.path.replaceAll(RegExp(r'/+$'), '');
  if (path.isEmpty) path = '/v1';
  return uri.replace(path: path, query: null, fragment: null).toString().replaceAll(RegExp(r'[?#]$'), '');
}

class ApiException implements Exception {
  final int status;
  final String code;
  ApiException(this.status, this.code);

  @override
  String toString() => 'ApiException($status, $code)';
}

/// HTTP mijoz: access token, muddati o'tsa refresh bilan avtomatik yangilash.
class ApiClient {
  ApiClient({http.Client? client}) : _http = client ?? http.Client();

  final http.Client _http;
  String? _access;
  String? _refresh;
  String locale = 'uz';
  Completer<bool>? _refreshing;

  /// Oxirgi GET javobi keshdan (oflayn) olinganmi
  bool lastFromCache = false;

  /// Server bilan aloqa yo'q — ekranlarda oxirgi saqlangan ma'lumot ko'rsatilmoqda
  final offline = ValueNotifier<bool>(false);

  final cache = ApiCache();

  /// Sessiya tugaganda (refresh ham yaroqsiz) chaqiriladi
  void Function()? onLoggedOut;

  static const _kAccess = 'access_token';
  static const _kRefresh = 'refresh_token';
  static const _kServer = 'server_url';

  bool get isLoggedIn => _refresh != null;

  Future<void> load() async {
    final p = await SharedPreferences.getInstance();
    _access = p.getString(_kAccess);
    _refresh = p.getString(_kRefresh);
    currentApiBase = p.getString(_kServer) ?? apiUrl;
  }

  /// Server manzilini o'zgartirish (null — standart, yig'ishdagi API_URL). Kesh va tokenlar tozalanadi.
  Future<void> setServerUrl(String? url) async {
    final p = await SharedPreferences.getInstance();
    if (url == null || url == apiUrl) {
      await p.remove(_kServer);
      currentApiBase = apiUrl;
    } else {
      await p.setString(_kServer, url);
      currentApiBase = url;
    }
    await clearTokens();
    offline.value = false;
  }

  Future<void> saveTokens(String access, String refresh) async {
    _access = access;
    _refresh = refresh;
    final p = await SharedPreferences.getInstance();
    await p.setString(_kAccess, access);
    await p.setString(_kRefresh, refresh);
  }

  Future<void> clearTokens() async {
    _access = null;
    _refresh = null;
    final p = await SharedPreferences.getInstance();
    await p.remove(_kAccess);
    await p.remove(_kRefresh);
    await cache.clear();
  }

  Future<dynamic> get(String path, [Map<String, String?>? query]) => _send('GET', path, query: query);
  Future<dynamic> post(String path, [Object? body]) => _send('POST', path, body: body);
  Future<dynamic> put(String path, [Object? body]) => _send('PUT', path, body: body);
  Future<dynamic> patch(String path, [Object? body]) => _send('PATCH', path, body: body);
  Future<dynamic> delete(String path) => _send('DELETE', path);

  /// Fayl yuklash (multipart, `file` maydoni) — taom rasmi, narx fayli
  Future<dynamic> upload(String path, List<int> bytes, {String filename = 'file', bool retried = false}) async {
    final req = http.MultipartRequest('POST', Uri.parse('$currentApiBase$path'))
      ..headers['Accept'] = 'application/json'
      ..headers['Accept-Language'] = locale
      ..files.add(http.MultipartFile.fromBytes('file', bytes, filename: filename));
    if (_access != null) req.headers['Authorization'] = 'Bearer $_access';
    http.Response res;
    try {
      res = await http.Response.fromStream(await _http.send(req).timeout(const Duration(seconds: 60)));
    } on TimeoutException {
      throw ApiException(0, 'timeout');
    } catch (_) {
      throw ApiException(0, 'network');
    }
    if (res.statusCode == 401 && !retried && _refresh != null) {
      if (await _refreshTokens()) return upload(path, bytes, filename: filename, retried: true);
      onLoggedOut?.call();
    }
    final text = utf8.decode(res.bodyBytes);
    final data = text.isEmpty ? null : jsonDecode(text);
    if (res.statusCode >= 400) {
      final msg = data is Map ? data['message'] : null;
      throw ApiException(res.statusCode, res.statusCode == 413 ? 'file_too_large' : (msg is String ? msg : 'error'));
    }
    return data;
  }

  Future<dynamic> _send(String method, String path, {Map<String, String?>? query, Object? body, bool retried = false}) async {
    final q = query == null
        ? null
        : {
            for (final e in query.entries)
              if (e.value != null) e.key: e.value!,
          };
    final uri = Uri.parse('$currentApiBase$path').replace(queryParameters: (q == null || q.isEmpty) ? null : q);
    final req = http.Request(method, uri)
      ..headers['Accept'] = 'application/json'
      ..headers['Accept-Language'] = locale;
    if (_access != null) req.headers['Authorization'] = 'Bearer $_access';
    if (body != null) {
      req.headers['Content-Type'] = 'application/json';
      req.body = jsonEncode(body);
    }
    // Kesh kaliti: yo'l + so'rov parametrlari + til (nomlar tilga bog'liq)
    final cacheKey = method == 'GET' && !path.startsWith('/auth/') ? '$locale ${uri.path}?${uri.query}' : null;
    http.Response res;
    try {
      res = await http.Response.fromStream(await _http.send(req).timeout(const Duration(seconds: 20)));
    } catch (e) {
      // Internet yo'q: o'qish so'rovlarida oxirgi saqlangan javob qaytariladi
      final cached = cacheKey == null ? null : await cache.get(cacheKey);
      if (cached != null) {
        lastFromCache = true;
        offline.value = true;
        return jsonDecode(cached);
      }
      throw ApiException(0, e is TimeoutException ? 'timeout' : 'network');
    }
    offline.value = false;
    if (cacheKey != null) lastFromCache = false;
    if (res.statusCode == 401 && !retried && _refresh != null && !path.startsWith('/auth/')) {
      if (await _refreshTokens()) return _send(method, path, query: query, body: body, retried: true);
      onLoggedOut?.call();
    }
    final text = utf8.decode(res.bodyBytes);
    final data = text.isEmpty ? null : jsonDecode(text);
    if (res.statusCode >= 400) {
      final msg = data is Map ? data['message'] : null;
      throw ApiException(res.statusCode, msg is String ? msg : (msg is List && msg.isNotEmpty ? '${msg.first}' : 'error'));
    }
    if (cacheKey != null && text.isNotEmpty) await cache.put(cacheKey, text);
    return data;
  }

  /// Bir vaqtda bir nechta so'rov 401 olsa ham refresh bir marta bajariladi
  Future<bool> _refreshTokens() async {
    if (_refreshing != null) return _refreshing!.future;
    final c = _refreshing = Completer<bool>();
    try {
      final r = await _send('POST', '/auth/refresh', body: {'refreshToken': _refresh}, retried: true) as Json;
      await saveTokens(r['accessToken'] as String, r['refreshToken'] as String);
      c.complete(true);
    } catch (_) {
      await clearTokens();
      c.complete(false);
    } finally {
      _refreshing = null;
    }
    return c.future;
  }
}
