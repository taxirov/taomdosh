import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:provider/provider.dart';
import 'package:taomdosh/api/api_client.dart';
import 'package:taomdosh/state/session.dart';
import 'package:taomdosh/theme.dart';

/// Soxta API: "METHOD /yo'l" → javob. Topilmasa 404.
http.Client fakeApi(Map<String, Object?> routes, {List<String>? calls}) => MockClient((req) async {
  final key = '${req.method} ${req.url.path.replaceFirst(RegExp(r'^/v1'), '')}';
  calls?.add(key);
  if (!routes.containsKey(key)) return http.Response(jsonEncode({'message': 'not_found'}), 404);
  return http.Response.bytes(utf8.encode(jsonEncode(routes[key])), 200, headers: {'content-type': 'application/json'});
});

const testMe = {
  'id': 'u1',
  'name': 'Aziz',
  'phone': '+998901234567',
  'role': 'user',
  'profile': {'goal': 'maintain'},
  'target': {'kcal': 2330, 'proteinG': 120, 'fatG': 70, 'carbG': 280},
};

const testGroup = {
  'id': 'g1',
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
};

bool _fontsLoaded = false;

/// Haqiqiy shriftlar (Manrope, Fraunces) — testdagi standart shrift kvadrat harfli, kenglik tekshiruvi noto'g'ri chiqadi
Future<void> loadAppFonts() async {
  if (_fontsLoaded) return;
  _fontsLoaded = true;
  for (final family in ['Manrope', 'Fraunces']) {
    final loader = FontLoader(family);
    for (final f in Directory(
      'assets/fonts',
    ).listSync().whereType<File>().where((f) => f.path.contains('$family-') && f.path.endsWith('.ttf'))) {
      loader.addFont(f.readAsBytes().then((b) => ByteData.view(b.buffer)));
    }
    await loader.load();
  }
}

/// Bitta ekranni kirgan foydalanuvchi va tanlangan guruh bilan ochadi.
Future<Session> pumpScreen(
  WidgetTester tester,
  Widget screen, {
  Map<String, Object?> routes = const {},
  List<String>? calls,
  Size size = const Size(390, 1400),
  double textScale = 1,
  Map<String, Object?> me = testMe,
}) async {
  await tester.runAsync(loadAppFonts);
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  final session = Session(
    ApiClient(
      client: fakeApi({
        'GET /me': me,
        'GET /groups': [
          {'id': 'g1', 'name': 'Do‘stlar uyi', 'type': 'students', 'role': 'admin'},
        ],
        'GET /groups/g1': testGroup,
        ...routes,
      }, calls: calls),
    ),
  );
  await session.bootstrap();
  await tester.pumpWidget(
    ChangeNotifierProvider.value(
      value: session,
      child: MaterialApp(
        theme: buildTheme(),
        builder: (context, child) => MediaQuery(
          data: MediaQuery.of(context).copyWith(textScaler: TextScaler.linear(textScale)),
          child: child!,
        ),
        home: screen,
      ),
    ),
  );
  await tester.pumpAndSettle();
  return session;
}
