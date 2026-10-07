import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../i18n/strings.dart';
import '../../state/session.dart';
import '../../theme.dart';
import '../../widgets/common.dart';

String groupTypeName(String type) => switch (type) {
  'family' => t('Oila'),
  'students' => t('Talabalar'),
  'team' => t('Jamoa'),
  _ => type,
};

/// Yangi guruh: nom va tur. Muvaffaqiyatda true.
Future<bool> showCreateGroup(BuildContext context) async {
  final name = TextEditingController();
  var type = 'family';
  var busy = false;
  final ok = await showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    builder: (ctx) => StatefulBuilder(
      builder: (ctx, set) => Padding(
        padding: EdgeInsets.fromLTRB(20, 20, 20, 20 + MediaQuery.of(ctx).viewInsets.bottom),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(t('Yangi guruh'), style: serif(24)),
            const SizedBox(height: 16),
            TextField(
              controller: name,
              autofocus: true,
              style: sans(16),
              decoration: InputDecoration(hintText: t('Masalan, Do‘stlar uyi')),
            ),
            const SizedBox(height: 16),
            Text(t('Guruh turi'), style: sans(13, weight: FontWeight.w700)),
            const SizedBox(height: 8),
            Row(
              children: [
                for (final k in ['family', 'students', 'team']) ...[
                  if (k != 'family') const SizedBox(width: 8),
                  ChoicePill(label: groupTypeName(k), selected: type == k, expand: true, height: 44, onTap: () => set(() => type = k)),
                ],
              ],
            ),
            const SizedBox(height: 10),
            Text(
              type == 'family'
                  ? t('Oilada — umumiy qozon: xarajat ulushlarga bo‘linmaydi.')
                  : t('Xarajat kim qancha ovqatlangan bo‘lsa, shunga qarab bo‘linadi.'),
              style: sans(13, color: C.muted, height: 1.4),
            ),
            const SizedBox(height: 20),
            PrimaryButton(
              label: t('Yaratish'),
              loading: busy,
              onPressed: () async {
                if (name.text.trim().isEmpty) return;
                set(() => busy = true);
                final done = await guard(ctx, () => ctx.read<Session>().createGroup(name.text.trim(), type));
                if (ctx.mounted) {
                  set(() => busy = false);
                  if (done) Navigator.pop(ctx, true);
                }
              },
            ),
          ],
        ),
      ),
    ),
  );
  return ok ?? false;
}

/// Taklif kodi bilan qo'shilish. Muvaffaqiyatda true.
Future<bool> showJoinGroup(BuildContext context) async {
  final code = await promptText(context, title: t('Taklif kodi'), hint: 'ABC123');
  if (code == null || code.isEmpty || !context.mounted) return false;
  return guard(context, () => context.read<Session>().joinGroup(code));
}
