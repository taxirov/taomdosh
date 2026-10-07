import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../format.dart';
import '../../i18n/strings.dart';
import '../../state/session.dart';
import '../../theme.dart';
import '../../widgets/common.dart';
import '../group/shopping.dart';
import 'attendance.dart';
import 'cook_mode.dart';
import 'today.dart';

/// Eslatmalar: yaqin mahallarga qatnashuv, navbatchilik, tayyorgarlik, xarid.
/// MVP da push (FCM) yo'q — ro'yxat "Bugun" ma'lumotidan yig'iladi.
class NotificationsScreen extends StatelessWidget {
  const NotificationsScreen({super.key, required this.data});
  final TodayData data;

  @override
  Widget build(BuildContext context) {
    final s = context.watch<Session>();
    final now = DateTime.now();
    final open = data.meals.where((m) => m['status'] == 'planned' && parseTime(m['lockAt']).isAfter(now)).toList()
      ..sort((a, b) => parseTime(a['eatAt']).compareTo(parseTime(b['eatAt'])));
    final myCook = data.meals
        .where((m) => m['cookUserId'] == s.userId && m['status'] != 'cancelled' && parseTime(m['eatAt']).isAfter(now))
        .toList();
    final prep = myCook.where((m) => m['prepAt'] != null).toList();
    void go(Widget w) => Navigator.of(context).push(route(w));

    final items = <Widget>[
      for (final m in open.take(2))
        _Item(
          icon: Icons.schedule_rounded,
          bg: C.terracottaSoft,
          fg: C.terracotta,
          title: t('{meal} {time} da — qatnashasizmi?', {'meal': mealTypeName(m['mealType']), 'time': hhmm(parseTime(m['eatAt']))}),
          sub: t('Ro‘yxat {time} da yopiladi', {'time': hhmm(parseTime(m['lockAt']))}),
          onTap: () => go(AttendanceScreen(mealId: m['id'])),
        ),
      for (final m in myCook)
        _Item(
          icon: Icons.soup_kitchen_outlined,
          bg: C.mustardSoft,
          fg: C.mustardInk,
          title: t('Siz navbatchisiz: {meal}', {'meal': '${mealTypeName(m['mealType']).toLowerCase()}, ${shortDate(parseYmd(m['date']))}'}),
          sub: t('{dish} · pishirish {time} da', {'dish': mealTitle(m), 'time': hhmm(parseTime(m['startAt']))}),
          onTap: () => go(CookModeScreen(mealId: m['id'])),
        ),
      for (final m in prep)
        _Item(
          icon: Icons.water_drop_outlined,
          bg: C.mustardSoft,
          fg: C.mustardInk,
          title: t('Oldindan tayyorgarlik'),
          sub: t('{dish}: ivitish yoki marinad — {time} da eslatamiz', {'dish': mealTitle(m), 'time': hhmm(parseTime(m['prepAt']))}),
          onTap: () => go(CookModeScreen(mealId: m['id'])),
        ),
      if ((data.pendingShopping ?? 0) > 0)
        _Item(
          icon: Icons.shopping_basket_outlined,
          bg: C.oliveSoft,
          fg: C.olive,
          title: t('Xarid ro‘yxati'),
          sub: t('{n} ta mahsulot olinishi kerak', {'n': data.pendingShopping}),
          onTap: () => go(const ShoppingScreen()),
        ),
    ];

    return Scaffold(
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
          children: [
            ScreenHeader(title: t('Bildirishnomalar')),
            const SizedBox(height: 16),
            if (items.isEmpty)
              EmptyView(icon: Icons.notifications_none_rounded, text: t('Hozircha yangi narsa yo‘q'))
            else
              CardList(children: items),
          ],
        ),
      ),
    );
  }
}

class _Item extends StatelessWidget {
  const _Item({required this.icon, required this.bg, required this.fg, required this.title, required this.sub, required this.onTap});
  final IconData icon;
  final Color bg;
  final Color fg;
  final String title;
  final String sub;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => InkWell(
    onTap: onTap,
    child: Padding(
      padding: const EdgeInsets.all(14),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(12)),
            child: Icon(icon, color: fg, size: 20),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: sans(14, weight: FontWeight.w700)),
                const SizedBox(height: 3),
                Text(sub, style: sans(13, color: C.muted)),
              ],
            ),
          ),
        ],
      ),
    ),
  );
}
