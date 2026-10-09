import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../api/api_client.dart';
import '../../format.dart';
import '../../i18n/strings.dart';
import '../../state/session.dart';
import '../../theme.dart';
import '../../widgets/common.dart';
import '../dishes/dish_page.dart';

/// Navbatchi ekrani: masshtablangan masalliqlar, har kimga necha gramm suzish, bosqichlar, ovqatdan keyingi baho.
/// Vazn, maqsad va kaloriya ko'rsatilmaydi (server ham bermaydi).
class CookModeScreen extends StatelessWidget {
  const CookModeScreen({super.key, required this.mealId});
  final String mealId;

  @override
  Widget build(BuildContext context) {
    final s = context.read<Session>();
    return Scaffold(
      body: SafeArea(
        child: Loader<(Json, Json)>(
          load: () async {
            final r = await Future.wait([s.api.get('/meals/$mealId/cook-view'), s.api.get('/meals/$mealId')]);
            return (r[0] as Json, r[1] as Json);
          },
          builder: (context, d, reload) => RefreshIndicator(
            onRefresh: reload,
            child: _CookBody(view: d.$1, meal: d.$2, reload: reload),
          ),
        ),
      ),
    );
  }
}

class _CookBody extends StatefulWidget {
  const _CookBody({required this.view, required this.meal, required this.reload});
  final Json view;
  final Json meal;
  final Future<void> Function() reload;

  @override
  State<_CookBody> createState() => _CookBodyState();
}

