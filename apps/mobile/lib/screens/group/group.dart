import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../../api/api_client.dart';
import '../../i18n/strings.dart';
import '../../state/session.dart';
import '../../theme.dart';
import '../../widgets/common.dart';
import 'duty.dart';
import 'expenses.dart';
import 'group_actions.dart';
import 'no_group.dart';
import 'pantry.dart';
import 'shopping.dart';

/// Guruh: tur, a'zolar, taklif kodi, bo'limlarga havolalar
class GroupScreen extends StatefulWidget {
  const GroupScreen({super.key});

  @override
  State<GroupScreen> createState() => _GroupScreenState();
}

class _GroupScreenState extends State<GroupScreen> {
  @override
  void initState() {
    super.initState();
    // Tab ochilganda a'zolar ro'yxatini yangilaymiz
    WidgetsBinding.instance.addPostFrameCallback((_) => context.read<Session>().reloadGroup().catchError((_) {}));
  }

  Future<void> _setType(Session s, String type) async {
    await guard(context, () async {
      await s.api.patch('/groups/${s.groupId}', {'type': type});
      await s.reloadGroup();
    });
  }

  Future<void> _memberMenu(Session s, Json m) async {
    final isMe = m['userId'] == s.userId;
    final action = await showModalBottomSheet<String>(
      context: context,
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              title: Text(m['name'], style: sans(16, weight: FontWeight.w800)),
            ),
            if (s.isAdmin && !isMe && m['managedBy'] == null)
              ListTile(
                leading: const Icon(Icons.admin_panel_settings_outlined),
                title: Text(m['role'] == 'admin' ? t('Adminlikdan olish') : t('Admin qilish')),
                onTap: () => Navigator.pop(ctx, 'role'),
              ),
            if (m['managedBy'] == s.userId)
              ListTile(
                leading: const Icon(Icons.edit_outlined),
                title: Text(t('Profilini tahrirlash')),
                onTap: () => Navigator.pop(ctx, 'profile'),
              ),
            if (s.isAdmin || isMe)
              ListTile(
                leading: const Icon(Icons.logout_rounded, color: C.terracottaDark),
                title: Text(isMe ? t('Guruhdan chiqish') : t('Guruhdan chiqarish'), style: sans(15, color: C.terracottaDark)),
                onTap: () => Navigator.pop(ctx, 'remove'),
              ),
          ],
        ),
      ),
    );
    if (!mounted || action == null) return;
    final gid = s.groupId;
    switch (action) {
      case 'role':
        await guard(context, () async {
          await s.api.put('/groups/$gid/members/${m['userId']}/role', {'role': m['role'] == 'admin' ? 'member' : 'admin'});
          await s.reloadGroup();
        });
      case 'profile':
        await _editChild(s, m);
      case 'remove':
        if (!await confirm(context, isMe ? t('Guruhdan chiqasizmi?') : t('{name} guruhdan chiqarilsinmi?', {'name': m['name']}))) return;
        if (!mounted) return;
        await guard(context, () async {
          await s.api.delete('/groups/$gid/members/${m['userId']}');
          isMe ? await s.loadGroups() : await s.reloadGroup();
        });
    }
  }

  /// Bola yoki telefoni yo'q a'zo
  Future<void> _addChild(Session s) async {
    final r = await showModalBottomSheet<Json>(context: context, isScrollControlled: true, builder: (_) => const _ChildForm());
    if (r == null || !mounted) return;
    await guard(context, () async {
      await s.api.post('/groups/${s.groupId}/managed-members', r);
      await s.reloadGroup();
    });
  }

  Future<void> _editChild(Session s, Json m) async {
    final r = await showModalBottomSheet<Json>(
      context: context,
      isScrollControlled: true,
      builder: (_) => _ChildForm(name: m['name'], editing: true),
    );
    if (r == null || !mounted) return;
    r.remove('name');
    await guard(context, () => s.api.put('/groups/${s.groupId}/managed-members/${m['userId']}/profile', r));
  }

  @override
  Widget build(BuildContext context) {
    final s = context.watch<Session>();
    final g = s.group;
    if (g == null) return const SafeArea(child: NoGroup());
    final members = s.members;
    void open(Widget w) => Navigator.of(context).push(route(w));

    Widget link(IconData icon, String title, Widget page) => ListTile(
      leading: Icon(icon, color: C.terracotta),
      title: Text(title, style: sans(15, weight: FontWeight.w700)),
      trailing: const Icon(Icons.chevron_right_rounded, color: C.muted),
      onTap: () => open(page),
    );

    return SafeArea(
      child: RefreshIndicator(
        onRefresh: s.reloadGroup,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
          children: [
            Row(
              children: [
                Avatar(name: g['name'], id: g['id'], size: 52, color: C.olive),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(g['name'], style: serif(26)),
                      Text(t('{n} a’zo', {'n': members.length}), style: sans(13, color: C.muted)),
                    ],
                  ),
                ),
                GroupSwitcherButton(),
              ],
            ),
            const SizedBox(height: 20),
            Text(t('Guruh turi'), style: sans(13, weight: FontWeight.w700)),
            const SizedBox(height: 8),
            Row(
              children: [
                for (final k in ['family', 'students', 'team']) ...[
                  if (k != 'family') const SizedBox(width: 8),
                  ChoicePill(
                    label: groupTypeName(k),
                    selected: g['type'] == k,
                    expand: true,
                    height: 44,
                    onTap: s.isAdmin && g['type'] != k ? () => _setType(s, k) : () {},
                  ),
                ],
              ],
            ),
            const SizedBox(height: 8),
            Text(
              g['splitMode'] == 'shared_pot'
                  ? t('Xarajat: umumiy qozon — ulushlarga bo‘linmaydi.')
                  : t('Xarajat: kim qancha ovqatlangan bo‘lsa, shuncha to‘laydi.'),
              style: sans(13, color: C.muted, height: 1.4),
            ),
            const SizedBox(height: 20),
            SectionTitle(
              t('A’zolar'),
              trailing: TextButton.icon(
                onPressed: () => _addChild(s),
                icon: const Icon(Icons.child_care_rounded, size: 18),
                label: Text(t('Bola qo‘shish'), style: sans(13, weight: FontWeight.w700)),
              ),
            ),
            const SizedBox(height: 8),
            CardList(
              children: [
                for (final m in members)
                  InkWell(
                    onTap: () => _memberMenu(s, m),
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                      child: Row(
                        children: [
                          Avatar(name: m['name'], id: m['userId']),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Text(
                              m['userId'] == s.userId ? '${m['name']} (${t('siz')})' : m['name'],
                              style: sans(15, weight: FontWeight.w700),
                            ),
                          ),
                          if (m['role'] == 'admin') Pill(t('Admin'), bg: C.terracottaSoft, fg: C.terracottaDark),
                          if (m['managedBy'] != null) Pill(t('Bola'), bg: C.mustardSoft, fg: C.mustardInk),
                        ],
                      ),
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 12),
            AppCard(
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(t('Taklif kodi'), style: sans(12, color: C.muted)),
                        Text(g['inviteCode'], style: sans(22, weight: FontWeight.w800).copyWith(letterSpacing: 2)),
                      ],
                    ),
                  ),
                  FilledButton.icon(
                    style: FilledButton.styleFrom(backgroundColor: C.terracotta, shape: const StadiumBorder()),
                    onPressed: () async {
                      await Clipboard.setData(
                        ClipboardData(
                          text: t('Taomdosh’da “{name}” guruhiga qo‘shiling. Taklif kodi: {code}', {
                            'name': g['name'],
                            'code': g['inviteCode'],
                          }),
                        ),
                      );
                      if (context.mounted) showSnack(context, t('Taklif matni nusxalandi — Telegram’da yuboring'));
                    },
                    icon: const Icon(Icons.copy_rounded, size: 18),
                    label: Text(t('Nusxalash')),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 12),
            CardList(
              children: [
                link(Icons.event_repeat_rounded, t('Navbatchilik'), const DutyScreen()),
                link(Icons.shopping_basket_outlined, t('Xarid ro‘yxati'), const ShoppingScreen()),
                link(Icons.payments_outlined, t('Xarajatlar'), const ExpensesScreen()),
                link(Icons.kitchen_outlined, t('Zaxira'), const PantryScreen()),
                if (s.isAdmin) link(Icons.schedule_rounded, t('Ovqat vaqtlari'), const MealSettingsScreen()),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

/// "Do'stlar uyi · 4 kishi ⌄" — guruhni almashtirish
class GroupSwitcherPill extends StatelessWidget {
  const GroupSwitcherPill({super.key, this.onChanged});
  final VoidCallback? onChanged;

  @override
  Widget build(BuildContext context) {
    final s = context.watch<Session>();
    final g = s.group;
    if (g == null) return const SizedBox.shrink();
    return Material(
      color: C.lineSoft,
      shape: const StadiumBorder(),
      child: InkWell(
        customBorder: const StadiumBorder(),
        onTap: () => showGroupSwitcher(context, onChanged),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(6, 5, 12, 5),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Avatar(name: g['name'], id: g['id'], size: 26, color: C.olive),
              const SizedBox(width: 8),
              Flexible(
                child: Text(
                  t('{name} · {n} kishi', {'name': g['name'], 'n': s.members.length}),
                  style: sans(13, weight: FontWeight.w700),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              const Icon(Icons.expand_more_rounded, size: 18),
            ],
          ),
        ),
      ),
    );
  }
}

class GroupSwitcherButton extends StatelessWidget {
  const GroupSwitcherButton({super.key});

  @override
  Widget build(BuildContext context) =>
      CircleBtn(icon: Icons.swap_horiz_rounded, tooltip: t('Guruhni almashtirish'), onTap: () => showGroupSwitcher(context, null));
}

Future<void> showGroupSwitcher(BuildContext context, VoidCallback? onChanged) async {
  final s = context.read<Session>();
  final r = await showModalBottomSheet<String>(
    context: context,
    builder: (ctx) => SafeArea(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Padding(
            padding: const EdgeInsets.all(16),
            child: Text(t('Guruhlarim'), style: serif(22)),
          ),
          for (final g in s.groups)
            ListTile(
              leading: Avatar(name: g['name'], id: g['id'], size: 36, color: C.olive),
              title: Text(g['name'], style: sans(15, weight: FontWeight.w700)),
              subtitle: Text(groupTypeName(g['type']), style: sans(12, color: C.muted)),
              trailing: g['id'] == s.groupId ? const Icon(Icons.check_rounded, color: C.terracotta) : null,
              onTap: () => Navigator.pop(ctx, g['id'] as String),
            ),
          const Divider(),
          ListTile(leading: const Icon(Icons.add_rounded), title: Text(t('Yangi guruh')), onTap: () => Navigator.pop(ctx, '+create')),
          ListTile(
            leading: const Icon(Icons.vpn_key_outlined),
            title: Text(t('Taklif kodi bilan qo‘shilish')),
            onTap: () => Navigator.pop(ctx, '+join'),
          ),
        ],
      ),
    ),
  );
  if (r == null || !context.mounted) return;
  final bool ok;
  if (r == '+create') {
    ok = await showCreateGroup(context);
  } else if (r == '+join') {
    ok = await showJoinGroup(context);
  } else {
    ok = await guard(context, () => s.selectGroup(r));
  }
  if (ok) onChanged?.call();
}

