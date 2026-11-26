/* Run with: npm test
   enriched.js (26 Nov 2026): the reader for the enriched allocator workbook, shared by the console upload, the n8n
   workflow "Grok Allocators -> Web App" and these tests. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import zlib from 'node:zlib';

const require = createRequire(import.meta.url);
const E = require('../enriched.js');
const fixture = readFileSync(new URL('./fixtures/enriched-sample.xlsx', import.meta.url));

test('reads the Enrich(ed) tab (not the first sheet), hyperlinks included, full text kept', () => {
  const r = E.readEnriched(fixture);
  assert.equal(r.sheet, 'Enrich');
  assert.deepEqual(r.unmapped, []);
  const a = r.rows.find(x => x.name === 'Alpha Endowment');
  assert.equal(a.wi_url, 'https://platform.withintelligence.com/explore/investors/1');
  assert.equal(a.wi_id, '1');
  assert.equal(a.iconn_url, 'https://app.iconnections.io/list/external/allocators/12345');
  assert.equal(a.preqin_url, 'https://app.iconnections.io/list/external/allocator-companies/77');
  assert.equal(a.intention, 'Alpha: Equity / long-short in scope.\n\nTicket $5m-$15m, see https://example.org/a');
  assert.equal(a.iconn_bot_data, 'iConnections Preqin: Endowment; AUM 870M USD');
});

test('contacts: name, title, e-mail, phone, LinkedIn, iConnections id and link', () => {
  const a = E.readEnriched(fixture).rows.find(x => x.name === 'Alpha Endowment');
  assert.deepEqual(a.contacts, [
    { name: 'Ann Lee', title: 'Chief Investment Officer', email: 'ann@alpha.edu', phone: '+1 207 725 3476', linkedin: 'https://www.linkedin.com/in/ann/' },
    { name: 'Bob Ray', title: 'Analyst' }]);
  assert.deepEqual(a.iconn_contacts, [{ name: 'Ann Lee', title: 'CIO', id: '12345', iconnections: 'https://app.iconnections.io/list/external/allocators/12345' }]);
  assert.deepEqual(E.parseContacts('• No contacts listed on iConnections'), []);
});

test('tiers: Strong, Tech, Emerging Managers, Opportunities ("Not stated" goes to Opportunities)', () => {
  const t = Object.fromEntries(E.readEnriched(fixture).rows.map(x => [x.name, x.tier_label]));
  assert.deepEqual(t, { 'Alpha Endowment': 'Strong', 'Beta Family Office': 'Tech', 'Gamma Pension': 'Emerging Managers', 'Delta Wealth': 'Opportunities' });
  assert.equal(E.tierOf({ tech: 'Yes', emerging: 'Yes', iconn_url: 'x' }), 1, 'the sheet rule when Fit Status is empty');
  assert.equal(E.tierOf({ tech: 'Yes', emerging: 'Yes' }), 2, 'not on iConnections: Tech');
});

test('de-duplicates by investor name (case and spacing) and by With Intelligence id; the first row wins', () => {
  const r = E.readEnriched(fixture);
  assert.equal(r.rows.length, 4);
  assert.deepEqual(r.duplicates, [{ row: 6, name: 'alpha endowment', first_row: 2 }]);
  assert.equal(r.rows.find(x => x.name === 'Alpha Endowment').tech, 'Yes');
});

test('header spellings vary: "Investor name", "Technology investor", "Preqin" still map', () => {
  const m = E.mapHeaders(['Investor name', 'WI profile', 'Technology investor', 'Emerging manager', 'Preqin', 'Fit']);
  assert.deepEqual(m, { name: 0, wi: 1, tech: 2, emerging: 3, fit_status: 5, preqin: 4 });
});

test('inflate matches zlib, including stored blocks after a sync flush (the 26 Nov bug)', () => {
  for (let t = 0; t < 60; t++) {
    const b = Buffer.alloc(1 + ((t * 977) % 9000)); for (let i = 0; i < b.length; i++) b[i] = t % 2 ? (i * 31 + t) & 255 : 97 + ((i + t) % 7);
    const half = b.length >> 1;
    const c = zlib.deflateRawSync(b.subarray(0, half), { level: t % 10, finishFlush: zlib.constants.Z_SYNC_FLUSH });
    const full = zlib.deflateRawSync(b, { level: t % 10 });
    assert.ok(Buffer.from(E.inflateRaw(full)).equals(b), 'full stream ' + t);
    // a sync-flushed prefix ends in an empty stored block; read it as a stream that then finishes
    const fin = Buffer.concat([c, Buffer.from([0x03, 0x00])]);
    assert.ok(Buffer.from(E.inflateRaw(fin)).equals(b.subarray(0, half)), 'sync flush ' + t);
  }
});

test('the real 25 Nov workbook, when present: 351 allocators, every link, tiers as the file says', { skip: !existsSync('/tmp/claude-0/-home-user-taranis-console/c578c2fa-5d3b-500d-be33-e3e06526bc60/scratchpad/enrich/file.xlsm') && 'real file not on this machine' }, () => {
  const r = E.readEnriched(readFileSync('/tmp/claude-0/-home-user-taranis-console/c578c2fa-5d3b-500d-be33-e3e06526bc60/scratchpad/enrich/file.xlsm'));
  assert.equal(r.rows.length, 351);
  assert.equal(r.rows.filter(x => x.wi_id).length, 351);
  const c = {}; r.rows.forEach(x => { c[x.tier_label] = (c[x.tier_label] || 0) + 1; });
  assert.deepEqual(c, { Strong: 67, Tech: 113, 'Emerging Managers': 98, Opportunities: 73 });
});
