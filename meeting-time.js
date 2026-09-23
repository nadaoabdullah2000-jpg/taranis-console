/* =========================================================================
   Taranis Console — meeting time zones
   -------------------------------------------------------------------------
   Everything that turns "12:00 in the zone picked on the form" into the
   instant a platform books. Kept apart from app.js so it can be tested on its
   own (tests/meeting-time.test.js) without a browser.

   Loaded as a plain script before app.js, so its functions are globals there.
   Under Node it is also a CommonJS module.
   ========================================================================= */

/* The zones Zoom accepts in its `timezone` field, with the labels Zoom uses
   for them. Transcribed from Zoom's API reference ("Abbreviation lists ›
   Timezones"). Order is Zoom's own, which runs roughly west to east.
   A value outside this list is not something Zoom will honour, so the form
   offers nothing else. */
const ZOOM_TIMEZONES = [
  ['Pacific/Midway', 'Midway Island, Samoa'],
  ['Pacific/Pago_Pago', 'Pago Pago'],
  ['Pacific/Honolulu', 'Hawaii'],
  ['America/Anchorage', 'Alaska'],
  ['America/Juneau', 'Juneau'],
  ['America/Vancouver', 'Vancouver'],
  ['America/Los_Angeles', 'Pacific Time (US and Canada)'],
  ['America/Tijuana', 'Tijuana'],
  ['America/Phoenix', 'Arizona'],
  ['America/Edmonton', 'Edmonton'],
  ['America/Denver', 'Mountain Time (US and Canada)'],
  ['America/Mazatlan', 'Mazatlan'],
  ['America/Regina', 'Saskatchewan'],
  ['America/Guatemala', 'Guatemala'],
  ['America/El_Salvador', 'El Salvador'],
  ['America/Managua', 'Managua'],
  ['America/Costa_Rica', 'Costa Rica'],
  ['America/Tegucigalpa', 'Tegucigalpa'],
  ['America/Chihuahua', 'Chihuahua'],
  ['America/Winnipeg', 'Winnipeg'],
  ['America/Chicago', 'Central Time (US and Canada)'],
  ['America/Mexico_City', 'Mexico City'],
  ['America/Panama', 'Panama'],
  ['America/Bogota', 'Bogota'],
  ['America/Lima', 'Lima'],
  ['America/Monterrey', 'Monterrey'],
  ['America/Montreal', 'Montreal'],
  ['America/New_York', 'Eastern Time (US and Canada)'],
  ['America/Indianapolis', 'Indiana (East)'],
  ['America/Puerto_Rico', 'Puerto Rico'],
  ['America/Caracas', 'Caracas'],
  ['America/Santiago', 'Santiago'],
  ['America/La_Paz', 'La Paz'],
  ['America/Guyana', 'Guyana'],
  ['America/Halifax', 'Halifax'],
  ['America/Montevideo', 'Montevideo'],
  ['America/Araguaina', 'Recife'],
  ['America/Argentina/Buenos_Aires', 'Buenos Aires, Georgetown'],
  ['America/Sao_Paulo', 'Sao Paulo'],
  ['Canada/Atlantic', 'Atlantic Time (Canada)'],
  ['America/St_Johns', 'Newfoundland and Labrador'],
  ['America/Godthab', 'Greenland'],
  ['Atlantic/Cape_Verde', 'Cape Verde Islands'],
  ['Atlantic/Azores', 'Azores'],
  ['UTC', 'Universal Time UTC'],
  ['Etc/Greenwich', 'Greenwich Mean Time'],
  ['Atlantic/Reykjavik', 'Reykjavik'],
  ['Africa/Nouakchott', 'Nouakchott'],
  ['Europe/Dublin', 'Dublin'],
  ['Europe/London', 'London'],
  ['Europe/Lisbon', 'Lisbon'],
  ['Africa/Casablanca', 'Casablanca'],
  ['Africa/Bangui', 'West Central Africa'],
  ['Africa/Algiers', 'Algiers'],
  ['Africa/Tunis', 'Tunis'],
  ['Europe/Belgrade', 'Belgrade, Bratislava, Ljubljana'],
  ['CET', 'Sarajevo, Skopje, Zagreb'],
  ['Europe/Oslo', 'Oslo'],
  ['Europe/Copenhagen', 'Copenhagen'],
  ['Europe/Brussels', 'Brussels'],
  ['Europe/Berlin', 'Amsterdam, Berlin, Rome, Stockholm, Vienna'],
  ['Europe/Amsterdam', 'Amsterdam'],
  ['Europe/Rome', 'Rome'],
  ['Europe/Stockholm', 'Stockholm'],
  ['Europe/Vienna', 'Vienna'],
  ['Europe/Luxembourg', 'Luxembourg'],
  ['Europe/Paris', 'Paris'],
  ['Europe/Zurich', 'Zurich'],
  ['Europe/Madrid', 'Madrid'],
  ['Africa/Harare', 'Harare, Pretoria'],
  ['Europe/Warsaw', 'Warsaw'],
  ['Europe/Prague', 'Prague Bratislava'],
  ['Europe/Budapest', 'Budapest'],
  ['Africa/Tripoli', 'Tripoli'],
  ['Africa/Cairo', 'Cairo'],
  ['Africa/Johannesburg', 'Johannesburg'],
  ['Africa/Khartoum', 'Khartoum'],
  ['Europe/Helsinki', 'Helsinki'],
  ['Africa/Nairobi', 'Nairobi'],
  ['Europe/Sofia', 'Sofia'],
  ['Europe/Istanbul', 'Istanbul'],
  ['Europe/Athens', 'Athens'],
  ['Europe/Bucharest', 'Bucharest'],
  ['Asia/Nicosia', 'Nicosia'],
  ['Asia/Beirut', 'Beirut'],
  ['Asia/Damascus', 'Damascus'],
  ['Asia/Jerusalem', 'Jerusalem'],
  ['Asia/Amman', 'Amman'],
  ['Europe/Moscow', 'Moscow'],
  ['Asia/Baghdad', 'Baghdad'],
  ['Asia/Kuwait', 'Kuwait'],
  ['Asia/Riyadh', 'Riyadh'],
  ['Asia/Bahrain', 'Bahrain'],
  ['Asia/Qatar', 'Qatar'],
  ['Asia/Aden', 'Aden'],
  ['Asia/Tehran', 'Tehran'],
  ['Africa/Djibouti', 'Djibouti'],
  ['Asia/Dubai', 'Dubai'],
  ['Asia/Muscat', 'Muscat'],
  ['Asia/Baku', 'Baku, Tbilisi, Yerevan'],
  ['Asia/Kabul', 'Kabul'],
  ['Asia/Yekaterinburg', 'Yekaterinburg'],
  ['Asia/Tashkent', 'Islamabad, Karachi, Tashkent'],
  ['Asia/Calcutta', 'India'],
  ['Asia/Kolkata', 'Mumbai, Kolkata, New Delhi'],
  ['Asia/Kathmandu', 'Kathmandu'],
  ['Asia/Novosibirsk', 'Novosibirsk'],
  ['Asia/Almaty', 'Almaty'],
  ['Asia/Dacca', 'Dacca'],
  ['Asia/Krasnoyarsk', 'Krasnoyarsk'],
  ['Asia/Dhaka', 'Astana, Dhaka'],
  ['Asia/Bangkok', 'Bangkok'],
  ['Asia/Saigon', 'Vietnam'],
  ['Asia/Jakarta', 'Jakarta'],
  ['Asia/Irkutsk', 'Irkutsk, Ulaanbaatar'],
  ['Asia/Shanghai', 'Beijing, Shanghai'],
  ['Asia/Hong_Kong', 'Hong Kong SAR'],
  ['Asia/Taipei', 'Taipei'],
  ['Asia/Kuala_Lumpur', 'Kuala Lumpur'],
  ['Asia/Singapore', 'Singapore'],
  ['Australia/Perth', 'Perth'],
  ['Asia/Yakutsk', 'Yakutsk'],
  ['Asia/Seoul', 'Seoul'],
  ['Asia/Tokyo', 'Osaka, Sapporo, Tokyo'],
  ['Australia/Darwin', 'Darwin'],
  ['Australia/Adelaide', 'Adelaide'],
  ['Asia/Vladivostok', 'Vladivostok'],
  ['Pacific/Port_Moresby', 'Guam, Port Moresby'],
  ['Australia/Brisbane', 'Brisbane'],
  ['Australia/Sydney', 'Canberra, Melbourne, Sydney'],
  ['Australia/Hobart', 'Hobart'],
  ['Asia/Magadan', 'Magadan'],
  ['SST', 'Solomon Islands'],
  ['Pacific/Noumea', 'New Caledonia'],
  ['Asia/Kamchatka', 'Kamchatka'],
  ['Pacific/Fiji', 'Fiji Islands, Marshall Islands'],
  ['Pacific/Auckland', 'Auckland, Wellington'],
  ['Europe/Kiev', 'Kiev'],
  ['Pacific/Apia', 'Independent State of Samoa']
];

