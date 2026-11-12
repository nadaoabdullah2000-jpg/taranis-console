// WI 01c (OlWe4Wi6flt7bDtv), node "Backfill Enrich" — rebuilt 12 Nov 2026 (approved by research@taranis.net).
// Replaces the code that overwrote filled fields, wrote AUM in millions and logged nothing.
// Input: one item per row from "Load Rows" (rows with a View investor link and no wi_enriched_at:
// the alerts WI 01 stored without a profile read). Per row: resolve the With Intelligence id, read the
// profile, and emit ONE SQL statement that
//   - fills BLANK fields only (type, city, country, asset classes, tickets, AUM, AUM band; each column is
//     also guarded in SQL, so a value a person typed meanwhile is never replaced),
//   - writes money in dollars (With Intelligence gives millions: x 1,000,000),
//   - maps countries through the full ISO list (an unknown name stays blank, no first-two-letters guess),
//   - corrects a mis-parsed investor name to With Intelligence's name, keeping the old one in
//     evidence.name_from_alert (decided 12 Nov 2026),
//   - adds wi_summary / family names / wi_investor_id to evidence only when missing, sets the profile link,
//   - logs every value it writes in wi_fill_log (source 'WI 01c backfill (fixed)'),
//   - stamps wi_enriched_at, so a row is enriched once.
// A missing or expiring token stops the run before anything is written (rows stay for the next run).
const H = this.helpers;
const GQL_URL = 'https://platform-data.withintelligence.com/graphql';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36';
const SOURCE = 'WI 01c backfill (fixed), With Intelligence profile';

const authRow = ($('Load Token (backfill)').first() || { json: {} }).json || {};
const token = authRow.access_token || null;
const secondsLeft = (authRow.seconds_left === null || authRow.seconds_left === undefined) ? null : Number(authRow.seconds_left);
if (!token || (secondsLeft !== null && secondsLeft <= 300)) {
  throw new Error('With Intelligence token missing or expiring: nothing written. Refresh wi_auth_token; the rows wait for the next run.');
}

const CODE = {};
const NOT_ISO = new Set(['UK','FX','EU','EZ','UN','QO','XA','XB','AC','CP','CQ','DG','EA','IC','TA','SU','YU','CS','ZR','TP','BU','DY','HV','NH','RH','VD','YD','AN','ZZ']);
try {
  const dn = new Intl.DisplayNames(['en'], { type: 'region' });
  for (let a = 65; a <= 90; a++) for (let b = 65; b <= 90; b++) {
    const c = String.fromCharCode(a, b); if (NOT_ISO.has(c)) continue; let n = null;
    try { n = dn.of(c); } catch (e) { n = null; }
    if (n && n !== c) CODE[n.toLowerCase()] = c;
  }
} catch (e) {}
Object.assign(CODE, { 'usa': 'US', 'united states of america': 'US', 'uk': 'GB', 'england': 'GB', 'scotland': 'GB', 'wales': 'GB',
  'northern ireland': 'GB', 'korea, republic of': 'KR', 'republic of korea': 'KR', 'south korea': 'KR', 'taiwan': 'TW',
  'hong kong': 'HK', 'hong kong sar': 'HK', 'macau': 'MO', 'macao': 'MO', 'uae': 'AE', 'czech republic': 'CZ',
  'russian federation': 'RU', 'turkey': 'TR', 'ivory coast': 'CI', 'british virgin islands': 'VG', 'bvi': 'VG' });
