/* Run with: npm test
   The technology signal (isTech in app.js) reads whole words of interest in
   tech, not substrings or names. Cases are taken from stored mandates. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const src = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const start = src.indexOf('const RE_TECH = ');
const end = src.indexOf('\n}\n', src.indexOf('function isTech', start)) + 3;
const ctx = {};
vm.createContext(ctx);
vm.runInContext(src.slice(start, end) + '\nthis.isTech = isTech;', ctx);
const isTech = (s) => ctx.isTech(s.toLowerCase());

test('genuine technology interest counts', () => {
  for (const s of [
    'High appetite for technology investments.',
    'Interested in AI and the broader technology ecosystem within public markets',
    'Looking for innovative startups in tech.',
    'Primary investment themes include energy transition and financial technology.',
    'noting biotech, consumer and fintech as other areas of interest',
    'looking to diversify portfolio with emerging technologies.',
    'high appetite for tech-focused investments',
    '["health_tech", "cybersecurity"]',
    'industries of interest includes technology'
  ]) assert.equal(isTech(s), true, s);
});

test('substrings, names and turned-away tech do not count', () => {
  for (const s of [
    'managers that apply quantitative techniques',
    '"strategy": "market neutral biotech"',
    'Volunteer Firefighter, Emergency Medical Technician and Search & Rescue Pension Plan',
    'RTX Corporation (formerly Raytheon Technologies Corporation)',
    'after moving from Mcube Investment Technologies as the director',
    'Pension Fund of Japan Electronics Information Technology Industry',
    'Virginia Tech Foundation picks permanent CIO',
    'Looking to avoid funds that are overly exposed to software and technology.',
    'wants funds low on software/tech.',
    'the family office is excluding AI, cryptocurrency and fintech-focused opportunities',
    'staying away from more technically sensitive strategies',
    '["cybersecurity_biotechnology"]'
  ]) assert.equal(isTech(s), false, s);
});
