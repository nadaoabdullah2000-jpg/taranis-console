/* Run with: npm test
   The "Add Fireflies notetaker" box, end to end through the real
   create-meeting handler (supabase/functions/create-meeting/index.ts), with
   Zoom, Google, Microsoft, the database and the mail server replaced by
   recorders. Checks who receives what when the box is ticked and when it
   is not. */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { firefliesPlan } from '../supabase/functions/create-meeting/fireflies.js';
import { call, env, reset, ORGANISER } from './helpers/edge-harness.mjs';

const FRED = 'fred@fireflies.ai';
const FF_CALENDAR = 'fireflies-calendar@example.com';

beforeEach(reset);

const BOOKING = { provider: 'zoom', title: 'Cap Intro', start_utc: '2026-09-23T09:00:00.000Z',
  duration_min: 30, tz: 'Africa/Cairo', to_people: [], send_invitations: false, language: 'en' };
const GUESTS = [{ email: 'guest@example.com' }];

const S = () => globalThis.__edge;
const ics = (m) => (m.mimeContent.find((c) => c.mimeType.startsWith('text/calendar')) || {}).content || '';
const toFred = () => S().mail.filter((m) => [].concat(m.to || [], m.cc || [], m.bcc || []).includes(FRED));
const everything = () => JSON.stringify({ mail: S().mail, calls: S().calls, writes: S().writes });
const meetingRow = (id) => S().db.crm_meetings.find((r) => r.id === id);

/* ------------------------------------------------------------ ticked */

test('ticked, Zoom, no guests: Fred gets a calendar invite with the join link', async () => {
  const r = await call({ ...BOOKING, add_fireflies: true });
  assert.equal(r.ok, true);
  assert.equal(r.fireflies, 'on');

  const sent = toFred();
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0].to, [FRED]);
  assert.deepEqual(sent[0].cc, [FF_CALENDAR], 'a copy lands in the calendar Fireflies watches, whatever SMTP_FROM is');
  const cal = ics(sent[0]);
  assert.match(cal, /METHOD:REQUEST/);
  assert.match(cal, /ATTENDEE;[^\n]*:mailto:fred@fireflies\.ai/);
  assert.match(cal, /ATTENDEE;[^\n]*:mailto:fireflies-calendar@example\.com/, 'the Fireflies calendar is on the event');
  assert.match(cal, /LOCATION:https:\/\/zoom\.us\/j\/123/);
  assert.match(cal, /DTSTART:20260923T090000Z/);
  assert.equal(sent[0].attachments[0].filename, 'invite.ics');

  // Zoom was asked for 12:00 Cairo, and not told about Fred.
  const zoom = S().calls.find((c) => c.url === 'https://api.zoom.us/v2/users/me/meetings');
  assert.equal(zoom.body.start_time, '2026-09-23T12:00:00');
  assert.equal(zoom.body.timezone, 'Africa/Cairo');
  assert.ok(!JSON.stringify(zoom.body).includes(FRED));

  assert.equal(meetingRow(r.meeting_id).fireflies, true, 'recorded on the meeting');
});

test('ticked, Zoom, with guests: guests\' invite is unchanged, Fred gets his own for the same event', async () => {
  const r = await call({ ...BOOKING, to_people: GUESTS, send_invitations: true, add_fireflies: true });
  assert.equal(r.fireflies, 'on');
  assert.equal(S().mail.length, 2);
  const guestMail = S().mail.find((m) => m.to.includes('guest@example.com'));
  assert.ok(!JSON.stringify(guestMail).includes(FRED), 'no Fred anywhere in the guests\' email');
  const fredMail = toFred()[0];
  assert.deepEqual(fredMail.to, [FRED]);
  const uid = (m) => ics(m).match(/UID:(.+)/)[1];
  assert.equal(uid(fredMail), uid(guestMail), 'one event, not two');
  assert.match(ics(fredMail), /mailto:guest@example\.com/);
});

test('ticked, Google Meet: Fred is an attendee on the calendar event, and Google invites him', async () => {
  const r = await call({ ...BOOKING, provider: 'meet', add_fireflies: true });
  assert.equal(r.fireflies, 'on');
  const ev = S().calls.find((c) => c.url.startsWith('https://www.googleapis.com/calendar/v3/calendars/primary/events'));
  assert.deepEqual(ev.body.attendees, [{ email: FRED }]);
  assert.match(ev.url, /sendUpdates=all/);
  assert.equal(toFred().length, 0, 'no second invite by email');
  assert.equal(meetingRow(r.meeting_id).fireflies, true);
});

test('ticked, Teams: Fred gets a calendar invite with the Teams link', async () => {
  const r = await call({ ...BOOKING, provider: 'teams', add_fireflies: true });
  assert.equal(r.fireflies, 'on');
  assert.match(ics(toFred()[0]), /LOCATION:https:\/\/teams\.microsoft\.com\/l\/x/);
});

test('ticked on "Send an email" for a meeting booked without Fireflies: Fred is invited then', async () => {
  const booked = await call({ ...BOOKING });
  assert.equal(booked.fireflies, 'off');
  S().mail.length = 0;
  const r = await call({ ...BOOKING, meeting_id: booked.meeting_id, to_people: GUESTS,
    send_invitations: true, add_fireflies: true });
  assert.equal(r.fireflies, 'on');
  assert.equal(toFred().length, 1);
  assert.ok(!JSON.stringify(S().mail.find((m) => m.to.includes('guest@example.com'))).includes(FRED));
  assert.equal(meetingRow(booked.meeting_id).fireflies, true);
});

