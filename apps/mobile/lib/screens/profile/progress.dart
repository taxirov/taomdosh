import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../../api/api_client.dart';
import '../../format.dart';
import '../../i18n/strings.dart';
import '../../state/session.dart';
import '../../theme.dart';
import '../../widgets/common.dart';

/// Vazn va bo'y: grafik, TVI, yangi o'lchov, tarix
class ProgressScreen extends StatelessWidget {
  const ProgressScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final s = context.read<Session>();
    return Scaffold(
      body: SafeArea(
        child: Loader<List<Json>>(
          load: () async => ((await s.api.get('/me/measurements')) as List).cast<Json>(),
          builder: (context, list, reload) => _Body(list: list, reload: reload),
        ),
      ),
    );
  }
}

class _Body extends StatefulWidget {
  const _Body({required this.list, required this.reload});
  final List<Json> list;
  final Future<void> Function() reload;

  @override
  State<_Body> createState() => _BodyState();
}

class _BodyState extends State<_Body> {
  String _period = 'month';
  final _w = TextEditingController();
  final _h = TextEditingController();
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    final p = (context.read<Session>().me?['profile'] as Json?) ?? {};
    if (p['weightKg'] != null) _w.text = dec(p['weightKg'] as num);
    if (p['heightCm'] != null) _h.text = '${p['heightCm']}';
  }

  Future<void> _save() async {
    final s = context.read<Session>();
    final w = double.tryParse(_w.text.replaceAll(',', '.'));
    final h = int.tryParse(_h.text);
    if (w == null && h == null) return;
    setState(() => _busy = true);
    final ok = await guard(context, () => s.saveProfile({'weightKg': ?w, 'heightCm': ?h}));
    if (!mounted) return;
    setState(() => _busy = false);
    if (ok) {
      showSnack(context, t('Saqlandi — kunlik kaloriya va porsiyangiz qayta hisoblandi'));
      await widget.reload();
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = context.watch<Session>();
    final p = (s.me?['profile'] as Json?) ?? {};
    final weights = widget.list.where((m) => m['weightKg'] != null).toList()
      ..sort((a, b) => parseTime(a['measuredAt']).compareTo(parseTime(b['measuredAt'])));
    final since = DateTime.now().subtract(
      Duration(
        days: switch (_period) {
          'week' => 7,
          'month' => 31,
          _ => 366,
        },
      ),
    );
    final points = weights.where((m) => parseTime(m['measuredAt']).isAfter(since)).toList();
    final current = (p['weightKg'] as num?) ?? (weights.isEmpty ? null : weights.last['weightKg'] as num);
    final height = p['heightCm'] as num?;
    final bmi = current != null && height != null ? current / ((height / 100) * (height / 100)) : null;
    final delta = points.length >= 2 ? (points.last['weightKg'] as num) - (points.first['weightKg'] as num) : null;

    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
      children: [
        ScreenHeader(title: t('Vazn va bo‘y')),
        const SizedBox(height: 16),
        Segmented<String>(
          items: {'week': t('Hafta'), 'month': t('Oy'), 'year': t('Yil')},
          value: _period,
          onChanged: (v) => setState(() => _period = v),
        ),
        const SizedBox(height: 12),
        AppCard(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(t('Hozirgi vazn'), style: sans(13, color: C.muted)),
              Text(current == null ? '—' : '${dec(current)} kg', style: serif(32)),
              if (delta != null)
                Text(
                  '${delta > 0 ? '+' : (delta < 0 ? '−' : '')}${dec(delta.abs())} kg',
                  style: sans(13, weight: FontWeight.w700, color: delta <= 0 ? C.olive : C.terracottaDark),
                ),
              const SizedBox(height: 12),
              SizedBox(
                height: 160,
                child: points.length < 2
                    ? Center(
                        child: Text(t('Grafik uchun kamida 2 ta o‘lchov kerak'), style: sans(13, color: C.muted)),
                      )
                    : CustomPaint(
                        painter: _ChartPainter(points.map((m) => (m['weightKg'] as num).toDouble()).toList()),
                        size: Size.infinite,
                      ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 10),
        Row(
          children: [
            Expanded(child: _stat(t('Bo‘y'), height == null ? '—' : '$height sm')),
            const SizedBox(width: 10),
            Expanded(child: _stat(t('TVI'), bmi == null ? '—' : dec(bmi))),
          ],
        ),
        const SizedBox(height: 20),
        SectionTitle(t('Yangi o‘lchov')),
        const SizedBox(height: 10),
        AppCard(
          child: Column(
            children: [
              Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _w,
                      keyboardType: const TextInputType.numberWithOptions(decimal: true),
                      inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[\d.,]'))],
                      decoration: InputDecoration(labelText: t('Vazn, kg')),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: TextField(
                      controller: _h,
                      keyboardType: TextInputType.number,
                      inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                      decoration: InputDecoration(labelText: t('Bo‘y, sm')),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              Text(
                t('Yangi vazn kiritilsa, kunlik kaloriya va porsiyangiz avtomatik qayta hisoblanadi.'),
                style: sans(12, color: C.muted, height: 1.4),
              ),
              const SizedBox(height: 12),
              PrimaryButton(label: t('Saqlash'), loading: _busy, onPressed: _save, height: 48),
            ],
          ),
        ),
        const SizedBox(height: 20),
        SectionTitle(t('Tarix')),
        const SizedBox(height: 10),
        if (widget.list.isEmpty)
          EmptyView(text: t('Hali o‘lchov yo‘q'))
        else
          CardList(
            children: [
              for (final (i, m) in widget.list.take(30).indexed)
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                  child: Row(
                    children: [
                      Expanded(
                        child: Text(longDate(parseTime(m['measuredAt'])), style: sans(14, weight: FontWeight.w600)),
                      ),
                      if (m['weightKg'] != null) Text('${dec(m['weightKg'] as num)} kg', style: sans(14, weight: FontWeight.w800)),
                      if (m['weightKg'] != null && i + 1 < widget.list.length && widget.list[i + 1]['weightKg'] != null) ...[
                        const SizedBox(width: 8),
                        Builder(
                          builder: (_) {
                            final d = (m['weightKg'] as num) - (widget.list[i + 1]['weightKg'] as num);
                            return Text(
                              d == 0 ? '0' : '${d > 0 ? '+' : '−'}${dec(d.abs())}',
                              style: sans(12, weight: FontWeight.w700, color: d <= 0 ? C.olive : C.terracottaDark),
                            );
                          },
                        ),
                      ],
                    ],
                  ),
                ),
            ],
          ),
      ],
    );
  }

  Widget _stat(String label, String value) => AppCard(
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: sans(12, color: C.muted)),
        Text(value, style: sans(18, weight: FontWeight.w800)),
      ],
    ),
  );
}

