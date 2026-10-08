/**
 * Lector mínimo de Excel (.xlsx) y CSV sin dependencias.
 * Un .xlsx es un ZIP: se leen sus entradas (descomprimidas con DecompressionStream 'deflate-raw', que traen los
 * navegadores actuales), las cadenas compartidas y la primera hoja. Devuelve una matriz de textos.
 */

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const DS: any = (globalThis as any).DecompressionStream;
  if (!DS) throw new Error('Este navegador no puede leer Excel. Guarda el archivo como CSV o usa Chrome/Edge actualizado.');
  const stream = new Blob([data as unknown as BlobPart]).stream().pipeThrough(new DS('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Entradas del ZIP usando el directorio central (los tamaños del encabezado local pueden venir en cero). */
async function unzip(buf: ArrayBuffer): Promise<Map<string, Uint8Array>> {
  const u8 = new Uint8Array(buf);
  const dv = new DataView(buf);
  let eocd = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 66000); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('El archivo no es un Excel (.xlsx) válido');
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const out = new Map<string, Uint8Array>();
  const dec = new TextDecoder();
  for (let n = 0; n < count; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true);
    const csize = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true), extraLen = dv.getUint16(p + 30, true), commentLen = dv.getUint16(p + 32, true);
    const local = dv.getUint32(p + 42, true);
    const name = dec.decode(u8.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    if (!/^xl\/(sharedStrings\.xml|workbook\.xml|worksheets\/sheet\d+\.xml|_rels\/workbook\.xml\.rels)$/.test(name)) continue;
    const lNameLen = dv.getUint16(local + 26, true), lExtraLen = dv.getUint16(local + 28, true);
    const start = local + 30 + lNameLen + lExtraLen;
    const raw = u8.subarray(start, start + csize);
    out.set(name, method === 0 ? raw : await inflateRaw(raw));
  }
  return out;
}

const colIndex = (ref: string) => { const letters = ref.replace(/[0-9]/g, ''); let n = 0; for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64); return n - 1; };

async function readXlsx(buf: ArrayBuffer, all = false): Promise<any> {
  const files = await unzip(buf);
  const dec = new TextDecoder();
  const parser = new DOMParser();
  const shared: string[] = [];
  const ss = files.get('xl/sharedStrings.xml');
  if (ss) {
    const doc = parser.parseFromString(dec.decode(ss), 'application/xml');
    for (const si of Array.from(doc.getElementsByTagName('si'))) shared.push(Array.from(si.getElementsByTagName('t')).map(t => t.textContent || '').join(''));
  }
  const sheetNames = [...files.keys()].filter(k => /worksheets\/sheet\d+\.xml$/.test(k)).sort((a, b) => Number(a.match(/(\d+)\.xml$/)![1]) - Number(b.match(/(\d+)\.xml$/)![1]));
  if (!sheetNames.length) throw new Error('El Excel no tiene hojas');
  const sheets = (all ? sheetNames : sheetNames.slice(0, 1)).map(name => {
  const doc = parser.parseFromString(dec.decode(files.get(name)!), 'application/xml');
  const rows: string[][] = [];
  for (const row of Array.from(doc.getElementsByTagName('row'))) {
    const r = Number(row.getAttribute('r')) - 1;
    const cells: string[] = [];
    for (const c of Array.from(row.getElementsByTagName('c'))) {
      const ref = c.getAttribute('r') || '';
      const t = c.getAttribute('t');
      const v = c.getElementsByTagName('v')[0]?.textContent ?? '';
      let val = v;
      if (t === 's') val = shared[Number(v)] ?? '';
      else if (t === 'inlineStr') val = Array.from(c.getElementsByTagName('t')).map(x => x.textContent || '').join('');
      else if (t === 'b') val = v === '1' ? 'sí' : 'no';
      cells[ref ? colIndex(ref) : cells.length] = val;
    }
    rows[r >= 0 ? r : rows.length] = Array.from(cells, x => x ?? '');
  }
  return Array.from(rows, x => x ?? []);
  });
  return all ? sheets : sheets[0];
}

function readCsv(text: string): string[][] {
  const sep = (text.split('\n')[0].match(/;/g) || []).length > (text.split('\n')[0].match(/,/g) || []).length ? ';' : ',';
  const rows: string[][] = [];
  let cur: string[] = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; } else if (ch === '"') q = false; else field += ch; continue; }
    if (ch === '"') q = true;
    else if (ch === sep) { cur.push(field); field = ''; }
    else if (ch === '\n') { cur.push(field.replace(/\r$/, '')); rows.push(cur); cur = []; field = ''; }
    else field += ch;
  }
  if (field || cur.length) { cur.push(field); rows.push(cur); }
  return rows;
}

/** Lee la primera hoja de un .xlsx o un .csv como matriz de textos. */
export async function readSpreadsheet(file: File): Promise<string[][]> {
  if (/\.csv$/i.test(file.name) || file.type === 'text/csv') return readCsv(await file.text());
  if (/\.xls$/i.test(file.name)) throw new Error('El formato .xls (Excel 97) no se puede leer. En Excel: Archivo → Guardar como → Libro de Excel (.xlsx).');
  return readXlsx(await file.arrayBuffer());
}

/** Todas las hojas de un .xlsx (un .csv cuenta como una sola hoja). */
export async function readAllSheets(file: File): Promise<string[][][]> {
  if (/\.csv$/i.test(file.name) || file.type === 'text/csv') return [readCsv(await file.text())];
  return readXlsx(await file.arrayBuffer(), true);
}

/** Quita tildes, espacios y mayúsculas para comparar encabezados. */
export const normHeader = (s: string) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
