import 'package:flutter/material.dart';

import '../api/api_client.dart';
import '../format.dart';
import '../i18n/strings.dart';
import '../theme.dart';

/// Taomdosh belgisi: dasturxon atrofida to'rt kishi
class LogoMark extends StatelessWidget {
  const LogoMark({super.key, this.size = 30, this.plate = C.cream, this.center = C.mustard});
  final double size;
  final Color plate;
  final Color center;

  @override
  Widget build(BuildContext context) => CustomPaint(
    size: Size.square(size),
    painter: _LogoPainter(plate, center),
    child: SizedBox.square(dimension: size),
  );
}

class _LogoPainter extends CustomPainter {
  _LogoPainter(this.plate, this.center);
  final Color plate;
  final Color center;

  @override
  void paint(Canvas canvas, Size size) {
    final k = size.width / 200;
    final p = Paint()..color = plate;
    canvas.drawCircle(Offset(100 * k, 100 * k), 44 * k, p);
    canvas.drawCircle(Offset(100 * k, 100 * k), 25 * k, Paint()..color = center);
    for (final o in const [Offset(100, 36), Offset(164, 100), Offset(100, 164), Offset(36, 100)]) {
      canvas.drawCircle(o * k, 13 * k, p);
    }
  }

  @override
  bool shouldRepaint(_LogoPainter old) => old.plate != plate || old.center != center;
}

class Wordmark extends StatelessWidget {
  const Wordmark({super.key, this.size = 22});
  final double size;

  @override
  Widget build(BuildContext context) => Text.rich(
    TextSpan(
      children: [
        TextSpan(
          text: 'taom',
          style: serif(size, color: C.cream),
        ),
        TextSpan(
          text: 'dosh',
          style: serif(size, color: C.mustardLight),
        ),
      ],
    ),
  );
}

/// 44 px dumaloq tugma (orqaga, yopish, qo'shish)
class CircleBtn extends StatelessWidget {
  const CircleBtn({super.key, required this.icon, required this.onTap, this.tooltip, this.filled = false, this.iconColor});
  final Color? iconColor;
  final IconData icon;
  final VoidCallback? onTap;
  final String? tooltip;
  final bool filled;

  @override
  Widget build(BuildContext context) {
    final btn = Material(
      color: filled ? C.terracotta : C.card,
      shape: CircleBorder(side: filled ? BorderSide.none : const BorderSide(color: C.line)),
      child: InkWell(
        customBorder: const CircleBorder(),
        onTap: onTap,
        child: SizedBox.square(dimension: 44, child: Icon(icon, size: 22, color: iconColor ?? (filled ? Colors.white : C.ink))),
      ),
    );
    return tooltip == null
        ? btn
        : Tooltip(
            message: tooltip!,
            child: Semantics(button: true, label: tooltip, child: btn),
          );
  }
}

class BackBtn extends StatelessWidget {
  const BackBtn({super.key, this.close = false});
  final bool close;

  @override
  Widget build(BuildContext context) => CircleBtn(
    icon: close ? Icons.close_rounded : Icons.chevron_left_rounded,
    tooltip: close ? t('Yopish') : t('Orqaga'),
    onTap: () => Navigator.of(context).maybePop(),
  );
}

class PrimaryButton extends StatelessWidget {
  const PrimaryButton({super.key, required this.label, this.onPressed, this.loading = false, this.color = C.terracotta, this.height = 54});
  final String label;
  final VoidCallback? onPressed;
  final bool loading;
  final Color color;
  final double height;

  @override
  Widget build(BuildContext context) => SizedBox(
    height: height,
    width: double.infinity,
    child: FilledButton(
      style: FilledButton.styleFrom(
        backgroundColor: color,
        disabledBackgroundColor: color.withValues(alpha: .45),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        textStyle: sans(16, weight: FontWeight.w700),
      ),
      onPressed: loading ? null : onPressed,
      child: loading
          ? const SizedBox.square(dimension: 22, child: CircularProgressIndicator(strokeWidth: 2.5, color: Colors.white))
          : Text(label),
    ),
  );
}

