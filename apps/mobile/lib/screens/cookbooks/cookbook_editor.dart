import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../api/api_client.dart';
import '../../i18n/strings.dart';
import '../../state/session.dart';
import '../../theme.dart';
import '../../widgets/common.dart';
import '../dishes/dish_picker.dart';
import 'cookbook_detail.dart';

/// Yangi cookbook: 7 kun × mahallar, har mahalga taom va qo'shimchalar
class CookbookEditorScreen extends StatefulWidget {
  const CookbookEditorScreen({super.key, this.copyFrom});
  final Json? copyFrom;

  @override
  State<CookbookEditorScreen> createState() => _CookbookEditorScreenState();
}

class _Slot {
  _Slot(this.mealType);
  final String mealType;
  String? eatTime;
  final List<Json> dishes = []; // {dishId, title, kcalPerServing, isSide}
}

class _CookbookEditorScreenState extends State<CookbookEditorScreen> {
  final _name = TextEditingController();
  int _day = 0;
  bool _public = false;
  bool _busy = false;
  // kun → mahal turi → slot
  final Map<int, Map<String, _Slot>> _plan = {};

  @override
  void initState() {
    super.initState();
    final c = widget.copyFrom;
    if (c != null) {
      _name.text = t('{name} (nusxa)', {'name': c['title']});
      for (final m in (c['meals'] as List).cast<Json>()) {
        final slot = _slot(m['dayIndex'] as int, m['mealType'] as String)..eatTime = m['eatTime'] as String?;
        for (final d in (m['dishes'] as List).cast<Json>()) {
          slot.dishes.add({
            'dishId': d['dishId'],
            'title': d['title'],
            'kcalPerServing': d['kcalPerServing'],
            'isSide': d['isSide'] == true,
          });
        }
      }
    }
  }

  _Slot _slot(int day, String type) => (_plan[day] ??= {})[type] ??= _Slot(type);

  bool _dayFilled(int d) => _plan[d]?.values.any((s) => s.dishes.isNotEmpty) ?? false;

  Future<void> _add(String type, {bool side = false}) async {
    final d = await pickDish(context, mealType: type);
    if (d == null) return;
    setState(
      () => _slot(
        _day,
        type,
      ).dishes.add({'dishId': d['id'], 'title': d['title'], 'kcalPerServing': d['kcalPerServing'], 'isSide': side || d['isSide'] == true}),
    );
  }

  Future<void> _save() async {
    final meals = <Json>[];
    _plan.forEach((day, slots) {
      for (final s in slots.values) {
        final main = s.dishes.where((d) => d['isSide'] != true).map((d) => d['dishId']).toList();
        final sides = s.dishes.where((d) => d['isSide'] == true).map((d) => d['dishId']).toList();
        if (main.isEmpty && sides.isEmpty) continue;
        meals.add({
          'dayIndex': day,
          'mealType': s.mealType,
          'eatTime': ?s.eatTime,
          // Faqat qo'shimcha tanlangan bo'lsa — ularni asosiy deb yuboramiz
          'dishIds': main.isEmpty ? sides : main,
          'sideDishIds': main.isEmpty ? [] : sides,
        });
      }
    });
    if (_name.text.trim().isEmpty) return showSnack(context, t('Cookbook nomini kiriting'));
    if (meals.isEmpty) return showSnack(context, t('Kamida bitta mahalga taom qo‘shing'));
    setState(() => _busy = true);
    final s = context.read<Session>();
    await guard(context, () async {
      final c = await s.api.post('/cookbooks', {'title': _name.text.trim(), 'submitPublic': _public, 'meals': meals}) as Json;
      if (mounted) Navigator.of(context).pushReplacement(route(CookbookDetailScreen(id: c['id'])));
    });
    if (mounted) setState(() => _busy = false);
  }

