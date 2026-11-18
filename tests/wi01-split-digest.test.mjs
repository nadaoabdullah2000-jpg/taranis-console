/* Run with: npm test
   WI 01 "Split Digest into Mandates" (n8n/wi01-split-digest.js) + "Deterministic Extraction"
   (n8n/wi01-deterministic-extraction.js), 18 Nov 2026: a digest writes its buttons as "View&nbsp;mandate";
   each item must end at its own buttons, so it never takes the next item's "View article" link
   (POBA row 3269 had taken Farro Capital's article). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const split = new Function('$input', readFileSync(new URL('../n8n/wi01-split-digest.js', import.meta.url), 'utf8'));
const det = new Function('$json', readFileSync(new URL('../n8n/wi01-deterministic-extraction.js', import.meta.url), 'utf8'));
const pad = ' Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.';
const btn = (label, url) => `<a href="${url}"><span>${label}</span></a>`;
const html = '<html><body>'
  + `<p><a href="https://x.test/mandate/1">Mandate has been added - Alpha Pension (AP)</a></p><p>Asset class: Hedge Funds | Region: Asia${pad}</p>`
  + `<p>${btn('View&nbsp;mandate', 'https://x.test/mandate/1')} ${btn('View&nbsp;investor', 'https://x.test/investor/1')}</p>`
  + `<p><a href="https://x.test/article/2">Beta Capital keen on logistics and student housing</a></p><p>Asset class: Real Estate Equity${pad}</p>`
  + `<p>${btn('View article', 'https://x.test/article/2')}</p>`
  + '</body></html>';
const run = () => split({ all: () => [{ json: { body_html: html, message_id: 'm', id: 1, subject: 's', received_at: 'r' } }] })
  .map(b => { const r = det(b.json); return (Array.isArray(r) ? r[0] : r).json || r; });

test('each digest item ends at its own buttons, also when they are written "View&nbsp;..."', () => {
  const out = run();
  assert.equal(out.length, 2);
  assert.match(out[0].det_headline, /Alpha Pension/);
  assert.equal(out[0].det_view_article_url, null, 'the mandate item has no article of its own');
  assert.equal(out[0].det_view_investor_url, 'https://x.test/investor/1');
  assert.match(out[1].det_headline, /Beta Capital/);
  assert.equal(out[1].det_view_article_url, 'https://x.test/article/2');
});
