const ai = $json.output || {};
const det = $('Deterministic Extraction').item.json;

// ---------- READING THE ANSWER BACK ----------
// Every optional field now comes back as text, because n8n builds the output
// schema from the example and types a field whose example is null as
// null-only - so any real value fails validation and the whole extraction is
// thrown away. That fault silently discarded most report signals in HFN 02
// before it was found; here it would have lost the first mandate that stated
// a ticket range or an AuM, which are the mandates worth having.
const numOf = (v) => {
  const s = String(v == null ? '' : v).replace(/[^0-9.]/g, '');
  if (!s) return null;
  const n = Number(s);
  return isFinite(n) && n > 0 ? n : null;
};
const yesNo = (v) => {
  const s = String(v == null ? '' : v).trim().toLowerCase();
  if (s === 'yes' || s === 'true')  return true;
  if (s === 'no'  || s === 'false') return false;
  return null;
};
const textOf = (v) => {
  const s = String(v == null ? '' : v).trim();
  return (!s || /^(unknown|not stated|n\/a|none)$/i.test(s)) ? null : s;
};

const geoMap = { "uk":"GB","united kingdom":"GB","britain":"GB","england":"GB","scotland":"GB",
  "us":"US","usa":"US","united states":"US","switzerland":"CH","swiss":"CH",
  "india":"IN","china":"CN","japan":"JP","germany":"DE","france":"FR","singapore":"SG",
  "australia":"AU","canada":"CA","hong kong":"HK","netherlands":"NL","sweden":"SE",
  "norway":"NO","denmark":"DK","ireland":"IE","italy":"IT","spain":"ES","luxembourg":"LU",
  "saudi arabia":"SA","uae":"AE","united arab emirates":"AE","israel":"IL","costa rica":"CR" };
const countryRaw = textOf(ai.investor_country);
const normC = (c) => c ? (geoMap[c.toLowerCase().trim()] || c.toUpperCase().substring(0,2)) : null;

const stratMap = { "equity long/short":"equity_long_short","equity l/s":"equity_long_short","equity hedge":"equity_long_short",
  "long/short equity":"equity_long_short","managed futures":"cta","global macro":"macro",
  "discretionary macro":"macro","systematic macro":"macro" };
const normS = (s) => stratMap[s.toLowerCase().trim()] || s.toLowerCase().trim().replace(/\s+/g,"_");

let strats = (Array.isArray(ai.strategies) ? ai.strategies : []).filter(Boolean).map(normS);
if (det.det_strategy) {
  for (const s of det.det_strategy.split(/[,+]/).map(x => normS(x)).filter(Boolean)) {
    if (strats.indexOf(s) === -1) strats.push(s);
  }
}
let assets = (Array.isArray(ai.asset_classes) ? ai.asset_classes : []).filter(Boolean);
if (assets.length === 0 && det.det_asset_class) assets = [det.det_asset_class];

// ---------- WHICH FIRM IS THE INVESTOR? ----------
const STOP = /^(the|a|an|of|and|for|inc|llc|ltd|lp|plc|group|capital|partners|advisors|advisers|management|associates|holdings|company|co|corp|corporation|fund|funds|asset|assets|investment|investments|system|systems)$/i;
const tokensOf = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ')
  .split(/\s+/).filter(t => t.length > 2 && !STOP.test(t));

const isAbbrevOf = (shortName, longName) => {
  const s = String(shortName || '').replace(/[^A-Za-z]/g, '').toUpperCase();
  const words = String(longName || '').replace(/[^A-Za-z\s]/g, ' ').split(/\s+/).filter(Boolean);
  if (s.length < 3 || s.length > 12 || words.length < 2) return false;
  let i = 0;
  for (const w of words) {
    if (i >= s.length) break;
    const W = w.toUpperCase();
    let k = 0;
    while (k < W.length && i < s.length && s[i] === W[k]) { i++; k++; }
  }
  return i === s.length;
};

