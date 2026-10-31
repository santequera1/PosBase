# Wonka's Burger (Cartagena)

- **Instalación:** pos.wailus.co · `/home/ubuntu/apps/posbase` · PM2 `posbase-api` · puerto 3065 · slug `wonkas`.
- **En producción real desde:** 8-oct-2026. Bitácora inicial: `docs/ACTUALIZACION-2026-10-10.md`.
- **Equipo:** Verónica (administradora), Viviana (caja), Merlis (caja), meseros, domiciliarios; contador: Anderson.
- **Módulos:** mesas, para llevar, domicilios, cocina; impresión en red (agente en el PC de la caja; impresoras caja y
  cocina por IP — pendiente que fijen las IP en el router).
- **Factura electrónica:** Factus v2 producción, prefijo WONK (DIAN). Pendiente confirmar con Anderson si cobran INC 8 %
  (Factus los muestra como "No responsable").
- **Propinas:** todas comunes, se reparten en partes iguales entre todo el personal, ocultas en "Mi cuenta", se pagan
  aparte por quincena.
- **Nómina:** novedades operativas (cobros al personal), consumos por nómina con descuento de empleado 50 % (sin bebidas).
- **Datos:** recetas e ingredientes importados de Fudo; clientes importados de Fudo (teléfonos normalizados a 10 dígitos).
- **Claves:** en `documentacionyclaves.md` (local).
- **31-oct-2026, nómina por quincena (pedido de Vero):** sueldo mensual pagado por días (quincena = 15, mes = 30; el 31
  no se paga), campo "Días trabajados en el período" en Liquidaciones (para faltas o pago por día sin asistencia), cortes
  el 15 y el 30 (lo del 31 —consumos, novedades, asistencia— cae en la quincena siguiente). Ya existían: préstamos por
  cuotas (Anticipos y préstamos → Nuevo préstamo), adicionales con tarifa (Novedades → "Adicionales y tarifas" → novedad
  "Adicional"). Sus adicionales tenían tarifa 0: deben ponerla. Un empleado (Brayan) está como "Quincenal 2.000.000":
  confirmar si es mensual.
