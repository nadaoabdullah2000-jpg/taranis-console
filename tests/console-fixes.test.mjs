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