const sameEntity = (a, b) => {
  const A = tokensOf(a), B = tokensOf(b);
  if (!A.length || !B.length) return true;
  if (A.some(t => B.indexOf(t) !== -1)) return true;
  return isAbbrevOf(a, b) || isAbbrevOf(b, a);
};

const RAISES_CAPITAL = /(^|\b)(bridgewater|citadel|millennium management|point ?72|two sigma|renaissance technologies|d\.? ?e\.? shaw|aqr capital|man group|brevan howard|elliott management|baupost|pershing square|third point|tiger global|coatue|marshall wace|capula|winton|bluecrest|balyasny|exodus ?point|schonfeld|\bkkr\b|blackstone|apollo global|carlyle|\btpg\b|ares management|plettenberg|hippocampus)(\b|$)/i;

const ALIAS = {
  'texas teachers': 'Teacher Retirement System of Texas',
  'trs': 'Teacher Retirement System of Texas',
  'texas trs': 'Teacher Retirement System of Texas',
  'calpers': 'California Public Employees Retirement System',
  'calstrs': 'California State Teachers Retirement System',
  'gic': 'GIC Private Limited',
  'adia': 'Abu Dhabi Investment Authority',
  'cppib': 'Canada Pension Plan Investment Board',
  'cpp investments': 'Canada Pension Plan Investment Board',
  'nbim': 'Norges Bank Investment Management',
  'apg': 'APG Asset Management',
  'pggm': 'PGGM Investments',
  'ontario teachers': 'Ontario Teachers Pension Plan',
  'omers': 'Ontario Municipal Employees Retirement System',
  'wellcome': 'Wellcome Trust',
  'ge pension': 'General Electric Pension Trust',
  'nystrs': 'New York State Teachers Retirement System',
  'nycers': 'New York City Employees Retirement System',
  'fsba': 'Florida State Board of Administration',
  'lacera': 'Los Angeles County Employees Retirement Association',
  'oakland police & fire': 'Oakland Police and Fire Retirement System',
  'oakland police and fire': 'Oakland Police and Fire Retirement System',
  'san antonio fire & police': 'San Antonio Fire & Police Pension Fund',
  'virginia rs': 'Virginia Retirement System',
  'holyoke': 'Holyoke Retirement System',
  'san bernardino': 'San Bernardino County Employees Retirement Association',
  'fnbo': 'First National Bank of Omaha'
};
const expand = (n) => {
  const k = String(n || '').toLowerCase().trim().replace(/[.,]/g, '');
  return ALIAS[k] || n;
};

const fuller = (a, b) => {
  const x = String(a || '').trim(), y = String(b || '').trim();
  if (!x) return y;
  if (!y) return x;
  return y.length > x.length ? y : x;
};

const aiName   = String(ai.investor_name || '').trim();
const headName = String(det.det_investor_from_headline || '').trim();
const aiOrg    = String(ai.organization_name || '').trim();

let investor = headName || aiName;
let otherFirm = null;
if (aiName && headName && !sameEntity(aiName, headName)) {
  otherFirm = aiName;               // the model named the manager, not the investor
} else if (aiName && headName) {
  investor = fuller(aiName, headName);
}

// The whole headline is NOT a fallback name. A block that yields no name has
// no investor in it, and saying so is the honest outcome.

let org = investor;
if (aiOrg) {
  if (sameEntity(investor, aiOrg)) org = fuller(investor, aiOrg);
  else if (!otherFirm) otherFirm = aiOrg;
}

let swapped = null;
if (investor && RAISES_CAPITAL.test(investor)) {
  const alternatives = [aiOrg, aiName, headName, otherFirm]
    .map(x => String(x || '').trim())
    .filter(x => x && !RAISES_CAPITAL.test(x) && !sameEntity(x, investor));
  if (alternatives.length) {
    swapped = investor;
    investor = alternatives[0];
    org = investor;
    otherFirm = swapped;
  }
}

investor = expand(investor);
org = expand(org);

const ev = Object.assign({}, ai.evidence || {});
if (otherFirm) ev.other_firm_named = otherFirm;
if (swapped) ev.swapped_manager_for_investor = swapped;

