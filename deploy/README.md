# DigitalOcean'ga joylash

MVP serveri: **DigitalOcean Droplet** (Frankfurt, 2 GB RAM, Ubuntu 24.04), Docker Compose bilan
`api` + `postgres` + `redis` + `caddy` (avtomatik HTTPS, Let's Encrypt).
Hech narsa DigitalOcean'ga bog'lanmagan — ommaga chiqishdan oldin UzCloud (yoki istalgan Docker serveri)ga
xuddi shu qadamlar bilan ko'chiriladi (pastda "Ko'chirish" bo'limi).

## 1. Droplet

1. DigitalOcean → Create → Droplets: **Frankfurt (FRA1)**, Ubuntu 24.04, Basic / Regular, **2 GB / 1 vCPU**.
2. Kirish: SSH kalit (parol emas). Monitoring yoqilsin.
3. Domen DNS'ida `A` yozuvi: `api.taomdosh.uz → <droplet IP>`.

## 2. Serverni tayyorlash

```bash
ssh root@<IP>
adduser deploy && usermod -aG sudo deploy
rsync --archive --chown=deploy:deploy ~/.ssh /home/deploy

# Xavfsizlik devori: faqat SSH va HTTP(S)
ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw enable

# Docker (rasmiy skript) va compose plagini
curl -fsSL https://get.docker.com | sh
usermod -aG docker deploy

# 2 GB RAM'da build paytida xotira yetishi uchun swap
fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

## 3. Ilovani ishga tushirish

```bash
su - deploy
git clone https://github.com/taxirov/taomdosh.git && cd taomdosh
cp deploy/.env.example .env
nano .env        # DOMAIN, ACME_EMAIL, parollar (openssl rand -hex 32), TELEGRAM_GATEWAY_TOKEN

docker compose up -d --build
docker compose logs -f api                      # "Migratsiyalar qo'llandi" → server ishga tushdi
docker compose exec api node dist/db/seed/seed.js   # birinchi marta: masalliqlar, taomlar, cookbooklar
curl https://api.taomdosh.uz/v1/health          # {"ok":true}
```

API hujjati: `https://<DOMAIN>/docs`.

Migratsiyalar har ishga tushishda avtomatik qo'llanadi. Qulflash poller'i (har 30 s) API ichida ishlaydi
va `FOR UPDATE SKIP LOCKED` ishlatadi — bir nechta API nusxasi ham xavfsiz.

## 4. Yangilash

```bash
cd ~/taomdosh && git pull
docker compose up -d --build api
docker image prune -f
```

## 5. Zaxira nusxa (backup)

Har kecha bazaning siqilgan nusxasi, 14 kun saqlanadi:

```bash
mkdir -p ~/backups
crontab -e
# 03:15 da:
15 3 * * * cd ~/taomdosh && docker compose exec -T postgres pg_dump -U taomdosh -Fc taomdosh > ~/backups/taomdosh-$(date +\%F).dump && find ~/backups -name '*.dump' -mtime +14 -delete
```

Tiklash:

```bash
docker compose exec -T postgres pg_restore -U taomdosh -d taomdosh --clean --if-exists < ~/backups/taomdosh-YYYY-MM-DD.dump
```

Nusxalarni serverdan tashqarida ham saqlang (masalan, DigitalOcean Spaces yoki boshqa S3 ga `rclone` bilan).

## 6. Tekshiruv ro'yxati

- [ ] `.env` da `AUTH_TEST_PHONES=*` **yo'q** (faqat aniq sinovchi raqamlari).
- [ ] `JWT_*_SECRET` va `POSTGRES_PASSWORD` — uzun tasodifiy qiymatlar.
- [ ] Postgres va Redis portlari tashqariga ochilmagan (compose'da `ports` yo'q — to'g'ri).
- [ ] `https://<DOMAIN>/v1/health` → `{"ok":true}`.
- [ ] Backup cron ishlayapti, tiklash bir marta sinab ko'rilgan.

## Ko'chirish (UzCloud yoki boshqa server)

1. Yangi serverda 2–3-qadamlarni bajaring (Docker, `.env`), lekin hali `up` qilmang.
2. Eski serverda: `docker compose stop api` va oxirgi `pg_dump`.
3. Yangi serverda: `docker compose up -d postgres`, so'ng `pg_restore` (5-qadam), keyin `docker compose up -d`.
4. DNS `A` yozuvini yangi IP ga o'zgartiring (TTL'ni oldindan 300 s ga tushiring). Caddy sertifikatni o'zi oladi.
