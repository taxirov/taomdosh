#!/usr/bin/env bash
# Taomdosh serverini bir buyruq bilan o'rnatish (Ubuntu, root sifatida).
#
# 1) Bulut serveri (DigitalOcean va h.k., oq IP): HTTPS ni Caddy oladi (<IP>.sslip.io yoki o'z domeningiz)
#   curl -fsSL https://raw.githubusercontent.com/taxirov/taomdosh/main/deploy/setup.sh | BOT_TOKEN='123:ABC' bash -s -- +998901234567
#
# 2) Uy serveri (laptop, Wi-Fi): HTTPS ni jprq.io tunneli beradi, oq IP va ochiq port kerak emas
#   curl -fsSL https://raw.githubusercontent.com/taxirov/taomdosh/main/deploy/setup.sh | sudo MODE=jprq JPRQ_TOKEN='...' JPRQ_NAME=taomdosh BOT_TOKEN='123:ABC' bash -s -- +998901234567
#   JPRQ_TOKEN — https://jprq.io/auth dagi token (birinchi marta kerak), JPRQ_NAME — manzil nomi (subdomen).
#   Loyihaga ajratiladigan resurslar: LIMIT_CPU (standart 1.5 yadro), LIMIT_RAM (4G), LIMIT_DISK (100G).
#
# BOT_TOKEN — @BotFather dagi bot tokeni (bepul "Telegram orqali kirish" uchun; ixtiyoriy, keyin ham qo'shsa bo'ladi).
# Argument — test raqamlari (vergul bilan): ular bot'siz, doimiy kod bilan kiradi.
# Qayta ishga tushirish xavfsiz: mavjud .env va ma'lumotlar saqlanadi, kod va obraz yangilanadi.
set -euo pipefail

TEST_PHONES="${1:-}"
BOT_TOKEN="${BOT_TOKEN:-}"
MODE="${MODE:-server}"
JPRQ_TOKEN="${JPRQ_TOKEN:-}"
JPRQ_NAME="${JPRQ_NAME:-taomdosh}"
LIMIT_CPU="${LIMIT_CPU:-1.5}"
LIMIT_RAM="${LIMIT_RAM:-4G}"
LIMIT_DISK="${LIMIT_DISK:-100G}"
API_IMAGE=ghcr.io/taxirov/taomdosh-api:latest
DIR=/opt/taomdosh
BACKUPS=/opt/taomdosh-backups

case "$MODE" in server | jprq) ;; *) echo "MODE faqat server yoki jprq bo'lishi mumkin" >&2; exit 1 ;; esac
[ "$(id -u)" = 0 ] || { echo "root sifatida ishga tushiring (sudo)" >&2; exit 1; }

# .env dagi qatorni yozish yoki almashtirish
set_env() {
  if grep -q "^$1=" .env; then sed -i "s|^$1=.*|$1=$2|" .env; else echo "$1=$2" >> .env; fi
}

echo "==> 1/8 Swap"
if ! swapon --show | grep -q /swapfile; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

if [ "$MODE" = server ]; then
  echo "==> 2/8 Xavfsizlik devori: SSH, 80, 443"
  if command -v ufw >/dev/null; then
    ufw allow OpenSSH >/dev/null && ufw allow 80/tcp >/dev/null && ufw allow 443/tcp >/dev/null && ufw allow 443/udp >/dev/null
    ufw --force enable >/dev/null
  fi
