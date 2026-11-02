/* Run with: npm test
   Fixes from the 2 Nov 2026 review, tested on the functions as they stand in
   app.js (pulled out by name, run in a sandbox with stubbed network). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const src = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const grab = (a, b) => {
  const i = src.indexOf(a);
  assert.ok(i > -1, 'not found: ' + a);
  return src.slice(i, src.indexOf(b, i));
};
const sandbox = (code, extra) => {
  const ctx = Object.assign({ URL, Error, Promise, AbortController, setTimeout, clearTimeout, Date, Number, JSON }, extra || {});
  vm.createContext(ctx);
  vm.runInContext(code, ctx);
  return ctx;
};

test('search terms are URL-encoded: "&", "#", "+" and "%" stay inside one parameter', () => {
  const ctx = sandbox(grab('function lk(term)', '\nfunction ilikeAny') + '\nthis.lk = lk;');
  for (const term of ['Smith & Williamson', 'AT&T #1', 'a+b 100%']) {
    const u = new URL('https://x/rest/v1/t?select=*&or=(name.ilike.' + ctx.lk(term) + ')');
    assert.deepEqual([...u.searchParams.keys()], ['select', 'or']);
    assert.equal(u.searchParams.get('or'), '(name.ilike."*' + term + '*")');
  }
  assert.equal(ctx.lk('a, (b) "c"'), '"*a%20b%20c*"');   // PostgREST's own separators still dropped
});

test('readAllRows pages past the 1,000-row API cap and stops at the last page', async () => {
  const total = 2403, asked = [];
  const ctx = sandbox(grab('const PAGE_ROWS', 'async function deleteFromStorage') + '\nthis.readAllRows = readAllRows;', {
    DEMO: false,
    readRows: async () => { throw new Error('should not fall back'); },
    supaSelect: async (t, q) => {
      asked.push(q);
      const off = Number(/offset=(\d+)/.exec(q)[1]), lim = Number(/limit=(\d+)/.exec(q)[1]);
      return Array.from({ length: Math.max(0, Math.min(lim, total - off)) }, (_, i) => ({ id: off + i }));
    }
  });
  const rows = await ctx.readAllRows('wi_mandates', 'select=id&order=id.desc', 'x', {});
  assert.equal(rows.length, total);
  assert.equal(new Set(rows.map(r => r.id)).size, total);
  assert.equal(asked.length, 3);
  assert.ok(asked.every(q => /&order=id\.desc&limit=1000&offset=\d+$/.test(q)));
  const capped = await ctx.readAllRows('wi_mandates', 'select=id&order=id', 'x', {}, 1500);
  assert.equal(capped.length, 1500);
});

const meetingCtx = (respond) => sandbox(grab('async function createMeeting', '\nasync function ') + '\nthis.createMeeting = createMeeting;', {
  DEMO: false, CFG: { supabaseUrl: 'https://s', supabaseAnonKey: 'k' }, session: { token: 't' },
  ensureToken: async () => {}, signOut: () => {}, fetch: async (u, o) => respond(o)
});
const reply = (status, body) => ({ status, ok: status >= 200 && status < 300, json: async () => body });

test('a refused booking is an error, a kept-in-the-diary one is not', async () => {
  await assert.rejects(meetingCtx(() => reply(403, { ok: false, message: 'Not on the allow list.' })).createMeeting({}),
    (e) => e.refused === true && /allow list/.test(e.message));
  await assert.rejects(meetingCtx(() => reply(200, { ok: false, join_url: '', message: 'No usable start time was supplied.' })).createMeeting({}),
    (e) => e.refused === true);
  const kept = await meetingCtx(() => reply(200, { ok: false, status: 'pending', meeting_id: '7', message: 'Zoom said no' })).createMeeting({});
  assert.equal(kept.status, 'pending');
  const fine = await meetingCtx(() => reply(200, { ok: true, join_url: 'https://zoom.us/j/1' })).createMeeting({});
  assert.equal(fine.join_url, 'https://zoom.us/j/1');
});

test('a timed-out booking is flagged so the caller does not write a second row', async () => {
  const ctx = meetingCtx(() => { const e = new Error('aborted'); e.name = 'AbortError'; throw e; });
  await assert.rejects(ctx.createMeeting({}), (e) => e.timedOut === true && !e.refused);
});

test('no network keeps the sign-in; only the server refusing ends it', async () => {
  const code = grab('async function refreshSession', '\nfunction readTokenFromUrl') + '\nthis.ensureToken = ensureToken;';
  const run = async (fetchImpl) => {
    let signedOut = false;
    const ctx = sandbox(code, {
      DEMO: false, CFG: { supabaseUrl: 'https://s', supabaseAnonKey: 'k' },
      session: { token: 't', refresh: 'r', email: 'a@b', expires: Date.now() - 1000 },
      saveSession: () => {}, signOut: () => { signedOut = true; }, fetch: fetchImpl
    });
    let err = null;
    try { await ctx.ensureToken(); } catch (e) { err = e; }
    return { signedOut, err };
  };
  const offline = await run(async () => { throw new TypeError('Failed to fetch'); });
  assert.equal(offline.signedOut, false);
  assert.match(offline.err.message, /No connection/);
  const down = await run(async () => ({ ok: false, status: 503 }));
  assert.equal(down.signedOut, false);
  const refused = await run(async () => ({ ok: false, status: 400 }));
  assert.equal(refused.signedOut, true);
});

test('all-digit passcodes, PINs and phone numbers are shown as typed, not as numbers', () => {
  const line = grab("} else if (typeof v === 'number' || (/^-?\\d+", '\n');
  const keep = /!\/(.*?)\/i\.test\(key\)/.exec(line)[1];
  const re = new RegExp(keep, 'i');
  for (const k of ['passcode', 'Passcode', 'pin', 'phone', 'meeting id', 'url']) assert.ok(re.test(k), k);
  for (const k of ['ticket', 'aum', 'rows']) assert.ok(!re.test(k), k);
});

test('"Equities" is listed equity, not private equity; other asset keys match as before', () => {
  const ctx = sandbox(grab('function assetMatches', '\nfunction oppsPasses') + '\nthis.assetMatches = assetMatches;');
  assert.equal(ctx.assetMatches(['private equity'], 'equit'), false);
  assert.equal(ctx.assetMatches(['private equity', 'public equities'], 'equit'), true);
  assert.equal(ctx.assetMatches(['equity'], 'equit'), true);
  assert.equal(ctx.assetMatches(['private equity'], 'private'), true);
  assert.equal(ctx.assetMatches(['hedge funds'], 'hedge'), true);
});

test('a row a person marks Matched scores at the matched line or above, never 0', () => {
  const ctx = sandbox(grab('function verdictPatch', '\n// A verdict a person chose') + '\nthis.verdictPatch = verdictPatch;', {
    rescore: (m) => m._r
  });
  assert.equal(ctx.verdictPatch({ new_fit_score: 0, _r: { q: 'needs_data', s: null } }, 'matched').new_fit_score, 0.75);
  assert.equal(ctx.verdictPatch({ new_fit_score: 0, _r: { q: 'matched', s: 0.9 } }, 'matched').new_fit_score, 0.9);
  assert.equal(ctx.verdictPatch({ new_fit_score: 0.95, _r: { q: 'low', s: 0.2 } }, 'matched').new_fit_score, 0.95);
  assert.equal(ctx.verdictPatch({ new_fit_score: null, _r: { q: 'tech', s: 0.6 } }, 'matched').new_fit_score, 0.75);
});

test('a malformed LinkedIn address does not throw; handles compare exactly', () => {
  const ctx = sandbox(grab('function safeDecode', '\nfunction connSeen') + '\nthis.liHandle = liHandle;', { decodeURIComponent });
  assert.equal(ctx.liHandle('https://www.linkedin.com/in/j%E9r'), 'j%e9r');
  assert.equal(ctx.liHandle('https://linkedin.com/in/abc%'), 'abc%');
  assert.equal(ctx.liHandle('https://linkedin.com/in/John-Smith/'), 'john-smith');
  assert.notEqual(ctx.liHandle('https://linkedin.com/in/john-smith-4a2b1c'), 'john-smith');
});

const rules = sandbox([
  grab('const RE_STRONG =', '\n// "systematic" alone'),
  grab('const RE_STRONG_CORE', '\n'),
  grab('const RE_TECH =', '\n// Strategy tags as words'),
  grab('// Words that make a People item', '\nfunction isManagerNews'),
  'this.RE_STRONG_CORE = RE_STRONG_CORE; this.isTech = isTech; this.RE_PEOPLE_PLACES = RE_PEOPLE_PLACES;'
].join('\n'));

test('long-only and quantitative easing are not long/short or quant', () => {
  const strong = (t) => rules.RE_STRONG_CORE.test(t);
  assert.equal(strong('global equity long only mandate'), false);
  assert.equal(strong('equity long-only managers'), false);
  assert.equal(strong('worried about quantitative easing ending'), false);
  assert.equal(strong('equity long/short'), true);
  assert.equal(strong('equity long short and event driven'), true);
  assert.equal(strong('seeks quant managers'), true);
  assert.equal(strong('quantitative strategies'), true);
});

test('a tech exclusion stops at a positive clause, not at a list comma', () => {
  assert.equal(rules.isTech('excluding tobacco, focus on technology and software managers'), true);
  assert.equal(rules.isTech('excluding energy, tobacco and technology'), false);
  assert.equal(rules.isTech('avoid funds overly exposed to software and technology'), false);
  assert.equal(rules.isTech('avoids excessive concentration, particularly in it and ai, and instead looks for essential software'), true);
  assert.equal(rules.isTech('wants technology exposure'), true);
});

test('People items: "research", "committee", "seedling" do not make a manager an allocator', () => {
  const placesMoney = (t) => rules.RE_PEOPLE_PLACES.test(t);
  assert.equal(placesMoney('hires head of quant research'), false);
  assert.equal(placesMoney('joins the investment committee'), false);
  assert.equal(placesMoney('seedling fund'), false);
  assert.equal(placesMoney('to lead manager search'), true);
  assert.equal(placesMoney('will seed new managers'), true);
  assert.equal(placesMoney('commitments to hedge funds'), true);
  assert.equal(placesMoney('head of third-party allocations'), true);
});

test('text with "<" and ">" keeps its middle; real tags still go', () => {
  const ctx = sandbox(grab('function cleanText', '\nfunction deMojibake') + '\nthis.cleanText = cleanText;', {
    ENTITIES: { amp: '&' }, String });
  assert.equal(ctx.cleanText('AUM < $500m and target returns > 8% net'), 'AUM < $500m and target returns > 8% net');
  assert.equal(ctx.cleanText('<p>Seeks <b>quant</b> managers</p>'), 'Seeks quant managers');
  assert.equal(ctx.cleanText('see <a href="https://x">this</a>'), 'see this');
});

test('Storage paths: "#", "?" and spaces in a segment are encoded, slashes kept', () => {
  const ctx = sandbox(grab('function storageUrlPath', '\nasync function deleteFromStorage') + '\nthis.u = storageUrlPath; this.safe = storageSafe;', { encodeURIComponent, String });
  assert.equal(ctx.u('tms/2026-10/Q3#2 ?x-deck.pdf'), 'tms/2026-10/Q3%232%20%3Fx-deck.pdf');
  assert.equal(ctx.safe('Q3#2 ?x'), 'Q3-2-x');
  assert.equal(ctx.safe('v2.1_final'), 'v2.1_final');
});

test('Ask keeps the search context in the history whatever the answer length', () => {
  const ctx = sandbox(grab('const ASK_THREAD', '\nRENDER.ask') + '\nthis.T = ASK_THREAD; this.h = askHistory;', { String });
  ctx.T.push({ role: 'assistant', text: 'x'.repeat(5000), context: '[ctx offset=10]' });
  const last = ctx.h().pop().text;
  assert.ok(last.endsWith('[ctx offset=10]'));
  assert.ok(last.length < 1600);
});

test('a slower, older fill() does not draw over a newer one', async () => {
  const ctx = sandbox(grab('let fillSeq', '\nasync function load(') + '\nthis.fill = fill;', {
    stageOf: () => null, settleStage: () => {}, clear: () => {}, el: () => ({}) });
  const node = { classList: { remove() {} }, drawn: [] };
  const later = (v, ms) => () => new Promise(r => setTimeout(() => r(v), ms));
  await Promise.all([
    ctx.fill(node, later('old', 30), (v) => node.drawn.push(v)),
    ctx.fill(node, later('new', 5), (v) => node.drawn.push(v))
  ]);
  assert.deepEqual(node.drawn, ['new']);
});

const techCtx = (rescoreImpl, stored) => {
  const patches = [];
  const ctx = sandbox([
    grab('const TECH_BY_PERSON', '\n/* EDIT 4'),
    grab('const BAND_LABEL', '\nfunction bandTone'),
    grab('function legacyQual', '\n// new_qualification / new_fit_score'),
    grab('const VERDICT_RANK', '\n'),
    grab('const TECH_CHOICES', '\nfunction techControl'),
    'this.setTech = setTech; this.techOf = techOf; this.techChoiceOf = techChoiceOf;'
  ].join('\n'), {
    String, Number, Object, isFinite, Math,
    isTech: (t) => /technology/.test(String(t)), sigText: (m) => String(m.intention_summary || ''),
    rescore: rescoreImpl, rejectFails: () => ['Asset class excludes hedge funds'],
    session: { email: 'a@taranis.net' }, localDay: () => '2026-11-02',
    manualVerdict: () => ({ verdict_source: 'manual', verdict_set_at: 'now' }),
    fullMandate: async () => Object.assign({}, stored),
    supaPatch: async (t, f, p) => { patches.push(p); }
  });
  return { ctx, patches };
};
// The rule as the console has it: tech lifts needs_data to "tech" (0.60) and
// strong to strong_tech (1.0).
const fakeRescore = (m) => {
  const tech = m.is_tech_investor === true;
  if (m._reject) return { q: 'rejected', s: 0 };
  if (m._strong) return tech ? { q: 'matched', s: 1 } : { q: 'matched', s: 0.9 };
  return tech ? { q: 'uncertain', s: 0.6 } : { q: 'needs_data', s: null };
};

test('Tech: Yes re-scores a needs-data row up and records the choice as a person\'s', async () => {
  const row = { id: 1, new_qualification: 'needs_data', new_fit_score: null };
  const { ctx, patches } = techCtx(fakeRescore, row);
  const m = Object.assign({}, row);
  const { note } = await ctx.setTech(m, 'yes');
  assert.equal(patches[0].is_tech_investor, true);
  assert.match(patches[0].tech_signal, /^Set by a person: a@taranis\.net/);
  assert.equal(patches[0].new_qualification, 'uncertain');
  assert.equal(patches[0].new_fit_score, 0.6);
  assert.equal(patches[0].verdict_source, 'manual');
  assert.match(note, /Re-scored/);
  assert.equal(ctx.techChoiceOf(m), 'yes');
});

test('Tech: Yes never lowers a verdict, and a hard reject stays rejected', async () => {
  const strong = { id: 2, new_qualification: 'matched', new_fit_score: 0.95, _strong: true };
  let t = techCtx(fakeRescore, strong);
  await t.ctx.setTech(Object.assign({}, strong), 'yes');           // 1.0 > 0.95: up
  assert.equal(t.patches[0].new_fit_score, 1);
  const manualHigh = { id: 3, new_qualification: 'matched', new_fit_score: 1, verdict_source: 'manual' };
  t = techCtx(() => ({ q: 'uncertain', s: 0.6 }), manualHigh);
  await t.ctx.setTech(Object.assign({}, manualHigh), 'yes');       // would go down: not applied
  assert.equal(t.patches[0].new_qualification, undefined);
  const rej = { id: 4, new_qualification: 'rejected', new_fit_score: 0, _reject: true };
  t = techCtx(fakeRescore, rej);
  const { note } = await t.ctx.setTech(Object.assign({}, rej), 'yes');
  assert.equal(t.patches[0].new_qualification, undefined);
  assert.match(note, /stays rejected: Asset class excludes hedge funds/);
});

test('Tech: No re-scores without tech, but keeps a verdict a person set', async () => {
  const auto = { id: 5, new_qualification: 'uncertain', new_fit_score: 0.6 };
  let t = techCtx(fakeRescore, auto);
  await t.ctx.setTech(Object.assign({}, auto), 'no');
  assert.equal(t.patches[0].is_tech_investor, false);
  assert.equal(t.patches[0].new_qualification, 'needs_data');
  const manual = { id: 6, new_qualification: 'matched', new_fit_score: 0.9, verdict_source: 'manual' };
  t = techCtx(fakeRescore, manual);
  const { note } = await t.ctx.setTech(Object.assign({}, manual), 'no');
  assert.equal(t.patches[0].new_qualification, undefined);
  assert.match(note, /verdict a person set is kept/);
});

test('techOf: a person\'s choice wins; otherwise the text or the enrichment', () => {
  const { ctx } = techCtx(fakeRescore, {});
  assert.equal(ctx.techOf({ intention_summary: 'wants technology', is_tech_investor: false, tech_signal: 'Set by a person: x' }), false);
  assert.equal(ctx.techOf({ intention_summary: 'macro', is_tech_investor: true, tech_signal: 'Set by a person: x' }), true);
  assert.equal(ctx.techOf({ intention_summary: 'wants technology' }), true);
  assert.equal(ctx.techOf({ intention_summary: 'macro', is_tech_investor: true, tech_signal: 'appetite_raw: AI' }), true);
  assert.equal(ctx.techOf({ intention_summary: 'macro', is_tech_investor: false, tech_signal: 'non-tech focus - real estate' }), false);
});
