// WI 01d, scratch branch, node "Search WI (iConn)" (11 Nov 2026): With Intelligence name search for
// the firms behind discovery fund vehicles. Read-only; stages the candidates (id, name, type,
// country) in wi_name_lookups. Paced 4-7 s per name; stops on an expired token, sign-in page or CAPTCHA.
const H = this.helpers;
const GQL = 'https://platform-data.withintelligence.com/graphql';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0 Safari/537.36';
const tok = (($('Load Token (iConn)').first() || { json: {} }).json || {});
const q = (s) => s === null || s === undefined ? 'null' : "'" + String(s).replace(/'/g, "''") + "'";
const row = (name, status, cands, msg) => ({ json: { sql: 'INSERT INTO wi_name_lookups (query_name, status, candidates, message) VALUES ('
  + q(name) + ', ' + q(status) + ', ' + (cands ? q(JSON.stringify(cands)) + '::jsonb' : 'null') + ', ' + q(msg ? String(msg).slice(0, 300) : null) + ');' } });
const targets = $input.all().map(i => i.json).filter(t => t && t.wi_id);   // wi_id carries the name to search
if (!targets.length) return [];
if (!tok.access_token || (tok.seconds_left !== null && tok.seconds_left !== undefined && Number(tok.seconds_left) <= 0))
  return [row(targets[0].wi_id, 'auth_error', null, 'Token missing or past its expiry; refresh it.')];
const HEAD = { 'content-type': 'application/json', 'authorization': 'Bearer ' + tok.access_token, 'website': 'with', 'user-website': 'with',
  'origin': 'https://platform.withintelligence.com', 'referer': 'https://platform.withintelligence.com/', 'user-agent': UA };
const SEARCH = 'query S($f:SearchInvestorsFilters){ searchInvestors(limit:10, filters:$f){ results { id name type { name } address { country { name } } } } }';
const sleep = (ms) => new Promise(res => setTimeout(res, ms));
const BLOCK = /<html|captcha|recaptcha|hcaptcha|cf-chl|are you a robot|sign[ -]?in|log[ -]?in/i;
const out = []; const t0 = Date.now();
for (const t of targets) {
  if (Date.now() - t0 > 38000) break;
  await sleep(4000 + Math.floor(Math.random() * 3000));
  const name = String(t.wi_id);
  let r;
  try { r = await H.httpRequest({ method: 'POST', url: GQL, json: true, ignoreHttpStatusErrors: true, timeout: 15000, headers: HEAD, body: { query: SEARCH, variables: { f: { name } } } }); }
  catch (e) { out.push(row(name, 'error', null, 'HTTP ' + String((e && e.message) || e))); continue; }
  if (typeof r === 'string') { try { r = JSON.parse(r); } catch (_) { out.push(row(name, BLOCK.test(r) ? 'blocked' : 'error', null, r.slice(0, 200))); if (BLOCK.test(r)) break; continue; } }
  const errs = ((r && r.errors) || []).map(e => e && e.message).filter(Boolean).join('; ');
  if (errs && /expired|log ?in|unauth|forbidden|jwt|token/i.test(errs)) { out.push(row(name, 'auth_error', null, errs)); break; }
  const res = (r && r.data && r.data.searchInvestors && r.data.searchInvestors.results) || [];
  out.push(row(name, res.length ? 'ok' : 'not_found', res.map(x => ({ id: x.id, name: x.name, type: x.type ? x.type.name : null,
    country: x.address && x.address.country ? x.address.country.name : null })), errs || null));
}
return out;
