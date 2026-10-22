#!/usr/bin/env bash
# Respaldo diario de la base de datos de cada instalación (lo corre cron a las 4:30 a. m.).
# Guarda /home/ubuntu/backups/pos/<slug>/diario-AAAAMMDD.db y conserva los últimos 21 días.
set -uo pipefail
APPS=/home/ubuntu/apps
REGISTRY="$APPS/pos-instancias.tsv"
BACKUPS=/home/ubuntu/backups/pos
KEEP_DAYS="${KEEP_DAYS:-21}"
stamp=$(date +%Y%m%d)
while IFS=$'\t' read -r slug dir port domain pm2name; do
  [[ -z "$slug" || "$slug" == \#* ]] && continue
  db="$dir/server/data.db"
  [[ -f "$db" ]] || continue
  mkdir -p "$BACKUPS/$slug"
  (cd "$dir/server" && node -e "require('better-sqlite3')('$db').backup('$BACKUPS/$slug/diario-$stamp.db').then(()=>console.log('$(date "+%F %T") $slug ok'))") || echo "$(date "+%F %T") $slug FALLÓ"
  # Facturas electrónicas guardadas (PDF/XML) también
  [[ -d "$dir/server/einvoices" ]] && tar -czf "$BACKUPS/$slug/facturas-$stamp.tgz" -C "$dir/server" einvoices 2>/dev/null
  find "$BACKUPS/$slug" -name 'diario-*.db' -mtime +"$KEEP_DAYS" -delete
  find "$BACKUPS/$slug" -name 'facturas-*.tgz' -mtime +"$KEEP_DAYS" -delete
done < "$REGISTRY"
