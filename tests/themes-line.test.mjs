/* Run with: npm test
   With Intelligence "investment themes" lines (11 Nov 2026): a line naming a technology theme
   counts as technology; security & defence counts as Space. Same rule in WI 01. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const src = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const grab = (a, b) => src.slice(src.indexOf(a), src.indexOf(b, src.indexOf(a)));
const ctx = {};
vm.createContext(ctx);
vm.runInContext([grab('const RE_TECH =', '// Technology, as the score reads it.'),
  grab('const RE_SPACE', '\n'), 'this.isTech = isTech; this.RE_SPACE = RE_SPACE;'].join('\n'), ctx);
const wi01 = readFileSync(new URL('../n8n/wi01-apply-hard-criteria.js', import.meta.url), 'utf8');
const THEME_TECH = eval(wi01.match(/const THEME_TECH = (\/.*\/i);/)[1]);
const SPACE = eval(wi01.match(/const SPACE = (\/.*\/i);/)[1]);

const UTIMCO = "the investor's investment theme over the next 12-18 months includes artificial intelligence.";
const GTF = "the investor's primary investment themes over the next 12-18 months focus on healthcare and longevity, and security and defense.";
const MIX = "the investor's primary investment themes include energy transition, blockchain and digital infrastructure.";
const CAUTION = "consultant, aon, expressed caution over ai-driven investment themes and recommended diversifying away from equity-linked exposures.";

test('a themes line naming AI, blockchain or digital infrastructure is technology (app and WI 01)', () => {
  for (const t of [UTIMCO, MIX]) { assert.equal(ctx.isTech(t), true, t); assert.equal(THEME_TECH.test(t), true, t); }
});
test('healthcare and security & defence themes are not technology', () => {
  assert.equal(ctx.isTech(GTF), false); assert.equal(THEME_TECH.test(GTF), false);
});
test('a caution about AI-driven themes is not technology', () => {
  assert.equal(ctx.isTech(CAUTION), false); assert.equal(THEME_TECH.test(CAUTION), false);
});
test('AI outside a themes line still needs a tech word', () => {
  assert.equal(ctx.isTech('uses ai in its investment process.'), false);
});
test('security & defence is Space; cybersecurity is not', () => {
  for (const t of [GTF, 'themes include security & defence', 'security and defence']) { assert.equal(ctx.RE_SPACE.test(t), true, t); assert.equal(SPACE.test(t), true, t); }
  assert.equal(ctx.RE_SPACE.test('themes include cybersecurity and data'), false);
  assert.equal(SPACE.test('themes include cybersecurity and data'), false);
});
