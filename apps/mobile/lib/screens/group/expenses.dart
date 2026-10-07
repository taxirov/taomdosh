import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../api/api_client.dart';
import '../../format.dart';
import '../../i18n/strings.dart';
import '../../state/session.dart';
import '../../theme.dart';
import '../../widgets/common.dart';
import 'add_expense.dart';

/// Xarajatlar: jami, mening holatim, kim kimga to'laydi (soddalashtirilgan), oxirgi xarajatlar
class ExpensesScreen extends StatelessWidget {
  const ExpensesScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final s = context.read<Session>();
    return Scaffold(
      body: SafeArea(
        child: Loader<(Json, List<Json>)>(
          load: () async {
            final r = await Future.wait([s.api.get('/groups/${s.groupId}/balances'), s.api.get('/groups/${s.groupId}/expenses')]);
            return (r[0] as Json, (r[1] as List).cast<Json>());
          },
          builder: (context, d, reload) => _Body(balances: d.$1, expenses: d.$2, reload: reload),
        ),
      ),
    );
  }
}

class _Body extends StatelessWidget {
  const _Body({required this.balances, required this.expenses, required this.reload});
  final Json balances;
  final List<Json> expenses;
  final Future<void> Function() reload;

  Future<void> _settle(BuildContext context, Session s, Json tr) async {
    final ok = await confirm(
      context,
      t('{from} → {to}: {sum} to‘langanini tasdiqlaysizmi?', {
        'from': tr['fromName'],
        'to': tr['toName'],
        'sum': money(tr['amount'] as num),
      }),
      ok: t('To‘landi'),
    );
    if (!ok || !context.mounted) return;
    await guard(
      context,
      () => s.api.post('/groups/${s.groupId}/settlements', {'fromUser': tr['from'], 'toUser': tr['to'], 'amount': tr['amount']}),
    );
    await reload();
  }

  Future<void> _delete(BuildContext context, Session s, Json e) async {
    if (!await confirm(context, t('Xarajat o‘chirilsinmi?'), ok: t('O‘chirish')) || !context.mounted) return;
    await guard(context, () => s.api.delete('/groups/${s.groupId}/expenses/${e['id']}'));
    await reload();
  }

  @override
  Widget build(BuildContext context) {
    final s = context.watch<Session>();
    final shared = balances['splitMode'] == 'shared_pot';
    final mine = ((balances['balances'] as List).cast<Json>()).where((b) => b['userId'] == s.userId).firstOrNull;
    final my = (mine?['balance'] as num?) ?? 0;
    final transfers = (balances['transfers'] as List).cast<Json>();

    return RefreshIndicator(
      onRefresh: reload,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
        children: [
          ScreenHeader(
            title: t('Xarajatlar'),
            trailing: CircleBtn(
              icon: Icons.add_rounded,
              filled: true,
              tooltip: t('Xarajat qo‘shish'),
              onTap: () => Navigator.of(context).push(route(const AddExpenseScreen())).then((_) => reload()),
            ),
          ),
          const SizedBox(height: 16),
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(color: C.ink, borderRadius: BorderRadius.circular(20)),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  t('Jami sarflandi'),
                  style: sans(12, weight: FontWeight.w600, color: C.border),
                ),
                Text(money(balances['totalSpent'] as num), style: serif(28, color: const Color(0xFFFFF4E8))),
              ],
            ),
          ),
          const SizedBox(height: 10),
          if (!shared)
            AppCard(
              child: Row(
                children: [
                  Expanded(
                    child: Text(t('Sizning holatingiz'), style: sans(14, weight: FontWeight.w700)),
                  ),
                  Text(
                    my == 0
                        ? t('Hisob teng')
                        : (my > 0 ? t('+{sum} sizga qaytadi', {'sum': money(my)}) : t('{sum} to‘lashingiz kerak', {'sum': money(-my)})),
                    style: sans(14, weight: FontWeight.w800, color: my > 0 ? C.olive : (my < 0 ? C.terracottaDark : C.muted)),
                  ),
                ],
              ),
            )
          else
            InfoBanner(text: t('Oilada umumiy qozon — xarajatlar yoziladi, lekin qarzlar hisoblanmaydi.')),
          if (!shared) ...[
            const SizedBox(height: 20),
            SectionTitle(t('Kim kimga to‘laydi')),
            const SizedBox(height: 10),
            if (transfers.isEmpty)
              AppCard(
                child: Text(t('Hamma hisob-kitob teng'), style: sans(14, color: C.muted)),
              )
            else
              CardList(
                children: [
                  for (final tr in transfers)
                    Padding(
                      padding: const EdgeInsets.fromLTRB(14, 8, 8, 8),
                      child: Row(
                        children: [
                          Expanded(
                            child: Text.rich(
                              TextSpan(
                                style: sans(14),
                                children: [
                                  TextSpan(
                                    text: tr['from'] == s.userId ? t('Siz') : tr['fromName'],
                                    style: sans(14, weight: FontWeight.w800),
                                  ),
                                  const TextSpan(text: '  →  '),
                                  TextSpan(
                                    text: tr['to'] == s.userId ? t('Siz') : tr['toName'],
                                    style: sans(14, weight: FontWeight.w800),
                                  ),
                                ],
                              ),
                            ),
                          ),
                          Text(groupDigits(tr['amount'] as num), style: sans(15, weight: FontWeight.w800)),
                          if (tr['from'] == s.userId || tr['to'] == s.userId)
                            TextButton(
                              onPressed: () => _settle(context, s, tr),
                              child: Text(t('To‘landi'), style: sans(13, weight: FontWeight.w700)),
                            )
                          else
                            const SizedBox(width: 12),
                        ],
                      ),
                    ),
                ],
              ),
            const SizedBox(height: 6),
            Text(
              t('Qarzlar minimal o‘tkazmalarga soddalashtirilgan. To‘lovni oluvchi yoki beruvchi tasdiqlaydi.'),
              style: sans(12, color: C.muted, height: 1.45),
            ),
          ],
          const SizedBox(height: 20),
          SectionTitle(t('Oxirgi xarajatlar')),
          const SizedBox(height: 10),
          if (expenses.isEmpty)
            EmptyView(text: t('Hali xarajat kiritilmagan'))
          else
            CardList(
              children: [
                for (final e in expenses.take(30))
                  InkWell(
                    onLongPress: () => _delete(context, s, e),
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                      child: Row(
                        children: [
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  e['note'] ?? t('Xarajat'),
                                  style: sans(14, weight: FontWeight.w700),
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                ),
                                Text(
                                  '${e['paidBy'] == s.userId ? t('Siz') : e['paidByName']} · ${shortDate(parseTime(e['spentAt']))}',
                                  style: sans(12, color: C.muted),
                                ),
                              ],
                            ),
                          ),
                          Text(groupDigits(e['amount'] as num), style: sans(15, weight: FontWeight.w800)),
                        ],
                      ),
                    ),
                  ),
              ],
            ),
          if (expenses.isNotEmpty) ...[
            const SizedBox(height: 6),
            Text(t('O‘chirish uchun xarajatni bosib turing.'), style: sans(12, color: C.muted)),
          ],
        ],
      ),
    );
  }
}
