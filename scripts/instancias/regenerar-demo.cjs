/**
 * Regenera la operación de la demo con fechas de hoy: seis meses de clientes, ventas, cajas, compras, nómina y contabilidad.
 * No toca marca, menú, mesas ni usuarios. Lo corre reiniciar-demo.sh cada madrugada, con el proceso de la demo detenido.
 * Se niega a correr si server/.env no tiene DEMO_MODE=1: borra toda la operación, así que jamás debe tocar a un cliente.
 *
 * Uso, desde la carpeta server de la instalación: node ../scripts/instancias/regenerar-demo.cjs
 */
const fs = require('fs');
const path = require('path');

const SERVER = path.join(__dirname, '..', '..', 'server');
const envPath = path.join(SERVER, '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    if (line.trim().startsWith('#')) continue;
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}
if (process.env.DEMO_MODE !== '1') {
  console.error('Esta instalación no es de demostración (falta DEMO_MODE=1): no se toca nada.');
  process.exit(1);
}

const { getDb } = require(path.join(SERVER, 'src', 'db'));
const { refreshDemoData } = require(path.join(SERVER, 'src', 'demoPacks'));

const db = getDb();
const started = Date.now();
const r = refreshDemoData(db);
db.close();
console.log(`demo regenerada en ${((Date.now() - started) / 1000).toFixed(1)} s: ${r.orders} pedidos, ${r.customers} clientes, ${r.expenses} gastos, ${r.employees} colaboradores, ${r.settlements} liquidaciones, ${r.entries} asientos`);
if (r.ledgerErrors.length) { console.error('Errores contables:', r.ledgerErrors.slice(0, 10).join(' | ')); process.exit(2); }