class SecondaryButton extends StatelessWidget {
  const SecondaryButton({super.key, required this.label, this.onPressed, this.height = 54, this.color = C.ink});
  final String label;
  final VoidCallback? onPressed;
  final double height;
  final Color color;

  @override
  Widget build(BuildContext context) => SizedBox(
    height: height,
    width: double.infinity,
    child: OutlinedButton(
      style: OutlinedButton.styleFrom(
        foregroundColor: color,
        padding: const EdgeInsets.symmetric(horizontal: 12),
        side: BorderSide(color: color == C.ink ? C.border : color, width: 1.5),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        textStyle: sans(15, weight: FontWeight.w700),
      ),
      onPressed: onPressed,
      child: Text(label),
    ),
  );
}

/// Krem kartochka: oq fon, ingichka chegara
class AppCard extends StatelessWidget {
  const AppCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(14),
    this.onTap,
    this.radius = 18,
    this.borderColor = C.line,
    this.borderWidth = 1,
    this.color = C.card,
  });
  final Widget child;
  final EdgeInsets padding;
  final VoidCallback? onTap;
  final double radius;
  final Color borderColor;
  final double borderWidth;
  final Color color;

  @override
  Widget build(BuildContext context) => Material(
    color: color,
    shape: RoundedRectangleBorder(
      borderRadius: BorderRadius.circular(radius),
      side: BorderSide(color: borderColor, width: borderWidth),
    ),
    clipBehavior: Clip.antiAlias,
    child: InkWell(
      onTap: onTap,
      child: Padding(padding: padding, child: child),
    ),
  );
}

/// Kartochka ichida ajratgich chiziqli qatorlar
class CardList extends StatelessWidget {
  const CardList({super.key, required this.children, this.radius = 18});
  final List<Widget> children;
  final double radius;

  @override
  Widget build(BuildContext context) => AppCard(
    padding: EdgeInsets.zero,
    radius: radius,
    child: Column(
      children: [
        for (var i = 0; i < children.length; i++) ...[if (i > 0) const Divider(height: 1, thickness: 1, color: C.lineSoft), children[i]],
      ],
    ),
  );
}

class Pill extends StatelessWidget {
  const Pill(this.text, {super.key, this.bg = C.oliveSoft, this.fg = C.olive});
  final String text;
  final Color bg;
  final Color fg;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
    decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(12)),
    child: Text(
      text,
      style: sans(12, weight: FontWeight.w700, color: fg),
    ),
  );
}

/// Tanlanadigan dumaloq chip (filtrlar, til, faollik)
class ChoicePill extends StatelessWidget {
  const ChoicePill({super.key, required this.label, required this.selected, required this.onTap, this.expand = false, this.height = 36});
  final String label;
  final bool selected;
  final VoidCallback onTap;
  final bool expand;
  final double height;

  @override
  Widget build(BuildContext context) {
    final w = Semantics(
      selected: selected,
      button: true,
      child: Material(
        color: selected ? C.ink : Colors.transparent,
        shape: StadiumBorder(side: BorderSide(color: selected ? C.ink : C.border, width: 1.5)),
        child: InkWell(
          customBorder: const StadiumBorder(),
          onTap: onTap,
          child: SizedBox(
            height: height,
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 14),
              // widthFactor: 1 — Wrap/Row ichida matn kengligicha qoladi
              child: Center(
                widthFactor: 1,
                child: Text(
                  label,
                  style: sans(13, weight: selected ? FontWeight.w700 : FontWeight.w600, color: selected ? C.card : C.ink),
                ),
              ),
            ),
          ),
        ),
      ),
    );
    return expand ? Expanded(child: w) : w;
  }
}

