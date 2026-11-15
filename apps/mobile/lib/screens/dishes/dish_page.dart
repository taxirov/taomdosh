import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../api/api_client.dart';
import '../../format.dart';
import '../../i18n/strings.dart';
import '../../state/session.dart';
import '../../theme.dart';
import '../../widgets/common.dart';
import '../../widgets/image_pick.dart';
import 'add_dish.dart';

/// Taom sahifasi: rasm/video, vaqt va kaloriya, masalliqlar (kishi soniga masshtab), bosqichlar.
/// Muallif uchun: rasm yuklash, tahrirlash va o'chirish.
class DishPage extends StatelessWidget {
  const DishPage({super.key, required this.dishId});
  final String dishId;

  @override
  Widget build(BuildContext context) {
    final s = context.read<Session>();
    return Scaffold(
      body: Loader<Json>(
        load: () async => await s.api.get('/dishes/$dishId') as Json,
        skeleton: const _DishSkeleton(),
        builder: (context, d, reload) => _Body(key: ValueKey('${d['id']}-${d['updatedAt']}'), d: d, reload: reload),
      ),
    );
  }
}

class _DishSkeleton extends StatelessWidget {
  const _DishSkeleton();

  @override
  Widget build(BuildContext context) => ListView(
    padding: EdgeInsets.zero,
    physics: const NeverScrollableScrollPhysics(),
    children: const [
      Skeleton(height: 300, radius: 0),
      Padding(
        padding: EdgeInsets.fromLTRB(20, 20, 20, 0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Skeleton(width: 220, height: 30),
            SizedBox(height: 16),
            Skeleton(height: 56, radius: 12),
            SkeletonList(rows: 5, leading: false),
          ],
        ),
      ),
    ],
  );
}

class _Body extends StatefulWidget {
  const _Body({super.key, required this.d, required this.reload});
  final Json d;
  final Future<void> Function() reload;

  @override
  State<_Body> createState() => _BodyState();
}

class _BodyState extends State<_Body> {
  late int _servings = (widget.d['baseServings'] as num).toInt();
  late bool _fav = widget.d['isFavorite'] == true;
  bool _uploading = false;

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

  /// Video tashqi ilovada (YouTube, Instagram, brauzer) ochiladi
  Future<void> _openVideo() async {
    final uri = Uri.tryParse(widget.d['videoUrl'] as String? ?? '');
    var ok = false;
    if (uri != null && (uri.isScheme('http') || uri.isScheme('https'))) {
      try {
        ok = await launchUrl(uri, mode: LaunchMode.externalApplication);
      } catch (_) {}
    }
    if (!ok && mounted) showSnack(context, t('Videoni ochib bo‘lmadi'));
  }

  Future<void> _share() async {
    final d = widget.d;
    final lines = [
      d['title'],
      t('{n} kkal/porsiya', {'n': d['kcalPerServing']}),
      '',
      for (final i in (d['ingredients'] as List).cast<Json>())
        '• ${i['name']} — ${recipeQty(i['displayQty'], i['displayUnit'], (i['qtyG'] as num).round())}',
      if ((d['videoUrl'] ?? '').toString().isNotEmpty) ...['', d['videoUrl']],
    ];
    await Clipboard.setData(ClipboardData(text: lines.join('\n')));
    if (mounted) showSnack(context, t('Retsept nusxalandi — do‘stlaringizga yuboring'));
  }

  Future<void> _changePhoto() async {
    final s = context.read<Session>();
    final bytes = await pickDishPhoto(context);
    if (bytes == null || !mounted) return;
    setState(() => _uploading = true);
    final ok = await guard(context, () => s.api.upload('/dishes/${widget.d['id']}/image', bytes, filename: 'dish.jpg'));
    if (!mounted) return;
    setState(() => _uploading = false);
    if (ok) await widget.reload();
  }

  Future<void> _edit() async {
    final changed = await Navigator.of(context).push<bool>(route(AddDishScreen(dish: widget.d)));
    if (changed == true) await widget.reload();
  }

  Future<void> _delete() async {
    final s = context.read<Session>();
    final yes = await confirm(
      context,
      t('“{name}” o‘chirilsinmi? Taom katalogdan yo‘qoladi; rejalashtirilgan mahallarda qoladi.', {'name': widget.d['title']}),
      ok: t('O‘chirish'),
    );
    if (!yes || !mounted) return;
    final ok = await guard(context, () => s.api.delete('/dishes/${widget.d['id']}'));
    if (ok && mounted) Navigator.of(context).pop(true);
  }

