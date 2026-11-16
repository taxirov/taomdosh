import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../api/api_client.dart';
import '../../i18n/strings.dart';
import '../../state/session.dart';
import '../../theme.dart';
import '../../widgets/common.dart';
import '../cookbooks/cookbook_detail.dart';
import '../dishes/dish_page.dart';

/// Moderatsiya (faqat platforma admini): ommaga chiqarish so'ralgan taom va cookbooklar
class ModerationScreen extends StatefulWidget {
  const ModerationScreen({super.key});

  @override
  State<ModerationScreen> createState() => _ModerationScreenState();
}

class _ModerationScreenState extends State<ModerationScreen> {
  Json? _data;
  Object? _error;
  final Set<String> _busy = {};

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final s = context.read<Session>();
    try {
      final r = await s.api.get('/admin/moderation') as Json;
      if (mounted) {
        setState(() {
          _data = r;
          _error = null;
        });
      }
    } catch (e) {
      if (mounted) setState(() => _error = e);
    }
  }

  Future<void> _decide(String kind, Json item, bool approve) async {
    final s = context.read<Session>();
    if (!approve && !await confirm(context, t('“{name}” rad etilsinmi?', {'name': item['title']}), ok: t('Rad etish'))) return;
    if (!mounted) return;
    final id = item['id'] as String;
    setState(() => _busy.add(id));
    final ok = await guard(context, () => s.api.post('/admin/moderation/$kind/$id/${approve ? 'approve' : 'reject'}'));
    if (!mounted) return;
    setState(() {
      _busy.remove(id);
      // Qaror qabul qilingan element ro'yxatdan chiqadi
      if (ok) (_data![kind] as List).removeWhere((x) => x['id'] == id);
    });
    if (ok) showSnack(context, approve ? t('Tasdiqlandi — hammaga ko‘rinadi') : t('Rad etildi'));
  }

  Widget _card(String kind, Json item) {
    final busy = _busy.contains(item['id']);
    final isDish = kind == 'dishes';
    final meta = [
      if (item['authorName'] != null) item['authorName'],
      if (isDish) t('{n} ta masalliq', {'n': item['ingredientsCount']}),
      if (isDish) t('{n} bosqich', {'n': item['stepsCount']}),
      if (!isDish) t('{n} kun', {'n': item['days']}),
      if (!isDish) t('{n} mahal', {'n': item['mealsCount']}),
    ].join(' · ');
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: AppCard(
        radius: 16,
        padding: const EdgeInsets.all(12),
        onTap: () => Navigator.of(
          context,
        ).push(route(isDish ? DishPage(dishId: item['id']) : CookbookDetailScreen(id: item['id']))).then((_) => _load()),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                DishImage(url: item['imageUrl'], width: 56, height: 56, seed: item['id']),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(item['title'] ?? '', style: sans(15, weight: FontWeight.w700)),
                      const SizedBox(height: 2),
                      Text(meta, style: sans(12, color: C.muted)),
                    ],
                  ),
                ),
                const Icon(Icons.chevron_right_rounded, color: C.muted),
              ],
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: SecondaryButton(
                    label: t('Rad etish'),
                    height: 48,
                    color: C.terracottaDark,
                    onPressed: busy ? null : () => _decide(kind, item, false),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: PrimaryButton(
                    label: t('Tasdiqlash'),
                    height: 48,
                    color: C.olive,
                    loading: busy,
                    onPressed: () => _decide(kind, item, true),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final dishes = ((_data?['dishes'] as List?) ?? []).cast<Json>();
    final cookbooks = ((_data?['cookbooks'] as List?) ?? []).cast<Json>();
    return Scaffold(
      body: SafeArea(
        child: RefreshIndicator(
          color: C.terracotta,
          onRefresh: _load,
          child: ListView(
            padding: const EdgeInsets.fromLTRB(20, 24, 20, 24),
            children: [
              ScreenHeader(title: t('Moderatsiya'), subtitle: t('Ommaga chiqarish so‘ralganlar')),
              const SizedBox(height: 16),
              if (_data == null && _error == null) const SkeletonList(rows: 4),
              if (_data == null && _error != null) ErrorView(error: _error!, onRetry: _load),
              if (_data != null && dishes.isEmpty && cookbooks.isEmpty)
                EmptyView(
                  icon: Icons.verified_outlined,
                  title: t('Hammasi ko‘rib chiqilgan'),
                  text: t('Yangi taom yoki cookbook ommaga chiqarishga yuborilsa, shu yerda paydo bo‘ladi.'),
                  action: SizedBox(
                    width: 200,
                    child: SecondaryButton(label: t('Yangilash'), height: 48, onPressed: _load),
                  ),
                ),
              if (dishes.isNotEmpty) ...[SectionLabel(t('Taomlar')), const SizedBox(height: 8), for (final d in dishes) _card('dishes', d)],
              if (cookbooks.isNotEmpty) ...[
                const SizedBox(height: 8),
                SectionLabel(t('Cookbooklar')),
                const SizedBox(height: 8),
                for (final c in cookbooks) _card('cookbooks', c),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
