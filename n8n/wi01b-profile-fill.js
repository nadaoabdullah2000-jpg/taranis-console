// WI 01b (9Zqd98cdXXPqI0oO), node "Profile wins" — DRAFT 12 Nov 2026, not published.
// Changes from the published version (49e2bf27-3aaa-49d5-890d-17b9d0411a70):
//   1. Units: With Intelligence gives money in millions of USD. AUM and ticket sizes are now
//      always multiplied by 1,000,000 here (the band-guarded fix in "Units and profile link" only
//      covered bands of $100m and up, so "< $30m" and "$30m - $100m" profiles kept millions).
//   2. Countries: a full country-name -> ISO code map (the runtime's own region list plus a few
//      aliases). An unknown name leaves the country blank instead of taking its first two letters
//      (that fallback stored Austria as AU, Slovenia as SL, Monaco as MO, Chile as CH).
//   3. Fill blanks only: a value already on the mandate (from the alert) is kept; the profile only
//      fills what is missing. With Intelligence's own name, when it differs, is kept in
//      evidence.wi_profile_name instead of replacing investor_name.
// Unchanged: id resolution, throttle, token reminder, wi_summary (already fill-only), record_key.

const H = this.helpers;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- SETTINGS ----------
const THROTTLE_MS = 5000;        // wait between profile fetches
const REMIND_WINDOW_S = 900;     // remind when token has under 15 minutes left
const CHAT_ID = '848084617';
const GQL_URL = 'https://platform-data.withintelligence.com/graphql';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36';
const NL = String.fromCharCode(10);

const mandates = $('When Called by WI 01').all();
const auth = ($('Read Auth').first() || { json: {} }).json || {};
const token = auth.access_token || null;
const secondsLeft = (auth.seconds_left === null || auth.seconds_left === undefined) ? null : Number(auth.seconds_left);
const tokenStale = !token || (secondsLeft !== null && secondsLeft <= REMIND_WINDOW_S);

// Country names to ISO codes, built from the runtime's own region list; unknown -> null.
const CODE = {};
// Codes the runtime also names that are not the ISO 3166 code for that country (UK for GB, FX for
// France, CS/YU for Serbia, BU for Myanmar...), and non-countries (EU, UN...): never used.
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
const M = (v) => { const n = Number(v); return isFinite(n) && n > 0 ? Math.round(n * 1e6) : null; };   // millions -> dollars

const QUERY = 'query SearchInvestor($id: String) { searchInvestor(id: $id) { id name summary year_of_incorporation type { id name } address { city state { name } country { name } } sfo { family_names { id name } } latest_aum { value_usd value_min_usd value_max_usd ranges_usd { label } } preferences { asset_class { id name } allocations { ticket_size { value_lower_usd value_upper_usd } } } } }';

// Extract the WI investor id that follows 'investors/'. Ids are SIGNED (can be negative),
// so accept an optional leading '-' followed by digits. Returns the id as a string, or null.
const pull = (s) => {
  if (!s) return null;
  const str = String(s);
  const i = str.indexOf('investors/');
  if (i === -1) return null;
  const rest = str.slice(i + 10);
  let j = 0, sign = '';
  if (rest.charAt(0) === '-') { sign = '-'; j = 1; }
  let d = '';
  while (j < rest.length && rest.charAt(j) >= '0' && rest.charAt(j) <= '9') { d += rest.charAt(j); j++; }
  if (!d) return null;
  return sign + d;
};

