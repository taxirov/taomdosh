import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'api/api_client.dart';
import 'app.dart';
import 'state/session.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  final session = Session(ApiClient())..bootstrap();
  runApp(ChangeNotifierProvider.value(value: session, child: const TaomdoshApp()));
}
