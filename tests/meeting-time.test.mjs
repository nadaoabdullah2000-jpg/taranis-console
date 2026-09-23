/* Run with: node --test tests/
   Covers the path from "12:00 on the form, in zone X" to the start_time and
   timezone the create-meeting Edge Function sends to Zoom. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import * as edge from '../supabase/functions/create-meeting/zoom-time.js';

const require = createRequire(import.meta.url);
const app = require('../meeting-time.js');

/* What Zoom does with the fields: a start_time with no Z is the wall clock in
   `timezone`. Turning that back into an instant must give the one booked. */
const zoomReads = ({ start_time, timezone }) =>
  start_time.endsWith('Z') ? new Date(start_time).toISOString() : app.zonedTimeToUtc(start_time, timezone);

const CASES = [
  { name: '12:00 PM Cairo (summer, UTC+3)', local: '2026-09-23T12:00', tz: 'Africa/Cairo', utc: '2026-09-23T09:00:00.000Z' },
  { name: '12:00 PM Cairo (winter, UTC+2)', local: '2026-12-01T12:00', tz: 'Africa/Cairo', utc: '2026-12-01T10:00:00.000Z' },
  { name: '12:00 PM New York (EDT, UTC-4)', local: '2026-09-23T12:00', tz: 'America/New_York', utc: '2026-09-23T16:00:00.000Z' },
  { name: '12:00 PM New York (EST, UTC-5)', local: '2026-01-15T12:00', tz: 'America/New_York', utc: '2026-01-15T17:00:00.000Z' },
  { name: '12:00 PM UTC', local: '2026-09-23T12:00', tz: 'UTC', utc: '2026-09-23T12:00:00.000Z' },
  { name: '12:00 PM London, day the clocks go back', local: '2026-10-25T12:00', tz: 'Europe/London', utc: '2026-10-25T12:00:00.000Z' },
  { name: '09:30 AM Kolkata (UTC+5:30)', local: '2026-09-23T09:30', tz: 'Asia/Kolkata', utc: '2026-09-23T04:00:00.000Z' },
  { name: '12:00 PM Solomon Islands (Zoom id SST)', local: '2026-09-23T12:00', tz: 'SST', utc: '2026-09-23T01:00:00.000Z' }
];

for (const c of CASES) {
  test(c.name + ': form time becomes the right UTC instant', () => {
    assert.equal(app.zonedTimeToUtc(c.local, c.tz), c.utc);
  });

  test(c.name + ': Zoom is sent the picked wall clock and zone', () => {
    const f = edge.zoomStartFields(c.utc, c.tz);
    assert.deepEqual(f, { start_time: c.local + ':00', timezone: c.tz });
    // Never the toISOString() form Zoom misreads, never labelled as UTC.
    assert.match(f.start_time, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
    assert.equal(zoomReads(f), c.utc);
  });
}

test('regression: 12:00 Cairo no longer reaches Zoom as 09:00 Cairo', () => {
  const utc = app.zonedTimeToUtc('2026-09-23T12:00', 'Africa/Cairo');
  // What v11 of the function sent, and how Zoom read it (digits as Cairo time):
  const old = { start_time: new Date(utc).toISOString(), timezone: 'Africa/Cairo' };
  assert.equal(app.zonedTimeToUtc(old.start_time.slice(0, 16), old.timezone), '2026-09-23T06:00:00.000Z');
  // What is sent now:
  const now = edge.zoomStartFields(utc, 'Africa/Cairo');
  assert.equal(now.start_time, '2026-09-23T12:00:00');
  assert.equal(zoomReads(now), utc);
});

test('every Zoom time zone can be computed, and the browser and function agree on it', () => {
  const at = '2026-09-23T09:00:00.000Z';
  const ids = new Set();
  for (const [id, label] of app.ZOOM_TIMEZONES) {
    assert.ok(label, id + ' has a label');
    assert.ok(!ids.has(id), id + ' is listed once');
    ids.add(id);
    const local = edge.utcToZonedLocal(at, id);
    assert.match(local, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/, id);
    assert.equal(app.utcToZonedLocal(at, id), local, id);
    assert.equal(app.zonedTimeToUtc(local, id), at, id + ' round-trips');
  }
  assert.ok(ids.size > 130);
});

test('no Cairo default: the form starts on the device zone', () => {
  assert.equal(app.defaultTimezone('America/New_York'), 'America/New_York');
  assert.equal(app.defaultTimezone('Africa/Cairo'), 'Africa/Cairo');
  assert.equal(app.defaultTimezone('Europe/Kyiv'), 'Europe/Kiev');
  assert.equal(app.defaultTimezone('Asia/Ho_Chi_Minh'), 'Asia/Saigon');
  assert.equal(app.defaultTimezone(''), 'UTC');
  assert.equal(app.defaultTimezone('Not/AZone'), 'UTC');
  // A zone Zoom does not list falls back to one that keeps the same clock all year.
  const boise = app.defaultTimezone('America/Boise');
  assert.ok(app.isZoomTimezone(boise));
  assert.equal(app.utcOffsetLabel('2026-01-15T12:00:00Z', boise), 'UTC-07:00');
  assert.equal(app.utcOffsetLabel('2026-07-15T12:00:00Z', boise), 'UTC-06:00');
  assert.ok(app.isZoomTimezone(app.defaultTimezone()));
});

test('the meeting shows its time in its own zone', () => {
  const s = app.fmtInZone('2026-09-23T09:00:00.000Z', 'Africa/Cairo');
  assert.match(s, /^Wed,? 23 Sep\w* 2026,? 12:00 \(Africa\/Cairo, UTC\+03:00\)$/);
  assert.match(app.fmtInZone('2026-09-23T16:00:00.000Z', 'America/New_York'), / 12:00 \(America\/New_York, UTC-04:00\)$/);
  assert.equal(app.timezoneLabel('America/New_York', '2026-09-23T09:00:00.000Z'),
    '(UTC-04:00) Eastern Time (US and Canada) — America/New_York');
});

test('a Zoom booking at a different instant is reported', () => {
  assert.equal(edge.zoomBookedSameInstant('2026-09-23T09:00:00.000Z', '2026-09-23T09:00:00Z'), true);
  assert.equal(edge.zoomBookedSameInstant('2026-09-23T09:00:00.000Z', '2026-09-23T06:00:00Z'), false);
  assert.equal(edge.zoomBookedSameInstant('2026-09-23T09:00:00.000Z', undefined), true);
});
