// Convierte guia.html en PDF (A4) con Chromium de Playwright.
const path = require('path');
const [, , ROOT, OUT] = process.argv;
const { chromium } = require(path.join(ROOT, 'node_modules', '@playwright', 'test'));
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('file:///' + path.join(__dirname, 'guia.html').replace(/\\/g, '/'), { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(800);
  await page.pdf({
    path: OUT, format: 'A4', printBackground: true, preferCSSPageSize: true,
    displayHeaderFooter: true,
    headerTemplate: '<div></div>',
    footerTemplate: '<div style="width:100%;font-family:Quicksand,Arial,sans-serif;font-size:8px;color:#8a7d90;padding:0 15mm;display:flex;justify-content:space-between"><span>Guía de uso · Moodi Shake · moodi.stiven.app</span><span class="pageNumber"></span></div>',
    margin: { top: '16mm', bottom: '18mm', left: '15mm', right: '15mm' },
  });
  await browser.close();
  console.log('PDF listo:', OUT);
})().catch(e => { console.error(e); process.exit(1); });
