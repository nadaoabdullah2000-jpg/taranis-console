/* Run with: npm test
   The in-browser .xlsx reader behind "Match an iConnections export". It must
   land on the data sheet, read every cell type an export uses, and stop with
   a clear message on anything it does not understand: never drop or guess
   at rows. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { xlsx, zip } from './helpers/xlsx-build.mjs';

const require = createRequire(import.meta.url);
const R = require('../iconnections.js');

const COVER = { name: 'Read me', rows: [
  ['iConnections export'], ['Generated for Taranis'], ['Firm Name', 'is in the next sheet']] };
const DATA = { name: 'Allocators', rows: [
  ['Firm Name', 'Website', 'AUM (USD)', 'Investor Type', 'HQ Country', 'Contact Email'],
  ['Abu Dhabi Investment Authority (ADIA)', 'https://www.adia.ae/en', '> $50bn', 'Sovereign Wealth Fund', 'United Arab Emirates', 'x@adia.ae'],
  [{ inline: 'Carnegie Mellon University' }, 'cmu.edu', '1,500,000,000', 'Endowment', 'United States', null],
  [{ rich: ['Cresset ', 'Capital'] }, null, '$1bn - $2.5bn', 'Multi-Family Office', 'USA', null],
  [null, 'orphan.com', '$5bn', 'Pension', 'UK', null],
  ['Wellcome Trust', 'wellcome.org', { t: 'e', v: '#N/A' }, 'Foundation', 'UK', null],
  ['Number Firm', null, 2500000000, 'Family Office', 'Switzerland', null],
  ['Odd AUM Firm', null, '22% YoY', 'Family Office', 'Atlantis', null]] };

async function book(sheets, opts) { return R.readWorkbook(xlsx(sheets, opts)); }

test('passes over a cover sheet and reads the data sheet', async () => {
  const sheets = await book([COVER, DATA]);
  assert.deepEqual(sheets.map(s => s.name), ['Read me', 'Allocators']);
  const pick = R.chooseSheet(sheets);
  assert.equal(pick.sheet.name, 'Allocators');
  assert.equal(pick.headerIndex, 0);
  assert.deepEqual(pick.cols, { name: 0, domain: 1, aum: 2, type: 3, country: 4 });
});

test('reads shared, inline and rich strings, numbers and error cells', async () => {
  const [, s] = await book([COVER, DATA]);
  assert.equal(s.rows[1].cells[0], 'Abu Dhabi Investment Authority (ADIA)');
  assert.equal(s.rows[2].cells[0], 'Carnegie Mellon University');
  assert.equal(s.rows[3].cells[0], 'Cresset Capital', 'rich text joined, phonetic run left out');
  assert.equal(s.rows[6].cells[2], 2500000000);
  assert.deepEqual(s.errors, [{ where: 'Allocators!C6', value: '#N/A' }]);
});

test('builds rows: numbers stored as text, AUM bands, countries, domains', async () => {
  const sheets = await book([COVER, DATA]);
  const pick = R.chooseSheet(sheets);
  const out = R.buildRows(pick.sheet, pick.headerIndex, pick.cols);
  const by = Object.fromEntries(out.rows.map(r => [r.name, r]));
  assert.equal(out.rows.length, 6);
  assert.deepEqual(out.unnamed, [5], 'the row with no name is reported, not silently dropped');
  const adia = by['Abu Dhabi Investment Authority (ADIA)'];
  assert.equal(adia.row_no, 2);
  assert.equal(adia.domain, 'adia.ae');
  assert.equal(adia.aum_low, 50e9); assert.equal(adia.aum_high, null);
  assert.equal(adia.country, 'AE');
  assert.equal(adia.investor_type, 'Sovereign Wealth Fund');
  assert.ok(!('Contact Email' in adia.raw), 'only mapped columns are kept');
  assert.equal(by['Carnegie Mellon University'].aum_low, 1.5e9, 'number stored as text');
  assert.equal(by['Carnegie Mellon University'].country, 'US');
  assert.deepEqual([by['Cresset Capital'].aum_low, by['Cresset Capital'].aum_high], [1e9, 2.5e9]);
  assert.equal(by['Cresset Capital'].country, 'US');
  assert.equal(by['Wellcome Trust'].aum_low, null);
  assert.equal(by['Wellcome Trust'].country, 'GB');
  assert.equal(by['Number Firm'].aum_low, 2.5e9);
  assert.deepEqual(out.aumUnread, [{ row: 8, value: '22% YoY' }]);
  assert.deepEqual(out.countryUnread, [{ row: 8, value: 'Atlantis' }]);
});

test('a legacy .xls (or password-protected file) is refused by name', async () => {
  const ole = new Uint8Array([0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1, 0, 0, 0, 0]);
  await assert.rejects(R.readWorkbook(ole), (e) => e instanceof R.ReadError && /\.xls\b/.test(e.message));
});

test('a file that is not a workbook is refused', async () => {
  await assert.rejects(R.readWorkbook(new TextEncoder().encode('name,aum\nADIA,1')), /not an \.xlsx/);
  await assert.rejects(R.readWorkbook(zip({ 'hello.txt': 'hi' })), /not an Excel workbook/);
  await assert.rejects(R.readWorkbook(zip({ 'xl/workbook.bin': 'x' })), /\.xlsb/);
});

test('an unknown cell type stops the import and names the cell', async () => {
  const bad = { name: 'Data', rows: [['Firm Name', 'AUM'], ['A', { t: 'zz', v: '?' }]] };
  await assert.rejects(book([bad]), (e) => e instanceof R.ReadError && /Data!B2/.test(e.message) && /"zz"/.test(e.message));
});

test('stored (uncompressed) zip entries read the same', async () => {
  const pick = R.chooseSheet(await book([DATA], { store: true }));
  assert.equal(pick.sheet.rows.length, 8);
});

test('header row below a title block is found', async () => {
  const s = { name: 'Export', rows: [['Allocator list, October'], [], ['Organization', 'URL', 'Assets Under Management', 'Category', 'Country/Region'], ['ADIA', 'adia.ae', '$900bn', 'SWF', 'UAE']] };
  const pick = R.chooseSheet(await book([s]));
  assert.equal(pick.headerIndex, 1, 'blank rows are not kept, so the header is the second stored row');
  assert.deepEqual(pick.cols, { name: 0, domain: 1, aum: 2, type: 3, country: 4 });
  const out = R.buildRows(pick.sheet, pick.headerIndex, pick.cols);
  assert.equal(out.rows[0].row_no, 3 + 1, 'row numbers are the sheet\'s own');
  assert.equal(out.rows[0].country, 'AE');
});

test('no recognisable allocator column: chooseSheet asks instead of guessing', async () => {
  const s = { name: 'Data', rows: [['Col A', 'Col B'], ['ADIA', '1']] };
  const pick = R.chooseSheet(await book([s]));
  assert.equal(pick.sheet, null);
  assert.equal(pick.candidates[0].dataRows, 1);
  assert.throws(() => R.buildRows({ name: 'Data', rows: [] }, 0, {}), /allocator name/);
});

test('more than 5,000 rows is refused, not truncated', async () => {
  const rows = [['Firm Name']];
  for (let i = 0; i < 5001; i++) rows.push(['Firm ' + i]);
  const pick = R.chooseSheet(await book([{ name: 'Big', rows }]));
  assert.throws(() => R.buildRows(pick.sheet, pick.headerIndex, pick.cols), /5,001 rows.*5,000/);
});

test('header synonyms, and a person name column is not taken for the firm', () => {
  assert.deepEqual(R.detectColumns(['First Name', 'Last Name', 'Name', 'Company', 'LinkedIn URL', 'Email']), { name: 3 });
  assert.deepEqual(R.detectColumns(['  FIRM_NAME ', 'Firm Website', 'Total AUM ($mm)', 'Investor Type', 'HQ Location']),
    { name: 0, domain: 1, aum: 2, type: 3, country: 4 });
  assert.deepEqual(R.detectColumns(['Allocator', 'Domain', 'AUM Range', 'Allocator Type', 'Domicile']),
    { name: 0, domain: 1, aum: 2, type: 3, country: 4 });
});

test('AUM: bands, open ranges, header units, and what is not an amount', () => {
  const c = (v, h) => { const a = R.parseAum(v, h); return [a.low, a.high, a.ok]; };
  assert.deepEqual(c('$1bn - $2.5bn'), [1e9, 2.5e9, true]);
  assert.deepEqual(c('> $50bn'), [50e9, null, true]);
  assert.deepEqual(c('$100m–$500m'), [1e8, 5e8, true]);
  assert.deepEqual(c('USD 100m-500m'), [1e8, 5e8, true]);
  assert.deepEqual(c('$20-100m'), [2e7, 1e8, true]);
  assert.deepEqual(c('at least $500m'), [5e8, null, true]);
  assert.deepEqual(c('under $200m'), [0, 2e8, true]);
  assert.deepEqual(c('< $30m'), [0, 3e7, true]);
  assert.deepEqual(c('Circa. $643m'), [6.43e8, 6.43e8, true]);
  assert.deepEqual(c('$6.4 billion'), [6.4e9, 6.4e9, true]);
  assert.deepEqual(c('1,500,000,000'), [1.5e9, 1.5e9, true]);
  assert.deepEqual(c('1500', 'AUM ($M)'), [1.5e9, 1.5e9, true]);
  assert.deepEqual(c(2.5, 'AUM (USD bn)'), [2.5e9, 2.5e9, true]);
  assert.deepEqual(c(750, 'Total AUM ($mm)'), [7.5e8, 7.5e8, true]);
  assert.deepEqual(c('Undisclosed'), [null, null, true]);
  assert.deepEqual(c('22% YoY'), [null, null, false]);
  assert.deepEqual(c('$60n'), [null, null, false]);
});

test('domains and countries', () => {
  assert.equal(R.parseDomain('https://www.adia.ae/en?x=1'), 'adia.ae');
  assert.equal(R.parseDomain('jane@cmu.edu'), 'cmu.edu');
  assert.equal(R.parseDomain('n/a'), null);
  assert.equal(R.parseCountry('UK'), 'GB');
  assert.equal(R.parseCountry('United States of America'), 'US');
  assert.equal(R.parseCountry('New York, United States'), 'US');
  assert.equal(R.parseCountry('CHE'), 'CH');
  assert.equal(R.parseCountry('Hong Kong SAR'), 'HK');
  assert.equal(R.parseCountry('ch'), 'CH');
  assert.equal(R.parseCountry('NY'), null);
});

test('file fingerprint is the SHA-256 of the bytes', async () => {
  assert.equal(await R.sha256Hex(new TextEncoder().encode('abc')),
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});
