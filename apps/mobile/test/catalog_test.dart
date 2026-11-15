import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:plugin_platform_interface/plugin_platform_interface.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:taomdosh/api/api_client.dart';
import 'package:taomdosh/screens/admin/moderation.dart';
import 'package:taomdosh/screens/dishes/dish_page.dart';
import 'package:taomdosh/widgets/common.dart';
import 'package:url_launcher_platform_interface/link.dart';
import 'package:url_launcher_platform_interface/url_launcher_platform_interface.dart';

import 'helpers.dart';

/// Tashqi ilovani ochish o'rniga chaqiruvlarni yozib oladi
class FakeLauncher extends UrlLauncherPlatform with MockPlatformInterfaceMixin {
  final opened = <(String, PreferredLaunchMode)>[];

  @override
  LinkDelegate? get linkDelegate => null;

  @override
  Future<bool> launchUrl(String url, LaunchOptions options) async {
    opened.add((url, options.mode));
    return true;
  }
}

Json dish({bool canEdit = false, String? videoUrl, String? imageUrl}) => {
  'id': 'd1',
  'title': 'Samarqand oshi',
  'description': 'To‘y oshi uslubida',
  'visibility': 'group',
  'moderationStatus': 'approved',
  'activeMin': 40,
  'passiveMin': 50,
  'prepAheadMin': 60,
  'baseServings': 4,
  'kcalPerServing': 680,
  'isSide': false,
  'mealTypes': ['lunch', 'dinner'],
  'imageUrl': imageUrl,
  'videoUrl': videoUrl,
  'favoritesCount': 12450,
  'isFavorite': false,
  'canEdit': canEdit,
  'updatedAt': '2026-11-15T10:00:00Z',
  'ingredients': [
    {'ingredientId': 'i1', 'name': 'Devzira guruch', 'qtyG': 600, 'displayQty': null, 'displayUnit': null},
    {'ingredientId': 'i2', 'name': 'Paxta yog‘i', 'qtyG': 138, 'displayQty': 150, 'displayUnit': 'ml'},
  ],
  'steps': [
    {'n': 1, 'durationMin': 15, 'text': 'Go‘sht va piyozni qovuring'},
    {'n': 2, 'durationMin': null, 'text': 'Guruchni solib dimlang'},
  ],
};

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({'access_token': 'a', 'refresh_token': 'r'}));

  testWidgets('taom sahifasi: ko‘rsatkichlar, masshtab va video tashqi ilovada ochiladi', (tester) async {
    final launcher = FakeLauncher();
    UrlLauncherPlatform.instance = launcher;
    await pumpScreen(
      tester,
      const DishPage(dishId: 'd1'),
      routes: {'GET /dishes/d1': dish(videoUrl: 'https://youtu.be/abc123')},
    );
    expect(find.text('Samarqand oshi'), findsOneWidget);
    expect(find.text('12 450 kishi saqlagan'), findsOneWidget);
    expect(find.text('680'), findsOneWidget);
    expect(find.text('kkal/porsiya'), findsOneWidget);
    expect(find.text('600 g'), findsOneWidget);
    expect(find.text('150 ml'), findsOneWidget);
    // Muallif emas — tahrirlash tugmalari yo'q
    expect(find.text('Tahrirlash'), findsNothing);
    expect(find.byTooltip('Rasm qo‘shish'), findsNothing);

    // 4 → 5 kishi: masalliqlar qayta hisoblanadi
    await tester.tap(find.byTooltip('Ko‘paytirish'));
    await tester.pump();
    expect(find.text('750 g'), findsOneWidget);

    await tester.tap(find.byTooltip('Tayyorlash videosini ko‘rish'));
    await tester.pump();
    expect(launcher.opened, [('https://youtu.be/abc123', PreferredLaunchMode.externalApplication)]);
  });

  testWidgets('taom sahifasi: muallif tahrirlaydi va o‘chiradi; videosiz taomda tugma yo‘q', (tester) async {
    final calls = <String>[];
    await pumpScreen(
      tester,
      const DishPage(dishId: 'd1'),
      routes: {
        'GET /dishes/d1': dish(canEdit: true),
        'DELETE /dishes/d1': {'ok': true},
      },
      calls: calls,
    );
    expect(find.byTooltip('Tayyorlash videosini ko‘rish'), findsNothing);
    expect(find.byTooltip('Rasm qo‘shish'), findsOneWidget);
    expect(find.text('Tahrirlash'), findsOneWidget);
    // Pastki tugmalar kamida 48 px
    expect(tester.getSize(find.widgetWithText(OutlinedButton, 'O‘chirish')).height, greaterThanOrEqualTo(48));

    await tester.tap(find.text('Tahrirlash'));
    await tester.pumpAndSettle();
    expect(find.text('Taomni tahrirlash'), findsOneWidget);
    expect(find.widgetWithText(TextField, 'Samarqand oshi'), findsOneWidget);
    await tester.tap(find.byTooltip('Yopish'));
    await tester.pumpAndSettle();

    await tester.tap(find.widgetWithText(OutlinedButton, 'O‘chirish'));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(FilledButton, 'O‘chirish'));
    await tester.pumpAndSettle();
    expect(calls, contains('DELETE /dishes/d1'));
  });

  testWidgets('taom sahifasi: 360 px va katta shriftda sig‘adi', (tester) async {
    await pumpScreen(
      tester,
      const DishPage(dishId: 'd1'),
      size: const Size(360, 1600),
      textScale: 1.3,
      routes: {'GET /dishes/d1': dish(canEdit: true, videoUrl: 'https://youtu.be/abc123')},
    );
    expect(tester.takeException(), isNull);
  });

  testWidgets('moderatsiya: kutilayotganlar, tasdiqlash va bo‘sh holat', (tester) async {
    final calls = <String>[];
    await pumpScreen(
      tester,
      const ModerationScreen(),
      routes: {
        'GET /admin/moderation': {
          'dishes': [
            {'id': 'd9', 'title': 'Uy palovi', 'authorName': 'Bekzod', 'imageUrl': null, 'ingredientsCount': 6, 'stepsCount': 4},
          ],
          'cookbooks': [],
        },
        'POST /admin/moderation/dishes/d9/approve': {'id': 'd9', 'status': 'approved'},
      },
      calls: calls,
    );
    expect(find.text('Uy palovi'), findsOneWidget);
    expect(find.text('Bekzod · 6 ta masalliq · 4 bosqich'), findsOneWidget);
    await tester.tap(find.text('Tasdiqlash'));
    await tester.pumpAndSettle();
    expect(calls, contains('POST /admin/moderation/dishes/d9/approve'));
    expect(find.text('Uy palovi'), findsNothing);
    expect(find.text('Hammasi ko‘rib chiqilgan'), findsOneWidget);
  });

  test('rasm manzili: serverdagi nisbiy yo‘l API manzili bilan to‘ldiriladi', () {
    currentApiBase = 'https://taomdosh.example/v1';
    expect(mediaUrl('/uploads/dishes/a.jpg'), 'https://taomdosh.example/v1/uploads/dishes/a.jpg');
    expect(mediaUrl('https://cdn.example/a.jpg'), 'https://cdn.example/a.jpg');
    currentApiBase = apiUrl;
  });

  testWidgets('rasmi yo‘q taom: zaxira ko‘rinish chiziladi', (tester) async {
    await tester.pumpWidget(
      const Directionality(
        textDirection: TextDirection.ltr,
        child: Center(child: DishImage(width: 120, height: 120, seed: 'osh')),
      ),
    );
    expect(find.byType(CustomPaint), findsWidgets);
    expect(find.byIcon(Icons.restaurant_rounded), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
