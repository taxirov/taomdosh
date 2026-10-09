#!/usr/bin/env bash
# Taomdosh serverini bir buyruq bilan o'rnatish (Ubuntu, root sifatida):
#   curl -fsSL https://raw.githubusercontent.com/taxirov/taomdosh/main/deploy/setup.sh | bash -s -- +998901234567,+998911112233
# Argument — test raqamlari (vergul bilan): ular Telegram'siz doimiy kod bilan kiradi.
# Qayta ishga tushirish xavfsiz: mavjud .env va ma'lumotlar saqlanadi, kod yangilanadi.
set -euo pipefail

TEST_PHONES="${1:-}"
DIR=/opt/taomdosh

echo "==> 1/6 Swap (kichik serverda yig'ish uchun)"
if ! swapon --show | grep -q /swapfile; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

echo "==> 2/6 Xavfsizlik devori: SSH, 80, 443"
if command -v ufw >/dev/null; then
  ufw allow OpenSSH >/dev/null && ufw allow 80/tcp >/dev/null && ufw allow 443/tcp >/dev/null && ufw allow 443/udp >/dev/null
  ufw --force enable >/dev/null
fi

echo "==> 3/6 Docker"
command -v docker >/dev/null || curl -fsSL https://get.docker.com | sh

echo "==> 4/6 Kod"
if [ -d "$DIR/.git" ]; then git -C "$DIR" pull --ff-only; else git clone https://github.com/taxirov/taomdosh.git "$DIR"; fi
cd "$DIR"

echo "==> 5/6 Sozlamalar (.env)"
if [ ! -f .env ]; then
  IP=$(curl -fsS https://api.ipify.org)
  cat > .env <<EOF
DOMAIN=${IP//./-}.sslip.io
POSTGRES_PASSWORD=$(openssl rand -hex 24)
JWT_ACCESS_SECRET=$(openssl rand -hex 32)
JWT_REFRESH_SECRET=$(openssl rand -hex 32)
TELEGRAM_GATEWAY_TOKEN=
AUTH_TEST_PHONES=${TEST_PHONES}
AUTH_TEST_CODE=$(shuf -i 100000-999999 -n 1)
EOF
  chmod 600 .env
fi

echo "==> 6/6 Ishga tushirish (birinchi marta 5–15 daqiqa)"
docker compose up -d --build
# Migratsiyalar tugab, API javob berguncha kutish, so'ng boshlang'ich ma'lumot (qayta yuklash xavfsiz)
for i in $(seq 1 60); do
  docker compose exec -T api wget -qO- http://127.0.0.1:3000/v1/health >/dev/null 2>&1 && break
  sleep 3
done
docker compose exec -T api node dist/db/seed/seed.js

DOMAIN=$(grep '^DOMAIN=' .env | cut -d= -f2)
for i in $(seq 1 30); do
  curl -fsS "https://$DOMAIN/v1/health" >/dev/null 2>&1 && break
  sleep 5
done
echo
if curl -fsS "https://$DOMAIN/v1/health" >/dev/null 2>&1; then
  echo "TAYYOR. API manzili: https://$DOMAIN/v1"
else
  echo "Server ishga tushdi, lekin HTTPS hali tayyor emas. Bir daqiqadan keyin tekshiring: curl https://$DOMAIN/v1/health"
fi
echo "Test raqamlari: $(grep '^AUTH_TEST_PHONES=' .env | cut -d= -f2)"
echo "Test kodi:      $(grep '^AUTH_TEST_CODE=' .env | cut -d= -f2)"