// Walk the redirect chain one hop at a time, checking every URL, every Location
// header and every terminal body for /investors/<id>. Returns { id, ...debug }.
async function resolveId(trackerUrl) {
  let url = trackerUrl;
  let firstLoc = null;
  for (let hop = 0; hop < 8; hop++) {
    const idU = pull(url);
    if (idU) return { id: idU, hops: hop, via: 'url' };
    let r;
    try {
      r = await H.httpRequest({ method: 'GET', url, returnFullResponse: true, ignoreHttpStatusErrors: true, maxRedirects: 0, timeout: 15000, headers: { 'user-agent': UA } });
    } catch (e) {
      return { id: null, hops: hop, via: 'error', err: String((e && e.message) ? e.message : e).slice(0, 140), lastUrl: url, firstLoc: firstLoc };
    }
    const loc = (r && r.headers) ? (r.headers.location || r.headers.Location) : null;
    if (hop === 0) firstLoc = loc || null;
    if (loc) {
      const idL = pull(loc);
      if (idL) return { id: idL, hops: hop, via: 'location' };
      let next = String(loc);
      if (next.toLowerCase().indexOf('http') !== 0) { try { next = new URL(next, url).href; } catch (e) {} }
      url = next;
      continue;
    }
    const body = (r && typeof r.body === 'string') ? r.body : ((r && r.body) ? JSON.stringify(r.body) : '');
    const idB = pull(body);
    if (idB) return { id: idB, hops: hop, via: 'body' };
    return { id: null, hops: hop, via: 'terminal_no_id', status: (r && r.statusCode) || null, lastUrl: url, firstLoc: firstLoc };
  }
  return { id: null, hops: 8, via: 'max_hops', lastUrl: url, firstLoc: firstLoc };
}

async function fetchInvestor(id) {
  const r = await H.httpRequest({
    method: 'POST', url: GQL_URL, json: true, ignoreHttpStatusErrors: true,
    headers: { 'content-type':'application/json', 'authorization':'Bearer ' + token, 'website':'with', 'user-website':'with_sfo', 'origin':'https://platform.withintelligence.com', 'referer':'https://platform.withintelligence.com/', 'user-agent': UA },
    body: { operationName: 'SearchInvestor', variables: { id: String(id) }, query: QUERY }
  });
  return (r && r.data && r.data.searchInvestor) ? r.data.searchInvestor : null;
}

const recomputeKey = (m) => {
  const kk = [m.investor_name, m.alert_date || '', String(m.block_index), m.source_message_id || ''].join('|');
  let hh = 0x811c9dc5;
  for (let qi = 0; qi < kk.length; qi++) { hh ^= kk.charCodeAt(qi); hh = Math.imul(hh, 0x01000193); }
  return (hh >>> 0).toString(16).padStart(8, '0');
};
const evObj = (m) => {
  try { const ev = m.evidence ? (typeof m.evidence === 'string' ? JSON.parse(m.evidence) : m.evidence) : {};
        return ev && typeof ev === 'object' && !Array.isArray(ev) ? ev : null; } catch (e) { return null; }
};
const setEv = (m, ev) => { m.evidence = typeof m.evidence === 'object' && m.evidence !== null ? ev : JSON.stringify(ev); };