/// Qumrang fondagi segment tanlagich (jins, davr)
class Segmented<T> extends StatelessWidget {
  const Segmented({super.key, required this.items, required this.value, required this.onChanged});
  final Map<T, String> items;
  final T value;
  final ValueChanged<T> onChanged;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(4),
    decoration: BoxDecoration(color: C.lineSoft, borderRadius: BorderRadius.circular(14)),
    child: Row(
      children: [
        for (final e in items.entries)
          Expanded(
            child: Semantics(
              selected: e.key == value,
              button: true,
              child: GestureDetector(
                onTap: () => onChanged(e.key),
                child: Container(
                  height: 42,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: e.key == value ? C.card : Colors.transparent,
                    borderRadius: BorderRadius.circular(11),
                    boxShadow: e.key == value ? const [BoxShadow(color: Color(0x1F2B2019), blurRadius: 3, offset: Offset(0, 1))] : null,
                  ),
                  child: Text(
                    e.value,
                    style: sans(14, weight: e.key == value ? FontWeight.w700 : FontWeight.w600, color: e.key == value ? C.ink : C.muted),
                  ),
                ),
              ),
            ),
          ),
      ],
    ),
  );
}

class Avatar extends StatelessWidget {
  const Avatar({super.key, required this.name, required this.id, this.size = 40, this.faded = false, this.color});
  final String name;
  final String id;
  final double size;
  final bool faded;
  final Color? color;

  @override
  Widget build(BuildContext context) => Opacity(
    opacity: faded ? .45 : 1,
    child: Container(
      width: size,
      height: size,
      alignment: Alignment.center,
      decoration: BoxDecoration(color: color ?? C.avatarFor(id), shape: BoxShape.circle),
      child: Text(
        initials(name),
        style: sans(size * .37, weight: FontWeight.w800, color: Colors.white),
      ),
    ),
  );
}

/// Taom rasmi; rasm bo'lmasa — taomga xos rangdagi naqshli zaxira ko'rinish (dasturxon ustidagi lagan)
class DishImage extends StatelessWidget {
  const DishImage({super.key, this.url, this.width, this.height, this.radius = 12, this.seed = ''});
  final String? url;
  final double? width;
  final double? height;
  final double radius;
  final String seed;

  /// (fon, naqsh, ikonka) — dizayndagi iliq ohanglar
  static const _tones = [
    (Color(0xFFD9A47E), Color(0xFFE6BD9E), Color(0xFF7A3E22)),
    (Color(0xFFE3BFA0), Color(0xFFEFD6C0), Color(0xFF8A4B2A)),
    (Color(0xFFEBCDB4), Color(0xFFF5E2D2), Color(0xFF8F5A3A)),
    (Color(0xFFC98B63), Color(0xFFDBA988), Color(0xFF5E2C14)),
    (Color(0xFFC9D3B5), Color(0xFFDDE5CE), Color(0xFF3F5424)),
    (Color(0xFFEBD3A0), Color(0xFFF4E4C2), Color(0xFF7A4B07)),
  ];

  @override
  Widget build(BuildContext context) {
    final tone = _tones[seed.hashCode.abs() % _tones.length];
    final ph = SizedBox(
      width: width,
      height: height,
      child: CustomPaint(
        painter: _DishPlaceholderPainter(tone.$1, tone.$2, seed.hashCode),
        child: LayoutBuilder(
          builder: (context, c) {
            final side = c.biggest.shortestSide.isFinite ? c.biggest.shortestSide : (height ?? 52);
            return Center(
              child: Icon(Icons.restaurant_rounded, color: tone.$3.withValues(alpha: .7), size: (side * .38).clamp(16, 52)),
            );
          },
        ),
      ),
    );
    return ClipRRect(
      borderRadius: BorderRadius.circular(radius),
      child: url == null || url!.isEmpty
          ? ph
          : Image.network(
              mediaUrl(url!),
              width: width,
              height: height,
              fit: BoxFit.cover,
              errorBuilder: (_, _, _) => ph,
              // Rasm yuklanguncha zaxira ko'rinish, keyin yumshoq paydo bo'ladi
              frameBuilder: (context, child, frame, sync) =>
                  sync || frame != null ? child : Stack(fit: StackFit.passthrough, children: [ph]),
            ),
    );
  }
}

