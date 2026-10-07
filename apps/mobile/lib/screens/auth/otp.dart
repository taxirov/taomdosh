import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../../format.dart';
import '../../i18n/strings.dart';
import '../../state/session.dart';
import '../../theme.dart';
import '../../widgets/common.dart';
import 'profile_setup.dart';

class OtpScreen extends StatefulWidget {
  const OtpScreen({super.key, required this.phone, required this.name});
  final String phone;
  final String name;

  @override
  State<OtpScreen> createState() => _OtpScreenState();
}

class _OtpScreenState extends State<OtpScreen> {
  final _code = TextEditingController();
  final _focus = FocusNode();
  bool _busy = false;
  // Qayta yuborilganda taymer qaytadan boshlanishi uchun
  Key _timerKey = UniqueKey();

  @override
  void dispose() {
    _focus.dispose();
    super.dispose();
  }

  String get _pretty {
    final d = widget.phone.substring(4);
    return '+998 ${d.substring(0, 2)} ${d.substring(2, 5)} ${d.substring(5, 7)} ${d.substring(7)}';
  }

  Future<void> _verify() async {
    setState(() => _busy = true);
    final nav = Navigator.of(context);
    try {
      final isNew = await context.read<Session>().verify(widget.phone, _code.text, widget.name);
      if (isNew) {
        nav.pushAndRemoveUntil(route(const ProfileSetupScreen(onboarding: true)), (r) => r.isFirst);
      } else {
        nav.popUntil((r) => r.isFirst);
      }
    } catch (e) {
      if (mounted) {
        showSnack(context, errorText(e));
        _code.clear();
        setState(() {});
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _resend() async {
    if (await guard(context, () => context.read<Session>().requestCode(widget.phone))) {
      setState(() => _timerKey = UniqueKey());
    }
  }

  @override
  Widget build(BuildContext context) {
    final code = _code.text;
    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(24, 16, 24, 24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: [
                  const BackBtn(),
                  const Spacer(),
                  Text(
                    '2 / 3',
                    style: sans(13, weight: FontWeight.w700, color: C.muted),
                  ),
                ],
              ),
              const SizedBox(height: 28),
              Text(t('Kodni kiriting'), style: serif(30, height: 1.15)),
              const SizedBox(height: 10),
              Text.rich(
                TextSpan(
                  style: sans(15, color: C.muted, height: 1.5),
                  children: [
                    TextSpan(text: t('Telegram’dagi “Verification Codes” chatiga 6 xonali kod yuborildi: ')),
                    TextSpan(
                      text: _pretty,
                      style: sans(15, weight: FontWeight.w700),
                    ),
                  ],
                ),
              ),
              Align(
                alignment: Alignment.centerLeft,
                child: TextButton(onPressed: () => Navigator.pop(context), child: Text(t('Raqamni o‘zgartirish'))),
              ),
              const SizedBox(height: 12),
              // 6 ta katak — ustida ko'rinmas maydon (SMS/klaviatura avtoto'ldirishi uchun)
              Stack(
                children: [
                  // Kataklar faqat ko'rinish uchun; qiymatni ekran o'quvchiga maydonning o'zi beradi
                  ExcludeSemantics(
                    child: Row(
                      children: [
                        for (var i = 0; i < 6; i++) ...[
                          if (i > 0) const SizedBox(width: 8),
                          Expanded(
                            child: Container(
                              height: 60,
                              alignment: Alignment.center,
                              decoration: BoxDecoration(
                                color: C.card,
                                borderRadius: BorderRadius.circular(14),
                                border: Border.all(color: i == code.length ? C.terracotta : C.border, width: i == code.length ? 2 : 1.5),
                              ),
                              child: Text(i < code.length ? code[i] : '', style: sans(24, weight: FontWeight.w700)),
                            ),
                          ),
                        ],
                      ],
                    ),
                  ),
                  Positioned.fill(
                    // Shaffof matnli haqiqiy maydon: avtoto'ldirish va ekran o'quvchilar uchun
                    child: TextField(
                      controller: _code,
                      focusNode: _focus,
                      autofocus: true,
                      keyboardType: TextInputType.number,
                      autofillHints: const [AutofillHints.oneTimeCode],
                      inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(6)],
                      showCursor: false,
                      enableInteractiveSelection: false,
                      style: const TextStyle(color: Colors.transparent, fontSize: 1),
                      decoration: const InputDecoration(
                        filled: false,
                        border: InputBorder.none,
                        enabledBorder: InputBorder.none,
                        focusedBorder: InputBorder.none,
                        counterText: '',
                      ),
                      onChanged: (v) {
                        setState(() {});
                        if (v.length == 6 && !_busy) _verify();
                      },
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 20),
              Center(
                child: _ResendTimer(key: _timerKey, onResend: _resend),
              ),
              const Spacer(),
              PrimaryButton(label: t('Tasdiqlash'), loading: _busy, onPressed: code.length == 6 ? _verify : null),
            ],
          ),
        ),
      ),
    );
  }
}

/// Qayta yuborish taymeri — alohida vidjet: har soniyadagi qayta chizish kod maydoniga tegmasin
class _ResendTimer extends StatefulWidget {
  const _ResendTimer({super.key, required this.onResend});
  final VoidCallback onResend;

  @override
  State<_ResendTimer> createState() => _ResendTimerState();
}

class _ResendTimerState extends State<_ResendTimer> {
  int _left = 60;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _timer = Timer.periodic(const Duration(seconds: 1), (t) {
      if (!mounted) return;
      setState(() => _left = (_left - 1).clamp(0, 60));
      if (_left == 0) t.cancel();
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => _left > 0
      ? Text.rich(
          TextSpan(
            style: sans(14, color: C.muted),
            children: [
              TextSpan(text: t('Kodni qayta yuborish: ')),
              TextSpan(
                text: '0:${_left.toString().padLeft(2, '0')}',
                style: sans(14, weight: FontWeight.w700),
              ),
            ],
          ),
        )
      : TextButton(onPressed: widget.onResend, child: Text(t('Kodni qayta yuborish')));
}
