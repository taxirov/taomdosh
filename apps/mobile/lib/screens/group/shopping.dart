import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../api/api_client.dart';
import '../../format.dart';
import '../../i18n/strings.dart';
import '../../state/session.dart';
import '../../theme.dart';
import '../../widgets/common.dart';
import '../dishes/ingredient_picker.dart';
import 'add_expense.dart';
import 'pantry.dart';

String categoryName(String c) => switch (c) {
  'meat' => t('Go‘sht'),
  'poultry' => t('Parranda'),
  'fish' => t('Baliq'),
  'dairy' => t('Sut mahsulotlari'),
  'eggs' => t('Tuxum'),
  'vegetables' => t('Sabzavotlar'),
  'fruits' => t('Mevalar'),
  'greens' => t('Ko‘katlar'),
  'grains' => t('Don'),
  'legumes' => t('Dukkaklilar'),
  'flour' => t('Un'),
  'pasta' => t('Makaron'),
  'oils' => t('Yog‘lar'),
  'spices' => t('Ziravorlar'),
  'sauces' => t('Souslar'),
  'nuts' => t('Yong‘oqlar'),
  'sweets' => t('Shirinliklar'),
  'bakery' => t('Non'),
  'drinks' => t('Ichimliklar'),
  _ => t('Boshqa'),
};

/// Xarid ro'yxati: davrdagi rejadan avtomatik (zaxira ayirilgan) + qo'lda qo'shilganlar
class ShoppingScreen extends StatefulWidget {
  const ShoppingScreen({super.key});

  @override
  State<ShoppingScreen> createState() => _ShoppingScreenState();
}

