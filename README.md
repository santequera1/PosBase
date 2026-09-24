# 🍨 Gelato POS — Sistema Integral de Punto de Venta para Heladerías & Gelaterías

> **Sistema de Punto de Venta (POS), Facturación, Control de Turnos de Caja, Métricas por Presentación y Módulo de Inteligencia Artificial para WhatsApp.**

Diseñado especialmente para el flujo de trabajo de heladerías artesanales, gelaterías y cafeterías: gestión ágil de mostradores, venta por porciones y envases (4 oz, 6 oz, conos, litros), combinaciones de sabores prorrateadas, arqueo de caja ciego, impresión térmica e integración con asistentes de IA.

---

## 🚀 Características Principales

### ✨ Novedades v2.1 — marca blanca, finanzas y nómina
- **Marca (Ajustes → Marca):** paleta a partir de 3 colores con verificación automática de contraste (WCAG) y ajuste con un clic, 8 presets, tipografías incluidas, de Google Fonts o propias (TTF/OTF/WOFF), logo principal, logo para fondos claros y favicon generado automáticamente desde el logo.
- **Modo oscuro y tipografías:** presets claros y oscuros (Noche, Bosque oscuro, Grafito, Berenjena) con los mismos controles de contraste; cada persona puede alternar claro/oscuro desde el icono del encabezado solo para su pantalla; selector de fuentes con buscador y vista previa de cada familia, y 12 combinaciones recomendadas de títulos + texto + decorativa que se aplican con un clic.
- **Menú e IA WhatsApp:** categorías editables y eliminables desde la misma vista de Menú (no se borran si tienen productos), Escape cierra el administrador de imágenes y los formularios, y en Ajustes → IA WhatsApp un checklist define qué debe hacer el asistente (reportes diario/semanal/mensual, alertas de stock, cierre de caja, cuentas por pagar y consultas por chat).
- **Nómina colombiana:** horas extra diurnas y nocturnas, recargo nocturno (7 p. m. a 6 a. m.), recargo dominical y festivo (festivos calculados con la Ley Emiliani), auxilio de transporte y deducciones de salud y pensión, con parámetros editables (jornada de 42 h, porcentajes, salario mínimo). El cierre de caja muestra las observaciones del cajero y el reporte Z del historial usa los totales firmados; en Contabilidad el libro diario y los medios de pago se abren por comprobante y los pagos mixtos muestran cómo se pagaron.
- **Estado de resultados contable:** ventas brutas, descuentos, impuesto recaudado, costo de ventas, utilidad bruta, gastos de personal / administrativos / de ventas, utilidad operativa, gastos financieros, utilidad antes de impuestos, renta estimada (tarifa configurable) y utilidad neta, con el detalle por categoría y exportación a Excel; cada categoría de gasto define su grupo en el estado de resultados.
- **Usuarios (Ajustes → Usuarios):** crear cajeros, cocina y administradores, cambiar contraseñas y desactivar accesos sin perder el historial de caja.
- **Finanzas:** gastos por categoría (insumos, operativos, nómina), compras a proveedores de contado o a crédito, cuentas por pagar con vencimientos, descuento directo de la caja abierta y estado de resultados mes a mes (ventas − insumos − gastos − nómina = utilidad neta).
- **Contabilidad (Finanzas → Contabilidad):** impuestos configurables (INC o IVA incluidos en el precio) con base e impuesto desglosados en los recibos; informe del período con libro de ventas diario y por comprobante, libro de compras y gastos con NIT y número de factura, resumen de impuestos, nómina pagada, cierres de caja y cuentas por pagar; exportación CSV para Excel e impresión a PDF.
- **Inventario:** cada producto puede ser "siempre disponible" o con control de stock (cantidad y mínimo); las ventas descuentan unidades, en cero se marca agotado y al reponer vuelve a estar disponible; ajustes manuales con motivo e historial de movimientos, devolución automática al anular un pedido y alerta de stock bajo.
- **Exportación a Excel real (.xlsx):** Ventas e ingresos y el informe contable se descargan como libros de Excel (varias hojas, fecha y hora separadas, totales numéricos), sin problemas de separadores en Excel en español.
- **Factura electrónica en modo pruebas:** las ventas marcadas como F.E. generan un documento simulado (prefijo FEP, CUFE y QR de prueba) claramente marcado como sin validez fiscal, para demostrar el flujo mientras se conecta el proveedor tecnológico (Factus). El cliente queda registrado en el directorio con solo cédula o NIT.
- **POS:** tarjeta de última venta para verla o reimprimirla al instante; cierre de caja visible en pantalla desde el historial.
- **Personal y Nómina:** colaboradores con modalidad de pago (por turno, día, hora, quincena o mes), asistencia automática al abrir/cerrar caja, propinas comunes o directas, anticipos vinculados a la caja y liquidación por período que se registra como gasto de nómina.

