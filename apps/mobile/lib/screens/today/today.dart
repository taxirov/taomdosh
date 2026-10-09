import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../api/api_client.dart';
import '../../format.dart';
import '../../i18n/strings.dart';
import '../../state/session.dart';
import '../../theme.dart';
import '../../widgets/common.dart';
import '../group/duty.dart';
import '../group/expenses.dart';
import '../group/group.dart';
import '../group/no_group.dart';
import '../group/pantry.dart';
import '../group/shopping.dart';
import '../home_shell.dart';
import 'attendance.dart';
import 'cook_mode.dart';
import 'notifications.dart';

/// "Bugun": kaloriya, bugungi mahallar, navbatdagi mahalga qatnashuv, tezkor havolalar
class TodayData {
  TodayData(this.meals, this.pendingShopping, this.myBalance, this.tomorrowCook, this.pantryCount);
  final List<Json> meals; // bugun va ertaga
  final int? pendingShopping;
  final int? myBalance;
  final String? tomorrowCook;
  final int? pantryCount;
}

Future<TodayData> loadToday(Session s) async {
  final api = s.api;
  final gid = s.groupId!;
  final now = DateTime.now();
  final today = ymd(now);
  final tomorrow = ymd(now.add(const Duration(days: 1)));
  Future<T?> soft<T>(Future<T> f) => f.then<T?>((v) => v).catchError((_) => null);
  final results = await Future.wait([
    api.get('/groups/$gid/meals', {'from': today, 'to': tomorrow}),
    soft(api.get('/groups/$gid/shopping', {'status': 'pending'})),
    soft(api.get('/groups/$gid/balances')),
    soft(api.get('/groups/$gid/duty', {'from': tomorrow, 'to': tomorrow})),
    soft(api.get('/groups/$gid/pantry')),
  ]);
  final balances = results[2] as Json?;
  final mine = ((balances?['balances'] as List?) ?? []).cast<Json>().where((b) => b['userId'] == s.userId);
  final duty = ((results[3] as List?) ?? []).cast<Json>().where((d) => d['dutyRole'] == 'cook');
  return TodayData(
    (results[0] as List).cast<Json>(),
    (results[1] as List?)?.length,
    balances == null ? null : (mine.isEmpty ? 0 : (mine.first['balance'] as num).round()),
    duty.isEmpty ? null : duty.first['userId'] as String?,
    (results[4] as List?)?.length,
  );
}

class TodayScreen extends StatelessWidget {
  const TodayScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final s = context.watch<Session>();
    if (s.groupId == null) return const SafeArea(child: NoGroup());
    return SafeArea(
      child: Loader<TodayData>(
        key: ValueKey(s.groupId),
        load: () => loadToday(s),
        builder: (context, d, reload) => RefreshIndicator(
          color: C.terracotta,
          onRefresh: reload,
          child: _TodayBody(data: d, reload: reload),
        ),
      ),
    );
  }
}

class _TodayBody extends StatelessWidget {
  const _TodayBody({required this.data, required this.reload});
  final TodayData data;
  final Future<void> Function() reload;

