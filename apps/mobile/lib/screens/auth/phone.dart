import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../../api/api_client.dart';
import '../../format.dart';
import '../../i18n/strings.dart';
import '../../state/session.dart';
import '../../theme.dart';
import '../../widgets/common.dart';
import 'otp.dart';

class PhoneScreen extends StatefulWidget {
  const PhoneScreen({super.key});

  @override
  State<PhoneScreen> createState() => _PhoneScreenState();
}

class _PhoneScreenState extends State<PhoneScreen> {
  final _name = TextEditingController();
  final _phone = TextEditingController();
  bool _busy = false;

  String get _fullPhone => '+998${_phone.text.replaceAll(RegExp(r'\D'), '')}';
  bool get _valid => _name.text.trim().isNotEmpty && _phone.text.replaceAll(RegExp(r'\D'), '').length == 9;

  Future<void> _submit() async {
    setState(() => _busy = true);
    try {
      await context.read<Session>().requestCode(_fullPhone);
      if (!mounted) return;
      Navigator.of(context).push(route(OtpScreen(phone: _fullPhone, name: _name.text.trim())));
    } catch (e) {
      // "too_soon" — kod allaqachon yuborilgan, kiritish ekraniga o'tish mumkin
      if (mounted && e is ApiException && e.code == 'too_soon') {
        Navigator.of(context).push(route(OtpScreen(phone: _fullPhone, name: _name.text.trim())));
      } else if (mounted) {
        showSnack(context, errorText(e));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
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
                  '1 / 3',
                  style: sans(13, weight: FontWeight.w700, color: C.muted),
                ),
              ],
            ),
            Expanded(
              child: ListView(
                children: [
                  const SizedBox(height: 28),
                  Text(t('Keling, tanishamiz'), style: serif(30, height: 1.15)),
                  const SizedBox(height: 10),
                  Text(
                    t('Ismingiz va telefon raqamingizni kiriting — tasdiqlash kodini Telegram orqali yuboramiz.'),
                    style: sans(15, color: C.muted, height: 1.5),
                  ),
                  const SizedBox(height: 28),
                  Text(t('Ismingiz'), style: sans(13, weight: FontWeight.w700)),
                  const SizedBox(height: 8),
                  TextField(
                    controller: _name,
                    textCapitalization: TextCapitalization.words,
                    style: sans(16),
                    onChanged: (_) => setState(() {}),
                  ),
                  const SizedBox(height: 18),
                  Text(t('Telefon raqam'), style: sans(13, weight: FontWeight.w700)),
                  const SizedBox(height: 8),
                  TextField(
                    controller: _phone,
                    keyboardType: TextInputType.phone,
                    style: sans(16),
                    inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[\d ]')), LengthLimitingTextInputFormatter(12)],
                    onChanged: (_) => setState(() {}),
                    decoration: InputDecoration(
                      hintText: '90 123 45 67',
                      prefixIcon: Container(
                        width: 72,
                        alignment: Alignment.center,
                        margin: const EdgeInsets.only(right: 8),
                        decoration: const BoxDecoration(
                          border: Border(right: BorderSide(color: C.line)),
                        ),
                        child: Text('+998', style: sans(16, weight: FontWeight.w700)),
                      ),
                    ),
                  ),
                ],
              ),
            ),
            Text(
              t('Davom etish orqali foydalanish shartlari va maxfiylik siyosatiga rozilik bildirasiz.'),
              textAlign: TextAlign.center,
              style: sans(12, color: C.muted, height: 1.5),
            ),
            const SizedBox(height: 16),
            PrimaryButton(label: t('Kod olish'), loading: _busy, onPressed: _valid ? _submit : null),
          ],
        ),
      ),
    ),
  );
}
