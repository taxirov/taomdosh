import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:taomdosh/api/api_client.dart';
import 'package:taomdosh/api/cache.dart';
import 'package:taomdosh/app.dart';
import 'package:taomdosh/screens/group/shopping.dart';
import 'package:taomdosh/screens/profile/profile.dart';
import 'package:taomdosh/state/session.dart';

import 'helpers.dart';

/// Tarmoq holatini almashtirsa bo'ladigan soxta API
class Net {
  bool down = false;
  final calls = <String>[];
  late final http.Client client = MockClient((req) async {
    if (down) throw const SocketExceptionLike();
    final key = '${req.method} ${req.url.path.replaceFirst(RegExp(r'^/v1'), '')}';
    calls.add('${req.url.host} $key');
    final body = routes[key];
    if (body == null) return http.Response(jsonEncode({'message': 'not_found'}), 404);
    return http.Response.bytes(utf8.encode(jsonEncode(body)), 200, headers: {'content-type': 'application/json'});
  });
  final Map<String, Object?> routes = {
    'GET /me': testMe,
    'GET /groups': [
      {'id': 'g1', 'name': 'Do‘stlar uyi', 'type': 'students', 'role': 'admin'},
    ],
    'GET /groups/g1': testGroup,
    'GET /groups/g1/meals': [],
    'GET /groups/g1/shopping': [
      {
        'id': '1',
        'ingredientId': 'i1',
        'name': 'Piyoz',
        'category': 'vegetables',
        'qtyG': 1000,
        'display': {'qty': 1, 'unit': 'kg'},
        'status': 'pending',
        'isManual': true,
        'periodStart': '2026-10-06',
        'periodEnd': '2026-10-06',
        'assigneeId': null,
        'estCost': 3000,
        'priceSource': 'market',
      },
    ],
    'GET /groups/g1/shopping/estimate': {'total': 3000, 'asOf': '2026-11-15'},
    'GET /prices': {'date': '2026-11-15', 'items': []},
    'DELETE /me': {'ok': true},
  };
}

class SocketExceptionLike implements Exception {
  const SocketExceptionLike();
}

Future<Session> boot(WidgetTester tester, Net net, Widget home) async {
  await tester.runAsync(loadAppFonts);
  tester.view.physicalSize = const Size(390, 1400);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  final session = Session(ApiClient(client: net.client));
  await session.bootstrap();
  await tester.pumpWidget(ChangeNotifierProvider.value(value: session, child: home));
  await tester.pumpAndSettle();
  return session;
}

