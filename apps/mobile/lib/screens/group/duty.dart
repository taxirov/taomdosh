import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../api/api_client.dart';
import '../../format.dart';
import '../../i18n/strings.dart';
import '../../state/session.dart';
import '../../theme.dart';
import '../../widgets/common.dart';

String dutyRoleName(String r) => switch (r) {
  'cook' => t('Pishiradi'),
  'dishes' => t('Idish yuvadi'),
  'shopping' => t('Bozorga boradi'),
  _ => r,
};

/// Navbatchilik: avtomatik aylanish + qo'lda almashtirish (7 kun)
class DutyScreen extends StatelessWidget {
  const DutyScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final s = context.read<Session>();
    final from = DateTime.now();
    return Scaffold(
      body: SafeArea(
        child: Loader<List<Json>>(
          load: () async {
            await s.reloadGroup();
            final r = await s.api.get('/groups/${s.groupId}/duty', {'from': ymd(from), 'to': ymd(from.add(const Duration(days: 6)))});
            return (r as List).cast<Json>();
          },
          builder: (context, list, reload) => _Body(list: list, reload: reload, from: from),
        ),
      ),
    );
  }
}

class _Body extends StatelessWidget {
  const _Body({required this.list, required this.reload, required this.from});
  final List<Json> list;
  final Future<void> Function() reload;
  final DateTime from;

  Future<void> _toggleRole(BuildContext context, Session s, String role, Json? rot, bool on) async {
    // Yangi aylanish: telefonli (boshqarilmaydigan) a'zolar
    final order =
        (rot?['memberOrder'] as List?)?.cast<String>() ??
        s.members.where((m) => m['managedBy'] == null).map((m) => m['userId'] as String).toList();
    await guard(context, () => s.api.put('/groups/${s.groupId}/duty/rotation', {'dutyRole': role, 'memberOrder': order, 'enabled': on}));
    await reload();
  }

  Future<void> _change(BuildContext context, Session s, String date, String role, Json cur) async {
    final r = await showModalBottomSheet<String>(
      context: context,
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Padding(
              padding: const EdgeInsets.all(16),
              child: Text('${dutyRoleName(role)} · ${longDate(parseYmd(date))}', style: sans(16, weight: FontWeight.w800)),
            ),
            for (final m in s.members.where((m) => m['managedBy'] == null))
              ListTile(
                leading: Avatar(name: m['name'], id: m['userId'], size: 36),
                title: Text(m['userId'] == s.userId ? t('Men') : m['name'], style: sans(15, weight: FontWeight.w700)),
                trailing: m['userId'] == cur['userId'] ? const Icon(Icons.check_rounded, color: C.terracotta) : null,
                onTap: () => Navigator.pop(ctx, m['userId'] as String),
              ),
            if (cur['isManual'] == true)
              ListTile(
                leading: const Icon(Icons.restart_alt_rounded),
                title: Text(t('Avtomatik navbatga qaytarish')),
                onTap: () => Navigator.pop(ctx, '+auto'),
              ),
          ],
        ),
      ),
    );
    if (r == null || !context.mounted) return;
    await guard(context, () async {
      if (r == '+auto') {
        await s.api.delete('/groups/${s.groupId}/duty/$date/$role');
      } else {
        await s.api.put('/groups/${s.groupId}/duty/$date', {'dutyRole': role, 'userId': r});
      }
    });
    await reload();
  }

  @override
  Widget build(BuildContext context) {
    final s = context.watch<Session>();
    final rots = ((s.group?['rotations'] as List?) ?? []).cast<Json>();
    final roles = ['cook', 'dishes', 'shopping'];
    final activeRoles = roles.where((r) => rots.any((x) => x['dutyRole'] == r && x['enabled'] == true)).toList();

    return RefreshIndicator(
      onRefresh: reload,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
        children: [
          ScreenHeader(title: t('Navbatchilik')),
          const SizedBox(height: 16),
          CardList(
            children: [
              for (final role in roles)
                Builder(
                  builder: (context) {
                    final rot = rots.where((x) => x['dutyRole'] == role).firstOrNull;
                    return SwitchListTile(
                      value: rot?['enabled'] == true,
                      activeTrackColor: C.olive,
                      title: Text(dutyRoleName(role), style: sans(15, weight: FontWeight.w700)),
                      subtitle: Text(t('Har kuni keyingi a’zoga o‘tadi'), style: sans(12, color: C.muted)),
                      onChanged: s.isAdmin ? (v) => _toggleRole(context, s, role, rot, v) : null,
                    );
                  },
                ),
            ],
          ),
          const SizedBox(height: 16),
          if (activeRoles.isEmpty) EmptyView(text: t('Navbatchilik yoqilmagan')),
          for (var i = 0; i < 7; i++)
            Builder(
              builder: (context) {
                final date = ymd(from.add(Duration(days: i)));
                final day = list.where((d) => d['date'] == date).toList();
                final anyManual = day.any((d) => d['isManual'] == true);
                return Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: AppCard(
                    borderColor: i == 0 ? C.terracotta : C.line,
                    borderWidth: i == 0 ? 2 : 1,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Row(
                          children: [
                            Expanded(
                              child: Text(
                                i == 0 ? '${t('Bugun')} · ${weekdaysLong()[parseYmd(date).weekday - 1]}' : longDate(parseYmd(date)),
                                style: sans(14, weight: FontWeight.w800),
                              ),
                            ),
                            if (anyManual) Pill(t('Qo‘lda o‘zgartirildi'), bg: C.mustardSoft, fg: C.mustardInk),
                          ],
                        ),
                        const SizedBox(height: 8),
                        for (final d in day)
                          InkWell(
                            onTap: () => _change(context, s, date, d['dutyRole'], d),
                            child: Padding(
                              padding: const EdgeInsets.symmetric(vertical: 6),
                              child: Row(
                                children: [
                                  SizedBox(
                                    width: 120,
                                    child: Text(dutyRoleName(d['dutyRole']), style: sans(13, color: C.muted)),
                                  ),
                                  if (d['userId'] != null) Avatar(name: s.realName(d['userId']), id: d['userId'], size: 26),
                                  const SizedBox(width: 8),
                                  Expanded(
                                    child: Text(
                                      d['userId'] == null ? '—' : s.memberName(d['userId']),
                                      style: sans(14, weight: d['userId'] == s.userId ? FontWeight.w800 : FontWeight.w600),
                                    ),
                                  ),
                                  Text(
                                    t('Almashtirish'),
                                    style: sans(12, weight: FontWeight.w700, color: C.terracotta),
                                  ),
                                ],
                              ),
                            ),
                          ),
                      ],
                    ),
                  ),
                );
              },
            ),
          Text(t('Navbatchi kela olmasa, “Almashtirish” orqali boshqa a’zoni tanlang.'), style: sans(12, color: C.muted, height: 1.45)),
        ],
      ),
    );
  }
}
