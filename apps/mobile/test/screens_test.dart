import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:taomdosh/api/api_client.dart';
import 'package:taomdosh/format.dart';
import 'package:taomdosh/screens/cookbooks/cookbooks.dart';
import 'package:taomdosh/screens/group/group.dart';
import 'package:taomdosh/screens/today/attendance.dart';
import 'package:taomdosh/screens/today/cook_mode.dart';
import 'package:taomdosh/screens/today/today.dart';
import 'package:taomdosh/widgets/common.dart';

import 'helpers.dart';

final _eatAt = DateTime.now().add(const Duration(hours: 3));

Json meal({String status = 'planned', List<Json> myPortions = const []}) => {
  'id': 'm1',
  'date': ymd(_eatAt),
  'mealType': 'dinner',
  'eatAt': _eatAt.toUtc().toIso8601String(),
  'startAt': _eatAt.subtract(const Duration(minutes: 90)).toUtc().toIso8601String(),
  'lockAt': _eatAt.subtract(const Duration(minutes: 90)).toUtc().toIso8601String(),
  'prepAt': null,
  'status': status,
  'cookUserId': 'u2',
  'dishes': [
    {'dishId': 'd1', 'title': 'Osh', 'isSide': false, 'imageUrl': null, 'kcalPerServing': 680},
  ],
  'attendance': [
    {'userId': 'u1', 'name': 'Aziz', 'status': 'eating', 'guests': 1, 'managedBy': null},
    {'userId': 'u2', 'name': 'Bekzod', 'status': 'eating', 'guests': 0, 'managedBy': null},
  ],
  'eatingCount': 2,
  'guestsCount': 1,
  'myAttendance': {'status': 'eating', 'guests': 1},
  'myPortions': myPortions,
};

final todayYmd = ymd(DateTime.now());
final todayRoutes = <String, Object?>{
  'GET /groups/g1/meals': [meal()],
  'GET /groups/g1/shopping': [{}, {}, {}],
  'GET /groups/g1/balances': {
    'balances': [
      {'userId': 'u1', 'balance': -45000},
    ],
  },
  'GET /groups/g1/duty': [
    {'date': ymd(DateTime.now()), 'dutyRole': 'cook', 'userId': 'u2'},
  ],
  'GET /groups/g1/pantry': [{}, {}],
  'PUT /meals/m1/attendance': meal()..['myAttendance'] = {'status': 'not_eating', 'guests': 1},
};

final _cookView = <String, Object?>{
  'mealId': 'm1',
  'status': 'locked',
  'isFinal': true,
  'eatAt': _eatAt.toUtc().toIso8601String(),
  'cookUserId': 'u2',
  'dishes': [
    {
      'dishId': 'd1',
      'title': 'Osh',
      'isSide': false,
      'totalServings': 3.25,
      'totalGrams': 1460,
      'ingredients': [
        {
          'ingredientId': 'i1',
          'name': 'Devzira guruch',
          'qtyG': 490,
          'displayQty': null,
          'displayUnit': null,
          'market': {'qty': 500, 'unit': 'g'},
        },
        {
          'ingredientId': 'i2',
          'name': 'Piyoz',
          'qtyG': 220,
          'displayQty': null,
          'displayUnit': null,
          'market': {'qty': 2, 'unit': 'pcs'},
        },
      ],
      'portions': [
        {'userId': 'u1', 'name': 'Aziz', 'isGuest': false, 'grams': 380},
        {'userId': 'u2', 'name': 'Bekzod', 'isGuest': false, 'grams': 630},
        {'userId': null, 'hostUserId': 'u1', 'hostName': 'Aziz', 'isGuest': true, 'grams': 450},
      ],
      'steps': [
        {'n': 1, 'durationMin': 15, 'text': 'Go‘sht va piyozni qovuring'},
        {'n': 2, 'durationMin': 45, 'text': 'Guruchni solib dimlang'},
      ],
    },
  ],
};

