/* =========================================================================
   Taranis Console — iConnections export reader
   -------------------------------------------------------------------------
   Reads an .xlsx in the browser and turns it into the rows the matcher
   (console_iconnections_match, schema-15) takes. Nothing leaves the browser
   except those parsed rows.

   No library: an .xlsx is a zip of XML files, and this reads only what an
   iConnections export uses (shared strings, inline strings, numbers,
   booleans). Anything it does not understand stops the import with a
   message saying what and where, rather than dropping or guessing at rows.

   Loaded on demand by app.js (window.IconnReader). Under Node it is also a
   CommonJS module, so tests/iconnections.test.mjs can run it without a
   browser.
   ========================================================================= */

(function (root) {
  'use strict';

  const MAX_ROWS = 5000;

  class ReadError extends Error {
    constructor(msg) { super(msg); this.name = 'ReadError'; }
  }

  /* ------------------------------------------------------------------ zip */

  // The entries of a zip, by name, each with a function that inflates it.
  function readZip(buf) {
    const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    if (u8.length >= 8 && u8[0] === 0xD0 && u8[1] === 0xCF && u8[2] === 0x11 && u8[3] === 0xE0) {
      throw new ReadError('This is an older Excel file (.xls), or a password-protected one. '
        + 'Open it in Excel, remove any password, and save it as .xlsx (Excel Workbook), then try again.');
    }
    if (u8.length < 22 || u8[0] !== 0x50 || u8[1] !== 0x4B) {
      throw new ReadError('This file is not an .xlsx workbook. Export it from iConnections as Excel (.xlsx).');
    }
    // End of central directory: the last 22+ bytes, signature 06054b50.
    let eocd = -1;
    for (let i = u8.length - 22; i >= Math.max(0, u8.length - 22 - 65535); i--) {
      if (dv.getUint32(i, true) === 0x06054B50) { eocd = i; break; }
    }
    if (eocd < 0) throw new ReadError('The .xlsx file is damaged (its zip directory is missing). Re-export it and try again.');
    const count = dv.getUint16(eocd + 10, true);
    let p = dv.getUint32(eocd + 16, true);
    if (p === 0xFFFFFFFF || count === 0xFFFF) {
      throw new ReadError('This workbook is too large for the in-browser reader (zip64). Split it into smaller files.');
    }
    const entries = {};
    const dec = new TextDecoder('utf-8');
    for (let n = 0; n < count; n++) {
      if (dv.getUint32(p, true) !== 0x02014B50) throw new ReadError('The .xlsx file is damaged (bad zip entry). Re-export it and try again.');
      const flags = dv.getUint16(p + 8, true);
      const method = dv.getUint16(p + 10, true);
      const csize = dv.getUint32(p + 20, true);
      const usize = dv.getUint32(p + 24, true);
      const nlen = dv.getUint16(p + 28, true);
      const xlen = dv.getUint16(p + 30, true);
      const clen = dv.getUint16(p + 32, true);
      const local = dv.getUint32(p + 42, true);
      const name = dec.decode(u8.subarray(p + 46, p + 46 + nlen));
      p += 46 + nlen + xlen + clen;
      entries[name] = { name, flags, method, csize, usize, local };
    }
    const open = async (name) => {
      const e = entries[name];
      if (!e) return null;
      if (e.flags & 1) throw new ReadError('This workbook is encrypted. Save an unprotected copy as .xlsx and try again.');
      const lnlen = dv.getUint16(e.local + 26, true);
      const lxlen = dv.getUint16(e.local + 28, true);
      const start = e.local + 30 + lnlen + lxlen;
      const data = u8.subarray(start, start + e.csize);
      if (e.method === 0) return dec.decode(data);
      if (e.method !== 8) throw new ReadError('The .xlsx uses a compression this reader does not know (method ' + e.method + '). Re-save it in Excel and try again.');
      const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      return dec.decode(await new Response(stream).arrayBuffer());
    };
    return { entries, open };
  }

  /* ------------------------------------------------------------------ xml */

  const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
  function unescapeXml(s) {
    return s.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|amp|lt|gt|quot|apos);/g, (m, e) =>
      e[0] === '#' ? String.fromCodePoint(e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : ENT[e]);
  }
  function attr(tag, name) {
    const m = tag.match(new RegExp('\\s' + name + '\\s*=\\s*("([^"]*)"|\'([^\']*)\')'));
    return m ? unescapeXml(m[2] !== undefined ? m[2] : m[3]) : null;
  }
  // Text of every <t> inside a string item, skipping phonetic runs (<rPh>).
  function itemText(xml) {
    const body = xml.replace(/<(?:\w+:)?rPh\b[\s\S]*?<\/(?:\w+:)?rPh>/g, '');
    let out = '';
    const re = /<(?:\w+:)?t(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?t>|<(?:\w+:)?t(?:\s[^>]*)?\/>/g;
    let m;
    while ((m = re.exec(body))) out += m[1] ? unescapeXml(m[1]) : '';
    return out;
  }

  function colIndex(ref) {
    const m = /^([A-Z]+)/.exec(ref || '');
    if (!m) return -1;
    let n = 0;
    for (const ch of m[1]) n = n * 26 + (ch.charCodeAt(0) - 64);
    return n - 1;
  }
  function colName(i) {
    let s = '';
    for (i += 1; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s;
    return s;
  }

  // Rows of one sheet: [{r: rowNumber, cells: [value...]}]. Values are
  // strings, numbers or booleans; empty cells are null. Excel error cells
  // (#N/A …) are empty too, and listed in `errors` so the console can say so.
  function parseSheet(xml, shared, sheetName) {
    const rows = [];
    const errors = [];
    const rowRe = /<(?:\w+:)?row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?row>)/g;
    const cellRe = /<(?:\w+:)?c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?c>)/g;
    let rm, nextRow = 1;
    while ((rm = rowRe.exec(xml))) {
      const rAttr = attr(' ' + rm[1], 'r');
      const r = rAttr ? parseInt(rAttr, 10) : nextRow;
      nextRow = r + 1;
      const cells = [];
      let cm, nextCol = 0;
      const body = rm[2] || '';
      cellRe.lastIndex = 0;
      while ((cm = cellRe.exec(body))) {
        const a = ' ' + cm[1];
        const ref = attr(a, 'r');
        const ci = ref ? colIndex(ref) : nextCol;
        nextCol = ci + 1;
        const t = attr(a, 't') || 'n';
        const inner = cm[2] || '';
        const vm = /<(?:\w+:)?v(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?v>/.exec(inner);
        const v = vm ? unescapeXml(vm[1]) : null;
        const where = sheetName + '!' + (ref || colName(ci) + r);
        let val = null;
        if (t === 's') {
          if (v === null) val = null;
          else {
            const k = parseInt(v, 10);
            if (!(k >= 0 && k < shared.length)) throw new ReadError('Cell ' + where + ' points at text the workbook does not contain. The file looks damaged; re-export it.');
            val = shared[k];
          }
        } else if (t === 'inlineStr') {
          val = itemText(inner);
        } else if (t === 'str' || t === 'd') {
          val = v;
        } else if (t === 'n') {
          if (v === null || v === '') val = null;
          else {
            val = Number(v);
            if (!isFinite(val)) throw new ReadError('Cell ' + where + ' holds a number this reader cannot read (' + v + ').');
          }
        } else if (t === 'b') {
          val = v === '1';
        } else if (t === 'e') {
          errors.push({ where: where, value: v });
          val = null;
        } else {
          throw new ReadError('Cell ' + where + ' has a cell type this reader does not know ("' + t + '"). '
            + 'Nothing was imported. Re-save the file in Excel as .xlsx, or tell us which column it is in.');
        }
        if (typeof val === 'string') { val = val.replace(/\r\n?/g, '\n'); if (val.trim() === '') val = null; }
        if (ci >= 0) cells[ci] = val;
      }
      for (let i = 0; i < cells.length; i++) if (cells[i] === undefined) cells[i] = null;
      if (cells.some(c => c !== null)) rows.push({ r: r, cells: cells });
    }
    return { rows, errors };
  }

  // Every sheet in the workbook, in tab order, with its rows.
  async function readWorkbook(buf) {
    const zip = readZip(buf);
    const wb = await zip.open('xl/workbook.xml');
    if (!wb) {
      if (zip.entries['xl/workbook.bin']) throw new ReadError('This is a binary workbook (.xlsb). Save it as .xlsx (Excel Workbook) and try again.');
      if (zip.entries['content.xml']) throw new ReadError('This is an OpenDocument spreadsheet (.ods). Save it as .xlsx and try again.');
      throw new ReadError('This file is a zip, but not an Excel workbook. Export it from iConnections as .xlsx.');
    }
    const relsXml = (await zip.open('xl/_rels/workbook.xml.rels')) || '';
    const rels = {};
    relsXml.replace(/<(?:\w+:)?Relationship\b[^>]*>/g, (tag) => {
      const id = attr(tag, 'Id'), target = attr(tag, 'Target');
      if (id && target) rels[id] = target;
      return '';
    });
    const sstXml = await zip.open('xl/sharedStrings.xml');
    const shared = [];
    if (sstXml) {
      const re = /<(?:\w+:)?si\b[^>]*?(?:\/>|>([\s\S]*?)<\/(?:\w+:)?si>)/g;
      let m;
      while ((m = re.exec(sstXml))) shared.push(m[1] ? itemText(m[1]) : '');
    }
    const sheets = [];
    const tagRe = /<(?:\w+:)?sheet\b[^>]*>/g;
    let tm;
    while ((tm = tagRe.exec(wb))) {
      const tag = tm[0];
      const name = attr(tag, 'name') || ('Sheet' + (sheets.length + 1));
      const rid = attr(tag, 'r:id') || attr(tag, 'id');
      const state = attr(tag, 'state') || 'visible';
      let target = rels[rid];
      if (!target) continue;
      target = target.replace(/^\//, '');
      const path = target.startsWith('xl/') ? target : 'xl/' + target.replace(/^\.\//, '');
      const xml = await zip.open(path);
      if (xml === null) {
        // A chart sheet or a missing part: nothing tabular to read.
        sheets.push({ name, state, rows: [], errors: [], note: 'not a worksheet' });
        continue;
      }
      if (!/<(?:\w+:)?worksheet\b/.test(xml)) { sheets.push({ name, state, rows: [], errors: [], note: 'not a worksheet' }); continue; }
      const parsed = parseSheet(xml, shared, name);
      sheets.push({ name, state, rows: parsed.rows, errors: parsed.errors });
    }
    if (!sheets.length) throw new ReadError('The workbook has no sheets the reader could open.');
    return sheets;
  }

  /* -------------------------------------------------------------- headers */

  // A header as words: "Firm  Name:" -> "firm name".
  function normHeader(h) {
    return String(h === null || h === undefined ? '' : h).toLowerCase()
      .replace(/[_\-./:]+/g, ' ').replace(/[^\p{L}\p{N}$()% ]+/gu, ' ').replace(/\s+/g, ' ').trim();
  }

  // What each field may be called, best first. Matching is on the whole
  // normalised header, except for the patterns (regular expressions).
  const FIELDS = {
    name: {
      label: 'Allocator name', required: true,
      names: ['firm name', 'firm', 'allocator name', 'allocator', 'organization name', 'organisation name',
              'organization', 'organisation', 'company name', 'company', 'investor name', 'investor',
              'institution name', 'institution', 'account name', 'account', 'entity name', 'entity',
              'lp name', 'limited partner', 'name'],
      patterns: [/^(firm|allocator|organi[sz]ation|company|investor|institution|entity|account) name\b/]
    },
    domain: {
      label: 'Website / domain',
      names: ['website', 'web site', 'firm website', 'company website', 'website url', 'url', 'domain',
              'web', 'homepage', 'home page', 'site', 'email domain'],
      patterns: [/\bwebsite\b/, /\bdomain\b/, /\burl\b/]
    },
    aum: {
      label: 'AUM',
      names: ['aum', 'aum usd', 'aum (usd)', 'aum ($)', 'total aum', 'firm aum', 'aum range', 'aum band',
              'assets under management', 'total assets', 'assets', 'aum ($m)', 'aum ($mm)', 'aum (usd m)',
              'aum (usd mm)', 'aum (usd bn)', 'aum ($bn)'],
      patterns: [/\baum\b/, /assets under management/, /^total assets\b/, /^assets\b/]
    },
    type: {
      label: 'Investor type',
      names: ['investor type', 'allocator type', 'firm type', 'organization type', 'organisation type',
              'institution type', 'lp type', 'entity type', 'account type', 'type', 'investor category',
              'category', 'investor class'],
      patterns: [/\b(investor|allocator|firm|organi[sz]ation|institution|lp|entity) type\b/]
    },
    country: {
      label: 'Country',
      names: ['country', 'hq country', 'headquarters country', 'firm country', 'country of domicile',
              'domicile', 'location country', 'hq location', 'headquarters', 'hq', 'location', 'country region'],
      patterns: [/\bcountry\b/, /\bdomicile\b/]
    },
    // The people at each firm, as a contacts export lists them. Read for the
    // Investors column only: it is never put into the rows that are sent,
    // their raw cells or the column mapping, so names stay in the browser.
    person: {
      label: 'Investor (person) name',
      browserOnly: true,
      names: ['full name', 'contact name', 'name', 'contact', 'person', 'person name', 'contact person', 'investor contact'],
      patterns: [/\b(contact|full|person) name\b/]
    }
  };
  // Fields that may leave the browser, in the order they are detected.
  const SENT_FIELDS = ['name', 'domain', 'aum', 'type', 'country'];

  // Which column holds each field. Returns {field: columnIndex}; a field the
  // headers do not name is left out.
  function detectColumns(headers) {
    const norm = headers.map(normHeader);
    const used = new Set();
    const out = {};
    for (const field of SENT_FIELDS.concat('person')) {
      const spec = FIELDS[field];
      let pick = -1;
      for (const n of spec.names) {
        pick = norm.findIndex((h, i) => h === n && !used.has(i));
        if (pick >= 0) break;
      }
      if (pick < 0) {
        for (const re of spec.patterns) {
          // "LinkedIn URL" or "Email" is not the firm's website.
          pick = norm.findIndex((h, i) => h && re.test(h) && !used.has(i)
            && !(field === 'domain' && /linkedin|twitter|facebook|logo|email|e mail/.test(h))
            && !(field === 'person' && /email|e mail|phone|title|linkedin|url/.test(h)));
          if (pick >= 0) break;
        }
      }
      // A bare "name" next to "first name" / "last name" is a person.
      if (field === 'name' && pick >= 0 && norm[pick] === 'name'
          && norm.some(h => h === 'first name' || h === 'last name')) pick = -1;
      if (pick >= 0) { out[field] = pick; used.add(pick); }
    }
    return out;
  }

  // The header row of a sheet: among its first 15 rows, the first one in
  // which the allocator-name column can be recognised; failing that, the
  // row that recognises the most fields. Returns null for a sheet with no
  // recognisable header.
  function findHeader(rows) {
    let best = null;
    for (let i = 0; i < Math.min(rows.length, 15); i++) {
      const cells = rows[i].cells;
      if (!cells.some(c => typeof c === 'string')) continue;
      const cols = detectColumns(cells);
      const score = Object.keys(cols).length + (cols.name !== undefined ? 10 : 0);
      if (!best || score > best.score) best = { index: i, cols: cols, score: score };
      if (cols.name !== undefined) break;
    }
    return best && best.score > 0 ? best : null;
  }

  // Choose the data sheet: the sheet whose header names an allocator column
  // and has the most rows under it, visible sheets first. A cover or notes
  // sheet in front of the data is passed over. Returns
  // {sheet, headerIndex, cols, candidates} — sheet is null when no sheet
  // has a recognisable allocator column, and the console then asks.
  function chooseSheet(sheets) {
    const candidates = sheets.map((s, i) => {
      const h = findHeader(s.rows);
      const dataRows = h ? s.rows.length - h.index - 1 : Math.max(0, s.rows.length - 1);
      return { i, name: s.name, state: s.state, header: h, dataRows,
               hasName: !!(h && h.cols.name !== undefined) };
    });
    const ranked = candidates
      .filter(c => c.hasName && c.dataRows > 0)
      .sort((a, b) => (a.state === 'visible' ? 0 : 1) - (b.state === 'visible' ? 0 : 1) || b.dataRows - a.dataRows || a.i - b.i);
    const top = ranked[0];
    return {
      sheet: top ? sheets[top.i] : null,
      headerIndex: top ? top.header.index : null,
      cols: top ? top.header.cols : null,
      candidates: candidates
    };
  }

  /* ---------------------------------------------------------- cell values */

  const UNIT = { k: 1e3, thousand: 1e3, m: 1e6, mm: 1e6, mn: 1e6, million: 1e6, millions: 1e6,
                 b: 1e9, bn: 1e9, billion: 1e9, billions: 1e9, tn: 1e12, trillion: 1e12 };
  const NUM = '([0-9][0-9,]*(?:\\.[0-9]+)?)';
  const UNITS = '(k|thousand|m|mm|mn|million|millions|b|bn|billion|billions|tn|trillion)';
  const CUR = '(?:usd|us\\$|\\$)?\\s*\\$?\\s*';
  const RE_RANGE = new RegExp('^' + CUR + NUM + '\\s*' + UNITS + '?\\s*(?:-|to)\\s*' + CUR + NUM + '\\s*' + UNITS + '$');
  const RE_OVER  = new RegExp('^(?:>=?|over|above|more than|greater than|at least|in excess of)\\s*' + CUR + NUM + '\\s*' + UNITS + '$');
  const RE_UNDER = new RegExp('^(?:<=?|under|below|less than|up to)\\s*' + CUR + NUM + '\\s*' + UNITS + '$');
  const RE_POINT = new RegExp('^(?:(?:circa|approx|approximately|around|about|c|~)\\.?\\s*)?' + CUR + NUM + '\\s*' + UNITS + '$');
  const RE_PLAIN = /^(?:usd|us\$|\$)?\s*\$?\s*([0-9][0-9,]*(?:\.[0-9]+)?)$/;

  // The unit a header puts on plain numbers: "AUM ($M)" -> 1e6.
  function headerUnit(header) {
    const h = String(header || '').toLowerCase();
    if (/\((?:usd|\$|us\$)?\s*(?:bn|b|billions?)\)|in billions|\$\s?bn\b|usd ?bn\b/.test(h)) return 1e9;
    if (/\((?:usd|\$|us\$)?\s*(?:m|mm|mn|millions?)\)|in millions|\$\s?mm?\b|usd ?mm?\b/.test(h)) return 1e6;
    if (/\((?:usd|\$|us\$)?\s*(?:k|thousands?)\)|in thousands|\$\s?k\b/.test(h)) return 1e3;
    return 1;
  }

  const n = (s) => Number(String(s).replace(/,/g, ''));

  // AUM cell -> {low, high, ok}. high null = no upper bound. A number, a
  // number stored as text ("1,500,000,000"), or a band ("$1bn - $2.5bn",
  // "> $50bn"). Same rules as iconn_aum_bounds in schema-15. ok = false when
  // the cell has something in it that is not an amount; the row is still
  // matched by name, just without an AUM check.
  function parseAum(value, header) {
    if (value === null || value === undefined || value === '') return { low: null, high: null, ok: true };
    const mult = headerUnit(header);
    if (typeof value === 'number') {
      return isFinite(value) && value >= 0 ? { low: value * mult, high: value * mult, ok: true } : { low: null, high: null, ok: false };
    }
    if (typeof value === 'boolean') return { low: null, high: null, ok: false };
    const s = String(value).toLowerCase().trim().replace(/[\u2013\u2014]/g, '-').replace(/\s+/g, ' ');
    if (!s || s === '-' || s === 'n/a' || s === 'na' || s === 'undisclosed' || s === 'not disclosed') return { low: null, high: null, ok: true };
    let m;
    if ((m = RE_PLAIN.exec(s))) { const v = n(m[1]) * mult; return { low: v, high: v, ok: isFinite(v) }; }
    if (/%/.test(s)) return { low: null, high: null, ok: false };
    if ((m = RE_RANGE.exec(s))) {
      const a = n(m[1]) * UNIT[m[2] || m[4]], b = n(m[3]) * UNIT[m[4]];
      return { low: Math.min(a, b), high: Math.max(a, b), ok: true };
    }
    if ((m = RE_OVER.exec(s))) return { low: n(m[1]) * UNIT[m[2]], high: null, ok: true };
    if ((m = RE_UNDER.exec(s))) return { low: 0, high: n(m[1]) * UNIT[m[2]], ok: true };
    if ((m = RE_POINT.exec(s))) { const v = n(m[1]) * UNIT[m[2]]; return { low: v, high: v, ok: true }; }
    return { low: null, high: null, ok: false };
  }

  // Website, URL or e-mail -> bare domain ("https://www.adia.ae/en" -> "adia.ae").
  function parseDomain(value) {
    if (value === null || value === undefined) return null;
    let s = String(value).trim().toLowerCase();
    if (!s) return null;
    if (s.includes('@')) s = s.split('@').pop();
    s = s.replace(/^[a-z]+:\/\//, '').replace(/^www\d?\./, '').split(/[/?#:\s]/)[0].replace(/\.$/, '');
    return /^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(s) ? s : null;
  }

  const COUNTRY_SYNONYMS = {
    'usa': 'US', 'us': 'US', 'u s': 'US', 'u s a': 'US', 'united states of america': 'US', 'america': 'US',
    'uk': 'GB', 'u k': 'GB', 'great britain': 'GB', 'britain': 'GB', 'england': 'GB', 'scotland': 'GB',
    'wales': 'GB', 'northern ireland': 'GB', 'uae': 'AE', 'u a e': 'AE', 'emirates': 'AE',
    'south korea': 'KR', 'korea': 'KR', 'republic of korea': 'KR', 'korea republic of': 'KR',
    'russia': 'RU', 'hong kong sar': 'HK', 'hong kong sar china': 'HK', 'taiwan': 'TW', 'holland': 'NL',
    'the netherlands': 'NL', 'czech republic': 'CZ', 'vietnam': 'VN', 'turkey': 'TR', 'turkiye': 'TR',
    'ivory coast': 'CI', 'macau': 'MO', 'kingdom of saudi arabia': 'SA', 'ksa': 'SA', 'mainland china': 'CN',
    'prc': 'CN', 'swiss': 'CH', 'the bahamas': 'BS', 'bvi': 'VG', 'british virgin islands': 'VG',
    'cayman': 'KY', 'cayman islands': 'KY', 'channel islands': 'JE'
  };
  const ISO3 = {
    USA: 'US', GBR: 'GB', ARE: 'AE', CHE: 'CH', DEU: 'DE', FRA: 'FR', JPN: 'JP', SGP: 'SG', HKG: 'HK',
    CAN: 'CA', AUS: 'AU', CHN: 'CN', IND: 'IN', BRA: 'BR', ESP: 'ES', ITA: 'IT', NLD: 'NL', SWE: 'SE',
    NOR: 'NO', DNK: 'DK', FIN: 'FI', SAU: 'SA', QAT: 'QA', KWT: 'KW', BHR: 'BH', OMN: 'OM', ISR: 'IL',
    KOR: 'KR', LUX: 'LU', IRL: 'IE', BEL: 'BE', AUT: 'AT', ZAF: 'ZA', MEX: 'MX', EGY: 'EG', TUR: 'TR'
  };
  let COUNTRY_NAMES = null, COUNTRY_CODES = null;
  function countryNames() {
    if (COUNTRY_NAMES) return COUNTRY_NAMES;
    COUNTRY_NAMES = {};
    COUNTRY_CODES = new Set(Object.values(COUNTRY_SYNONYMS).concat(Object.values(ISO3)));
    try {
      const dn = new Intl.DisplayNames(['en'], { type: 'region' });
      for (let a = 65; a <= 90; a++) for (let b = 65; b <= 90; b++) {
        const code = String.fromCharCode(a, b);
        const label = dn.of(code);
        if (label && label !== code) {
          COUNTRY_NAMES[normHeader(label).replace(/[()$%]/g, '').trim()] = code;
          COUNTRY_CODES.add(code);
        }
      }
    } catch (_) { /* no Intl region names: the synonyms below still work */ }
    return COUNTRY_NAMES;
  }
  // Country cell -> ISO-2 ("United States" -> "US", "UK" -> "GB",
  // "New York, United States" -> "US"), or null when it cannot tell.
  function parseCountry(value) {
    if (value === null || value === undefined) return null;
    const raw = String(value).trim();
    if (!raw) return null;
    const parts = raw.split(/[,;|/]/).map(s => s.trim()).filter(Boolean);
    for (const part of [raw, parts[parts.length - 1], parts[0]]) {
      if (!part) continue;
      if (/^[A-Za-z]{2}$/.test(part)) {
        const up = part.toUpperCase();
        if (up === 'UK') return 'GB';
        countryNames();
        if (COUNTRY_CODES.has(up)) return up;
      }
      if (/^[A-Za-z]{3}$/.test(part) && ISO3[part.toUpperCase()]) return ISO3[part.toUpperCase()];
      const k = normHeader(part).replace(/[()$%]/g, '').replace(/\s+/g, ' ').trim();
      if (COUNTRY_SYNONYMS[k]) return COUNTRY_SYNONYMS[k];
      const names = countryNames();
      if (names[k]) return names[k];
    }
    return null;
  }

  /* ----------------------------------------------------------- the rows */

  // The rows to send, from a sheet and a column mapping: one per firm. A
  // contacts export lists a firm once per person, so sheet rows with the same
  // firm (ignoring case and spacing) become one row with `contacts` = how many
  // and `row_nos` = which; the first non-empty website, AUM, type and country
  // among them are kept. The database folds spellings that normalise alike
  // ("Norges Bank" / "Norges Bank, The") the same way. Throws if the sheet has
  // more than MAX_ROWS data rows: better to say so than to match part of a
  // file. Rows with no allocator name are not sent, and each is reported
  // (`unnamed`) so nothing disappears without a word. Only the mapped
  // columns are read, so a person's name never leaves the browser.
  function buildRows(sheet, headerIndex, cols) {
    if (cols.name === undefined || cols.name === null || cols.name < 0) {
      throw new ReadError('Choose which column holds the allocator name.');
    }
    const headers = sheet.rows[headerIndex] ? sheet.rows[headerIndex].cells : [];
    const data = sheet.rows.slice(headerIndex + 1);
    if (!data.length) throw new ReadError('The sheet "' + sheet.name + '" has a header row but no rows under it.');
    if (data.length > MAX_ROWS) {
      throw new ReadError('The sheet "' + sheet.name + '" has ' + data.length.toLocaleString('en') + ' rows; the import takes up to '
        + MAX_ROWS.toLocaleString('en') + '. Split the file and import each part.');
    }
    const head = (f) => (cols[f] !== undefined && cols[f] !== null && cols[f] >= 0) ? headers[cols[f]] : null;
    const get = (cells, f) => (cols[f] !== undefined && cols[f] !== null && cols[f] >= 0) ? cells[cols[f]] : null;
    const rows = [], unnamed = [], aumUnread = [], countryUnread = [];
    const byFirm = new Map();
    let sheetRows = 0;
    for (const row of data) {
      const nameCell = get(row.cells, 'name');
      const name = nameCell === null || nameCell === undefined ? '' : String(nameCell).replace(/\s+/g, ' ').trim();
      if (!name) { unnamed.push(row.r); continue; }
      const aumCell = get(row.cells, 'aum');
      const aum = parseAum(aumCell, head('aum'));
      if (!aum.ok) aumUnread.push({ row: row.r, value: String(aumCell) });
      const countryCell = get(row.cells, 'country');
      const country = parseCountry(countryCell);
      if (countryCell !== null && countryCell !== undefined && !country) countryUnread.push({ row: row.r, value: String(countryCell) });
      const typeCell = get(row.cells, 'type');
      const raw = {};
      for (const f of SENT_FIELDS) {
        if (cols[f] === undefined) continue;
        if (cols[f] !== null && cols[f] >= 0 && row.cells[cols[f]] !== null && row.cells[cols[f]] !== undefined) {
          raw[String(headers[cols[f]] || f)] = row.cells[cols[f]];
        }
      }
      sheetRows++;
      const key = name.toLowerCase().replace(/\s+/g, ' ');
      const seen = byFirm.get(key);
      if (seen) {
        seen.contacts++;
        seen.row_nos.push(row.r);
        const domain = parseDomain(get(row.cells, 'domain'));
        if (!seen.domain && domain) seen.domain = domain;
        if (seen.aum_low === null && seen.aum_high === null && (aum.low !== null || aum.high !== null)) {
          seen.aum_low = aum.low; seen.aum_high = aum.high; seen.aum_text = String(aumCell).slice(0, 200);
        }
        if (!seen.investor_type && typeCell !== null && typeCell !== undefined) seen.investor_type = String(typeCell).trim().slice(0, 200);
        if (!seen.country && country) seen.country = country;
        continue;
      }
      const firm = {
        row_no: row.r,
        contacts: 1,
        row_nos: [row.r],
        name: name.slice(0, 300),
        domain: parseDomain(get(row.cells, 'domain')),
        aum_text: aumCell === null || aumCell === undefined ? null : String(aumCell).slice(0, 200),
        aum_low: aum.low,
        aum_high: aum.high,
        investor_type: typeCell === null || typeCell === undefined ? null : String(typeCell).trim().slice(0, 200),
        country: country,
        raw: raw
      };
      byFirm.set(key, firm);
      rows.push(firm);
    }
    if (!rows.length) {
      throw new ReadError('No row in "' + sheet.name + '" has an allocator name in the column "'
        + (head('name') || colName(cols.name)) + '". Check the column choice.');
    }
    return { rows, sheetRows, unnamed, aumUnread, countryUnread };
  }

  // Sheet row number -> the person named on it, for the Investors column.
  // From the person column, or First + Last name when that is how the file
  // splits it. Stays in the browser: nothing here goes into buildRows.
  // An empty map when the file names no people.
  function peopleByRow(sheet, headerIndex, cols) {
    const out = new Map();
    const headers = sheet.rows[headerIndex] ? sheet.rows[headerIndex].cells : [];
    const norm = headers.map(normHeader);
    const used = new Set(SENT_FIELDS.map(f => cols[f]).filter(i => i !== undefined && i !== null && i >= 0));
    let pick = (cols.person !== undefined && cols.person !== null && cols.person >= 0 && !used.has(cols.person)) ? [cols.person] : null;
    if (!pick && cols.person === undefined) {
      const first = norm.findIndex((h, i) => /^(first|given) name$/.test(h) && !used.has(i));
      const last = norm.findIndex((h, i) => /^(last|family|sur) ?name$/.test(h) && !used.has(i));
      if (first >= 0 || last >= 0) pick = [first, last].filter(i => i >= 0);
    }
    if (!pick) return out;
    for (const row of sheet.rows.slice(headerIndex + 1)) {
      const v = pick.map(i => row.cells[i]).filter(c => c !== null && c !== undefined && String(c).trim() !== '')
        .map(c => String(c).replace(/\s+/g, ' ').trim()).join(' ');
      if (v) out.set(row.r, v);
    }
    return out;
  }

  async function sha256Hex(buf) {
    const subtle = (root.crypto && root.crypto.subtle) || (typeof require === 'function' ? require('crypto').webcrypto.subtle : null);
    const d = await subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(d), b => b.toString(16).padStart(2, '0')).join('');
  }

  const api = { MAX_ROWS, SENT_FIELDS, peopleByRow, ReadError, readZip, readWorkbook, parseSheet, normHeader, detectColumns, findHeader,
                chooseSheet, headerUnit, parseAum, parseDomain, parseCountry, buildRows, sha256Hex, colName, FIELDS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.IconnReader = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
