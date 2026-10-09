import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../api/api_client.dart';
import '../../format.dart';
import '../../i18n/strings.dart';
import '../../state/session.dart';
import '../../theme.dart';
import '../../widgets/common.dart';
import 'add_dish.dart';
import 'dish_page.dart';

/// Taomlar katalogi: qidiruv, mahal turi bo'yicha filtr, sevimlilar
class DishesScreen extends StatefulWidget {
  const DishesScreen({super.key, this.favoritesOnly = false, this.mineOnly = false});
  final bool favoritesOnly;
  final bool mineOnly;

  @override
  State<DishesScreen> createState() => _DishesScreenState();
}

class _DishesScreenState extends State<DishesScreen> {
  String _q = '';
  String? _type;
  late bool _fav = widget.favoritesOnly;
  bool _sides = false;
  List<Json>? _items;
  Object? _error;
  Timer? _debounce;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _debounce?.cancel();
    super.dispose();
  }

  Future<void> _load() async {
    final s = context.read<Session>();
    setState(() => _error = null);
    try {
      final r = await s.api.get('/dishes', {'q': _q.isEmpty ? null : _q, 'mealType': _type, 'limit': '100'});
      if (mounted) setState(() => _items = (r as List).cast<Json>());
    } catch (e) {
      if (mounted) setState(() => _error = e);
    }
  }

  void _setType(String? type) {
    setState(() {
      _type = _type == type ? null : type;
      _items = null;
    });
    _load();
  }

  @override
  Widget build(BuildContext context) {
    final s = context.read<Session>();
    final list = (_items ?? [])
        .where((d) => !_fav || d['isFavorite'] == true)
        .where((d) => !_sides || d['isSide'] == true)
        .where((d) => !widget.mineOnly || d['authorId'] == s.userId)
        .toList();
    final standalone = widget.favoritesOnly || widget.mineOnly;
    final body = RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
        children: [
          Row(
            children: [
              if (standalone) ...[const BackBtn(), const SizedBox(width: 12)],
              Expanded(
                child: Text(
                  widget.mineOnly ? t('Mening taomlarim') : (widget.favoritesOnly ? t('Sevimli taomlar') : t('Taomlar')),
                  style: serif(standalone ? 26 : 30),
                ),
              ),
              if (!widget.favoritesOnly)
                FilledButton.icon(
                  style: FilledButton.styleFrom(
                    backgroundColor: C.terracotta,
                    minimumSize: const Size(0, 44),
                    shape: const StadiumBorder(),
                  ),
                  onPressed: () async {
                    if (s.groupId == null) return showSnack(context, t('Taom qo‘shish uchun avval guruhga qo‘shiling'));
                    final created = await Navigator.of(context).push<bool>(route(const AddDishScreen()));
                    if (created == true) _load();
                  },
                  icon: const Icon(Icons.add_rounded, size: 20),
                  label: Text(
                    t('Qo‘shish'),
                    style: sans(14, weight: FontWeight.w700, color: Colors.white),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 16),
          TextField(
            style: sans(15),
            decoration: InputDecoration(
              hintText: t('Taom qidirish'),
              prefixIcon: const Icon(Icons.search_rounded, color: C.muted),
              contentPadding: const EdgeInsets.symmetric(vertical: 12),
            ),
            onChanged: (v) {
              _q = v.trim();
              _debounce?.cancel();
              _debounce = Timer(const Duration(milliseconds: 300), _load);
            },
          ),
          const SizedBox(height: 12),
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                for (final type in mealOrder) ...[
                  ChoicePill(label: mealTypeName(type), selected: _type == type, onTap: () => _setType(type)),
                  const SizedBox(width: 8),
                ],
                ChoicePill(label: t('Salatlar'), selected: _sides, onTap: () => setState(() => _sides = !_sides)),
                if (!widget.favoritesOnly) ...[
                  const SizedBox(width: 8),
                  ChoicePill(label: t('Sevimlilar'), selected: _fav, onTap: () => setState(() => _fav = !_fav)),
                ],
              ],
            ),
          ),
          const SizedBox(height: 16),
          if (_error != null && _items == null)
            ErrorView(error: _error!, onRetry: _load)
          else if (_items == null)
            const Loading()
          else if (list.isEmpty)
            EmptyView(text: t('Hech narsa topilmadi'))
          else
            GridView.builder(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              itemCount: list.length,
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: 2,
                mainAxisSpacing: 12,
                crossAxisSpacing: 12,
                childAspectRatio: .78,
              ),
              itemBuilder: (_, i) => _DishCard(d: list[i], onChanged: _load),
            ),
        ],
      ),
    );
    return standalone ? Scaffold(body: SafeArea(child: body)) : SafeArea(child: body);
  }
}

class _DishCard extends StatelessWidget {
  const _DishCard({required this.d, required this.onChanged});
  final Json d;
  final VoidCallback onChanged;

  @override
  Widget build(BuildContext context) => AppCard(
    padding: EdgeInsets.zero,
    radius: 16,
    onTap: () => Navigator.of(context).push(route(DishPage(dishId: d['id']))).then((_) => onChanged()),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Expanded(
          child: Stack(
            fit: StackFit.expand,
            children: [
              DishImage(url: d['imageUrl'], radius: 0, seed: d['id']),
              if ((d['favoritesCount'] as num) > 0 || d['isFavorite'] == true)
                Positioned(
                  top: 8,
                  left: 8,
                  child: Pill(
                    '${d['isFavorite'] == true ? '♥' : '♡'} ${groupDigits(d['favoritesCount'] as num)}',
                    bg: C.card,
                    fg: C.terracotta,
                  ),
                ),
            ],
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 10, 12, 12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                d['title'] ?? '',
                style: sans(15, weight: FontWeight.w700),
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),
              const SizedBox(height: 3),
              Text(
                '${(d['activeMin'] as num) + (d['passiveMin'] as num)} ${t('daq')} · ${d['kcalPerServing']} ${t('kkal')}',
                style: sans(12, color: C.muted),
              ),
            ],
          ),
        ),
      ],
    ),
  );
}
