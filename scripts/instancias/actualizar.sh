#!/usr/bin/env bash
# Actualiza instalaciones del POS a la última versión del repositorio (con respaldo de la base antes).
#
# Uso:   bash actualizar.sh <slug>        una instalación (ej. demo)
#        bash actualizar.sh todas         todas las del registro
# Orden recomendado: primero la demo, se prueba, y después los clientes.
set -uo pipefail

APPS=/home/ubuntu/apps
REGISTRY="$APPS/pos-instancias.tsv"
BACKUPS=/home/ubuntu/backups/pos
TARGET="${1:-}"
[[ -z "$TARGET" ]] && { echo "Uso: $0 <slug|todas>"; cut -f1,4 "$REGISTRY"; exit 1; }

update_one() {
  local slug="$1" dir="$2" port="$3" domain="$4" pm2name="$5"
  echo "━━━ $slug ($domain)"
  cd "$dir" || { echo "✗ no existe $dir"; return 1; }
  # 1) Respaldo
  mkdir -p "$BACKUPS/$slug"
  local db="${DB_PATH_OVERRIDE:-$dir/server/data.db}"
  if [[ -f "$db" ]]; then
    (cd server && node -e "require('better-sqlite3')('$db').backup('$BACKUPS/$slug/antes-actualizar-$(date +%Y%m%d-%H%M%S).db').then(()=>console.log('  respaldo ok'))") || { echo "✗ respaldo falló: no se actualiza"; return 1; }
  fi
  # 2) Código
  local before_lock before_srv_lock
  before_lock=$(md5sum package-lock.json | cut -d' ' -f1); before_srv_lock=$(md5sum server/package-lock.json | cut -d' ' -f1)
  git pull --ff-only -q || { echo "✗ git pull falló (¿cambios locales?)"; return 1; }
  [[ "$before_lock" != "$(md5sum package-lock.json | cut -d' ' -f1)" ]] && npm ci --no-audit --no-fund
  [[ "$before_srv_lock" != "$(md5sum server/package-lock.json | cut -d' ' -f1)" ]] && (cd server && npm ci --no-audit --no-fund)
  npm run build >/dev/null 2>&1 || { echo "✗ build falló"; return 1; }
  pm2 restart "$pm2name" >/dev/null
  sleep 2
  if curl -fsS "http://127.0.0.1:$port/api/health" >/dev/null; then echo "  ✅ $(git log --oneline -1)"; else echo "  ✗ no responde: revisa pm2 logs $pm2name"; return 1; fi
}

fails=0
while IFS=$'\t' read -r slug dir port domain pm2name; do
  [[ -z "$slug" || "$slug" == \#* ]] && continue
  if [[ "$TARGET" == "todas" || "$TARGET" == "$slug" ]]; then update_one "$slug" "$dir" "$port" "$domain" "$pm2name" || fails=$((fails + 1)); fi
done < "$REGISTRY"
[[ $fails -gt 0 ]] && { echo "⚠ $fails instalación(es) con problemas"; exit 1; }
echo "Listo."
