/* Run with: npm test
   WI 01, 20 Nov 2026 (prepared, not published):
   - "Normalize + Record Key" (n8n/wi01-normalize-record-key.js) gives every item an item_key, so "SQL Dedup Check"
     can skip a copy of an item that another email already brought in. A real update to the same record (a later
     alert date, or "Mandate has been updated" after "...has been added") must never share a copy's key.
   - "Deterministic Extraction" (n8n/wi01-deterministic-extraction.js): firm names out of news headlines. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const detCode = readFileSync(new URL('../n8n/wi01-deterministic-extraction.js', import.meta.url), 'utf8');
const normCode = readFileSync(new URL('../n8n/wi01-normalize-record-key.js', import.meta.url), 'utf8');
const applyCode = readFileSync(new URL('../n8n/wi01-apply-hard-criteria.js', import.meta.url), 'utf8');

const det = (json) => { const r = new Function('$json', detCode)(json); return (Array.isArray(r) ? r[0] : r).json; };
const norm = (ai, d) => new Function('$json', '$', normCode)({ output: ai },
  (n) => { assert.equal(n, 'Deterministic Extraction'); return { item: { json: d } }; }).json;

// A WI tracker link: the target, then a 4-character suffix that differs per email, then the recipient part.
const tracker = (target, suffix, rcpt) => `https://email.withintelligence-email.com/ls/click?upn=u001.${target}${suffix}_${rcpt}`;
const block = ({ head, intention, article, asset = 'Hedge Funds', extra = '' }) =>
  `<p><a href="${article || intention || 'https://x.test/h'}">${head}</a></p><p>Asset class: ${asset}${extra}</p>`
  + (intention ? `<a href="${intention}">View intention</a>` : '') + (article ? `<a href="${article}">View article</a>` : '');
const item = (b, msg, idx, date) => det({ raw_block: block(b), source_message_id: msg, block_index: idx, source_email_date: date + 'T13:00:00Z' });
const keyOf = (d, name = 'Alpha Pension') => { const r = norm({ investor_name: name }, d); return { item: r.item_key, record: r.record_key, ev: JSON.parse(r.evidence).item_key, name: r.investor_name }; };

test('the same With Intelligence item in two emails gets the same item_key (and a different record_key)', () => {
  const b = { head: 'Alpha Pension seeks long/short equity managers', intention: null, article: null };
  const a = keyOf(item({ ...b, intention: tracker('INTENTIONTARGET123456', 'aaaa', 'r1') }, '<m1>', 3, '2026-11-19'));
  const c = keyOf(item({ ...b, intention: tracker('INTENTIONTARGET123456', 'bbbb', 'r2') }, '<m2>', 0, '2026-11-19'));
  assert.equal(a.item, c.item);
  assert.match(a.item, /^L:[0-9a-f]{16}$/);
  assert.notEqual(a.record, c.record);
  assert.equal(a.ev, a.item, 'the key is stored in evidence.item_key');
});

test('a real update to the same record is never taken for a copy', () => {
  const link = (s) => tracker('MANDATETARGET98765432', s, 'r');
  const added = keyOf(item({ head: 'Mandate has been added - Alpha Pension (AP) The pension is searching', intention: link('aaaa') }, '<m1>', 0, '2026-11-12'));
  const later = keyOf(item({ head: 'Mandate has been added - Alpha Pension (AP) The pension is searching', intention: link('bbbb') }, '<m2>', 0, '2026-11-19'));
  const updated = keyOf(item({ head: 'Mandate has been updated - Alpha Pension (AP) The pension is searching', intention: link('cccc') }, '<m3>', 0, '2026-11-12'));
  assert.notEqual(added.item, later.item, 'a later alert date is a new item');
  assert.notEqual(added.item, updated.item, 'an update on the same day is a new item');
});

test('different items in one email never share a key (Mariner: 7 intentions, own links)', () => {
  const keys = new Set();
  for (let i = 0; i < 7; i++) keys.add(keyOf(item({ head: 'Considers emerging managers and new strategies from established firms', intention: tracker('MARINERINTENTION' + i + 'XXXX', 'aaaa', 'r') }, '<m1>', 9 + i, '2026-11-19'), 'Mariner Wealth Advisors (MWA)').item);
  assert.equal(keys.size, 7);
});

test('an item with no link is keyed by its own text: same text same key, different text different key', () => {
  const t = (asset, msg, idx) => keyOf(item({ head: 'Hammersmith & Fulham Pension Fund', asset }, msg, idx, '2026-11-19'), 'Hammersmith & Fulham Pension Fund').item;
  assert.equal(t('Equity', '<m1>', 19), t('Equity', '<m2>', 8));
  assert.notEqual(t('Equity', '<m1>', 19), t('Fixed Income', '<m1>', 19));
  assert.match(t('Equity', '<m1>', 19), /^T:[0-9a-f]{16}$/);
});

test('firm names out of news headlines (19 Nov examples)', () => {
  const name = (head) => det({ raw_block: block({ head }), source_email_date: '2026-11-19T13:00:00Z' }).det_investor_from_headline;
  assert.equal(name('DL Family Office plots shift into Euro corporate hybrids and Asia credit'), 'DL Family Office');
  assert.equal(name('Firethorn Wealth looking at affordable housing, multi-family real estate'), 'Firethorn Wealth');
  assert.equal(name('DAI Advisors tilting towards infra and digital assets'), 'DAI Advisors');
  assert.equal(name('Ballast Rock keen on PE aerospace, defense funds'), 'Ballast Rock');
  assert.equal(name("Swansea Pension Fund's"), 'Swansea Pension Fund');
  assert.equal(name("St James's Place taps bfinance for SAA head"), "St James's Place", 'an inner possessive stays');
  assert.equal(name('Global multi-family office seeks private credit strategies'), 'Global multi-family office', 'a description stays whole');
  assert.equal(name('Scout Investments plans hedge fund push'), 'Scout Investments', 'a capitalised name is never cut at a new verb');
  assert.equal(name('Keen Capital Partners hires new CIO for its fund programme'), 'Keen Capital Partners');
});

test('"Mandate has been updated - X" is read like "...has been added - X"', () => {
  const d = det({ raw_block: '<p>Profile alert</p><p>Mandate has been updated - Massachusetts Pension Reserves Investment Management Board (MassPRIM) The board approved a commitment.</p><p>Asset class: Hedge Funds</p>', source_email_date: '2026-11-19T13:00:00Z' });
  assert.equal(d.det_investor_from_headline, 'Massachusetts Pension Reserves Investment Management Board (MassPRIM)');
  const y = det({ raw_block: '<p>Mandate has been updated - Yellow Umbrella Mutual Aid Fund (YUMA) No additional updates were identified for this mandate.</p><p>Asset class: Hedge Funds</p>', source_email_date: '2026-11-19T13:00:00Z' });
  assert.equal(y.det_investor_from_headline, 'Yellow Umbrella Mutual Aid Fund (YUMA)');
});

test('a headline fragment never outranks the clean name of the same firm; a fuller real name still does', () => {
  const d = (head) => item({ head, intention: tracker('X1234567890', 'aaaa', 'r') }, '<m1>', 0, '2026-11-19');
  const frag = { ...d('DL Family Office shift'), det_investor_from_headline: 'DL Family Office plots' };
  assert.equal(norm({ investor_name: 'DL Family Office' }, frag).investor_name, 'DL Family Office');
  const full = { ...d('Mariner Wealth Advisors plans'), det_investor_from_headline: 'Mariner Wealth Advisors' };
  assert.equal(norm({ investor_name: 'Mariner Wealth Advisors (MWA)' }, full).investor_name, 'Mariner Wealth Advisors (MWA)');
});

test('the item key survives "Apply Taranis Hard Criteria" (it is kept in evidence)', () => {
  const m = { investor_name: 'Alpha Pension', strategies: '[]', asset_classes: '["hedge_funds"]', evidence: JSON.stringify({ item_key: 'L:0123456789abcdef', location: 'UK' }) };
  const out = new Function('$json', applyCode)(m).json;
  const ev = typeof out.evidence === 'string' ? JSON.parse(out.evidence) : out.evidence;
  assert.equal(ev.item_key, 'L:0123456789abcdef');
});