void main() {
  setUp(() {
    SharedPreferences.setMockInitialValues({'access_token': 'a', 'refresh_token': 'r'});
    currentApiBase = apiUrl;
  });

  testWidgets('oflayn: ilova keshdagi oxirgi ma’lumot bilan ochiladi va belgi ko‘rinadi', (tester) async {
    final net = Net();
    // 1) Onlayn: ma'lumotlar keshlanadi
    var session = await boot(tester, net, const TaomdoshApp());
    expect(find.text('Salom, Aziz'), findsOneWidget);
    expect(find.textContaining('Oflayn'), findsNothing);
    await session.api.get('/groups/g1/shopping');
    await session.api.get('/prices');

    // 2) Internet yo'q, ilova qayta ishga tushadi: kirish ekrani emas, oxirgi ma'lumot + oflayn belgisi
    net.down = true;
    await tester.pumpWidget(const SizedBox());
    session = await boot(tester, net, const TaomdoshApp());
    expect(session.loggedIn, isTrue);
    expect(find.text('Salom, Aziz'), findsOneWidget);
    expect(find.text('Oflayn — oxirgi saqlangan ma’lumot'), findsOneWidget);
    final cached = await session.api.get('/groups/g1/shopping') as List;
    expect(cached.first['name'], 'Piyoz');
    expect(session.api.lastFromCache, isTrue);
    expect((await session.api.get('/prices') as Json)['date'], '2026-11-15');
    // Keshda yo'q so'rov va o'zgartirishlar — xato
    await expectLater(session.api.get('/groups/g1/pantry/movements'), throwsA(isA<ApiException>()));
    await expectLater(session.api.post('/groups/g1/shopping', {}), throwsA(isA<ApiException>()));

    // 3) Aloqa tiklansa belgi yo'qoladi
    net.down = false;
    await session.api.get('/me');
    await tester.pumpAndSettle();
    expect(find.textContaining('Oflayn'), findsNothing);
  });

  testWidgets('oflayn: xarid ro‘yxati keshdan ko‘rinadi', (tester) async {
    final net = Net();
    final session = await boot(tester, net, const SizedBox());
    await session.api.get('/groups/g1/shopping');
    await session.api.get('/groups/g1/shopping/estimate');
    net.down = true;
    await tester.pumpWidget(
      ChangeNotifierProvider.value(
        value: session,
        child: const MaterialApp(home: ShoppingScreen()),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Piyoz'), findsOneWidget);
    expect(find.text('taxminiy, 15.11 holatida'), findsOneWidget);
  });

  test('kesh: eng eski yozuvlar chiqarib tashlanadi, clear() hammasini o‘chiradi', () async {
    SharedPreferences.setMockInitialValues({'other': 'x'});
    final cache = ApiCache();
    for (var i = 0; i < ApiCache.maxEntries + 5; i++) {
      await cache.put('k$i', '$i');
      await Future<void>.delayed(const Duration(milliseconds: 1));
    }
    expect(await cache.get('k0'), isNull);
    expect(await cache.get('k${ApiCache.maxEntries + 4}'), '${ApiCache.maxEntries + 4}');
    await cache.clear();
    final p = await SharedPreferences.getInstance();
    expect(p.getKeys(), {'other'});
  });

  test('server manzilini tartibga keltirish', () {
    expect(normalizeServerUrl('taomdosh.jprq.app'), 'https://taomdosh.jprq.app/v1');
    expect(normalizeServerUrl(' https://taomdosh.jprq.app/ '), 'https://taomdosh.jprq.app/v1');
    expect(normalizeServerUrl('http://192.168.1.10:3000/v1/'), 'http://192.168.1.10:3000/v1');
    expect(normalizeServerUrl('https://api.example.uz/v2'), 'https://api.example.uz/v2');
    expect(normalizeServerUrl(''), isNull);
    expect(normalizeServerUrl('ftp://x.uz'), isNull);
  });

  testWidgets('sozlamalar: server manzili o‘zgartiriladi, standart qiymat API_URL', (tester) async {
    final net = Net();
    final session = await boot(tester, net, const MaterialApp(home: Scaffold(body: ProfileScreen())));
    expect(find.text('Server manzili'), findsOneWidget);
    expect(find.text(apiUrl), findsOneWidget); // standart qiymat
    await tester.tap(find.text('Server manzili'));
    await tester.pumpAndSettle();
    expect(find.text('Standart: $apiUrl'), findsOneWidget);

    await tester.enterText(find.byType(TextField), 'bu manzil emas://');
    await tester.tap(find.text('Saqlash'));
    await tester.pumpAndSettle();
    expect(find.text('Manzil noto‘g‘ri'), findsOneWidget);

    await tester.enterText(find.byType(TextField), 'taomdosh.jprq.app');
    await tester.tap(find.text('Saqlash'));
    await tester.pumpAndSettle();
    expect(currentApiBase, 'https://taomdosh.jprq.app/v1');
    expect(session.loggedIn, isFalse); // boshqa server — qaytadan kirish
    expect((await SharedPreferences.getInstance()).getString('server_url'), 'https://taomdosh.jprq.app/v1');

    // Keyingi so'rovlar yangi manzilga ketadi; qayta ishga tushganda ham saqlanadi
    net.calls.clear();
    try {
      await session.api.get('/me');
    } catch (_) {}
    expect(net.calls.single, startsWith('taomdosh.jprq.app '));
    final again = ApiClient(client: net.client);
    currentApiBase = apiUrl;
    await again.load();
    expect(currentApiBase, 'https://taomdosh.jprq.app/v1');
    await again.setServerUrl(null);
    expect(currentApiBase, apiUrl);
  });

  testWidgets('profil: hisobni o‘chirish tasdiqlash oynasi bilan', (tester) async {
    final net = Net();
    final session = await boot(tester, net, const MaterialApp(home: Scaffold(body: ProfileScreen())));
    await tester.scrollUntilVisible(find.text('Hisobni o‘chirish'), 200);
    await tester.tap(find.text('Hisobni o‘chirish'));
    await tester.pumpAndSettle();
    expect(find.text('Hisob o‘chirilsinmi?'), findsOneWidget);
    // Bekor qilinsa hech narsa bo'lmaydi
    await tester.tap(find.text('Bekor qilish'));
    await tester.pumpAndSettle();
    expect(net.calls.any((c) => c.contains('DELETE /me')), isFalse);
    expect(session.loggedIn, isTrue);

    await tester.tap(find.text('Hisobni o‘chirish'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Ha, o‘chirish'));
    await tester.pumpAndSettle();
    expect(net.calls.any((c) => c.contains('DELETE /me')), isTrue);
    expect(session.loggedIn, isFalse);
    final p = await SharedPreferences.getInstance();
    expect(p.getString('refresh_token'), isNull);
    expect(p.getKeys().where((k) => k.startsWith('cache:')), isEmpty);
  });
}
