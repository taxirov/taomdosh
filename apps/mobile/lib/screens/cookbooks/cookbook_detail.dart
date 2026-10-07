import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../api/api_client.dart';
import '../../format.dart';
import '../../i18n/strings.dart';
import '../../state/session.dart';
import '../../theme.dart';
import '../../widgets/common.dart';
import '../dishes/dish_page.dart';
import '../home_shell.dart';
import 'cookbook_editor.dart';

class CookbookDetailScreen extends StatelessWidget {
  const CookbookDetailScreen({super.key, required this.id});
  final String id;

  @override
  Widget build(BuildContext context) {
    final s = context.read<Session>();
    return Scaffold(
      body: Loader<Json>(
        load: () async => await s.api.get('/cookbooks/$id') as Json,
        builder: (context, c, _) => _Body(c: c),
      ),
    );
  }
}

class _Body extends StatefulWidget {
  const _Body({required this.c});
  final Json c;

  @override
  State<_Body> createState() => _BodyState();
}

class _BodyState extends State<_Body> {
  int _day = 0;
  bool _busy = false;

  List<Json> get _meals => (widget.c['meals'] as List).cast<Json>();

  Future<void> _apply() async {
    final s = context.read<Session>();
    if (s.groupId == null) {
      showSnack(context, t('Avval guruh yarating yoki qo‘shiling'));
      return;
    }
    final monday = mondayOf(DateTime.now());
    final week = await showModalBottomSheet<DateTime>(
      context: context,
      builder: (ctx) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(t('Qaysi haftaga?'), style: serif(22)),
              const SizedBox(height: 6),
              Text(
                t('O‘tib ketgan mahallar qo‘shilmaydi. Shu haftaning oldingi rejasi almashtiriladi.'),
                style: sans(13, color: C.muted, height: 1.4),
              ),
              const SizedBox(height: 16),
              PrimaryButton(label: t('Shu hafta ({d})', {'d': shortDate(monday)}), onPressed: () => Navigator.pop(ctx, monday)),
              const SizedBox(height: 10),
              SecondaryButton(
                label: t('Keyingi hafta ({d})', {'d': shortDate(monday.add(const Duration(days: 7)))}),
                onPressed: () => Navigator.pop(ctx, monday.add(const Duration(days: 7))),
              ),
            ],
          ),
        ),
      ),
    );
    if (week == null || !mounted) return;
    setState(() => _busy = true);
    await guard(context, () async {
      final r = await s.api.post('/groups/${s.groupId}/plans', {'cookbookId': widget.c['id'], 'weekStart': ymd(week)}) as Json;
      if (!mounted) return;
      showSnack(context, t('{n} ta mahal rejaga qo‘shildi', {'n': r['created']}));
      Navigator.of(context).popUntil((r) => r.isFirst);
      HomeShell.go(context, 0);
    });
    if (mounted) setState(() => _busy = false);
  }

  @override
  Widget build(BuildContext context) {
    final s = context.watch<Session>();
    final c = widget.c;
    final dayMeals = _meals.where((m) => m['dayIndex'] == _day).toList();
    final days = (c['days'] as num).toInt().clamp(1, 7);
    final kcalPerDay = _meals.isEmpty
        ? 0
        : _meals.expand((m) => (m['dishes'] as List).cast<Json>()).fold<num>(0, (a, d) => a + (d['kcalPerServing'] as num)) / days;
    final dishCount = _meals.expand((m) => (m['dishes'] as List).cast<Json>()).map((d) => d['dishId']).toSet().length;

    Widget stat(String big, String small) => Expanded(
      child: AppCard(
        radius: 12,
        padding: const EdgeInsets.symmetric(vertical: 10),
        child: Column(
          children: [
            Text(big, style: sans(16, weight: FontWeight.w800)),
            Text(small, style: sans(12, color: C.muted)),
          ],
        ),
      ),
    );

    return Column(
      children: [
        Expanded(
          child: ListView(
            padding: EdgeInsets.zero,
            children: [
              Stack(
                children: [
                  SizedBox(
                    height: 170 + MediaQuery.of(context).padding.top,
                    child: Row(
                      children: [
                        for (var i = 0; i < 3; i++) ...[
                          if (i > 0) const SizedBox(width: 3),
                          Expanded(
                            child: DishImage(url: i == 0 ? c['coverUrl'] : null, radius: 0, seed: '${c['id']}$i'),
                          ),
                        ],
                      ],
                    ),
                  ),
                  Positioned(top: MediaQuery.of(context).padding.top + 12, left: 20, child: const BackBtn()),
                ],
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 18, 20, 16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text(c['title'] ?? '', style: serif(28)),
                    if ((c['description'] ?? '').toString().isNotEmpty) ...[
                      const SizedBox(height: 6),
                      Text(c['description'], style: sans(14, color: C.muted, height: 1.45)),
                    ],
                    const SizedBox(height: 14),
                    Row(
                      children: [
                        stat(t('{n} kun', {'n': days}), t('davomiylik')),
                        const SizedBox(width: 8),
                        stat(t('{n} taom', {'n': dishCount}), t('{n} mahal', {'n': _meals.length})),
                        const SizedBox(width: 8),
                        stat('~${groupDigits(kcalPerDay)}', t('kkal / kun')),
                      ],
                    ),
                    const SizedBox(height: 14),
                    Row(
                      children: [
                        for (var i = 0; i < 7; i++) ...[
                          if (i > 0) const SizedBox(width: 4),
                          Expanded(
                            child: Semantics(
                              selected: i == _day,
                              button: true,
                              child: GestureDetector(
                                onTap: () => setState(() => _day = i),
                                child: Container(
                                  height: 48,
                                  alignment: Alignment.center,
                                  decoration: BoxDecoration(
                                    color: i == _day ? C.terracotta : C.lineSoft,
                                    borderRadius: BorderRadius.circular(12),
                                  ),
                                  child: Text(
                                    weekdaysShort()[i],
                                    style: sans(
                                      13,
                                      weight: i == _day ? FontWeight.w800 : FontWeight.w600,
                                      color: i == _day ? Colors.white : C.ink,
                                    ),
                                  ),
                                ),
                              ),
                            ),
                          ),
                        ],
                      ],
                    ),
                    const SizedBox(height: 12),
                    if (dayMeals.isEmpty) EmptyView(text: t('Bu kunga mahal yo‘q')),
                    for (final m in dayMeals)
                      for (final d in (m['dishes'] as List).cast<Json>())
                        Padding(
                          padding: const EdgeInsets.only(bottom: 8),
                          child: AppCard(
                            radius: 16,
                            padding: const EdgeInsets.all(10),
                            onTap: () => Navigator.of(context).push(route(DishPage(dishId: d['dishId']))),
                            child: Row(
                              children: [
                                DishImage(url: d['imageUrl'], width: 52, height: 52, seed: d['dishId']),
                                const SizedBox(width: 12),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        '${mealTypeName(m['mealType'])}${m['eatTime'] != null ? ' · ${m['eatTime']}' : ''}${d['isSide'] == true ? ' · ${t('qo‘shimcha')}' : ''}',
                                        style: sans(12, weight: FontWeight.w700, color: C.muted),
                                      ),
                                      Text(d['title'] ?? '', style: sans(15, weight: FontWeight.w700)),
                                    ],
                                  ),
                                ),
                                Text('${d['kcalPerServing']} ${t('kkal')}', style: sans(12, color: C.muted)),
                              ],
                            ),
                          ),
                        ),
                  ],
                ),
              ),
            ],
          ),
        ),
        SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
            child: Row(
              children: [
                Expanded(
                  flex: 11,
                  child: SecondaryButton(
                    label: t('Nusxa olish'),
                    onPressed: () => Navigator.of(context).push(route(CookbookEditorScreen(copyFrom: widget.c))),
                  ),
                ),
                if (s.isAdmin) ...[
                  const SizedBox(width: 10),
                  Expanded(
                    flex: 15,
                    child: PrimaryButton(label: t('Guruhga qo‘llash'), loading: _busy, onPressed: _apply),
                  ),
                ],
              ],
            ),
          ),
        ),
      ],
    );
  }
}
