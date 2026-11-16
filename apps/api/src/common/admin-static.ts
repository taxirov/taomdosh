import { Logger } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import type { NextFunction, Request, Response } from 'express';
import { existsSync } from 'fs';
import { join, resolve } from 'path';

/**
 * Admin panel (apps/admin, Vite build) ni API bilan bitta portda `/admin/` manzilida beradi.
 * Shunda tunnel/Caddy orqasida alohida domen yoki port kerak bo'lmaydi.
 * Papka: `ADMIN_DIR` → `<cwd>/../admin/dist` (ishlab chiqish) → `<cwd>/admin` (Docker obrazi).
 */
export function adminDir(): string | null {
  const candidates = [process.env.ADMIN_DIR, resolve(process.cwd(), '../admin/dist'), resolve(process.cwd(), 'admin')].filter(
    (x): x is string => !!x,
  );
  return candidates.find((d) => existsSync(join(d, 'index.html'))) ?? null;
}

export function serveAdmin(app: NestExpressApplication) {
  const dir = adminDir();
  if (!dir) {
    new Logger('Admin').warn('Admin panel topilmadi (apps/admin/dist yoki ADMIN_DIR) — /admin o\'chiq');
    return;
  }
  // Fayllar nomida xesh bor — uzoq kesh; index.html esa har safar yangidan
  app.useStaticAssets(join(dir, 'assets'), { prefix: '/admin/assets/', maxAge: '365d', immutable: true, index: false });
  app.useStaticAssets(dir, { prefix: '/admin/', index: false, maxAge: '1h' });
  const index = join(dir, 'index.html');
  // SPA: /admin va /admin/<sahifa> → index.html
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.method !== 'GET' || !(req.path === '/admin' || req.path.startsWith('/admin/'))) return next();
    if (req.path === '/admin') return res.redirect(301, '/admin/');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('X-Frame-Options', 'DENY');
    res.sendFile(index);
  });
  new Logger('Admin').log(`Admin panel: /admin/ (${dir})`);
}
