import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:taomdosh/api/api_client.dart';
import 'package:taomdosh/app.dart';
import 'package:taomdosh/format.dart';
import 'package:taomdosh/state/session.dart';

/// Soxta API: yo'l → javob
http.Client fakeApi(Map<String, Object> routes, {List<String>? calls}) => MockClient((req) async {
  final key = '${req.method} ${req.url.path.replaceFirst(RegExp(r'^/v1'), '')}';
  calls?.add(key);
  final body = routes[key];
  if (body == null) return http.Response(jsonEncode({'message': 'not_found'}), 404);
  return http.Response.bytes(utf8.encode(jsonEncode(body)), 200, headers: {'content-type': 'application/json'});
});

Future<void> pumpApp(WidgetTester tester, http.Client client) async {
  // Telefon ekrani (390×1400 — uzun "Bugun" ro'yxati to'liq chizilsin)
  tester.view.physicalSize = const Size(390, 1400);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  final session = Session(ApiClient(client: client));
  await session.bootstrap();
  await tester.pumpWidget(ChangeNotifierProvider.value(value: session, child: const TaomdoshApp()));
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('kirmagan foydalanuvchi: xush kelibsiz → telefon', (tester) async {
    SharedPreferences.setMockInitialValues({});
    await pumpApp(tester, fakeApi({}));
    expect(find.text('Boshlash'), findsOneWidget);
    await tester.tap(find.text('Boshlash'));
    await tester.pumpAndSettle();
    expect(find.text('Keling, tanishamiz'), findsOneWidget);
    expect(find.text('Kod olish'), findsOneWidget);
  });

  testWidgets('kirgan foydalanuvchi: Bugun ekrani va navbatdagi mahal', (tester) async {
    SharedPreferences.setMockInitialValues({'access_token': 'a', 'refresh_token': 'r'});
    final now = DateTime.now();
    final eatAt = now.add(const Duration(hours: 3));
    final calls = <String>[];
    const gid = 'g1';
    await pumpApp(
      tester,
      fakeApi({
        'GET /me': {
          'id': 'u1',
          'name': 'Aziz',
          'phone': '+998901234567',
          'profile': {'goal': 'maintain'},
          'target': {'kcal': 2330, 'proteinG': 120, 'fatG': 70, 'carbG': 280},
        },
        'GET /groups': [
          {'id': gid, 'name': 'Do‘stlar uyi', 'type': 'students', 'role': 'admin'},
        ],
        'GET /groups/$gid': {
          'id': gid,
          'name': 'Do‘stlar uyi',
          'type': 'students',
          'splitMode': 'by_portion',
          'inviteCode': 'ABC123',
          'myRole': 'admin',
          'members': [
            {'userId': 'u1', 'name': 'Aziz', 'role': 'admin', 'managedBy': null},
            {'userId': 'u2', 'name': 'Bekzod', 'role': 'member', 'managedBy': null},
          ],
          'mealSettings': [],
          'rotations': [],
        },
        'GET /groups/$gid/meals': [
          {
            'id': 'm1',
            'date': ymd(eatAt),
            'mealType': 'dinner',
            'eatAt': eatAt.toUtc().toIso8601String(),
            'startAt': eatAt.subtract(const Duration(minutes: 90)).toUtc().toIso8601String(),
            'lockAt': eatAt.subtract(const Duration(minutes: 90)).toUtc().toIso8601String(),
            'prepAt': null,
            'status': 'planned',
            'cookUserId': 'u2',
            'dishes': [
              {'dishId': 'd1', 'title': 'Osh', 'isSide': false, 'imageUrl': null, 'kcalPerServing': 680},
            ],
            'attendance': [],
            'eatingCount': 2,
            'guestsCount': 0,
            'myAttendance': {'status': 'eating', 'guests': 0},
            'myPortions': [],
          },
        ],
        'GET /groups/$gid/shopping': [],
        'GET /groups/$gid/balances': {
          'balances': [
            {'userId': 'u1', 'balance': 89300},
          ],
        },
        'GET /groups/$gid/duty': [],
        'GET /groups/$gid/pantry': [],
      }, calls: calls),
    );
    expect(find.text('Salom, Aziz'), findsOneWidget);
    expect(find.text('Osh'), findsOneWidget);
    expect(find.text('Navbatdagi'), findsOneWidget);
    expect(find.text('Bekzod'), findsOneWidget); // navbatchi
    expect(find.text('+89 300 so‘m sizga'), findsOneWidget);
    expect(calls, contains('GET /groups/$gid/meals'));
  });
}
