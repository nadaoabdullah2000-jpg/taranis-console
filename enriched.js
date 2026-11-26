/* enriched.js (26 Nov 2026): reader for the enriched allocator workbook (.xlsm / .xlsx), tab "Enriched" or "Enrich".
   One file, no dependencies, used in three places so the field mapping is identical everywhere:
     - the console's Allocators upload (browser, window.EnrichedReader),
     - the n8n workflow "Grok Allocators -> Web App" (the Code node "Parse Enriched" holds a copy),
     - tests/enriched.test.mjs (Node, require()).
   Why a reader of its own: the With Intelligence, iConnections and Preqin addresses are cell HYPERLINKS (the cell
   text is just "With Intelligence"); generic spreadsheet readers drop hyperlinks. This one reads the sheet XML, the
   shared strings and the sheet's hyperlink relationships. It inflates the zip itself (RFC 1951), so it needs no
   DecompressionStream or zlib.
   Nothing is truncated: every cell's full text is kept; formulas are read from their cached values. */
(function (root) {
  'use strict';

  /* ---------------------------------------------------------------- inflate (RFC 1951) */
  function Tree() { this.table = new Uint16Array(16); this.trans = new Uint16Array(288); }
  const sltree = new Tree(), sdtree = new Tree();
  const lengthBits = new Uint8Array(30), lengthBase = new Uint16Array(30), distBits = new Uint8Array(30), distBase = new Uint16Array(30);
  const clcidx = new Uint8Array([16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15]);
  function buildBitsBase(bits, base, delta, first) {
    for (let i = 0; i < delta; i++) bits[i] = 0;
    for (let i = 0; i < 30 - delta; i++) bits[i + delta] = (i / delta) | 0;
    for (let sum = first, i = 0; i < 30; i++) { base[i] = sum; sum += 1 << bits[i]; }
  }
  buildBitsBase(lengthBits, lengthBase, 4, 3); buildBitsBase(distBits, distBase, 2, 1);
  lengthBits[28] = 0; lengthBase[28] = 258;
  (function fixed() {
    for (let i = 0; i < 7; i++) sltree.table[i] = 0;
    sltree.table[7] = 24; sltree.table[8] = 152; sltree.table[9] = 112;
    for (let i = 0; i < 24; i++) sltree.trans[i] = 256 + i;
    for (let i = 0; i < 144; i++) sltree.trans[24 + i] = i;
    for (let i = 0; i < 8; i++) sltree.trans[24 + 144 + i] = 280 + i;
    for (let i = 0; i < 112; i++) sltree.trans[24 + 144 + 8 + i] = 144 + i;
    for (let i = 0; i < 5; i++) sdtree.table[i] = 0;
    sdtree.table[5] = 32;
    for (let i = 0; i < 32; i++) sdtree.trans[i] = i;
  })();
  const offs = new Uint16Array(16);
  function buildTree(t, lengths, off, num) {
    for (let i = 0; i < 16; i++) t.table[i] = 0;
    for (let i = 0; i < num; i++) t.table[lengths[off + i]]++;
    t.table[0] = 0;
    for (let sum = 0, i = 0; i < 16; i++) { offs[i] = sum; sum += t.table[i]; }
    for (let i = 0; i < num; i++) if (lengths[off + i]) t.trans[offs[lengths[off + i]]++] = i;
  }
  function inflateRaw(src) {
    const d = { src, i: 0, tag: 0, bitcount: 0, out: new Uint8Array(Math.max(1024, src.length * 4)), n: 0,
                ltree: new Tree(), dtree: new Tree() };
    const need = (k) => { if (d.n + k > d.out.length) { const o = new Uint8Array(Math.max(d.out.length * 2, d.n + k)); o.set(d.out); d.out = o; } };
    const getbit = () => { if (!d.bitcount--) { d.tag = d.src[d.i++]; d.bitcount = 7; } const b = d.tag & 1; d.tag >>>= 1; return b; };
    const readbits = (num, base) => {
      if (!num) return base;
      while (d.bitcount < 24) { d.tag |= (d.i < d.src.length ? d.src[d.i] : 0) << d.bitcount; d.i++; d.bitcount += 8; }
      const val = d.tag & (0xffff >>> (16 - num)); d.tag >>>= num; d.bitcount -= num; return val + base;
    };
    const decodeSym = (t) => {
      while (d.bitcount < 24) { d.tag |= (d.i < d.src.length ? d.src[d.i] : 0) << d.bitcount; d.i++; d.bitcount += 8; }
      let sum = 0, cur = 0, len = 0, tag = d.tag;
      do { cur = 2 * cur + (tag & 1); tag >>>= 1; ++len; sum += t.table[len]; cur -= t.table[len]; } while (cur >= 0);
      d.tag = tag; d.bitcount -= len; return t.trans[sum + cur];
    };
    const lengths = new Uint8Array(288 + 32);
    const decodeTrees = () => {
      const hlit = readbits(5, 257), hdist = readbits(5, 1), hclen = readbits(4, 4);
      for (let i = 0; i < 19; i++) lengths[i] = 0;
      for (let i = 0; i < hclen; i++) lengths[clcidx[i]] = readbits(3, 0);
      const code = new Tree(); buildTree(code, lengths, 0, 19);
      for (let num = 0; num < hlit + hdist;) {
        const sym = decodeSym(code);
        let length, prev;
        switch (sym) {
          case 16: prev = lengths[num - 1]; for (length = readbits(2, 3); length; --length) lengths[num++] = prev; break;
          case 17: for (length = readbits(3, 3); length; --length) lengths[num++] = 0; break;
          case 18: for (length = readbits(7, 11); length; --length) lengths[num++] = 0; break;
          default: lengths[num++] = sym;
        }
      }
      buildTree(d.ltree, lengths, 0, hlit); buildTree(d.dtree, lengths, hlit, hdist);
    };
    const block = (lt, dt) => {
      for (;;) {
        let sym = decodeSym(lt);
        if (sym === 256) return;
        if (sym < 256) { need(1); d.out[d.n++] = sym; continue; }
        sym -= 257;
        const length = readbits(lengthBits[sym], lengthBase[sym]);
        const dsym = decodeSym(dt);
        const off = d.n - readbits(distBits[dsym], distBase[dsym]);
        need(length);
        for (let i = off; i < off + length; ++i) d.out[d.n++] = d.out[i];
      }
    };
    const stored = () => {
      // Give back every whole byte read ahead (>= 8: a full unread byte is the start of LEN, not padding).
      while (d.bitcount >= 8) { d.i--; d.bitcount -= 8; }
      const len = d.src[d.i + 1] * 256 + d.src[d.i]; d.i += 4;
      need(len); for (let i = len; i; --i) d.out[d.n++] = d.src[d.i++];
      d.bitcount = 0;
    };
    let bfinal;
    do {
      if (d.i > d.src.length + 4) throw new Error('The file is damaged (compressed data runs past its end).');
      bfinal = getbit();
      const btype = readbits(2, 0);
      if (btype === 0) stored();
      else if (btype === 1) block(sltree, sdtree);
      else if (btype === 2) { decodeTrees(); block(d.ltree, d.dtree); }
      else throw new Error('The file is damaged (bad compressed block).');
    } while (!bfinal);
    return d.out.subarray(0, d.n);
  }

  /* ---------------------------------------------------------------- zip + xml */
  function u8(input) {
    if (input instanceof Uint8Array) return input;
    if (typeof ArrayBuffer !== 'undefined' && input instanceof ArrayBuffer) return new Uint8Array(input);
    if (input && input.buffer instanceof ArrayBuffer) return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
    throw new Error('Give the file as bytes.');
  }
  const utf8 = (b) => (typeof TextDecoder !== 'undefined' ? new TextDecoder('utf-8').decode(b) : Buffer.from(b).toString('utf8'));
  function unzip(input) {
    const b = u8(input), dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    if (b.length < 22 || b[0] !== 0x50 || b[1] !== 0x4b) throw new Error('This is not an .xlsx / .xlsm file.');
    let eocd = -1;
    for (let i = b.length - 22; i >= Math.max(0, b.length - 66000); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw new Error('The file is damaged (no zip directory).');
    const count = dv.getUint16(eocd + 10, true);
    let p = dv.getUint32(eocd + 16, true);
    const files = {};
    for (let k = 0; k < count; k++) {
      if (dv.getUint32(p, true) !== 0x02014b50) break;
      const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true);
      const nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
      const local = dv.getUint32(p + 42, true);
      const name = utf8(b.subarray(p + 46, p + 46 + nlen));
      p += 46 + nlen + xlen + clen;
      files[name] = () => {
        const start = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true);
        const data = b.subarray(start, start + csize);
        if (method === 0) return utf8(data);
        if (method === 8) return utf8(inflateRaw(data));
        throw new Error('Unsupported compression in ' + name + '.');
      };
    }
    return files;
  }
  const decodeXml = (s) => s.replace(/&(lt|gt|amp|quot|apos|#\d+|#x[0-9a-fA-F]+);/g, (m, e) =>
    e === 'lt' ? '<' : e === 'gt' ? '>' : e === 'amp' ? '&' : e === 'quot' ? '"' : e === 'apos' ? "'"
      : String.fromCodePoint(e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)));
  const attr = (tag, name) => { const m = new RegExp('\\b' + name + '="([^"]*)"').exec(tag); return m ? decodeXml(m[1]) : null; };
  // All the text of an <si> or <is>: every <t> run joined (rich text keeps every run; nothing dropped).
  const runsText = (xml) => { let out = ''; const re = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>|<t[^>]*\/>/g; let m; while ((m = re.exec(xml))) out += m[1] ? decodeXml(m[1]) : ''; return out; };
  const colIndex = (ref) => { let n = 0; for (const ch of ref.replace(/\d+/g, '')) n = n * 26 + (ch.charCodeAt(0) - 64); return n - 1; };

  // Reads one sheet: { name, rows: [[text...]], links: {"r,c": url} }.
  function readSheets(input) {
    const files = unzip(input);
    const get = (n) => (files[n] ? files[n]() : null);
    const wb = get('xl/workbook.xml');
    if (!wb) throw new Error('Not a spreadsheet: no workbook inside.');
    const rels = get('xl/_rels/workbook.xml.rels') || '';
    const relTarget = {};
    for (const m of rels.matchAll(/<Relationship\b[^>]*>/g)) relTarget[attr(m[0], 'Id')] = attr(m[0], 'Target');
    const shared = [];
    const ss = get('xl/sharedStrings.xml');
    if (ss) for (const m of ss.matchAll(/<si>([\s\S]*?)<\/si>/g)) shared.push(runsText(m[1]));
    const sheets = [];
    for (const m of wb.matchAll(/<sheet\b[^>]*\/?>/g)) {
      const name = attr(m[0], 'name'), rid = attr(m[0], 'r:id'), state = attr(m[0], 'state') || 'visible';
      let target = relTarget[rid] || '';
      target = target.replace(/^\/?xl\//, '').replace(/^\//, '');
      const path = 'xl/' + target;
      sheets.push({ name, state, path, read: () => readSheet(get, path, shared) });
    }
    return sheets;
  }
  function readSheet(get, path, shared) {
    const xml = get(path) || '';
    const relsPath = path.replace(/([^/]+)$/, '_rels/$1.rels');
    const rels = get(relsPath) || '';
    const relTarget = {};
    for (const m of rels.matchAll(/<Relationship\b[^>]*>/g)) relTarget[attr(m[0], 'Id')] = attr(m[0], 'Target');
    const rows = [];
    for (const rm of xml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
      const r = parseInt(attr(rm[0], 'r'), 10) - 1;
      const cells = [];
      for (const cm of rm[2].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const tag = '<c ' + cm[1] + '>';
        const ref = attr(tag, 'r'), t = attr(tag, 't'), inner = cm[2] || '';
        let v = null;
        if (t === 'inlineStr') { const is = /<is>([\s\S]*?)<\/is>/.exec(inner); v = is ? runsText(is[1]) : ''; }
        else {
          const vm = /<v>([\s\S]*?)<\/v>/.exec(inner);
          if (vm) {
            const raw = decodeXml(vm[1]);
            v = t === 's' ? (shared[parseInt(raw, 10)] ?? '') : t === 'b' ? (raw === '1') : t === 'str' || t === 'e' ? raw : (raw !== '' && isFinite(raw) ? Number(raw) : raw);
          }
        }
        cells[ref ? colIndex(ref) : cells.length] = v;
      }
      rows[r] = cells;
    }
    const links = {};
    for (const hm of xml.matchAll(/<hyperlink\b[^>]*\/?>/g)) {
      const ref = attr(hm[0], 'ref'), rid = attr(hm[0], 'r:id');
      const url = rid ? relTarget[rid] : null;
      if (!ref || !url) continue;
      const [a, bRef] = ref.split(':');
      const r0 = parseInt(a.replace(/\D/g, ''), 10) - 1, c0 = colIndex(a);
      const r1 = bRef ? parseInt(bRef.replace(/\D/g, ''), 10) - 1 : r0, c1 = bRef ? colIndex(bRef) : c0;
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) links[r + ',' + c] = url;
    }
    for (let i = 0; i < rows.length; i++) if (!rows[i]) rows[i] = [];
    return { rows, links };
  }

  /* ---------------------------------------------------------------- the Enriched tab */
  const norm = (h) => String(h ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  // Field -> accepted header spellings (normalised). New files with slightly different headers still map.
  const FIELDS = {
    name:             ['allocator', 'allocator name', 'investor', 'investor name', 'firm', 'firm name', 'name'],
    wi:               ['with intelligence', 'wi', 'with intelligence link', 'with intelligence profile', 'wi profile', 'wi link'],
    intention:        ['intention case', 'intention', 'intentions', 'intention note', 'intention summary'],
    tech:             ['tech', 'technology', 'technology investor', 'tech investor', 'tech focus'],
    emerging:         ['emerging managers', 'emerging manager', 'emerging', 'open to emerging managers'],
    contacts:         ['contacts', 'contact', 'contact persons', 'contact person', 'wi contacts'],
    iconn:            ['iconnections', 'i connections', 'iconnections link', 'iconnections profile'],
    iconn_contacts:   ['iconnections contacts', 'i connections contacts'],
    iconn_notes:      ['iconnections notes', 'i connections notes', 'notes'],
    fit_status:       ['fit status', 'fit', 'fit score', 'tier'],
    preqin:           ['iconnections preqin link', 'preqin', 'preqin link', 'iconnections preqin', 'i connections preqin link'],
    iconn_bot:        ['i connections bot data', 'iconnections bot data', 'bot data', 'iconnections data']
  };
  function mapHeaders(header) {
    const n = header.map(norm), out = {}, used = new Set();
    for (const [field, names] of Object.entries(FIELDS)) {
      for (const want of names) {
        const i = n.findIndex((h, k) => h === want && !used.has(k));
        if (i >= 0) { out[field] = i; used.add(i); break; }
      }
    }
    return out;
  }
  const URL_RE = /\bhttps?:\/\/[^\s<>"')\]]+/i;
  // "• Name — Title  ·  email  ·  LinkedIn: url  ·  iConnections: url  ·  12345" -> {name, title, email, linkedin, iconnections, phone, id, extra}
  function parseContacts(text) {
    if (!text) return [];
    const out = [];
    for (let line of String(text).split(/\r?\n/)) {
      line = line.replace(/^\s*[•\-*·]\s*/, '').trim();
      if (!line) continue;
      if (/^no contacts? (listed|named)/i.test(line)) continue;
      const parts = line.split(/\s+·\s+/);
      const head = parts.shift();
      const dash = head.split(/\s+[—–-]\s+/);
      const c = { name: dash[0].trim() };
      if (dash.length > 1) c.title = dash.slice(1).join(' — ').trim();
      for (const raw of parts) {
        const p = raw.trim();
        let m;
        if ((m = /^linkedin:\s*(\S+)/i.exec(p))) c.linkedin = m[1];
        else if ((m = /^iconnections:\s*(\S+)/i.exec(p))) c.iconnections = m[1];
        else if (/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(p)) c.email = p;
        else if (/^\d{4,12}$/.test(p)) c.id = p;
        else if (/^(?:tel:|phone:)?\s*\+?[\d ()./-]{7,}$/i.test(p)) c.phone = p.replace(/^(tel:|phone:)\s*/i, '');
        else if (URL_RE.test(p)) c.links = (c.links || []).concat(p);
        else c.extra = (c.extra ? c.extra + ' · ' : '') + p;
      }
      out.push(c);
    }
    return out;
  }
  const yesNo = (v) => {
    const s = String(v ?? '').trim().toLowerCase();
    return s === 'yes' || s === 'y' || s === 'true' ? 'Yes' : s === 'no' || s === 'n' || s === 'false' ? 'No' : s ? 'Not stated' : 'Not stated';
  };
  const nameKey = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
  // The tier (26 Nov 2026, user's order): 1 Strong, 2 Tech, 3 Emerging managers, 4 Opportunities (everything else,
  // "Not stated" included). Strong = the file's Fit Status "Strong", or the sheet's own rule (Tech Yes, Emerging Yes,
  // on iConnections) when the cell is empty.
  function tierOf(r) {
    const fit = String(r.fit_status || '').trim().toLowerCase();
    if (fit === 'strong' || (r.tech === 'Yes' && r.emerging === 'Yes' && r.iconn_url)) return 1;
    if (r.tech === 'Yes') return 2;
    if (r.emerging === 'Yes') return 3;
    return 4;
  }
  const TIER_LABEL = { 1: 'Strong', 2: 'Tech', 3: 'Emerging Managers', 4: 'Opportunities' };

  // Workbook bytes -> { sheet, columns, rows: [normalised allocator], duplicates, problems }.
  function readEnriched(input) {
    const sheets = readSheets(input);
    const pick = sheets.find(s => /^enrich(ed)?$/i.test(s.name.trim())) || sheets.find(s => /enrich/i.test(s.name));
    if (!pick) throw new Error('No "Enriched" (or "Enrich") tab in this file. Tabs: ' + sheets.map(s => s.name).join(', '));
    const { rows, links } = pick.read();
    let hi = rows.findIndex(r => r && r.some(c => norm(c) === 'allocator' || norm(c) === 'investor name'));
    if (hi < 0) hi = 0;
    const header = rows[hi] || [];
    const col = mapHeaders(header);
    if (col.name === undefined) throw new Error('The "' + pick.name + '" tab has no Allocator column.');
    const cell = (r, f) => (col[f] === undefined ? null : rows[r][col[f]]);
    const link = (r, f) => {
      if (col[f] === undefined) return null;
      const l = links[r + ',' + col[f]];
      if (l) return l;
      const v = rows[r][col[f]]; const m = v ? URL_RE.exec(String(v)) : null;
      return m ? m[0] : null;
    };
    const txt = (v) => (v === null || v === undefined ? null : (String(v).trim() === '' ? null : String(v)));
    const out = [], seen = new Map(), duplicates = [], problems = [];
    for (let r = hi + 1; r < rows.length; r++) {
      const name = txt(cell(r, 'name'));
      if (!name) { if (rows[r].some(v => v !== null && v !== undefined && v !== '')) problems.push({ row: r + 1, reason: 'No allocator name: not sent.' }); continue; }
      const wiUrl = link(r, 'wi');
      const wiId = wiUrl && /investors\/(-?\d+)/.exec(wiUrl) ? /investors\/(-?\d+)/.exec(wiUrl)[1] : null;
      const rec = {
        name: name.trim(), name_key: nameKey(name), source_row: r + 1,
        wi_url: wiUrl, wi_id: wiId,
        intention: txt(cell(r, 'intention')),
        tech: yesNo(cell(r, 'tech')), emerging: yesNo(cell(r, 'emerging')),
        contacts_raw: txt(cell(r, 'contacts')), contacts: parseContacts(cell(r, 'contacts')),
        iconn_url: link(r, 'iconn'),
        iconn_contacts_raw: txt(cell(r, 'iconn_contacts')), iconn_contacts: parseContacts(cell(r, 'iconn_contacts')),
        iconn_notes: txt(cell(r, 'iconn_notes')),
        fit_status: txt(cell(r, 'fit_status')) ? String(cell(r, 'fit_status')).trim() : null,
        preqin_url: link(r, 'preqin'),
        iconn_bot_data: txt(cell(r, 'iconn_bot'))
      };
      rec.tier = tierOf(rec); rec.tier_label = TIER_LABEL[rec.tier];
      // De-duplicate by investor name (and With Intelligence id): later rows fill only what the first left blank.
      const key = rec.name_key, wkey = wiId ? 'wi:' + wiId : null;
      const prev = seen.get(key) || (wkey && seen.get(wkey));
      if (prev) {
        duplicates.push({ row: r + 1, name: rec.name, first_row: prev.source_row });
        for (const [k, v] of Object.entries(rec)) if ((prev[k] === null || prev[k] === undefined || (Array.isArray(prev[k]) && !prev[k].length)) && v !== null) prev[k] = v;
        prev.tier = tierOf(prev); prev.tier_label = TIER_LABEL[prev.tier];
        continue;
      }
      seen.set(key, rec); if (wkey) seen.set(wkey, rec);
      out.push(rec);
    }
    const columns = Object.fromEntries(Object.entries(col).map(([f, i]) => [f, header[i]]));
    const unmapped = header.filter((h, i) => h !== null && h !== undefined && h !== '' && !Object.values(col).includes(i));
    return { sheet: pick.name, columns, unmapped, rows: out, duplicates, problems };
  }

  const api = { readEnriched, readSheets, parseContacts, tierOf, TIER_LABEL, inflateRaw, unzip, mapHeaders };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.EnrichedReader = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null));
