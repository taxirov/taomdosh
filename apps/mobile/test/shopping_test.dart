import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:taomdosh/api/api_client.dart';
import 'package:taomdosh/screens/group/plan_cost.dart';
import 'package:taomdosh/screens/group/shopping.dart';
import 'package:taomdosh/theme.dart';
import 'package:taomdosh/widgets/common.dart';

import 'helpers.dart';

Json item(String id, String name, String category, {int qtyG = 1000, num? cost, String? source, String status = 'pending'}) => {
  'id': id,
  'ingredientId': 'ing-$id',
  'name': name,
  'category': category,
  'qtyG': qtyG,
  'display': {'qty': qtyG / 1000, 'unit': 'kg'},
  'status': status,
  'isManual': false,
  'periodStart': '2026-10-06',
  'periodEnd': '2026-10-08',
  'assigneeId': 'u1',
  'assigneeName': 'Aziz',
  'estCost': cost,
  'priceSource': source,
  'unitPrice': cost == null ? null : {'price': cost, 'unit': 'kg', 'unitQty': 1},
};

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({'access_token': 'a', 'refresh_token': 'r'}));

  testWidgets('xarid ro‘yxati: qator narxi, jami summa va sana, narxsiz qator', (tester) async {
    final calls = <String>[];
    final session = await pumpScreen(
      tester,
      const ShoppingScreen(),
      routes: {
        'GET /groups/g1/shopping': [
          item('1', 'Mol go‘shti', 'meat', qtyG: 1500, cost: 188600, source: 'market'),
          item('2', 'Piyoz', 'vegetables', cost: 3000, source: 'group'),
          item('3', 'Zira', 'spices', qtyG: 20),
        ],
        'GET /groups/g1/shopping/estimate': {'total': 191600, 'asOf': '2026-11-15', 'itemsCount': 3, 'pricedCount': 2, 'missing': []},
        'PUT /groups/g1/prices/ing-3': {'ok': true},
        'PATCH /groups/g1/shopping/1': [item('1', 'Mol go‘shti', 'meat', qtyG: 1500, status: 'bought')],
      },
      calls: calls,
    );
    expect(session.groupId, 'g1');
    expect(find.text('Xarid ro‘yxati'), findsOneWidget);
    expect(find.text('6–8 oktabr · 2 kishiga'), findsOneWidget);
    expect(find.text('GO‘SHT'), findsOneWidget);
    expect(find.text('~188 600 so‘m'), findsOneWidget);
    expect(find.text('~3 000 so‘m · o‘z narximiz'), findsOneWidget);
    expect(find.text('1,5 kg'), findsOneWidget);
    // Jami va sana
    expect(find.text('~191 600 so‘m'), findsOneWidget);
    expect(find.text('taxminiy, 15.11 holatida · 1 ta mahsulot narxsiz'), findsOneWidget);
    // Manba hech qayerda ko'rsatilmaydi
    expect(find.textContaining(RegExp('narxtahlil', caseSensitive: false)), findsNothing);

    // Narxi yo'q masalliqqa guruh o'z narxini kiritadi
    await tester.tap(find.text('Narx kiritish'));
    await tester.pumpAndSettle();
    expect(find.text('Zira: 1 kg narxi, so‘m'), findsOneWidget);
    await tester.enterText(find.byType(TextField), '120000');
    await tester.tap(find.text('Saqlash'));
    await tester.pumpAndSettle();
    expect(calls, contains('PUT /groups/g1/prices/ing-3'));

    // "Olindi" belgisi — bosiladigan joy kamida 48 px
    final check = find.byType(CheckMark).first;
    expect(tester.getSize(check).height, greaterThanOrEqualTo(48));
    await tester.tap(check);
    await tester.pumpAndSettle();
    expect(calls, contains('PATCH /groups/g1/shopping/1'));
    expect(find.text('OLINGANLAR → ZAXIRADA'), findsOneWidget);
  });

  testWidgets('xarid ro‘yxati: bo‘sh holat va xato holati', (tester) async {
    await pumpScreen(tester, const ShoppingScreen(), routes: {'GET /groups/g1/shopping': []});
    expect(find.text('Ro‘yxat bo‘sh'), findsOneWidget);
    expect(find.widgetWithText(OutlinedButton, 'Qo‘lda qo‘shish'), findsOneWidget);
  });

  testWidgets('xarid ro‘yxati: xato holatida "Qayta urinish"', (tester) async {
    await pumpScreen(tester, const ShoppingScreen(), routes: {});
    expect(find.text('Qayta urinish'), findsOneWidget);
  });

  testWidgets('kichik ekran (360 px) va katta shrift: matn sig‘adi', (tester) async {
    await pumpScreen(
      tester,
      const ShoppingScreen(),
      size: const Size(360, 720),
      textScale: 1.3,
      routes: {
        'GET /groups/g1/shopping': [
          item('1', 'Qizil qalampir (quruq, maydalangan)', 'spices', cost: 1234500, source: 'market'),
          item('2', 'Kungaboqar yog‘i', 'oils'),
        ],
        'GET /groups/g1/shopping/estimate': {'total': 1234500, 'asOf': '2026-11-15', 'itemsCount': 2, 'pricedCount': 1, 'missing': []},
      },
    );
    expect(tester.takeException(), isNull);
  });

  testWidgets('haftalik reja xarajati: guruh va bir kishi hisobiga', (tester) async {
    await pumpScreen(
      tester,
      const Scaffold(body: PlanCostCard()),
      routes: {
        'GET /groups/g1/plans': [
          {'id': 'p1', 'weekStart': '2026-10-05', 'status': 'active'},
        ],
        'GET /groups/g1/plans/p1/estimate': {
          'planId': 'p1',
          'weekStart': '2026-10-05',
          'total': 840000,
          'perPerson': 420000,
          'asOf': '2026-11-15',
          'itemsCount': 30,
          'pricedCount': 26,
          'people': 2,
        },
      },
    );
    expect(find.text('Haftalik reja xarajati'), findsOneWidget);
    expect(find.text('~840 000 so‘m'), findsOneWidget);
    expect(find.text('~420 000 so‘m'), findsOneWidget);
    expect(find.text('taxminiy, 15.11 holatida · 4 ta mahsulot narxsiz'), findsOneWidget);
    expect(C.terracotta, const Color(0xFFB5491F));
  });
}