const iso2 = (name) => { if (!name) return null; return CODE[String(name).toLowerCase().trim()] || null; };
const has = (v) => v !== null && v !== undefined && String(v).trim() !== '' && String(v).trim() !== '[]';
const M = (v) => { const n = Number(v); return isFinite(n) && n > 0 ? Math.round(n * 1e6) : null; };
const q = (s) => s === null || s === undefined ? 'NULL' : "'" + String(s).replace(/'/g, "''") + "'";

const QUERY = 'query SearchInvestor($id: String) { searchInvestor(id: $id) { id name summary type { id name } address { city country { name } } sfo { family_names { id name } } latest_aum { value_usd ranges_usd { label } } preferences { asset_class { id name } allocations { ticket_size { value_lower_usd value_upper_usd } } } } }';
const pull = (s) => {
  if (!s) return null;
  const str = String(s); const i = str.indexOf('investors/'); if (i === -1) return null;
  const rest = str.slice(i + 10); let j = 0, sign = '';
  if (rest.charAt(0) === '-') { sign = '-'; j = 1; }
  let d = ''; while (j < rest.length && rest.charAt(j) >= '0' && rest.charAt(j) <= '9') { d += rest.charAt(j); j++; }
  return d ? sign + d : null;
};
async function resolveId(trackerUrl) {
  let url = trackerUrl;
  for (let hop = 0; hop < 8; hop++) {
    const idU = pull(url); if (idU) return idU;
    let r;
    try { r = await H.httpRequest({ method: 'GET', url, returnFullResponse: true, ignoreHttpStatusErrors: true, maxRedirects: 0, timeout: 15000, headers: { 'user-agent': UA } }); }
    catch (e) { return null; }
    const loc = (r && r.headers) ? (r.headers.location || r.headers.Location) : null;
    if (loc) {
      const idL = pull(loc); if (idL) return idL;
      let next = String(loc);
      if (next.toLowerCase().indexOf('http') !== 0) { try { next = new URL(next, url).href; } catch (e) {} }
      url = next; continue;
    }
    const body = (r && typeof r.body === 'string') ? r.body : ((r && r.body) ? JSON.stringify(r.body) : '');
    return pull(body);
  }
  return null;
}
async function fetchInvestor(id) {
  const r = await H.httpRequest({ method: 'POST', url: GQL_URL, json: true, ignoreHttpStatusErrors: true,
    headers: { 'content-type': 'application/json', 'authorization': 'Bearer ' + token, 'website': 'with', 'user-website': 'with_sfo', 'origin': 'https://platform.withintelligence.com', 'referer': 'https://platform.withintelligence.com/', 'user-agent': UA },
    body: { operationName: 'SearchInvestor', variables: { id: String(id) }, query: QUERY } });
  const errs = ((r && r.errors) || []).map((e) => e && e.message).filter(Boolean).join('; ');
  if (errs && /expired|log ?in|unauth|forbidden|jwt|token/i.test(errs)) throw new Error('With Intelligence rejected the token: ' + errs.slice(0, 200));
  return (r && r.data && r.data.searchInvestor) ? r.data.searchInvestor : null;
}
const evOf = (v) => { try { const e = v ? (typeof v === 'string' ? JSON.parse(v) : v) : {}; return e && typeof e === 'object' && !Array.isArray(e) ? e : {}; } catch (e) { return {}; } };

// One statement per row: the UPDATE (each column guarded) and its log rows, together.
function statement(r, sets, logs, evAdd) {
  const id = Number(r.id), wi = evAdd.wi_investor_id || evOf(r.evidence).wi_investor_id || null;
  const parts = sets.map(([col, val, blankSql]) => col + ' = CASE WHEN ' + blankSql + ' THEN ' + val + ' ELSE ' + col + ' END');
  parts.push("evidence = coalesce(evidence, '{}'::jsonb) || " + q(JSON.stringify(evAdd)) + '::jsonb');
  parts.push('wi_enriched_at = now()');
  let sql = 'WITH up AS (UPDATE wi_mandates SET ' + parts.join(', ') + ' WHERE id = ' + id + ' AND wi_enriched_at IS NULL RETURNING id)';
  if (logs.length) {
    sql += ', lg AS (INSERT INTO wi_fill_log (mandate_id, investor_name, field, old_value, new_value, source, wi_investor_id) SELECT up.id, v.nm, v.f, v.o, v.n, '
      + q(SOURCE) + ', ' + q(wi) + ' FROM up, (VALUES ' + logs.map((l) => '(' + [q(l.nm), q(l.f), q(l.o), q(l.n)].join(', ') + ')').join(', ') + ') AS v(nm, f, o, n))';
  }
  return sql + ' SELECT count(*) AS updated FROM up;';
}

const out = [];
for (const it of $input.all()) {
  const r = it.json || {};
  if (r.id === null || r.id === undefined || r.id === '') continue;
  const name = String(r.investor_name || '').trim();
  try {
    const invId = await resolveId(r.view_investor_url);
    if (!invId) { out.push({ json: { id: r.id, _wi_reason: 'id_unresolved', _update_query: statement(r, [], [], { wi_enrich_note: 'Backfill 12 Nov 2026: the View investor link did not resolve to a profile.' }) } }); continue; }
    const inv = await fetchInvestor(invId);
    if (!inv) { out.push({ json: { id: r.id, _wi_reason: 'no_profile', _update_query: statement(r, [], [], { wi_investor_id: String(invId), wi_enrich_note: 'Backfill 12 Nov 2026: no With Intelligence profile for this id.' }) } }); continue; }

    const sets = [], logs = [];
    const fill = (col, cur, val, sqlVal, blankSql) => {
      if (has(cur) || val === null || val === undefined || val === '') return;
      sets.push([col, sqlVal, blankSql || (col + ' IS NULL')]);
      logs.push({ nm: name, f: col, o: null, n: String(val) });
    };
    fill('investor_type', r.investor_type, inv.type && inv.type.name, q(inv.type && inv.type.name));
    fill('investor_city', r.investor_city, inv.address && inv.address.city, q(inv.address && inv.address.city));
    const c = inv.address && inv.address.country ? iso2(inv.address.country.name) : null;
    fill('investor_country', r.investor_country, c, q(c));
    const acs = inv.preferences && Array.isArray(inv.preferences.asset_class) ? inv.preferences.asset_class.map((a) => a && a.name).filter(Boolean) : [];
    if (acs.length) fill('asset_classes', r.asset_classes, JSON.stringify(acs), q(JSON.stringify(acs)) + '::jsonb', "(asset_classes IS NULL OR asset_classes = '[]'::jsonb)");
    let lo = null, hi = null;
    for (const al of (inv.preferences && Array.isArray(inv.preferences.allocations) ? inv.preferences.allocations : [])) {
      const ts = al && al.ticket_size; if (!ts) continue;
      const l = M(ts.value_lower_usd), h = M(ts.value_upper_usd);
      if (l !== null) lo = lo === null ? l : Math.min(lo, l);
      if (h !== null) hi = hi === null ? h : Math.max(hi, h);
    }
    fill('ticket_min_usd', r.ticket_min_usd, lo, String(lo));
    fill('ticket_max_usd', r.ticket_max_usd, hi, String(hi));
    const aum = inv.latest_aum ? M(inv.latest_aum.value_usd) : null;
    fill('aum_usd', r.aum_usd, aum, String(aum));
    const band = inv.latest_aum && Array.isArray(inv.latest_aum.ranges_usd) && inv.latest_aum.ranges_usd[0] ? inv.latest_aum.ranges_usd[0].label : null;
    fill('aum_band', r.aum_band, band, q(band));

    const ev = evOf(r.evidence), evAdd = {};
    if (!has(ev.wi_investor_id)) evAdd.wi_investor_id = String(invId);
    if (!has(ev.wi_summary) && has(inv.summary)) { evAdd.wi_summary = String(inv.summary).trim(); logs.push({ nm: name, f: 'wi_summary', o: null, n: evAdd.wi_summary.slice(0, 200) }); }
    const fams = inv.sfo && Array.isArray(inv.sfo.family_names) ? inv.sfo.family_names.map((f) => f && f.name).filter(Boolean) : [];
    if (!has(ev.family_names) && fams.length) { evAdd.family_names = fams.join(', '); logs.push({ nm: name, f: 'family_names', o: null, n: evAdd.family_names }); }

    // The profile link replaces the tracking link (the same investor, a link that does not expire).
    const link = 'https://platform.withintelligence.com/explore/investors/' + invId;
    if (String(r.view_investor_url || '') !== link) { sets.push(['view_investor_url', q(link), 'true']); logs.push({ nm: name, f: 'view_investor_url', o: r.view_investor_url || null, n: link }); }

    // Name: With Intelligence's name corrects a mis-parsed alert name; the old one is kept and logged.
    if (has(inv.name) && String(inv.name).trim() !== name) {
      const newName = String(inv.name).trim();
      sets.push(['investor_name', q(newName), 'true']);
      if (name) evAdd.name_from_alert = name;
      logs.push({ nm: newName, f: 'investor_name', o: name || null, n: newName });
    }
    out.push({ json: { id: r.id, _wi_reason: 'ok', _wi_investor_id: invId, _filled: logs.map((l) => l.f), _update_query: statement(r, sets, logs, evAdd) } });
  } catch (e) {
    if (/rejected the token/.test(String(e && e.message))) throw e;   // stop the run; nothing more is written
    out.push({ json: { id: r.id, _wi_reason: 'error: ' + String((e && e.message) || e).slice(0, 200), _update_query: 'SELECT 0 AS updated;' } });
  }
}
return out;
