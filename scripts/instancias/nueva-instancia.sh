#!/usr/bin/env bash
# Crea una instalación nueva del POS en el VPS (un cliente = una instalación).
#
# Uso:   bash nueva-instancia.sh <slug> <dominio> [puerto]
# Ej.:   bash nueva-instancia.sh fritop fritop.stiven.app
#
# Qué hace: clona el repositorio en /home/ubuntu/apps/pos-<slug>, instala, compila, crea server/.env con claves
# nuevas (JWT_SECRET y SETUP_TOKEN), arranca el proceso PM2 pos-<slug>, configura nginx + https (certbot) y la
# registra en /home/ubuntu/apps/pos-instancias.tsv (lo usan actualizar.sh y respaldar.sh).
# Al terminar, abre https://<dominio>/setup?token=<SETUP_TOKEN> y completa la configuración inicial.
set -euo pipefail

SLUG="${1:-}"; DOMAIN="${2:-}"; PORT="${3:-}"
[[ -z "$SLUG" || -z "$DOMAIN" ]] && { echo "Uso: $0 <slug> <dominio> [puerto]"; exit 1; }
[[ "$SLUG" =~ ^[a-z0-9-]{2,30}$ ]] || { echo "El slug debe ser minúsculas, números o guiones"; exit 1; }

APPS=/home/ubuntu/apps
DIR="$APPS/pos-$SLUG"
REGISTRY="$APPS/pos-instancias.tsv"
REPO="${POS_REPO:-git@github-posbase:santequera1/PosBase.git}"
BRANCH="${POS_BRANCH:-main}"
EMAIL="${CERTBOT_EMAIL:-stivenantequera@gmail.com}"
PM2_NAME="pos-$SLUG"
HERE="$(cd "$(dirname "$0")" && pwd)"

[[ -e "$DIR" ]] && { echo "Ya existe $DIR"; exit 1; }
touch "$REGISTRY"
grep -q "^$SLUG	" "$REGISTRY" && { echo "El slug $SLUG ya está registrado"; exit 1; }

# Puerto libre (desde 3100) si no se indica
if [[ -z "$PORT" ]]; then
  PORT=3100
  while ss -ltn | awk '{print $4}' | grep -q ":$PORT\$" || cut -f3 "$REGISTRY" | grep -qx "$PORT"; do PORT=$((PORT + 1)); done
fi
echo "▶ Instalación $SLUG · $DOMAIN · puerto $PORT"

git clone --branch "$BRANCH" "$REPO" "$DIR"
cd "$DIR"
npm ci --no-audit --no-fund
(cd server && npm ci --no-audit --no-fund)
npm run build

SETUP_TOKEN="$(openssl rand -hex 6)"
cat > server/.env <<EOF
PORT=$PORT
JWT_SECRET=$(openssl rand -hex 32)
SETUP_TOKEN=$SETUP_TOKEN
NODE_ENV=production
EOF
chmod 600 server/.env

pm2 start src/index.js --name "$PM2_NAME" --cwd "$DIR/server" --time
pm2 save >/dev/null

# nginx + https
sed -e "s#__DOMAIN__#$DOMAIN#g" -e "s#__DIR__#$DIR#g" -e "s#__PORT__#$PORT#g" "$HERE/nginx.conf.tpl" | sudo tee "/etc/nginx/sites-available/$DOMAIN" >/dev/null
sudo ln -sf "/etc/nginx/sites-available/$DOMAIN" "/etc/nginx/sites-enabled/$DOMAIN"
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "$EMAIL" --redirect || echo "⚠ certbot falló: revisa el DNS de $DOMAIN y corre: sudo certbot --nginx -d $DOMAIN"

printf "%s\t%s\t%s\t%s\t%s\n" "$SLUG" "$DIR" "$PORT" "$DOMAIN" "$PM2_NAME" >> "$REGISTRY"

# Respaldo diario (se instala una sola vez para todas las instalaciones)
if ! crontab -l 2>/dev/null | grep -q "respaldar.sh"; then
  (crontab -l 2>/dev/null; echo "30 4 * * * bash $HERE/respaldar.sh >> $APPS/pos-respaldos.log 2>&1") | crontab -
fi

sleep 2
curl -fsS "http://127.0.0.1:$PORT/api/health" >/dev/null && echo "✅ Servidor en línea"
echo
echo "Listo. Completa la configuración inicial en:"
echo "   https://$DOMAIN/setup?token=$SETUP_TOKEN"
echo "(guarda ese enlace en documentacionyclaves.md: es la única forma de configurar la instalación)"
