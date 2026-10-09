import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../api/api_client.dart';
import '../../i18n/strings.dart';
import '../../state/session.dart';
import '../../theme.dart';
import '../../widgets/common.dart';
import 'cookbook_detail.dart';
import 'cookbook_editor.dart';

class CookbooksScreen extends StatefulWidget {
  const CookbooksScreen({super.key});

  @override
  State<CookbooksScreen> createState() => _CookbooksScreenState();
}

class _CookbooksScreenState extends State<CookbooksScreen> {
  String _q = '';
  String _filter = 'all';

  @override
  Widget build(BuildContext context) {
    final s = context.read<Session>();
    return SafeArea(
      child: Loader<List<Json>>(
        load: () async => ((await s.api.get('/cookbooks')) as List).cast<Json>(),
        builder: (context, all, reload) {
          final list = all.where((c) {
            final text = '${c['title']} ${c['description'] ?? ''}'.toLowerCase();
            if (_q.isNotEmpty && !text.contains(_q.toLowerCase())) return false;
            return switch (_filter) {
              'mine' => c['authorId'] == s.userId,
              'public' => c['authorId'] == null,
              _ => true,
            };
          }).toList();
          void open(Widget w) => Navigator.of(context).push(route(w)).then((_) => reload());
          return RefreshIndicator(
            onRefresh: reload,
            child: ListView(
              padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
              children: [
                Row(
                  children: [
                    Expanded(child: Text(t('Cookbooklar'), style: serif(30))),
                    CircleBtn(
                      icon: Icons.add_rounded,
                      filled: true,
                      tooltip: t('Yangi cookbook'),
                      onTap: () => open(const CookbookEditorScreen()),
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                TextField(
                  onChanged: (v) => setState(() => _q = v),
                  style: sans(15),
                  decoration: InputDecoration(
                    hintText: t('Cookbook qidirish'),
                    prefixIcon: const Icon(Icons.search_rounded, color: C.muted),
                    contentPadding: const EdgeInsets.symmetric(vertical: 12),
                  ),
                ),
                const SizedBox(height: 12),
                Wrap(
                  spacing: 8,
                  children: [
                    ChoicePill(label: t('Hammasi'), selected: _filter == 'all', onTap: () => setState(() => _filter = 'all')),
                    ChoicePill(label: t('Taomdosh'), selected: _filter == 'public', onTap: () => setState(() => _filter = 'public')),
                    ChoicePill(label: t('Meniki'), selected: _filter == 'mine', onTap: () => setState(() => _filter = 'mine')),
                  ],
                ),
                const SizedBox(height: 16),
                if (list.isEmpty) EmptyView(text: t('Hech narsa topilmadi')),
                for (final (i, c) in list.indexed)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: i == 0 && _q.isEmpty && _filter == 'all'
                        ? _FeaturedCard(
                            c: c,
                            onTap: () => open(CookbookDetailScreen(id: c['id'])),
                          )
                        : _Row(
                            c: c,
                            onTap: () => open(CookbookDetailScreen(id: c['id'])),
                          ),
                  ),
              ],
            ),
          );
        },
      ),
    );
  }
}

String cookbookMeta(Json c) => [
  c['authorId'] == null ? 'Taomdosh' : t('Shaxsiy'),
  t('{n} kun', {'n': c['days']}),
  t('{n} mahal', {'n': c['mealsCount']}),
].join(' · ');

class _FeaturedCard extends StatelessWidget {
  const _FeaturedCard({required this.c, required this.onTap});
  final Json c;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => AppCard(
    onTap: onTap,
    padding: EdgeInsets.zero,
    radius: 20,
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SizedBox(
          height: 150,
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
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 14, 16, 16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(c['title'] ?? '', style: serif(21)),
              const SizedBox(height: 6),
              Text(cookbookMeta(c), style: sans(13, color: C.muted)),
            ],
          ),
        ),
      ],
    ),
  );
}

class _Row extends StatelessWidget {
  const _Row({required this.c, required this.onTap});
  final Json c;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => AppCard(
    onTap: onTap,
    radius: 16,
    padding: const EdgeInsets.all(10),
    child: Row(
      children: [
        DishImage(url: c['coverUrl'], width: 64, height: 64, seed: c['id']),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(c['title'] ?? '', style: sans(15, weight: FontWeight.w700)),
              const SizedBox(height: 3),
              Text(cookbookMeta(c), style: sans(12, color: C.muted)),
            ],
          ),
        ),
        if (c['moderationStatus'] == 'pending') Pill(t('Moderatsiyada'), bg: C.mustardSoft, fg: C.mustardInk) else Pill(t('Bepul')),
      ],
    ),
  );
}
