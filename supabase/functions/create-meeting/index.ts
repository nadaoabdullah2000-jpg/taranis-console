import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': Deno.env.get('CONSOLE_ORIGIN') ??
    'https://nadaoabdullah2000-jpg.github.io',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const refuse = (message: string, extra: Record<string, unknown> = {}) =>
  json({ ok: false, join_url: '', message, ...extra });

async function zoomToken(): Promise<string> {
  const id = Deno.env.get('ZOOM_CLIENT_ID');
  const secret = Deno.env.get('ZOOM_CLIENT_SECRET');
  const account = Deno.env.get('ZOOM_ACCOUNT_ID');
  if (!id || !secret || !account) throw new Error('Zoom is not configured.');
  const res = await fetch('https://zoom.us/oauth/token?grant_type=account_credentials&account_id=' +
    encodeURIComponent(account), { method: 'POST', headers: { Authorization: 'Basic ' + btoa(id + ':' + secret) } });
  const body = await res.json();
  if (!res.ok) throw new Error('Zoom refused the token request: ' + (body.reason ?? res.status));
  return body.access_token;
}

async function createZoom(m: Meeting) {
  const token = await zoomToken();
  const res = await fetch('https://api.zoom.us/v2/users/me/meetings', {
    method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ topic: m.title, type: 2, start_time: m.startUtc, duration: m.minutes, timezone: m.tz,
      agenda: 'Scheduled from the Taranis CRM console.',
      settings: { join_before_host: true, mute_upon_entry: true, waiting_room: false } })
  });
  const body = await res.json();
  if (!res.ok) throw new Error('Zoom refused the meeting: ' + (body.message ?? res.status));
  return { join_url: body.join_url as string, passcode: (body.password ?? '') as string, external_id: String(body.id ?? '') };
}

async function teamsToken(): Promise<string> {
  const tenant = Deno.env.get('MS_TENANT_ID');
  const id = Deno.env.get('MS_CLIENT_ID');
  const secret = Deno.env.get('MS_CLIENT_SECRET');
  if (!tenant || !id || !secret) throw new Error('Microsoft Teams is not configured.');
  const res = await fetch('https://login.microsoftonline.com/' + tenant + '/oauth2/v2.0/token',
    { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: id, client_secret: secret, grant_type: 'client_credentials',
        scope: 'https://graph.microsoft.com/.default' }) });
  const body = await res.json();
  if (!res.ok) throw new Error('Microsoft refused the token request: ' + (body.error_description ?? res.status));
  return body.access_token;
}

async function createTeams(m: Meeting) {
  const organiser = Deno.env.get('MS_ORGANISER_ID');
  if (!organiser) throw new Error('Microsoft Teams has no organiser configured.');
  const token = await teamsToken();
  const res = await fetch('https://graph.microsoft.com/v1.0/users/' + organiser + '/onlineMeetings',
    { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ startDateTime: m.startUtc, endDateTime: m.endUtc, subject: m.title }) });
  const body = await res.json();
  if (!res.ok) {
    const why = body?.error?.message ?? String(res.status);
    if (res.status === 403) throw new Error('Microsoft refused: the app is not permitted to create meetings for that user. This is the application access policy, granted in Teams PowerShell, not an Azure permission. Details: ' + why);
    throw new Error('Microsoft refused the meeting: ' + why);
  }
  return { join_url: body.joinWebUrl as string, passcode: '', external_id: String(body.id ?? '') };
}

async function googleToken(): Promise<string> {
  const id = Deno.env.get('GOOGLE_CLIENT_ID');
  const secret = Deno.env.get('GOOGLE_CLIENT_SECRET');
  const refresh = Deno.env.get('GOOGLE_REFRESH_TOKEN');
  if (!id || !secret || !refresh) throw new Error('Google Meet is not configured.');
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: id, client_secret: secret, refresh_token: refresh, grant_type: 'refresh_token' })
  });
  const body = await res.json();
  if (!res.ok) {
    if (body.error === 'invalid_grant') throw new Error('Google rejected the stored refresh token. If the OAuth app is still in Testing, Google expires these after seven days — publish the app, or issue a new token.');
    throw new Error('Google refused the token request: ' + (body.error_description ?? res.status));
  }
  return body.access_token;
}

