import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../api/api_client.dart';
import '../../i18n/strings.dart';
import '../../state/session.dart';
import '../../theme.dart';
import '../../widgets/common.dart';

/// Katalogdan taom tanlash (cookbook muharriri uchun). Tanlangan taomni qaytaradi.
Future<Json?> pickDish(BuildContext context, {String? mealType}) => showModalBottomSheet<Json>(
  context: context,
  isScrollControlled: true,
  builder: (_) => FractionallySizedBox(heightFactor: .85, child: _DishPicker(mealType: mealType)),
);

class _DishPicker extends StatefulWidget {
  const _DishPicker({this.mealType});
  final String? mealType;

  @override
  State<_DishPicker> createState() => _DishPickerState();
}

class _DishPickerState extends State<_DishPicker> {
  String _q = '';
  bool _onlyType = true;
  List<Json>? _items;
  Timer? _debounce;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final s = context.read<Session>();
    try {
      final r = await s.api.get('/dishes', {'q': _q.isEmpty ? null : _q, 'mealType': _onlyType ? widget.mealType : null, 'limit': '100'});
      if (mounted) setState(() => _items = (r as List).cast<Json>());
    } catch (e) {
      if (mounted) showSnack(context, t('Taomlar yuklanmadi'));
    }
  }

  @override
  void dispose() {
    _debounce?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(20, 20, 20, 0),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(t('Taom tanlash'), style: serif(22)),
        const SizedBox(height: 12),
        TextField(
          autofocus: false,
          style: sans(15),
          decoration: InputDecoration(hintText: t('Taom qidirish'), prefixIcon: const Icon(Icons.search_rounded)),
          onChanged: (v) {
            _q = v.trim();
            _debounce?.cancel();
            _debounce = Timer(const Duration(milliseconds: 300), _load);
          },
        ),
        if (widget.mealType != null) ...[
          const SizedBox(height: 8),
          Row(
            children: [
              ChoicePill(
                label: mealTypeName(widget.mealType!),
                selected: _onlyType,
                onTap: () {
                  setState(() => _onlyType = true);
                  _load();
                },
              ),
              const SizedBox(width: 8),
              ChoicePill(
                label: t('Hammasi'),
                selected: !_onlyType,
                onTap: () {
                  setState(() => _onlyType = false);
                  _load();
                },
              ),
            ],
          ),
        ],
        const SizedBox(height: 8),
        Expanded(
          child: _items == null
              ? const Loading()
              : _items!.isEmpty
              ? EmptyView(text: t('Hech narsa topilmadi'))
              : ListView.separated(
                  itemCount: _items!.length,
                  separatorBuilder: (_, _) => const Divider(height: 1, color: C.lineSoft),
                  itemBuilder: (_, i) {
                    final d = _items![i];
                    return ListTile(
                      contentPadding: EdgeInsets.zero,
                      leading: DishImage(url: d['imageUrl'], width: 48, height: 48, seed: d['id']),
                      title: Text(d['title'] ?? '', style: sans(15, weight: FontWeight.w700)),
                      subtitle: Text(
                        '${(d['activeMin'] as num) + (d['passiveMin'] as num)} ${t('daq')} · ${d['kcalPerServing']} ${t('kkal')}${d['isSide'] == true ? ' · ${t('qo‘shimcha')}' : ''}',
                        style: sans(12, color: C.muted),
                      ),
                      onTap: () => Navigator.pop(context, d),
                    );
                  },
                ),
        ),
      ],
    ),
  );
}
