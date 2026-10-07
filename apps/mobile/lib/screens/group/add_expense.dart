import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../../api/api_client.dart';
import '../../format.dart';
import '../../i18n/strings.dart';
import '../../state/session.dart';
import '../../theme.dart';
import '../../widgets/common.dart';

/// Xarajat kiritish; xarid ro'yxatidan olinganlar belgilansa — zaxiraga qo'shiladi
class AddExpenseScreen extends StatefulWidget {
  const AddExpenseScreen({super.key, this.pending = const []});
  final List<Json> pending;

  @override
  State<AddExpenseScreen> createState() => _AddExpenseScreenState();
}

class _AddExpenseScreenState extends State<AddExpenseScreen> {
  final _amount = TextEditingController();
  final _note = TextEditingController();
  late String _paidBy = context.read<Session>().userId;
  String _category = 'groceries';
  late final Set<String> _bought = {};
  bool _busy = false;

  int get _sum => int.tryParse(_amount.text.replaceAll(RegExp(r'\D'), '')) ?? 0;

  Future<void> _save() async {
    if (_sum <= 0) return showSnack(context, t('Summani kiriting'));
    final s = context.read<Session>();
    setState(() => _busy = true);
    final ok = await guard(context, () async {
      for (final id in _bought) {
        await s.api.patch('/groups/${s.groupId}/shopping/$id', {'status': 'bought'});
      }
      final names = widget.pending.where((i) => _bought.contains(i['id'])).map((i) => i['name']).join(', ');
      final note = _note.text.trim().isNotEmpty ? _note.text.trim() : (names.isNotEmpty ? names : null);
      await s.api.post('/groups/${s.groupId}/expenses', {'amount': _sum, 'paidBy': _paidBy, 'category': _category, 'note': ?note});
    });
    if (!mounted) return;
    setState(() => _busy = false);
    if (ok) Navigator.pop(context, true);
  }

  @override
  Widget build(BuildContext context) {
    final s = context.watch<Session>();
    final split = s.group?['splitMode'] == 'by_portion';
    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            Expanded(
              child: ListView(
                padding: const EdgeInsets.fromLTRB(20, 16, 20, 16),
                children: [
                  ScreenHeader(title: t('Xarajat kiritish'), close: true, big: false),
                  const SizedBox(height: 20),
                  Text(t('Summa'), style: sans(13, weight: FontWeight.w700)),
                  const SizedBox(height: 8),
                  TextField(
                    controller: _amount,
                    autofocus: true,
                    keyboardType: TextInputType.number,
                    style: serif(30),
                    inputFormatters: [FilteringTextInputFormatter.digitsOnly, _ThousandsFormatter()],
                    onChanged: (_) => setState(() {}),
                    decoration: InputDecoration(suffixText: t('so‘m'), hintText: '0'),
                  ),
                  const SizedBox(height: 18),
                  Text(t('Kim to‘ladi'), style: sans(13, weight: FontWeight.w700)),
                  const SizedBox(height: 8),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      for (final m in s.members.where((m) => m['managedBy'] == null))
                        ChoicePill(
                          label: m['userId'] == s.userId ? t('Men') : m['name'],
                          selected: _paidBy == m['userId'],
                          onTap: () => setState(() => _paidBy = m['userId']),
                        ),
                    ],
                  ),
                  const SizedBox(height: 18),
                  Text(t('Turi'), style: sans(13, weight: FontWeight.w700)),
                  const SizedBox(height: 8),
                  Wrap(
                    spacing: 8,
                    children: [
                      for (final e in {'groceries': t('Oziq-ovqat'), 'utilities': t('Kommunal'), 'other': t('Boshqa')}.entries)
                        ChoicePill(label: e.value, selected: _category == e.key, onTap: () => setState(() => _category = e.key)),
                    ],
                  ),
                  const SizedBox(height: 18),
                  Text(t('Izoh (ixtiyoriy)'), style: sans(13, weight: FontWeight.w700)),
                  const SizedBox(height: 8),
                  TextField(
                    controller: _note,
                    style: sans(15),
                    decoration: InputDecoration(hintText: t('Bozor, non va sut...')),
                  ),
                  if (widget.pending.isNotEmpty) ...[
                    const SizedBox(height: 18),
                    Text(t('Ro‘yxatdan olinganlar'), style: sans(13, weight: FontWeight.w700)),
                    const SizedBox(height: 8),
                    CardList(
                      children: [
                        for (final it in widget.pending)
                          CheckboxListTile(
                            dense: true,
                            activeColor: C.olive,
                            controlAffinity: ListTileControlAffinity.leading,
                            value: _bought.contains(it['id']),
                            onChanged: (v) => setState(() => v == true ? _bought.add(it['id']) : _bought.remove(it['id'])),
                            title: Text('${it['name']} · ${displayQty(it['display'])}', style: sans(14, weight: FontWeight.w600)),
                          ),
                      ],
                    ),
                    const SizedBox(height: 6),
                    Text(t('Belgilanganlar zaxiraga qo‘shiladi va ro‘yxatdan o‘chadi.'), style: sans(12, color: C.muted)),
                  ],
                  const SizedBox(height: 18),
                  InfoBanner(
                    icon: Icons.pie_chart_outline_rounded,
                    bg: C.oliveSoft,
                    fg: C.oliveInk,
                    text: split
                        ? t(
                            'Summa shu haftada kim qancha ovqatlanganiga (porsiya kaloriyasi) qarab avtomatik bo‘linadi. Mehmon porsiyasi uni olib kelganga yoziladi.',
                          )
                        : t('Oilada umumiy qozon: xarajat yoziladi, lekin ulushlarga bo‘linmaydi.'),
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
}

/// 1240000 → "1 240 000" yozish paytida
class _ThousandsFormatter extends TextInputFormatter {
  @override
  TextEditingValue formatEditUpdate(TextEditingValue oldValue, TextEditingValue newValue) {
    final digits = newValue.text.replaceAll(RegExp(r'\D'), '');
    if (digits.isEmpty) return const TextEditingValue();
    final text = groupDigits(int.parse(digits));
    return TextEditingValue(
      text: text,
      selection: TextSelection.collapsed(offset: text.length),
    );
  }
}