/// Zaxira ko'rinish naqshi: burchakdagi "lagan" halqalari va mayda nuqtalar
class _DishPlaceholderPainter extends CustomPainter {
  _DishPlaceholderPainter(this.bg, this.accent, this.seed);
  final Color bg;
  final Color accent;
  final int seed;

  @override
  void paint(Canvas canvas, Size size) {
    canvas.drawRect(Offset.zero & size, Paint()..color = bg);
    final r = size.shortestSide;
    // Lagan: o'ng-past burchakdan chiqib turgan ikki halqa
    final corner = seed.isEven ? Offset(size.width, size.height) : Offset(0, size.height);
    canvas.drawCircle(corner, r * .78, Paint()..color = accent.withValues(alpha: .55));
    canvas.drawCircle(
      corner,
      r * .5,
      Paint()
        ..color = bg.withValues(alpha: .9)
        ..style = PaintingStyle.stroke
        ..strokeWidth = r * .035,
    );
    if (r < 80) return; // kichik kvadratda nuqtalar ortiqcha
    final dot = Paint()..color = accent.withValues(alpha: .7);
    const step = 22.0;
    for (var y = step / 2; y < size.height * .45; y += step) {
      for (var x = step / 2 + ((y ~/ step).isEven ? 0 : step / 2); x < size.width; x += step) {
        canvas.drawCircle(Offset(x, y), 1.6, dot);
      }
    }
  }

  @override
  bool shouldRepaint(_DishPlaceholderPainter old) => old.bg != bg || old.accent != accent || old.seed != seed;
}

class SectionTitle extends StatelessWidget {
  const SectionTitle(this.text, {super.key, this.trailing});
  final String text;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) => Row(
    crossAxisAlignment: CrossAxisAlignment.end,
    children: [
      Expanded(
        child: Text(text, style: sans(16, weight: FontWeight.w800)),
      ),
      ?trailing,
    ],
  );
}

/// − n + boshqaruvi
class Counter extends StatelessWidget {
  const Counter({super.key, required this.value, required this.onChanged, this.min = 0, this.max = 20, this.label});
  final int value;
  final ValueChanged<int> onChanged;
  final int min;
  final int max;
  final String? label;

  @override
  Widget build(BuildContext context) => Row(
    mainAxisSize: MainAxisSize.min,
    children: [
      _btn(Icons.remove_rounded, value > min ? () => onChanged(value - 1) : null, false, t('Kamaytirish')),
      ConstrainedBox(
        constraints: const BoxConstraints(minWidth: 36),
        child: Text(
          label ?? '$value',
          textAlign: TextAlign.center,
          style: sans(17, weight: FontWeight.w800),
        ),
      ),
      _btn(Icons.add_rounded, value < max ? () => onChanged(value + 1) : null, true, t('Ko‘paytirish')),
    ],
  );

  Widget _btn(IconData icon, VoidCallback? onTap, bool primary, String tip) => Padding(
    padding: const EdgeInsets.symmetric(horizontal: 4),
    child: Tooltip(
      message: tip,
      child: Semantics(
        button: true,
        label: tip,
        child: Material(
          color: primary ? C.terracotta : Colors.transparent,
          shape: CircleBorder(side: primary ? BorderSide.none : const BorderSide(color: C.border, width: 1.5)),
          child: InkWell(
            customBorder: const CircleBorder(),
            onTap: onTap,
            child: SizedBox.square(dimension: 44, child: Icon(icon, color: primary ? Colors.white : C.ink, size: 22)),
          ),
        ),
      ),
    ),
  );
}

/// Ekran sarlavhasi: orqaga tugmasi + nom + o'ng tomondagi tugma
class ScreenHeader extends StatelessWidget {
  const ScreenHeader({super.key, required this.title, this.trailing, this.big = true, this.close = false, this.back = true, this.subtitle});
  final String title;
  final String? subtitle;
  final Widget? trailing;
  final bool big;
  final bool close;
  final bool back;

