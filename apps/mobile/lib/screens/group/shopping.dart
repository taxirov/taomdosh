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

/// Guruh narxi qaysi birlik uchun kiritiladi: dona / litr / kg
String priceUnitFor(Json item) => switch ((item['display'] as Json?)?['unit']) {
  'pcs' => 'pcs',
  'l' || 'ml' => 'l',
  _ => 'kg',
};

String priceUnitLabel(String unit) => switch (unit) {
  'pcs' => t('1 dona'),
  'l' => t('1 litr'),
  _ => t('1 kg'),
};

/// Masalliq narxini so'rash oynasi → guruh narxi sifatida saqlaydi. Saqlansa true.
Future<bool> askGroupPrice(
  BuildContext context, {
  required String ingredientId,
  required String name,
  required String unit,
  num? current,
}) async {
  final s = context.read<Session>();
  final v = await promptText(
    context,
    title: t('{name}: {unit} narxi, so‘m', {'name': name, 'unit': priceUnitLabel(unit)}),
    initial: current == null ? null : '${current.round()}',
    hint: '25000',
    keyboard: TextInputType.number,
  );
  final price = int.tryParse((v ?? '').replaceAll(RegExp(r'\s'), ''));
  if (price == null || price <= 0 || !context.mounted) return false;
  return guard(context, () => s.api.put('/groups/${s.groupId}/prices/$ingredientId', {'price': price, 'unit': unit, 'unitQty': 1}));
}

/// Xarid ro'yxati: davrdagi rejadan avtomatik (zaxira ayirilgan) + qo'lda qo'shilganlar, taxminiy narxlar bilan
class ShoppingScreen extends StatefulWidget {
  const ShoppingScreen({super.key});

  @override
  State<ShoppingScreen> createState() => _ShoppingScreenState();
}

