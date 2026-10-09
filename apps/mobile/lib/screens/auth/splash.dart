import 'package:flutter/material.dart';

import '../../i18n/strings.dart';
import '../../theme.dart';
import '../../widgets/common.dart';

class SplashScreen extends StatelessWidget {
  const SplashScreen({super.key});

  @override
  Widget build(BuildContext context) => Scaffold(
    backgroundColor: C.terracotta,
    body: Stack(
      children: [
        Center(
          child: Column(mainAxisSize: MainAxisSize.min, children: const [LogoMark(size: 148), SizedBox(height: 28), Wordmark(size: 44)]),
        ),
        Positioned(
          left: 0,
          right: 0,
          bottom: 56,
          child: Text(
            t('Bir dasturxon — har kimga o‘z porsiyasi'),
            textAlign: TextAlign.center,
            style: sans(14, weight: FontWeight.w600, color: const Color(0xFFFBE3D3)),
          ),
        ),
      ],
    ),
  );
}
