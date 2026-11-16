import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Admin panel API bilan bitta portda /admin/ manzilida ishlaydi (apps/api/src/common/admin-static.ts).
// Ishlab chiqishda: `npm run dev` → http://localhost:5173/admin/, /v1 so'rovlari lokal API ga yo'naltiriladi.
export default defineConfig({
  base: '/admin/',
  plugins: [react()],
  server: { proxy: { '/v1': process.env.API_PROXY ?? 'http://localhost:3000' } },
  build: { outDir: 'dist', emptyOutDir: true, chunkSizeWarningLimit: 800 },
});
