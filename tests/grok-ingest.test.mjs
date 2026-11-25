/* Run with: npm test
   "Grok Ingest -> Web App" (n8n, 25 Nov 2026): Parse Request and Normalize Rows. The database side
   (grok_fn.ingest, schema-31) is tested live with dry runs; these cover what reaches it. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const IR = require('../iconnections.js');
const normCode = readFileSync(new URL('../n8n/grok-ingest-normalize.js', import.meta.url), 'utf8');
const parseCode = readFileSync(new URL('../n8n/grok-ingest-parse.js', import.meta.url), 'utf8');

const normalizeRaw = (req, items = []) => new Function('$', '$input', normCode)(
  (n) => { assert.equal(n, 'Parse Request'); return { first: () => ({ json: req }) }; },
  { all: () => items.map(json => ({ json })) })[0].json;
const normalize = (req, items) => { const j = normalizeRaw(req, items); return j.params ? { ...j, rows: JSON.parse(j.params[1]) } : j; };
const AsyncFn = Object.getPrototypeOf(async function () {}).constructor;
const parse = (body) => new AsyncFn('$input', parseCode).call(
  { helpers: { prepareBinaryData: async (buf, name, mime) => ({ fileName: name, mimeType: mime, bytes: buf.length }) } },
  { first: () => ({ json: { body } }) }).then(r => r[0]);

test('Excel headers in many spellings map to the target fields; AUM text becomes full dollars low/high', () => {
  const out = normalize({ source: 'preqin', has_file: true }, [
    { 'Firm Name': 'Alpha Pension Fund', 'Website': 'https://www.alphapension.org/en', 'AUM (USD mn)': 1250, 'Investor Type': 'Public Pension Fund',
      'HQ Country': 'United Kingdom', 'City': 'London', 'Contacts': 'Jane Doe; John Roe', 'Email': 'jane@alphapension.org; john@gmail.com' },
    { 'Firm Name': 'Beta Family Office', 'AUM (USD mn)': '', 'Strategies': 'Long/Short Equity, Quant', 'HQ Country': 'New York, NY' }
  ]);
  assert.equal(out.rows.length, 2);
  const a = out.rows[0];
  assert.equal(a.name, 'Alpha Pension Fund');
  assert.equal(a.domain, 'alphapension.org');
  assert.equal(a.aum_low, 1250e6); assert.equal(a.aum_high, 1250e6); assert.equal(a.aum_usd, 1250e6);
  assert.equal(a.country, 'GB');
  assert.deepEqual(a.people, ['Jane Doe', 'John Roe']);
  assert.deepEqual(a.email_domains, ['alphapension.org'], 'a free mail domain is never a firm domain');
  assert.equal(out.rows[1].country, 'US');
  assert.deepEqual(out.rows[1].strategies, ['Long/Short Equity', 'Quant']);
  assert.equal(out.columns.name, 'Firm Name');
  assert.equal(out.params[0], 'preqin'); assert.equal(out.params[5], '', 'no plan_id on a dry run');
});

test('a range stays a range (no single AUM); an amount with no unit under 100,000 is flagged, not guessed', () => {
  const out = normalize({ source: 'iconnections', has_file: false, rows: [
    { name: 'Gamma Capital', aum: '$5-10bn' }, { name: 'Delta Partners', aum: 250 }, { name: 'Eps', aum: 'about a lot' }] });
  const [g, d, e] = out.rows;
  assert.equal(g.aum_low, 5e9); assert.equal(g.aum_high, 10e9); assert.equal(g.aum_usd, undefined);
  assert.equal(d.aum_low, undefined); assert.equal(d.aum_text, '250');
  assert.ok(out.problems.some(p => p.name === 'Delta Partners' && /millions or dollars/.test(p.reason)));
  assert.ok(out.problems.some(p => p.name === 'Eps' && /not read/.test(p.reason)));
  assert.equal(e.aum_text, 'about a lot');
});

test('the same rules as the console iConnections reader (AUM, country, domain)', () => {
  for (const [v, h] of [['$1bn - $2.5bn', 'AUM'], ['> $50bn', 'AUM'], [1500, 'AUM ($M)'], ['500 - 1bn', 'AUM'], ['c. 300m', 'AUM']]) {
    const out = normalize({ source: 'preqin', has_file: false, rows: [{ name: 'X', [h]: v }] }).rows[0];
    const ir = IR.parseAum(v, h);
    assert.equal(out.aum_low ?? null, ir.low, `${v} low`); assert.equal(out.aum_high ?? null, ir.high, `${v} high`);
  }
  for (const c of ['United States', 'UK', 'Hong Kong SAR', 'New York, United States', 'Boston, MA', 'CHE', 'Germany', 'Narnia']) {
    const out = normalize({ source: 'preqin', has_file: false, rows: [{ name: 'X', country: c }] }).rows[0];
    assert.equal(out.country ?? null, IR.parseCountry(c), c);
  }
});

test('JSON rows with the target keys pass through; tickets in full dollars; min above max is dropped', () => {
  const out = normalize({ source: 'opportunities', has_file: false, rows: [
    { name: 'Zeta Endowment', wi_url: 'https://platform.withintelligence.com/explore/investors/12345', ticket_min_usd: 5000000, ticket_max_usd: 25000000,
      open_to_emerging_managers: 'Yes', emerging_evidence: 'Allocates to emerging hedge fund managers.' },
    { name: 'Eta Trust', ticket_min_usd: 50000000, ticket_max_usd: 10000000 }] });
  const [z, e] = out.rows;
  assert.equal(z.wi_id, '12345');
  assert.equal(z.ticket_min_usd, 5e6); assert.equal(z.ticket_max_usd, 25e6);
  assert.equal(z.open_to_emerging_managers, true);
  assert.equal(e.ticket_min_usd, undefined);
  assert.ok(out.problems.some(p => p.name === 'Eta Trust'));
});

test('rows with no firm name are not sent; an upload with none is refused', () => {
  const out = normalize({ source: 'preqin', has_file: false, rows: [{ name: '', aum: '1bn' }, { 'First Name': 'A' }] });
  assert.equal(out.route, 'error');
  assert.equal(out.code, 400);
});

test('Parse Request: source required, dry run by default, a real write needs the plan_id, the file must be an .xlsx', async () => {
  assert.match((await parse({ rows: [{ name: 'A' }] })).json.body.reason, /source/);
  const d = (await parse({ source: 'preqin', rows: [{ name: 'A' }] })).json;
  assert.equal(d.dry_run, true); assert.equal(d.has_file, false);
  assert.match((await parse({ source: 'preqin', rows: [{ name: 'A' }], dry_run: false })).json.body.reason, /plan_id/);
  assert.equal((await parse({ source: 'preqin', rows: [{ name: 'A' }], dry_run: false, plan_id: 'a'.repeat(32) })).json.dry_run, false);
  assert.match((await parse({ source: 'preqin', file_base64: Buffer.from('hello').toString('base64') })).json.body.reason, /xlsx/);
  const x = await parse({ source: 'preqin', file_base64: Buffer.concat([Buffer.from('PK'), Buffer.alloc(200)]).toString('base64'), file_name: 'p.xlsx' });
  assert.equal(x.json.has_file, true); assert.equal(x.binary.data.fileName, 'p.xlsx');
});

test('rows with different headers are each read with their own; "250" as text with no unit is flagged too', () => {
  const out = normalize({ source: 'preqin', has_file: false, rows: [
    { 'Firm Name': 'Alpha', 'AUM (USD mn)': 5000 }, { 'Firm Name': 'Beta', 'AUM': '250' }, { 'Firm Name': 'Gamma', 'AUM': '2.5bn' }] });
  const [a, b, g] = out.rows;
  assert.equal(a.aum_usd, 5e9);
  assert.equal(b.aum_usd, undefined); assert.ok(out.problems.some(p => p.name === 'Beta'));
  assert.equal(g.aum_usd, 2.5e9);
  assert.deepEqual(out.unmapped, []);
  assert.deepEqual(out.columns.aum, ['AUM (USD mn)', 'AUM']);
});
