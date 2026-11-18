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
// Full read (18 Nov 2026, approved by the user), target 'full:<id>'. The intentions query returns 10 notes per
// call and ignores paging, but its "note" key is a whole-word text search over the investor's whole history
// (probe of 18 Nov: Kairos "long/short" -> exactly its 3 known notes, 2024). So: the newest 10, the oldest 10,
// then every term below newest-first, and oldest-first too when a term has more than 10 matches. Each term's
// coverage (matches seen / total) is kept, so a term with more than 20 matches is reported as not fully read.
// Read-only; staged in wi_hf_reads under 'full:<id>'. 2-3 s between calls.
// Terms (the user's list of 18 Nov): 'ls' = long/short match terms (a row is a removal only if all are empty and
// fully covered); 'flag' = shown to the user, never counted; 'info' = context and the technology / space themes.
const FULL_TERMS = [
  ...['long/short', 'long short', 'long-short', 'l/s', 'equity hedge', 'equity hedge fund', 'equity hedge funds', 'hedged equity',
    'long/short equity', 'equity long/short'].map(w => [w, 'ls']),
  ...['long-biased', 'long bias', 'market-neutral', 'market neutral'].map(w => [w, 'flag']),
  ...['quant', 'quantitative', 'systematic', 'hedge fund', 'technology', 'artificial intelligence', 'AI', 'software', 'semiconductor',
    'space', 'defense', 'defence'].map(w => [w, 'info'])];
