// Grok gateway: the API key (header x-api-key) is checked by the webhook's Header Auth
// credential before this runs. Build ONE database call with every value passed as a
// parameter ($1 is a fixed marker so the numbering stays $2, $3, ...).
const raw = $input.first().json || {};
const b = (raw.body && typeof raw.body === 'object' && !Array.isArray(raw.body)) ? raw.body : {};
const fail = (code, reason) => [{ json: { route: 'error', code, body: { status: 'error', reason } } }];
const action = String(b.action || '').toLowerCase().trim();
const int = (v, d, max) => { const n = parseInt(v, 10); return Number.isFinite(n) && n >= 0 ? Math.min(n, max) : d; };
const call = (expr, params) => [{ json: { route: 'db', action,
  sql: 'select true as ok, case when $1::text is not null then ' + expr + ' end as r',
  params: ['grok'].concat(params) } }];
// save / save_undo / checked / discover go to the write connection; everything else to the read-only login.
const callW = (expr, params) => { const r = call(expr, params); r[0].json.route = 'dbw'; return r; };
const scopeOf = () => { const s = String(b.scope || '').toLowerCase().trim(); return (s === 'mandates' || s === 'iconnections') ? s : null; };
const dryOf = () => b.dry_run === false || String(b.dry_run).toLowerCase() === 'false' ? 'false' : 'true';

switch (action) {
  case 'schema':
    return call('grok_fn.schema_info()', []);
  case 'missing_summary':
    return call('grok_fn.missing_summary()', []);
  case 'query': {
    const q = String(b.sql || '').trim();
    if (!q) return fail(400, 'Give sql: one SELECT over the tables listed by schema.');
    return call('grok_fn.ro_query($2, $3::int)', [q, String(int(b.limit, 200, 1000))]);
  }
  case 'todo': {
    // scope focus (11 Nov 2026): Technology focus and Emerging managers pass (schema-26).
    const s = String(b.scope || '').toLowerCase().trim() === 'focus' ? 'focus' : scopeOf();
    if (!s) return fail(400, 'Give scope: mandates, iconnections or focus.');
    return call('grok_fn.todo($2, $3::int, $4::int)', [s, String(int(b.limit, 20, 100)), String(int(b.offset, 0, 100000))]);
  }
  case 'save': {
    const s = scopeOf();
    if (!s) return fail(400, 'Give scope: mandates or iconnections.');
    if (!Array.isArray(b.items) || !b.items.length) return fail(400, 'Give items: a list of { id, wi_id or wi_url, fields }.');
    if (b.items.length > 20) return fail(400, 'At most 20 items per call.');
    return callW('grok_fn.save($2, $3::jsonb, $4::boolean, $5)', [s, JSON.stringify(b.items), dryOf(), 'Grok']);
  }
  case 'checked': {
    const s = scopeOf();
    if (!s) return fail(400, 'Give scope: mandates or iconnections.');
    const items = Array.isArray(b.items) ? b.items : (b.id !== undefined ? [{ id: b.id, result: b.result, note: b.note, wi_id: b.wi_id }] : []);
    if (!items.length) return fail(400, 'Give items: [{ id, result: done | no_profile | unsure, note }].');
    if (items.length > 50) return fail(400, 'At most 50 items per call.');
    return callW('grok_fn.checked($2, $3::jsonb, $4)', [s, JSON.stringify(items), 'Grok']);
  }
  case 'discover': {
    // New investors found by a filtered With Intelligence search (11 Nov 2026, schema-27): staged in
    // grok.wi_discovered by wi_id, never added to Opportunities here. Dry run unless dry_run is false.
    if (!Array.isArray(b.items) || !b.items.length) return fail(400, 'Give items: a list of investor records (wi_id, name, ...).');
    if (b.items.length > 50) return fail(400, 'At most 50 items per call.');
    return callW('grok_fn.discover($2::jsonb, $3::boolean, $4)', [JSON.stringify(b.items), dryOf(), 'Grok']);
  }
  case 'discover_status':
    return call('grok_fn.discover_status($2::int, $3::int)', [String(int(b.limit, 50, 200)), String(int(b.offset, 0, 100000))]);
  case 'save_undo': {
    const run = String(b.run || '').trim();
    if (!run) return fail(400, 'Give run: the run tag a save returned.');
    return callW('grok_fn.save_undo($2, $3::boolean)', [run, dryOf()]);
  }
  case 'wi_lookup': {
    const m = /investors\/(-?\d+)/.exec(String(b.url || ''));
    const id = String(b.wi_id || (m ? m[1] : '') || '').trim();
    const name = String(b.name || '').trim();
    if (!id && !name) return fail(400, 'Give wi_id, url or name.');
    return [{ json: { route: 'wi', action, wi_id: id, name } }];
  }
  case 'update':
    return fail(410, 'update was removed. Use save: it fills blanks only, logs every change, and has dry_run.');
  default:
    return fail(400, 'Unknown action. Use one of: schema, query, missing_summary, todo, save, checked, save_undo, discover, discover_status, wi_lookup.');
}
