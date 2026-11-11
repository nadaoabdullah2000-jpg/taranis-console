// WI 01d, scratch branch, node "Search WI (iConn)" (11 Nov 2026): the themes-line read.
// For each target investor (wi_id), read its With Intelligence intentions (newest first, up to
// 2 pages of 10) and stage the full notes in wi_themes_reads. Read-only on With Intelligence and on
// wi_mandates. Paced: a 4-7 s pause before each investor and 2-4 s between pages. Stops at once on
// an expired token, a sign-in page or a CAPTCHA (status auth_error / blocked), and the batch query
// then returns nothing, so the loop ends instead of failing partway.
const H = this.helpers;
const GQL = 'https://platform-data.withintelligence.com/graphql';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0 Safari/537.36';
const tok = (($('Load Token (iConn)').first() || { json: {} }).json || {});
const q = (s) => s === null || s === undefined ? 'null' : "'" + String(s).replace(/'/g, "''") + "'";
const row = (wi, status, pages, total, notes, msg) => ({ json: { sql: 'INSERT INTO wi_themes_reads (wi_id, status, pages, total, notes, message) VALUES ('
  + q(wi) + ', ' + q(status) + ', ' + (pages === null ? 'null' : Number(pages)) + ', ' + (total === null ? 'null' : Number(total)) + ', '
  + (notes ? q(JSON.stringify(notes)) + '::jsonb' : 'null') + ', ' + q(msg ? String(msg).slice(0, 300) : null) + ');' } });
const targets = $input.all().map(i => i.json).filter(t => t && t.wi_id);
if (!targets.length) return [];
if (!tok.access_token || (tok.seconds_left !== null && tok.seconds_left !== undefined && Number(tok.seconds_left) <= 0))
  return [row(targets[0].wi_id, 'auth_error', null, null, null, 'Token missing or past its expiry; refresh it. Nothing read.')];
const HEAD = { 'content-type': 'application/json', 'authorization': 'Bearer ' + tok.access_token, 'website': 'with', 'user-website': 'with',
  'origin': 'https://platform.withintelligence.com', 'referer': 'https://platform.withintelligence.com/', 'user-agent': UA };
const QI = 'query I($b:String,$p:PaginationFilters){ postMandatesIntentions(filters:{ _json_body: $b }, paginationFilters:$p){ pagination { total } '
  + 'results { id date note entityType status { name sub_status { name } } asset_class { name } } } }';
const sleep = (ms) => new Promise(res => setTimeout(res, ms));
const jitter = (a, b) => a + Math.floor(Math.random() * (b - a));
const BLOCK = /<html|captcha|recaptcha|hcaptcha|cf-chl|are you a robot|sign[ -]?in|log[ -]?in/i;
async function page(id, start) {
  let r;
  try { r = await H.httpRequest({ method: 'POST', url: GQL, json: true, ignoreHttpStatusErrors: true, timeout: 15000, headers: HEAD,
    body: { query: QI, variables: { b: JSON.stringify({ institutional_investor_id: String(id), sort: 'date', order: 'desc' }), p: { start, limit: 10 } } } }); }
  catch (e) { return { kind: 'error', msg: 'HTTP ' + String((e && e.message) || e) }; }
  if (typeof r === 'string') {
    try { r = JSON.parse(r); } catch (_) { return { kind: BLOCK.test(r) ? 'blocked' : 'error', msg: r.replace(/\s+/g, ' ').slice(0, 200) }; }
  }
  const errs = ((r && r.errors) || []).map(e => e && e.message).filter(Boolean).join('; ');
  if (errs && /expired|log ?in|unauth|forbidden|jwt|token/i.test(errs)) return { kind: 'auth_error', msg: errs };
  const d = r && r.data && r.data.postMandatesIntentions;
  if (!d) return { kind: 'error', msg: errs || 'No intentions returned.' };
  return { kind: 'ok', total: d.pagination ? d.pagination.total : null, results: d.results || [] };
}
const t0 = Date.now();
const out = [];
for (let i = 0; i < targets.length; i++) {
  if (Date.now() - t0 > 38000) break;                       // the rest are picked up by the next loop
  await sleep(jitter(4000, 7000));
  const id = String(targets[i].wi_id);
  const notes = []; let total = null, pages = 0, stop = null;
  for (let start = 0; start < 20; start += 10) {
    if (start) await sleep(jitter(2000, 4000));
    const p = await page(id, start);
    if (p.kind === 'auth_error' || p.kind === 'blocked') { stop = p; break; }
    if (p.kind !== 'ok') { out.push(row(id, 'error', pages, total, notes.length ? notes : null, p.msg)); stop = { kind: 'skip' }; break; }
    pages++; total = p.total;
    for (const x of p.results) notes.push({ date: x.date, type: x.entityType || null,
      status: x.status ? [x.status.name, x.status.sub_status && x.status.sub_status.name].filter(Boolean).join(' / ') : null,
      asset_class: x.asset_class ? x.asset_class.name : null, note: String(x.note || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&#0?39;/g, "'").replace(/\s+/g, ' ').trim().slice(0, 4000) });
    if (notes.some(n => /themes?\b/i.test(n.note)) || !(total > start + 10)) break;   // a themes line found, or no more pages
  }
  if (stop && (stop.kind === 'auth_error' || stop.kind === 'blocked')) { out.push(row(id, stop.kind, pages, total, null, stop.msg)); break; }
  if (!stop) out.push(row(id, notes.length ? 'ok' : 'no_intentions', pages, total, notes, null));
}
return out;
