/* Run with: npm test
   Navigation and scroll (11 Nov 2026), in a real browser on demo data (no investor data):
   - opening a record from Opportunities starts at the top of the record;
   - Back returns to the same place in the list, with the opened card on screen;
   - switching tabs starts at the top; re-drawing the same list keeps its place.
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

test('opening a card starts at the top; Back returns to the same place in the list', { skip: !chromium && 'Playwright not available' }, async () => {
  const server = await serve();
  const browser = await chromium.launch();
  try {
    const p = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto('http://127.0.0.1:' + server.address().port + '/index.html');
    await p.click('#gate-demo');
    // let the demo's own first load finish, so it cannot replace the rows injected below
    await p.waitForFunction(() => typeof go === 'function' && OPPS_ROWS && !OPPS_LOADING);
    await p.evaluate(() => {
      const rows = [];
      for (let i = 0; i < 40; i++) rows.push({ id: 9000 + i, investor_name: 'Demo investor ' + (i + 1), investor_country: 'US',
        investor_type: 'Endowment', asset_classes: ['Hedge Funds'], strategies: ['equity_long_short'], new_qualification: 'uncertain',
        qualification: 'uncertain', new_fit_score: 0.74 - i / 1000, intention_summary: 'Looking for long/short equity managers.',
        evidence: { wi_investor_id: String(i) } });
      OPPS_ROWS = rows; OPPS_AT = Date.now(); oppsMode = 'review'; oppsReuse = true; go('opps');
    });
    await p.waitForFunction(() => document.querySelectorAll('main .mcard').length === 40);
    const top = await p.evaluate(() => {
      const c = document.querySelector('main [data-mid="9024"]'); const m = document.querySelector('main');
      m.scrollTop = c.offsetTop - 100; return m.scrollTop;
    });
    assert.ok(top > 1000, 'the list is scrolled well down');

    // open card 25 from its own button
    await p.locator('main [data-mid="9024"] button', { hasText: 'View the mandate' }).click();
    await p.waitForFunction(() => current === 'mandate' && /Demo investor 25/.test(document.getElementById('pg-title').textContent));
    await p.waitForTimeout(300);
    assert.equal(await p.evaluate(() => document.querySelector('main').scrollTop), 0, 'the record opens at the top');

    // Back: same place, card 25 on screen
    await p.getByRole('button', { name: '\u2190 Back', exact: true }).first().click();
    try { await p.waitForFunction(() => current === 'opps' && document.querySelector('main [data-mid="9024"]'), null, { timeout: 8000 }); }
    catch (e) { console.log('DEBUG', JSON.stringify(await p.evaluate(() => ({ current, title: document.getElementById('pg-title').textContent,
      cards: document.querySelectorAll('main .mcard').length, ids: [...document.querySelectorAll('main [data-mid]')].slice(0, 5).map(x => x.getAttribute('data-mid')),
      rows: OPPS_ROWS ? OPPS_ROWS.length : null, mode: oppsMode, back: PROFILE_BACK }))), errs); throw e; }
    await p.waitForTimeout(300);
    const back = await p.evaluate(() => {
      const r = document.querySelector('main [data-mid="9024"]').getBoundingClientRect();
      return { top: document.querySelector('main').scrollTop, onScreen: r.top >= 0 && r.top < innerHeight };
    });
    assert.equal(back.top, top, 'Back restores the list position');
    assert.ok(back.onScreen, 'the card that was opened is on screen');

    // re-drawing the same list keeps its place
    await p.evaluate(() => redrawOpps());
    await p.waitForTimeout(500);
    assert.equal(await p.evaluate(() => document.querySelector('main').scrollTop), top, 'a redraw keeps the place');

    // switching tabs starts at the top
    await p.evaluate(() => go('rejected'));
    await p.waitForFunction(() => current === 'rejected');
    await p.waitForTimeout(500);
    assert.equal(await p.evaluate(() => document.querySelector('main').scrollTop), 0, 'a new tab starts at the top');
    assert.deepEqual(errs, []);
  } finally {
    await browser.close();
    server.close();
  }
});