  @override
  Widget build(BuildContext context) {
    final s = context.watch<Session>();
    final now = DateTime.now();
    final today = ymd(now);
    final meals = data.meals.where((m) => m['date'] == today).toList();
    final upcoming = data.meals.where((m) => m['status'] == 'planned' && parseTime(m['lockAt']).isAfter(now)).toList()
      ..sort((a, b) => parseTime(a['eatAt']).compareTo(parseTime(b['eatAt'])));
    final next = upcoming.isEmpty ? null : upcoming.first;
    final eatenKcal = meals.expand((m) => (m['myPortions'] as List).cast<Json>()).fold<num>(0, (sum, p) => sum + (p['kcal'] as num));
    final target = ((s.me?['target'] as Json?)?['kcal'] as num?) ?? 2000;
    // Navbatchiga ertangi tayyorgarlik eslatmasi (ivitish, marinad)
    final prep = data.meals.where((m) => m['prepAt'] != null && m['cookUserId'] == s.userId && m['status'] == 'planned').toList();
    void open(Widget w) => Navigator.of(context).push(route(w)).then((_) => reload());

    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    longDate(now),
                    style: sans(13, weight: FontWeight.w600, color: C.muted),
                  ),
                  const SizedBox(height: 4),
                  Text(t('Salom, {name}', {'name': s.me?['name'] ?? ''}), style: serif(30, height: 1.1)),
                ],
              ),
            ),
            CircleBtn(
              icon: Icons.notifications_none_rounded,
              tooltip: t('Bildirishnomalar'),
              onTap: () => open(NotificationsScreen(data: data)),
            ),
          ],
        ),
        const SizedBox(height: 16),
        Align(
          alignment: Alignment.centerLeft,
          child: GroupSwitcherPill(onChanged: reload),
        ),
        const SizedBox(height: 16),
        AppCard(
          padding: const EdgeInsets.fromLTRB(16, 14, 16, 16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(t('Bugungi kaloriya'), style: sans(14, weight: FontWeight.w700)),
                  ),
                  Text.rich(
                    TextSpan(
                      style: sans(13, color: C.muted),
                      children: [
                        TextSpan(
                          text: groupDigits(eatenKcal),
                          style: sans(15, weight: FontWeight.w800),
                        ),
                        TextSpan(text: ' / ${groupDigits(target)} ${t('kkal')}'),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              ClipRRect(
                borderRadius: BorderRadius.circular(4),
                child: LinearProgressIndicator(
                  value: (eatenKcal / target).clamp(0, 1).toDouble(),
                  minHeight: 8,
                  color: C.olive,
                  backgroundColor: C.lineSoft,
                ),
              ),
              const SizedBox(height: 8),
              Text(t('Qulflangan mahallardagi porsiyalaringiz bo‘yicha'), style: sans(12, color: C.muted)),
            ],
          ),
        ),
        const SizedBox(height: 20),
        SectionTitle(t('Bugungi mahallar')),
        const SizedBox(height: 10),
        if (meals.isEmpty)
          AppCard(
            child: EmptyView(
              icon: Icons.menu_book_outlined,
              text: t('Bugun uchun reja yo‘q. Cookbook tanlab, guruhga qo‘llang.'),
              action: SizedBox(
                width: 220,
                child: SecondaryButton(label: t('Cookbook tanlash'), height: 46, onPressed: () => HomeShell.go(context, 1)),
              ),
            ),
          ),
        for (final m in meals)
          Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: m['id'] == next?['id']
                ? _NextMealCard(meal: m, reload: reload)
                : _MealRow(
                    meal: m,
                    onTap: () => open(m['status'] == 'planned' ? AttendanceScreen(mealId: m['id']) : CookModeScreen(mealId: m['id'])),
                  ),
          ),
        if (next != null && next['date'] != today) ...[
          const SizedBox(height: 6),
          SectionTitle(t('Ertaga')),
          const SizedBox(height: 10),
          _NextMealCard(meal: next, reload: reload),
        ],
        for (final m in prep) ...[
          const SizedBox(height: 10),
          InfoBanner(
            icon: Icons.water_drop_outlined,
            title: t('Oldindan tayyorgarlik'),
            text: t('{meal} uchun ({dish}) masalliqlarni oldindan ivitib yoki marinadlab qo‘ying — {time} gacha. Navbatchi: siz.', {
              'meal': mealTypeName(m['mealType']).toLowerCase(),
              'dish': (m['dishes'] as List).map((d) => d['title']).join(', '),
              'time': '${shortDate(parseTime(m['prepAt']))} ${hhmm(parseTime(m['prepAt']))}',
            }),
          ),
        ],
        const SizedBox(height: 16),
        GridView.count(
          crossAxisCount: 2,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          mainAxisSpacing: 10,
          crossAxisSpacing: 10,
          childAspectRatio: 2.3,
          children: [
            _Tile(
              t('Xarid ro‘yxati'),
              data.pendingShopping == null ? '' : t('{n} ta mahsulot', {'n': data.pendingShopping}),
              () => open(const ShoppingScreen()),
            ),
            _Tile(
              t('Navbatchilik'),
              data.tomorrowCook == null ? '' : t('Ertaga: {name}', {'name': s.memberName(data.tomorrowCook)}),
              () => open(const DutyScreen()),
            ),
            _Tile(
              t('Xarajatlar'),
              data.myBalance == null || data.myBalance == 0
                  ? t('Hisob teng')
                  : data.myBalance! > 0
                  ? t('+{sum} sizga', {'sum': money(data.myBalance!)})
                  : t('{sum} qarzingiz', {'sum': money(-data.myBalance!)}),
              () => open(const ExpensesScreen()),
              color: (data.myBalance ?? 0) > 0 ? C.olive : ((data.myBalance ?? 0) < 0 ? C.terracottaDark : C.muted),
            ),
            _Tile(
              t('Zaxira'),
              data.pantryCount == null ? '' : t('{n} ta mahsulot', {'n': data.pantryCount}),
              () => open(const PantryScreen()),
            ),
          ],
        ),
      ],
    );
  }
}

