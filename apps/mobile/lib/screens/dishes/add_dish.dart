import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../../api/api_client.dart';
import '../../i18n/strings.dart';
import '../../state/session.dart';
import '../../theme.dart';
import '../../widgets/common.dart';
import 'ingredient_picker.dart';

/// Guruh taomi: darhol guruhda ishlaydi; "Hammaga ochiq" — moderatsiyadan keyin katalogda.
/// Kaloriya masalliqlardan serverda avtomatik hisoblanadi.
class AddDishScreen extends StatefulWidget {
  const AddDishScreen({super.key});

  @override
  State<AddDishScreen> createState() => _AddDishScreenState();
}

class _AddDishScreenState extends State<AddDishScreen> {
  final _title = TextEditingController();
  final _desc = TextEditingController();
  final _active = TextEditingController(text: '30');
  final _passive = TextEditingController(text: '0');
  final _video = TextEditingController();
  int _servings = 4;
  bool _prep = false;
  bool _side = false;
  bool _public = false;
  final Set<String> _types = {'lunch', 'dinner'};
  final List<Json> _ings = []; // {ingredientId, name, qtyG}
  final List<TextEditingController> _steps = [TextEditingController()];
  bool _busy = false;

  Future<void> _addIngredient() async {
    final picked = await pickIngredient(context);
    if (picked == null || !mounted) return;
    final g = await promptText(
      context,
      title: t('{name}: necha gramm?', {'name': picked['name']}),
      keyboard: TextInputType.number,
      hint: '200',
    );
    final qty = int.tryParse(g ?? '');
    if (qty == null || qty <= 0) return;
    setState(() => _ings.add({'ingredientId': picked['id'], 'name': picked['name'], 'qtyG': qty}));
  }

  Future<void> _save() async {
    final s = context.read<Session>();
    final steps = _steps.map((c) => c.text.trim()).where((x) => x.isNotEmpty).toList();
    if (_title.text.trim().isEmpty) return showSnack(context, t('Taom nomini kiriting'));
    if (_ings.isEmpty) return showSnack(context, t('Kamida bitta masalliq qo‘shing'));
    final active = int.tryParse(_active.text) ?? 0;
    if (active < 1) return showSnack(context, t('Faol vaqtni kiriting'));
    setState(() => _busy = true);
    final ok = await guard(
      context,
      () => s.api.post('/dishes', {
        'title': _title.text.trim(),
        if (_desc.text.trim().isNotEmpty) 'description': _desc.text.trim(),
        'groupId': s.groupId,
        'submitPublic': _public,
        'activeMin': active,
        'passiveMin': int.tryParse(_passive.text) ?? 0,
        'prepAheadMin': _prep ? 480 : 0,
        'baseServings': _servings,
        'isSide': _side,
        'mealTypes': _types.toList(),
        'ingredients': _ings.map((i) => {'ingredientId': i['ingredientId'], 'qtyG': i['qtyG']}).toList(),
        'steps': steps,
        if (_video.text.trim().isNotEmpty) 'videoUrl': _video.text.trim(),
      }),
    );
    if (!mounted) return;
    setState(() => _busy = false);
    if (ok) Navigator.pop(context, true);
  }

  Widget _label(String text) => Padding(
    padding: const EdgeInsets.only(bottom: 8, top: 16),
    child: Text(text, style: sans(13, weight: FontWeight.w700)),
  );

