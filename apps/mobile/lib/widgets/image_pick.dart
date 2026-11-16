import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../i18n/strings.dart';
import '../theme.dart';
import 'common.dart';

/// Kamera yoki galereyadan rasm tanlash. Rasm telefonda 1600 px gacha kichraytiriladi
/// (tez yuklanishi uchun), yakuniy siqish serverda. Bekor qilinsa — null.
Future<Uint8List?> pickDishPhoto(BuildContext context) async {
  final source = await showModalBottomSheet<ImageSource>(
    context: context,
    builder: (ctx) => SafeArea(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          ListTile(
            leading: const Icon(Icons.photo_camera_outlined, color: C.ink),
            title: Text(t('Kameradan olish'), style: sans(15, weight: FontWeight.w700)),
            onTap: () => Navigator.pop(ctx, ImageSource.camera),
          ),
          ListTile(
            leading: const Icon(Icons.photo_library_outlined, color: C.ink),
            title: Text(t('Galereyadan tanlash'), style: sans(15, weight: FontWeight.w700)),
            onTap: () => Navigator.pop(ctx, ImageSource.gallery),
          ),
        ],
      ),
    ),
  );
  if (source == null) return null;
  try {
    final file = await ImagePicker().pickImage(source: source, maxWidth: 1600, maxHeight: 1600, imageQuality: 85);
    return await file?.readAsBytes();
  } catch (_) {
    if (context.mounted) showSnack(context, t('Rasmni ochib bo‘lmadi'));
    return null;
  }
}
