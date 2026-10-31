# Instalaciones del POS (un cliente = una instalación)

Todas las instalaciones usan el mismo código (este repositorio). Cada una tiene en el VPS su carpeta
`/home/ubuntu/apps/pos-<slug>`, su base de datos, sus logos/fotos, su `server/.env`, su puerto, su proceso PM2
`pos-<slug>` y su dominio. El registro está en `/home/ubuntu/apps/pos-instancias.tsv`.

## Crear una instalación nueva
1. El dominio debe apuntar al VPS. Con `*.stiven.app` ya está (comodín): `cliente.stiven.app` funciona de una.
   Si es un dominio propio del cliente, que creen un registro **A** con el nombre (p. ej. `pos`) apuntando a la IP del VPS.
2. En el VPS:
   ```bash
   bash /home/ubuntu/apps/posbase/scripts/instancias/nueva-instancia.sh <slug> <dominio>
   # ej.: bash .../nueva-instancia.sh fritop fritop.stiven.app
   ```
   Clona el repositorio, instala, compila, crea `server/.env` (claves nuevas), arranca PM2, configura nginx + https,
   la registra y deja el respaldo diario programado. Al final imprime el enlace de configuración:
   `https://<dominio>/setup?token=<código>` → guárdalo en `documentacionyclaves.md`.
3. Abre ese enlace: nombre del negocio, NIT, tipo de negocio (restaurante, comidas rápidas, heladería, bar), menú vacío
   o de ejemplo y el administrador con su contraseña. Mientras no se complete, nadie puede iniciar sesión.
4. Dentro del sistema: Configuración → Marca (logo y colores), Negocio (impuesto INC/IVA), Impresoras, Factura
   electrónica (credenciales Factus del cliente), Usuarios y Personal.

## Actualizar
```bash
bash /home/ubuntu/apps/posbase/scripts/instancias/actualizar.sh demo     # primero la demo
bash /home/ubuntu/apps/posbase/scripts/instancias/actualizar.sh wonkas   # luego cada cliente
bash /home/ubuntu/apps/posbase/scripts/instancias/actualizar.sh todas
```
Respaldan la base antes (`/home/ubuntu/backups/pos/<slug>/antes-actualizar-*.db`), hacen `git pull`, reinstalan
dependencias solo si cambiaron, compilan, reinician y verifican `/api/health`. Los equipos de los clientes ven el aviso
"Actualizar" (el celular del domiciliario y la cocina se recargan solos).

## Respaldos
`respaldar.sh` corre cada día a las 4:30 a. m. (cron): base de datos y facturas electrónicas de cada instalación en
`/home/ubuntu/backups/pos/<slug>/`, se conservan 21 días. Restaurar: detener PM2, copiar el `.db` sobre
`server/data.db` (borrando `-wal`/`-shm`) y arrancar.

## La demo (demo.stiven.app)
- Se creó con `nueva-instancia.sh demo demo.stiven.app`, configuración inicial tipo **Restaurante con menú de ejemplo**,
  y datos de demostración:
  ```bash
  cd /home/ubuntu/apps/pos-demo/server && node ../scripts/instancias/datos-demo.cjs http://127.0.0.1:<puerto> <admin> <clave>
  bash /home/ubuntu/apps/pos-demo/scripts/instancias/reiniciar-demo.sh --foto   # guarda la foto e instala el cron
  ```
- Cada noche (3:00 a. m.) vuelve a la foto: los prospectos pueden tocar todo sin dañarla.
- Usuarios de prueba (clave `Demo2026*`): `caja`, `mesero1`, `mesero2`, `cocina`, `domi1`, `domi2`. El administrador de la
  demo está en `documentacionyclaves.md`.

### Paquetes de demostración (cambiar de negocio ficticio)
- Con `DEMO_MODE=1` en `server/.env` aparece **Configuración → Modo demostración**: 6 negocios ficticios (hamburguesería,
  heladería, italiana, café, comida típica, mariscos). Cada uno trae marca, colores, letras, menú, mesas, una semana de
  ventas y 3 mesas ocupadas. Al aplicarlo se borran ventas, menú y clientes de la instalación; usuarios y personal se quedan.
- En una instalación normal (sin `DEMO_MODE`) la pestaña no existe y la API responde 403.
- Los paquetes están en `server/src/demoPacks.js`. Logos y fotos (los hace el diseñador) van en
  `public/demo-packs/<id>/`: `logo`, `logo-login` y una foto por producto con el nombre en minúsculas y guiones
  (`Pizza margarita` → `pizza-margarita`), en `.webp`, `.png`, `.jpg` o `.svg`. Si no hay archivo, se usa el nombre o un ícono.
- Después de cambiar de paquete en una demo con reinicio nocturno, volver a tomar la foto (`reiniciar-demo.sh --foto`),
  o a las 3:00 a. m. vuelve al paquete anterior.
- Demo fija de un paquete: `nueva-instancia.sh <slug> <slug>.stiven.app`, configuración inicial, `DEMO_MODE=1`,
  `datos-demo.cjs ... --solo-usuarios`, aplicar el paquete y `DEMO_SLUG=<slug> reiniciar-demo.sh --foto` (cada demo tiene su cron).

## Migrar desde la versión vieja del POS
`scripts/instancias/migrar-pos-viejo.cjs` pasa usuarios (con sus mismas contraseñas), categorías, productos, mesas,
ventas cerradas con sus productos y el nombre del negocio. Lee la base vieja en solo lectura. Uso: crear la instalación,
hacer la configuración inicial (menú vacío), detener su PM2 y correr desde su carpeta `server`:
`node ../scripts/instancias/migrar-pos-viejo.cjs /ruta/base-vieja.db`. Repetir justo antes de pasarse para traer las
ventas de los últimos días (vuelve a copiar todo).

## Repositorio privado
El VPS descarga el código con una llave de solo lectura (`~/.ssh/posbase_deploy`, alias `github-posbase`).
Antes de poner el repo en privado:
1. GitHub → PosBase → Settings → Deploy keys → Add deploy key → pegar la llave pública del VPS
   (`cat ~/.ssh/posbase_deploy.pub`), **sin** permiso de escritura.
2. En cada instalación: `git remote set-url origin git@github-posbase:santequera1/PosBase.git` (el script de
   instalación ya usa ese remoto; Wonka's se cambia una vez).

## Ya no se usa
`GUIA_DUPLICACION_HELADERIAS.md` (copiar la carpeta por cliente) quedó obsoleta: las copias se quedan sin las mejoras.

## Vista previa al compartir el enlace (28-oct-2026)

La página de la app la entrega el servidor (`server/src/indexHtml.js`) con el nombre, la descripción, el color y la imagen
del negocio (`og:image`: Marca → "Al compartir el enlace", o la foto del login, o el logo). nginx sirve los archivos del
build y manda la página al servidor (`location / { try_files $uri @app; }`, ver `nginx.conf.tpl`). Las instalaciones
creadas antes se actualizan una sola vez con:

```bash
sudo python3 scripts/instancias/nginx-pagina-app.py dominio1 dominio2 ... && sudo nginx -t && sudo systemctl reload nginx
```

Hecho el 28-oct-2026 en demo, moodi, fritop y pokotoon, y el 31-oct-2026 en pos.wailus.co (Wonka's).