test('ticked again on a meeting Fred is already on: no duplicate invite', async () => {
  const booked = await call({ ...BOOKING, add_fireflies: true });
  S().mail.length = 0;
  const r = await call({ ...BOOKING, meeting_id: booked.meeting_id, to_people: GUESTS,
    send_invitations: true, add_fireflies: true });
  assert.equal(r.fireflies, 'on');
  assert.equal(toFred().length, 0);
});

test('ticked, but FIREFLIES_CALENDAR_EMAIL is not set: Fred is still invited, the copy is skipped, a warning is logged', async (t) => {
  delete env.FIREFLIES_CALENDAR_EMAIL;
  const warn = t.mock.method(console, 'warn', () => {});
  const r = await call({ ...BOOKING, add_fireflies: true });
  assert.equal(r.fireflies, 'on');
  const sent = toFred();
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0].to, [FRED]);
  assert.equal(sent[0].cc, undefined, 'no copy, and no fallback address');
  assert.doesNotMatch(ics(sent[0]), /example\.com|gmail/);
  assert.equal(warn.mock.callCount(), 1);
  assert.match(warn.mock.calls[0].arguments[0], /FIREFLIES_CALENDAR_EMAIL is not set/);
});

test('unticked with FIREFLIES_CALENDAR_EMAIL not set: no warning', async (t) => {
  delete env.FIREFLIES_CALENDAR_EMAIL;
  const warn = t.mock.method(console, 'warn', () => {});
  await call({ ...BOOKING });
  assert.equal(warn.mock.callCount(), 0);
});

test('ticked, but the mail server is not configured: says Fred was not invited, and does not record him', async () => {
  delete env.SMTP_HOST;
  const r = await call({ ...BOOKING, add_fireflies: true });
  assert.equal(r.ok, true, 'the meeting is still booked');
  assert.match(r.fireflies, /^not invited: Email is not configured/);
  assert.notEqual(meetingRow(r.meeting_id).fireflies, true);
});

/* ---------------------------------------------------------- unticked */

for (const provider of ['zoom', 'meet', 'teams']) {
  test('unticked, ' + provider + ', no guests: Fred is not added anywhere', async () => {
    const r = await call({ ...BOOKING, provider });
    assert.equal(r.fireflies, 'off');
    assert.equal(S().mail.length, 0);
    assert.ok(!everything().includes(FRED));
    assert.ok(!S().writes.some((w) => 'fireflies' in (w.patch || w.row || {})));
  });

  test('unticked, ' + provider + ', with guests: only the guests are invited', async () => {
    const r = await call({ ...BOOKING, provider, to_people: GUESTS, send_invitations: true });
    assert.equal(r.fireflies, 'off');
    assert.ok(!everything().includes(FRED));
    if (provider !== 'meet') {
      assert.equal(S().mail.length, 1);
      assert.deepEqual(S().mail[0].to, ['guest@example.com']);
    }
  });
}

test('unticked is the default: a call that says nothing about Fireflies adds nothing', async () => {
  const { add_fireflies, ...plain } = { ...BOOKING, to_people: GUESTS, send_invitations: true };
  const r = await call(plain);
  assert.equal(r.fireflies, 'off');
  assert.ok(!everything().includes(FRED));
});

test('unticked "Send an email" on a meeting Fred is already on: shows on, sends him nothing new', async () => {
  const booked = await call({ ...BOOKING, add_fireflies: true });
  S().mail.length = 0;
  const r = await call({ ...BOOKING, meeting_id: booked.meeting_id, to_people: GUESTS, send_invitations: true });
  assert.equal(r.fireflies, 'on');
  assert.equal(toFred().length, 0);
});

/* ----------------------------------------------------- the rule itself */

test('firefliesPlan: nothing unless requested', () => {
  for (const provider of ['zoom', 'teams', 'meet']) {
    for (const isReuse of [false, true]) {
      const p = firefliesPlan({ requested: false, provider, isReuse, recipients: [], organizer: ORGANISER, fireflies: FRED });
      assert.deepEqual(p, { addToEvent: false, sendInvite: false, inviteTo: [], inviteCc: [], on: false });
    }
  }
  // Only an explicit true counts.
  assert.equal(firefliesPlan({ requested: 'true', provider: 'zoom', recipients: [] }).sendInvite, false);
});

test('firefliesPlan: requested', () => {
  assert.deepEqual(firefliesPlan({ requested: true, provider: 'zoom', isReuse: false, recipients: [], organizer: ORGANISER, fireflies: FRED }),
    { addToEvent: false, sendInvite: true, inviteTo: [FRED], inviteCc: [ORGANISER], on: true });
  assert.equal(firefliesPlan({ requested: true, provider: 'meet', isReuse: false, recipients: [] }).addToEvent, true);
  // An existing Meet event is not edited; Fred is invited by email instead.
  assert.equal(firefliesPlan({ requested: true, provider: 'meet', isReuse: true, recipients: [] }).sendInvite, true);
  assert.equal(firefliesPlan({ requested: true, alreadyInvited: true, provider: 'zoom', recipients: [] }).sendInvite, false);
  assert.equal(firefliesPlan({ requested: true, provider: 'zoom', recipients: ['FRED@fireflies.ai'] }).sendInvite, false);
});