const out = [];
for (const it of mandates) {
  const m = Object.assign({}, it.json);
  try {
    if (tokenStale) { m._wi_enriched = false; m._wi_reason = token ? 'token_expiring' : 'no_token'; out.push({ json: m }); continue; }
    const tracker = m.view_investor_url;
    if (!tracker) { m._wi_enriched = false; m._wi_reason = 'no_investor_url'; out.push({ json: m }); continue; }
    await sleep(THROTTLE_MS);
    const res = await resolveId(tracker);
    m._wi_debug = res;
    const invId = res.id;
    if (!invId) { m._wi_enriched = false; m._wi_reason = 'id_unresolved'; out.push({ json: m }); continue; }
    m._wi_investor_id = invId;
    const inv = await fetchInvestor(invId);
    if (!inv) { m._wi_enriched = false; m._wi_reason = 'no_profile'; out.push({ json: m }); continue; }

    // ---- FILL BLANKS ONLY: a value the alert already gave is kept ----
    const filled = [];
    if (!has(m.investor_type) && inv.type && has(inv.type.name)) { m.investor_type = inv.type.name; filled.push('investor_type'); }
    if (!has(m.investor_city) && inv.address && has(inv.address.city)) { m.investor_city = inv.address.city; filled.push('investor_city'); }
    if (!has(m.investor_country) && inv.address && inv.address.country && iso2(inv.address.country.name)) {
      m.investor_country = iso2(inv.address.country.name); filled.push('investor_country');
    }
    if (!has(m.asset_classes) && inv.preferences && Array.isArray(inv.preferences.asset_class)) {
      const acs = inv.preferences.asset_class.map((a) => a && a.name).filter(Boolean);
      if (acs.length) { m.asset_classes = JSON.stringify(acs); filled.push('asset_classes'); }
    }
    if (inv.preferences && Array.isArray(inv.preferences.allocations)) {
      let lo = null, hi = null;
      for (const al of inv.preferences.allocations) {
        const ts = al && al.ticket_size;
        if (!ts) continue;
        const l = M(ts.value_lower_usd), h = M(ts.value_upper_usd);
        if (l !== null) lo = (lo === null ? l : Math.min(lo, l));
        if (h !== null) hi = (hi === null ? h : Math.max(hi, h));
      }
      if (!has(m.ticket_min_usd) && lo !== null) { m.ticket_min_usd = lo; filled.push('ticket_min_usd'); }
      if (!has(m.ticket_max_usd) && hi !== null) { m.ticket_max_usd = hi; filled.push('ticket_max_usd'); }
    }
    if (!has(m.aum_usd) && inv.latest_aum && M(inv.latest_aum.value_usd) !== null) { m.aum_usd = M(inv.latest_aum.value_usd); filled.push('aum_usd'); }
    if (!has(m.aum_band) && inv.latest_aum && Array.isArray(inv.latest_aum.ranges_usd) && inv.latest_aum.ranges_usd[0] && has(inv.latest_aum.ranges_usd[0].label)) {
      m.aum_band = inv.latest_aum.ranges_usd[0].label; filled.push('aum_band');
    }

    const ev = evObj(m);
    if (ev) {
      if (!has(ev.family_names) && inv.sfo && Array.isArray(inv.sfo.family_names) && inv.sfo.family_names.length) {
        const fams = inv.sfo.family_names.map((f) => f && f.name).filter(Boolean);
        if (fams.length) { ev.family_names = fams.join(', '); filled.push('family_names'); }
      }
      // WI's own profile summary, kept in evidence.wi_summary for the console. Fill only.
      if (!has(ev.wi_summary) && has(inv.summary)) { ev.wi_summary = String(inv.summary).trim(); filled.push('wi_summary'); }
      // WI's name, when it differs, is kept beside the alert's name rather than replacing it.
      if (has(inv.name) && String(inv.name).trim() !== String(m.investor_name || '').trim()) ev.wi_profile_name = String(inv.name).trim();
      setEv(m, ev);
    }
    if (!has(m.investor_name) && has(inv.name)) { m.investor_name = String(inv.name).trim(); filled.push('investor_name'); }
    if (!has(m.record_key) && has(m.investor_name)) { m.record_key = recomputeKey(m); m._wi_key_minted = true; }

    m._wi_filled = filled;
    m._wi_enriched = true; m._wi_reason = 'ok';
    out.push({ json: m });
  } catch (e) {
    m._wi_enriched = false; m._wi_reason = 'error: ' + ((e && e.message) ? e.message : String(e));
    out.push({ json: m });
  }
}

if (tokenStale && auth.bot_token) {
  const msg = token
    ? ['WI token expiring', 'Your With Intelligence enrichment token has under 15 minutes left. Profiles will stop enriching until you refresh it.', '1) DevTools > Network > any graphql request > copy the authorization Bearer value', '2) Run the UPDATE on wi_auth_token with the new token.'].join(NL)
    : ['WI token missing', 'No enrichment token is stored, so profiles were skipped. Mandates still went through on email data.', 'Paste a fresh token into wi_auth_token to enable enrichment.'].join(NL);
  try {
    await H.httpRequest({ method: 'POST', url: 'https://api.telegram.org/bot' + auth.bot_token + '/sendMessage', body: { chat_id: CHAT_ID, text: msg, disable_web_page_preview: true }, json: true, ignoreHttpStatusErrors: true });
  } catch (e) {}
}

return out;