  @override
  Widget build(BuildContext context) => Row(
    children: [
      if (back) ...[BackBtn(close: close), const SizedBox(width: 12)],
      Expanded(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title, style: big ? serif(26) : sans(18, weight: FontWeight.w800)),
            if (subtitle != null) Text(subtitle!, style: sans(13, color: C.muted)),
          ],
        ),
      ),
      ?trailing,
    ],
  );
}

class Loading extends StatelessWidget {
  const Loading({super.key});
  @override
  Widget build(BuildContext context) => const Center(
    child: Padding(
      padding: EdgeInsets.all(32),
      child: CircularProgressIndicator(color: C.terracotta),
    ),
  );
}

class ErrorView extends StatelessWidget {
  const ErrorView({super.key, required this.error, required this.onRetry});
  final Object error;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) => Center(
    child: Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.cloud_off_rounded, size: 40, color: C.muted),
          const SizedBox(height: 12),
          Text(
            errorText(error),
            textAlign: TextAlign.center,
            style: sans(15, color: C.muted),
          ),
          const SizedBox(height: 16),
          SizedBox(
            width: 200,
            child: SecondaryButton(label: t('Qayta urinish'), onPressed: onRetry, height: 46),
          ),
        ],
      ),
    ),
  );
}

/// Bo'sh holat: rasm (ikonka doirasi) + sarlavha + tushuntirish + harakat tugmasi
class EmptyView extends StatelessWidget {
  const EmptyView({super.key, required this.text, this.title, this.icon = Icons.inbox_outlined, this.action});
  final String text;
  final String? title;
  final IconData icon;
  final Widget? action;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 28, horizontal: 16),
    child: Column(
      children: [
        Container(
          width: 72,
          height: 72,
          decoration: const BoxDecoration(color: C.lineSoft, shape: BoxShape.circle),
          child: Icon(icon, size: 34, color: C.mustardInk),
        ),
        const SizedBox(height: 14),
        if (title != null) ...[
          Text(
            title!,
            textAlign: TextAlign.center,
            style: sans(16, weight: FontWeight.w800),
          ),
          const SizedBox(height: 4),
        ],
        Text(
          text,
          textAlign: TextAlign.center,
          style: sans(14, color: C.muted, height: 1.45),
        ),
        if (action != null) ...[const SizedBox(height: 16), action!],
      ],
    ),
  );
}

/// Ma'lumot banneri (sariq/terrakota fon)
class InfoBanner extends StatelessWidget {
  const InfoBanner({
    super.key,
    required this.text,
    this.title,
    this.icon = Icons.info_outline_rounded,
    this.bg = C.mustardSoft,
    this.fg = C.mustardInk,
  });
  final String? title;
  final String text;
  final IconData icon;
  final Color bg;
  final Color fg;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(14),
    decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(16)),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, size: 20, color: fg),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (title != null)
                Text(
                  title!,
                  style: sans(14, weight: FontWeight.w700, color: fg),
                ),
              Text(text, style: sans(13, color: fg, height: 1.45)),
            ],
          ),
        ),
      ],
    ),
  );
}

void showSnack(BuildContext context, String text) {
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(
      SnackBar(
        content: Text(text, style: sans(14, color: C.card)),
      ),
    );
}

/// Xatoni ushlab, snack bilan ko'rsatadi. Muvaffaqiyatda true.
Future<bool> guard(BuildContext context, Future<void> Function() action) async {
  try {
    await action();
    return true;
  } catch (e) {
    if (context.mounted) showSnack(context, errorText(e));
    return false;
  }
}

/// Oddiy yuklash: Future → yuklanmoqda / xato / ma'lumot; `reload()` bilan yangilanadi
class Loader<T> extends StatefulWidget {
  const Loader({super.key, required this.load, required this.builder, this.skeleton});
  final Future<T> Function() load;

  /// Yuklanayotganda ko'rsatiladigan skelet (bo'lmasa — umumiy ro'yxat skeleti)
  final Widget? skeleton;
  final Widget Function(BuildContext context, T data, Future<void> Function() reload) builder;

  @override
  State<Loader<T>> createState() => _LoaderState<T>();
}

