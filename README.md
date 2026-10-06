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
- **Módulo Restaurante (Ajustes → Restaurante, se activa por módulos):** plano de mesas por salón (arrastrar, formas, puestos) con estados libre / ocupada / pidiendo la cuenta; cuenta abierta por mesa con personas y mesero, comandas a cocina por tandas (solo lo nuevo), precuenta con propina sugerida, cambiar o unir mesas; pedidos para llevar a nombre del cliente con tablero pendiente → en preparación → listo → entregado; domicilios con cliente por teléfono, dirección, piso/apto y barrio, repartidor, tiempo estimado, costo de envío, cobro contra entrega o por plataforma (Rappi/DiDi) y cuadre por repartidor; monitor de cocina (KDS) por estaciones; comandas separadas por estación (un ticket solo con lo de cocina y otro solo con lo de barra, con nombre de impresora y copias por estación) e impresión automática en la pantalla de cada estación, para que cocina y barra salgan en impresoras distintas; cobro con descuento y motivo, propina, uno o dos medios de pago, plataforma y a crédito (por cobrar); caja obligatoria opcional; reportes por tipo de venta, canal, mesero (promedio por persona) y repartidor.
- **Usuarios y permisos (Ajustes → Usuarios):** perfiles Administrador, Cajero, Mesero y Cocina como plantillas, y casillas por usuario para elegir qué secciones ve (punto de venta, mesas, para llevar, domicilios, cocina, cierre de caja, pedidos, ventas e ingresos, menú, clientes, finanzas, personal, configuración) y qué puede hacer (anular pedidos, aplicar descuentos, editar el menú, retiros de caja). El menú lateral y el móvil solo muestran lo permitido; si alguien entra por URL a otra sección ve el aviso "No tienes permiso para ver esta sección"; el servidor también rechaza esas peticiones y los cambios aplican al instante sin cerrar sesión. Cambiar contraseñas y desactivar accesos sin perder el historial de caja.
- **Finanzas:** gastos por categoría (insumos, operativos, nómina), compras a proveedores de contado o a crédito, cuentas por pagar con vencimientos, descuento directo de la caja abierta y estado de resultados mes a mes (ventas − insumos − gastos − nómina = utilidad neta).
- **Contabilidad (Finanzas → Contabilidad):** impuestos configurables (INC o IVA incluidos en el precio) con base e impuesto desglosados en los recibos; informe del período con libro de ventas diario y por comprobante, libro de compras y gastos con NIT y número de factura, resumen de impuestos, nómina pagada, cierres de caja y cuentas por pagar; exportación CSV para Excel e impresión a PDF.
- **Inventario:** cada producto puede ser "siempre disponible" o con control de stock (cantidad y mínimo); las ventas descuentan unidades, en cero se marca agotado y al reponer vuelve a estar disponible; ajustes manuales con motivo e historial de movimientos, devolución automática al anular un pedido y alerta de stock bajo.
- **Exportación a Excel real (.xlsx):** Ventas e ingresos y el informe contable se descargan como libros de Excel (varias hojas, fecha y hora separadas, totales numéricos), sin problemas de separadores en Excel en español.
- **Caja (como el sistema anterior del cliente):** pestañas Ventas (filtros por turno, período, estado, tipo de venta, mesero/repartidor y medio de pago; resumen de ventas, promedio por venta, personas, promedio por persona, propinas discriminadas y total; detalle de cada venta), Movimientos de caja (ingresos y egresos con origen), Arqueos de caja (arqueo en vivo con monto inicial, ingreso desglosado por medio y propinas, egreso y total; cierre "Según usuario" por medio de pago con Sistema vs Usuario y diferencia en tiempo real; historial con reporte Z), Propinas (por mesero y medio, exportable) y Descuentos (con motivo y quién autorizó). El efectivo esperado incluye las propinas en efectivo.
- **Secciones visibles (Configuración → Secciones):** el administrador oculta o muestra secciones del sistema sin eliminarlas; ocultas no aparecen en el menú y su dirección avisa "sección oculta".
- **Domiciliarios con usuario propio:** perfil Domiciliario en Configuración → Usuarios; el usuario queda vinculado solo como repartidor en Personal y aparece para asignarle pedidos. En su celular entra a "Mis domicilios": pedidos asignados con cliente, teléfono (llamar o WhatsApp), dirección con enlace a mapas, productos y notas, cuánto cobrar en efectivo (y de cuánto lleva cambio) o si ya está pagado; marca "voy en camino" y "entregado" con el medio de cobro, y ve su efectivo recogido del día.
- **Gastos con consecutivo y comprobante imprimible:** cada gasto (también los de nómina) recibe un número consecutivo que se busca y se imprime como comprobante de gasto en hoja carta (proveedor con NIT, cuenta contable, IVA, retención, pagos y firmas). El libro auxiliar se consulta por rango de cuentas (desde – hasta) con atajos por grupo.
- **Contabilidad de partida doble (Finanzas → Plan de cuentas, Libro diario, Balances, Cartera):** Plan Único de Cuentas (Decreto 2650) con auxiliares propios y editable; "configuración de cuentas contables" por evento (caja, bancos, datáfono, ventas, INC/IVA, propinas, clientes, plataformas, proveedores, retención, nómina, anticipos, faltantes y sobrantes) y por categoría de gasto; régimen de IVA (descontable o al costo), inventario periódico o permanente (costo de ventas con el costo unitario del producto) y retención en la fuente por proveedor. Cada venta, abono, compra, pago, nómina, anticipo, cierre y retiro de caja genera su asiento automáticamente (idempotente: si el documento cambia, el asiento se anula y se regenera; si se anula el pedido, se anula el asiento). Comprobantes de contabilidad manuales con validación de partida doble. Informes: balance de prueba por nivel y por tercero (anexo de balances), estado de situación financiera, estado de resultados contable, libro auxiliar por cuenta y tercero, libro diario filtrable y terceros para información exógena (proveedores, clientes y empleados con datos del RUT y bandera de datos faltantes), todos exportables a Excel e imprimibles.
- **Cartera y proveedores:** proveedores y clientes con datos del RUT (tipo y número de documento, DV, persona natural o jurídica, dirección, ciudad, departamento, código postal, teléfono, correo, actividad económica CIIU, responsabilidad de IVA, régimen), días de crédito y % de retención; compras a crédito con vencimiento automático según el plazo del proveedor, retención en la fuente calculada sobre la base e IVA descontable; abonos parciales a facturas de proveedor y a ventas a crédito o por plataforma (Rappi/DiDi) con historial, cuentas por cobrar y por pagar por tercero, documento y edad (al día, 1–30, 31–60, 61–90, más de 90 días), recordatorio por WhatsApp al cliente y endpoint de vencimientos para el asistente de IA; documento soporte (DSP, numeración interna) para compras a no obligados a facturar.
- **Factura electrónica con Factus (Ajustes → Factura electrónica):** proveedor de pruebas (documento simulado) o Factus real: credenciales guardadas en el servidor (solo admin), sandbox o producción, prueba de conexión, rangos de numeración de la resolución DIAN, municipio, emisión al cerrar la venta con CUFE, QR y enlace oficial impresos en el recibo, y vista previa del JSON que se envía. Requiere una cuenta de Factus (15 días de prueba).
- **Factura electrónica en modo pruebas:** las ventas marcadas como F.E. generan un documento simulado (prefijo FEP, CUFE y QR de prueba) claramente marcado como sin validez fiscal, para demostrar el flujo mientras se conecta el proveedor tecnológico (Factus). El cliente queda registrado en el directorio con solo cédula o NIT.
- **POS:** tarjeta de última venta para verla o reimprimirla al instante; cierre de caja visible en pantalla desde el historial.
- **Personal y Nómina:** colaboradores con modalidad de pago (por turno, día, hora, quincena o mes), asistencia automática al abrir/cerrar caja, propinas comunes o directas, anticipos vinculados a la caja y liquidación por período que se registra como gasto de nómina.
- **Ventas e ingresos con filtros (estilo Fudo):** período (hoy, ayer, esta semana, semana pasada, este mes, mes pasado, últimos 7 o 30 días, este año o rango), franja horaria, días de la semana, tipo de venta (mesa, para llevar, mostrador, domicilio), medio de pago (incluye pagos mixtos), mesero, cajero que cobró, repartidor, mesa, canal, categoría y producto (subfiltro dentro de la categoría), estado (cerradas, abiertas, anuladas), marcas (con propina, con descuento, descuento de trabajador, factura electrónica, por cobrar) y monto mínimo y máximo. Etiquetas de filtros activos para quitarlos con un toque, filtros recordados en el equipo, buscador por número, cliente, teléfono, mesero, mesa o producto. Pestañas Comprobantes, Productos (por categoría y por producto), Personal (meseros, cajeros, repartidores, descuentos de trabajador) y Estadísticas (por hora, día, día de la semana, tipo de venta y medio de pago). Excel con todas las hojas y los filtros aplicados. Las estadísticas de helados (vasos, conos, sabores) solo aparecen si el menú tiene helados.
- **Descuento de trabajador:** al cobrar (mesas, para llevar, domicilios y punto de venta) el botón "Descuento de trabajador" aplica el porcentaje configurado (50 % por defecto) a todo menos las categorías excluidas (bebidas, detectadas por nombre y editables en Configuración → Restaurante). El servidor recalcula el valor, guarda a quién se le aplicó y se puede filtrar en Ventas e ingresos.
- **Propinas por colaborador:** la propina común del día se reparte entre quienes tienen asistencia ese día en partes iguales, por horas trabajadas o por puntos (cada colaborador con sus puntos; 0 = no participa); las directas son de cada mesero. Estado de cuenta por período (saldo anterior, directas, común, ganado, pagado, saldo), abonos en cualquier momento (desde la caja o por transferencia) y liquidación de la quincena o el mes con comprobante imprimible. Se pagan aparte o dentro de la nómina (configurable, sin pagarlas dos veces). Contabilidad: las propinas anotadas a mano entran a la cuenta 281505 y los pagos la descargan.
- **Novedades de nómina:** festivos y dominicales trabajados (recargo de ley calculado solo: 80 % hasta jun-2026, 90 % desde jul-2026, 100 % desde jul-2027), horas extra diurnas y nocturnas, recargo nocturno, bonificaciones, comisiones, incapacidades, vacaciones, faltas, licencias no remuneradas, cuotas de préstamo y descuentos autorizados; se suman o restan en la liquidación del período, entran a la base de salud y pensión cuando corresponde y quedan amarradas a la liquidación (al anularla vuelven a quedar pendientes).
- **Importar personal desde Excel:** .xlsx o .csv con plantilla descargable; reconoce encabezados en español (Nombre o Nombres + Apellidos, Cédula, Cargo, Forma de pago, Sueldo, Puntos propina...), normaliza valores escritos a mano ("$1.750.905", "Por turno", "Sí") y muestra una vista previa con lo que se crea, lo que se actualiza (por documento o nombre) y las filas con error antes de importar.
- **Impresión en red propia (Configuración → Impresoras):** reemplaza PrintNode. Impresoras térmicas por IP (puerto 9100) con funciones Cocina, Barra y Caja, papel 80 o 58 mm, tildes (PC850) o sin tildes, copias, apertura de cajón al cobrar en efectivo y pitido en comandas. Un agente para Windows (PowerShell, sin instalar nada más) se instala con un .bat descargado desde el panel, arranca con Windows, consulta al servidor por HTTPS (no abre puertos), imprime y reporta si cada impresora responde; también busca impresoras en la red. Las comandas salen solas por estación aunque el mesero las envíe desde el celular; precuentas, recibos y cortes X/Z salen en la impresora de caja sin cuadros de diálogo. Historial de impresiones con errores claros y reintento. Si la impresión en red está apagada o falla, se usa la impresión del navegador.
- **Módulo Caja / Ventas al estilo Fudo:** sub-menú Ventas · Movimientos de caja · Arqueos de caja (con chip Abierto/Cerrado siempre visible) · Propinas · Descuentos, con diseño maestro/detalle (la fila elegida se resalta y el detalle sale a la derecha; en celular a pantalla completa) y enlace directo a cada venta. Período común: Diario, Mensual, Anual, Rango con hora, o Arqueo (exactamente las ventas de un turno de caja), "Fecha por" hora de inicio o de cierre y Turno (Almuerzo, Cena… configurables en Restaurante), con el rango efectivo "Del … al …". Ventas: filtros de estado (Eliminada, Cerrada, Enviado, En curso, Pagando, A entregar, Por cobrar), tipo, mesero/repartidor, cliente, medio de pago, mesa y facturación; KPIs con "?" (ventas, promedio por venta, personas, promedio por persona, total); "Más info" con medios de pago en barras, salones, adiciones canceladas, propinas y costos de envío; tabla de 30 en 30 con "Mostrar más"; detalle con factura electrónica, ticket, control de mesa, comanda completa, editar, eliminar (con motivo), cancelar adiciones (quedan registradas con quién y por qué), editar pago y editar propina (el cajero mientras su caja esté abierta; el administrador siempre). Movimientos con origen (gasto, anticipo, préstamo, propinas) y formulario lateral. Arqueos: Cajas (KPIs de saldo actual, ventas con propinas, ingresos y egresos; tabla Sistema vs Usuario con diferencias en color; detalle con reporte Z en pantalla e impresión) y Conciliación (un administrador registra el monto conciliado, el motivo de la diferencia y un comentario). Propinas con detalle de la venta. Descuentos: catálogo (porcentual o fijo, importe fijo o libre, sin bebidas, pedir trabajador, activo/inactivo) con veces usado, monto y última vez; "Empleados" es el descuento de trabajador.
- **Menú del celular arriba (como Fudo) o abajo:** Configuración → Secciones. Arriba: botón con el módulo actual que despliega los demás; en Caja los filtros se abren con Fechas / Filtros / Exportar / Nuevo en paneles a pantalla completa con "Aplicar".
- **Préstamos a empleados (libranza sin intereses) y adicionales:** préstamos con número de cuotas; la cuota se descuenta sola en cada liquidación (se puede saltar una cuota o cobrar el saldo completo) y contabiliza en 136595. Adicionales pagados por vez (armado de carne, lavado de campana…) con tarifa editable, como novedad de nómina. Número de cuenta bancaria en la ficha y Excel de pagos de nómina pendientes con las cuentas.

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
│   ├── puc.js             # Plan Único de Cuentas semilla
│   ├── accountingSchema.js# Tablas contables, cuentas por evento y datos del RUT
│   ├── ledger.js          # Motor de partida doble: asientos automáticos e informes
│   ├── factus.js          # Cliente de la API de Factus (OAuth, facturas, PDF)
│   ├── payroll.js         # Motor de nómina colombiana
    │   └── routes/
    │       ├── auth.js        # Login y verificación de sesión
    │       ├── products.js    # CRUD de productos y disponibilidad
    │       ├── orders.js      # Creación y gestión de pedidos
    │       ├── shifts.js      # Apertura, movimientos y cierre de caja
    │       ├── reports.js     # Estadísticas de ventas
│       ├── finance.js     # Gastos, proveedores (RUT), cuentas por pagar y abonos
│       ├── accounting.js  # PUC, parametrización, libro diario, balances, cartera, terceros
│       ├── einvoicing.js  # Configuración y prueba de Factus
│       ├── restaurant.js  # Mesas, comandas, domicilios y cocina
│       ├── staff.js       # Colaboradores, asistencia, propinas, anticipos y nómina
    │       └── whatsappAi.js  # Integración para bots de WhatsApp
```

---

## 📄 Licencia y Derechos
Desarrollado como solución tecnológica especializada para puntos de venta del sector gastronómico y heladero. Todos los derechos reservados.
