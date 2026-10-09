import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'api/api_client.dart';
import 'screens/auth/welcome.dart';
import 'screens/home_shell.dart';
import 'screens/auth/splash.dart';
import 'state/session.dart';
import 'theme.dart';
import 'widgets/common.dart';

class TaomdoshApp extends StatelessWidget {
  const TaomdoshApp({super.key});

  @override
  Widget build(BuildContext context) {
    final s = context.watch<Session>();
    return MaterialApp(
      title: 'Taomdosh',
      debugShowCheckedModeBanner: false,
      theme: buildTheme(),
      // Til o'zgarsa butun daraxt qayta quriladi
      key: ValueKey(s.locale),
      home: !s.ready
          ? const SplashScreen()
          : s.offline
          ? Scaffold(
              body: SafeArea(
                child: ErrorView(error: ApiException(0, 'network'), onRetry: s.bootstrap),
              ),
            )
          : s.loggedIn
          ? const HomeShell()
          : const WelcomeScreen(),
    );
  }
}
