import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../api/api_client.dart';
import '../../format.dart';
import '../../i18n/strings.dart';
import '../../state/session.dart';
import '../../theme.dart';
import '../../widgets/common.dart';

/// Haftalik reja uchun taxminiy xarajat: guruh va bir kishi hisobiga.
/// Joriy (yoki eng yaqin kelgusi) faol reja olinadi; reja yoki narx bo'lmasa — hech narsa ko'rsatilmaydi.
class PlanCostCard extends StatefulWidget {
  const PlanCostCard({super.key});

  @override
  State<PlanCostCard> createState() => _PlanCostCardState();
}

class _PlanCostCardState extends State<PlanCostCard> {
  Json? _est;
  bool _stale = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final s = context.read<Session>();
    try {
      final plans = ((await s.api.get('/groups/${s.groupId}/plans')) as List).cast<Json>().where((p) => p['status'] == 'active').toList();
      if (plans.isEmpty) return;
      final thisWeek = ymd(mondayOf(DateTime.now()));
      // Joriy hafta rejasi, bo'lmasa eng yaqin kelgusi, bo'lmasa oxirgisi (ro'yxat yangidan eskiga)
      final current = plans.where((p) => p['weekStart'] == thisWeek);
      final future = plans.where((p) => (p['weekStart'] as String).compareTo(thisWeek) > 0);
      final plan = current.isNotEmpty ? current.first : (future.isNotEmpty ? future.last : plans.first);
      final est = await s.api.get('/groups/${s.groupId}/plans/${plan['id']}/estimate') as Json;
      if (mounted) {
        setState(() {
          _est = est;
          _stale = s.api.lastFromCache;
        });
      }
    } catch (_) {
      // Taxminiy ma'lumot — xatoda kartochka shunchaki ko'rinmaydi
    }
  }

  @override
  Widget build(BuildContext context) {
    final e = _est;
    if (e == null || (e['total'] as num) <= 0) return const SizedBox.shrink();
    final from = parseYmd(e['weekStart'] as String);
    final to = from.add(const Duration(days: 6));
    final missing = (e['itemsCount'] as num) - (e['pricedCount'] as num);
    final note = [
      e['asOf'] == null ? t('taxminiy') : t('taxminiy, {date} holatida', {'date': ddmm(parseYmd(e['asOf'] as String))}),
      if (missing > 0) t('{n} ta mahsulot narxsiz', {'n': missing}),
    ].join(' · ');

    Widget stat(String label, num sum) => Expanded(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: sans(12, color: C.muted)),
          const SizedBox(height: 2),
          FittedBox(
            fit: BoxFit.scaleDown,
            alignment: Alignment.centerLeft,
            child: Text('~${money(sum)}', style: sans(17, weight: FontWeight.w800)),
          ),
        ],
      ),
    );

    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: AppCard(
        padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(t('Haftalik reja xarajati'), style: sans(14, weight: FontWeight.w700)),
                ),
                Text('${shortDate(from)} – ${shortDate(to)}', style: sans(12, color: C.muted)),
              ],
            ),
            const SizedBox(height: 10),
            Row(
              children: [stat(t('Guruhga'), e['total'] as num), const SizedBox(width: 12), stat(t('Bir kishiga'), e['perPerson'] as num)],
            ),
            const SizedBox(height: 8),
            Text(note, style: sans(12, color: C.muted)),
            if (_stale) ...[const SizedBox(height: 8), const OfflineBadge()],
          ],
        ),
      ),
    );
  }
}