/// Bola qo'shish / profilini tahrirlash shakli
class _ChildForm extends StatefulWidget {
  const _ChildForm({this.name, this.editing = false});
  final String? name;
  final bool editing;

  @override
  State<_ChildForm> createState() => _ChildFormState();
}

class _ChildFormState extends State<_ChildForm> {
  late final _name = TextEditingController(text: widget.name);
  final _age = TextEditingController();
  final _height = TextEditingController();
  final _weight = TextEditingController();
  String? _sex;

  @override
  Widget build(BuildContext context) => Padding(
    padding: EdgeInsets.fromLTRB(20, 20, 20, 20 + MediaQuery.of(context).viewInsets.bottom),
    child: Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(widget.editing ? t('{name} profili', {'name': widget.name}) : t('Bola qo‘shish'), style: serif(22)),
        const SizedBox(height: 6),
        Text(
          t('Telefoni yo‘q a’zo: uning qatnashuvini siz belgilaysiz, xarajat ulushi sizga yoziladi.'),
          style: sans(13, color: C.muted, height: 1.4),
        ),
        const SizedBox(height: 14),
        if (!widget.editing) ...[
          TextField(
            controller: _name,
            style: sans(16),
            decoration: InputDecoration(hintText: t('Ismi')),
          ),
          const SizedBox(height: 10),
        ],
        Segmented<String?>(items: {'male': t('O‘g‘il'), 'female': t('Qiz')}, value: _sex, onChanged: (v) => setState(() => _sex = v)),
        const SizedBox(height: 10),
        Row(
          children: [
            Expanded(
              child: TextField(
                controller: _age,
                keyboardType: TextInputType.number,
                decoration: InputDecoration(hintText: t('Yosh')),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: TextField(
                controller: _height,
                keyboardType: TextInputType.number,
                decoration: InputDecoration(hintText: t('Bo‘y, sm')),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: TextField(
                controller: _weight,
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                decoration: InputDecoration(hintText: t('Vazn, kg')),
              ),
            ),
          ],
        ),
        const SizedBox(height: 16),
        PrimaryButton(
          label: t('Saqlash'),
          onPressed: () {
            if (!widget.editing && _name.text.trim().isEmpty) return;
            final now = DateTime.now();
            final age = int.tryParse(_age.text);
            Navigator.pop(context, <String, Object>{
              'name': _name.text.trim(),
              'sex': ?_sex,
              if (age != null)
                'birthDate': '${now.year - age}-${now.month.toString().padLeft(2, '0')}-${now.day.toString().padLeft(2, '0')}',
              if (int.tryParse(_height.text) != null) 'heightCm': int.parse(_height.text),
              if (double.tryParse(_weight.text.replaceAll(',', '.')) != null) 'weightKg': double.parse(_weight.text.replaceAll(',', '.')),
            });
          },
        ),
      ],
    ),
  );
}

