# 🚀 Guía de Despliegue en VPS (Ubuntu + PM2 + Nginx + SSL)

Esta guía explica cómo poner en producción una instancia de este POS en un servidor Ubuntu. Sirve tanto para un servidor nuevo como para **alojar varias heladerías en el mismo VPS** (multi-tenancy): cada instancia usa su propia carpeta, su propio puerto, su propio proceso PM2, su propia base de datos SQLite y su propio subdominio.

> Sustituye los valores entre `<>` por los del cliente. Esta guía no contiene claves ni datos de ningún servidor real.

---

## 1. Requisitos en el servidor (una sola vez)

```bash
# Node.js 20 o superior, PM2, Nginx, Certbot y sqlite3 (para backups)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs nginx certbot python3-certbot-nginx sqlite3
sudo npm install -g pm2
```

Apunta el DNS del subdominio del cliente (ej. `pos.<cliente>.com`) a la IP pública del VPS **antes** de pedir el certificado SSL.

---

## 2. Clonar y compilar la instancia

```bash
cd /home/ubuntu/apps
git clone https://github.com/<usuario>/<repo-del-cliente>.git <cliente>
cd <cliente>

# Frontend (genera la carpeta dist/ que sirve Nginx)
npm install
npm run build

# Backend
cd server
npm install
cp .env.example .env
nano .env        # PORT único por instancia, JWT_SECRET y WHATSAPP_AI_API_KEY aleatorios
```

Genera claves aleatorias con:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## 3. Arrancar el backend con PM2

Elige un puerto libre y distinto para cada instancia (ej. `3060`, `3070`, `3080`):

```bash
cd /home/ubuntu/apps/<cliente>/server
PORT=<puerto> pm2 start src/index.js --name "<cliente>-api"
pm2 save
pm2 startup      # solo la primera vez: hace que PM2 arranque con el sistema
```

Comandos útiles:

```bash
pm2 status
pm2 logs <cliente>-api --lines 50
pm2 restart <cliente>-api
pm2 monit
```

En el primer arranque el servidor crea `server/data.db` y la siembra con el catálogo de ejemplo y los usuarios por defecto (ver README). **Cambia las contraseñas desde la app antes de entregar.**

---

## 4. Configurar Nginx para el subdominio

```bash
sudo nano /etc/nginx/sites-available/pos.<cliente>.com
```

```nginx
server {
    server_name pos.<cliente>.com www.pos.<cliente>.com;
    client_max_body_size 25M;

    root /home/ubuntu/apps/<cliente>/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /assets/ {
        expires 30d;
        add_header Cache-Control "public, no-transform";
        try_files $uri =404;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:<puerto>/api/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    location /socket.io/ {
        proxy_pass http://127.0.0.1:<puerto>/socket.io/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    listen 80;
}
```

```bash
sudo ln -s /etc/nginx/sites-available/pos.<cliente>.com /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

## 5. Certificado SSL gratuito (Let's Encrypt)

```bash
sudo certbot --nginx -d pos.<cliente>.com -d www.pos.<cliente>.com
```

Certbot reescribe el bloque de Nginx para escuchar en `443` y redirigir `80 → 443`. La renovación es automática.

Comprueba: `https://pos.<cliente>.com/api/health` debe responder `{"status":"ok","business":"<nombre configurado en Ajustes>"}`.

---

## 6. Integración con bot de WhatsApp (opcional)

Los endpoints del módulo de IA se autentican con la cabecera `X-API-Key: <WHATSAPP_AI_API_KEY del .env>`:

| Método | URL |
| :--- | :--- |
| POST | `https://pos.<cliente>.com/api/whatsapp-ai/webhook` |
| GET | `https://pos.<cliente>.com/api/whatsapp-ai/sales/summary?period=today` |
| GET | `https://pos.<cliente>.com/api/whatsapp-ai/products` |
| POST | `https://pos.<cliente>.com/api/whatsapp-ai/products/update-price` |
| POST | `https://pos.<cliente>.com/api/whatsapp-ai/products/toggle-availability` |

La pantalla **Ajustes** de la app muestra la URL del webhook ya armada con el dominio en uso.

---

## 7. Copias de seguridad de la base de datos

SQLite corre en modo WAL, así que el backup en caliente seguro es:

```bash
cd /home/ubuntu/apps/<cliente>/server
sqlite3 data.db ".backup backup_$(date +%F_%H%M%S).db"
```

Restaurar:

```bash
pm2 stop <cliente>-api
cp backup_<fecha>.db data.db
rm -f data.db-shm data.db-wal
pm2 start <cliente>-api
```

Sugerencia: programa el backup diario con `crontab -e` y copia los archivos fuera del servidor.

---

## 8. Actualizar la instancia tras cambios en el código

```bash
# Local
git add . && git commit -m "feat: cambios" && git push origin main

# Servidor (un solo comando por SSH)
ssh ubuntu@<ip-del-vps> "cd /home/ubuntu/apps/<cliente> && git pull origin main && npm run build && cd server && npm install --omit=dev && pm2 restart <cliente>-api"
```

---

## 9. Checklist de entrega al cliente

- [ ] Nombre, eslogan, dirección, teléfono, NIT y prefijo de comprobante configurados en **Ajustes → Negocio**.
- [ ] Logotipos reemplazados (`public/logo/logo-dark.svg`, `public/logo/logo-login.svg`, `public/logo.svg`) y `npm run build` ejecutado.
- [ ] Catálogo de productos y precios cargado.
- [ ] Contraseñas de `admin`, `cajero` y `cocina` cambiadas.
- [ ] `JWT_SECRET` y `WHATSAPP_AI_API_KEY` únicos en `server/.env`.
- [ ] HTTPS activo y `/api/health` respondiendo.
- [ ] Backup automático programado.
