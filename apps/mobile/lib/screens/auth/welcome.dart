import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../i18n/strings.dart';
import '../../state/session.dart';
import '../../theme.dart';
import '../../widgets/common.dart';
import 'telegram_login.dart';

class WelcomeScreen extends StatelessWidget {
  const WelcomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final s = context.watch<Session>();
    return Scaffold(
      body: Column(
        children: [
          Container(
            height: 360,
            color: C.terracotta,
            child: SafeArea(
              bottom: false,
              child: Stack(
                children: [
                  const Positioned(top: 16, left: 24, child: Row(children: [LogoMark(size: 30), SizedBox(width: 10), Wordmark(size: 22)])),
                  const Center(
                    child: Padding(padding: EdgeInsets.only(top: 36), child: LogoMark(size: 220)),
                  ),
                ],
              ),
            ),
          ),
          Expanded(
            child: SafeArea(
              top: false,
              child: SingleChildScrollView(
                padding: const EdgeInsets.fromLTRB(24, 28, 24, 24),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text(
                      t('Oila · Talabalar · Jamoa').toUpperCase(),
                      style: sans(12, weight: FontWeight.w700, color: C.terracottaDark).copyWith(letterSpacing: 1),
                    ),
                    const SizedBox(height: 12),
                    Text(t('Haftalik menyu, xarid va navbat — bitta ilovada'), style: serif(30, height: 1.12)),
                    const SizedBox(height: 12),
                    Text(
                      t(
                        'Cookbook tanlang, odam sonini kiriting — Taomdosh xarid ro‘yxatini, navbatchini va kim qancha ovqatlanganini o‘zi hisoblaydi.',
                      ),
                      style: sans(15, color: C.muted, height: 1.5),
                    ),
                    const SizedBox(height: 28),
                    PrimaryButton(label: t('Boshlash'), onPressed: () => Navigator.of(context).push(route(const TelegramLoginScreen()))),
                    const SizedBox(height: 16),
                    Wrap(
                      alignment: WrapAlignment.center,
                      spacing: 8,
                      runSpacing: 8,
                      children: [
                        for (final l in supportedLocales)
                          ChoicePill(label: localeNames[l]!, selected: s.locale == l, onTap: () => s.setLocale(l)),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
