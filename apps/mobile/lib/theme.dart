import 'package:flutter/material.dart';

/// "Taomdosh UI" palitrasi: terrakota, krem, xantal.
class C {
  static const terracotta = Color(0xFFB5491F);
  static const terracottaDark = Color(0xFF8F3715);
  static const terracottaSoft = Color(0xFFF6E0D3);
  static const cream = Color(0xFFFAF3E8);
  static const card = Color(0xFFFFFCF7);
  static const line = Color(0xFFEADFCF);
  static const lineSoft = Color(0xFFF1E6D6);
  static const border = Color(0xFFD9CBB8);
  static const ink = Color(0xFF2B2019);
  static const muted = Color(0xFF6E5D50);
  static const navMuted = Color(0xFF75645A);
  static const mustard = Color(0xFFE2A33B);
  static const mustardLight = Color(0xFFF2C27A);
  static const mustardSoft = Color(0xFFF7E7C6);
  static const mustardInk = Color(0xFF7A4B07);
  static const olive = Color(0xFF4F6B2F);
  static const oliveSoft = Color(0xFFE4EBD6);
  static const oliveInk = Color(0xFF2D4119);
  static const blue = Color(0xFF3E5C76);
  static const blueSoft = Color(0xFFE3EAF0);
  static const photo = Color(0xFFD9A47E);

  /// A'zo avatarlari uchun ranglar (id bo'yicha barqaror)
  static const avatars = [terracotta, olive, mustardInk, blue, Color(0xFF6B4E71), Color(0xFF2F6B5E)];
  static Color avatarFor(String id) => avatars[id.hashCode.abs() % avatars.length];
}

/// Sarlavhalar: Fraunces (lotin). Kirill harflari tizim shriftiga tushadi.
TextStyle serif(double size, {FontWeight weight = FontWeight.w600, Color color = C.ink, double? height}) =>
    TextStyle(fontFamily: 'Fraunces', fontSize: size, fontWeight: weight, color: color, height: height);

TextStyle sans(double size, {FontWeight weight = FontWeight.w500, Color color = C.ink, double? height}) =>
    TextStyle(fontFamily: 'Manrope', fontSize: size, fontWeight: weight, color: color, height: height);

ThemeData buildTheme() {
  final base = ThemeData(
    useMaterial3: true,
    fontFamily: 'Manrope',
    colorScheme: ColorScheme.fromSeed(seedColor: C.terracotta, primary: C.terracotta, surface: C.cream),
    scaffoldBackgroundColor: C.cream,
  );
  return base.copyWith(
    textTheme: base.textTheme.apply(fontFamily: 'Manrope', bodyColor: C.ink, displayColor: C.ink),
    appBarTheme: const AppBarTheme(backgroundColor: C.cream, foregroundColor: C.ink, elevation: 0, scrolledUnderElevation: 0),
    snackBarTheme: const SnackBarThemeData(behavior: SnackBarBehavior.floating, backgroundColor: C.ink),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: C.card,
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: const BorderSide(color: C.border, width: 1.5),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: const BorderSide(color: C.border, width: 1.5),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: const BorderSide(color: C.terracotta, width: 2),
      ),
    ),
    dialogTheme: const DialogThemeData(backgroundColor: C.card),
    bottomSheetTheme: const BottomSheetThemeData(backgroundColor: C.cream),
  );
}
