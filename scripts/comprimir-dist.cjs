// Después de `vite build`: deja junto a cada archivo de dist/ (js, css, svg, html, json) una copia comprimida .gz
// al máximo nivel. nginx la entrega tal cual (gzip_static on) sin comprimir en cada petición.
// El JavaScript de la app pasa de ~2,2 MB a ~600 KB: en una conexión lenta es la diferencia entre 45 s y 10 s.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const DIST = path.join(__dirname, '..', 'dist');
const EXT = new Set(['.js', '.css', '.svg', '.html', '.json', '.txt', '.webmanifest']);
let archivos = 0, antes = 0, despues = 0;

function recorrer(dir) {
  for (const nombre of fs.readdirSync(dir)) {
    const f = path.join(dir, nombre);
    const st = fs.statSync(f);
    if (st.isDirectory()) { recorrer(f); continue; }
    if (!EXT.has(path.extname(nombre)) || st.size < 1024) continue;
    const gz = zlib.gzipSync(fs.readFileSync(f), { level: 9 });
    fs.writeFileSync(f + '.gz', gz);
    archivos++; antes += st.size; despues += gz.length;
  }
}

if (!fs.existsSync(DIST)) { console.error('No existe dist/ (corre primero vite build)'); process.exit(1); }
recorrer(DIST);
const mb = n => (n / 1048576).toFixed(2) + ' MB';
console.log(`Comprimidos ${archivos} archivos: ${mb(antes)} → ${mb(despues)} (.gz)`);
