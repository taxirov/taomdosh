/**
 * Yuklangan fayllar (taom rasmlari): diskdagi papkada saqlanadi (Docker'da — volume), S3 kerak emas.
 * Rasm serverda siqiladi (uzun tomoni 1280 px, JPEG) va `/v1/uploads/...` orqali statik beriladi.
 */
import { BadRequestException } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { randomBytes } from 'crypto';
import { mkdir, unlink, writeFile } from 'fs/promises';
import { join, resolve } from 'path';
import sharp from 'sharp';

export const IMAGE_MAX_PX = 1280;
export const UPLOADS_PREFIX = '/uploads/';

/** UPLOADS_DIR (.env) yoki ishchi papkadagi ./uploads */
export function uploadsDir(): string {
  return resolve(process.env.UPLOADS_DIR || 'uploads');
}

/** Statik berish: bazadagi `/uploads/dishes/x.jpg` → `GET /v1/uploads/dishes/x.jpg` */
export function serveUploads(app: NestExpressApplication) {
  app.useStaticAssets(uploadsDir(), { prefix: '/v1/uploads/', maxAge: '30d', index: false, dotfiles: 'ignore' });
}

/** Rasmni siqib saqlaydi; bazaga yoziladigan nisbiy manzilni qaytaradi */
export async function saveDishImage(dishId: string, file: Buffer): Promise<string> {
  let jpeg: Buffer;
  try {
    jpeg = await sharp(file, { limitInputPixels: 50_000_000 })
      .rotate() // EXIF bo'yicha to'g'rilash (telefon kamerasi)
      .resize({ width: IMAGE_MAX_PX, height: IMAGE_MAX_PX, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 80, mozjpeg: true })
      .toBuffer();
  } catch {
    throw new BadRequestException('image_invalid');
  }
  const dir = join(uploadsDir(), 'dishes');
  await mkdir(dir, { recursive: true });
  // Nom har safar yangi — kesh (30 kun) eski rasmni ko'rsatib qolmaydi
  const name = `${dishId}-${randomBytes(4).toString('hex')}.jpg`;
  await writeFile(join(dir, name), jpeg);
  return `${UPLOADS_PREFIX}dishes/${name}`;
}

/** Faqat o'zimiz saqlagan faylni o'chiradi (tashqi havola yoki boshqa yo'lga tegmaydi) */
export async function deleteUpload(url: string | null | undefined) {
  if (!url || !/^\/uploads\/dishes\/[0-9a-f-]+\.jpg$/.test(url)) return;
  await unlink(join(uploadsDir(), url.slice(UPLOADS_PREFIX.length))).catch(() => undefined);
}
