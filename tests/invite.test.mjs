/* Run with: npm test
   Every meeting email carries a calendar invitation that mail clients turn
   into "Accept / Decline": a text/calendar; method=REQUEST part plus
   invite.ics, the reader on the ATTENDEE list, one UID per meeting and a
   rising SEQUENCE. Runs the real create-meeting handler; see
   helpers/edge-harness.mjs. */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { call, reset, state } from './helpers/edge-harness.mjs';
import { buildICS, foldLine } from '../supabase/functions/create-meeting/invite.js';

const require = createRequire(import.meta.url);
const { zonedTimeToUtc } = require('../meeting-time.js');

beforeEach(reset);

const SENDER = 'sender@taranis.net';
const mail = () => state().mail;
const calPart = (m) => (m.mimeContent || []).find((c) => c.mimeType.startsWith('text/calendar'));
const raw = (m) => (calPart(m) || {}).content || '';
const ics = (m) => raw(m).replace(/\r\n[ \t]/g, '');            // unfolded
const prop = (m, name) => (ics(m).match(new RegExp('^' + name + '[:;](.*)$', 'm')) || [])[1];
const attendees = (m) => [...ics(m).matchAll(/^ATTENDEE[^\r\n]*:mailto:([^\r\n]+)$/gm)].map((x) => x[1]);
const addressed = (m) => [].concat(m.to || [], m.cc || [], m.bcc || []);

// What the app sends: the form's wall clock turned into UTC for the picked zone.
const booking = (tz, extra = {}) => ({ provider: 'zoom', title: 'Cap Intro',
  start_utc: zonedTimeToUtc('2026-09-23T12:00', tz), duration_min: 30, tz,
  to_people: [{ email: 'guest@gmail.com', name: 'Guest One' }], send_invitations: true, language: 'en', ...extra });

/* ---------------------------------------------------- the right time */

for (const [tz, start, end] of [
  ['Africa/Cairo', '20260923T090000Z', '20260923T093000Z'],
  ['Asia/Dubai', '20260923T080000Z', '20260923T083000Z'],
  ['America/New_York', '20260923T160000Z', '20260923T163000Z']
]) {
  test('12:00 ' + tz + ': the invite starts and ends at the right instant', async () => {
    const r = await call(booking(tz));
    assert.equal(r.ok, true);
    assert.equal(r.calendar_invite, 'ics');
    const m = mail()[0];
    assert.equal(prop(m, 'DTSTART'), start);
    assert.equal(prop(m, 'DTEND'), end);
  });
}

/* ------------------------------------------------- a proper invitation */

test('the email carries a text/calendar; method=REQUEST part and invite.ics', async () => {
  await call(booking('Africa/Cairo'));
  const m = mail()[0];
  assert.deepEqual(m.to, ['guest@gmail.com']);
  assert.equal(m.from, SENDER, 'still sent from SMTP_FROM');
  assert.match(calPart(m).mimeType, /^text\/calendar;.*method=REQUEST/);
  assert.equal(m.mimeContent[0].mimeType, 'text/plain; charset=utf-8');
  assert.equal(m.attachments[0].filename, 'invite.ics');
  const cal = ics(m);
  for (const line of ['BEGIN:VCALENDAR', 'VERSION:2.0', 'METHOD:REQUEST', 'BEGIN:VEVENT', 'STATUS:CONFIRMED', 'END:VEVENT', 'END:VCALENDAR']) {
    assert.match(cal, new RegExp('^' + line + '$', 'm'), line);
  }
  assert.equal(prop(m, 'SUMMARY'), 'Cap Intro');
  assert.equal(prop(m, 'LOCATION'), 'https://zoom.us/j/123');
  assert.equal(prop(m, 'URL'), 'https://zoom.us/j/123');
  assert.match(prop(m, 'DESCRIPTION'), /https:\/\/zoom\.us\/j\/123/);
  assert.match(prop(m, 'DESCRIPTION'), /Passcode: pw/);
  assert.match(cal, /^ORGANIZER;CN="Taranis":mailto:sender@taranis\.net$/m);
  assert.match(cal, /^ATTENDEE;CN="Guest One";[^\r\n]*RSVP=TRUE:mailto:guest@gmail\.com$/m);
});

test('the invite is valid iCalendar: CRLF lines, none longer than 75 octets', async () => {
  await call(booking('Africa/Cairo', { language: 'fr', invitee_name: 'Éloïse' }));
  const text = raw(mail()[0]);
  assert.ok(text.endsWith('\r\n'));
  assert.ok(!/[^\r]\n/.test(text), 'every line ends in CRLF');
  for (const line of text.split('\r\n')) assert.ok(Buffer.byteLength(line) <= 75, line);
  assert.match(prop(mail()[0], 'DESCRIPTION'), /Bonjour Éloïse\\,/, 'text escaped, UTF-8 kept whole across folds');
});

/* ------------------------------------------------------ To, CC and BCC */

test('To and CC are attendees; BCC gets its own invite and is on no one else\'s', async () => {
  await call(booking('Africa/Cairo', {
    to_people: [{ email: 'to@example.com', name: 'To Person' }],
    cc: ['cc@example.com'], bcc: ['hidden1@example.com', 'hidden2@example.com'] }));
  assert.equal(mail().length, 3, 'one shared message, one per BCC');
  const shared = mail()[0];
  assert.deepEqual(shared.to, ['to@example.com']);
  assert.deepEqual(shared.cc, ['cc@example.com']);
  assert.equal(shared.bcc, undefined);
  assert.deepEqual(attendees(shared), ['to@example.com', 'cc@example.com']);
  assert.ok(!JSON.stringify(shared).includes('hidden'), 'BCC not exposed in the shared message');
  for (const who of ['hidden1@example.com', 'hidden2@example.com']) {
    const own = mail().find((m) => m.to[0] === who);
    assert.deepEqual(addressed(own), [who]);
    assert.deepEqual(attendees(own), ['to@example.com', 'cc@example.com', who], 'can Accept, sees no other BCC');
    assert.equal(prop(own, 'UID'), prop(shared, 'UID'), 'the same event');
  }
});

