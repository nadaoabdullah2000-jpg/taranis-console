/* The start of a Zoom meeting, as Zoom's create-meeting call wants it.

   Zoom reads `start_time` two ways: ending in Z it is GMT, otherwise it is the
   wall clock in `timezone`. It only recognises the GMT form as exactly
   yyyy-MM-ddTHH:mm:ssZ. The "…:00.000Z" that toISOString() produces is NOT
   read as GMT: Zoom takes the digits as local time in `timezone`, so 12:00
   Cairo (sent as 09:00:00.000Z) was booked at 09:00 Cairo.

   So the wall clock in the meeting's own zone is sent, unlabelled, with
   `timezone` saying which zone that is. Zoom then shows the meeting at
   exactly the time and zone picked on the form.

   Plain JavaScript so the same file runs in the Edge Function (Deno) and in
   the Node tests (tests/meeting-time.test.js). Must agree with
   utcToZonedLocal in /meeting-time.js; the tests check that it does. */

// Zoom ids that are not IANA names, mapped to the IANA zone with the same rules.
const COMPUTE_ALIAS = { SST: 'Pacific/Guadalcanal' };
export const computeZone = (tz) => COMPUTE_ALIAS[tz] || tz || 'UTC';

export function utcToZonedLocal(iso, tz) {
  const ms = new Date(iso).getTime();
  if (isNaN(ms)) return '';
  const dtf = new Intl.DateTimeFormat('en-US', { timeZone: computeZone(tz), hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const p = {};
  for (const part of dtf.formatToParts(new Date(ms))) p[part.type] = part.value;
  const hour = p.hour === '24' ? '00' : p.hour;
  return p.year + '-' + p.month + '-' + p.day + 'T' + hour + ':' + p.minute + ':' + p.second;
}

export function zoomStartFields(startUtcIso, tz) {
  const zone = tz || 'UTC';
  return { start_time: utcToZonedLocal(startUtcIso, zone), timezone: zone };
}

/* Zoom answers with the start it booked, in GMT ("2026-09-23T09:00:00Z").
   True when that is the instant that was asked for. */
export function zoomBookedSameInstant(askedUtcIso, zoomStartTime) {
  if (!zoomStartTime) return true;
  const a = new Date(askedUtcIso).getTime();
  const b = new Date(zoomStartTime).getTime();
  return isNaN(b) || Math.abs(a - b) < 60000;
}
