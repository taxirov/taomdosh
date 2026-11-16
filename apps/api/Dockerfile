# Taomdosh API — ishlab chiqarish obrazi (hostingga bog'lanmagan: DigitalOcean, UzCloud yoki istalgan Docker serveri)

# ─── 0. Admin panel (apps/admin) — qo'shimcha kontekst "admin" (compose: additional_contexts, CI: build-contexts) ───
FROM node:22-alpine AS admin
WORKDIR /admin
COPY --from=adminsrc package.json package-lock.json ./
RUN npm ci
COPY --from=adminsrc . .
RUN npm run build

# ─── 1. Yig'ish ───
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

# ─── 2. Ishga tushirish ───
FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY drizzle ./drizzle
# Admin panel API bilan bitta portda: /admin/
COPY --from=admin /admin/dist ./admin
ENV ADMIN_DIR=/app/admin
# Yuklangan rasmlar papkasi (compose'da volume ulanadi); node foydalanuvchisi yoza olishi kerak
ENV UPLOADS_DIR=/data/uploads
RUN mkdir -p /data/uploads && chown -R node:node /data
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/v1/health || exit 1
# Har ishga tushishda migratsiyalar qo'llanadi (takroriy qo'llash xavfsiz), so'ng server
CMD ["sh", "-c", "node dist/db/migrate.js && node dist/main.js"]