class _ChartPainter extends CustomPainter {
  _ChartPainter(this.values);
  final List<double> values;

  @override
  void paint(Canvas canvas, Size size) {
    final max = values.reduce((a, b) => a > b ? a : b);
    final min = values.reduce((a, b) => a < b ? a : b);
    final span = (max - min) == 0 ? 1 : max - min;
    final pts = [
      for (var i = 0; i < values.length; i++)
        Offset(8 + i * (size.width - 16) / (values.length - 1), 12 + (max - values[i]) / span * (size.height - 24)),
    ];
    final area = Path()..moveTo(pts.first.dx, size.height);
    for (final p in pts) {
      area.lineTo(p.dx, p.dy);
    }
    area
      ..lineTo(pts.last.dx, size.height)
      ..close();
    canvas.drawPath(area, Paint()..color = C.terracotta.withValues(alpha: .12));
    final line = Path()..moveTo(pts.first.dx, pts.first.dy);
    for (final p in pts.skip(1)) {
      line.lineTo(p.dx, p.dy);
    }
    canvas.drawPath(
      line,
      Paint()
        ..color = C.terracotta
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2.5
        ..strokeJoin = StrokeJoin.round,
    );
    for (final p in pts) {
      canvas.drawCircle(p, 4, Paint()..color = C.card);
      canvas.drawCircle(
        p,
        4,
        Paint()
          ..color = C.terracotta
          ..style = PaintingStyle.stroke
          ..strokeWidth = 2,
      );
    }
  }

  @override
  bool shouldRepaint(_ChartPainter old) => old.values != values;
}
