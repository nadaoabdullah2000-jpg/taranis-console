/* Builds small .xlsx files for tests/iconnections.test.mjs and the sample
   workbook in tests/fixtures. Only the parts an iConnections export uses.
   A cell is a string (shared string), a number, null, or an object:
   {inline: 'text'}, {rich: ['part', 'part']}, {t: 'e', v: '#N/A'},
   {t: 'b', v: 1}, or {t: 'zz', v: '?'} for a type the reader must refuse. */
import { deflateRawSync, crc32 } from 'node:zlib';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const col = (i) => { let s = ''; for (i += 1; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s; return s; };

export function zip(files, { store = false } = {}) {
  const parts = [], central = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const data = Buffer.from(text, 'utf8');
    const body = store ? data : deflateRawSync(data);
    const nameBuf = Buffer.from(name, 'utf8');
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0, 6);
    local.writeUInt16LE(store ? 0 : 8, 8); local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(nameBuf.length, 26);
    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0); cen.writeUInt16LE(20, 4); cen.writeUInt16LE(20, 6);
    cen.writeUInt16LE(store ? 0 : 8, 10); cen.writeUInt32LE(crc, 16); cen.writeUInt32LE(body.length, 20);
    cen.writeUInt32LE(data.length, 24); cen.writeUInt16LE(nameBuf.length, 28); cen.writeUInt32LE(offset, 42);
    parts.push(local, nameBuf, body);
    central.push(cen, nameBuf);
    offset += 30 + nameBuf.length + body.length;
  }
  const cenBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  const n = Object.keys(files).length;
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(n, 8); end.writeUInt16LE(n, 10);
  end.writeUInt32LE(cenBuf.length, 12); end.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...parts, cenBuf, end]));
}

export function xlsx(sheets, opts = {}) {
  const shared = [], index = new Map();
  const sst = (s) => { if (!index.has(s)) { index.set(s, shared.length); shared.push(s); } return index.get(s); };
  const files = {
    '[Content_Types].xml': '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>',
    'xl/workbook.xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>'
      + sheets.map((s, i) => '<sheet name="' + esc(s.name) + '" sheetId="' + (i + 1) + '"' + (s.state ? ' state="' + s.state + '"' : '') + ' r:id="rId' + (i + 1) + '"/>').join('')
      + '</sheets></workbook>',
    'xl/_rels/workbook.xml.rels': '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + sheets.map((s, i) => '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>').join('')
      + '</Relationships>'
  };
  sheets.forEach((s, si) => {
    const rows = s.rows.map((row, ri) => {
      const r = ri + 1 + (s.skip || 0);
      const cells = row.map((v, ci) => {
        const ref = col(ci) + r;
        if (v === null || v === undefined) return '';
        if (typeof v === 'number') return '<c r="' + ref + '"><v>' + v + '</v></c>';
        if (typeof v === 'string') return '<c r="' + ref + '" t="s"><v>' + sst(v) + '</v></c>';
        if (v.inline !== undefined) return '<c r="' + ref + '" t="inlineStr"><is><t>' + esc(v.inline) + '</t></is></c>';
        if (v.rich) return '<c r="' + ref + '" t="s"><v>' + sst({ rich: v.rich }) + '</v></c>';
        return '<c r="' + ref + '" t="' + v.t + '"><v>' + esc(v.v) + '</v></c>';
      }).join('');
      return '<row r="' + r + '">' + cells + '</row>';
    }).join('');
    files['xl/worksheets/sheet' + (si + 1) + '.xml'] = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>' + rows + '</sheetData></worksheet>';
  });
  files['xl/sharedStrings.xml'] = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="' + shared.length + '" uniqueCount="' + shared.length + '">'
    + shared.map(s => typeof s === 'string'
        ? '<si><t xml:space="preserve">' + esc(s) + '</t></si>'
        : '<si>' + s.rich.map(p => '<r><rPr><b/></rPr><t>' + esc(p) + '</t></r>').join('') + '<rPh sb="0" eb="1"><t>PHONETIC</t></rPh></si>').join('')
    + '</sst>';
  return zip(files, opts);
}
