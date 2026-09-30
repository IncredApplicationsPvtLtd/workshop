#!/usr/bin/env bash
# One-shot EC2 bootstrap for the live workshop.
# Works on Ubuntu 22.04/24.04 and Amazon Linux 2023 (x86_64 or arm64).
#
# Usage (paste into EC2 Instance Connect in the AWS console):
#   curl -fsSL https://raw.githubusercontent.com/IncredApplicationsPvtLtd/workshop/main/infra/ec2-setup.sh \
#     | sudo EVENT_TOKEN=... DEPLOY_PUBKEY="ssh-ed25519 ..." bash
set -euo pipefail

DOMAIN="${DOMAIN:-workshop.incred.io}"
REPO="${REPO:-IncredApplicationsPvtLtd/workshop}"
EVENT_TOKEN="${EVENT_TOKEN:?set EVENT_TOKEN}"
DEPLOY_PUBKEY="${DEPLOY_PUBKEY:?set DEPLOY_PUBKEY}"
NODE_VERSION="v20.18.0"
APP_DIR=/opt/workshop

log() { echo -e "\n\033[1;35m==> $*\033[0m"; }

log "Detecting OS"
if command -v apt-get >/dev/null; then PKG=apt; else PKG=dnf; fi
echo "package manager: $PKG"

log "Installing nginx, git, python"
if [ "$PKG" = apt ]; then
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -y
  apt-get install -y nginx git curl rsync python3-venv xz-utils
  rm -f /etc/nginx/sites-enabled/default
else
  dnf install -y nginx git rsync python3 xz tar --allowerasing
fi

log "Adding 1 GB swap (t2.micro has only 1 GB RAM)"
if ! swapon --show | grep -q /swapfile; then
  fallocate -l 1G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=1024
  chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  grep -q /swapfile /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

log "Installing Node.js $NODE_VERSION"
ARCH=$(uname -m); case "$ARCH" in x86_64) NARCH=x64;; aarch64) NARCH=arm64;; *) echo "unsupported arch $ARCH"; exit 1;; esac
if ! /usr/local/bin/node -v 2>/dev/null | grep -q "$NODE_VERSION"; then
  curl -fsSL "https://nodejs.org/dist/$NODE_VERSION/node-$NODE_VERSION-linux-$NARCH.tar.xz" | tar -xJ -C /usr/local --strip-components=1
fi
/usr/local/bin/node -v

log "Creating deploy user"
id deploy >/dev/null 2>&1 || useradd -m -s /bin/bash deploy
install -d -m 700 -o deploy -g deploy /home/deploy/.ssh
grep -qF "$DEPLOY_PUBKEY" /home/deploy/.ssh/authorized_keys 2>/dev/null || echo "$DEPLOY_PUBKEY" >> /home/deploy/.ssh/authorized_keys
chown deploy:deploy /home/deploy/.ssh/authorized_keys && chmod 600 /home/deploy/.ssh/authorized_keys
SYSTEMCTL=$(command -v systemctl)
echo "deploy ALL=(root) NOPASSWD: $SYSTEMCTL restart workshop, $SYSTEMCTL status workshop" > /etc/sudoers.d/workshop
chmod 440 /etc/sudoers.d/workshop

log "Installing app code from github.com/$REPO"
if [ ! -d "$APP_DIR/app" ]; then
  rm -rf "$APP_DIR" && git clone --depth 1 "https://github.com/$REPO.git" "$APP_DIR" && rm -rf "$APP_DIR/.git"
  printf '{"sha":"bootstrap","short":"v0","message":"Initial setup","author":"server bootstrap","time":"%s"}\n' "$(date -u +%FT%TZ)" > "$APP_DIR/version.json"
fi
chown -R deploy:deploy "$APP_DIR"

log "Writing secrets + systemd service"
umask 077
cat > /etc/workshop.env <<EOF
PORT=3000
EVENT_TOKEN=$EVENT_TOKEN
NODE_ENV=production
EOF
umask 022
cat > /etc/systemd/system/workshop.service <<EOF
[Unit]
Description=Live Workshop app
After=network.target

[Service]
User=deploy
WorkingDirectory=$APP_DIR
EnvironmentFile=/etc/workshop.env
ExecStart=/usr/local/bin/node app/server.js
Restart=always
RestartSec=1
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable --now workshop
systemctl restart workshop

log "Configuring nginx"
cat > /etc/nginx/conf.d/workshop.conf <<EOF
upstream workshop_app { server 127.0.0.1:3000; keepalive 64; }

server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN 3.7.219.133 _;

    location /api/stream {
        proxy_pass http://workshop_app;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_set_header Host \$host;
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 1h;
    }

    location / {
        proxy_pass http://workshop_app;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_read_timeout 60s;
    }
}
EOF
# More connections than the default 768/1024 — a hall of phones holds many open streams.
sed -i 's/worker_connections [0-9]*;/worker_connections 8192;/' /etc/nginx/nginx.conf
grep -q worker_rlimit_nofile /etc/nginx/nginx.conf || sed -i '1i worker_rlimit_nofile 65535;' /etc/nginx/nginx.conf
nginx -t
systemctl enable nginx
systemctl restart nginx

log "Getting HTTPS certificate from Let's Encrypt"
if [ ! -x /opt/certbot/bin/certbot ]; then
  python3 -m venv /opt/certbot
  /opt/certbot/bin/pip install --quiet --upgrade pip
  /opt/certbot/bin/pip install --quiet certbot certbot-nginx
  ln -sf /opt/certbot/bin/certbot /usr/local/bin/certbot
fi
if /opt/certbot/bin/certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --register-unsafely-without-email --redirect; then
  # Turn on HTTP/2 so phones aren't limited to 6 connections.
  sed -i 's/listen 443 ssl;/listen 443 ssl http2;/; s/listen \[::\]:443 ssl ipv6only=on;/listen [::]:443 ssl http2 ipv6only=on;/' /etc/nginx/conf.d/workshop.conf
  nginx -t && systemctl reload nginx
  echo "0 3 * * * root /opt/certbot/bin/certbot renew --quiet --deploy-hook 'systemctl reload nginx'" > /etc/cron.d/certbot-renew
else
  echo "!! certbot failed — site still works on http://$DOMAIN. Check DNS + port 80 in the security group, then rerun."
fi

log "Health check"
sleep 1
curl -fsS http://127.0.0.1:3000/api/health && echo
echo -e "\n\033[1;32m✅ Done. Open https://$DOMAIN and https://$DOMAIN/dashboard\033[0m"