class _ShoppingScreenState extends State<ShoppingScreen> {
  int _days = 3;
  List<Json>? _items;
  Object? _error;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final s = context.read<Session>();
      final r = await s.api.get('/groups/${s.groupId}/shopping');
      if (mounted) setState(() => _items = (r as List).cast<Json>());
    } catch (e) {
      if (mounted) setState(() => _error = e);
    }
  }

  Future<void> _regenerate(int days) async {
    final s = context.read<Session>();
    final now = DateTime.now();
    final from = days == 1 ? now.add(const Duration(days: 1)) : now;
    final to = from.add(Duration(days: days == 1 ? 0 : days - 1));
    setState(() {
      _days = days;
      _busy = true;
    });
    await guard(context, () async {
      final r = await s.api.post('/groups/${s.groupId}/shopping/regenerate', {'from': ymd(from), 'to': ymd(to)});
      if (mounted) setState(() => _items = (r as List).cast<Json>());
    });
    if (mounted) setState(() => _busy = false);
  }

  Future<void> _bought(Json it) async {
    final s = context.read<Session>();
    await guard(context, () async {
      final r = await s.api.patch('/groups/${s.groupId}/shopping/${it['id']}', {'status': 'bought'});
      if (mounted) setState(() => _items = (r as List).cast<Json>());
    });
  }

  Future<void> _itemMenu(Json it) async {
    final s = context.read<Session>();
    final r = await showModalBottomSheet<String>(
      context: context,
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              title: Text('${it['name']} · ${displayQty(it['display'])}', style: sans(16, weight: FontWeight.w800)),
            ),
            ListTile(
              leading: const Icon(Icons.scale_outlined),
              title: Text(t('Boshqa miqdorda oldim')),
              onTap: () => Navigator.pop(ctx, 'qty'),
            ),
            ListTile(leading: const Icon(Icons.person_outline), title: Text(t('Kim oladi')), onTap: () => Navigator.pop(ctx, 'assignee')),
            ListTile(
              leading: const Icon(Icons.delete_outline, color: C.terracottaDark),
              title: Text(t('Ro‘yxatdan o‘chirish'), style: sans(15, color: C.terracottaDark)),
              onTap: () => Navigator.pop(ctx, 'delete'),
            ),
          ],
        ),
      ),
    );
    if (r == null || !mounted) return;
    final path = '/groups/${s.groupId}/shopping/${it['id']}';
    switch (r) {
      case 'qty':
        final g = await promptText(context, title: t('Necha gramm oldingiz?'), initial: '${it['qtyG']}', keyboard: TextInputType.number);
        final q = int.tryParse(g ?? '');
        if (q == null || q <= 0 || !mounted) return;
        await guard(context, () async {
          final x = await s.api.patch(path, {'status': 'bought', 'qtyG': q});
          if (mounted) setState(() => _items = (x as List).cast<Json>());
        });
      case 'assignee':
        final who = await showModalBottomSheet<String>(
          context: context,
          builder: (ctx) => SafeArea(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                for (final m in s.members.where((m) => m['managedBy'] == null))
                  ListTile(
                    leading: Avatar(name: m['name'], id: m['userId'], size: 36),
                    title: Text(m['name']),
                    onTap: () => Navigator.pop(ctx, m['userId'] as String),
                  ),
              ],
            ),
          ),
        );
        if (who == null || !mounted) return;
        await guard(context, () async {
          final x = await s.api.patch(path, {'assigneeId': who});
          if (mounted) setState(() => _items = (x as List).cast<Json>());
        });
      case 'delete':
        await guard(context, () => s.api.delete(path));
        await _load();
    }
  }

  Future<void> _addManual() async {
    final ing = await pickIngredient(context);
    if (ing == null || !mounted) return;
    final g = await promptText(
      context,
      title: t('{name}: necha gramm?', {'name': ing['name']}),
      keyboard: TextInputType.number,
      hint: '500',
    );
    final q = int.tryParse(g ?? '');
    if (q == null || q <= 0 || !mounted) return;
    final s = context.read<Session>();
    await guard(context, () async {
      final r = await s.api.post('/groups/${s.groupId}/shopping', {'ingredientId': ing['id'], 'qtyG': q});
      if (mounted) setState(() => _items = (r as List).cast<Json>());
    });
  }

  @override
  Widget build(BuildContext context) {
    final s = context.watch<Session>();
    final items = _items ?? [];
    final pending = items.where((i) => i['status'] == 'pending').toList();
    final bought = items.where((i) => i['status'] == 'bought').take(15).toList();
    final byCat = <String, List<Json>>{};
    for (final i in pending) {
      (byCat[i['category'] as String] ??= []).add(i);
    }

    Widget row(Json it) {
      final done = it['status'] == 'bought';
      return InkWell(
        onLongPress: done ? null : () => _itemMenu(it),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(4, 2, 14, 2),
          child: Row(
            children: [
              Checkbox(value: done, activeColor: C.olive, onChanged: done ? null : (_) => _bought(it)),
              Expanded(
                child: Text.rich(
                  TextSpan(
                    children: [
                      TextSpan(
                        text: it['name'],
                        style: sans(
                          15,
                          weight: FontWeight.w600,
                          color: done ? C.muted : C.ink,
                        ).copyWith(decoration: done ? TextDecoration.lineThrough : null),
                      ),
                      TextSpan(
                        text: '  ${displayQty(it['display'])}',
                        style: sans(14, weight: FontWeight.w800, color: done ? C.muted : C.ink),
                      ),
                    ],
                  ),
                ),
              ),
              if (it['isManual'] == true) ...[const Icon(Icons.edit_note_rounded, size: 18, color: C.muted), const SizedBox(width: 6)],
              if (it['assigneeId'] != null)
                Tooltip(
                  message: it['assigneeName'] ?? '',
                  child: Avatar(name: it['assigneeName'] ?? '?', id: it['assigneeId'], size: 26),
                ),
              if (!done)
                IconButton(
                  tooltip: t('Batafsil'),
                  icon: const Icon(Icons.more_vert_rounded, size: 20, color: C.muted),
                  onPressed: () => _itemMenu(it),
                ),
            ],
          ),
        ),
      );
    }

    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            Expanded(
              child: RefreshIndicator(
                onRefresh: _load,
                child: ListView(
                  padding: const EdgeInsets.fromLTRB(20, 16, 20, 16),
                  children: [
                    ScreenHeader(
                      title: t('Xarid ro‘yxati'),
                      subtitle: s.group?['name'],
                      trailing: CircleBtn(icon: Icons.add_rounded, filled: true, tooltip: t('Qo‘lda qo‘shish'), onTap: _addManual),
                    ),
                    const SizedBox(height: 16),
                    Segmented<int>(
                      items: {1: t('Ertaga'), 3: t('3 kun'), 7: t('Butun hafta')},
                      value: _days,
                      onChanged: _busy ? (_) {} : _regenerate,
                    ),
                    const SizedBox(height: 10),
                    Row(
                      children: [
                        const Icon(Icons.check_circle_outline_rounded, size: 16, color: C.olive),
                        const SizedBox(width: 6),
                        Expanded(
                          child: Text(
                            t('Rejadagi taomlardan, zaxiradagilar ayirilgan holda'),
                            style: sans(12, weight: FontWeight.w600, color: C.olive),
                          ),
                        ),
                        TextButton(onPressed: _busy ? null : () => _regenerate(_days), child: Text(t('Yangilash'))),
                      ],
                    ),
                    if (_busy) const LinearProgressIndicator(color: C.terracotta, backgroundColor: C.lineSoft),
                    if (_items == null && _error != null) ErrorView(error: _error!, onRetry: _load),
                    if (_items == null && _error == null) const Loading(),
                    if (_items != null && pending.isEmpty)
                      EmptyView(
                        icon: Icons.shopping_basket_outlined,
                        text: t('Ro‘yxat bo‘sh. Davrni tanlang — ro‘yxat rejadan avtomatik tuziladi.'),
                      ),
                    for (final e in byCat.entries) ...[
                      const SizedBox(height: 12),
                      Text(
                        categoryName(e.key),
                        style: sans(13, weight: FontWeight.w800, color: C.muted),
                      ),
                      const SizedBox(height: 6),
                      CardList(children: [for (final it in e.value) row(it)]),
                    ],
                    if (bought.isNotEmpty) ...[
                      const SizedBox(height: 16),
                      Text(
                        t('Olinganlar → zaxirada'),
                        style: sans(13, weight: FontWeight.w800, color: C.muted),
                      ),
                      const SizedBox(height: 6),
                      CardList(children: [for (final it in bought) row(it)]),
                      TextButton(
                        onPressed: () => Navigator.of(context).push(route(const PantryScreen())),
                        child: Text(t('Zaxirani ochish')),
                      ),
                    ],
                  ],
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
              child: PrimaryButton(
                label: t('Xariddan qaytdim — summani kiritish'),
                onPressed: () => Navigator.of(context).push(route(AddExpenseScreen(pending: pending))).then((_) => _load()),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
