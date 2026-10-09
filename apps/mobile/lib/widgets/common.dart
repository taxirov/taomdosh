import 'package:flutter/material.dart';

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
  const CircleBtn({super.key, required this.icon, required this.onTap, this.tooltip, this.filled = false});
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
        child: SizedBox.square(dimension: 44, child: Icon(icon, size: 22, color: filled ? Colors.white : C.ink)),
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
  const CardList({super.key, required this.children});
  final List<Widget> children;

  @override
  Widget build(BuildContext context) => AppCard(
    padding: EdgeInsets.zero,
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

/// Taom rasmi yoki rang bilan to'ldirilgan joy
class DishImage extends StatelessWidget {
  const DishImage({super.key, this.url, this.width, this.height, this.radius = 12, this.seed = ''});
  final String? url;
  final double? width;
  final double? height;
  final double radius;
  final String seed;

  static const _tones = [Color(0xFFD9A47E), Color(0xFFE3BFA0), Color(0xFFEBCDB4), Color(0xFFC98B63), Color(0xFFC9D3B5)];

  @override
  Widget build(BuildContext context) {
    final ph = Container(
      width: width,
      height: height,
      color: _tones[seed.hashCode.abs() % _tones.length],
      alignment: Alignment.center,
      child: Icon(Icons.restaurant_rounded, color: const Color(0x887A3E22), size: ((height ?? 52) * .4).clamp(16, 48)),
    );
    return ClipRRect(
      borderRadius: BorderRadius.circular(radius),
      child: url == null || url!.isEmpty
          ? ph
          : Image.network(url!, width: width, height: height, fit: BoxFit.cover, errorBuilder: (_, _, _) => ph),
    );
  }
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

class EmptyView extends StatelessWidget {
  const EmptyView({super.key, required this.text, this.icon = Icons.inbox_outlined, this.action});
  final String text;
  final IconData icon;
  final Widget? action;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 32, horizontal: 16),
    child: Column(
      children: [
        Icon(icon, size: 40, color: C.border),
        const SizedBox(height: 10),
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
  const Loader({super.key, required this.load, required this.builder});
  final Future<T> Function() load;
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
    if (_loading && _data == null) return const Loading();
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