  @override
  Widget build(BuildContext context) {
    final d = widget.d;
    final base = (d['baseServings'] as num).toInt();
    final k = _servings / base;
    final top = MediaQuery.of(context).padding.top;
    final hasVideo = (d['videoUrl'] ?? '').toString().isNotEmpty;
    final canEdit = d['canEdit'] == true;
    final saved = (d['favoritesCount'] as num?) ?? 0;
    final status = switch ((d['visibility'], d['moderationStatus'])) {
      (_, 'pending') => t('Moderatsiyada'),
      (_, 'rejected') => t('Ommaga chiqarilmadi'),
      ('group', _) => t('Guruh taomi'),
      _ => null,
    };

    return Column(
      children: [
        Expanded(
          child: ListView(
            padding: EdgeInsets.zero,
            children: [
              SizedBox(
                height: 300 + top,
                child: Stack(
                  fit: StackFit.expand,
                  children: [
                    DishImage(url: d['imageUrl'], radius: 0, seed: d['id']),
                    Positioned(top: top + 20, left: 20, child: const BackBtn()),
                    Positioned(
                      top: top + 20,
                      right: 76,
                      child: CircleBtn(icon: Icons.ios_share_rounded, tooltip: t('Ulashish'), onTap: _share),
                    ),
                    Positioned(
                      top: top + 20,
                      right: 20,
                      child: CircleBtn(
                        icon: _fav ? Icons.favorite_rounded : Icons.favorite_border_rounded,
                        iconColor: C.terracotta,
                        tooltip: t('Sevimlilarga saqlash'),
                        onTap: _toggleFav,
                      ),
                    ),
                    if (hasVideo)
                      Center(
                        child: Tooltip(
                          message: t('Tayyorlash videosini ko‘rish'),
                          child: Material(
                            color: const Color(0xC72B2019),
                            shape: const CircleBorder(),
                            child: InkWell(
                              customBorder: const CircleBorder(),
                              onTap: _openVideo,
                              child: const SizedBox.square(
                                dimension: 72,
                                child: Icon(Icons.play_arrow_rounded, size: 40, color: Colors.white),
                              ),
                            ),
                          ),
                        ),
                      ),
                    if (hasVideo)
                      Positioned(
                        left: 20,
                        bottom: 14,
                        child: Pill(t('Video'), bg: C.ink, fg: Colors.white),
                      ),
                    if (canEdit)
                      Positioned(
                        right: 20,
                        bottom: 10,
                        child: _uploading
                            ? const SizedBox.square(
                                dimension: 44,
                                child: Padding(
                                  padding: EdgeInsets.all(10),
                                  child: CircularProgressIndicator(strokeWidth: 2.5, color: C.card),
                                ),
                              )
                            : CircleBtn(
                                icon: Icons.photo_camera_outlined,
                                tooltip: (d['imageUrl'] ?? '').toString().isEmpty ? t('Rasm qo‘shish') : t('Rasmni almashtirish'),
                                onTap: _changePhoto,
                              ),
                      ),
                  ],
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 20, 20, 32),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    if (status != null) ...[
                      Align(
                        alignment: Alignment.centerLeft,
                        child: Pill(status, bg: C.terracottaSoft, fg: C.terracottaDark),
                      ),
                      const SizedBox(height: 8),
                    ],
                    Text(d['title'] ?? '', style: serif(32, height: 1.1)),
                    if ((d['description'] ?? '').toString().isNotEmpty) ...[
                      const SizedBox(height: 8),
                      Text(d['description'], style: sans(14, color: C.muted, height: 1.5)),
                    ],
                    if (saved > 0) ...[
                      const SizedBox(height: 8),
                      Text(t('♥ {n} kishi saqlagan', {'n': groupDigits(saved)}), style: sans(13, color: C.muted)),
                    ],
                    const SizedBox(height: 18),
                    Row(
                      children: [
                        StatTile('${d['activeMin']}', t('faol daq')),
                        const SizedBox(width: 8),
                        StatTile('${d['passiveMin']}', t('passiv daq')),
                        const SizedBox(width: 8),
                        StatTile('${d['kcalPerServing']}', t('kkal/porsiya')),
                        const SizedBox(width: 8),
                        StatTile('$base', t('porsiya')),
                      ],
                    ),
                    if ((d['prepAheadMin'] as num) > 0) ...[
                      const SizedBox(height: 18),
                      InfoBanner(
                        icon: Icons.water_drop_outlined,
                        text: t('Oldindan tayyorgarlik kerak (~{h} soat): ivitish yoki marinad. Navbatchiga bir kun oldin eslatiladi.', {
                          'h': dec((d['prepAheadMin'] as num) / 60),
                        }),
                      ),
                    ],
                    const SizedBox(height: 18),
                    Row(
                      children: [
                        Expanded(
                          child: Text(t('Masalliqlar'), style: sans(18, weight: FontWeight.w800)),
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
                          KeyValueRow(
                            i['name'] ?? '',
                            recipeQty(
                              i['displayQty'] == null ? null : (i['displayQty'] as num) * k,
                              i['displayUnit'],
                              ((i['qtyG'] as num) * k).round(),
                            ),
                          ),
                      ],
                    ),
                    if ((d['steps'] as List).isNotEmpty) ...[
                      const SizedBox(height: 18),
                      Text(t('Tayyorlash'), style: sans(18, weight: FontWeight.w800)),
                      const SizedBox(height: 12),
                    ],
                    for (final st in (d['steps'] as List).cast<Json>())
                      Padding(
                        padding: const EdgeInsets.only(bottom: 12),
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            StepBadge('${st['n']}'),
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
                                  Padding(
                                    padding: const EdgeInsets.only(top: 4),
                                    child: Text(st['text'] ?? '', style: sans(14, height: 1.5)),
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),
                  ],
                ),
              ),
            ],
          ),
        ),
        if (canEdit)
          BottomBar(
            children: [
              Expanded(
                child: SecondaryButton(label: t('O‘chirish'), color: C.terracottaDark, onPressed: _delete),
              ),
              const SizedBox(width: 10),
              Expanded(
                flex: 3,
                child: PrimaryButton(label: t('Tahrirlash'), onPressed: _edit),
              ),
            ],
          ),
      ],
    );
  }
}
