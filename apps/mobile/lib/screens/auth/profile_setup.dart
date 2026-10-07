import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../../api/api_client.dart';
import '../../format.dart';
import '../../i18n/strings.dart';
import '../../state/session.dart';
import '../../theme.dart';
import '../../widgets/common.dart';
import 'goal.dart';

/// Profil: jins, yosh, bo'y, vazn, faollik, maqsad — hammasi ixtiyoriy.
/// onboarding=true — kirishdan keyingi 3-qadam; aks holda profilni tahrirlash.
class ProfileSetupScreen extends StatefulWidget {
  const ProfileSetupScreen({super.key, this.onboarding = false});
  final bool onboarding;

  @override
  State<ProfileSetupScreen> createState() => _ProfileSetupScreenState();
}

class _ProfileSetupScreenState extends State<ProfileSetupScreen> {
  final _age = TextEditingController();
  final _height = TextEditingController();
  final _weight = TextEditingController();
  final _name = TextEditingController();
  String? _sex;
  String _activity = 'light';
  String _goal = 'maintain';
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    final me = context.read<Session>().me ?? {};
    final p = (me['profile'] as Json?) ?? {};
    _name.text = me['name'] as String? ?? '';
    _sex = p['sex'] as String?;
    _activity = p['activityLevel'] as String? ?? 'light';
    _goal = p['goal'] as String? ?? 'maintain';
    if (p['heightCm'] != null) _height.text = '${p['heightCm']}';
    if (p['weightKg'] != null) _weight.text = dec(p['weightKg'] as num);
    final bd = p['birthDate'] as String?;
    if (bd != null) {
      final b = parseYmd(bd);
      final now = DateTime.now();
      var age = now.year - b.year;
      if (now.month < b.month || (now.month == b.month && now.day < b.day)) age--;
      _age.text = '$age';
    }
  }

  Future<void> _save() async {
    final body = <String, Object>{'activityLevel': _activity, 'goal': _goal};
    if (_sex != null) body['sex'] = _sex!;
    final age = int.tryParse(_age.text);
    if (age != null && age > 0 && age < 120) {
      final now = DateTime.now();
      body['birthDate'] = ymd(DateTime(now.year - age, now.month, now.day));
    }
    final h = int.tryParse(_height.text);
    if (h != null) body['heightCm'] = h;
    final w = double.tryParse(_weight.text.replaceAll(',', '.'));
    if (w != null) body['weightKg'] = w;
    setState(() => _busy = true);
    final s = context.read<Session>();
    final ok = await guard(context, () async {
      if (!widget.onboarding && _name.text.trim().isNotEmpty && _name.text.trim() != s.me?['name']) await s.rename(_name.text.trim());
      await s.saveProfile(body);
    });
    if (!mounted) return;
    setState(() => _busy = false);
    if (!ok) return;
    if (widget.onboarding) {
      Navigator.of(context).pushReplacement(route(const GoalScreen(onboarding: true)));
    } else {
      Navigator.of(context).pop();
    }
  }

  Widget _num(String label, TextEditingController c, {bool decimal = false}) => Expanded(
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: sans(13, weight: FontWeight.w700)),
        const SizedBox(height: 8),
        TextField(
          controller: c,
          style: sans(16),
          keyboardType: TextInputType.numberWithOptions(decimal: decimal),
          inputFormatters: [FilteringTextInputFormatter.allow(RegExp(decimal ? r'[\d.,]' : r'\d')), LengthLimitingTextInputFormatter(5)],
          decoration: const InputDecoration(contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 14)),
        ),
      ],
    ),
  );

  @override
  Widget build(BuildContext context) {
    final activities = {'light': t('Kam'), 'moderate': t('O‘rtacha'), 'active': t('Yuqori')};
    // API da 5 daraja bor — ekranda 3 tasi; chekkadagilar eng yaqiniga tushadi
    final act = switch (_activity) {
      'sedentary' => 'light',
      'very_active' => 'active',
      _ => _activity,
    };
    final goals = {'lose': t('Vazn tashlash'), 'maintain': t('Vaznni saqlash'), 'gain': t('Vazn olish')};
    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(24, 16, 24, 20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: [
                  if (!widget.onboarding) const BackBtn() else const SizedBox(height: 44),
                  const Spacer(),
                  if (widget.onboarding)
                    TextButton(
                      onPressed: () => Navigator.of(context).pushReplacement(route(const GoalScreen(onboarding: true))),
                      child: Text(
                        t('Keyinroq'),
                        style: sans(14, weight: FontWeight.w700, color: C.terracotta),
                      ),
                    ),
                ],
              ),
              Expanded(
                child: ListView(
                  children: [
                    const SizedBox(height: 12),
                    Text(t('Profilingiz'), style: serif(28)),
                    const SizedBox(height: 8),
                    Text(
                      t('Hammasi ixtiyoriy. To‘ldirsangiz, kunlik kaloriya va porsiyangizni aniq hisoblaymiz.'),
                      style: sans(14, color: C.muted, height: 1.5),
                    ),
                    if (!widget.onboarding) ...[
                      const SizedBox(height: 20),
                      Text(t('Ismingiz'), style: sans(13, weight: FontWeight.w700)),
                      const SizedBox(height: 8),
                      TextField(controller: _name, style: sans(16)),
                    ],
                    const SizedBox(height: 20),
                    Text(t('Jins'), style: sans(13, weight: FontWeight.w700)),
                    const SizedBox(height: 8),
                    Segmented<String?>(
                      items: {'male': t('Erkak'), 'female': t('Ayol')},
                      value: _sex,
                      onChanged: (v) => setState(() => _sex = v),
                    ),
                    const SizedBox(height: 20),
                    Row(
                      children: [
                        _num(t('Yosh'), _age),
                        const SizedBox(width: 10),
                        _num(t('Bo‘y, sm'), _height),
                        const SizedBox(width: 10),
                        _num(t('Vazn, kg'), _weight, decimal: true),
                      ],
                    ),
                    const SizedBox(height: 20),
                    Text(t('Faollik darajasi'), style: sans(13, weight: FontWeight.w700)),
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        for (final e in activities.entries) ...[
                          if (e.key != 'light') const SizedBox(width: 8),
                          ChoicePill(
                            label: e.value,
                            selected: act == e.key,
                            expand: true,
                            height: 44,
                            onTap: () => setState(() => _activity = e.key),
                          ),
                        ],
                      ],
                    ),
                    const SizedBox(height: 20),
                    Text(t('Maqsad'), style: sans(13, weight: FontWeight.w700)),
                    const SizedBox(height: 8),
                    for (final e in goals.entries)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 8),
                        child: AppCard(
                          onTap: () => setState(() => _goal = e.key),
                          radius: 14,
                          color: _goal == e.key ? C.terracottaSoft : C.card,
                          borderColor: _goal == e.key ? C.terracotta : C.border,
                          borderWidth: _goal == e.key ? 2 : 1.5,
                          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
                          child: Row(
                            children: [
                              Expanded(
                                child: Text(e.value, style: sans(15, weight: _goal == e.key ? FontWeight.w700 : FontWeight.w600)),
                              ),
                              if (_goal == e.key) const Icon(Icons.check_circle_outline_rounded, color: C.terracotta),
                            ],
                          ),
                        ),
                      ),
                    const SizedBox(height: 8),
                    Text(
                      t('Bolalar uchun (18 yoshgacha) vazn tashlash tuzatmasi qo‘llanmaydi. Bu tibbiy maslahat emas.'),
                      style: sans(12, color: C.muted, height: 1.45),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 12),
              PrimaryButton(label: widget.onboarding ? t('Davom etish') : t('Saqlash'), loading: _busy, onPressed: _save),
            ],
          ),
        ),
      ),
    );
  }
}