/* Zoom ids that are not IANA names, so the JavaScript clock cannot compute
   with them directly. The value is the IANA zone with the same rules. */
const TZ_COMPUTE_ALIAS = { SST: 'Pacific/Guadalcanal' };

/* Current IANA names a browser may report for a zone Zoom still lists under
   its older name. */
const TZ_BROWSER_ALIAS = {
  'Asia/Ho_Chi_Minh': 'Asia/Saigon',
  'Europe/Kyiv': 'Europe/Kiev',
  'America/Nuuk': 'America/Godthab',
  'America/Indiana/Indianapolis': 'America/Indianapolis',
  'America/Toronto': 'America/Montreal',
  'Pacific/Guadalcanal': 'SST',
  'Etc/UTC': 'UTC',
  'Etc/GMT': 'Etc/Greenwich',
  'GMT': 'Etc/Greenwich'
};

const isZoomTimezone = (tz) => ZOOM_TIMEZONES.some((z) => z[0] === tz);
const computeZone = (tz) => TZ_COMPUTE_ALIAS[tz] || tz || 'UTC';

/* The wall clock in `tz` at a given instant, as its parts. */
function zoneParts(ms, tz) {
  const dtf = new Intl.DateTimeFormat('en-US', { timeZone: computeZone(tz), hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const p = {};
  for (const part of dtf.formatToParts(new Date(ms))) p[part.type] = part.value;
  return { y: +p.year, mo: +p.month, d: +p.day, h: p.hour === '24' ? 0 : +p.hour, mi: +p.minute, s: +p.second };
}

/* How far `tz` is ahead of UTC at that instant, in milliseconds. */
function zoneOffsetMs(ms, tz) {
  const p = zoneParts(ms, tz);
  return Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s) - Math.floor(ms / 1000) * 1000;
}

/* Turn the wall-clock value from the datetime-local picker into the correct UTC
   instant FOR THE MEETING'S CHOSEN TIMEZONE, not the browser's. Picking 15:00
   with the Timezone set to Geneva must mean 15:00 in Geneva, whoever is booking
   and wherever they sit. The zone's offset at that date is computed (so summer
   time is handled) and subtracted, then checked once more at the answer, which
   is what keeps a booking in the week the clocks change right. */
function zonedTimeToUtc(local, tz) {
  const m = String(local || '').match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return new Date(local).toISOString();
  const wall = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
  try {
    let t = wall - zoneOffsetMs(wall, tz);
    const again = wall - zoneOffsetMs(t, tz);
    if (again !== t) t = again;
    return new Date(t).toISOString();
  } catch (_) {
    return new Date(wall).toISOString();
  }
}

/* The reverse: the wall clock in `tz` at a UTC instant, as
   "yyyy-MM-ddTHH:mm:ss" with no offset and no Z. */
function utcToZonedLocal(iso, tz) {
  const ms = new Date(iso).getTime();
  if (isNaN(ms)) return '';
  const p = zoneParts(ms, tz);
  const two = (n) => String(n).padStart(2, '0');
  return p.y + '-' + two(p.mo) + '-' + two(p.d) + 'T' + two(p.h) + ':' + two(p.mi) + ':' + two(p.s);
}

/* What Zoom's create-meeting call needs for the start.
   Zoom reads `start_time` two ways: ending in Z it is GMT, otherwise it is the
   wall clock in `timezone`. It only recognises the GMT form as exactly
   yyyy-MM-ddTHH:mm:ssZ, so "…:00.000Z" from toISOString() is NOT read as GMT —
   Zoom takes the digits as local time in `timezone` instead. That turned 12:00
   Cairo (09:00Z) into 09:00 Cairo. So send the wall clock in the chosen zone,
   unlabelled, and let `timezone` say which zone it is. */
function zoomStartFields(startUtcIso, tz) {
  const zone = tz || 'UTC';
  return { start_time: utcToZonedLocal(startUtcIso, zone), timezone: zone };
}

/* "UTC+03:00" for the zone at that instant. */
function utcOffsetLabel(iso, tz) {
  const ms = new Date(iso || Date.now()).getTime();
  try {
    const mins = Math.round(zoneOffsetMs(ms, tz) / 60000);
    const sign = mins < 0 ? '-' : '+';
    const a = Math.abs(mins);
    return 'UTC' + sign + String(Math.floor(a / 60)).padStart(2, '0') + ':' + String(a % 60).padStart(2, '0');
  } catch (_) { return ''; }
}

/* The label on the picker: "(UTC+03:00) Cairo — Africa/Cairo". The offset is
   today's, which is the one somebody booking has in mind. */
function timezoneLabel(tz, atIso) {
  const hit = ZOOM_TIMEZONES.find((z) => z[0] === tz);
  const name = hit ? hit[1] : tz;
  const off = utcOffsetLabel(atIso, tz);
  return (off ? '(' + off + ') ' : '') + name + (hit && name !== tz ? ' — ' + tz : '');
}

/* The zone of the device doing the booking, as a zone Zoom accepts. The
   browser's own name is used when Zoom lists it; otherwise a known renaming;
   otherwise a Zoom zone that keeps the same clock all year (same offset in
   January and July); otherwise UTC. */
function defaultTimezone(browserTz) {
  let tz = browserTz;
  if (tz === undefined) {
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (_) { tz = ''; }
  }
  if (!tz) return 'UTC';
  if (isZoomTimezone(tz)) return tz;
  if (TZ_BROWSER_ALIAS[tz] && isZoomTimezone(TZ_BROWSER_ALIAS[tz])) return TZ_BROWSER_ALIAS[tz];
  try {
    const y = new Date().getUTCFullYear();
    const jan = Date.UTC(y, 0, 15), jul = Date.UTC(y, 6, 15);
    const a = zoneOffsetMs(jan, tz), b = zoneOffsetMs(jul, tz);
    const same = ZOOM_TIMEZONES.find((z) => zoneOffsetMs(jan, z[0]) === a && zoneOffsetMs(jul, z[0]) === b);
    if (same) return same[0];
  } catch (_) { /* an id this engine does not know */ }
  return 'UTC';
}

/* A meeting's start as it reads in its own zone:
   "Wed 23 Sep 2026, 12:00 (Africa/Cairo, UTC+03:00)". */
function fmtInZone(iso, tz) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso || '');
  const zone = tz || 'UTC';
  try {
    const s = new Intl.DateTimeFormat('en-GB', { timeZone: computeZone(zone), weekday: 'short',
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
    return s + ' (' + zone + ', ' + utcOffsetLabel(iso, zone) + ')';
  } catch (_) { return d.toISOString(); }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ZOOM_TIMEZONES, TZ_COMPUTE_ALIAS, isZoomTimezone, zonedTimeToUtc,
    utcToZonedLocal, zoomStartFields, utcOffsetLabel, timezoneLabel, defaultTimezone, fmtInZone };
}