  @override
  Widget build(BuildContext context) {
    final types = ['breakfast', 'lunch', 'dinner', 'snack'];
    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            Expanded(
              child: ListView(
                padding: const EdgeInsets.fromLTRB(20, 16, 20, 16),
                children: [
                  ScreenHeader(title: t('Yangi cookbook'), close: true, big: false),
                  const SizedBox(height: 16),
                  Text(t('Nomi'), style: sans(13, weight: FontWeight.w700)),
                  const SizedBox(height: 8),
                  TextField(
                    controller: _name,
                    style: sans(16),
                    decoration: InputDecoration(hintText: t('Bizning hafta')),
                  ),
                  const SizedBox(height: 16),
                  Row(
                    children: [
                      for (var i = 0; i < 7; i++) ...[
                        if (i > 0) const SizedBox(width: 4),
                        Expanded(
                          child: GestureDetector(
                            onTap: () => setState(() => _day = i),
                            child: Container(
                              height: 48,
                              alignment: Alignment.center,
                              decoration: BoxDecoration(
                                color: i == _day ? C.terracotta : (_dayFilled(i) ? C.oliveSoft : C.lineSoft),
                                borderRadius: BorderRadius.circular(12),
                              ),
                              child: Text(
                                weekdaysShort()[i],
                                style: sans(
                                  13,
                                  weight: FontWeight.w700,
                                  color: i == _day ? Colors.white : (_dayFilled(i) ? C.oliveInk : C.ink),
                                ),
                              ),
                            ),
                          ),
                        ),
                      ],
                    ],
                  ),
                  const SizedBox(height: 6),
                  Text(t('Yashil — to‘ldirilgan kunlar'), style: sans(12, color: C.muted)),
                  const SizedBox(height: 12),
                  for (final type in types) _slotCard(type),
                  const SizedBox(height: 8),
                  Text(t('Kim ko‘radi'), style: sans(13, weight: FontWeight.w700)),
                  const SizedBox(height: 8),
                  Segmented<bool>(
                    items: {false: t('Faqat men va guruhim'), true: t('Hammaga ochiq')},
                    value: _public,
                    onChanged: (v) => setState(() => _public = v),
                  ),
                  if (_public) ...[
                    const SizedBox(height: 8),
                    Text(t('Hammaga ochiq cookbook moderatsiyadan o‘tgach katalogda chiqadi.'), style: sans(12, color: C.muted)),
                  ],
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
              child: PrimaryButton(label: t('Saqlash'), loading: _busy, onPressed: _save),
            ),
          ],
        ),
      ),
    );
  }

  Widget _slotCard(String type) {
    final slot = _plan[_day]?[type];
    final dishes = slot?.dishes ?? const <Json>[];
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: AppCard(
        padding: const EdgeInsets.fromLTRB(14, 10, 8, 10),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(mealTypeName(type), style: sans(14, weight: FontWeight.w800)),
                ),
                TextButton(
                  onPressed: () async {
                    final picked = await showTimePicker(
                      context: context,
                      initialTime: TimeOfDay(
                        hour: switch (type) {
                          'breakfast' => 8,
                          'lunch' => 13,
                          'snack' => 16,
                          _ => 19,
                        },
                        minute: 0,
                      ),
                    );
                    if (picked != null) {
                      setState(
                        () => _slot(_day, type).eatTime =
                            '${picked.hour.toString().padLeft(2, '0')}:${picked.minute.toString().padLeft(2, '0')}',
                      );
                    }
                  },
                  child: Text(
                    slot?.eatTime ?? t('guruh vaqti'),
                    style: sans(13, weight: FontWeight.w700, color: C.terracotta),
                  ),
                ),
              ],
            ),
            for (final (i, d) in dishes.indexed)
              Row(
                children: [
                  Expanded(
                    child: Text.rich(
                      TextSpan(
                        children: [
                          TextSpan(
                            text: d['title'] ?? '',
                            style: sans(14, weight: FontWeight.w700),
                          ),
                          TextSpan(
                            text: '  ${d['kcalPerServing']} ${t('kkal')}${d['isSide'] == true ? ' · ${t('qo‘shimcha')}' : ''}',
                            style: sans(12, color: C.muted),
                          ),
                        ],
                      ),
                    ),
                  ),
                  IconButton(
                    tooltip: t('O‘chirish'),
                    icon: const Icon(Icons.close_rounded, size: 20, color: C.muted),
                    onPressed: () => setState(() => dishes.removeAt(i)),
                  ),
                ],
              ),
            Row(
              children: [
                TextButton.icon(
                  onPressed: () => _add(type),
                  icon: const Icon(Icons.add_rounded, size: 18),
                  label: Text(t('Taom'), style: sans(13, weight: FontWeight.w700)),
                ),
                if (dishes.isNotEmpty)
                  TextButton.icon(
                    onPressed: () => _add(type, side: true),
                    icon: const Icon(Icons.add_rounded, size: 18),
                    label: Text(t('Salat / qo‘shimcha'), style: sans(13, weight: FontWeight.w700)),
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
