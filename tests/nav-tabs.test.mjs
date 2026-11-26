/* Run with: npm test
   Placeholder tabs (17 Nov 2026), in a real browser on demo data:
   - Opportunities > iConnections > Approved and Preqin are in the nav, in that order and at those depths;
   - each opens its own empty panel and marks itself as the current tab;
   - the hidden iConnections export matcher ('iconn') is still registered and still kept out of the nav.
   Skipped when Playwright's browser is not available. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = fileURLToPath(new URL('..', import.meta.url));
const require = createRequire(import.meta.url);
let chromium = null;
try { ({ chromium } = require('playwright')); } catch (_) { chromium = null; }

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };
function serve() {
  const server = createServer(async (req, res) => {
    try {
      const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([/\\])+/, '');
      const file = join(root, path || 'index.html');
      if (!file.startsWith(root)) { res.writeHead(403); return res.end(); }
      const body = await readFile(file);
      res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
      res.end(body);
    } catch (_) { res.writeHead(404); res.end(); }
  });
  return new Promise(ok => server.listen(0, '127.0.0.1', () => ok(server)));
}

test('Allocators tiers, purple iConnections cards with ticks, Preqin source cards; Opportunities keeps its colours', { skip: !chromium && 'Playwright not available' }, async () => {
  const server = await serve();
  const browser = await chromium.launch();
  try {
    const p = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto('http://127.0.0.1:' + server.address().port + '/index.html');
    await p.click('#gate-demo');
    await p.waitForFunction(() => typeof go === 'function' && document.querySelector('.navbtn[data-tab="opps"]'));

    const order = await p.evaluate(() => [...document.querySelectorAll('.navbtn')].map(b => b.getAttribute('data-tab')));
    const at = id => order.indexOf(id);
    assert.ok(at('opps') >= 0 && at('oppsiconn') > at('approvals') && at('oppsiconnok') === -1
      && at('preqin') === at('oppsiconn') + 1 && at('allocators') === at('preqin') + 1 && at('rejected') === at('allocators') + 1,
      'iConnections, Preqin under Opportunities, then Allocators, then Rejected: ' + order.join(','));
    assert.equal(at('iconn'), -1, 'the export matcher stays out of the nav');
    assert.equal(await p.evaluate(() => typeof RENDER.iconn), 'function', 'the export matcher is still registered');

    const pad = await p.evaluate(() => Object.fromEntries(['oppsiconn', 'preqin'].map(id =>
      [id, document.querySelector('.navbtn[data-tab="' + id + '"]').style.paddingLeft])));
    assert.deepEqual(pad, { oppsiconn: '42px', preqin: '42px' });

    // 26 Nov 2026: Allocators in four tiers, in order, each card with the four sub-cards.
    await p.click('.navbtn[data-tab="allocators"]');
    await p.waitForFunction(() => current === 'allocators' && document.querySelector('#pg-body .alc-card'));
    const al = await p.evaluate(() => ({
      tiers: [...document.querySelectorAll('#pg-body .alc-tierh .alc-tier')].map(x => x.textContent),
      names: [...document.querySelectorAll('#pg-body .alc-card .alc-name')].map(x => x.textContent),
      subs: [...document.querySelectorAll('#pg-body .alc-card')][0].querySelectorAll('.alc-sub-h').length,
      subTitles: [...[...document.querySelectorAll('#pg-body .alc-card')][0].querySelectorAll('.alc-sub-h')].map(x => x.textContent),
      mail: !!document.querySelector('#pg-body .alc-card a[href^="mailto:"]'),
      linkedin: !!document.querySelector('#pg-body .alc-card a[href*="linkedin.com"][target="_blank"]'),
      inlineUrl: !!document.querySelector('#pg-body .alc-card .alc-text a[href="https://example.com/source"]'),
      noContact: [...document.querySelectorAll('#pg-body .alc-card')].some(c => /No contact named in the alert/.test(c.textContent)),
      fit: document.querySelector('#pg-body .alc-card .alc-fit').textContent,
      date: /2026-11-12/.test(document.querySelector('#pg-body .alc-card').textContent),
      reviewBox: !!document.querySelector('#pg-body .alc-reviewbox'),
      strongColor: getComputedStyle(document.querySelector('#pg-body .alc-tier.t1')).backgroundColor
    }));
    assert.deepEqual(al.tiers, ['Strong', 'Tech', 'Emerging Managers', 'Opportunities']);
    assert.deepEqual(al.names, ['Sample Endowment Fund', 'Sample Family Office', 'Sample Pension Plan', 'Sample Wealth Manager']);
    assert.deepEqual(al.subTitles, ['Summary', 'Intentions', 'Contact persons', 'Other details']);
    assert.ok(al.mail && al.linkedin && al.inlineUrl && al.noContact && al.date && al.reviewBox);
    assert.equal(al.fit, '95%');
    assert.notEqual(al.strongColor, 'rgba(0, 0, 0, 0)');

    // iConnections: purple cards, white text, ticks.
    await p.click('.navbtn[data-tab="oppsiconn"]');
    await p.waitForFunction(() => current === 'oppsiconn' && document.querySelector('#pg-body .icn-card'));
    const ic = await p.evaluate(() => {
      const cards = [...document.querySelectorAll('#pg-body .icn-card')];
      return { n: cards.length, color: getComputedStyle(cards[0]).color, bg: getComputedStyle(cards[0]).backgroundColor,
        ticksFirst: [...cards[0].querySelectorAll('.icn-check')].map(c => c.className),
        ticksSecond: [...cards[1].querySelectorAll('.icn-check')].map(c => c.className),
        tags: [...cards[0].querySelectorAll('.icn-tag')].map(t => t.textContent) };
    });
    assert.equal(ic.n, 2, 'only allocators with an iConnections profile');
    assert.equal(ic.color, 'rgb(255, 255, 255)');
    assert.notEqual(ic.bg, 'rgba(0, 0, 0, 0)');
    assert.deepEqual(ic.ticksFirst, ['icn-check on', 'icn-check on']);
    assert.deepEqual(ic.ticksSecond, ['icn-check off', 'icn-check off']);
    assert.deepEqual(ic.tags, ['Strong', 'Tech', 'Emerging Managers']);

    // Preqin keeps its source cards (25 Nov).
    await p.click('.navbtn[data-tab="preqin"]');
    await p.waitForFunction(() => current === 'preqin' && document.querySelector('#pg-body .mcard.v-preqin'));
    assert.equal(await p.evaluate(() => document.querySelectorAll('#pg-body .mcard.v-preqin').length), 2);
    // The Opportunities card (no variant) keeps its own colours and has no source badge.
    const opp = await p.evaluate(() => {
      const c = matchCard({ id: 1, investor_name: 'Sample', qualification: 'uncertain', strategies: '["equity_long_short"]',
                            ticket_max_usd: 200000 }, { noComments: true });
      return { cls: c.className, badge: !!c.querySelector('.mcard-src'), intel: c.querySelector('.mcard-intel') ? c.querySelector('.mcard-intel').innerText : '' };
    });
    assert.equal(opp.cls, 'mcard signal', 'Opportunities cards keep their own colours');
    assert.equal(opp.badge, false);
    assert.match(opp.intel, /Next step/);
    assert.deepEqual(errs, []);
  } finally {
    await browser.close();
    server.close();
  }
});
