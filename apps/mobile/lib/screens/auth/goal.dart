import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../api/api_client.dart';
import '../../format.dart';
import '../../i18n/strings.dart';
import '../../state/session.dart';
import '../../theme.dart';
import '../../widgets/common.dart';
import '../group/group_actions.dart';

/// Kunlik reja: kaloriya va makrolar (profil asosida, Mifflin–St Jeor)
class GoalScreen extends StatelessWidget {
  const GoalScreen({super.key, this.onboarding = false});
  final bool onboarding;

  @override
  Widget build(BuildContext context) {
    final s = context.watch<Session>();
    final target = (s.me?['target'] as Json?) ?? {};
    final goal = ((s.me?['profile'] as Json?)?['goal'] as String?) ?? 'maintain';
    final kcal = target['kcal'] as num? ?? 2000;
    final goalTitle = {'lose': t('Vazn tashlash'), 'maintain': t('Vaznni saqlash'), 'gain': t('Vazn olish')}[goal]!;
    final goalText = {
      'lose': t('Me’yoringizdan taxminan 15% kam — haftasiga ~0,5 kg.'),
      'maintain': t('Kunlik sarfingizga teng — vazn barqaror qoladi.'),
      'gain': t('Me’yoringizdan taxminan 10% ko‘p.'),
    }[goal]!;
    void done() => Navigator.of(context).popUntil((r) => r.isFirst);

    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(24, 16, 24, 20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: [
                  if (!onboarding) const BackBtn() else const SizedBox(height: 44),
                  const Spacer(),
                  if (onboarding)
                    Text(
                      '3 / 3',
                      style: sans(13, weight: FontWeight.w700, color: C.muted),
                    ),
                ],
              ),
              Expanded(
                child: ListView(
                  children: [
                    const SizedBox(height: 16),
                    Text(t('Kunlik rejangiz tayyor'), style: serif(28)),
                    const SizedBox(height: 20),
                    Container(
                      padding: const EdgeInsets.all(20),
                      decoration: BoxDecoration(color: C.terracotta, borderRadius: BorderRadius.circular(22)),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text.rich(
                            TextSpan(
                              children: [
                                TextSpan(
                                  text: groupDigits(kcal),
                                  style: serif(44, color: C.cream),
                                ),
                                TextSpan(
                                  text: ' ${t('kkal / kun')}',
                                  style: sans(16, weight: FontWeight.w700, color: C.mustardLight),
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(height: 6),
                          Text(
                            goalTitle,
                            style: sans(15, weight: FontWeight.w800, color: C.cream),
                          ),
                          const SizedBox(height: 4),
                          Text(goalText, style: sans(13, color: const Color(0xFFFBE3D3), height: 1.45)),
                          if (target['isEstimate'] == true) ...[
                            const SizedBox(height: 8),
                            Text(
                              t('Profil to‘liq emas — taxminiy qiymat.'),
                              style: sans(12, weight: FontWeight.w700, color: C.mustardLight),
                            ),
                          ],
                        ],
                      ),
                    ),
                    const SizedBox(height: 12),
                    Row(
                      children: [
                        _macro(t('Oqsil'), target['proteinG'], C.olive, C.oliveSoft),
                        const SizedBox(width: 8),
                        _macro(t('Yog‘'), target['fatG'], C.mustardInk, C.mustardSoft),
                        const SizedBox(width: 8),
                        _macro(t('Uglevod'), target['carbG'], C.blue, C.blueSoft),
                      ],
                    ),
                    const SizedBox(height: 20),
                    Text(t('Guruh menyusida porsiyangiz shu reja asosida hisoblanadi.'), style: sans(14, color: C.muted, height: 1.5)),
                  ],
                ),
              ),
              if (onboarding && s.groups.isEmpty) ...[
                PrimaryButton(
                  label: t('Guruh yaratish'),
                  onPressed: () async {
                    if (await showCreateGroup(context)) done();
                  },
                ),
                const SizedBox(height: 10),
                SecondaryButton(
                  label: t('Taklif kodi bilan qo‘shilish'),
                  onPressed: () async {
                    if (await showJoinGroup(context)) done();
                  },
                ),
                TextButton(onPressed: done, child: Text(t('Keyinroq'))),
              ] else
                PrimaryButton(label: t('Tayyor'), onPressed: onboarding ? done : () => Navigator.pop(context)),
            ],
          ),
        ),
      ),
    );
  }

  Widget _macro(String label, Object? g, Color fg, Color bg) => Expanded(
    child: Container(
      padding: const EdgeInsets.symmetric(vertical: 12),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(14)),
      child: Column(
        children: [
          Text(
            '${g ?? '—'} g',
            style: sans(17, weight: FontWeight.w800, color: fg),
          ),
          Text(
            label,
            style: sans(12, weight: FontWeight.w600, color: fg),
          ),
        ],
      ),
    ),
  );
}
