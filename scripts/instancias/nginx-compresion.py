#!/usr/bin/env python3
# Activa la compresión en los sitios nginx de las instalaciones existentes (gzip de JS, CSS, JSON y SVG, y los
# .gz precomprimidos del build con gzip_static). Sin esto el JavaScript de la app (2,2 MB) viajaba sin comprimir
# y en una conexión lenta la página tardaba casi un minuto en abrir. Idempotente: salta los que ya están.
# Uso (en el VPS): sudo python3 nginx-compresion.py dominio1 dominio2 ...   → luego: sudo nginx -t && sudo systemctl reload nginx
import sys, os, shutil, datetime

GZIP = """
    # Compresión: el JavaScript y el CSS del build viajan comprimidos (de 2,2 MB a ~600 KB)
    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_min_length 1024;
    gzip_types text/plain text/css application/json application/javascript text/javascript image/svg+xml application/xml;
"""
STATIC = "        gzip_static on;   # usa el .gz que deja el build (scripts/comprimir-dist.cjs) si existe\n"

stamp = datetime.datetime.now().strftime('%Y%m%d-%H%M%S')
bk = f'/home/ubuntu/backups/nginx-{stamp}'
for dom in sys.argv[1:]:
    f = f'/etc/nginx/sites-available/{dom}'
    if not os.path.exists(f):
        print(f'✗ {dom}: no existe {f}'); continue
    s = open(f, encoding='utf-8').read()
    if 'gzip_static on' in s:
        print(f'= {dom}: ya estaba actualizado'); continue
    ancla = '    client_max_body_size 25M;\n'
    if ancla not in s or '    location /assets/ {\n' not in s:
        print(f'✗ {dom}: no encontré client_max_body_size o location /assets/'); continue
    nuevo = s.replace(ancla, ancla + GZIP, 1).replace('    location /assets/ {\n', '    location /assets/ {\n' + STATIC, 1)
    os.makedirs(bk, exist_ok=True)
    shutil.copy2(f, os.path.join(bk, dom))
    open(f, 'w', encoding='utf-8').write(nuevo)
    print(f'✓ {dom}: compresión activada (respaldo en {bk})')
