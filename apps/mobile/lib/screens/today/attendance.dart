import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../api/api_client.dart';
import '../../format.dart';
import '../../i18n/strings.dart';
import '../../state/session.dart';
import '../../theme.dart';
import '../../widgets/common.dart';
import 'cook_mode.dart';
import 'today.dart';

/// Kim yeydi, mehmonlar. O'zingizni va boshqaradigan a'zolaringizni (bola) belgilaysiz; admin — hammani.
class AttendanceScreen extends StatelessWidget {
  const AttendanceScreen({super.key, required this.mealId});
  final String mealId;

  @override
  Widget build(BuildContext context) {
    final s = context.read<Session>();
    return Scaffold(
      body: SafeArea(
        child: Loader<Json>(
          load: () async => await s.api.get('/meals/$mealId') as Json,
          builder: (context, m, reload) => _AttendanceBody(meal: m),
        ),
      ),
    );
  }
}

class _AttendanceBody extends StatefulWidget {
  const _AttendanceBody({required this.meal});
  final Json meal;

  @override
  State<_AttendanceBody> createState() => _AttendanceBodyState();
}

class _AttendanceBodyState extends State<_AttendanceBody> {
  late final Map<String, bool> _eat = {
    for (final a in (widget.meal['attendance'] as List).cast<Json>()) a['userId'] as String: a['status'] != 'not_eating',
  };
  late final Map<String, int> _guests = {
    for (final a in (widget.meal['attendance'] as List).cast<Json>()) a['userId'] as String: (a['guests'] as num).toInt(),
  };
  bool _busy = false;

  List<Json> get _att => (widget.meal['attendance'] as List).cast<Json>();

  bool _canEdit(Session s, String id) {
    if (id == s.userId || s.isAdmin) return true;
    final m = s.members.where((x) => x['userId'] == id).firstOrNull;
    return m?['managedBy'] == s.userId;
  }

  Future<void> _save() async {
    final s = context.read<Session>();
    setState(() => _busy = true);
    final ok = await guard(context, () async {
      for (final a in _att) {
        final id = a['userId'] as String;
        final changed = (a['status'] != 'not_eating') != _eat[id] || a['guests'] != _guests[id];
        if (!changed) continue;
        await s.api.put('/meals/${widget.meal['id']}/attendance', {
          'status': _eat[id]! ? 'eating' : 'not_eating',
          'guests': _guests[id],
          if (id != s.userId) 'userId': id,
        });
      }
    });
    if (!mounted) return;
    setState(() => _busy = false);
    if (ok) Navigator.pop(context);
  }

  @override
  Widget build(BuildContext context) {
    final s = context.watch<Session>();
    final m = widget.meal;
    final locked = m['status'] != 'planned' || parseTime(m['lockAt']).isBefore(DateTime.now());
    final eating = _eat.values.where((v) => v).length;
    final guests = _guests.values.fold<int>(0, (a, b) => a + b);
    final left = parseTime(m['lockAt']).difference(DateTime.now());
    final first = (m['dishes'] as List).cast<Json>().firstOrNull;

    return Column(
      children: [
        Expanded(
          child: ListView(
            padding: const EdgeInsets.fromLTRB(20, 16, 20, 16),
            children: [
              ScreenHeader(title: '${mealTypeName(m['mealType'])} · ${hhmm(parseTime(m['eatAt']))}', big: false),
              const SizedBox(height: 16),
              AppCard(
                padding: const EdgeInsets.all(12),
                child: Row(
                  children: [
                    DishImage(url: first?['imageUrl'], width: 72, height: 72, radius: 14, seed: first?['dishId'] ?? ''),
                    const SizedBox(width: 14),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(mealTitle(m), style: serif(22)),
                          const SizedBox(height: 3),
                          Text.rich(
                            TextSpan(
                              style: sans(13, color: C.muted),
                              children: [
                                TextSpan(text: '${t('Navbatchi')}: '),
                                TextSpan(
                                  text: m['cookUserId'] == null ? '—' : s.memberName(m['cookUserId']),
                                  style: sans(13, weight: FontWeight.w700),
                                ),
                              ],
                            ),
                          ),
                          Text(
                            t('Pishirish {time} da boshlanadi', {'time': hhmm(parseTime(m['startAt']))}),
                            style: sans(13, color: C.muted),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 12),
              InfoBanner(
                icon: Icons.lock_outline_rounded,
                bg: C.terracottaSoft,
                fg: C.terracottaDark,
                text: locked
                    ? t('Ro‘yxat yopilgan — porsiyalar hisoblab bo‘lingan.')
                    : t('Ro‘yxat {time} da yopiladi — {left} qoldi', {'time': hhmm(parseTime(m['lockAt'])), 'left': duration(left)}),
              ),
              const SizedBox(height: 16),
              Text(t('Kim yeydi'), style: sans(15, weight: FontWeight.w800)),
              const SizedBox(height: 10),
              CardList(
                children: [
                  for (final a in _att)
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                      child: Row(
                        children: [
                          Avatar(name: a['name'], id: a['userId'], faded: _eat[a['userId']] != true),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  a['userId'] == s.userId ? '${a['name']} (${t('siz')})' : a['name'],
                                  style: sans(15, weight: FontWeight.w700),
                                ),
                                Text(
                                  [
                                    _eat[a['userId']] == true ? t('Yeyman') : t('Yo‘q'),
                                    if (a['userId'] == m['cookUserId']) t('Navbatchi'),
                                    if ((_guests[a['userId']] ?? 0) > 0) t('+{n} mehmon', {'n': _guests[a['userId']]}),
                                  ].join(' · '),
                                  style: sans(12, color: C.muted),
                                ),
                              ],
                            ),
                          ),
                          Switch(
                            value: _eat[a['userId']] == true,
                            activeTrackColor: C.olive,
                            onChanged: locked || !_canEdit(s, a['userId']) ? null : (v) => setState(() => _eat[a['userId']] = v),
                          ),
                        ],
                      ),
                    ),
                ],
              ),
              const SizedBox(height: 12),
              AppCard(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                child: Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(t('Mening mehmonlarim'), style: sans(15, weight: FontWeight.w700)),
                          Text(t('Mehmon porsiyasi sizga yoziladi'), style: sans(12, color: C.muted)),
                        ],
                      ),
                    ),
                    Counter(
                      value: _guests[s.userId] ?? 0,
                      max: 20,
                      onChanged: locked ? (_) {} : (v) => setState(() => _guests[s.userId] = v),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
          child: Column(
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(t('Jami porsiya'), style: sans(14, color: C.muted)),
                  ),
                  Text(
                    t('{n} ({e} a’zo + {g} mehmon)', {'n': eating + guests, 'e': eating, 'g': guests}),
                    style: sans(15, weight: FontWeight.w800),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              locked
                  ? PrimaryButton(
                      label: t('Navbatchi ekrani'),
                      onPressed: () => Navigator.of(context).pushReplacement(route(CookModeScreen(mealId: m['id']))),
                    )
                  : PrimaryButton(label: t('Saqlash'), loading: _busy, onPressed: _save),
            ],
          ),
        ),
      ],
    );
  }
}