### 1. 🍨 Venta Rápida y Personalizada de Helados
- **Gestión por Tamaños y Envases:** Selección intuitiva de presentación (Vaso 4 oz de 1 sabor, Vaso 6 oz de 2 sabores, Conos Waffle, Litro Familiar, Toppings, Bebidas y Café).
- **Sabores Múltiples:** Manejo de copas/vasos con hasta 2 sabores divididos automáticamente y prorrateados en precio e inventario.
- **Modo Comandas / Cuentas Simultáneas:** Apertura y cobro de múltiples cuentas independientes sin bloquear el mostrador.
- **Descuentos Dinámicos:** Aplicación de promociones y descuentos porcentuales o de valor fijo con limpieza automática tras cobrar.

### 2. 💳 Métodos de Pago Flexibles
- **Múltiples Formas de Pago:** Efectivo con cálculo de cambio, Tarjeta Débito y Tarjeta Crédito (Datáfono), Transferencia bancaria (Nequi, Bancolombia, QR) y Crédito.
- **Pagos Mixtos / Divididos:** Capacidad de cobrar una misma cuenta combinando dos métodos (ej. parte en efectivo y parte por transferencia).

### 3. 🧾 Facturación e Impresión Térmica
- **Comprobantes e Impresión Directa:** Generación de recibo/factura POS optimizado para tiqueteras térmicas estándar (58mm y 80mm).
- **Exportación Contable:** Descarga de reportes en formato CSV / Excel filtrado por fechas y turnos.

### 4. 🔒 Control de Turnos y Arqueo de Caja (Caja Ciega)
- **Apertura de Turno:** Registro obligatorio de base inicial en efectivo con fecha, hora y cajero asignado.
- **Movimientos de Caja:** Registro justificado de retiros (salidas para compras/gastos) y depósitos menores.
- **Cierre Ciego:** El cajero ingresa el conteo físico de dinero sin ver el total del sistema para evitar inconsistencias; el sistema calcula sobrantes o faltantes.

### 5. 📊 Estadísticas y Proyección de Inventario
- **Métricas de Envases Vendidos:** Tarjetas dedicadas que totalizan la cantidad de vasos de 4 oz, 6 oz, conos y litros comercializados en el día o período.
- **Tarjeta «Total Vasos Físicos (4 oz + 6 oz)»:** Conteo consolidado de vasos descartables consumidos para facilitar pedidos a proveedores y proyecciones de stock.
- **Ranking de Sabores Filtrable:** Gráfica interactiva con pestañas de filtro (`Todos`, `Todos los Vasos`, `Vaso 4 oz`, `Vaso 6 oz`, `Conos`, `Litros`) y tooltip con desglose exacto de presentación por cada sabor.
- **Ventas por Día (Histórico Interactivo):** Gráfico de barras con selector de tiempo rápido para ver tendencias de ingresos diarios.

### 6. 🤖 Integración con Inteligencia Artificial para WhatsApp
- **API REST & Webhooks para Bots:** Endpoints protegidos por API Key para que agentes de IA en WhatsApp (Evolution API, ManyChat, n8n, etc.) puedan:
  - Consultar resúmenes de ventas del día o ayer con texto preformateado.
  - Consultar catálogo y disponibilidad de sabores en tiempo real.
  - Modificar precios de productos directamente desde WhatsApp.
  - Marcar productos como agotados o disponibles.
  - Consultar datos y saldo de clientes.

### 7. 🖼️ Gestor Multimedia y Visor de Imágenes
- Módulo para subir fotos de sabores y presentaciones en formato WebP optimizado, permitiendo asociar cualquier imagen cargada a cualquier producto del catálogo.

---

## 🛠️ Arquitectura Tecnológica

