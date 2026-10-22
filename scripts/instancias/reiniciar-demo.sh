#!/usr/bin/env bash
# Deja la demo como recién instalada cada noche: restaura la base "foto" (snapshot) y reinicia el proceso.
# La foto se toma una vez, con los datos de demostración cargados:
#   bash reiniciar-demo.sh --foto      → guarda la base actual como foto
#   bash reiniciar-demo.sh             → restaura la foto (lo corre cron a las 3:00 a. m.)
set -euo pipefail
SLUG="${DEMO_SLUG:-demo}"
DIR="/home/ubuntu/apps/pos-$SLUG"
SNAP="/home/ubuntu/backups/pos/$SLUG/foto-demo.db"
mkdir -p "$(dirname "$SNAP")"
if [[ "${1:-}" == "--foto" ]]; then
  (cd "$DIR/server" && node -e "require('better-sqlite3')('$DIR/server/data.db').backup('$SNAP').then(()=>console.log('foto guardada: $SNAP'))")
  if ! crontab -l 2>/dev/null | grep -q "reiniciar-demo.sh"; then
    (crontab -l 2>/dev/null; echo "0 3 * * * bash $(cd "$(dirname "$0")" && pwd)/reiniciar-demo.sh >> /home/ubuntu/apps/pos-demo-reinicio.log 2>&1") | crontab -
    echo "cron instalado (3:00 a. m.)"
  fi
  exit 0
fi
[[ -f "$SNAP" ]] || { echo "No hay foto en $SNAP (corre primero con --foto)"; exit 1; }
pm2 stop "pos-$SLUG" >/dev/null
rm -f "$DIR/server/data.db-wal" "$DIR/server/data.db-shm"
cp "$SNAP" "$DIR/server/data.db"
pm2 start "pos-$SLUG" >/dev/null
echo "$(date '+%F %T') demo reiniciada"