async function createMeet(m: Meeting) {
  const token = await googleToken();
  const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1&sendUpdates=' + (m.invite.length ? 'all' : 'none'),
    { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ summary: m.title, description: 'Scheduled from the Taranis CRM console.',
        start: { dateTime: m.startUtc, timeZone: 'UTC' }, end: { dateTime: m.endUtc, timeZone: 'UTC' },
        attendees: m.invite.map((email) => ({ email })),
        conferenceData: { createRequest: { requestId: crypto.randomUUID(), conferenceSolutionKey: { type: 'hangoutsMeet' } } } }) });
  const body = await res.json();
  if (!res.ok) throw new Error('Google refused the event: ' + (body?.error?.message ?? res.status));
  const link = body.hangoutLink ?? body.conferenceData?.entryPoints?.find((e: { uri?: string }) => e.uri)?.uri ?? '';
  if (!link) throw new Error('Google created the event but issued no Meet link. The account may not have conferencing enabled.');
  return { join_url: link as string, passcode: '', external_id: String(body.id ?? '') };
}

async function cancelOnPlatform(provider: string, externalId: string): Promise<string> {
  if (!externalId) return 'No platform id was stored, so nothing was cancelled there.';
  try {
    if (provider === 'zoom') {
      const token = await zoomToken();
      const res = await fetch('https://api.zoom.us/v2/meetings/' + encodeURIComponent(externalId), { method: 'DELETE', headers: { Authorization: 'Bearer ' + token } });
      if (res.status === 204 || res.status === 404) return '';
      const body = await res.json().catch(() => ({}));
      if (res.status === 403) return 'Zoom refused to delete it. The app has permission to create meetings but not to delete them — add the meeting:delete:meeting:admin scope.';
      return 'Zoom refused to delete it: ' + (body.message ?? res.status);
    }
    if (provider === 'teams') {
      const organiser = Deno.env.get('MS_ORGANISER_ID');
      if (!organiser) return 'Microsoft Teams has no organiser configured.';
      const token = await teamsToken();
      const res = await fetch('https://graph.microsoft.com/v1.0/users/' + organiser + '/onlineMeetings/' + encodeURIComponent(externalId), { method: 'DELETE', headers: { Authorization: 'Bearer ' + token } });
      if (res.status === 204 || res.status === 404) return '';
      const body = await res.json().catch(() => ({}));
      return 'Microsoft refused to delete it: ' + (body?.error?.message ?? res.status);
    }
    const token = await googleToken();
    const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events/' + encodeURIComponent(externalId) + '?sendUpdates=all', { method: 'DELETE', headers: { Authorization: 'Bearer ' + token } });
    if (res.status === 204 || res.status === 404 || res.status === 410) return '';
    const body = await res.json().catch(() => ({}));
    return 'Google refused to delete it: ' + (body?.error?.message ?? res.status);
  } catch (e) { return String((e as Error).message ?? e); }
}

type Lang = 'en' | 'fr' | 'ar';