| Componente | Tecnologías Utilizadas |
| :--- | :--- |
| **Frontend** | React 18, TypeScript, Vite, Tailwind CSS, Radix UI / Shadcn, Lucide Icons, Recharts, Framer Motion, Zustand |
| **Backend API** | Node.js, Express, Socket.IO, JWT (`jsonwebtoken`), `bcryptjs`, `cors` |
| **Base de Datos** | SQLite (`better-sqlite3`) en modo WAL (Write-Ahead Logging), embebida en un único archivo (`data.db`) |
| **Servidor Web** | Nginx como Reverse Proxy (SSL automático con Let's Encrypt / Certbot) |
| **Gestor de Procesos** | PM2 para ejecución 24/7 y reinicio automático |

---

## 💻 Instalación y Ejecución Local

### Prerrequisitos
- **Node.js** v18 o superior instalado ([nodejs.org](https://nodejs.org/))
- **npm** o **pnpm**
- **Git**

### Paso 1: Clonar el proyecto
```bash
git clone https://github.com/tu-usuario/pos-heladeria.git
cd pos-heladeria
```

### Paso 2: Instalar dependencias del Frontend y Backend
```bash
# 1. Dependencias del Frontend (carpeta raíz)
npm install

# 2. Dependencias del Backend (carpeta server/)
cd server
npm install
cd ..
```

### Paso 3: Configurar variables de entorno (Opcional en local)
```bash
# Frontend
cp .env.example .env

# Backend
cd server
cp .env.example .env
cd ..
```
*(Por defecto, en modo desarrollo Vite tiene un proxy configurado hacia `http://localhost:3001` sin requerir configuraciones adicionales).*

### Paso 4: Iniciar el Backend
En una terminal:
```bash
cd server
npm run dev
```
El servidor backend arrancará en `http://localhost:3001`. En el primer inicio creará automáticamente la base de datos `server/data.db` con las tablas y datos semilla predeterminados.

### Paso 5: Iniciar el Frontend
En otra terminal (carpeta raíz):
```bash
npm run dev
```
La aplicación web estará disponible en `http://localhost:8080`.

### 🔑 Credenciales por Defecto (Semilla)
| Usuario | Contraseña | Rol | Permisos |
| :--- | :--- | :--- | :--- |
| **admin** | `Admin2026*` | Administrador | Acceso total, eliminación de comprobantes, ajustes y reportes |
| **cajero** | `Cajero2026*` | Cajero | Venta en mostrador, apertura y cierre de caja, comandas |
| **cocina** | `Cocina2026*` | Despacho/Cocina | Pantalla de pedidos en preparación y entrega |

*(Se recomienda cambiar estas contraseñas en producción desde el panel de Ajustes).*

---

## 🎨 Guía de Duplicación (Marca Blanca / White-Label) para otra Heladería

Si deseas vender o presentar este sistema a una **nueva heladería o gelatería**, sigue estos sencillos pasos:

### 1. Cambiar Datos de la Empresa
La forma más rápida: entrar como **admin** a **Ajustes → Negocio** y editar nombre, eslogan, dirección, teléfono, NIT y prefijo de comprobante. Los cambios se reflejan de inmediato en el encabezado, en los recibos térmicos y en los reportes de WhatsApp. Los valores iniciales de la semilla están en `server/src/db.js` (función `seedIfEmpty`):
```javascript
insertSetting.run('businessName', 'Nombre de la Nueva Heladería');
insertSetting.run('businessSlogan', 'Gelato Tradicional & Café');
insertSetting.run('businessAddress', 'Dirección del nuevo local');
insertSetting.run('businessPhone', '+57 300 000 0000');
insertSetting.run('businessNit', '900.000.000-1');
insertSetting.run('invoicePrefix', 'POS-01');
```
*(También se pueden modificar directamente en cualquier momento desde la pantalla de **Ajustes** en la aplicación).*

### 2. Cambiar la Paleta de Colores y Tipografías
Edita `tailwind.config.ts` para adaptar la paleta a los colores de la marca del nuevo cliente:
```typescript
colors: {
  // Paleta personalizada de la nueva heladería
  gia: {
    crema: "#FFFDF7",       // Fondo suave
    azul: "#1E3A8A",        // Color principal de botones y navegación
    "azul-oscuro": "#0F172A",// Encabezados y barras
    oliva: "#10B981",       // Acentos y detalles
    tarjeta: "#F8FAFC",     // Fondo de cards
  }
}
```
Y en `index.html`, ajusta el `<title>`, favicon y meta-etiquetas:
```html
<title>Mi Nueva Heladería — Punto de Venta POS</title>
```

Reemplaza los logotipos de ejemplo (son SVG; pueden ser PNG ajustando la ruta en el código):
- `public/logo/logo-dark.svg` → barra lateral y header (`src/components/AppLayout.tsx`).
- `public/logo/logo-login.svg` → pantalla de acceso (`src/pages/LoginPage.tsx`).
- `public/logo.svg` → favicon (`index.html`).

### 3. Configurar Catálogo de Sabores y Precios
En `server/src/db.js`, edita la lista `prods` con los sabores propios del cliente:
- Asigna las categorías (`1: Clásicos`, `2: Frutales`, `3: Especiales`, `4: Bebidas`, `5: Toppings/Conos`).
- Define los precios y tamaños (ej. Vaso Pequeño, Vaso Grande, Litros).

### 4. Reiniciar la Base de Datos para el nuevo cliente
Para iniciar con una base de datos 100% limpia sin ventas previas:
```bash
# En el servidor o local:
cd server
rm data.db data.db-shm data.db-wal
npm run start
```
El sistema detectará que no hay base de datos y la reconstruirá desde cero con la configuración de la nueva marca.

---

## 📦 Instrucciones para Subir el Proyecto a un NUEVO Repositorio de GitHub

Sigue estos pasos con la terminal para subir la versión duplicada a una cuenta nueva de GitHub:

### Opción A: Crear una copia limpia sin el historial previo (Recomendado para nuevos clientes)
```bash
# 1. Navegar a la carpeta del proyecto
cd "C:\Users\STIVEN ANTEQUERA\Desktop\Antigravity\POS-base"

# 2. Si quieres un repositorio nuevo independiente, elimina el enlace git anterior:
# En Windows PowerShell:
Remove-Item -Recurse -Force .git

# 3. Inicializar el nuevo repositorio Git:
git init

# 4. Asegurarte de que el .gitignore esté presente y proteja archivos privados:
git status

# 5. Agregar todos los archivos del proyecto:
git add .

# 6. Hacer el primer commit limpio:
git commit -m "feat: initial commit - sistema pos para heladeria"

# 7. Renombrar la rama principal a main:
git branch -M main

# 8. Vincular a tu nuevo repositorio en GitHub:
# (Crea primero el repositorio vacío en github.com/new sin README ni .gitignore)
git remote add origin https://github.com/TU_USUARIO/TU_NUEVO_REPOSITORIO.git

# 9. Subir a GitHub:
git push -u origin main
```

### Opción B: Usando GitHub CLI (`gh`) en un solo paso
Si tienes instalada la herramienta `gh`:
```bash
gh auth login
gh repo create pos-nueva-heladeria --private --source=. --remote=origin --push
```

---

## 📁 Estructura del Código

```text
├── index.html                 # Plantilla HTML con tipografías y metas
├── package.json               # Dependencias y scripts del Frontend
├── tailwind.config.ts         # Configuración de estilos y paleta de colores
├── vite.config.ts             # Configuración de Vite y proxy de desarrollo
├── public/                    # Recursos públicos e imágenes de productos (.webp)
├── src/
│   ├── App.tsx                # Rutas y conexión Socket.IO
│   ├── components/            # Modales, carrito, visor de medios, facturas
│   ├── pages/                 # Páginas: POS, Pedidos, Turnos, Clientes, Reportes, Ajustes
│   ├── store/useStore.ts      # Store global de estado reactivo con Zustand
│   └── lib/api.ts             # Cliente HTTP con autenticación por Token
└── server/
    ├── package.json           # Dependencias del Backend
    ├── data.db                # Archivo SQLite (ignorado en git)
    ├── src/
    │   ├── index.js           # Servidor Express y Socket.IO
    │   ├── db.js              # Migraciones automáticas, esquema y datos semilla
    │   ├── auth.js            # Middleware de validación JWT
    │   └── routes/
    │       ├── auth.js        # Login y verificación de sesión
    │       ├── products.js    # CRUD de productos y disponibilidad
    │       ├── orders.js      # Creación y gestión de pedidos
    │       ├── shifts.js      # Apertura, movimientos y cierre de caja
    │       ├── reports.js     # Balances contables y estadísticas
    │       └── whatsappAi.js  # Integración para bots de WhatsApp
```

---

## 📄 Licencia y Derechos
Desarrollado como solución tecnológica especializada para puntos de venta del sector gastronómico y heladero. Todos los derechos reservados.