/// Mahal vaqtlari va ulushlari (admin)
class MealSettingsScreen extends StatefulWidget {
  const MealSettingsScreen({super.key});

  @override
  State<MealSettingsScreen> createState() => _MealSettingsScreenState();
}

class _MealSettingsScreenState extends State<MealSettingsScreen> {
  late final List<Json> _items =
      (((context.read<Session>().group?['mealSettings'] as List?) ?? []).cast<Json>()).map((e) => Map<String, dynamic>.of(e)).toList()
        ..sort((a, b) => mealOrder.indexOf(a['mealType']).compareTo(mealOrder.indexOf(b['mealType'])));
  bool _busy = false;

  Future<void> _save() async {
    final s = context.read<Session>();
    setState(() => _busy = true);
    final ok = await guard(context, () async {
      await s.api.put('/groups/${s.groupId}/meal-settings', {
        'items': _items
            .map((e) => {'mealType': e['mealType'], 'share': e['share'], 'defaultTime': e['defaultTime'], 'enabled': e['enabled']})
            .toList(),
      });
      await s.reloadGroup();
    });
    if (!mounted) return;
    setState(() => _busy = false);
    if (ok) Navigator.pop(context);
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    body: SafeArea(
      child: Column(
        children: [
          Expanded(
            child: ListView(
              padding: const EdgeInsets.fromLTRB(20, 16, 20, 16),
              children: [
                ScreenHeader(title: t('Ovqat vaqtlari')),
                const SizedBox(height: 8),
                Text(
                  t(
                    'Cookbookda vaqt ko‘rsatilmagan mahallar shu vaqtda bo‘ladi. Ulush — kunlik kaloriyaning qancha qismi shu mahalga to‘g‘ri keladi.',
                  ),
                  style: sans(13, color: C.muted, height: 1.45),
                ),
                const SizedBox(height: 16),
                for (final e in _items)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: AppCard(
                      child: Column(
                        children: [
                          Row(
                            children: [
                              Expanded(
                                child: Text(mealTypeName(e['mealType']), style: sans(15, weight: FontWeight.w800)),
                              ),
                              Switch(
                                value: e['enabled'] == true,
                                activeTrackColor: C.olive,
                                onChanged: (v) => setState(() => e['enabled'] = v),
                              ),
                            ],
                          ),
                          Row(
                            children: [
                              TextButton.icon(
                                icon: const Icon(Icons.schedule_rounded, size: 18),
                                label: Text(e['defaultTime'], style: sans(15, weight: FontWeight.w700)),
                                onPressed: () async {
                                  final p = (e['defaultTime'] as String).split(':').map(int.parse).toList();
                                  final r = await showTimePicker(
                                    context: context,
                                    initialTime: TimeOfDay(hour: p[0], minute: p[1]),
                                  );
                                  if (r != null) {
                                    setState(
                                      () =>
                                          e['defaultTime'] = '${r.hour.toString().padLeft(2, '0')}:${r.minute.toString().padLeft(2, '0')}',
                                    );
                                  }
                                },
                              ),
                              Expanded(
                                child: Slider(
                                  value: (e['share'] as num).toDouble(),
                                  min: 0.05,
                                  max: 0.6,
                                  divisions: 11,
                                  activeColor: C.terracotta,
                                  label: '${((e['share'] as num) * 100).round()}%',
                                  onChanged: (v) => setState(() => e['share'] = double.parse(v.toStringAsFixed(2))),
                                ),
                              ),
                              Text('${((e['share'] as num) * 100).round()}%', style: sans(13, weight: FontWeight.w700)),
                            ],
                          ),
                        ],
                      ),
                    ),
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