class _Tile extends StatelessWidget {
  const _Tile(this.title, this.sub, this.onTap, {this.color = C.muted});
  final String title;
  final String sub;
  final VoidCallback onTap;
  final Color color;

  @override
  Widget build(BuildContext context) => AppCard(
    onTap: onTap,
    radius: 16,
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        Text(
          title,
          style: sans(14, weight: FontWeight.w700),
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
        ),
        const SizedBox(height: 4),
        Text(
          sub,
          style: sans(12, weight: FontWeight.w700, color: color),
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
        ),
      ],
    ),
  );
}

String mealTitle(Json m) => (m['dishes'] as List).where((d) => d['isSide'] != true).map((d) => d['title']).join(', ');

/// Mahal holati uchun yorliq
(String, Color, Color) mealStatusPill(Json m, String userId) {
  final ate = (m['myPortions'] as List).isNotEmpty;
  return switch (m['status']) {
    'cooked' => ate ? (t('Yeyildi'), C.oliveSoft, C.olive) : (t('Yemadingiz'), C.lineSoft, C.muted),
    'locked' => ate ? (t('Pishirilmoqda'), C.mustardSoft, C.mustardInk) : (t('Qatnashmaysiz'), C.lineSoft, C.muted),
    'cancelled' => (t('Bekor qilindi'), C.lineSoft, C.muted),
    _ =>
      (m['myAttendance']?['status'] == 'not_eating')
          ? (t('Yo‘qman'), C.lineSoft, C.muted)
          : (t('Yeyman'), C.terracottaSoft, C.terracottaDark),
  };
}

class _MealRow extends StatelessWidget {
  const _MealRow({required this.meal, required this.onTap});
  final Json meal;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final s = context.read<Session>();
    final (label, bg, fg) = mealStatusPill(meal, s.userId);
    final first = (meal['dishes'] as List).cast<Json>().firstOrNull;
    return AppCard(
      onTap: onTap,
      radius: 16,
      padding: const EdgeInsets.all(12),
      child: Row(
        children: [
          DishImage(url: first?['imageUrl'], width: 52, height: 52, seed: first?['dishId'] ?? ''),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '${mealTypeName(meal['mealType'])} · ${hhmm(parseTime(meal['eatAt']))}',
                  style: sans(12, weight: FontWeight.w700, color: C.muted),
                ),
                const SizedBox(height: 2),
                Text(
                  mealTitle(meal),
                  style: sans(15, weight: FontWeight.w700),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Pill(label, bg: bg, fg: fg),
        ],
      ),
    );
  }
}

/// Navbatdagi mahal: katta kartochka, "Yeyman / Yo'qman"
class _NextMealCard extends StatefulWidget {
  const _NextMealCard({required this.meal, required this.reload});
  final Json meal;
  final Future<void> Function() reload;

  @override
  State<_NextMealCard> createState() => _NextMealCardState();
}

