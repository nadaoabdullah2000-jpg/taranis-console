// "Grok Ingest -> Web App" / Normalize Rows (Code node, run once for all items), 25 Nov 2026.
// Turns the uploaded rows (from the .xlsx via Extract From File, or the JSON array) into the shape
// grok_fn.ingest reads. Header names, AUM text, websites and countries are read with the same rules as
// the console's iConnections reader (iconnections.js: normHeader, parseAum, parseDomain, parseCountry);
// tests/grok-ingest.test.mjs checks they agree. Nothing is guessed: a value that cannot be read is left
// blank and listed in `problems` (e.g. an AUM of 250 with no unit: millions or dollars?).
const req = $('Parse Request').first().json;
const input = req.has_file ? $input.all().map(i => i.json) : (req.rows || []);

function normHeader(h) {
  return String(h === null || h === undefined ? '' : h).toLowerCase()
    .replace(/[_\-./:]+/g, ' ').replace(/[^\p{L}\p{N}$()% ]+/gu, ' ').replace(/\s+/g, ' ').trim();
}
const UNIT = { k: 1e3, thousand: 1e3, m: 1e6, mm: 1e6, mn: 1e6, million: 1e6, millions: 1e6,
               b: 1e9, bn: 1e9, billion: 1e9, billions: 1e9, tn: 1e12, trillion: 1e12 };
