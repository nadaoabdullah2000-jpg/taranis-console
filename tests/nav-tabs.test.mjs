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

test('iConnections, its Approved sub-tab and Preqin open their own empty panels', { skip: !chromium && 'Playwright not available' }, async () => {
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
      && at('preqin') === at('oppsiconn') + 1 && at('rejected') === at('preqin') + 1,
      'iConnections, then Preqin sit under Opportunities (no iConnections Approved sub-tab): ' + order.join(','));
    assert.equal(at('iconn'), -1, 'the export matcher stays out of the nav');
    assert.equal(await p.evaluate(() => typeof RENDER.iconn), 'function', 'the export matcher is still registered');

    const pad = await p.evaluate(() => Object.fromEntries(['oppsiconn', 'preqin'].map(id =>
      [id, document.querySelector('.navbtn[data-tab="' + id + '"]').style.paddingLeft])));
    assert.deepEqual(pad, { oppsiconn: '42px', preqin: '42px' });

    for (const [id, title, line] of [
      ['oppsiconn', 'iConnections', 'iConnections allocators will be listed here.'],
      ['preqin', 'Preqin', 'Preqin investors will be listed here.']]) {
      await p.click('.navbtn[data-tab="' + id + '"]');
      await p.waitForFunction(t => document.getElementById('pg-title').textContent === t
        && document.querySelector('#pg-body .empty'), title);
      const got = await p.evaluate(() => ({
        current, line: document.querySelector('#pg-body .empty p').textContent,
        on: [...document.querySelectorAll('.navbtn[aria-current="page"]')].map(b => b.getAttribute('data-tab'))
      }));
      assert.deepEqual(got, { current: id, line, on: [id] });
    }
    assert.deepEqual(errs, []);
  } finally {
    await browser.close();
    server.close();
  }
});
