/* Loads the real create-meeting handler (supabase/functions/create-meeting/
   index.ts) under Node, with Zoom, Google, Microsoft, the database and the
   mail server replaced by recorders (edge-stubs.mjs). Import it once per test
   file; call reset() before each test. Everything the handler sends out is on
   state(): mail, calls (HTTP), writes (database) and db (the rows). */
import { register } from 'node:module';

register('./edge-loader.mjs', import.meta.url);

export const ORGANISER = 'nada.osama@taranis.net';
export const ENV = {
  SUPABASE_URL: 'https://db.test', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'service',
  ZOOM_CLIENT_ID: 'z', ZOOM_CLIENT_SECRET: 'z', ZOOM_ACCOUNT_ID: 'z',
  GOOGLE_CLIENT_ID: 'g', GOOGLE_CLIENT_SECRET: 'g', GOOGLE_REFRESH_TOKEN: 'g',
  MS_TENANT_ID: 'm', MS_CLIENT_ID: 'm', MS_CLIENT_SECRET: 'm', MS_ORGANISER_ID: 'organiser',
  SMTP_HOST: 'smtp.test', SMTP_USER: 'u', SMTP_PASS: 'p', SMTP_FROM: 'sender@taranis.net',
  FIREFLIES_CALENDAR_EMAIL: 'fireflies-calendar@example.com'
};
export const env = { ...ENV };
let handler = null;
let zoomFails = false;

globalThis.Deno = { env: { get: (k) => env[k] }, serve: (h) => { handler = h; } };
globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  const body = init.body && typeof init.body === 'string' ? JSON.parse(init.body) : null;
  globalThis.__edge.calls.push({ url: u, method: init.method, body });
  const ok = (x) => new Response(JSON.stringify(x), { status: 200 });
  if (u.startsWith('https://zoom.us/oauth/token')) return ok({ access_token: 'zt' });
  if (u === 'https://api.zoom.us/v2/users/me/meetings') {
    if (zoomFails) return new Response(JSON.stringify({ message: 'Zoom is down' }), { status: 500 });
    return ok({ join_url: 'https://zoom.us/j/123', password: 'pw', id: 123, timezone: body.timezone,
      start_time: '2026-09-23T09:00:00Z' });
  }
  if (u.startsWith('https://oauth2.googleapis.com/token')) return ok({ access_token: 'gt' });
  if (u.startsWith('https://www.googleapis.com/calendar/v3/calendars/primary/events')) {
    return ok({ hangoutLink: 'https://meet.google.com/abc-defg-hij', id: 'ev1' });
  }
  if (u.startsWith('https://login.microsoftonline.com/')) return ok({ access_token: 'mt' });
  if (u.startsWith('https://graph.microsoft.com/')) return ok({ joinWebUrl: 'https://teams.microsoft.com/l/x', id: 't1' });
  throw new Error('Unexpected fetch ' + u);
};

export function reset() {
  for (const k of Object.keys(env)) delete env[k];
  Object.assign(env, ENV);
  zoomFails = false;
  globalThis.__edge = { user: ORGANISER, mail: [], writes: [], calls: [],
    db: { console_users: [{ email: ORGANISER }], crm_meetings: [] } };
}
reset();

export const failZoom = () => { zoomFails = true; };
export const state = () => globalThis.__edge;

await import('../../supabase/functions/create-meeting/index.ts');

export async function call(body) {
  const res = await handler(new Request('https://edge.test/create-meeting', {
    method: 'POST', headers: { Authorization: 'Bearer t', 'Content-Type': 'application/json' },
    body: JSON.stringify(body) }));
  return res.json();
}