const NUM = '([0-9][0-9,]*(?:\\.[0-9]+)?)';
const UNITS = '(k|thousand|m|mm|mn|million|millions|b|bn|billion|billions|tn|trillion)';
const CUR = '(?:usd|us\\$|\\$)?\\s*\\$?\\s*';
const RE_RANGE = new RegExp('^' + CUR + NUM + '\\s*' + UNITS + '?\\s*(?:-|to)\\s*' + CUR + NUM + '\\s*' + UNITS + '$');
const RE_OVER = new RegExp('^(?:>=?|over|above|more than|greater than|at least|in excess of)\\s*' + CUR + NUM + '\\s*' + UNITS + '$');
const RE_UNDER = new RegExp('^(?:<=?|under|below|less than|up to)\\s*' + CUR + NUM + '\\s*' + UNITS + '$');
const RE_POINT = new RegExp('^(?:(?:circa|approx|approximately|around|about|c|~)\\.?\\s*)?' + CUR + NUM + '\\s*' + UNITS + '$');
const RE_PLAIN = /^(?:usd|us\$|\$)?\s*\$?\s*([0-9][0-9,]*(?:\.[0-9]+)?)$/;
function headerUnit(header) {
  const h = String(header || '').toLowerCase();
  if (/\((?:usd|\$|us\$)?\s*(?:bn|b|billions?)\)|in billions|\$\s?bn\b|usd ?bn\b/.test(h)) return 1e9;
  if (/\((?:usd|\$|us\$)?\s*(?:m|mm|mn|millions?)\)|in millions|\$\s?mm?\b|usd ?mm?\b/.test(h)) return 1e6;
  if (/\((?:usd|\$|us\$)?\s*(?:k|thousands?)\)|in thousands|\$\s?k\b/.test(h)) return 1e3;
  return 1;
}
const num = (s) => Number(String(s).replace(/,/g, ''));
function parseAum(value, header) {
  if (value === null || value === undefined || value === '') return { low: null, high: null, ok: true };
  const mult = headerUnit(header);
  if (typeof value === 'number') return isFinite(value) && value >= 0 ? { low: value * mult, high: value * mult, ok: true } : { low: null, high: null, ok: false };
  if (typeof value === 'boolean') return { low: null, high: null, ok: false };
  const s = String(value).toLowerCase().trim().replace(/[–—]/g, '-').replace(/\s+/g, ' ');
  if (!s || s === '-' || s === 'n/a' || s === 'na' || s === 'undisclosed' || s === 'not disclosed') return { low: null, high: null, ok: true };
  let m;
  if ((m = RE_PLAIN.exec(s))) { const v = num(m[1]) * mult; return { low: v, high: v, ok: isFinite(v) }; }
  if (/%/.test(s)) return { low: null, high: null, ok: false };
  if ((m = RE_RANGE.exec(s))) {
    const b = num(m[3]) * UNIT[m[4]];
    let a = num(m[1]) * UNIT[m[2] || m[4]];
    if (!m[2] && a > b) { a = a / 1000; if (a > b) return { low: null, high: null, ok: false }; }
    return { low: Math.min(a, b), high: Math.max(a, b), ok: true };
  }
  if ((m = RE_OVER.exec(s))) return { low: num(m[1]) * UNIT[m[2]], high: null, ok: true };
  if ((m = RE_UNDER.exec(s))) return { low: 0, high: num(m[1]) * UNIT[m[2]], ok: true };
  if ((m = RE_POINT.exec(s))) { const v = num(m[1]) * UNIT[m[2]]; return { low: v, high: v, ok: true }; }
  return { low: null, high: null, ok: false };
}
// Free mail and social domains never identify a firm (they would merge unrelated firms on dedupe).
const NOT_A_FIRM = /^(gmail|googlemail|yahoo|ymail|hotmail|outlook|live|msn|aol|icloud|me|mac|proton|protonmail|gmx|mail|qq|163|126|linkedin|facebook|twitter|x|instagram|bloomberg)\.[a-z.]+$/;
function parseDomain(value) {
  if (value === null || value === undefined) return null;
  let s = String(value).trim().toLowerCase();
  if (!s) return null;
  if (s.includes('@')) s = s.split('@').pop();
  s = s.replace(/^[a-z]+:\/\//, '').replace(/^www\d?\./, '').split(/[/?#:\s]/)[0].replace(/\.$/, '');
  return /^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(s) && !NOT_A_FIRM.test(s) ? s : null;
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
const NOT_COUNTRY = new Set(['UK', 'EU', 'EZ', 'UN', 'QO', 'XA', 'XB', 'ZZ']);
function countryNames() {
  if (COUNTRY_NAMES) return COUNTRY_NAMES;
  COUNTRY_NAMES = {};
  COUNTRY_CODES = new Set(Object.values(COUNTRY_SYNONYMS).concat(Object.values(ISO3)));
  try {
    const dn = new Intl.DisplayNames(['en'], { type: 'region' });
    for (let a = 65; a <= 90; a++) for (let b = 65; b <= 90; b++) {
      const code = String.fromCharCode(a, b);
      const label = dn.of(code);
      // Intl also names pseudo-regions (UK, EU, UN...): never let them replace the real code (United Kingdom = GB).
      if (label && label !== code && !NOT_COUNTRY.has(code)) { const k = normHeader(label).replace(/[()$%]/g, '').trim(); COUNTRY_NAMES[k] = code; COUNTRY_CODES.add(code); }
    }
  } catch (_) { /* synonyms still work */ }
  return COUNTRY_NAMES;
}
const US_STATES = new Set(('AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT '
  + 'NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC').split(' '));
function parseCountry(value) {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const parts = raw.split(/[,;|/]/).map(s => s.trim()).filter(Boolean);
  const tail = parts.length > 1 ? parts[parts.length - 1] : '';
  if (/^[A-Za-z]{2}$/.test(tail) && US_STATES.has(tail.toUpperCase())) { countryNames(); return COUNTRY_CODES.has(tail.toUpperCase()) ? null : 'US'; }
  for (const part of [raw, parts[parts.length - 1], parts[0]]) {
    if (!part) continue;
    if (/^[A-Za-z]{2}$/.test(part)) { const up = part.toUpperCase(); if (up === 'UK') return 'GB'; countryNames(); if (COUNTRY_CODES.has(up)) return up; }
    if (/^[A-Za-z]{3}$/.test(part) && ISO3[part.toUpperCase()]) return ISO3[part.toUpperCase()];
    const k = normHeader(part).replace(/[()$%]/g, '').replace(/\s+/g, ' ').trim();
    if (COUNTRY_SYNONYMS[k]) return COUNTRY_SYNONYMS[k];
    const names = countryNames();
    if (names[k]) return names[k];
  }
  return null;
}

// Header -> field. Whole normalised header first (best first), then patterns. Canonical JSON keys map to themselves.
const FIELDS = [
  ['name', ['name', 'firm name', 'firm', 'allocator name', 'allocator', 'organization name', 'organisation name', 'organization', 'organisation',
            'company name', 'company', 'investor name', 'investor', 'institution name', 'institution', 'account name', 'entity name', 'lp name',
            'limited partner', 'fund investor'], [/^(firm|allocator|organi[sz]ation|company|investor|institution|entity|account) name\b/]],
  ['domain', ['domain', 'website', 'web site', 'firm website', 'company website', 'website url', 'url', 'web', 'homepage', 'home page', 'site'], [/\bwebsite\b/, /\bdomain\b/]],
  ['aum', ['aum', 'aum usd', 'aum (usd)', 'aum ($)', 'total aum', 'firm aum', 'aum range', 'aum band', 'aum text', 'assets under management',
           'total assets', 'aum ($m)', 'aum ($mm)', 'aum (usd m)', 'aum (usd mm)', 'aum (usd mn)', 'aum (usd bn)', 'aum ($bn)', 'aum usd', 'aum_usd'],
          [/\baum\b/, /assets under management/]],
  ['investor_type', ['investor type', 'investor_type', 'allocator type', 'firm type', 'organization type', 'institution type', 'lp type', 'type',
                     'investor category', 'category'], [/\b(investor|allocator|firm|organi[sz]ation|institution|lp|entity) type\b/]],
  ['country', ['country', 'hq country', 'headquarters country', 'firm country', 'country of domicile', 'domicile', 'location country',
               'country region', 'investor country'], [/\bcountry\b/, /\bdomicile\b/]],
  ['city', ['city', 'hq city', 'headquarters city', 'investor city', 'town'], [/\bcity\b/]],
  ['strategies', ['strategies', 'strategy', 'strategy preferences', 'hedge fund strategies', 'strategies sought', 'preferred strategies'], [/\bstrateg/]],
  ['asset_classes', ['asset classes', 'asset class', 'asset_classes', 'asset class preferences', 'assets classes'], [/\basset class/]],
  ['ticket_min_usd', ['ticket min usd', 'ticket_min_usd', 'min ticket', 'minimum ticket', 'ticket min', 'min investment', 'minimum investment',
                      'min allocation', 'min commitment'], [/\bmin(imum)? (ticket|investment|allocation|commitment)/]],
  ['ticket_max_usd', ['ticket max usd', 'ticket_max_usd', 'max ticket', 'maximum ticket', 'ticket max', 'max investment', 'maximum investment',
                      'max allocation', 'max commitment'], [/\bmax(imum)? (ticket|investment|allocation|commitment)/]],
  ['min_manager_aum_usd', ['min manager aum usd', 'min_manager_aum_usd', 'min manager aum', 'minimum manager aum', 'minimum fund size', 'min fund size'], [/\bmin(imum)? (manager aum|fund size)/]],
  ['open_to_emerging_managers', ['open to emerging managers', 'open_to_emerging_managers', 'emerging managers', 'emerging manager'], []],
  ['emerging_evidence', ['emerging evidence', 'emerging_evidence'], []],
  ['tech_focus', ['tech focus', 'tech_focus', 'technology focus'], []],
  ['tech_evidence', ['tech evidence', 'tech_evidence', 'technology evidence'], []],
  ['summary', ['summary', 'description', 'profile', 'investor profile', 'about', 'overview', 'background'], []],
  ['wi_id', ['wi id', 'wi_id', 'with intelligence id', 'withintelligence id'], []],
  ['wi_url', ['wi url', 'wi_url', 'with intelligence url', 'with intelligence profile', 'with intelligence link', 'wi profile', 'wi link', 'profile url', 'profile_url', 'profile link'], [/withintelligence\.com/, /^(with intelligence|wi) (profile|link|url)/]],
  ['preqin_id', ['preqin id', 'preqin_id', 'firm id', 'preqin firm id'], []],
  ['people', ['people', 'contacts', 'contact', 'contact name', 'contact names', 'key contacts', 'contact person', 'full name', 'person'], [/\bcontacts?\b/]],
  ['contact_email', ['email', 'e mail', 'contact email', 'email address'], [/\be ?mail\b/]],
  ['contact_title', ['title', 'job title', 'position', 'role'], []],
  ['contact_linkedin', ['linkedin', 'linkedin url', 'contact linkedin'], [/linkedin/]],
  ['contact_phone', ['phone', 'telephone', 'phone number', 'contact phone'], [/\bphone\b/]]
];
function mapHeaders(keys) {
  const norm = keys.map(normHeader), used = new Set(), out = {};
  for (const [field, names, patterns] of FIELDS) {
    let pick = -1;
    for (const n of names) { pick = norm.findIndex((h, i) => h === normHeader(n) && !used.has(i)); if (pick >= 0) break; }
    if (pick < 0) for (const re of patterns) {
      pick = norm.findIndex((h, i) => h && re.test(h) && !used.has(i)
        && !(field === 'domain' && /linkedin|twitter|facebook|logo|email|e mail/.test(h))
        && !(field === 'people' && /email|e mail|phone|title|linkedin|url/.test(h)));
      if (pick >= 0) break;
    }
    if (pick >= 0) { out[field] = keys[pick]; used.add(pick); }
  }
  return out;
}

const list = (v) => {
  if (v === null || v === undefined || v === '') return [];
  if (Array.isArray(v)) return v.map(x => String(x).trim()).filter(Boolean);
  return String(v).split(/\s*(?:;|\||\n|,(?![^()]*\)))\s*/).map(s => s.trim()).filter(Boolean);
};
const money = (v, header, label, problems, name) => {
  if (v === null || v === undefined || v === '') return null;
  const a = parseAum(v, header);
  if (!a.ok || a.low === null || a.low !== a.high) { problems.push({ name, field: label, value: String(v), reason: 'Not one amount: left blank.' }); return null; }
  if (a.low > 0 && a.low < 100000) { problems.push({ name, field: label, value: String(v), reason: 'Under 100,000 with no unit (millions or dollars?): left blank.' }); return null; }
  return a.low;
};
const bool = (v) => {
  if (v === true || v === false) return v;
  const s = String(v ?? '').trim().toLowerCase();
  return ['yes', 'y', 'true', '1'].includes(s) ? true : ['no', 'n', 'false', '0'].includes(s) ? false : null;
};

function normalize(source, rows) {
  const problems = [];
  const keys = [...new Set(rows.flatMap(r => Object.keys(r || {})))];
  // Each row is read with its own headers (JSON rows may differ; Extract From File leaves out empty cells).
  const maps = new Map(), used = new Set();
  const mapOf = (r) => { const ks = Object.keys(r); const sig = ks.join('\u0001'); if (!maps.has(sig)) maps.set(sig, mapHeaders(ks)); return maps.get(sig); };
  let map = {};
  const get = (r, f) => (map[f] !== undefined ? r[map[f]] : undefined);
  const out = [];
  rows.forEach((r, i) => {
    if (!r || typeof r !== 'object') return;
    map = mapOf(r);
    Object.values(map).forEach(k => used.add(k));
    const name = String(get(r, 'name') ?? '').replace(/\s+/g, ' ').trim();
    if (!name) { if (Object.values(r).some(v => v !== null && v !== '')) problems.push({ row: i + 1, reason: 'No firm name: not sent.' }); return; }
    const aumRaw = get(r, 'aum');
    const aum = parseAum(aumRaw, map.aum);
    if (aumRaw !== undefined && aumRaw !== null && aumRaw !== '' && !aum.ok) problems.push({ name, field: 'aum', value: String(aumRaw), reason: 'AUM not read: kept as text only.' });
    let low = aum.ok ? aum.low : null, high = aum.ok ? aum.high : null;
    if (low !== null && low > 0 && low < 100000 && headerUnit(map.aum) === 1 && (typeof aumRaw === 'number' || RE_PLAIN.test(String(aumRaw).trim().toLowerCase()))) {
      problems.push({ name, field: 'aum', value: String(aumRaw), reason: 'Under 100,000 with no unit (millions or dollars?): left blank.' }); low = high = null;
    }
    const cRaw = get(r, 'country');
    const country = parseCountry(cRaw);
    if (cRaw && !country) problems.push({ name, field: 'country', value: String(cRaw), reason: 'Country not recognised: left blank.' });
    const people = list(get(r, 'people'));
    const emails = list(get(r, 'contact_email')).filter(e => /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(e));
    const contacts = people.map((p, j) => Object.fromEntries(Object.entries({ name: p, email: emails[j], title: list(get(r, 'contact_title'))[j],
      linkedin: list(get(r, 'contact_linkedin'))[j], phone: list(get(r, 'contact_phone'))[j] }).filter(([, v]) => v)));
    const wiUrl = get(r, 'wi_url') ? String(get(r, 'wi_url')).trim() : null;
    const wiId = get(r, 'wi_id') !== undefined && get(r, 'wi_id') !== null && String(get(r, 'wi_id')).trim()
      ? String(get(r, 'wi_id')).trim() : (wiUrl && /investors\/(-?\d+)/.exec(wiUrl) ? /investors\/(-?\d+)/.exec(wiUrl)[1] : null);
    const row = {
      name,
      domain: parseDomain(get(r, 'domain')) || null,
      aum_text: aumRaw === undefined || aumRaw === null || aumRaw === '' ? null : String(aumRaw).trim(),
      aum_low: low, aum_high: high,
      aum_usd: low !== null && low === high ? low : null,
      investor_type: get(r, 'investor_type') ? String(get(r, 'investor_type')).trim() : null,
      country, city: get(r, 'city') ? String(get(r, 'city')).trim() : null,
      strategies: list(get(r, 'strategies')), asset_classes: list(get(r, 'asset_classes')),
      ticket_min_usd: money(get(r, 'ticket_min_usd'), map.ticket_min_usd, 'ticket_min_usd', problems, name),
      ticket_max_usd: money(get(r, 'ticket_max_usd'), map.ticket_max_usd, 'ticket_max_usd', problems, name),
      min_manager_aum_usd: money(get(r, 'min_manager_aum_usd'), map.min_manager_aum_usd, 'min_manager_aum_usd', problems, name),
      open_to_emerging_managers: bool(get(r, 'open_to_emerging_managers')),
      emerging_evidence: get(r, 'emerging_evidence') ? String(get(r, 'emerging_evidence')).trim() : null,
      tech_focus: bool(get(r, 'tech_focus')),
      tech_evidence: get(r, 'tech_evidence') ? String(get(r, 'tech_evidence')).trim() : null,
      summary: get(r, 'summary') ? String(get(r, 'summary')).trim().slice(0, 4000) : null,
      wi_id: wiId && /^-?\d{1,12}$/.test(wiId) ? wiId : null,
      wi_url: wiUrl && /^https:\/\/platform\.withintelligence\.com\/(explore\/)?investors\/-?\d+\/?$/.test(wiUrl) ? wiUrl.replace(/\/$/, '') : null,
      preqin_id: get(r, 'preqin_id') ? String(get(r, 'preqin_id')).trim() : null,
      people, contacts_detail: contacts.length ? contacts : null,
      email_domains: [...new Set(emails.map(e => e.split('@').pop().toLowerCase()).filter(d => !NOT_A_FIRM.test(d)))],
      raw: r
    };
    if (row.ticket_min_usd !== null && row.ticket_max_usd !== null && row.ticket_min_usd > row.ticket_max_usd) {
      problems.push({ name, field: 'ticket', reason: 'Minimum ticket above maximum: both left blank.' }); row.ticket_min_usd = row.ticket_max_usd = null;
    }
    // Drop empty values so grok_fn.ingest only sees what the file says.
    for (const k of Object.keys(row)) if (row[k] === null || (Array.isArray(row[k]) && !row[k].length)) delete row[k];
    out.push(row);
  });
  const unmapped = keys.filter(k => !used.has(k));
  const columns = {};
  for (const m of maps.values()) for (const [f, k] of Object.entries(m)) (columns[f] = columns[f] || []).includes(k) || columns[f].push(k);
  for (const f of Object.keys(columns)) if (columns[f].length === 1) columns[f] = columns[f][0];
  return { rows: out, columns, unmapped, problems };
}

const n = normalize(req.source, input);
if (!n.rows.length) return [{ json: { route: 'error', code: 400, body: { status: 'error', reason: 'No rows with a firm name. Columns seen: ' + Object.keys(input[0] || {}).join(', '), problems: n.problems.slice(0, 50) } } }];
const file = { file_name: req.file_name || null, sheet_name: req.sheet_name || null, columns: n.columns };
// One database call; every value is a query parameter. plan_id '' = none (dry run).
return [{ json: { route: 'db', source: req.source, dry_run: req.dry_run, rows: n.rows.length,
  params: [req.source, JSON.stringify(n.rows), String(req.dry_run), req.by || 'Grok', JSON.stringify(file), req.plan_id || ''],
  columns: n.columns, unmapped: n.unmapped, problems: n.problems } }];
