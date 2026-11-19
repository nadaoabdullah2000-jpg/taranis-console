// WI 01d, scratch branch, node "Search WI (iConn)" (12 Nov 2026): Tech tier-1 check. Per investor in
// wi_hf_targets: the profile (name, type, country) and its 60 newest intentions with each one's asset
// class, so it can be seen whether the tech statement sits in a hedge fund intention. If the profile id
// does not resolve, or is negative, the investor is also searched by name and the candidates kept.
// Read-only; staged in wi_hf_reads. Paced 4-7 s per investor, 2-4 s between calls; stops on an expired
// token, sign-in or CAPTCHA.
const H = this.helpers;
const GQL = 'https://platform-data.withintelligence.com/graphql';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0 Safari/537.36';
const tok = (($('Load Token (iConn)').first() || { json: {} }).json || {});
const q = (s) => s === null || s === undefined ? 'null' : "'" + String(s).replace(/'/g, "''") + "'";
const J = (v) => v ? q(JSON.stringify(v)) + '::jsonb' : 'null';
const row = (wi, status, profile, total, notes, cands, msg) => ({ json: { sql: 'INSERT INTO wi_hf_reads (wi_id, status, profile, total, notes, candidates, message) VALUES ('
  + q(wi) + ', ' + q(status) + ', ' + J(profile) + ', ' + (total === null || total === undefined ? 'null' : Number(total)) + ', '
  + J(notes) + ', ' + J(cands) + ', ' + q(msg ? String(msg).slice(0, 300) : null) + ');' } });
const targets = $input.all().map(i => i.json).filter(t => t && t.wi_id);
if (!targets.length) return [];
if (!tok.access_token || (tok.seconds_left !== null && tok.seconds_left !== undefined && Number(tok.seconds_left) <= 0))
  return [row(targets[0].wi_id, 'auth_error', null, null, null, null, 'Token missing or past its expiry; refresh it.')];
const HEAD = { 'content-type': 'application/json', 'authorization': 'Bearer ' + tok.access_token, 'website': 'with', 'user-website': 'with',
  'origin': 'https://platform.withintelligence.com', 'referer': 'https://platform.withintelligence.com/', 'user-agent': UA };
const QP = 'query P($id:String){ searchInvestor(id:$id){ id name type { name } address { city country { name } } asset_classes { name } } }';
const QS = 'query S($f:SearchInvestorsFilters){ searchInvestors(limit:10, filters:$f){ results { id name type { name } address { country { name } } } } }';
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
const out = [];
const t = targets[0];
// One-off: the paging fields of the intentions query, from the API's own schema (no investor data).
if (String(t.wi_id) === 'introspect') {
  await sleep(jitter(2000, 4000));
  const r = await gql('query { pf: __type(name:"PaginationFilters"){ inputFields { name type { name kind ofType { name } } } } '
    + 'q: __schema { queryType { fields { name args { name type { name kind ofType { name } } } } } } }', {});
  const fields = r.data && r.data.q ? r.data.q.queryType.fields.filter(f => /intention|mandate/i.test(f.name)) : null;
  return [row('introspect', r.kind === 'ok' ? 'ok' : r.kind, { pagination: r.data && r.data.pf, fields }, null, null, null, r.msg)];
}
const id = String(t.wi_id);
await sleep(jitter(4000, 7000));
const p = await gql(QP, { id });
if (p.kind === 'auth_error' || p.kind === 'blocked') return [row(id, p.kind, null, null, null, null, p.msg)];
const prof = p.kind === 'ok' && p.data ? p.data.searchInvestor : null;
let cands = null;
if (!prof || Number(id) < 0) {
  await sleep(jitter(2000, 4000));
  const s = await gql(QS, { f: { name: String(t.name || '') } });
  if (s.kind === 'auth_error' || s.kind === 'blocked') return [row(id, s.kind, prof, null, null, null, s.msg)];
  cands = (s.data && s.data.searchInvestors && s.data.searchInvestors.results) || [];
}
const notes = []; let total = null, stop = null;
if (prof) {
  // One call for the 60 newest: "start" is not honoured by this endpoint (each page came back as
  // the same newest 10), so the whole window is asked for at once.
  await sleep(jitter(2000, 4000));
  const r = await gql(QI, { b: JSON.stringify({ institutional_investor_id: id, sort: 'date', order: 'desc' }), p: { start: 0, limit: 60 } });
  const d = r.data && r.data.postMandatesIntentions;
  if (r.kind === 'auth_error' || r.kind === 'blocked') stop = r;
  else if (r.kind !== 'ok' || !d) stop = { kind: 'partial', msg: r.msg || 'No intentions returned.' };
  else {
    total = d.pagination ? d.pagination.total : null;
    for (const x of (d.results || [])) notes.push({ date: x.date, type: x.entityType || null,
      status: x.status ? [x.status.name, x.status.sub_status && x.status.sub_status.name].filter(Boolean).join(' / ') : null,
      asset_class: x.asset_class ? x.asset_class.name : null, note: clean(x.note).slice(0, 4000) });
  }
}
if (stop && (stop.kind === 'auth_error' || stop.kind === 'blocked')) return [row(id, stop.kind, prof, total, notes, cands, stop.msg)];
out.push(row(id, prof ? (stop ? 'partial' : 'ok') : 'no_profile', prof, total, notes, cands, stop ? stop.msg : p.msg));
return out;
