// Uso (en el VPS): node scripts/instancias/monitoreo.cjs > monitoreo.json  — o desde el PC: scp + ssh (ver docs/INSTALACION.md).
// Monitoreo de uso de las instalaciones del POS (solo lectura). Se ejecuta en el VPS.
// Lee: registro de instancias, bases SQLite (readonly) y logs de nginx (inicios de sesión por dominio).
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const Database = require('/home/ubuntu/apps/posbase/server/node_modules/better-sqlite3');

const instancias = fs.readFileSync('/home/ubuntu/apps/pos-instancias.tsv', 'utf8').trim().split('\n').map(l => {
  const [slug, carpeta, puerto, dominio, pm2] = l.split('\t'); return { slug, carpeta, puerto, dominio, pm2 };
});
const hoy = new Date(Date.now() - 5 * 3600e3).toISOString().slice(0, 10); // hora Colombia
const diasAtras = n => new Date(Date.now() - 5 * 3600e3 - n * 86400e3).toISOString().slice(0, 10);
const out = { generado: new Date().toISOString(), hoy, instancias: [] };

// ---- nginx: inicios de sesión y actividad por dominio (por el referer) ----
const MESES = { Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06', Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12' };
const nginx = {};
for (const i of instancias) nginx[i.dominio] = { logins: {}, fallidos: {}, ips: {}, actividad: {}, ultimo: '', dispositivos: {} };
try {
  const raw = execSync('sudo -n zcat -f /var/log/nginx/access.log* 2>/dev/null | grep -E "https://[a-z0-9.-]+(wailus.co|stiven.app)/" ', { maxBuffer: 1 << 30 }).toString();
  const re = /^(\S+) \S+ \S+ \[(\d+)\/(\w+)\/(\d+):(\d+):(\d+):\d+ [^\]]+\] "(\w+) (\S+) [^"]*" (\d+) \d+ "https:\/\/([^/"]+)[^"]*" "([^"]*)"/;
  for (const line of raw.split('\n')) {
    const m = re.exec(line); if (!m) continue;
    const [, ip, d, mon, y, hh, mm, method, url, status, host, ua] = m;
    const n = nginx[host]; if (!n) continue;
    // hora UTC → Colombia (-5)
    const t = new Date(Date.UTC(+y, +MESES[mon] - 1, +d, +hh, +mm) - 5 * 3600e3);
    const dia = t.toISOString().slice(0, 10), hora = t.toISOString().slice(11, 16);
    const stamp = `${dia} ${hora}`;
    if (!url.startsWith('/api/')) continue;
    n.actividad[dia] = (n.actividad[dia] || 0) + 1;
    (n.ips[dia] = n.ips[dia] || new Set()).add(ip);
    if (stamp > n.ultimo) n.ultimo = stamp;
    if (method === 'POST' && url === '/api/auth/login') {
      const dev = /iPhone|iPad/.test(ua) ? 'iPhone' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'PC Windows' : /Macintosh/.test(ua) ? 'Mac' : 'otro';
      if (status === '200') { (n.logins[dia] = n.logins[dia] || []).push({ hora, ip, dev }); n.dispositivos[dev] = (n.dispositivos[dev] || 0) + 1; }
      else (n.fallidos[dia] = n.fallidos[dia] || []).push({ hora, ip, dev, status });
    }
  }
  for (const h in nginx) for (const d in nginx[h].ips) nginx[h].ips[d] = nginx[h].ips[d].size;
} catch (e) { out.nginxError = String(e.message).slice(0, 300); }

// ---- bases de datos ----
function col(db, table, name) { try { return db.prepare(`PRAGMA table_info(${table})`).all().some(c => c.name === name); } catch { return false; } }
function q(db, sql, ...p) { try { return db.prepare(sql).all(...p); } catch (e) { return { error: e.message }; } }
function one(db, sql, ...p) { try { return db.prepare(sql).get(...p); } catch (e) { return { error: e.message }; } }

for (const i of instancias) {
  const r = { ...i };
  try {
    const envPath = path.join(i.carpeta, 'server', '.env');
    const env = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
    const m = /^DB_PATH=(.+)$/m.exec(env);
    const dbPath = m ? m[1].trim() : path.join(i.carpeta, 'server', 'data.db');
    r.dbPath = dbPath; r.dbSizeMB = +(fs.statSync(dbPath).size / 1048576).toFixed(1);
    r.dbModificada = fs.statSync(dbPath).mtime.toISOString();
    r.demoMode = /^DEMO_MODE=1/m.test(env);
    r.commit = (() => { try { return execSync(`git -C ${i.carpeta} log -1 --format="%h %cd" --date=short`).toString().trim(); } catch { return '?'; } })();
    const db = new Database(dbPath, { readonly: true, fileMustExist: true });
    const s = {}; for (const row of q(db, "SELECT key, value FROM settings WHERE key IN ('businessName','businessType','setupPending','factusEnabled','factusEnv','factusEnvironment','printMode')")) s[row.key] = row.value;
    r.negocio = s.businessName; r.tipo = s.businessType; r.setupPending = s.setupPending; r.factus = s.factusEnv || s.factusEnvironment || s.factusEnabled;
    r.usuarios = q(db, 'SELECT username, name, role FROM users ORDER BY id');
    r.productos = one(db, 'SELECT COUNT(*) n FROM products').n;
    r.empleados = one(db, 'SELECT COUNT(*) n FROM employees').n;
    r.clientes = one(db, 'SELECT COUNT(*) n FROM customers').n;
    const ventas = one(db, "SELECT COUNT(*) n, MIN(created_at) primera, MAX(created_at) ultima, COALESCE(SUM(total),0) total FROM orders");
    r.ventas = ventas;
    r.ventasPorDia = q(db, `SELECT substr(created_at,1,10) dia, COUNT(*) n, COALESCE(SUM(total),0) total FROM orders WHERE created_at >= ? GROUP BY dia ORDER BY dia`, diasAtras(14));
    r.ventasPorEstado = q(db, 'SELECT status, COUNT(*) n FROM orders GROUP BY status');
    r.ventasPorCajero = col(db, 'orders', 'cashier_name') ? q(db, `SELECT cashier_name cajero, COUNT(*) n, MAX(created_at) ultima FROM orders WHERE created_at >= ? GROUP BY cashier_name ORDER BY n DESC`, diasAtras(14)) : null;
    r.turnos = one(db, "SELECT COUNT(*) n, MAX(opened_at) ultimoAbierto, MAX(closed_at) ultimoCerrado, SUM(status='open') abiertos FROM cash_shifts");
    r.turnosRecientes = q(db, 'SELECT id, cashier_name, opened_at, closed_at, status FROM cash_shifts ORDER BY opened_at DESC LIMIT 5');
    r.asistencia = one(db, 'SELECT COUNT(*) n, MAX(date) ultima FROM attendance');
    r.liquidaciones = one(db, 'SELECT COUNT(*) n, MAX(created_at) ultima FROM payroll_settlements');
    r.gastos = one(db, 'SELECT COUNT(*) n, MAX(date) ultima FROM expenses');
    r.impresion = q(db, 'SELECT name, last_seen FROM print_agents');
    r.facturasElectronicas = col(db, 'orders', 'einvoice_number') ? one(db, "SELECT COUNT(*) n, MAX(created_at) ultima FROM orders WHERE einvoice_number IS NOT NULL AND einvoice_number != ''") : null;
    db.close();
  } catch (e) { r.error = e.message; }
  const n = nginx[i.dominio];
  r.web = n ? {
    ultimaActividad: n.ultimo,
    dispositivos: n.dispositivos,
    porDia: Object.keys({ ...n.actividad }).sort().map(d => ({ dia: d, peticionesApi: n.actividad[d], equipos: n.ips[d], logins: (n.logins[d] || []).length, fallidos: (n.fallidos[d] || []).length })),
    loginsDetalle: Object.fromEntries(Object.entries(n.logins).sort().slice(-15)),
    fallidosDetalle: Object.fromEntries(Object.entries(n.fallidos).sort().slice(-15)),
  } : null;
  out.instancias.push(r);
}
console.log(JSON.stringify(out, null, 1));
