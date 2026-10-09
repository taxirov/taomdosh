import 'package:flutter/material.dart';

import '../../i18n/strings.dart';
import '../../theme.dart';
import '../../widgets/common.dart';
import 'group_actions.dart';

/// Guruh yo'q bo'lganda: yaratish yoki qo'shilish
class NoGroup extends StatelessWidget {
  const NoGroup({super.key});

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.all(24),
    child: Column(
      mainAxisAlignment: MainAxisAlignment.center,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const Center(child: LogoMark(size: 96, plate: C.lineSoft)),
        const SizedBox(height: 20),
        Text(t('Hali guruhingiz yo‘q'), textAlign: TextAlign.center, style: serif(24)),
        const SizedBox(height: 8),
        Text(
          t('Oila, yotoqxona yoki jamoa uchun guruh yarating yoki taklif kodi bilan qo‘shiling — menyu, navbat va xarajat shu yerda.'),
          textAlign: TextAlign.center,
          style: sans(14, color: C.muted, height: 1.5),
        ),
        const SizedBox(height: 24),
        PrimaryButton(label: t('Guruh yaratish'), onPressed: () => showCreateGroup(context)),
        const SizedBox(height: 10),
        SecondaryButton(label: t('Taklif kodi bilan qo‘shilish'), onPressed: () => showJoinGroup(context)),
      ],
    ),
  );
}