class _NextMealCardState extends State<_NextMealCard> {
  late Json _m = widget.meal;
  bool _busy = false;

  @override
  void didUpdateWidget(_NextMealCard old) {
    super.didUpdateWidget(old);
    _m = widget.meal;
  }

  Future<void> _set(String status) async {
    final s = context.read<Session>();
    setState(() => _busy = true);
    await guard(context, () async {
      final guests = _m['myAttendance']?['guests'] ?? 0;
      final r = await s.api.put('/meals/${_m['id']}/attendance', {'status': status, 'guests': guests}) as Json;
      if (mounted) setState(() => _m = r);
    });
    if (mounted) setState(() => _busy = false);
  }

  @override
  Widget build(BuildContext context) {
    final s = context.watch<Session>();
    final eat = _m['myAttendance']?['status'] != 'not_eating';
    final first = (_m['dishes'] as List).cast<Json>().firstOrNull;
    final lockAt = parseTime(_m['lockAt']);
    final isCook = _m['cookUserId'] == s.userId;
    void open(Widget w) => Navigator.of(context).push(route(w)).then((_) => widget.reload());

    Widget choice(String label, bool on, String status) => Expanded(
      child: SizedBox(
        height: 46,
        child: on
            ? FilledButton(
                style: FilledButton.styleFrom(
                  backgroundColor: C.terracotta,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                ),
                onPressed: _busy ? null : () => _set(status),
                child: Text(
                  label,
                  style: sans(15, weight: FontWeight.w700, color: Colors.white),
                ),
              )
            : OutlinedButton(
                style: OutlinedButton.styleFrom(
                  side: const BorderSide(color: C.terracotta, width: 1.5),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                ),
                onPressed: _busy ? null : () => _set(status),
                child: Text(
                  label,
                  style: sans(15, weight: FontWeight.w700, color: C.terracotta),
                ),
              ),
      ),
    );

    return AppCard(
      padding: EdgeInsets.zero,
      radius: 20,
      borderColor: C.terracotta,
      borderWidth: 2,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Stack(
            children: [
              DishImage(url: first?['imageUrl'], height: 120, radius: 0, seed: first?['dishId'] ?? ''),
              Positioned(
                top: 12,
                left: 12,
                child: Pill(t('Navbatdagi'), bg: C.ink, fg: Colors.white),
              ),
            ],
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            '${mealTypeName(_m['mealType'])} · ${hhmm(parseTime(_m['eatAt']))}',
                            style: sans(12, weight: FontWeight.w700, color: C.muted),
                          ),
                          Text(mealTitle(_m), style: serif(22)),
                        ],
                      ),
                    ),
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        Text(t('Navbatchi'), style: sans(12, color: C.muted)),
                        Text(_m['cookUserId'] == null ? '—' : s.memberName(_m['cookUserId']), style: sans(14, weight: FontWeight.w700)),
                      ],
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    const Icon(Icons.schedule_rounded, size: 16, color: C.terracottaDark),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        t('Ro‘yxat {time} da yopiladi — pishirish boshlanadi', {'time': hhmm(lockAt)}),
                        style: sans(13, weight: FontWeight.w600, color: C.terracottaDark),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                Row(children: [choice(t('Yeyman'), eat, 'eating'), const SizedBox(width: 8), choice(t('Yo‘qman'), !eat, 'not_eating')]),
                const SizedBox(height: 10),
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        t('{n} kishi yeydi · {g} mehmon', {'n': _m['eatingCount'], 'g': _m['guestsCount']}),
                        style: sans(13, color: C.muted),
                      ),
                    ),
                    TextButton(
                      onPressed: () => open(AttendanceScreen(mealId: _m['id'])),
                      child: Text(
                        t('Batafsil · mehmon'),
                        style: sans(13, weight: FontWeight.w700, color: C.terracotta),
                      ),
                    ),
                  ],
                ),
                if (isCook || s.isAdmin)
                  SecondaryButton(
                    label: t('Navbatchi ekrani'),
                    height: 46,
                    onPressed: () => open(CookModeScreen(mealId: _m['id'])),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
