import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../api/api_client.dart';
import '../../format.dart';
import '../../i18n/strings.dart';
import '../../state/session.dart';
import '../../theme.dart';
import '../../widgets/common.dart';
import '../dishes/ingredient_picker.dart';
import 'shopping.dart';

/// Zaxira: uydagi mahsulotlar. Pishirilganda avtomatik kamayadi, "olindi" bo'lganda ko'payadi.
class PantryScreen extends StatefulWidget {
  const PantryScreen({super.key});

  @override
  State<PantryScreen> createState() => _PantryScreenState();
}

class _PantryScreenState extends State<PantryScreen> {
  String? _cat;

  Future<void> _set(Session s, String ingredientId, String name, int current, Future<void> Function() reload) async {
    final g = await promptText(
      context,
      title: t('{name}: hozir necha gramm bor?', {'name': name}),
      initial: '$current',
      keyboard: TextInputType.number,
    );
    final q = int.tryParse(g ?? '');
    if (q == null || q < 0 || !mounted) return;
    await guard(context, () => s.api.put('/groups/${s.groupId}/pantry/$ingredientId', {'qtyG': q}));
    await reload();
  }

  @override
  Widget build(BuildContext context) {
    final s = context.read<Session>();
    return Scaffold(
      body: SafeArea(
        child: Loader<List<Json>>(
          load: () async => ((await s.api.get('/groups/${s.groupId}/pantry')) as List).cast<Json>(),
          builder: (context, items, reload) {
            final cats = items.map((i) => i['category'] as String).toSet().toList();
            final list = items.where((i) => _cat == null || i['category'] == _cat).toList();
            return RefreshIndicator(
              onRefresh: reload,
              child: ListView(
                padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
                children: [
                  ScreenHeader(
                    title: t('Zaxira'),
                    trailing: CircleBtn(
                      icon: Icons.add_rounded,
                      filled: true,
                      tooltip: t('Mahsulot qo‘shish'),
                      onTap: () async {
                        final ing = await pickIngredient(context);
                        if (ing != null && context.mounted) await _set(s, ing['id'], ing['name'], 0, reload);
                      },
                    ),
                  ),
                  const SizedBox(height: 16),
                  if (cats.length > 1)
                    SingleChildScrollView(
                      scrollDirection: Axis.horizontal,
                      child: Row(
                        children: [
                          ChoicePill(label: t('Hammasi'), selected: _cat == null, onTap: () => setState(() => _cat = null)),
                          for (final c in cats) ...[
                            const SizedBox(width: 8),
                            ChoicePill(label: categoryName(c), selected: _cat == c, onTap: () => setState(() => _cat = c)),
                          ],
                        ],
                      ),
                    ),
                  const SizedBox(height: 12),
                  if (list.isEmpty)
                    EmptyView(
                      icon: Icons.kitchen_outlined,
                      text: t('Zaxira bo‘sh. Xarid ro‘yxatida “olindi” belgilangan mahsulotlar shu yerga tushadi.'),
                    )
                  else
                    CardList(
                      children: [
                        for (final i in list)
                          InkWell(
                            onTap: () => _set(s, i['ingredientId'], i['name'], (i['qtyG'] as num).toInt(), reload),
                            child: Padding(
                              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                              child: Row(
                                children: [
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        Text(i['name'], style: sans(15, weight: FontWeight.w700)),
                                        Text(categoryName(i['category']), style: sans(12, color: C.muted)),
                                      ],
                                    ),
                                  ),
                                  Text(displayQty(i['display']), style: sans(15, weight: FontWeight.w800)),
                                  const SizedBox(width: 4),
                                  const Icon(Icons.edit_outlined, size: 16, color: C.muted),
                                ],
                              ),
                            ),
                          ),
                      ],
                    ),
                  const SizedBox(height: 10),
                  Text(
                    t('Pishirilgan har bir taomdan keyin zaxira avtomatik kamayadi. Miqdorni tuzatish uchun mahsulotni bosing.'),
                    style: sans(12, color: C.muted, height: 1.45),
                  ),
                ],
              ),
            );
          },
        ),
      ),
    );
  }
}
