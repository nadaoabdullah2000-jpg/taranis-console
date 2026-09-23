/* The calendar invitation (iCalendar, RFC 5545) attached to every meeting
   email, and who gets which copy.

   Mail clients only offer "Accept / Decline" and add the event to the
   calendar when the message carries a text/calendar; method=REQUEST part
   that parses cleanly and lists the reader as an ATTENDEE. So:
     - lines are CRLF-terminated and folded at 75 octets, text is escaped;
     - the reader is always an ATTENDEE on their own copy — To and CC share
       one copy; each BCC recipient gets a copy of their own, so their
       address is never on anyone else's invite;
     - UID is stable per meeting, and SEQUENCE goes up on every resend, so a
       resend or "Issue the link" updates the event already in the calendar
       instead of adding a second one.

   Plain JavaScript so it runs in the Edge Function (Deno) and in the Node
   tests (tests/invite.test.mjs). */

/** One UID per meeting. A UID that already has a domain (Google's
    iCalUID) is used as it is. */
export function eventUid(id) {
  const s = String(id ?? '').trim();
  if (!s) return crypto.randomUUID() + '@taranis.crm';
  return s.includes('@') ? s : 'meeting-' + s + '@taranis.crm';
}

/** 2026-09-23T09:00:00.000Z -> 20260923T090000Z */
export const icsDate = (iso) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');

/** TEXT value escaping (RFC 5545 3.3.11). */
export const escapeText = (s) => String(s ?? '')
  .replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

// A parameter value, quoted, with the characters a quoted value cannot hold removed.
const param = (s) => '"' + String(s ?? '').replace(/["\r\n]/g, '') + '"';

/** Fold a content line at 75 octets without splitting a UTF-8 character. */
export function foldLine(line) {
  const enc = new TextEncoder();
  const out = [];
  let cur = '', bytes = 0;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    if (bytes + n > 75) { out.push(cur); cur = ' '; bytes = 1; }
    cur += ch; bytes += n;
  }
  out.push(cur);
  return out.join('\r\n');
}

/**
 * @param {object} a
 * @param {string} a.uid           from eventUid()
 * @param {number} a.sequence      0 on the first invitation, +1 on every resend
 * @param {string} a.title
 * @param {string} a.startUtc      ISO instant
 * @param {string} a.endUtc        ISO instant
 * @param {string} a.joinUrl
 * @param {string} [a.passcode]
 * @param {string} [a.body]        the invitation text
 * @param {{email:string,name?:string}} a.organizer
 * @param {{email:string,name?:string}[]} a.attendees
 */
export function buildICS(a) {
  let description = String(a.body ?? '');
  if (a.joinUrl && !description.includes(a.joinUrl)) description += (description ? '\n\n' : '') + 'Join: ' + a.joinUrl;
  if (a.passcode && !description.includes(a.passcode)) description += '\nPasscode: ' + a.passcode;
  const seen = new Set();
  const attendees = [];
  for (const p of a.attendees || []) {
    const email = String(p?.email ?? '').trim().toLowerCase();
    if (!email || seen.has(email)) continue;
    seen.add(email);
    attendees.push('ATTENDEE;CN=' + param(p.name || email) + ';CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;'
      + 'PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:' + email);
  }
  const org = a.organizer || { email: '' };
  const lines = [
    'BEGIN:VCALENDAR', 'PRODID:-//Taranis//CRM//EN', 'VERSION:2.0', 'CALSCALE:GREGORIAN', 'METHOD:REQUEST',
    'BEGIN:VEVENT',
    'UID:' + a.uid,
    'SEQUENCE:' + (Number(a.sequence) || 0),
    'DTSTAMP:' + icsDate(new Date().toISOString()),
    'DTSTART:' + icsDate(a.startUtc),
    'DTEND:' + icsDate(a.endUtc),
    'SUMMARY:' + escapeText(a.title),
    'DESCRIPTION:' + escapeText(description),
    'LOCATION:' + escapeText(a.joinUrl),
    ...(a.joinUrl ? ['URL:' + a.joinUrl] : []),
    'ORGANIZER;CN=' + param(org.name || 'Taranis') + ':mailto:' + String(org.email).toLowerCase(),
    ...attendees,
    'STATUS:CONFIRMED', 'TRANSP:OPAQUE', 'CLASS:PUBLIC', 'PRIORITY:5', 'X-MICROSOFT-CDO-BUSYSTATUS:BUSY',
    'END:VEVENT', 'END:VCALENDAR'
  ];
  return lines.map(foldLine).join('\r\n') + '\r\n';
}

/**
 * Who gets which email. To and CC get one message and are the attendees on
 * it. Each BCC recipient gets a message of their own, addressed to them,
 * whose invite lists the To/CC attendees plus them alone.
 */
export function guestCopies({ to = [], cc = [], bcc = [] }) {
  const shared = [...new Set([...to, ...cc])];
  const copies = [];
  if (to.length || cc.length) copies.push({ to, cc, attendees: shared });
  for (const b of new Set(bcc)) {
    if (shared.includes(b)) continue;
    copies.push({ to: [b], cc: [], attendees: [...shared, b] });
  }
  return copies;
}