class _CookBodyState extends State<_CookBody> {
  Timer? _tick;
  int _dish = 0;
  String? _verdict;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _tick = Timer.periodic(const Duration(seconds: 1), (_) => mounted ? setState(() {}) : null);
  }

  @override
  void dispose() {
    _tick?.cancel();
    super.dispose();
  }

  Future<void> _lockNow() async {
    final ok = await confirm(
      context,
      t('Ro‘yxatni hozir yopib, porsiyalarni hisoblaymizmi? Shundan keyin qatnashuvni o‘zgartirib bo‘lmaydi.'),
      ok: t('Yopish'),
    );
    if (!ok || !mounted) return;
    setState(() => _busy = true);
    await guard(context, () => context.read<Session>().api.post('/meals/${widget.view['mealId']}/lock'));
    if (mounted) setState(() => _busy = false);
    await widget.reload();
  }

  Future<void> _feedback(String v) async {
    setState(() => _verdict = v);
    final s = context.read<Session>();
    final ok = await guard(context, () async {
      final r = await s.api.post('/meals/${widget.view['mealId']}/feedback', {'verdict': v}) as Json;
      if (mounted && r['suggestLightSide'] == true) {
        showSnack(
          context,
          t('Rahmat! Maqsadingiz vazn tashlash bo‘lgani uchun porsiya oshirilmaydi — salat yoki sabzavot qo‘shishni tavsiya qilamiz.'),
        );
      } else if (mounted) {
        showSnack(context, t('Rahmat! Keyingi porsiyalaringiz shunga qarab moslashadi.'));
      }
    });
    if (!ok && mounted) setState(() => _verdict = null);
  }

  @override
  Widget build(BuildContext context) {
    final s = context.watch<Session>();
    final v = widget.view;
    final dishes = (v['dishes'] as List).cast<Json>();
    final isFinal = v['isFinal'] == true;
    final eatAt = parseTime(v['eatAt']);
    final left = eatAt.difference(DateTime.now());
    final canLock = !isFinal && v['status'] == 'planned' && (v['cookUserId'] == s.userId || s.isAdmin);
    final ate = (widget.meal['myPortions'] as List).isNotEmpty;
    final main = dishes.where((d) => d['isSide'] != true).firstOrNull ?? dishes.firstOrNull;
    if (main == null) return EmptyView(text: t('Bu mahalda taom yo‘q'));
    final d = dishes[_dish.clamp(0, dishes.length - 1)];
    final members = (main['portions'] as List).where((p) => p['isGuest'] != true).length;
    final guests = (main['portions'] as List).where((p) => p['isGuest'] == true).length;
    final notEating = (widget.meal['attendance'] as List)
        .cast<Json>()
        .where((a) => a['status'] == 'not_eating')
        .map((a) => a['name'])
        .toList();
    String timer(Duration d) {
      if (d.isNegative) return '0:00:00';
      return '${d.inHours}:${(d.inMinutes % 60).toString().padLeft(2, '0')}:${(d.inSeconds % 60).toString().padLeft(2, '0')}';
    }

    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
      children: [
        Row(
          children: [
            const BackBtn(),
            const Spacer(),
            Pill(
              isFinal ? t('Ro‘yxat yopildi') : t('Taxminiy — ro‘yxat ochiq'),
              bg: isFinal ? C.ink : C.mustardSoft,
              fg: isFinal ? Colors.white : C.mustardInk,
            ),
          ],
        ),
        const SizedBox(height: 16),
        Text(
          t('Navbatchi ekrani · {name}', {'name': v['cookUserId'] == null ? '—' : s.memberName(v['cookUserId'])}),
          style: sans(13, weight: FontWeight.w700, color: C.terracottaDark),
        ),
        const SizedBox(height: 4),
        Text(t('{dish} — {n} porsiya', {'dish': main['title'], 'n': dec(main['totalServings'] as num)}), style: serif(28, height: 1.1)),
        const SizedBox(height: 4),
        Text(
          [
            t('{m} a’zo + {g} mehmon', {'m': members, 'g': guests}),
            t('porsiyalar har kimga alohida'),
            if (notEating.isNotEmpty) t('{names} yo‘q', {'names': notEating.join(', ')}),
          ].join(' · '),
          style: sans(13, color: C.muted),
        ),
        const SizedBox(height: 16),
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(color: C.ink, borderRadius: BorderRadius.circular(20)),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      t('Dasturxonga {time}', {'time': hhmm(eatAt)}),
                      style: sans(12, weight: FontWeight.w600, color: C.border),
                    ),
                    Text(timer(left), style: serif(28, color: const Color(0xFFFFF4E8))),
                  ],
                ),
              ),
              if (canLock)
                FilledButton(
                  style: FilledButton.styleFrom(
                    backgroundColor: C.mustard,
                    foregroundColor: C.ink,
                    minimumSize: const Size(0, 48),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                  ),
                  onPressed: _busy ? null : _lockNow,
                  child: Text(t('Boshlash'), style: sans(15, weight: FontWeight.w800)),
                ),
            ],
          ),
        ),
        if (dishes.length > 1) ...[
          const SizedBox(height: 16),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (var i = 0; i < dishes.length; i++)
                ChoicePill(label: dishes[i]['title'], selected: i == _dish, onTap: () => setState(() => _dish = i)),
            ],
          ),
        ],
        const SizedBox(height: 16),
        SectionTitle(t('Mahsulotlar ({n} porsiyaga)', {'n': dec(d['totalServings'] as num)})),
        const SizedBox(height: 10),
        CardList(
          children: [
            for (final i in (d['ingredients'] as List).cast<Json>())
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 11),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(i['name'], style: sans(14, weight: FontWeight.w600)),
                    ),
                    Text(
                      i['market']?['unit'] == 'pcs'
                          ? '${displayQty(i['market'])} · ${i['qtyG']} g'
                          : recipeQty(i['displayQty'], i['displayUnit'], i['qtyG']),
                      style: sans(14, weight: FontWeight.w800),
                    ),
                  ],
                ),
              ),
          ],
        ),
        const SizedBox(height: 20),
        SectionTitle(
          t('Kimga qancha suzish kerak'),
          trailing: Text(t('jami {g} g', {'g': groupDigits(d['totalGrams'] as num)}), style: sans(12, color: C.muted)),
        ),
        const SizedBox(height: 10),
        CardList(
          children: [
            for (final p in (d['portions'] as List).cast<Json>())
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                child: Row(
                  children: [
                    Avatar(
                      name: p['isGuest'] == true ? t('Mehmon') : p['name'] ?? '',
                      id: p['userId'] ?? p['hostUserId'] ?? '',
                      color: p['isGuest'] == true ? C.mustardInk : null,
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(p['isGuest'] == true ? t('Mehmon') : (p['name'] ?? ''), style: sans(15, weight: FontWeight.w700)),
                          Text(
                            p['isGuest'] == true ? t('{host}dan · standart', {'host': p['hostName'] ?? ''}) : t('shaxsiy porsiya'),
                            style: sans(12, color: C.muted),
                          ),
                        ],
                      ),
                    ),
                    Text('${groupDigits(p['grams'] as num)} g', style: sans(17, weight: FontWeight.w800)),
                  ],
                ),
              ),
          ],
        ),
        const SizedBox(height: 8),
        Text(
          t('Porsiya yosh, vazn, bo‘y, faollik va maqsaddan hisoblanadi, so‘ng har kimning bahosiga qarab moslashib boradi.'),
          style: sans(12, color: C.muted, height: 1.45),
        ),
        if (isFinal && ate) ...[
          const SizedBox(height: 16),
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: C.card,
              borderRadius: BorderRadius.circular(18),
              border: Border.all(color: const Color(0xFFC9B49B), width: 1.5),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(t('Ovqatdan keyin: porsiyangiz yetdimi?'), style: sans(14, weight: FontWeight.w800)),
                const SizedBox(height: 10),
                Row(
                  children: [
                    for (final e in {'too_much': t('Ortib qoldi'), 'enough': t('Yetarli'), 'not_enough': t('Yetmadi')}.entries) ...[
                      if (e.key != 'too_much') const SizedBox(width: 6),
                      Expanded(
                        child: SizedBox(
                          height: 44,
                          child: OutlinedButton(
                            style: OutlinedButton.styleFrom(
                              padding: EdgeInsets.zero,
                              backgroundColor: _verdict == e.key ? C.olive : Colors.transparent,
                              side: BorderSide(color: _verdict == e.key ? C.olive : C.border, width: 1.5),
                              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                            ),
                            onPressed: _verdict == null ? () => _feedback(e.key) : null,
                            child: Text(
                              e.value,
                              style: sans(13, weight: FontWeight.w700, color: _verdict == e.key ? Colors.white : C.ink),
                            ),
                          ),
                        ),
                      ),
                    ],
                  ],
                ),
                const SizedBox(height: 8),
                Text(t('Bahoingiz keyingi safar porsiyangizni aniqlashtiradi.'), style: sans(12, color: C.muted)),
              ],
            ),
          ),
        ],
        const SizedBox(height: 20),
        SectionTitle(t('Bosqichlar')),
        const SizedBox(height: 10),
        for (final st in (d['steps'] as List).cast<Json>())
          Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  width: 28,
                  height: 28,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(color: st['n'] == 1 ? C.terracotta : C.lineSoft, shape: BoxShape.circle),
                  child: Text(
                    '${st['n']}',
                    style: sans(13, weight: FontWeight.w800, color: st['n'] == 1 ? Colors.white : C.ink),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(st['text'], style: sans(14, weight: FontWeight.w600, height: 1.4)),
                ),
                if (st['durationMin'] != null) ...[
                  const SizedBox(width: 8),
                  Text(t('{n} daq', {'n': st['durationMin']}), style: sans(12, color: C.muted)),
                ],
              ],
            ),
          ),
        const SizedBox(height: 12),
        PrimaryButton(
          label: t('To‘liq retseptni ochish'),
          onPressed: () => Navigator.of(context).push(route(DishPage(dishId: d['dishId']))),
        ),
      ],
    );
  }
}