final cookRoutes = <String, Object?>{
  'GET /meals/m1/cook-view': _cookView,
  'GET /meals/m1': meal(
    status: 'locked',
    myPortions: [
      {'dishId': 'd1', 'grams': 380, 'kcal': 520},
    ],
  ),
  'POST /meals/m1/feedback': {'ok': true},
};

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({'access_token': 'a', 'refresh_token': 'r'}));

  group('Bugun', () {
    testWidgets('navbatdagi mahal, porsiya hisobi, plitkalar va yangi eslatma belgisi', (tester) async {
      final calls = <String>[];
      await pumpScreen(
        tester,
        const Scaffold(body: TodayScreen()),
        routes: todayRoutes,
        calls: calls,
      );
      expect(find.text('Salom, Aziz'), findsOneWidget);
      expect(find.text('Navbatdagi'), findsOneWidget);
      expect(find.text('3 porsiya · 2 a’zo + 1 mehmon'), findsOneWidget);
      expect(find.text('Batafsil · mehmon qo‘shish'), findsOneWidget);
      // Tezkor plitkalar
      expect(find.byType(QuickTile), findsNWidgets(4));
      expect(find.text('3 ta mahsulot'), findsOneWidget);
      expect(find.text('45 000 so‘m qarzingiz'), findsOneWidget);
      // "Yeyman / Yo'qman" — kamida 48 px
      final no = find.widgetWithText(OutlinedButton, 'Yo‘qman');
      expect(tester.getSize(no).height, greaterThanOrEqualTo(48));
      await tester.tap(no);
      await tester.pumpAndSettle();
      expect(calls, contains('PUT /meals/m1/attendance'));
      expect(find.widgetWithText(FilledButton, 'Yo‘qman'), findsOneWidget);
    });

    testWidgets('bo‘sh holat: reja yo‘q — tushuntirish va "Cookbook tanlash" tugmasi', (tester) async {
      await pumpScreen(tester, const Scaffold(body: TodayScreen()), routes: {...todayRoutes, 'GET /groups/g1/meals': []});
      expect(find.text('Bugun uchun reja yo‘q'), findsOneWidget);
      expect(find.widgetWithText(OutlinedButton, 'Cookbook tanlash'), findsOneWidget);
    });

    testWidgets('xato holati: "Qayta urinish"; 360 px + katta shriftda sig‘adi', (tester) async {
      await pumpScreen(tester, const Scaffold(body: TodayScreen()), routes: {});
      expect(find.text('Qayta urinish'), findsOneWidget);
      await tester.pumpWidget(const SizedBox());
      await pumpScreen(
        tester,
        const Scaffold(body: TodayScreen()),
        routes: todayRoutes,
        size: const Size(360, 1700),
        textScale: 1.3,
      );
      expect(tester.takeException(), isNull);
    });
  });

  group('Qatnashuv', () {
    testWidgets('kim yeydi, almashtirgich, mehmonlar va jami porsiya', (tester) async {
      final calls = <String>[];
      await pumpScreen(
        tester,
        const AttendanceScreen(mealId: 'm1'),
        routes: {'GET /meals/m1': meal(), 'PUT /meals/m1/attendance': meal()},
        calls: calls,
      );
      expect(find.text('Kim yeydi'), findsOneWidget);
      expect(find.text('Aziz (siz)'), findsOneWidget);
      expect(find.text('3 porsiya (2 a’zo + 1 mehmon)'), findsOneWidget);
      // Almashtirgich: bosiladigan joy 48 px; admin boshqa a'zoni ham o'zgartira oladi
      final sw = find.byType(AppSwitch);
      expect(sw, findsNWidgets(2));
      expect(tester.getSize(sw.first).height, greaterThanOrEqualTo(48));
      await tester.tap(sw.first);
      await tester.pumpAndSettle();
      expect(find.text('2 porsiya (1 a’zo + 1 mehmon)'), findsOneWidget);
      await tester.tap(find.byTooltip('Ko‘paytirish'));
      await tester.pumpAndSettle();
      expect(find.text('3 porsiya (1 a’zo + 2 mehmon)'), findsOneWidget);
      await tester.tap(find.text('Saqlash'));
      await tester.pumpAndSettle();
      expect(calls, contains('PUT /meals/m1/attendance'));
    });

    testWidgets('360 px + katta shriftda sig‘adi', (tester) async {
      await pumpScreen(
        tester,
        const AttendanceScreen(mealId: 'm1'),
        routes: {'GET /meals/m1': meal()},
        size: const Size(360, 900),
        textScale: 1.3,
      );
      expect(tester.takeException(), isNull);
    });
  });

  group('Oshpaz rejimi', () {
    final routes = cookRoutes;

    testWidgets('masalliqlar, har kimga gramm va koeffitsiyent, baho', (tester) async {
      final calls = <String>[];
      await pumpScreen(
        tester,
        const CookModeScreen(mealId: 'm1'),
        routes: routes,
        calls: calls,
        size: const Size(390, 1800),
      );
      expect(find.text('Osh — 3,3 porsiya'), findsOneWidget);
      expect(find.text('Ro‘yxat yopildi'), findsOneWidget);
      expect(find.text('2 dona · 220 g'), findsOneWidget); // dona + gramm
      expect(find.text('1 porsiya = 449 g'), findsOneWidget);
      expect(find.text('380 g'), findsOneWidget);
      expect(find.text('0,85'), findsOneWidget); // kam porsiya
      expect(find.text('1,4'), findsOneWidget); // katta ishtaha
      expect(find.text('Azizdan · standart'), findsOneWidget);
      expect(find.byType(DashedCard), findsOneWidget);
      final enough = find.widgetWithText(OutlinedButton, 'Yetarli');
      expect(tester.getSize(enough).height, greaterThanOrEqualTo(48));
      await tester.tap(enough);
      await tester.pumpAndSettle();
      expect(calls, contains('POST /meals/m1/feedback'));
    });

    testWidgets('360 px + katta shriftda sig‘adi', (tester) async {
      await pumpScreen(
        tester,
        const CookModeScreen(mealId: 'm1'),
        routes: routes,
        size: const Size(360, 2200),
        textScale: 1.3,
      );
      expect(tester.takeException(), isNull);
    });
  });

  group('Guruh', () {
    final routes = {
      'GET /groups/g1/duty': [
        {'date': ymd(DateTime.now()), 'dutyRole': 'cook', 'userId': 'u2'},
      ],
      'GET /groups/g1/plans': [],
    };

    testWidgets('a’zolar, bugungi navbatchi, taklif kodi va plitkalar', (tester) async {
      await pumpScreen(tester, const Scaffold(body: GroupScreen()), routes: routes);
      expect(find.text('Do‘stlar uyi'), findsOneWidget);
      expect(find.text('DU'), findsOneWidget); // guruh belgisi
      expect(find.text('Aziz (siz)'), findsOneWidget);
      expect(find.text('Admin'), findsOneWidget);
      expect(find.text('Bugun navbatchi'), findsOneWidget);
      expect(find.text('ABC123'), findsOneWidget);
      final share = find.widgetWithText(FilledButton, 'Ulashish');
      expect(tester.getSize(share).height, greaterThanOrEqualTo(48));
      // Guruh turi — segment; plitkalar: 4 ta + admin uchun "Ovqat vaqtlari"
      expect(find.byType(Segmented<String>), findsOneWidget);
      expect(find.byType(QuickTile), findsNWidgets(5));
      for (final tile in tester.widgetList<QuickTile>(find.byType(QuickTile))) {
        expect(tester.getSize(find.byWidget(tile)).height, greaterThanOrEqualTo(48));
      }
    });

    testWidgets('360 px + katta shriftda sig‘adi', (tester) async {
      await pumpScreen(
        tester,
        const Scaffold(body: GroupScreen()),
        routes: routes,
        size: const Size(360, 1700),
        textScale: 1.3,
      );
      expect(tester.takeException(), isNull);
    });
  });

  group('Cookbooklar', () {
    final list = [
      {
        'id': 'c1',
        'title': 'Milliy hafta',
        'authorId': null,
        'days': 7,
        'mealsCount': 21,
        'moderationStatus': 'approved',
        'coverUrl': null,
      },
      {
        'id': 'c2',
        'title': 'Talaba haftaligi',
        'authorId': null,
        'days': 7,
        'mealsCount': 14,
        'moderationStatus': 'approved',
        'coverUrl': null,
      },
      {'id': 'c3', 'title': 'Mening haftam', 'authorId': 'u1', 'days': 3, 'mealsCount': 6, 'moderationStatus': 'pending', 'coverUrl': null},
    ];

    testWidgets('tavsiya kartochkasi, ro‘yxat, filtr va holat yorliqlari', (tester) async {
      await pumpScreen(tester, const Scaffold(body: CookbooksScreen()), routes: {'GET /cookbooks': list});
      expect(find.text('Cookbooklar'), findsOneWidget);
      expect(find.text('Milliy hafta'), findsOneWidget);
      expect(find.byType(DishImage), findsNWidgets(5)); // 3 rasmli kollaj + 2 qator
      expect(find.text('Barcha cookbooklar'), findsOneWidget);
      expect(find.text('Moderatsiyada'), findsOneWidget);
      expect(find.text('Bepul'), findsOneWidget);
      // Filtr chiplari: bosiladigan joy 48 px
      expect(tester.getSize(find.byType(ChoicePill).first).height, greaterThanOrEqualTo(48));
      await tester.tap(find.text('Meniki'));
      await tester.pumpAndSettle();
      expect(find.text('Milliy hafta'), findsNothing);
      expect(find.text('Mening haftam'), findsOneWidget);
    });

    testWidgets('bo‘sh holat va 360 px + katta shrift', (tester) async {
      await pumpScreen(tester, const Scaffold(body: CookbooksScreen()), routes: {'GET /cookbooks': []});
      expect(find.text('Hech narsa topilmadi'), findsOneWidget);
      expect(find.widgetWithText(OutlinedButton, 'Yangi cookbook'), findsOneWidget);
      await tester.pumpWidget(const SizedBox());
      await pumpScreen(
        tester,
        const Scaffold(body: CookbooksScreen()),
        routes: {'GET /cookbooks': list},
        size: const Size(360, 1200),
        textScale: 1.3,
      );
      expect(tester.takeException(), isNull);
    });
  });

  testWidgets('yuklanayotganda skeleton ko‘rinadi', (tester) async {
    await tester.pumpWidget(const MaterialApp(home: Scaffold(body: SkeletonList(rows: 3))));
    expect(find.byType(Skeleton), findsNWidgets(9));
    expect(find.bySemanticsLabel('Yuklanmoqda'), findsOneWidget);
  });
}
