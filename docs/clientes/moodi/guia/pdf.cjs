// Convierte guia.html en PDF (A4) con Chromium de Playwright.
// La portada se imprime aparte a página completa (sin márgenes ni pie) y se une con pypdf (python). Si python o
// pypdf no están, queda el PDF con la portada dentro de los márgenes.
// Uso: node docs/clientes/moodi/guia/pdf.cjs <raíz del repo> <salida.pdf>
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawnSync } = require('child_process');
const [, , ROOT, OUT] = process.argv;
const { chromium } = require(path.join(ROOT, 'node_modules', '@playwright', 'test'));
const HTML = 'file:///' + path.join(__dirname, 'guia.html').split(path.sep).join('/');
const PIE = '<div style="width:100%;font-family:Quicksand,Arial,sans-serif;font-size:8px;color:#8a7d90;padding:0 15mm;display:flex;justify-content:space-between"><span>Guía de uso · Moodi Shake · moodi.stiven.app</span><span class="pageNumber"></span></div>';

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'guia-moodi-'));
  const cuerpo = path.join(tmp, 'cuerpo.pdf'), portada = path.join(tmp, 'portada.pdf');
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(HTML, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(800);
  // 1) Documento completo (la portada queda en la página 1, dentro de los márgenes; luego se reemplaza)
  await page.pdf({
    path: cuerpo, format: 'A4', printBackground: true, preferCSSPageSize: true,
    displayHeaderFooter: true, headerTemplate: '<div></div>', footerTemplate: PIE,
    margin: { top: '16mm', bottom: '18mm', left: '15mm', right: '15mm' },
  });
  // 2) Solo la portada, a sangre
  await page.evaluate(() => document.body.classList.add('solo-portada'));
  await page.addStyleTag({ content: '@page { size: A4; margin: 0; }' });
  await page.waitForTimeout(200);
  await page.pdf({ path: portada, format: 'A4', printBackground: true, preferCSSPageSize: true, margin: { top: 0, bottom: 0, left: 0, right: 0 } });
  await browser.close();

  // 3) Unir: portada a sangre + páginas 2..n del cuerpo
  const py = `
import sys
from pypdf import PdfReader, PdfWriter
w = PdfWriter(); w.add_page(PdfReader(sys.argv[1]).pages[0])
for p in PdfReader(sys.argv[2]).pages[1:]: w.add_page(p)
w.write(sys.argv[3]); print(len(w.pages), 'paginas')
`;
  const r = spawnSync(process.platform === 'win32' ? 'python' : 'python3', ['-c', py, portada, cuerpo, OUT], { encoding: 'utf8' });
  if (r.status === 0) console.log('PDF listo:', OUT, '·', r.stdout.trim());
  else { fs.copyFileSync(cuerpo, OUT); console.log('PDF listo (sin portada a sangre: falta python/pypdf):', OUT, '\n', (r.stderr || '').slice(-300)); }
  fs.rmSync(tmp, { recursive: true, force: true });
})().catch(e => { console.error(e); process.exit(1); });
