// WI 01d, scratch branch, node "Search WI (iConn)" (11 Nov 2026): full field read for the discovery
// inserts. Per investor: the profile (type, country, AUM, asset classes, strategies, ticket, attributes,
// industries, summary) and its 10 newest intentions (20 if no themes line). Read-only; staged in
// wi_full_reads. Paced 4-7 s per investor, 2-4 s between calls; stops on an expired token, sign-in or CAPTCHA.
const H = this.helpers;
const GQL = 'https://platform-data.withintelligence.com/graphql';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0 Safari/537.36';
const tok = (($('Load Token (iConn)').first() || { json: {} }).json || {});
const q = (s) => s === null || s === undefined ? 'null' : "'" + String(s).replace(/'/g, "''") + "'";
const row = (wi, status, profile, total, notes, msg) => ({ json: { sql: 'INSERT INTO wi_full_reads (wi_id, status, profile, total, notes, message) VALUES ('
  + q(wi) + ', ' + q(status) + ', ' + (profile ? q(JSON.stringify(profile)) + '::jsonb' : 'null') + ', ' + (total === null || total === undefined ? 'null' : Number(total)) + ', '
  + (notes ? q(JSON.stringify(notes)) + '::jsonb' : 'null') + ', ' + q(msg ? String(msg).slice(0, 300) : null) + ');' } });
const targets = $input.all().map(i => i.json).filter(t => t && t.wi_id);
if (!targets.length) return [];
if (!tok.access_token || (tok.seconds_left !== null && tok.seconds_left !== undefined && Number(tok.seconds_left) <= 0))
  return [row(targets[0].wi_id, 'auth_error', null, null, null, 'Token missing or past its expiry; refresh it.')];
const HEAD = { 'content-type': 'application/json', 'authorization': 'Bearer ' + tok.access_token, 'website': 'with', 'user-website': 'with',
  'origin': 'https://platform.withintelligence.com', 'referer': 'https://platform.withintelligence.com/', 'user-agent': UA };
const QP = 'query P($id:String){ searchInvestor(id:$id){ id name summary type { name } address { city country { name } } '
  + 'latest_aum { value_usd ranges_usd { label } } asset_classes { name } '
  + 'investment_strategies { primary_strategy { name } secondary_strategies { name } } investment_attributes { name } '
  + 'investment_industries { primary_industry { name } secondary_industries { name } } '
  + 'preferences { asset_class { name } allocations { ticket_size { value_lower_usd value_upper_usd } fund_size { value_lower_usd value_upper_usd } } } } }';
const QI = 'query I($b:String,$p:PaginationFilters){ postMandatesIntentions(filters:{ _json_body: $b }, paginationFilters:$p){ pagination { total } '
  + 'results { id date note entityType status { name sub_status { name } } asset_class { name } } } }';
const sleep = (ms) => new Promise(res => setTimeout(res, ms));
const jitter = (a, b) => a + Math.floor(Math.random() * (b - a));
const BLOCK = /<html|captcha|recaptcha|hcaptcha|cf-chl|are you a robot|sign[ -]?in|log[ -]?in/i;
async function gql(query, variables) {
  let r;
  try { r = await H.httpRequest({ method: 'POST', url: GQL, json: true, ignoreHttpStatusErrors: true, timeout: 15000, headers: HEAD, body: { query, variables } }); }
  catch (e) { return { kind: 'error', msg: 'HTTP ' + String((e && e.message) || e) }; }
  if (typeof r === 'string') { try { r = JSON.parse(r); } catch (_) { return { kind: BLOCK.test(r) ? 'blocked' : 'error', msg: r.replace(/\s+/g, ' ').slice(0, 200) }; } }
  const errs = ((r && r.errors) || []).map(e => e && e.message).filter(Boolean).join('; ');
  if (errs && /expired|log ?in|unauth|forbidden|jwt|token/i.test(errs)) return { kind: 'auth_error', msg: errs };
  return { kind: 'ok', data: r && r.data, msg: errs || null };
}
const clean = (s) => String(s || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#0?39;/g, "'").replace(/\s+/g, ' ').trim();
const out = []; const t0 = Date.now();
for (const t of targets) {
  if (Date.now() - t0 > 34000) break;
  await sleep(jitter(4000, 7000));
  const id = String(t.wi_id);
  const p = await gql(QP, { id });
  if (p.kind === 'auth_error' || p.kind === 'blocked') { out.push(row(id, p.kind, null, null, null, p.msg)); break; }
  if (p.kind !== 'ok') { out.push(row(id, 'error', null, null, null, p.msg)); continue; }
  const prof = p.data && p.data.searchInvestor;
  if (prof && prof.summary) prof.summary = clean(prof.summary);
  const notes = []; let total = null, stop = null;
  for (let start = 0; start < 20; start += 10) {
    await sleep(jitter(2000, 4000));
    const r = await gql(QI, { b: JSON.stringify({ institutional_investor_id: id, sort: 'date', order: 'desc' }), p: { start, limit: 10 } });
    if (r.kind === 'auth_error' || r.kind === 'blocked') { stop = r; break; }
    const d = r.data && r.data.postMandatesIntentions;
    if (r.kind !== 'ok' || !d) { stop = { kind: 'partial', msg: r.msg || 'No intentions returned.' }; break; }
    total = d.pagination ? d.pagination.total : null;
    for (const x of (d.results || [])) notes.push({ date: x.date, type: x.entityType || null,
      status: x.status ? [x.status.name, x.status.sub_status && x.status.sub_status.name].filter(Boolean).join(' / ') : null,
      asset_class: x.asset_class ? x.asset_class.name : null, note: clean(x.note).slice(0, 4000) });
    if (notes.some(n => /themes?\b/i.test(n.note)) || !(total > start + 10)) break;
  }
  if (stop && (stop.kind === 'auth_error' || stop.kind === 'blocked')) { out.push(row(id, stop.kind, prof, total, notes, stop.msg)); break; }
  out.push(row(id, prof ? (stop ? 'partial' : 'ok') : 'no_profile', prof, total, notes, stop ? stop.msg : p.msg));
}
return out;
