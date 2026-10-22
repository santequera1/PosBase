# PosBase — POS para restaurantes, comidas rápidas y heladerías

Producto de DT Growth Partners (Stiven Antequera). **Un solo repositorio = el producto; cada cliente es una instalación
aparte en el VPS** (carpeta, base de datos, logos, `.env`, subdominio y proceso PM2 propios). No se copia el código por
cliente: las mejoras se hacen aquí y se despliegan a las instalaciones con `scripts/instancias/actualizar.sh`.

Idioma: todo en español (interfaz, mensajes, comentarios, commits). El usuario escribe con dictado por voz: nombres
propios pueden llegar mal escritos (p. ej. "Wonka's" como "OneCast"/"Wumpa"; "stiven.app" como "steven.app").

## Instalaciones (sin claves; las claves están en `documentacionyclaves.md`, local y fuera de git)
| Cliente | Dominio | Carpeta en VPS | PM2 | Puerto | Notas |
|---|---|---|---|---|---|
| Wonka's Burger (producción real desde 8-oct-2026) | pos.wailus.co | /home/ubuntu/apps/posbase | posbase-api | 3065 | Factus producción, impresión en red (agente en PC de caja) — ver `docs/clientes/wonkas.md` |
| Demo para prospectos | demo.stiven.app | /home/ubuntu/apps/pos-demo | pos-demo | — | se reinicia cada noche desde una foto |
| Fritop | (pendiente) | — | — | — | usa una versión vieja en /home/ubuntu/apps/fritop (fritop.wailus.co): migrar |

Dominios nuevos: `*.stiven.app` (comodín apuntando al VPS). Los antiguos quedan en `*.wailus.co`.
Registro de instalaciones en el VPS: `/home/ubuntu/apps/pos-instancias.tsv` (slug, carpeta, puerto, dominio, pm2).

## Stack
- Frontend: React 18 + Vite + TypeScript + Tailwind + zustand (`src/`). Build: `npm run build` → `dist/`.
- Backend: Express + better-sqlite3 + socket.io + JWT (`server/src/`). Una base SQLite por instalación (`server/data.db`, o `DB_PATH`).
- Producción: nginx sirve `dist/` y hace proxy de `/api` y `/socket.io` al puerto de la instalación; PM2 mantiene el proceso.
- Variables (`server/.env`): `PORT`, `JWT_SECRET`, `SETUP_TOKEN` (solo instalaciones nuevas), `NODE_ENV`, opcional `WHATSAPP_AI_API_KEY`.

## Mapa rápido
- Mesas / para llevar / domicilios / cocina: `server/src/routes/restaurant.js`, `src/pages/{TablesPage,CounterPage,DeliveryPage,OpenOrderPage,KitchenPage,CourierPage}.tsx`, cobro `src/components/restaurant/CloseOrderModal.tsx`.
- Caja y arqueos: `server/src/routes/{shifts,caja}.js`, `src/components/caja/*`.
- Impresión térmica: en red (agente ESC/POS) `server/src/printing.js`; navegador (respaldo) `src/lib/{thermalPrint,restaurantPrint,netPrint}.ts`.
- Factura electrónica (Factus v1/v2): `server/src/factus.js`, `src/components/ElectronicInvoiceModal.tsx`.
- Personal y nómina (asistencia, propinas, anticipos, préstamos, consumos, novedades, liquidaciones): `server/src/routes/staff.js`, `server/src/payrollExtras.js`, `server/src/payroll.js`, `src/pages/StaffPage.tsx`, `src/components/staff/*`; "Mi cuenta" del colaborador `src/pages/MyAccountPage.tsx`, comprobante `src/lib/payslip.ts`.
- Contabilidad (PUC, asientos automáticos): `server/src/ledger.js`, `server/src/accounting*.js`.
- Inventario y recetas: `server/src/inventory.js`, `src/components/inventory/InventoryModule.tsx`.
- Permisos y perfiles (admin, cajero, mesero, cocina, domiciliario): `server/src/permissions.js`, `src/lib/permissions.ts`.
- Instalación nueva: asistente `/setup` (`server/src/routes/setup.js`, `src/pages/SetupPage.tsx`). Una base recién creada queda con `setupPending=1` y no deja iniciar sesión hasta completarlo.

## Reglas de trabajo (aprendidas en producción)
- **Nunca** subir a git: `.env`, `data.db`, `documentacionyclaves.md`, logos/fotos subidos (`public/branding`, `public/images/uploads`, `public/fonts/uploads`), `server/einvoices/`, `scripts/wonkas/`.
- Antes de tocar datos de una instalación en producción: respaldo con better-sqlite3 `.backup()` en `/home/ubuntu/backups/...`. Preguntar antes de borrar o cambiar datos reales.
- No emitir facturas electrónicas reales (Factus producción va a la DIAN) sin el usuario.
- Diferencias entre clientes = configuración (Configuración, módulos, Personal → Propinas…), nunca código aparte.
- Desplegar primero a la demo, probar, y luego a los clientes (`actualizar.sh demo`, luego `actualizar.sh wonkas`).
- Probar antes de desplegar: el chequeo de tipos real es `npx tsc --noEmit -p tsconfig.app.json` (el `tsconfig.json` raíz no revisa nada). Hay errores de tipo viejos en CheckoutModal, InventoryModule, POSPage y ProductsPage que no afectan el build.
- Pruebas: los scripts de prueba levantan el servidor con `DB_PATH` apuntando a una copia de la base (o restauran la base al terminar) y Playwright contra Vite. Nunca probar contra producción.
- En el VPS el shell remoto mangla las plantillas `${...}` y las barras invertidas dentro de `node -e`: escribir scripts a archivo y copiarlos.
- Los textos para el cliente (WhatsApp) van en español sencillo, sin jerga técnica.

## Comandos
```bash
npm run dev                      # Vite (frontend) — el backend: cd server && npm run dev
npm run build                    # compila dist/
# En el VPS (ver docs/INSTALACION.md):
bash scripts/instancias/nueva-instancia.sh <slug> <dominio>
bash scripts/instancias/actualizar.sh <slug|todas>
bash scripts/instancias/respaldar.sh
```

## Documentos
- `docs/INSTALACION.md` — crear, actualizar y respaldar instalaciones; la demo; repo privado (deploy key).
- `docs/clientes/*.md` — lo propio de cada cliente (sin claves).
- `docs/ACTUALIZACION-2026-10-10.md` — bitácora de la puesta en marcha de Wonka's.