class _LoaderState<T> extends State<Loader<T>> {
  T? _data;
  Object? _error;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _reload();
  }

  Future<void> _reload() async {
    setState(() {
      _loading = _data == null;
      _error = null;
    });
    try {
      final d = await widget.load();
      if (mounted) setState(() => _data = d);
    } catch (e) {
      if (mounted) setState(() => _error = e);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading && _data == null) {
      return widget.skeleton ??
          const SafeArea(
            child: Padding(padding: EdgeInsets.fromLTRB(20, 24, 20, 0), child: SkeletonList(rows: 6)),
          );
    }
    if (_error != null && _data == null) return ErrorView(error: _error!, onRetry: _reload);
    return widget.builder(context, _data as T, _reload);
  }
}

/// Matn kiritish oynasi
Future<String?> promptText(BuildContext context, {required String title, String? initial, String? hint, TextInputType? keyboard}) {
  final c = TextEditingController(text: initial);
  return showDialog<String>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: Text(title, style: sans(18, weight: FontWeight.w800)),
      content: TextField(
        controller: c,
        autofocus: true,
        keyboardType: keyboard,
        decoration: InputDecoration(hintText: hint),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(ctx), child: Text(t('Bekor qilish'))),
        FilledButton(onPressed: () => Navigator.pop(ctx, c.text.trim()), child: Text(t('Saqlash'))),
      ],
    ),
  );
}

Future<bool> confirm(BuildContext context, String text, {String? ok}) async =>
    await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        content: Text(text, style: sans(15, height: 1.45)),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text(t('Bekor qilish'))),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: Text(ok ?? t('Ha'))),
        ],
      ),
    ) ??
    false;

Route<T> route<T>(Widget page) => MaterialPageRoute<T>(builder: (_) => page);

/// Bo'lim yorlig'i: kichik, bosh harflar bilan (xarid kategoriyalari, ro'yxat bo'limlari)
class SectionLabel extends StatelessWidget {
  const SectionLabel(this.text, {super.key});
  final String text;

  @override
  Widget build(BuildContext context) => Semantics(
    header: true,
    child: Text(
      text.toUpperCase(),
      style: sans(12, weight: FontWeight.w800, color: C.muted).copyWith(letterSpacing: .7),
    ),
  );
}

/// "Olindi" belgisi: 48 px bosiladigan joy, yengil animatsiya bilan
class CheckMark extends StatelessWidget {
  const CheckMark({super.key, required this.checked, required this.onTap, this.label});
  final bool checked;
  final VoidCallback? onTap;
  final String? label;

  @override
  Widget build(BuildContext context) => Semantics(
    checked: checked,
    label: label,
    button: onTap != null,
    child: InkResponse(
      onTap: onTap,
      radius: 24,
      child: SizedBox.square(
        dimension: 48,
        child: Center(
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 180),
            curve: Curves.easeOut,
            width: 24,
            height: 24,
            decoration: BoxDecoration(
              color: checked ? C.olive : Colors.transparent,
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: checked ? C.olive : C.border, width: 1.5),
            ),
            child: AnimatedScale(
              scale: checked ? 1 : 0,
              duration: const Duration(milliseconds: 180),
              curve: Curves.easeOutBack,
              child: const Icon(Icons.check_rounded, size: 18, color: Colors.white),
            ),
          ),
        ),
      ),
    ),
  );
}

/// Oflayn belgisi: internet yo'q — oxirgi saqlangan ma'lumot ko'rsatilmoqda (ekran tepasida)
class OfflineBar extends StatelessWidget {
  const OfflineBar({super.key});

  @override
  Widget build(BuildContext context) => Material(
    color: C.ink,
    child: SafeArea(
      bottom: false,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.cloud_off_rounded, size: 16, color: C.mustardLight),
            const SizedBox(width: 8),
            Flexible(
              child: Text(
                t('Oflayn — oxirgi saqlangan ma’lumot'),
                style: sans(12, weight: FontWeight.w700, color: C.card),
              ),
            ),
          ],
        ),
      ),
    ),
  );
}

