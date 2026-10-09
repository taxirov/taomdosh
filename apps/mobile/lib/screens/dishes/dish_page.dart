import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../api/api_client.dart';
import '../../format.dart';
import '../../i18n/strings.dart';
import '../../state/session.dart';
import '../../theme.dart';
import '../../widgets/common.dart';

/// Taom sahifasi: vaqt, kaloriya, masalliqlar (kishi soniga masshtab), bosqichlar
class DishPage extends StatelessWidget {
  const DishPage({super.key, required this.dishId});
  final String dishId;

  @override
  Widget build(BuildContext context) {
    final s = context.read<Session>();
    return Scaffold(
      body: Loader<Json>(
        load: () async => await s.api.get('/dishes/$dishId') as Json,
        builder: (context, d, _) => _Body(d: d),
      ),
    );
  }
}

class _Body extends StatefulWidget {
  const _Body({required this.d});
  final Json d;

  @override
  State<_Body> createState() => _BodyState();
}

class _BodyState extends State<_Body> {
  late int _servings = (widget.d['baseServings'] as num).toInt();
  late bool _fav = widget.d['isFavorite'] == true;

  Future<void> _toggleFav() async {
    final s = context.read<Session>();
    final next = !_fav;
    setState(() => _fav = next);
    final ok = await guard(context, () async {
      final path = '/dishes/${widget.d['id']}/favorite';
      next ? await s.api.post(path) : await s.api.delete(path);
    });
    if (!ok && mounted) setState(() => _fav = !next);
  }

  @override
  Widget build(BuildContext context) {
    final d = widget.d;
    final base = (d['baseServings'] as num).toInt();
    final k = _servings / base;
    final top = MediaQuery.of(context).padding.top;

    Widget stat(IconData icon, String text) => Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: C.card,
        border: Border.all(color: C.line),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 16, color: C.terracottaDark),
          const SizedBox(width: 6),
          Text(text, style: sans(13, weight: FontWeight.w700)),
        ],
      ),
    );

    return ListView(
      padding: EdgeInsets.zero,
      children: [
        Stack(
          children: [
            DishImage(url: d['imageUrl'], height: 260 + top, radius: 0, seed: d['id']),
            Positioned(top: top + 12, left: 20, child: const BackBtn()),
            Positioned(
              top: top + 12,
              right: 20,
              child: CircleBtn(
                icon: _fav ? Icons.favorite_rounded : Icons.favorite_border_rounded,
                tooltip: t('Sevimlilarga saqlash'),
                onTap: _toggleFav,
              ),
            ),
          ],
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 18, 20, 32),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(d['title'] ?? '', style: serif(30, height: 1.1)),
              if ((d['description'] ?? '').toString().isNotEmpty) ...[
                const SizedBox(height: 8),
                Text(d['description'], style: sans(14, color: C.muted, height: 1.5)),
              ],
              if (d['visibility'] == 'group') ...[
                const SizedBox(height: 8),
                Align(
                  alignment: Alignment.centerLeft,
                  child: Pill(
                    d['moderationStatus'] == 'pending' ? t('Guruh taomi · moderatsiyada') : t('Guruh taomi'),
                    bg: C.blueSoft,
                    fg: C.blue,
                  ),
                ),
              ],
              const SizedBox(height: 14),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  stat(Icons.timer_outlined, t('{n} faol daq', {'n': d['activeMin']})),
                  if ((d['passiveMin'] as num) > 0) stat(Icons.hourglass_bottom_rounded, t('{n} passiv daq', {'n': d['passiveMin']})),
                  stat(Icons.local_fire_department_outlined, t('{n} kkal/porsiya', {'n': d['kcalPerServing']})),
                ],
              ),
              if ((d['prepAheadMin'] as num) > 0) ...[
                const SizedBox(height: 14),
                InfoBanner(
                  icon: Icons.water_drop_outlined,
                  text: t('Oldindan tayyorgarlik kerak (~{h} soat): ivitish yoki marinad. Navbatchiga bir kun oldin eslatiladi.', {
                    'h': dec((d['prepAheadMin'] as num) / 60),
                  }),
                ),
              ],
              const SizedBox(height: 20),
              Row(
                children: [
                  Expanded(
                    child: Text(t('Masalliqlar'), style: sans(16, weight: FontWeight.w800)),
                  ),
                  Counter(
                    value: _servings,
                    min: 1,
                    max: 50,
                    label: t('{n} kishi', {'n': _servings}),
                    onChanged: (v) => setState(() => _servings = v),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              CardList(
                children: [
                  for (final i in (d['ingredients'] as List).cast<Json>())
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 11),
                      child: Row(
                        children: [
                          Expanded(
                            child: Text(i['name'] ?? '', style: sans(14, weight: FontWeight.w600)),
                          ),
                          Text(
                            recipeQty(
                              i['displayQty'] == null ? null : (i['displayQty'] as num) * k,
                              i['displayUnit'],
                              ((i['qtyG'] as num) * k).round(),
                            ),
                            style: sans(14, weight: FontWeight.w800),
                          ),
                        ],
                      ),
                    ),
                ],
              ),
              const SizedBox(height: 20),
              Text(t('Tayyorlash'), style: sans(16, weight: FontWeight.w800)),
              const SizedBox(height: 10),
              for (final st in (d['steps'] as List).cast<Json>())
                Padding(
                  padding: const EdgeInsets.only(bottom: 14),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Container(
                        width: 28,
                        height: 28,
                        alignment: Alignment.center,
                        decoration: const BoxDecoration(color: C.terracotta, shape: BoxShape.circle),
                        child: Text(
                          '${st['n']}',
                          style: sans(13, weight: FontWeight.w800, color: Colors.white),
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            if (st['durationMin'] != null)
                              Text(
                                t('{n} daq', {'n': st['durationMin']}),
                                style: sans(12, weight: FontWeight.w700, color: C.muted),
                              ),
                            Text(st['text'] ?? '', style: sans(14, height: 1.5)),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              if ((d['videoUrl'] ?? '').toString().isNotEmpty) ...[
                const SizedBox(height: 4),
                AppCard(
                  child: Row(
                    children: [
                      const Icon(Icons.play_circle_outline_rounded, color: C.terracotta),
                      const SizedBox(width: 10),
                      Expanded(
                        child: SelectableText(d['videoUrl'], style: sans(13, color: C.terracotta)),
                      ),
                    ],
                  ),
                ),
              ],
            ],
          ),
        ),
      ],
    );
  }
}