else
  echo "==> 2/8 Laptop: uyqu o'chiriladi, loyihaga ${LIMIT_CPU} CPU / ${LIMIT_RAM} RAM / ${LIMIT_DISK} disk"
  # Qopqoq yopilganda yoki bo'sh turganda uxlamasin (aks holda server to'xtaydi)
  mkdir -p /etc/systemd/logind.conf.d
  printf '[Login]\nHandleLidSwitch=ignore\nHandleLidSwitchExternalPower=ignore\nHandleLidSwitchDocked=ignore\n' \
    > /etc/systemd/logind.conf.d/taomdosh.conf
  systemctl mask sleep.target suspend.target hibernate.target hybrid-sleep.target >/dev/null 2>&1 || true
  systemctl kill -s HUP systemd-logind 2>/dev/null || true

  # CPU va RAM: barcha konteynerlar shu slice ichida (docker-compose.home.yml → cgroup_parent)
  CPU_PCT=$(awk "BEGIN { printf \"%d\", $LIMIT_CPU * 100 }")
  printf '[Slice]\nCPUQuota=%s%%\nMemoryMax=%s\n' "$CPU_PCT" "$LIMIT_RAM" > /etc/systemd/system/taomdosh.slice
  systemctl daemon-reload

  # Disk: Docker ma'lumotlari (baza, obrazlar, loglar) alohida fayl-diskda — to'lsa ham tizim to'lmaydi
  if ! mountpoint -q /var/lib/docker; then
    if [ -d /var/lib/docker ] && [ -n "$(ls -A /var/lib/docker 2>/dev/null)" ]; then
      echo "   /var/lib/docker bo'sh emas — disk chegarasi qo'yilmadi (Docker allaqachon ishlatilgan)"
    else
      [ -f /var/lib/docker.img ] || { fallocate -l "$LIMIT_DISK" /var/lib/docker.img && mkfs.ext4 -q -F /var/lib/docker.img; }
      mkdir -p /var/lib/docker
      grep -q '/var/lib/docker.img' /etc/fstab || echo '/var/lib/docker.img /var/lib/docker ext4 loop,defaults 0 0' >> /etc/fstab
      mount /var/lib/docker
    fi
  fi
fi

echo "==> 3/8 Docker"
command -v git >/dev/null || { apt-get update -qq && apt-get install -y -qq git >/dev/null; }
command -v docker >/dev/null || curl -fsSL https://get.docker.com | sh

echo "==> 4/8 Kod"
if [ -d "$DIR/.git" ]; then git -C "$DIR" pull --ff-only; else git clone https://github.com/taxirov/taomdosh.git "$DIR"; fi
cd "$DIR"

