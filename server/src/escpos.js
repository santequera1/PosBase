/**
 * Generador de tickets ESC/POS (impresoras térmicas Epson, Xprinter, 3nStar, Bixolon y compatibles).
 * Produce los bytes crudos que el agente de impresión envía a la impresora por la red (IP, puerto 9100).
 *  - 80 mm = 48 caracteres por línea (fuente A); 58 mm = 32.
 *  - Tildes y ñ con la tabla PC850 (ESC t 2). Con codepage 'ascii' se quitan las tildes (para impresoras que no la traen).
 */
const ESC = 0x1b, GS = 0x1d;

const CP850 = {
  'á': 0xa0, 'é': 0x82, 'í': 0xa1, 'ó': 0xa2, 'ú': 0xa3, 'ñ': 0xa4, 'Ñ': 0xa5, 'ü': 0x81, 'Ü': 0x9a,
  'Á': 0xb5, 'É': 0x90, 'Í': 0xd6, 'Ó': 0xe0, 'Ú': 0xe9, '¿': 0xa8, '¡': 0xad, '°': 0xf8, 'º': 0xa7, 'ª': 0xa6, '·': 0xfa, '×': 0x9e,
};
const stripAccents = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[¿¡]/g, '').replace(/·/g, '-').replace(/×/g, 'x').replace(/[–—]/g, '-');

class Ticket {
  constructor({ width = 48, codepage = 'cp850' } = {}) {
    this.width = width;
    this.codepage = codepage;
    this.bytes = [];
    this.scale = 1; // ancho de la letra actual (1 normal, 2 doble ancho)
    this.raw(ESC, 0x40); // inicializar
    if (codepage === 'cp850') this.raw(ESC, 0x74, 2);
  }
  raw(...b) { for (const x of b) this.bytes.push(x & 0xff); return this; }
  encode(text) {
    const s = String(text ?? '').replace(/[–—]/g, '-').replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
    for (const ch of (this.codepage === 'cp850' ? s : stripAccents(s))) {
      const code = ch.charCodeAt(0);
      if (code < 128) this.bytes.push(code);
      else if (this.codepage === 'cp850' && CP850[ch] !== undefined) this.bytes.push(CP850[ch]);
      else { const plain = stripAccents(ch); for (const c of plain) if (c.charCodeAt(0) < 128) this.bytes.push(c.charCodeAt(0)); }
    }
    return this;
  }
  align(a) { return this.raw(ESC, 0x61, a === 'center' ? 1 : a === 'right' ? 2 : 0); }
  bold(on = true) { return this.raw(ESC, 0x45, on ? 1 : 0); }
  /** size: 1 normal · 2 doble alto y ancho · 'tall' doble alto · 'wide' doble ancho */
  size(sz = 1) {
    const n = sz === 2 ? 0x11 : sz === 'tall' ? 0x01 : sz === 'wide' ? 0x10 : 0x00;
    this.scale = sz === 2 || sz === 'wide' ? 2 : 1;
    return this.raw(GS, 0x21, n);
  }
  get cols() { return Math.floor(this.width / this.scale); }
  text(t) { return this.encode(t); }
  nl(n = 1) { for (let i = 0; i < n; i++) this.bytes.push(0x0a); return this; }
  /** Línea con salto, partida en varias si no cabe. */
  line(t = '') { for (const l of wrap(String(t), this.cols)) this.encode(l).nl(); return this; }
  sep(ch = '-') { return this.encode(ch.repeat(this.cols)).nl(); }
  /** Dos columnas: texto a la izquierda y valor a la derecha. */
  pair(left, right) {
    const r = String(right ?? ''), w = this.cols;
    const lines = wrap(String(left ?? ''), Math.max(4, w - r.length - 1));
    lines.forEach((l, i) => {
      if (i === lines.length - 1) this.encode(l + ' '.repeat(Math.max(1, w - l.length - r.length)) + r).nl();
      else this.encode(l).nl();
    });
    return this;
  }
  /**
   * Imagen de 1 bit (GS v 0). logo = { w, h, data }: data en base64, w/8 bytes por fila, bit alto = punto izquierdo.
   * Se manda en bloques de 128 filas porque algunas impresoras no aceptan imágenes muy altas de una vez.
   */
  image(logo) {
    if (!logo || !logo.w || !logo.h || !logo.data) return this;
    const bpr = Math.ceil(logo.w / 8);
    const buf = Buffer.from(logo.data, 'base64');
    if (buf.length < bpr * logo.h) return this;
    for (let y = 0; y < logo.h; y += 128) {
      const rows = Math.min(128, logo.h - y);
      this.raw(GS, 0x76, 0x30, 0x00, bpr & 0xff, bpr >> 8, rows & 0xff, rows >> 8);
      for (let i = y * bpr; i < (y + rows) * bpr; i++) this.bytes.push(buf[i]);
    }
    return this;
  }
  feed(n = 3) { return this.raw(ESC, 0x64, n); }
  cut() { return this.feed(4).raw(GS, 0x56, 0x42, 0x00); }
  /** Abre el cajón monedero conectado a la impresora (pin 2). */
  drawer() { return this.raw(ESC, 0x70, 0x00, 0x19, 0xfa); }
  /** Pitido (impresoras que lo soportan: ESC B n t). */
  beep(times = 2) { return this.raw(ESC, 0x42, times, 3); }
  buffer() { return Buffer.from(this.bytes); }
}

function wrap(text, width) {
  const out = [];
  for (const para of String(text).split('\n')) {
    let cur = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      if (word.length > width) { if (cur) { out.push(cur); cur = ''; } for (let i = 0; i < word.length; i += width) out.push(word.slice(i, i + width)); continue; }
      if (!cur) cur = word;
      else if ((cur + ' ' + word).length <= width) cur += ' ' + word;
      else { out.push(cur); cur = word; }
    }
    out.push(cur);
  }
  return out;
}

const money = n => '$' + Math.round(Number(n) || 0).toLocaleString('es-CO').replace(/,/g, '.');

module.exports = { Ticket, wrap, money, stripAccents };
