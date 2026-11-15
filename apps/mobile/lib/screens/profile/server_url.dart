import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../api/api_client.dart';
import '../../i18n/strings.dart';
import '../../state/session.dart';
import '../../theme.dart';
import '../../widgets/common.dart';

/// "Server manzili" oynasi: standart qiymat — ilova yig'ilgandagi API_URL; foydalanuvchi o'zgartira oladi.
/// Manzil o'zgarsa lokal ma'lumot tozalanadi va qaytadan kirish kerak bo'ladi.
Future<void> showServerUrlDialog(BuildContext context) async {
  final s = context.read<Session>();
  final c = TextEditingController(text: currentApiBase);
  String? error;
  final result = await showDialog<String>(
    context: context,
    builder: (ctx) => StatefulBuilder(
      builder: (ctx, setState) => AlertDialog(
        title: Text(t('Server manzili'), style: sans(18, weight: FontWeight.w800)),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            TextField(
              controller: c,
              autofocus: true,
              keyboardType: TextInputType.url,
              autocorrect: false,
              style: sans(15),
              decoration: InputDecoration(hintText: 'https://…/v1', errorText: error),
            ),
            const SizedBox(height: 10),
            Text(t('Standart: {url}', {'url': apiUrl}), style: sans(12, color: C.muted)),
            const SizedBox(height: 6),
            Text(t('Manzil o‘zgarsa, shu serverda qaytadan kirish kerak bo‘ladi.'), style: sans(12, color: C.muted, height: 1.4)),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, apiUrl), child: Text(t('Standartga qaytarish'))),
          TextButton(onPressed: () => Navigator.pop(ctx), child: Text(t('Bekor qilish'))),
          FilledButton(
            onPressed: () {
              final url = normalizeServerUrl(c.text);
              if (url == null) {
                setState(() => error = t('Manzil noto‘g‘ri'));
              } else {
                Navigator.pop(ctx, url);
              }
            },
            child: Text(t('Saqlash')),
          ),
        ],
      ),
    ),
  );
  if (result == null || result == currentApiBase || !context.mounted) return;
  await s.setServerUrl(result == apiUrl ? null : result);
  if (context.mounted) showSnack(context, t('Server manzili o‘zgardi'));
}