class _ShoppingScreenState extends State<ShoppingScreen> {
  int _days = 3;
  List<Json>? _items;
  String? _asOf; // narxlar sanasi
  Object? _error;
  bool _busy = false;
  bool _stale = false; // oflayn — keshdan ko'rsatilmoqda

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final s = context.read<Session>();
    try {
      final r = await s.api.get('/groups/${s.groupId}/shopping');
      final stale = s.api.lastFromCache;
      String? asOf = _asOf;
      try {
        asOf = ((await s.api.get('/groups/${s.groupId}/shopping/estimate')) as Json)['asOf'] as String?;
      } catch (_) {}
      if (mounted) {
        setState(() {
          _items = (r as List).cast<Json>();
          _asOf = asOf;
          _error = null;
          _stale = stale;
        });
      }
    } catch (e) {
      if (mounted) setState(() => _error = e);
    }
  }

  void _setItems(Object? r) {
    if (mounted) setState(() => _items = (r as List).cast<Json>());
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
      _setItems(await s.api.post('/groups/${s.groupId}/shopping/regenerate', {'from': ymd(from), 'to': ymd(to)}));
    });
    if (mounted) setState(() => _busy = false);
  }

  Future<void> _bought(Json it) async {
    final s = context.read<Session>();
    // Belgini darhol ko'rsatamiz; xato bo'lsa qaytaramiz
    setState(() => it['status'] = 'bought');
    final ok = await guard(context, () async {
      _setItems(await s.api.patch('/groups/${s.groupId}/shopping/${it['id']}', {'status': 'bought'}));
    });
    if (!ok && mounted) setState(() => it['status'] = 'pending');
  }

  Future<void> _setPrice(Json it) async {
    final unit = priceUnitFor(it);
    final num? current = it['priceSource'] == 'group' ? ((it['unitPrice'] as Json?)?['price'] as num?) : null;
    final ok = await askGroupPrice(context, ingredientId: it['ingredientId'], name: it['name'], unit: unit, current: current);
    if (ok) await _load();
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
              subtitle: it['estCost'] == null ? null : Text('~${money(it['estCost'] as num)}', style: sans(13, color: C.muted)),
            ),
            ListTile(
              leading: const Icon(Icons.sell_outlined),
              title: Text(it['estCost'] == null ? t('Narx kiritish') : t('Narxni o‘zgartirish')),
              onTap: () => Navigator.pop(ctx, 'price'),
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
      case 'price':
        await _setPrice(it);
      case 'qty':
        final g = await promptText(context, title: t('Necha gramm oldingiz?'), initial: '${it['qtyG']}', keyboard: TextInputType.number);
        final q = int.tryParse(g ?? '');
        if (q == null || q <= 0 || !mounted) return;
        await guard(context, () async => _setItems(await s.api.patch(path, {'status': 'bought', 'qtyG': q})));
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
        await guard(context, () async => _setItems(await s.api.patch(path, {'assigneeId': who})));
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
    await guard(context, () async => _setItems(await s.api.post('/groups/${s.groupId}/shopping', {'ingredientId': ing['id'], 'qtyG': q})));
  }

  /// "6–8 oktabr · 4 kishiga" yoki guruh nomi
  String? _subtitle(Session s, List<Json> pending) {
    final auto = pending.where((i) => i['isManual'] != true).toList();
    if (auto.isEmpty) return s.group?['name'] as String?;
    final from = parseYmd(auto.first['periodStart'] as String);
    final to = parseYmd(auto.first['periodEnd'] as String);
    final range = from == to
        ? shortDate(from)
        : (from.month == to.month ? '${from.day}–${to.day} ${monthsGenitive()[to.month - 1]}' : '${shortDate(from)} – ${shortDate(to)}');
    return '$range · ${t('{n} kishiga', {'n': s.members.length})}';
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
    final total = pending.fold<num>(0, (sum, i) => sum + ((i['estCost'] as num?) ?? 0));
    final missing = pending.where((i) => i['estCost'] == null).length;

    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            Expanded(
              child: RefreshIndicator(
                color: C.terracotta,
                onRefresh: _load,
                child: ListView(
                  padding: const EdgeInsets.fromLTRB(20, 24, 20, 16),
                  children: [
                    ScreenHeader(
                      title: t('Xarid ro‘yxati'),
                      subtitle: _subtitle(s, pending),
                      trailing: CircleBtn(icon: Icons.add_rounded, filled: true, tooltip: t('Qo‘lda qo‘shish'), onTap: _addManual),
                    ),
                    if (_stale) ...[const SizedBox(height: 10), const OfflineBadge()],
                    const SizedBox(height: 14),
                    Segmented<int>(
                      items: {1: t('Ertaga'), 3: t('3 kun'), 7: t('Butun hafta')},
                      value: _days,
                      onChanged: _busy ? (_) {} : _regenerate,
                    ),
                    const SizedBox(height: 6),
                    Row(
                      children: [
                        const Icon(Icons.check_circle_outline_rounded, size: 16, color: C.olive),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            t('Zaxirada bor mahsulotlar ayirildi'),
                            style: sans(12, weight: FontWeight.w700, color: C.olive),
                          ),
                        ),
                        TextButton(
                          onPressed: _busy ? null : () => _regenerate(_days),
                          child: Text(
                            t('Yangilash'),
                            style: sans(13, weight: FontWeight.w700, color: C.terracotta),
                          ),
                        ),
                      ],
                    ),
                    AnimatedSwitcher(
                      duration: const Duration(milliseconds: 200),
                      child: _busy
                          ? const LinearProgressIndicator(color: C.terracotta, backgroundColor: C.lineSoft)
                          : const SizedBox(height: 4),
                    ),
                    if (_items == null && _error != null) ErrorView(error: _error!, onRetry: _load),
                    if (_items == null && _error == null) const SkeletonList(rows: 6),
                    if (_items != null && pending.isEmpty)
                      EmptyView(
                        icon: Icons.shopping_basket_outlined,
                        title: t('Ro‘yxat bo‘sh'),
                        text: t('Davrni tanlang — ro‘yxat rejadan avtomatik tuziladi. Yoki mahsulotni qo‘lda qo‘shing.'),
                        action: SizedBox(
                          width: 220,
                          child: SecondaryButton(label: t('Qo‘lda qo‘shish'), height: 48, onPressed: _addManual),
                        ),
                      ),
                    for (final e in byCat.entries) ...[
                      const SizedBox(height: 14),
                      SectionLabel(categoryName(e.key)),
                      const SizedBox(height: 8),
                      CardList(
                        radius: 16,
                        children: [
                          for (final it in e.value)
                            _ShoppingRow(
                              key: ValueKey(it['id']),
                              item: it,
                              onCheck: () => _bought(it),
                              onTap: () => _itemMenu(it),
                              onPrice: () => _setPrice(it),
                            ),
                        ],
                      ),
                    ],
                    if (bought.isNotEmpty) ...[
                      const SizedBox(height: 18),
                      SectionLabel(t('Olinganlar → zaxirada')),
                      const SizedBox(height: 8),
                      CardList(
                        radius: 16,
                        children: [for (final it in bought) _ShoppingRow(key: ValueKey(it['id']), item: it)],
                      ),
                      Align(
                        alignment: Alignment.centerLeft,
                        child: TextButton(
                          onPressed: () => Navigator.of(context).push(route(const PantryScreen())),
                          child: Text(
                            t('Zaxirani ochish'),
                            style: sans(13, weight: FontWeight.w700, color: C.terracotta),
                          ),
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ),
            if (pending.isNotEmpty) _TotalBar(total: total, asOf: _asOf, missing: missing),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 10, 20, 16),
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

/// Bir qator: belgi · nom (+ taxminiy narx) · miqdor · kim oladi
class _ShoppingRow extends StatelessWidget {
  const _ShoppingRow({super.key, required this.item, this.onCheck, this.onTap, this.onPrice});
  final Json item;
  final VoidCallback? onCheck;
  final VoidCallback? onTap;
  final VoidCallback? onPrice;

  @override
  Widget build(BuildContext context) {
    final done = item['status'] == 'bought';
    final cost = item['estCost'] as num?;
    final fg = done ? C.navMuted : C.ink;
    return InkWell(
      onTap: done ? null : onTap,
      child: ConstrainedBox(
        constraints: const BoxConstraints(minHeight: 56),
        child: Padding(
          padding: const EdgeInsets.only(right: 14),
          child: Row(
            children: [
              CheckMark(checked: done, onTap: done ? null : onCheck, label: item['name'] as String),
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 8),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        item['name'] as String,
                        style: sans(15, weight: FontWeight.w600, color: fg).copyWith(decoration: done ? TextDecoration.lineThrough : null),
                      ),
                      if (!done && cost != null)
                        Text(
                          '~${money(cost)}${item['priceSource'] == 'group' ? ' · ${t('o‘z narximiz')}' : ''}',
                          style: sans(12, color: C.muted),
                        ),
                      if (!done && cost == null)
                        InkWell(
                          onTap: onPrice,
                          child: Padding(
                            padding: const EdgeInsets.symmetric(vertical: 2),
                            child: Text(
                              t('Narx kiritish'),
                              style: sans(12, weight: FontWeight.w700, color: C.terracotta),
                            ),
                          ),
                        ),
                    ],
                  ),
                ),
              ),
              const SizedBox(width: 8),
              Text(
                displayQty(item['display']),
                style: sans(14, weight: FontWeight.w800, color: fg),
              ),
              if (item['isManual'] == true) ...[const SizedBox(width: 6), const Icon(Icons.edit_note_rounded, size: 18, color: C.muted)],
              if (item['assigneeId'] != null) ...[
                const SizedBox(width: 10),
                Tooltip(
                  message: t('{name} oladi', {'name': item['assigneeName'] ?? ''}),
                  child: Avatar(name: item['assigneeName'] ?? '?', id: item['assigneeId'], size: 28),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

/// Pastdagi jami: "Jami ~185 000 so'm · taxminiy, 15.11 holatida"
class _TotalBar extends StatelessWidget {
  const _TotalBar({required this.total, required this.asOf, required this.missing});
  final num total;
  final String? asOf;
  final int missing;

  @override
  Widget build(BuildContext context) {
    final note = [
      asOf == null ? t('taxminiy') : t('taxminiy, {date} holatida', {'date': ddmm(parseYmd(asOf!))}),
      if (missing > 0) t('{n} ta mahsulot narxsiz', {'n': missing}),
    ].join(' · ');
    return Container(
      decoration: const BoxDecoration(
        border: Border(top: BorderSide(color: C.line)),
      ),
      padding: const EdgeInsets.fromLTRB(24, 10, 24, 0),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            flex: 2,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(t('Jami'), style: sans(14, color: C.muted)),
                Text(note, style: sans(12, color: C.muted)),
              ],
            ),
          ),
          const SizedBox(width: 12),
          // Katta shriftda ham sig'ishi uchun: summa kichrayadi, izoh qatorga bo'linadi
          Flexible(
            child: FittedBox(
              fit: BoxFit.scaleDown,
              child: Text(total > 0 ? '~${money(total)}' : '—', style: sans(17, weight: FontWeight.w800)),
            ),
          ),
        ],
      ),
    );
  }
}
