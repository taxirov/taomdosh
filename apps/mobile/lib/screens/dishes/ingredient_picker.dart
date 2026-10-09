import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../api/api_client.dart';
import '../../i18n/strings.dart';
import '../../state/session.dart';
import '../../theme.dart';
import '../../widgets/common.dart';

/// Katalogdan masalliq tanlash; tanlangan masalliqni ({id, name, ...}) qaytaradi
Future<Json?> pickIngredient(BuildContext context) => showModalBottomSheet<Json>(
  context: context,
  isScrollControlled: true,
  builder: (_) => const FractionallySizedBox(heightFactor: .85, child: _IngredientPicker()),
);

/// Masalliq qidirish (GET /ingredients?q=)
class _IngredientPicker extends StatefulWidget {
  const _IngredientPicker();

  @override
  State<_IngredientPicker> createState() => _IngredientPickerState();
}

class _IngredientPickerState extends State<_IngredientPicker> {
  List<Json>? _items;
  Timer? _debounce;

  @override
  void initState() {
    super.initState();
    _load('');
  }

  @override
  void dispose() {
    _debounce?.cancel();
    super.dispose();
  }

  Future<void> _load(String q) async {
    try {
      final r = await context.read<Session>().api.get('/ingredients', {'q': q.isEmpty ? null : q});
      if (mounted) setState(() => _items = (r as List).cast<Json>());
    } catch (e) {
      if (mounted) showSnack(context, t('Masalliqlar yuklanmadi'));
    }
  }

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(20, 20, 20, 0),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(t('Masalliq tanlash'), style: serif(22)),
        const SizedBox(height: 12),
        TextField(
          autofocus: true,
          style: sans(15),
          decoration: InputDecoration(hintText: t('Masalan, piyoz'), prefixIcon: const Icon(Icons.search_rounded)),
          onChanged: (v) {
            _debounce?.cancel();
            _debounce = Timer(const Duration(milliseconds: 250), () => _load(v.trim()));
          },
        ),
        Expanded(
          child: _items == null
              ? const Loading()
              : ListView.separated(
                  itemCount: _items!.length,
                  separatorBuilder: (_, _) => const Divider(height: 1, color: C.lineSoft),
                  itemBuilder: (_, i) {
                    final ing = _items![i];
                    return ListTile(
                      contentPadding: EdgeInsets.zero,
                      title: Text(ing['name'], style: sans(15, weight: FontWeight.w600)),
                      subtitle: Text('${(ing['kcal100g'] as num).round()} ${t('kkal / 100 g')}', style: sans(12, color: C.muted)),
                      onTap: () => Navigator.pop(context, ing),
                    );
                  },
                ),
        ),
      ],
    ),
  );
}