function buildInvitation(lang: Lang, a: { inviteeName: string; title: string; when: string; tz: string; minutes: number; label: string; joinUrl: string; passcode: string; }): { subject: string; body: string } {
  if (lang === 'ar') {
    const greeting = a.inviteeName ? 'مرحباً ' + a.inviteeName + '،' : 'مرحباً،';
    const body = greeting + '\n\nأنت مدعوّ إلى: ' + a.title + '\n\nالموعد    : ' + a.when + ' (' + a.tz + ')' + '\nالمدة     : ' + a.minutes + ' دقيقة' + '\nالمنصّة   : ' + a.label + '\n\nرابط الانضمام: ' + a.joinUrl + (a.passcode ? '\nرمز الدخول: ' + a.passcode : '') + '\n\nمع خالص التحية،\nTaranis';
    return { subject: 'اجتماع — ' + a.title, body };
  }
  if (lang === 'fr') {
    const greeting = a.inviteeName ? 'Bonjour ' + a.inviteeName + ',' : 'Bonjour,';
    const body = greeting + '\n\nVous êtes invité(e) à : ' + a.title + '\n\nDate        : ' + a.when + ' (' + a.tz + ')' + '\nDurée       : ' + a.minutes + ' minutes' + '\nPlateforme  : ' + a.label + '\n\nLien de connexion : ' + a.joinUrl + (a.passcode ? "\nCode d'accès : " + a.passcode : '') + '\n\nCordialement,\nTaranis';
    return { subject: 'Réunion — ' + a.title, body };
  }
  const greeting = a.inviteeName ? 'Hello ' + a.inviteeName + ',' : 'Hello,';
  const body = greeting + '\n\nYou are invited to: ' + a.title + '\n\nWhen      : ' + a.when + ' (' + a.tz + ')' + '\nDuration  : ' + a.minutes + ' minutes' + '\nPlatform  : ' + a.label + '\n\nJoin: ' + a.joinUrl + (a.passcode ? '\nPasscode: ' + a.passcode : '') + '\n\nKind regards,\nTaranis';
  return { subject: 'Meeting — ' + a.title, body };
}

function buildICS(a: { title: string; startUtc: string; endUtc: string; joinUrl: string; body: string; organizer: string; attendees: string[]; }): string {
  const stamp = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const esc = (s: string) => String(s || '').replace(/([,;\\])/g, '\\$1').replace(/\r?\n/g, '\\n');
  const att = (a.attendees || []).map((e) => 'ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE;CN=' + e + ':mailto:' + e);
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Taranis//CRM//EN', 'CALSCALE:GREGORIAN', 'METHOD:REQUEST',
    'BEGIN:VEVENT',
    'UID:' + crypto.randomUUID() + '@taranis.crm',
    'DTSTAMP:' + stamp(new Date().toISOString()),
    'DTSTART:' + stamp(a.startUtc),
    'DTEND:' + stamp(a.endUtc),
    'SUMMARY:' + esc(a.title),
    'DESCRIPTION:' + esc(a.body),
    'LOCATION:' + esc(a.joinUrl),
    'ORGANIZER;CN=Taranis:mailto:' + a.organizer,
    ...att,
    'CLASS:PUBLIC', 'PRIORITY:5', 'STATUS:CONFIRMED', 'SEQUENCE:0', 'TRANSP:OPAQUE', 'X-MICROSOFT-CDO-BUSYSTATUS:BUSY',
    'END:VEVENT', 'END:VCALENDAR'
  ].join('\r\n');
}

async function sendEmail(args: { to: string[]; cc: string[]; bcc: string[]; subject: string; text: string; ics: string; }): Promise<string> {
  const host = Deno.env.get('SMTP_HOST');
  const user = Deno.env.get('SMTP_USER');
  const pass = Deno.env.get('SMTP_PASS');
  const port = Number(Deno.env.get('SMTP_PORT') || '587');
  const from = Deno.env.get('SMTP_FROM') || 'nada.osama@taranis.net';
  if (!host || !user || !pass) return 'Email is not configured on the server (set SMTP_HOST, SMTP_USER, SMTP_PASS).';
  if (!args.to.length && !args.cc.length && !args.bcc.length) return 'No recipients.';
  try {
    const { SMTPClient } = await import('https://deno.land/x/denomailer@1.6.0/mod.ts');
    const secure = (Deno.env.get('SMTP_SECURE') || (port === 465 ? 'true' : 'false')) === 'true';
    const client = new SMTPClient({ connection: { hostname: host, port, tls: secure, auth: { username: user, password: pass } } });
    await client.send({
      from,
      to: args.to.length ? args.to : [from],
      cc: args.cc.length ? args.cc : undefined,
      bcc: args.bcc.length ? args.bcc : undefined,
      subject: args.subject,
      mimeContent: [
        { mimeType: 'text/plain; charset=utf-8', content: args.text },
        ...(args.ics ? [{ mimeType: 'text/calendar; charset=utf-8; method=REQUEST', content: args.ics }] : [])
      ],
      attachments: args.ics ? [{ encoding: 'base64', content: btoa(unescape(encodeURIComponent(args.ics))), filename: 'invite.ics', contentType: 'application/ics; name=invite.ics' }] : []
    });
    await client.close();
    return '';
  } catch (e) { return 'The mail server refused the message: ' + String((e as Error).message ?? e); }
}