// Each investor is read in two targets so one code run stays under n8n's time limit: 'full:<id>' reads the newest
// and oldest 10 and the 'ls' and 'flag' terms; 'info:<id>' reads the 'info' terms.
// Investors with many matching notes need more calls: they are read in four targets instead, 'fa:' (newest and
// oldest 10 + the first five 'ls' terms), 'fb:' (the other 'ls' terms + 'flag'), 'ia:' and 'ib:' (half the
// 'info' terms each), so no code run passes n8n's 60-second limit (ERS Texas timed out on 18 Nov).
const FM = /^(full|info|fa|fb|ia|ib):(-?\d+)$/.exec(String(t.wi_id));
if (FM) {
  const fid = FM[2];
  const part = FM[1];
  const LS_T = FULL_TERMS.filter(([, k]) => k === 'ls'), FLAG_T = FULL_TERMS.filter(([, k]) => k === 'flag'), INFO_T = FULL_TERMS.filter(([, k]) => k === 'info');
  const PART_TERMS = { full: LS_T.concat(FLAG_T), info: INFO_T, fa: LS_T.slice(0, 5), fb: LS_T.slice(5).concat(FLAG_T), ia: INFO_T.slice(0, 6), ib: INFO_T.slice(6) };
  await sleep(jitter(4000, 7000));
  const p = await gql(QP, { id: fid });
  if (p.kind === 'auth_error' || p.kind === 'blocked') return [row(t.wi_id, p.kind, null, null, null, null, p.msg)];
  const prof = p.kind === 'ok' && p.data ? p.data.searchInvestor : null;
  if (!prof) return [row(t.wi_id, 'no_profile', null, null, null, null, p.msg)];
  const seen = new Map(); const cov = []; let total = null;
  const take = (xs, label) => { for (const x of xs) { const k = String(x.id); const e = seen.get(k) || { id: k, date: x.date, type: x.entityType || null,
    status: x.status ? [x.status.name, x.status.sub_status && x.status.sub_status.name].filter(Boolean).join(' / ') : null,
    asset_class: x.asset_class ? x.asset_class.name : null, note: clean(x.note).slice(0, 4000), via: [] }; if (e.via.indexOf(label) < 0) e.via.push(label); seen.set(k, e); } };
  const call = async (extra, order) => {
    await sleep(jitter(2000, 3000));
    const r = await gql(QI, { b: JSON.stringify(Object.assign({ institutional_investor_id: fid, sort: 'date', order }, extra)), p: { start: 0, limit: 10 } });
    return r;
  };
  const terms = PART_TERMS[part];
  const jobs = (part === 'full' || part === 'fa' ? [['newest', {}, 'desc', 'base'], ['oldest', {}, 'asc', 'base']] : []).concat(terms.map(([w, k]) => [w, { note: w }, 'desc', k]));
  for (const [label, extra, order, kind] of jobs) {
    const r = await call(extra, order);
    if (r.kind === 'auth_error' || r.kind === 'blocked') return [row(t.wi_id, r.kind, { prof, coverage: cov }, total, [...seen.values()], null, r.msg)];
    const d = r.data && r.data.postMandatesIntentions; const xs = (d && d.results) || [];
    const tot = d && d.pagination ? d.pagination.total : null;
    if (label === 'newest') total = tot;
    take(xs, label);
    let got = xs.length;
    if (label !== 'newest' && label !== 'oldest' && tot > 10) {
      const r2 = await call(extra, 'asc');
      if (r2.kind === 'auth_error' || r2.kind === 'blocked') return [row(t.wi_id, r2.kind, { prof, coverage: cov }, total, [...seen.values()], null, r2.msg)];
      const xs2 = (r2.data && r2.data.postMandatesIntentions && r2.data.postMandatesIntentions.results) || [];
      take(xs2, label);
      got = new Set(xs.concat(xs2).map(x => String(x.id))).size;
    }
    if (label !== 'newest' && label !== 'oldest') cov.push({ term: label, kind, total: tot, seen: got, full: tot === null ? false : got >= tot, err: r.kind === 'ok' ? (r.msg || null) : r.msg });
  }
  const partial = cov.some(c => c.kind === 'ls' && !c.full);
  return [row(t.wi_id, partial ? 'partial' : 'ok', { prof, coverage: cov }, total, [...seen.values()], null, partial ? 'some terms have more than 20 matches' : 'full read 18 Nov')];
}
// Probe (18 Nov 2026, approved by the user): can the intentions query reach past the newest 10? For one
// investor ('probe:<id>'), try one filter or paging form per call and record what came back (count, the
// newest and oldest date, the asset classes), so it shows which forms the endpoint honours. Read-only.
// The variants may also come from the target's name, as JSON [[label, extra body keys, paging or null], ...].
const PM = /^probe:(-?\d+)/.exec(String(t.wi_id));
if (PM) {
  const pid = PM[1];
  const base = { institutional_investor_id: pid, sort: 'date', order: 'desc' };
  let named = null; try { named = /^\s*\[/.test(String(t.name || '')) ? JSON.parse(t.name) : null; } catch (_) { named = null; }
  const V = named || [['base', {}, null], ['order asc', { order: 'asc' }, null],
    ['date_to', { date_to: '2024-01-01' }, null], ['end_date', { end_date: '2024-01-01' }, null],
    ['to_date', { to_date: '2024-01-01' }, null], ['date_end', { date_end: '2024-01-01' }, null],
    ['date lte', { date: { lte: '2024-01-01' } }, null], ['date range', { date_range: { to: '2024-01-01' } }, null],
    ['asset_class', { asset_class: 'Hedge Funds' }, null], ['asset_classes', { asset_classes: ['Hedge Funds'] }, null],
    ['entityType', { entityType: 'Intention' }, null], ['entity_type', { entity_type: 'Intention' }, null],
    ['page 2', {}, { page: 2, limit: 10 }], ['offset 10', {}, { offset: 10, limit: 10 }], ['start 10 limit 10', {}, { start: 10, limit: 10 }]];
  const res = [];
  for (const [name, extra, pg] of V) {
    await sleep(jitter(2000, 3000));
    const r = await gql(QI, { b: JSON.stringify(Object.assign({}, base, extra)), p: pg || { start: 0, limit: 10 } });
    if (r.kind === 'auth_error' || r.kind === 'blocked') return [row(t.wi_id, r.kind, { probe: res }, null, null, null, r.msg)];
    const d = r.data && r.data.postMandatesIntentions;
    const xs = (d && d.results) || [];
    const ds = xs.map(x => String(x.date || '').slice(0, 10)).filter(Boolean).sort();
    res.push({ v: name, kind: r.kind, msg: r.msg ? String(r.msg).slice(0, 160) : null, total: d && d.pagination ? d.pagination.total : null,
      n: xs.length, oldest: ds[0] || null, newest: ds[ds.length - 1] || null,
      ids: xs.map(x => x.id).slice(0, 10), ac: [...new Set(xs.map(x => x.asset_class && x.asset_class.name).filter(Boolean))] });
  }
  return [row(t.wi_id, 'ok', { probe: res }, null, null, null, 'probe')];
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