  Widget _numField(String label, TextEditingController c) => Expanded(
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _label(label),
        TextField(
          controller: c,
          keyboardType: TextInputType.number,
          inputFormatters: [FilteringTextInputFormatter.digitsOnly],
          style: sans(16),
        ),
      ],
    ),
  );

  @override
  Widget build(BuildContext context) => Scaffold(
    body: SafeArea(
      child: Column(
        children: [
          Expanded(
            child: ListView(
              padding: const EdgeInsets.fromLTRB(20, 16, 20, 16),
              children: [
                ScreenHeader(title: t('Taom qo‘shish'), close: true, big: false),
                _label(t('Taom nomi')),
                TextField(
                  controller: _title,
                  style: sans(16),
                  decoration: InputDecoration(hintText: t('Onamning chuchvarasi')),
                ),
                _label(t('Qisqacha (ixtiyoriy)')),
                TextField(controller: _desc, style: sans(15), maxLines: 2),
                Row(children: [_numField(t('Faol, daq'), _active), const SizedBox(width: 10), _numField(t('Passiv, daq'), _passive)]),
                const SizedBox(height: 8),
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  value: _prep,
                  activeTrackColor: C.olive,
                  title: Text(t('Oldindan tayyorgarlik kerak'), style: sans(14, weight: FontWeight.w700)),
                  subtitle: Text(t('Ivitish, marinad — navbatchiga bir kun oldin eslatiladi'), style: sans(12, color: C.muted)),
                  onChanged: (v) => setState(() => _prep = v),
                ),
                _label(t('Qaysi mahallarga mos')),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    for (final type in mealOrder)
                      ChoicePill(
                        label: mealTypeName(type),
                        selected: _types.contains(type),
                        onTap: () => setState(() => _types.contains(type) ? _types.remove(type) : _types.add(type)),
                      ),
                    ChoicePill(label: t('Salat / qo‘shimcha'), selected: _side, onTap: () => setState(() => _side = !_side)),
                  ],
                ),
                const SizedBox(height: 16),
                Row(
                  children: [
                    Expanded(
                      child: Text(t('Masalliqlar · necha kishiga'), style: sans(13, weight: FontWeight.w700)),
                    ),
                    Counter(value: _servings, min: 1, max: 50, onChanged: (v) => setState(() => _servings = v)),
                  ],
                ),
                const SizedBox(height: 8),
                if (_ings.isNotEmpty)
                  CardList(
                    children: [
                      for (final (i, ing) in _ings.indexed)
                        Padding(
                          padding: const EdgeInsets.only(left: 16),
                          child: Row(
                            children: [
                              Expanded(
                                child: Text(ing['name'], style: sans(14, weight: FontWeight.w600)),
                              ),
                              Text('${ing['qtyG']} g', style: sans(14, weight: FontWeight.w800)),
                              IconButton(
                                tooltip: t('O‘chirish'),
                                icon: const Icon(Icons.close_rounded, size: 20, color: C.muted),
                                onPressed: () => setState(() => _ings.removeAt(i)),
                              ),
                            ],
                          ),
                        ),
                    ],
                  ),
                TextButton.icon(
                  onPressed: _addIngredient,
                  icon: const Icon(Icons.add_rounded),
                  label: Text(t('Katalogdan masalliq'), style: sans(14, weight: FontWeight.w700)),
                ),
                _label(t('Tayyorlash bosqichlari')),
                for (final (i, c) in _steps.indexed)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: TextField(
                      controller: c,
                      style: sans(15),
                      maxLines: null,
                      decoration: InputDecoration(prefixText: '${i + 1}.  ', hintText: t('Bosqich matni')),
                    ),
                  ),
                TextButton.icon(
                  onPressed: () => setState(() => _steps.add(TextEditingController())),
                  icon: const Icon(Icons.add_rounded),
                  label: Text(t('Bosqich qo‘shish'), style: sans(14, weight: FontWeight.w700)),
                ),
                _label(t('Video havolasi (ixtiyoriy)')),
                TextField(
                  controller: _video,
                  keyboardType: TextInputType.url,
                  style: sans(15),
                  decoration: InputDecoration(hintText: t('YouTube yoki Instagram havolasi')),
                ),
                _label(t('Kim ko‘radi')),
                Segmented<bool>(
                  items: {false: t('Faqat guruhim'), true: t('Hammaga ochiq')},
                  value: _public,
                  onChanged: (v) => setState(() => _public = v),
                ),
                const SizedBox(height: 10),
                Text(
                  t('Taom guruhingizda darhol ishlaydi, moderatsiya fonda o‘tadi. Kaloriya masalliqlardan avtomatik hisoblanadi.'),
                  style: sans(12, color: C.muted, height: 1.45),
                ),
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
