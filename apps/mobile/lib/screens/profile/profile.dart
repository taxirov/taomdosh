import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../api/api_client.dart';
import '../../format.dart';
import '../../i18n/strings.dart';
import '../../state/session.dart';
import '../../theme.dart';
import '../../widgets/common.dart';
import '../auth/goal.dart';
import '../auth/profile_setup.dart';
import '../dishes/dishes.dart';
import '../group/group.dart';
import 'progress.dart';

class ProfileScreen extends StatelessWidget {
  const ProfileScreen({super.key});

  String _phone(String? p) {
    if (p == null || !p.startsWith('+998') || p.length != 13) return p ?? '';
    final d = p.substring(4);
    return '+998 ${d.substring(0, 2)} ${d.substring(2, 5)} ${d.substring(5, 7)} ${d.substring(7)}';
  }

  @override
  Widget build(BuildContext context) {
    final s = context.watch<Session>();
    final me = s.me ?? {};
    final goal = ((me['profile'] as Json?)?['goal'] as String?) ?? 'maintain';
    final kcal = (me['target'] as Json?)?['kcal'];
    void open(Widget w) => Navigator.of(context).push(route(w));

    Widget item(IconData icon, String title, String? sub, VoidCallback onTap) => ListTile(
      leading: Icon(icon, color: C.terracotta),
      title: Text(title, style: sans(15, weight: FontWeight.w700)),
      subtitle: sub == null ? null : Text(sub, style: sans(12, color: C.muted)),
      trailing: const Icon(Icons.chevron_right_rounded, color: C.muted),
      onTap: onTap,
    );

    return SafeArea(
      child: ListView(
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
        children: [
          Row(
            children: [
              Avatar(name: me['name'] ?? '', id: s.userId, size: 64, color: C.terracotta),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(me['name'] ?? '', style: serif(26)),
                    Text(_phone(me['phone'] as String?), style: sans(13, color: C.muted)),
                  ],
                ),
              ),
              TextButton(
                onPressed: () => open(const ProfileSetupScreen()),
                child: Text(
                  t('Tahrirlash'),
                  style: sans(14, weight: FontWeight.w700, color: C.terracotta),
                ),
              ),
            ],
          ),
          const SizedBox(height: 20),
          AppCard(
            color: C.terracotta,
            borderColor: C.terracotta,
            onTap: () => open(const GoalScreen()),
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        t('Kunlik reja · {goal}', {
                          'goal': {'lose': t('Vazn tashlash'), 'maintain': t('Vaznni saqlash'), 'gain': t('Vazn olish')}[goal],
                        }),
                        style: sans(13, weight: FontWeight.w600, color: const Color(0xFFFBE3D3)),
                      ),
                      Text('${groupDigits((kcal as num?) ?? 2000)} ${t('kkal')}', style: serif(26, color: C.cream)),
                    ],
                  ),
                ),
                const Icon(Icons.chevron_right_rounded, color: C.cream),
              ],
            ),
          ),
          const SizedBox(height: 12),
          CardList(
            children: [
              item(Icons.monitor_weight_outlined, t('Vazn va bo‘y'), t('O‘lchovlar tarixi'), () => open(const ProgressScreen())),
              item(
                Icons.groups_outlined,
                t('Guruhlarim'),
                s.groups.map((g) => g['name']).join(', '),
                () => showGroupSwitcher(context, null),
              ),
              item(Icons.favorite_border_rounded, t('Sevimli taomlar'), null, () => open(const DishesScreen(favoritesOnly: true))),
              item(Icons.restaurant_menu_rounded, t('Mening taomlarim'), null, () => open(const DishesScreen(mineOnly: true))),
            ],
          ),
          const SizedBox(height: 12),
          CardList(
            children: [
              item(Icons.translate_rounded, t('Til'), localeNames[s.locale], () async {
                final l = await showModalBottomSheet<String>(
                  context: context,
                  builder: (ctx) => SafeArea(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        for (final l in supportedLocales)
                          ListTile(
                            title: Text(localeNames[l]!, style: sans(15, weight: FontWeight.w700)),
                            trailing: l == s.locale ? const Icon(Icons.check_rounded, color: C.terracotta) : null,
                            onTap: () => Navigator.pop(ctx, l),
                          ),
                      ],
                    ),
                  ),
                );
                if (l != null) await s.setLocale(l);
              }),
              ListTile(
                leading: const Icon(Icons.logout_rounded, color: C.terracottaDark),
                title: Text(
                  t('Chiqish'),
                  style: sans(15, weight: FontWeight.w700, color: C.terracottaDark),
                ),
                onTap: () async {
                  if (await confirm(context, t('Hisobdan chiqasizmi?'), ok: t('Chiqish'))) await s.logout();
                },
              ),
            ],
          ),
          const SizedBox(height: 16),
          Center(
            child: Text('Taomdosh 0.1 · ${t('wellness ilova, tibbiy maslahat emas')}', style: sans(12, color: C.muted)),
          ),
        ],
      ),
    );
  }
}
