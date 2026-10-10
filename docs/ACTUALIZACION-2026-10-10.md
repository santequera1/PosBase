# Actualización 10-oct-2026 — Wonka's Burger en producción

Estado del sistema al cierre de esta sesión y cómo continuar si hace falta retomar.
(Sin credenciales: las claves están solo en el archivo privado local `documentacionyclaves.md`.)

## Despliegue
- Repo `main` → VPS `/home/ubuntu/apps/posbase`, PM2 `posbase-api` (puerto 3065), sitio `pos.wailus.co`.
- Desplegar: `git push origin main` y en el VPS `git pull && npm run build && pm2 restart posbase-api`.
- Antes de tocar datos: respaldo con better-sqlite3 `.backup()` en `/home/ubuntu/backups/posbase/`.
- Nginx (`/etc/nginx/sites-available/pos.wailus.co`): la página principal ahora va con `Cache-Control: no-cache`
  para que cada versión nueva llegue sin borrar caché (antes se guardaba 30 días). `/assets` sigue en caché 30 días.

## Cambios de esta última ronda
| Cambio | Dónde |
|---|---|
| Los modales solo se cierran con **X** o **Esc** (un clic afuera ya no borra lo escrito) | `src/components/common/Primitives.tsx` (Modal), formulario de producto |
| **Domicilios en lista** (selector Tablero / Lista, se recuerda por equipo) con el botón del siguiente paso y el repartidor en la fila | `src/pages/DeliveryPage.tsx` |
| Flujo de domicilios: Pendiente → **A preparación** → **Listo para enviar** → **Enviar** (pide repartidor) → **Entregado** | `DeliveryPage.tsx` |
| **Las mesas las cobra el mesero que las abrió** (o el mesero asignado), el cajero (quien ve Caja) o el administrador | `server/src/routes/restaurant.js` (cierre de cuenta) |
| Permiso nuevo **"Configurar impresoras"** (Viviana lo tiene) | `server/src/permissions.js`, `routes/printing.js`, `SettingsPage.tsx` |
| Varias **cuentas en una misma mesa**, cada una con comanda, precuenta, cobro y factura | `restaurant.js` (tablesState, abrir con `additional`), `TablesPage.tsx` |
| **Varios medios de pago** (3 o más) y tarjeta como una sola opción **Datáfono** | `server/src/paymentSplit.js`, `src/components/MixedPayment.tsx` |
| Asignar o cambiar el **domiciliario de un pedido ya entregado** | `DeliveryPage.tsx`, `routes/caja.js` (Editar datos) |
| Cancelaciones visibles: la cuenta muestra los cancelados y cocina recibe **ticket CANCELADO / CUENTA ANULADA** | `printing.js` (enqueueCancel), `OpenOrderPage.tsx` |
| **Factura electrónica con datos del cliente**: la ventana pide cédula o NIT (DV automático), nombre, correo, celular y dirección antes de emitir, y guarda el cliente en el directorio. Botón **Factura electrónica** al cobrar la mesa | `src/components/ElectronicInvoiceModal.tsx`, `CloseOrderModal.tsx`, `routes/caja.js` |

Nota sobre la regla de meseros: hoy los meseros (Brayan, Katerin) tienen perfil **Cajero**, que ve Caja, así que
pueden cobrar cualquier mesa. Para que la regla los restrinja hay que pasarlos al perfil **Mesero**
(Configuración → Usuarios → editar → perfil Mesero).

## Impresoras (local)
- Agente en el PC de la caja (`DESKTOP-3FGV458`). Impresora **caja 192.168.0.192**, **cocina 192.168.0.195**.
- El 9-oct la de caja cambió de IP (.191 → .192) y dejó de imprimir: se arregló buscando impresoras desde el panel.
- Pendiente del local: **fijar las IP en el router** (reserva DHCP) para que no vuelva a pasar.

## Facturación electrónica (Factus, API v2)
- El sistema está en **producción** con las credenciales reales de WONKAS BURGER S.A.S (NIT 902065145-0).
- Rangos registrados en Factus producción el 10-oct: **WONK** (Factura de Venta, 1–1000, vence 31-07-2028) y **DS** (Documento Soporte, vence 03-08-2028).
- Cada factura emitida guarda **PDF y XML** en `server/einvoices/` (fuera del repo) y aparece en **Caja → Facturas electrónicas**
  (descargar, compartir PDF, WhatsApp, correo).
- **Pendiente con el contador:** en Factus la empresa figura "No responsable" (R-99-PN) y el sistema cobra **INC 8 %**.
  Confirmar el régimen antes de la primera factura real (Configuración → Negocio → Impuesto).

## Datos de prueba
La operación real empezó el **8-oct-2026**.

### Limpieza ejecutada el 10-oct-2026 (aprobada por Stiven)
Respaldo previo: `/home/ubuntu/backups/posbase/data-antes-limpieza-20261010-065455.db`.
- Ventas borradas: todas las anteriores al 8-oct (#1001, 1003, 1004, 1005, 1006, 1024, 1026, 1027) y #1031
  (prueba con Ariel, junto con su factura de prueba SETP990024078: PDF y XML).
- 16 asientos contables de esas ventas y de ventas de prueba ya borradas antes, del gasto de prueba, de su pago, del anticipo y del préstamo de Ariel.
- Caja #1 (7-oct) y el gasto "Gasto de prueba" ($120.000).
- Colaboradores "Ariel prueba" y "Domiciliario Prueba", con sus asistencias, novedades, anticipo, préstamos y propinas.
- Usuarios de demostración `cajero`, `mesero` y `domiprueba` (borrados: la versión demo para otros restaurantes será aparte).
- Clientes "Prueba para llevar" y "Pruebas 1.5". Las ventas anuladas en $0 #1095, 1096 y 1099 se conservaron sin cliente asociado.
- No se tocaron la existencia de productos ni las ventas reales. El usuario `cocina` se conserva.