/* ------------------------------------------------- one event, updated */

test('resending ("Send an email" again) keeps the UID and raises SEQUENCE', async () => {
  const booked = await call(booking('Africa/Cairo', { to_people: [], send_invitations: false }));
  const send = () => call(booking('Africa/Cairo', { meeting_id: booked.meeting_id }));
  await send(); await send();
  const [a, b] = mail();
  assert.equal(prop(a, 'UID'), 'meeting-' + booked.meeting_id + '@taranis.crm');
  assert.equal(prop(b, 'UID'), prop(a, 'UID'));
  assert.equal(prop(a, 'SEQUENCE'), '0');
  assert.equal(prop(b, 'SEQUENCE'), '1');
});

test('"Issue the link" invites under the pending meeting\'s own UID', async () => {
  state().db.crm_meetings.push({ id: 'pending-9', status: 'pending', meet_url: null, provider: 'zoom' });
  await call(booking('Africa/Cairo', { meeting_id: 'pending-9' }));
  assert.equal(prop(mail()[0], 'UID'), 'meeting-pending-9@taranis.crm');
  assert.equal(prop(mail()[0], 'SEQUENCE'), '0');
});

test('Teams: the emailed invite carries the Teams link', async () => {
  await call(booking('Africa/Cairo', { provider: 'teams' }));
  assert.equal(prop(mail()[0], 'LOCATION'), 'https://teams.microsoft.com/l/x');
});

/* ------------------------------------------------------- Google Meet */

const googleCalls = () => state().calls.filter((c) => c.url.includes('/calendar/v3/calendars/primary/events'));

test('Google Meet: To and CC go on the Google event with sendUpdates=all; no second invite by email', async () => {
  const r = await call(booking('Africa/Cairo', { provider: 'meet', cc: ['cc@example.com'] }));
  assert.equal(r.calendar_invite, 'google');
  const create = googleCalls().find((c) => c.method === 'POST');
  assert.match(create.url, /sendUpdates=all/);
  assert.deepEqual(create.body.attendees, [{ email: 'guest@gmail.com' }, { email: 'cc@example.com' }]);
  assert.equal(mail().length, 1, 'the written message still goes');
  assert.equal(calPart(mail()[0]), undefined, 'but without a calendar part');
  assert.deepEqual(mail()[0].attachments, []);
});

test('Google Meet: BCC is not on the Google event and gets its own invite for the same event', async () => {
  await call(booking('Africa/Cairo', { provider: 'meet', bcc: ['hidden@example.com'] }));
  const create = googleCalls().find((c) => c.method === 'POST');
  assert.ok(!JSON.stringify(create.body).includes('hidden'));
  const own = mail().find((m) => m.to[0] === 'hidden@example.com');
  assert.equal(prop(own, 'UID'), 'ev1@google.com', 'Google\'s own event UID');
  assert.match(ics(own), /^ORGANIZER;CN="Taranis":mailto:calendar-owner@taranis\.net$/m);
  assert.deepEqual(attendees(own), ['guest@gmail.com', 'hidden@example.com']);
});

test('Google Meet, "Send an email" later: guests are added to the event, Google invites them', async () => {
  const booked = await call(booking('Africa/Cairo', { provider: 'meet', to_people: [], send_invitations: false }));
  state().mail.length = 0;
  const r = await call(booking('Africa/Cairo', { provider: 'meet', meeting_id: booked.meeting_id }));
  assert.equal(r.calendar_invite, 'google');
  const patch = googleCalls().find((c) => c.method === 'PATCH');
  assert.match(patch.url, /\/events\/ev1\?sendUpdates=all$/);
  assert.deepEqual(patch.body.attendees, [{ email: 'guest@gmail.com' }]);
  assert.equal(calPart(mail()[0]), undefined);
});

/* ---------------------------------------------------------- the builder */

test('foldLine folds at 75 octets and never splits a character', () => {
  const line = 'DESCRIPTION:' + 'مرحباً '.repeat(30);
  const folded = foldLine(line).split('\r\n');
  for (const l of folded) assert.ok(Buffer.byteLength(l) <= 75);
  assert.equal(folded.map((l, i) => (i ? l.slice(1) : l)).join(''), line);
});

test('buildICS keeps one UID and escapes text', () => {
  const s = buildICS({ uid: 'meeting-1@taranis.crm', sequence: 3, title: 'A, B; C', startUtc: '2026-09-23T09:00:00Z',
    endUtc: '2026-09-23T09:30:00Z', joinUrl: 'https://zoom.us/j/1', body: 'Hi', organizer: { email: SENDER },
    attendees: [{ email: 'x@example.com' }, { email: 'X@example.com' }] }).replace(/\r\n[ \t]/g, '');
  assert.match(s, /^UID:meeting-1@taranis\.crm$/m);
  assert.match(s, /^SEQUENCE:3$/m);
  assert.match(s, /^SUMMARY:A\\, B\\; C$/m);
  assert.equal((s.match(/^ATTENDEE/gm) || []).length, 1, 'duplicates dropped');
});