echo "==> 5/8 Sozlamalar (.env)"
if [ ! -f .env ]; then
  if [ "$MODE" = server ]; then
    IP=$(curl -fsS https://api.ipify.org)
    DOMAIN="${IP//./-}.sslip.io"
  else
    DOMAIN=localhost # jprq rejimida Caddy ishlatilmaydi
  fi
  cat > .env <<EOF
DOMAIN=${DOMAIN}
POSTGRES_PASSWORD=$(openssl rand -hex 24)
JWT_ACCESS_SECRET=$(openssl rand -hex 32)
JWT_REFRESH_SECRET=$(openssl rand -hex 32)
TELEGRAM_BOT_TOKEN=${BOT_TOKEN}
TELEGRAM_GATEWAY_TOKEN=
AUTH_TEST_PHONES=${TEST_PHONES}
AUTH_TEST_CODE=$(shuf -i 100000-999999 -n 1)
EOF
  chmod 600 .env
fi
# Keyinroq berilgan bot tokeni — yangilash
[ -z "$BOT_TOKEN" ] || set_env TELEGRAM_BOT_TOKEN "$BOT_TOKEN"
set_env API_IMAGE "$API_IMAGE"
# jprq rejimi: Caddy o'rniga API faqat 127.0.0.1:3000 da (docker-compose.home.yml)
if [ "$MODE" = jprq ]; then
  set_env COMPOSE_FILE docker-compose.yml:docker-compose.home.yml
else
  sed -i '/^COMPOSE_FILE=/d' .env
fi

echo "==> 6/8 Ishga tushirish"
# Tayyor obraz (GitHub Actions yig'adi) — kuchsiz kompyuterda yig'ishdan ancha tez; bo'lmasa shu yerda yig'iladi
if docker compose pull -q api 2>/dev/null; then
  docker compose up -d
else
  echo "   Tayyor obraz topilmadi — shu yerda yig'iladi (5–30 daqiqa)"
  docker compose up -d --build
fi
# Migratsiyalar tugab, API javob berguncha kutish, so'ng boshlang'ich ma'lumot (qayta yuklash xavfsiz)
for i in $(seq 1 60); do
  docker compose exec -T api wget -qO- http://127.0.0.1:3000/v1/health >/dev/null 2>&1 && break
  sleep 3
done
docker compose exec -T api node dist/db/seed/seed.js
docker image prune -f >/dev/null

echo "==> 7/8 Har kecha zaxira nusxa → $BACKUPS (14 kun saqlanadi)"
mkdir -p "$BACKUPS"
cat > /etc/cron.d/taomdosh-backup <<EOF
15 3 * * * root cd $DIR && docker compose exec -T postgres pg_dump -U taomdosh -Fc taomdosh > $BACKUPS/taomdosh-\$(date +\%F).dump && find $BACKUPS -name '*.dump' -mtime +14 -delete
EOF

echo "==> 8/8 HTTPS manzil"
if [ "$MODE" = jprq ]; then
  command -v jprq >/dev/null || curl -fsSL https://jprq.io/install.sh | bash
  JPRQ_BIN=$(command -v jprq)
  [ -z "$JPRQ_TOKEN" ] || HOME=/root "$JPRQ_BIN" auth "$JPRQ_TOKEN"
  # Tunnel — xizmat: kompyuter qayta yonganda yoki internet uzilib qolganda o'zi qayta ulanadi
  cat > /etc/systemd/system/taomdosh-jprq.service <<EOF
[Unit]
Description=Taomdosh jprq tunnel
After=network-online.target docker.service
Wants=network-online.target

[Service]
Environment=HOME=/root
ExecStart=$JPRQ_BIN http 3000 -s $JPRQ_NAME
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
  systemctl daemon-reload
  systemctl enable taomdosh-jprq >/dev/null 2>&1
  SINCE=$(date '+%Y-%m-%d %H:%M:%S')
  systemctl restart taomdosh-jprq
  URL=""
  for i in $(seq 1 20); do
    URL=$(journalctl -u taomdosh-jprq --since "$SINCE" -o cat 2>/dev/null | grep -o "https://$JPRQ_NAME\.[A-Za-z0-9.-]*" | tail -1 || true)
    [ -n "$URL" ] && break
    sleep 2
  done
  if [ -z "$URL" ]; then
    echo
    echo "jprq tunneli ulanmadi. Oxirgi xabarlar:"
    journalctl -u taomdosh-jprq --since "$SINCE" -o cat --no-pager | tail -15 || true
    echo "Token kerak bo'lsa: https://jprq.io/auth → buyruqni JPRQ_TOKEN='...' bilan qayta ishga tushiring."
    echo "Nom band bo'lsa: boshqa JPRQ_NAME tanlang."
    exit 1
  fi
else
  URL="https://$(grep '^DOMAIN=' .env | cut -d= -f2)"
fi

for i in $(seq 1 30); do
  curl -fsS "$URL/v1/health" >/dev/null 2>&1 && break
  sleep 5
done
echo
if curl -fsS "$URL/v1/health" >/dev/null 2>&1; then
  echo "TAYYOR. API manzili: $URL/v1"
else
  echo "Server ishga tushdi, lekin HTTPS hali tayyor emas. Bir daqiqadan keyin tekshiring: curl $URL/v1/health"
fi
echo "Test raqamlari: $(grep '^AUTH_TEST_PHONES=' .env | cut -d= -f2)"
echo "Test kodi:      $(grep '^AUTH_TEST_CODE=' .env | cut -d= -f2)"
if grep -q '^TELEGRAM_BOT_TOKEN=.\+' .env; then
  echo "Bot:            $(docker compose logs api 2>/dev/null | grep -o '@[A-Za-z0-9_]* ishga tushdi' | tail -1 || true)"
fi
