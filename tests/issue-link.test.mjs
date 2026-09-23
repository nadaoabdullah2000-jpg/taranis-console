/* Run with: npm test
   "Issue the link" on a meeting that is in the diary without a link (booked
   while the meeting service was down, or from Telegram). The meeting created
   for it must land on THAT row, not on a new one beside it. Runs the real
   create-meeting handler; see helpers/edge-harness.mjs. */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { call, reset, state, failZoom } from './helpers/edge-harness.mjs';

beforeEach(reset);

const PENDING = { id: 'pending-1', title: 'Cap Intro', start_utc: '2026-09-23T09:00:00.000Z',
  duration_min: 30, tz: 'Africa/Cairo', to_people: [{ email: 'guest@example.com' }],
  provider: 'zoom', status: 'pending', meet_url: null, fireflies: false };

// What the app's "Issue the link" button sends.
const issue = (extra = {}) => call({ meeting_id: PENDING.id, provider: PENDING.provider,
  title: PENDING.title, start_utc: PENDING.start_utc, duration_min: PENDING.duration_min,
  tz: PENDING.tz, to_people: PENDING.to_people, ...extra });

const rows = () => state().db.crm_meetings;

test('Issue the link updates the pending row instead of adding a new one', async () => {
  rows().push({ ...PENDING });
  const r = await issue();
  assert.equal(r.ok, true);
  assert.equal(r.meeting_id, PENDING.id);
  assert.equal(rows().length, 1, 'still one row');
  const row = rows()[0];
  assert.equal(row.status, 'scheduled');
  assert.equal(row.meet_url, 'https://zoom.us/j/123');
  assert.equal(row.passcode, 'pw');
  assert.equal(row.event_id, '123');
  assert.ok(row.invitation_body.includes('https://zoom.us/j/123'));
  assert.ok(!state().writes.some((w) => w.op === 'insert'), 'nothing inserted');
  // The invitation went to the people on the row, as before.
  assert.deepEqual(state().mail[0].to, ['guest@example.com']);
});

test('Issue the link with Fireflies ticked flags the same row', async () => {
  rows().push({ ...PENDING });
  const r = await issue({ add_fireflies: true });
  assert.equal(r.fireflies, 'on');
  assert.equal(rows().length, 1);
  assert.equal(rows()[0].fireflies, true);
});

test('Issue the link when the platform refuses: the pending row stays, no duplicate', async () => {
  rows().push({ ...PENDING });
  failZoom();
  const r = await issue();
  assert.equal(r.ok, false);
  assert.equal(r.meeting_id, PENDING.id);
  assert.match(r.message, /Zoom is down/);
  assert.equal(rows().length, 1);
  assert.equal(rows()[0].status, 'pending');
});

test('a new booking still adds a row, and a failed one still saves a pending row', async () => {
  const booking = { provider: 'zoom', title: 'New', start_utc: '2026-09-23T09:00:00.000Z',
    duration_min: 30, tz: 'Africa/Cairo', to_people: [], send_invitations: false };
  const ok = await call(booking);
  assert.equal(rows().length, 1);
  assert.equal(rows()[0].id, ok.meeting_id);
  assert.equal(rows()[0].status, 'scheduled');
  failZoom();
  const bad = await call(booking);
  assert.equal(rows().length, 2);
  assert.equal(rows().find((x) => x.id === bad.meeting_id).status, 'pending');
});