/// Yuklanayotgan joy o'rnida miltillab turuvchi blok
class Skeleton extends StatefulWidget {
  const Skeleton({super.key, this.width, this.height = 16, this.radius = 8});
  final double? width;
  final double height;
  final double radius;

  @override
  State<Skeleton> createState() => _SkeletonState();
}

class _SkeletonState extends State<Skeleton> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 900))..repeat(reverse: true);

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => FadeTransition(
    opacity: Tween<double>(begin: .45, end: 1).animate(_c),
    child: Container(
      width: widget.width,
      height: widget.height,
      decoration: BoxDecoration(color: C.lineSoft, borderRadius: BorderRadius.circular(widget.radius)),
    ),
  );
}

/// Ro'yxat skeleti: kartochka ichida bir nechta qator
class SkeletonList extends StatelessWidget {
  const SkeletonList({super.key, this.rows = 4, this.leading = true});
  final int rows;
  final bool leading;

  @override
  Widget build(BuildContext context) => Semantics(
    label: t('Yuklanmoqda'),
    child: Padding(
      padding: const EdgeInsets.only(top: 12),
      child: CardList(
        children: [
          for (var i = 0; i < rows; i++)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
              child: Row(
                children: [
                  if (leading) ...[const Skeleton(width: 28, height: 28, radius: 14), const SizedBox(width: 12)],
                  Expanded(
                    child: FractionallySizedBox(
                      alignment: Alignment.centerLeft,
                      widthFactor: i.isEven ? .7 : .5,
                      child: const Skeleton(height: 14),
                    ),
                  ),
                  const SizedBox(width: 12),
                  const Skeleton(width: 44, height: 14),
                ],
              ),
            ),
        ],
      ),
    ),
  );
}

/// Kichik ko'rsatkich kartochkasi: katta qiymat + izoh (taom vaqti, kaloriya, cookbook statistikasi)
class StatTile extends StatelessWidget {
  const StatTile(this.value, this.label, {super.key});
  final String value;
  final String label;

  @override
  Widget build(BuildContext context) => Expanded(
    child: Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 10),
      decoration: BoxDecoration(
        color: C.card,
        border: Border.all(color: C.line),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        children: [
          FittedBox(
            fit: BoxFit.scaleDown,
            child: Text(value, style: sans(16, weight: FontWeight.w800)),
          ),
          Text(
            label,
            textAlign: TextAlign.center,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: sans(11, color: C.muted, height: 1.2),
          ),
        ],
      ),
    ),
  );
}

/// Kartochka ichidagi qator: chapda nom, o'ngda qalin qiymat (masalliq — miqdor)
class KeyValueRow extends StatelessWidget {
  const KeyValueRow(this.label, this.value, {super.key});
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          child: Text(label, style: sans(14, weight: FontWeight.w600)),
        ),
        const SizedBox(width: 12),
        Text(value, style: sans(14, weight: FontWeight.w800)),
      ],
    ),
  );
}

/// Bosqich raqami doirasi
class StepBadge extends StatelessWidget {
  const StepBadge(this.text, {super.key, this.active = true});
  final String text;
  final bool active;

  @override
  Widget build(BuildContext context) => Container(
    width: 30,
    height: 30,
    alignment: Alignment.center,
    decoration: BoxDecoration(color: active ? C.terracotta : C.lineSoft, shape: BoxShape.circle),
    child: Text(
      text,
      textScaler: TextScaler.noScaling,
      style: sans(13, weight: FontWeight.w800, color: active ? Colors.white : C.ink),
    ),
  );
}

/// Ekran pastidagi yopishgan tugmalar paneli
class BottomBar extends StatelessWidget {
  const BottomBar({super.key, required this.children});
  final List<Widget> children;

  @override
  Widget build(BuildContext context) => Container(
    decoration: const BoxDecoration(
      color: C.card,
      border: Border(top: BorderSide(color: C.line)),
    ),
    child: SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 14, 20, 16),
        child: Row(children: children),
      ),
    ),
  );
}
