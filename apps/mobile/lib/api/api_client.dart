import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

/// API manzili: `flutter build apk --dart-define=API_URL=https://api.taomdosh.uz/v1`.
/// Standart — Android emulyatordan kompyuterdagi lokal server.
const apiUrl = String.fromEnvironment('API_URL', defaultValue: 'http://10.0.2.2:3000/v1');

typedef Json = Map<String, dynamic>;

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

  /// Sessiya tugaganda (refresh ham yaroqsiz) chaqiriladi
  void Function()? onLoggedOut;

  static const _kAccess = 'access_token';
  static const _kRefresh = 'refresh_token';

  bool get isLoggedIn => _refresh != null;

  Future<void> load() async {
    final p = await SharedPreferences.getInstance();
    _access = p.getString(_kAccess);
    _refresh = p.getString(_kRefresh);
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
  }

  Future<dynamic> get(String path, [Map<String, String?>? query]) => _send('GET', path, query: query);
  Future<dynamic> post(String path, [Object? body]) => _send('POST', path, body: body);
  Future<dynamic> put(String path, [Object? body]) => _send('PUT', path, body: body);
  Future<dynamic> patch(String path, [Object? body]) => _send('PATCH', path, body: body);
  Future<dynamic> delete(String path) => _send('DELETE', path);

  Future<dynamic> _send(String method, String path, {Map<String, String?>? query, Object? body, bool retried = false}) async {
    final q = query == null
        ? null
        : {
            for (final e in query.entries)
              if (e.value != null) e.key: e.value!,
          };
    final uri = Uri.parse('$apiUrl$path').replace(queryParameters: (q == null || q.isEmpty) ? null : q);
    final req = http.Request(method, uri)
      ..headers['Accept'] = 'application/json'
      ..headers['Accept-Language'] = locale;
    if (_access != null) req.headers['Authorization'] = 'Bearer $_access';
    if (body != null) {
      req.headers['Content-Type'] = 'application/json';
      req.body = jsonEncode(body);
    }
    http.Response res;
    try {
      res = await http.Response.fromStream(await _http.send(req).timeout(const Duration(seconds: 20)));
    } on TimeoutException {
      throw ApiException(0, 'timeout');
    } catch (_) {
      throw ApiException(0, 'network');
    }
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
