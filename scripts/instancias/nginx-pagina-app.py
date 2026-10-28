#!/usr/bin/env python3
# Actualiza los sitios nginx de las instalaciones existentes para que la página de la app la entregue el servidor
# (con los metadatos del negocio) en vez de servir index.html estático. Idempotente: salta los que ya están.
# Uso (en el VPS): sudo python3 nginx-pagina-app.py dominio1 dominio2 ...   → luego: sudo nginx -t && sudo systemctl reload nginx
import re, sys, os, shutil, datetime

NUEVO = """    location / {
        # Los archivos del build se sirven directo; la página de la app (en cualquier ruta) la entrega el servidor
        # con el nombre, la descripción y el logo del negocio (vista previa al compartir el enlace por WhatsApp).
        try_files $uri @app;
    }

    location @app {
        # La página principal se revalida siempre: así cada versión nueva llega sin borrar caché
        expires -1;
        add_header Cache-Control "no-cache, must-revalidate" always;
        proxy_pass http://127.0.0.1:__PORT__;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        # Si el servidor está caído o reiniciando, se entrega el index.html del build tal cual
        proxy_intercept_errors on;
        error_page 502 503 504 =200 /index.html;
    }
"""

stamp = datetime.datetime.now().strftime('%Y%m%d-%H%M%S')
bk = f'/home/ubuntu/backups/nginx-{stamp}'
for dom in sys.argv[1:]:
    f = f'/etc/nginx/sites-available/{dom}'
    if not os.path.exists(f):
        print(f'✗ {dom}: no existe {f}'); continue
    s = open(f, encoding='utf-8').read()
    if 'location @app' in s:
        print(f'= {dom}: ya estaba actualizado'); continue
    m = re.search(r'proxy_pass http://127\.0\.0\.1:(\d+)/api/;', s)
    if not m:
        print(f'✗ {dom}: no encontré el puerto (proxy_pass /api/)'); continue
    port = m.group(1)
    nuevo, n = re.subn(r'    location / \{\n.*?\n    \}\n', NUEVO.replace('__PORT__', port), s, count=1, flags=re.S)
    if n != 1:
        print(f'✗ {dom}: no encontré el bloque "location /"'); continue
    os.makedirs(bk, exist_ok=True)
    shutil.copy2(f, os.path.join(bk, dom))
    open(f, 'w', encoding='utf-8').write(nuevo)
    print(f'✓ {dom}: puerto {port} (respaldo en {bk})')
