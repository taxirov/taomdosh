import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../api/api_client.dart';
import '../../format.dart';
import '../../i18n/strings.dart';
import '../../state/session.dart';
import '../../theme.dart';
import '../../widgets/common.dart';
import 'phone.dart';
import 'profile_setup.dart';

/// Bepul kirish: @taomdosh_bot da Start → "Raqamni yuborish" → ilova o'zi kiradi.
/// Ilova har 2 soniyada (va Telegram'dan qaytganda darhol) tasdiqni tekshiradi.
class TelegramLoginScreen extends StatefulWidget {
  const TelegramLoginScreen({super.key});

  @override
  State<TelegramLoginScreen> createState() => _TelegramLoginScreenState();
}

class _TelegramLoginScreenState extends State<TelegramLoginScreen> with WidgetsBindingObserver {
  static const _telegramBlue = Color(0xFF1A7FC1); // Telegram ko‘ki, oq matn uchun yetarli kontrast

  String? _token;
  String? _url;
  DateTime? _expires;
  Timer? _poll;
  bool _busy = false;
  bool _checking = false;
  bool _botDisabled = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _poll?.cancel();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // Telegram'dan qaytildi — kutmasdan tekshiramiz
    if (state == AppLifecycleState.resumed && _token != null) _check();
  }

  Future<void> _start() async {
    setState(() => _busy = true);
    try {
      final r = await context.read<Session>().startTelegramLogin();
      _token = r['token'] as String;
      _url = r['url'] as String;
      _expires = DateTime.now().add(Duration(seconds: (r['expiresIn'] as num).toInt()));
      _poll?.cancel();
      _poll = Timer.periodic(const Duration(seconds: 2), (_) => _check());
      await _open();
    } catch (e) {
      if (!mounted) return;
      if (e is ApiException && e.code == 'telegram_bot_disabled') {
        setState(() => _botDisabled = true);
      } else {
        showSnack(context, errorText(e));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _open() async {
    final ok = await launchUrl(Uri.parse(_url!), mode: LaunchMode.externalApplication);
    if (!ok && mounted) showSnack(context, t('Telegram ochilmadi. Telegram o‘rnatilganini tekshiring.'));
  }

  Future<void> _check() async {
    final token = _token;
    if (token == null || _checking) return;
    if (_expires != null && DateTime.now().isAfter(_expires!)) {
      _reset();
      if (mounted) showSnack(context, t('Havola eskirdi — qaytadan bosing'));
      return;
    }
    _checking = true;
    final nav = Navigator.of(context);
    try {
      final isNew = await context.read<Session>().checkTelegramLogin(token);
      if (isNew == null) return; // hali tasdiqlanmagan
      _reset();
      if (isNew) {
        nav.pushAndRemoveUntil(route(const ProfileSetupScreen(onboarding: true)), (r) => r.isFirst);
      } else {
        nav.popUntil((r) => r.isFirst);
      }
    } on ApiException catch (e) {
      // login_expired — token eskirgan yoki allaqachon ishlatilgan
      if (e.code == 'login_expired') {
        _reset();
        if (mounted) showSnack(context, t('Havola eskirdi — qaytadan bosing'));
      }
      // Tarmoq xatolarida jim qayta urinamiz
    } finally {
      _checking = false;
    }
  }

  void _reset() {
    _poll?.cancel();
    _poll = null;
    _token = null;
    _url = null;
    if (mounted) setState(() {});
  }

  Widget _step(int n, String text) => Padding(
    padding: const EdgeInsets.only(bottom: 14),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: 28,
          height: 28,
          alignment: Alignment.center,
          decoration: const BoxDecoration(color: C.terracottaSoft, shape: BoxShape.circle),
          child: Text(
            '$n',
            style: sans(13, weight: FontWeight.w800, color: C.terracottaDark),
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Padding(
            padding: const EdgeInsets.only(top: 4),
            child: Text(text, style: sans(15, height: 1.4)),
          ),
        ),
      ],
    ),
  );

  @override
  Widget build(BuildContext context) {
    final waiting = _token != null;
    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(24, 16, 24, 20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Row(children: [BackBtn()]),
              Expanded(
                child: ListView(
                  children: [
                    const SizedBox(height: 28),
                    Text(t('Telegram orqali kirish'), style: serif(30, height: 1.15)),
                    const SizedBox(height: 10),
                    Text(
                      t('Parol va SMS kerak emas — raqamingizni Telegram tasdiqlaydi. Bepul.'),
                      style: sans(15, color: C.muted, height: 1.5),
                    ),
                    const SizedBox(height: 28),
                    _step(1, t('Pastdagi tugmani bosing — Telegram’da @taomdosh_bot ochiladi.')),
                    _step(2, t('“Start”, so‘ng “Raqamni yuborish” tugmasini bosing.')),
                    _step(3, t('Ilovaga qayting — kirish avtomatik bo‘ladi.')),
                    if (waiting) ...[
                      const SizedBox(height: 12),
                      InfoBanner(
                        icon: Icons.hourglass_top_rounded,
                        bg: C.oliveSoft,
                        fg: C.oliveInk,
                        title: t('Telegram’dagi tasdiqni kutyapmiz…'),
                        text: t('Botda “Raqamni yuborish” tugmasini bosgach, shu yerga qayting.'),
                      ),
                    ],
                    if (_botDisabled) ...[
                      const SizedBox(height: 12),
                      InfoBanner(
                        icon: Icons.info_outline_rounded,
                        text: t('Telegram orqali kirish hozircha yoqilmagan. Raqam va kod bilan kiring.'),
                      ),
                    ],
                  ],
                ),
              ),
              PrimaryButton(
                label: waiting ? t('Telegram’ni qayta ochish') : t('Telegram orqali kirish'),
                color: _telegramBlue,
                loading: _busy,
                onPressed: _botDisabled ? null : (waiting ? _open : _start),
              ),
              const SizedBox(height: 8),
              TextButton(
                onPressed: () => Navigator.of(context).push(route(const PhoneScreen())),
                child: Text(
                  t('Raqam va kod bilan kirish'),
                  style: sans(14, weight: FontWeight.w700, color: C.terracotta),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