type Meeting = { title: string; startUtc: string; endUtc: string; minutes: number; tz: string; invite: string[]; };
const PLATFORM: Record<string, string> = { zoom: 'Zoom', teams: 'Microsoft Teams', meet: 'Google Meet' };
const MAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
function addresses(v: unknown): string[] {
  const list = Array.isArray(v) ? v : String(v ?? '').split(/[,;\s]+/);
  const out: string[] = [];
  for (const p of list) {
    const addr = String((p && typeof p === 'object' ? (p as { email?: string }).email : p) ?? '').trim().toLowerCase();
    if (MAIL.test(addr) && !out.includes(addr)) out.push(addr);
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return refuse('Send a POST.');

  const auth = req.headers.get('Authorization') ?? '';
  if (!auth.startsWith('Bearer ')) return json({ ok: false, message: 'Signed out.' }, 401);

  const url = Deno.env.get('SUPABASE_URL')!;
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  const asCaller = createClient(url, anon, { global: { headers: { Authorization: auth } } });
  const { data: who, error: whoErr } = await asCaller.auth.getUser();
  if (whoErr || !who?.user?.email) return json({ ok: false, message: 'Signed out.' }, 401);
  const email = who.user.email.toLowerCase();

  const admin = createClient(url, service);
  const { data: allowed } = await admin.from('console_users').select('email').eq('email', email).maybeSingle();
  if (!allowed) return json({ ok: false, message: 'Not on the allow list. Ask an admin to add you.' }, 403);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return refuse('That was not JSON.'); }

  if (String(body.action ?? '').toLowerCase() === 'cancel') {
    const id = String(body.meeting_id ?? '');
    if (!id) return refuse('No meeting was named.');
    const { data: row } = await admin.from('crm_meetings').select('id, provider, event_id, status, title').eq('id', id).maybeSingle();
    if (!row) return refuse('That meeting is no longer in the table.');
    if (row.status === 'cancelled') return json({ ok: true, message: 'Already cancelled.' });
    const why = await cancelOnPlatform(String(row.provider ?? 'zoom'), String(row.event_id ?? ''));
    await admin.from('crm_meetings').update({ status: 'cancelled', updated_at: new Date().toISOString() }).eq('id', id);
    return json({ ok: why === '', meeting_id: id, status: 'cancelled', message: why === '' ? 'Cancelled, and removed from the platform.' : 'Cancelled here, but the platform kept it: ' + why });
  }

  const provider = String(body.provider ?? 'zoom').toLowerCase();
  const title = String(body.title ?? '').trim() || 'Meeting';
  const tz = String(body.tz ?? 'Africa/Cairo').trim() || 'Africa/Cairo';
  const minutes = Number(body.duration_min) || 30;
  const inviteeName = String(body.invitee_name ?? '').trim();
  const lang2 = String(body.language ?? 'en').slice(0, 2).toLowerCase();
  const language: Lang = (lang2 === 'fr' || lang2 === 'ar') ? lang2 : 'en';
  const send = body.send_invitations !== false;
  const reuseId = String(body.meeting_id ?? '').trim();

  const people = Array.isArray(body.to_people) ? body.to_people : [];
  const invite = addresses(people);
  const cc = addresses(body.cc);
  const bcc = addresses(body.bcc);

  if (!PLATFORM[provider] && !reuseId) return refuse('Taranis books on Zoom, Microsoft Teams or Google Meet. It was asked for "' + provider + '".');

  let issued: { join_url: string; passcode: string; external_id: string };
  let rowId: string | null = null;
  let isReuse = false;
  let start: Date;
  let effProvider = provider;

  const reuseRow = reuseId ? (await admin.from('crm_meetings').select('*').eq('id', reuseId).maybeSingle()).data : null;

  if (reuseRow && reuseRow.meet_url) {
    isReuse = true;
    rowId = String(reuseRow.id);
    effProvider = String(reuseRow.provider ?? provider);
    issued = { join_url: String(reuseRow.meet_url), passcode: String(reuseRow.passcode ?? ''), external_id: String(reuseRow.event_id ?? '') };
    start = new Date(String(reuseRow.start_utc ?? body.start_utc ?? ''));
    if (isNaN(start.getTime())) start = new Date();
  } else {
    start = new Date(String(body.start_utc ?? ''));
    if (isNaN(start.getTime())) return refuse('No usable start time was supplied.');
    const end0 = new Date(start.getTime() + minutes * 60000);
    const meeting: Meeting = { title, minutes, tz, startUtc: start.toISOString(), endUtc: end0.toISOString(), invite: send ? invite : [] };
    try {
      issued = provider === 'zoom' ? await createZoom(meeting) : provider === 'teams' ? await createTeams(meeting) : await createMeet(meeting);
    } catch (e) {
      const { data: row } = await admin.from('crm_meetings').insert({ title, start_utc: meeting.startUtc, duration_min: minutes, tz, to_people: people, provider, status: 'pending', created_by: email }).select('id').maybeSingle();
      return json({ ok: false, join_url: '', provider, status: 'pending', meeting_id: row?.id ?? null, message: String((e as Error).message ?? e) });
    }
  }

  const end = new Date(start.getTime() + minutes * 60000);

  const when = new Intl.DateTimeFormat(language === 'fr' ? 'fr-FR' : language === 'ar' ? 'ar' : 'en-GB',
    { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: tz }).format(start);

  const built = buildInvitation(language, { inviteeName, title, when, tz, minutes, label: PLATFORM[effProvider] ?? 'Zoom', joinUrl: issued.join_url, passcode: issued.passcode });
  const subject = String(body.subject ?? '').trim() || built.subject;
  const invitationText = String(body.body ?? '').trim() || built.body;

  if (isReuse && rowId) {
    await admin.from('crm_meetings').update({ title, duration_min: minutes, tz, to_people: people, status: 'scheduled', invitation_subject: subject, invitation_body: invitationText, invitation_language: language, updated_at: new Date().toISOString() }).eq('id', rowId);
  } else {
    const { data: row } = await admin.from('crm_meetings').insert({ title, start_utc: start.toISOString(), duration_min: minutes, tz, to_people: people, provider, status: 'scheduled', meet_url: issued.join_url, passcode: issued.passcode || null, event_id: issued.external_id || null, created_by: email, invitation_subject: subject, invitation_body: invitationText, invitation_language: language }).select('id').maybeSingle();
    rowId = row?.id ?? null;
  }

  let emailStatus = '';
  let emailed = false;
  const wantsEmail = send && (invite.length || cc.length || bcc.length);
  if (wantsEmail) {
    const fromAddr = Deno.env.get('SMTP_FROM') || 'nada.osama@taranis.net';
    const ics = buildICS({ title, startUtc: start.toISOString(), endUtc: end.toISOString(), joinUrl: issued.join_url, body: invitationText, organizer: fromAddr, attendees: invite.concat(cc) });
    emailStatus = await sendEmail({ to: invite, cc, bcc, subject, text: invitationText, ics });
    emailed = emailStatus === '';
  }

  return json({ ok: true, join_url: issued.join_url, passcode: issued.passcode, provider: effProvider, meeting_id: rowId, status: 'scheduled', reused: isReuse, message: invitationText, subject, language, invited: invite.join(','), when_local: when, emailed, email_status: emailStatus || (wantsEmail ? 'sent' : 'not requested') });
});
