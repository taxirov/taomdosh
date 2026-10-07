# Taomdosh API — ishlab chiqarish obrazi (hostingga bog'lanmagan: DigitalOcean, UzCloud yoki istalgan Docker serveri)

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
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/v1/health || exit 1
# Har ishga tushishda migratsiyalar qo'llanadi (takroriy qo'llash xavfsiz), so'ng server
CMD ["sh", "-c", "node dist/db/migrate.js && node dist/main.js"]