const r = {
  investor_name: investor,
  organization_name: org,
  contact_name: textOf(ai.contact_name),
  investor_country: normC(countryRaw),
  investor_city: textOf(ai.investor_city),
  investor_type: textOf(ai.investor_type),
  investor_tag: det.det_category || null,
  item_type: det.det_item_type || 'unknown',
  asset_classes: JSON.stringify(assets),
  strategies: JSON.stringify(strats),
  ticket_min_usd: numOf(ai.ticket_min_usd),
  ticket_max_usd: numOf(ai.ticket_max_usd),
  aum_usd: numOf(ai.aum_usd),
  aum_band: textOf(ai.aum_band),
  open_to_emerging_managers: yesNo(ai.open_to_emerging_managers),
  open_to_new_relationships: yesNo(ai.open_to_new_relationships),
  open_to_emerging_markets: yesNo(ai.open_to_emerging_markets),
  alert_type: "Intention", alert_date: det.det_alert_date,
  allocation_timing: textOf(ai.allocation_timing),
  intention_summary: textOf(ai.intention_summary) || det.det_headline || null,
  requirements_raw: textOf(ai.requirements_raw),
  appetite_raw: textOf(ai.appetite_raw),
  evidence: JSON.stringify(ev),
  view_article_url: det.det_view_article_url || null,
  view_intention_url: det.det_view_intention_url || null,
  view_investor_url: det.det_view_investor_url || null,
  source_links: det.det_source_links || '[]',
  linkedin_url: textOf(ai.linkedin_url) || det.det_linkedin_url || null,
  source_message_id: det.source_message_id || '',
  raw_email_id: det.raw_email_id,
  block_index: det.block_index,
  source_email_date: det.source_email_date
};

// ---------- IS THIS A NAME AT ALL? ----------
const nm = String(r.investor_name || '').trim();
const FAKE = /^(john|jane|joe)\s+doe$|^doe\s+(capital|ventures|investments|partners)$|^(acme|example|sample|test|placeholder|unknown investor|n\/a)$/i;
const GARBAGE = /[<>{}]|\.(png|jpg|gif|css)|^https?:/i;

// Page furniture: link labels and template notices, not organisations. Also
// the bare category words - "Investor", "Expected", "Expects" - which are what
// a headline fragment looks like once it has been cut to one word.
const FURNITURE = /^(log ?in|sign ?in|register|subscribe|read more|view profile|view investor|view article|click here|learn more|unsubscribe|manage preferences|contact us|planning|home|search|investor|investors|expected|expects|expecting|mandate|mandates|new \w+ profile has been added)$/i;

// A firm name does not contain a finite verb; a fragment cut out of a headline
// almost always does. "plans" and "fire" are deliberately absent - allocator
// names are full of them, and a rule that deletes a pension fund to catch a
// headline is a bad trade.
const IS_A_SENTENCE = /\b(has|have|had|will|is|are|was|were|been|makes|made|preps|poaches|debuts|returned|entered|receives?|received|adds?|added|seeks?|hits?|touts?|launch(es|ed)|says?|reports?|joins?|leaves?|exits?)\b/i;

const TAIL = /^[^A-Za-z0-9]/;

if (!nm || FAKE.test(nm) || GARBAGE.test(nm) || FURNITURE.test(nm)
    || TAIL.test(nm) || IS_A_SENTENCE.test(nm) || nm.length > 70) {
  return { json: { ...r, investor_name: null,
    parse_drift: 'no_usable_investor_name: ' + (nm ? nm.slice(0, 60) : 'nothing was read') } };
}

const k = [r.investor_name, r.alert_date || '', String(r.block_index), r.source_message_id].join('|');
let h = 0x811c9dc5;
for (let i = 0; i < k.length; i++) { h ^= k.charCodeAt(i); h = Math.imul(h, 0x01000193); }
r.record_key = (h >>> 0).toString(16).padStart(8, '0');
return { json: r };