/* =========================================================================
   Taranis CRM
   -------------------------------------------------------------------------
   Replaces the Telegram bots with a signed-in web console.

   SECURITY MODEL — read before changing anything here.

   1. This file ships to a public CDN. It therefore contains NO secrets.
      No Telegram bot token, no Postgres password, no n8n API key, no
      Supabase service_role key. The only key present is the Supabase
      ANON key, which is safe to publish because Row Level Security
      decides what it can read.

   2. Every call to n8n carries the signed-in user's Supabase JWT in the
      Authorization header. The n8n gateway verifies that JWT before it
      does anything. A caller without a valid token gets 401 — the old
      "is the Telegram user id 848084617?" check becomes a real one.

   3. Nothing from the database or the assistant is ever written with
      innerHTML. Text goes in through textContent. See el() and text().
      A contact name containing a script tag renders as characters.

   4. Config is injected at build time by GitHub Actions from repository
      secrets (see .github/workflows/deploy.yml). config.js is gitignored.
   ========================================================================= */

'use strict';

/* ---------------------------------------------------------------- config */

const CFG = Object.assign({
  gatewayUrl: '',        // https://quantcairo.app.n8n.cloud/webhook/console
  supabaseUrl: '',       // https://xxxx.supabase.co
  supabaseAnonKey: '',
  pollSeconds: 120,
  build: ''            // commit hash stamped in by GitHub Actions
}, window.TARANIS_CONFIG || {});

let DEMO = false;                 // sample-data mode
let session = null;               // { email, token }
let pollTimer = null;
const counts = { today: 0, approvals: 0 };
const PENDING = { q: null, qmode: null, draft: null, meet: null };   // a question handed from one tab to another

/* ------------------------------------------------------------- DOM utils */

/** Build an element. Children are appended as TEXT unless they are Nodes. */
function el(tag, attrs, ...kids) {
  const n = document.createElement(tag);
  if (attrs) for (const k in attrs) {
    if (k === 'class') n.className = attrs[k];
    else if (k === 'onclick') n.addEventListener('click', attrs[k]);
    else if (k === 'oninput') n.addEventListener('input', attrs[k]);
    else if (k === 'onkeydown') n.addEventListener('keydown', attrs[k]);
    else if (attrs[k] !== null && attrs[k] !== undefined) n.setAttribute(k, attrs[k]);
  }
  for (const c of kids.flat()) {
    if (c === null || c === undefined || c === false) continue;
    n.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return n;
}
const $ = (id) => document.getElementById(id);
function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

function toast(msg, bad) {
  const t = $('toast');
  t.textContent = msg;
  t.className = 'on' + (bad ? ' bad' : '');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { t.className = ''; }, 3600);
}

/* PostgREST hands jsonb back as real objects and arrays, not strings. The
   gateway used to cast them with ::text, so the app never saw one. Rendered
   raw they come out as [object Object], or as nothing at all when empty. */
function asText(v) {
  if (v === null || v === undefined || v === '') return '';
  if (Array.isArray(v)) {
    return v.map(x => (x && typeof x === 'object')
      ? (x.name || x.label || x.value || JSON.stringify(x))
      : String(x)).filter(Boolean).join(', ');
  }
  if (typeof v === 'object') {
    const parts = [];
    for (const k in v) if (v[k] !== null && v[k] !== '') parts.push(k + ': ' + v[k]);
    return parts.join(', ');
  }
  return String(v);
}

function fmtDate(v) {
  if (!v) return '—';
  const d = new Date(v);
  if (isNaN(d)) return String(v);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}
function daysSince(v) {
  if (!v) return null;
  const d = new Date(v);
  if (isNaN(d)) return null;
  return Math.floor((Date.now() - d.getTime()) / 86400000);
}

/* --------------------------------------------------------------- gateway */

/**
 * One door to n8n. Every workflow action goes through this.
 * The gateway workflow reads { action, payload } and routes to the
 * matching sub-workflow, exactly as the Telegram command router did.
 */
async function callGateway(action, payload) {
  if (DEMO) return demoResponse(action, payload);

  if (!CFG.gatewayUrl) throw new Error('No gateway configured. Set TARANIS_CONFIG.gatewayUrl.');
  if (!session || !session.token) throw new Error('Signed out. Sign in again.');
  await ensureToken();

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 60000);
  try {
    const res = await fetch(CFG.gatewayUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + session.token
      },
      body: JSON.stringify({ action, payload: payload || {} }),
      signal: ctrl.signal,
      credentials: 'omit',
      mode: 'cors'
    });
    if (res.status === 401 || res.status === 403) {
      signOut();
      throw new Error('Your session expired. Sign in again.');
    }
    if (!res.ok) throw new Error('Gateway returned ' + res.status);
    // n8n sends a zero-length body when a query matched nothing. That is not
    // an error, it is an empty answer, so do not let JSON.parse turn it into one.
    const raw = (await res.text()).trim();
    if (!raw) return { rows: [], items: [] };
    try { return JSON.parse(raw); }
    catch (_) { return { rows: [], items: [] }; }
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('That took too long. Try again.');
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/* ------------------------------------------------- read straight from Supabase

   Reading goes to Supabase directly over PostgREST rather than through n8n.
   Two reasons: the contact book and the mandate list are plain SELECTs that
   need no workflow logic, and this means every read-only tab works as soon
   as the database is connected — before the gateway exists at all.

   Row Level Security decides what comes back, so the anon key in the page
   grants nothing on its own. Writes still go through the gateway, because
   approving or sending has to run the workflow behind it.
   ------------------------------------------------------------------------- */

async function supaSelect(table, query) {
  if (!CFG.supabaseUrl || !session || !session.token) throw new Error('NO_SUPABASE');
  await ensureToken();
  const res = await fetch(CFG.supabaseUrl + '/rest/v1/' + table + '?' + query, {
    headers: {
      apikey: CFG.supabaseAnonKey,
      Authorization: 'Bearer ' + session.token,
      Accept: 'application/json'
    }
  });
  if (res.status === 401 || res.status === 403) throw new Error('Not permitted. Ask for access to be added.');
  if (!res.ok) throw new Error('Database returned ' + res.status);
  return await res.json();
}

/** Write one row straight to a table. Returns the stored row. */
async function supaInsert(table, row) {
  if (!CFG.supabaseUrl || !session || !session.token) throw new Error('NO_SUPABASE');
  await ensureToken();
  const res = await fetch(CFG.supabaseUrl + '/rest/v1/' + table, {
    method: 'POST',
    headers: {
      apikey: CFG.supabaseAnonKey,
      Authorization: 'Bearer ' + session.token,
      'Content-Type': 'application/json',
      Prefer: 'return=representation'
    },
    body: JSON.stringify(row)
  });
  if (res.status === 401 || res.status === 403) {
    throw new Error('Not permitted to save. The notes table needs an insert policy.');
  }
  if (!res.ok) throw new Error('Database returned ' + res.status + ' saving to ' + table);
  const back = await res.json();
  return Array.isArray(back) ? back[0] : back;
}

/** Try Supabase, fall back to the gateway, so a tab works either way. */
async function readRows(table, query, action, payload) {
  if (DEMO) { const d = await demoResponse(action); return d.rows || []; }
  try {
    return await supaSelect(table, query);
  } catch (e) {
    if (e.message !== 'NO_SUPABASE') throw e;
    const d = await callGateway(action, payload);
    return d.rows || [];
  }
}

/** Upload a file to Supabase Storage. Returns the stored path. */
async function uploadToStorage(file, path, onProgress) {
  await ensureToken();
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', CFG.supabaseUrl + '/storage/v1/object/documents/' + encodeURI(path));
    xhr.setRequestHeader('apikey', CFG.supabaseAnonKey);
    xhr.setRequestHeader('Authorization', 'Bearer ' + session.token);
    xhr.setRequestHeader('x-upsert', 'false');
    if (file.type) xhr.setRequestHeader('Content-Type', file.type);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve(path);

      // Storage explains itself in the body, and throwing that away turned
      // every failure into a bare number. Supabase also answers an RLS
      // refusal with 400 rather than 403, so the status alone misleads.
      let why = '';
      try {
        const e = JSON.parse(xhr.responseText || '{}');
        why = e.message || e.error || '';
        if (/row-level security|Unauthorized|403/i.test(why + ' ' + (e.statusCode || ''))) {
          return reject(new Error('The documents bucket will not accept uploads from the console. '
            + 'It needs a storage insert policy. (' + why + ')'));
        }
        if (/Bucket not found/i.test(why)) {
          return reject(new Error('There is no bucket called "documents" in this project.'));
        }
        if (/exceeded|too large/i.test(why)) {
          return reject(new Error('The bucket rejects a file this size. Raise its limit in Storage settings.'));
        }
      } catch (_) { /* not JSON; fall through to the status */ }

      if (xhr.status === 409) return reject(new Error('A file with that name is already stored. Change the version label.'));
      if (xhr.status === 401 || xhr.status === 403) return reject(new Error('Not allowed to upload. Ask for the documents bucket to be opened to you.'));
      reject(new Error('Upload failed (' + xhr.status + ')' + (why ? ': ' + why : '')));
    };
    xhr.onerror = () => reject(new Error('Upload failed. Check your connection.'));
    xhr.send(file);
  });
}

/* ------------------------------------------------------------------ auth */

/* Email + password, not a magic link. The project's built-in SMTP is capped at
   two messages an hour and cannot be raised, which made links unusable. Nothing
   about the security model changes: Supabase still issues the JWT, the gateway
   still verifies it against /auth/v1/user, and console_users is still the list
   that decides who is allowed in. Passwords are set by an admin in Supabase;
   this page never creates an account. */

const SESSION_KEY = 'taranis.session';

async function signInWithPassword(email, password) {
  const res = await fetch(CFG.supabaseUrl + '/auth/v1/token?grant_type=password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: CFG.supabaseAnonKey },
    body: JSON.stringify({ email, password })
  });
  let data = {};
  try { data = await res.json(); } catch (_) { /* fall through to the generic message */ }
  if (!res.ok) {
    const m = String(data.error_description || data.msg || data.error || '');
    if (/invalid login/i.test(m))  throw new Error('That email and password do not match.');
    if (/not confirmed/i.test(m))  throw new Error('This account has not been confirmed. Ask an admin to confirm it in Supabase.');
    if (/rate limit|too many/i.test(m)) throw new Error('Too many attempts. Wait a minute and try again.');
    throw new Error(m || 'Could not sign in.');
  }
  return {
    token:   data.access_token,
    refresh: data.refresh_token,
    email:   (data.user && data.user.email) || email,
    expires: Date.now() + (Number(data.expires_in || 3600) * 1000)
  };
}

/* Held in sessionStorage, not localStorage: it survives a page refresh, which
   is what stops a reload throwing you back to the cover, and it is discarded
   when the tab is closed. */
function saveSession(s) {
  session = s;
  try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(s)); } catch (_) { /* private mode */ }
}

function loadSession() {
  try { const raw = sessionStorage.getItem(SESSION_KEY); return raw ? JSON.parse(raw) : null; }
  catch (_) { return null; }
}

/** Supabase tokens last an hour. Trade the refresh token for a fresh one. */
async function refreshSession() {
  if (!session || !session.refresh) return false;
  try {
    const res = await fetch(CFG.supabaseUrl + '/auth/v1/token?grant_type=refresh_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: CFG.supabaseAnonKey },
      body: JSON.stringify({ refresh_token: session.refresh })
    });
    if (!res.ok) return false;
    const d = await res.json();
    if (!d.access_token) return false;
    saveSession({
      token:   d.access_token,
      refresh: d.refresh_token || session.refresh,
      email:   session.email,
      expires: Date.now() + (Number(d.expires_in || 3600) * 1000)
    });
    return true;
  } catch (_) { return false; }
}

/** Called before every authenticated request, so the hour never runs out mid-click. */
async function ensureToken() {
  if (DEMO || !session || !session.token) return;
  if (!session.expires || Date.now() < session.expires - 120000) return;
  if (!(await refreshSession())) {
    signOut();
    throw new Error('Your session expired. Sign in again.');
  }
}

/** Supabase returns the token in the URL fragment after the link is used. */
function readTokenFromUrl() {
  if (!location.hash || location.hash.length < 2) return null;
  const p = new URLSearchParams(location.hash.slice(1));
  const token = p.get('access_token');
  if (!token) return null;
  history.replaceState(null, '', location.pathname + location.search);
  let email = '';
  try {
    const body = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    email = body.email || '';
  } catch (_) { /* token still usable; the gateway is the real verifier */ }
  return { token, email };
}

function signOut() {
  session = null;
  DEMO = false;
  try { sessionStorage.removeItem(SESSION_KEY); } catch (_) {}
  if (pollTimer) clearInterval(pollTimer);
  $('app').className = '';
  $('gate').style.display = 'grid';
}

/* ------------------------------------------------------------------ tabs */

const TABS = [
  { id: 'today',    icon: '\u25CF', label: 'Today',        title: 'Today',
    sub: 'What arrived while you were away, and what is waiting on you.' },
  { id: 'approvals',icon: '\u25C6', label: 'Approvals',    title: 'Approvals',
    sub: 'Opportunities the screen could not settle on its own. Approve, correct, or reject.' },
  { id: 'contacts', icon: '\u25A0', label: 'Contacts',     title: 'Contacts',
    sub: 'The fundraising book. Who knows Taranis, when you last spoke, and what is owed.' },
  { id: 'notes',    icon: '\u25A5', label: 'Notes',        title: 'Notes',
    sub: 'What was said, where, and with whom. Linked to the contact book when the person is in it.' },
  { id: 'email',    icon: '\u2709', label: 'Email',        title: 'Email',
    sub: 'Draft to a contact, read it back, then send. Nothing leaves without you approving it.' },
  { id: 'inbox',    icon: '\u25A4', label: 'Follow up',      title: 'Follow up',
    sub: 'Who is owed a reply and who has gone quiet, clients first. Every message is still here if you need it.' },
  { id: 'opps',     icon: '\u25B2', label: 'Opportunities',title: 'Opportunities',
    sub: 'Mandates from With Intelligence, scored against the Taranis criteria.' },
  { id: 'meetings', icon: '\u25D0', label: 'Zoom meetings', title: 'Zoom meetings',
    sub: 'Scheduled, waiting on approval, or cancelled. The join link and passcode live here.' },
  { id: 'docs',     icon: '\u25AC', label: 'Documents',    title: 'Documents',
    sub: 'Upload a deck or report, and it is versioned, stored and announced to the team.' },
  { id: 'reports',  icon: '\u25F0', label: 'Reports',      title: 'Weekly report',
    sub: 'The Friday dashboard, read from the stored snapshot rather than a Telegram attachment.' },
  { id: 'network',  icon: '\u25CB', label: 'Network',      title: 'LinkedIn network',
    sub: 'First-degree connections, separate from the contact book.' },
  { id: 'ask',      icon: '\u25C7', label: 'Ask',          title: 'Ask',
    sub: 'Anything you used to type into the bot. It queries before it answers.' }
];

let current = 'today';

function buildNav() {
  const list = $('navlist');
  clear(list);
  for (const t of TABS) {
    const b = el('button', {
      class: 'navbtn', type: 'button', 'data-tab': t.id,
      onclick: () => go(t.id)
    }, el('span', { class: 'ic' }, t.icon), el('span', null, t.label));
    list.appendChild(b);
  }
  paintCounts();
}

function paintCounts() {
  document.querySelectorAll('.navbtn').forEach(b => {
    const id = b.getAttribute('data-tab');
    b.querySelectorAll('.ct').forEach(x => x.remove());
    const n = counts[id];
    if (n > 0) b.appendChild(el('span', { class: 'ct' }, String(n)));
  });
}

function go(id) {
  current = id;
  const t = TABS.find(x => x.id === id);
  document.querySelectorAll('.navbtn').forEach(b =>
    b.setAttribute('aria-current', b.getAttribute('data-tab') === id ? 'page' : 'false'));
  $('pg-title').textContent = t.title;
  $('pg-sub').textContent = t.sub;
  const body = $('pg-body');
  clear(body);
  body.appendChild(el('p', { class: 'mono', style: 'color:var(--ink-3);font-size:12px' }, 'Loading…'));
  RENDER[id](body);
}

/* ------------------------------------------------------- entry component */

/**
 * The console's one visual grammar, borrowed from how the assistant is told
 * to answer: the action first, then the evidence for it, indented.
 */
function entry(o) {
  const rail = el('div', { class: 'entry-rail' },
    el('span', { class: 'dot ' + (o.tone || '') }),
    o.rail ? el('span', { class: 'rail-n' }, o.rail) : null);

  const ev = el('div', { class: 'ev' });
  for (const [k, v] of (o.evidence || [])) {
    if (v === null || v === undefined || v === '') continue;
    const hot = /last spoke|email|starts|on\s/.test(k);
    ev.appendChild(el('div', null,
      el('span', { class: 'k' }, k + '  '),
      hot ? el('span', { class: 'gold' }, String(v)) : document.createTextNode(String(v))));
  }

  const main = el('div', { class: 'entry-main' },
    el('p', { class: 'entry-act' }, o.action),
    o.who ? el('p', { class: 'entry-who' }, o.who) : null,
    (o.evidence && o.evidence.length) ? ev : null);

  if (o.tags && o.tags.length) {
    const row = el('div', { class: 'acts' });
    for (const t of o.tags) row.appendChild(el('span', { class: 'tag ' + (t[1] || '') }, t[0]));
    main.insertBefore(row, main.firstChild.nextSibling);
  }
  if (o.actions && o.actions.length) {
    const row = el('div', { class: 'acts' });
    for (const a of o.actions) {
      row.appendChild(el('button', { class: 'btn btn-sm ' + (a.primary ? '' : 'btn-quiet'), onclick: a.run }, a.label));
    }
    main.appendChild(row);
  }
  return el('div', { class: 'entry' }, rail, main);
}

/** Send a question to the Ask tab from anywhere else in the console. */
function askAbout(q, mode) {
  // History and the other in-app shortcuts default to Ask only, so they
  // keep working when n8n is out of executions.
  PENDING.q = q;
  PENDING.qmode = mode || 'local';
  go('ask');
}

function empty(headline, note) {
  return el('div', { class: 'empty' },
    el('div', { class: 'big' }, headline),
    el('p', null, note || ''));
}

/** Same shape as load(), but the caller supplies the fetch itself. */
async function fill(body, get, draw) {
  try {
    const rows = await get();
    clear(body);
    draw(rows);
  } catch (e) {
    clear(body);
    body.appendChild(el('div', { class: 'banner' }, el('b', null, 'Could not load. '), e.message));
  }
}

async function load(body, action, payload, draw) {
  try {
    const data = await callGateway(action, payload);
    clear(body);
    draw(data);
  } catch (e) {
    clear(body);
    body.appendChild(el('div', { class: 'banner' },
      el('b', null, 'Could not load. '), e.message));
  }
}

/* --------------------------------------------------------------- renders */

const RENDER = {};

/* What WI 01 screened lately, and why it threw things out. The reasons live
   in hard_fail_reasons on each mandate, which is the same column OPS 02
   counts for the Friday dashboard, so the two always agree. */
async function wiStrip(host) {
  try {
    const since = new Date(Date.now() - 7 * 864e5).toISOString();
    const rows = await readRows('wi_mandates',
      'select=qualification,hard_fail_reasons,fit_reason,created_at'
      + '&created_at=gte.' + since + '&limit=500', 'wi.mandates.list', {});
    if (!rows.length) return;

    const by = { matched: 0, uncertain: 0, rejected: 0 };
    const why = {};
    for (const r of rows) {
      const q = String(r.qualification || '').toLowerCase();
      if (by[q] !== undefined) by[q] += 1;
      if (q !== 'rejected') continue;
      let reasons = r.hard_fail_reasons;
      if (typeof reasons === 'string') { try { reasons = JSON.parse(reasons); } catch (_) { reasons = []; } }
      if (!Array.isArray(reasons) || !reasons.length) reasons = r.fit_reason ? [r.fit_reason] : ['not stated'];
      for (const x of reasons) { const k = String(x).trim(); if (k) why[k] = (why[k] || 0) + 1; }
    }
    const top = Object.keys(why).sort((x, y) => why[y] - why[x]).slice(0, 5);

    const num = (n, lbl, cls) => el('div', { style: 'min-width:96px' },
      el('div', { class: 'mono', style: 'font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--ink-3)' }, lbl),
      el('div', { style: 'font-size:24px;font-weight:600;' + (cls || '') }, String(n)));

    const box = el('div', { style: 'border:1px solid var(--rule);border-radius:10px;padding:16px 18px;margin-bottom:22px;background:var(--card)' },
      el('p', { class: 'mono',
        style: 'font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--ink-3);margin:0 0 12px' },
        'Screening \u2014 last 7 days'),
      el('div', { style: 'display:flex;gap:26px;flex-wrap:wrap;margin-bottom:' + (top.length ? '14px' : '0') },
        num(rows.length, 'screened'),
        num(by.matched, 'matched', 'color:var(--good)'),
        num(by.uncertain, 'to review', 'color:var(--signal)'),
        num(by.rejected, 'rejected', 'color:var(--bad)')));

    if (top.length) {
      box.appendChild(el('p', { class: 'mono',
        style: 'font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--ink-3);margin:0 0 6px' },
        'Why they were rejected'));
      const list = el('div', { class: 'ev' });
      for (const k of top) {
        list.appendChild(el('div', null,
          el('span', { class: 'k' }, String(why[k]).padStart(3, ' ') + '  '), k));
      }
      box.appendChild(list);
      box.appendChild(el('div', { class: 'acts' },
        el('button', { class: 'btn btn-sm btn-quiet', onclick: () => go('opps') }, 'See the mandates'),
        by.uncertain ? el('button', { class: 'btn btn-sm', onclick: () => go('approvals') },
          by.uncertain + ' waiting on you') : null));
    }
    host.insertBefore(box, host.firstChild);
  } catch (_) { /* the feed still shows without it */ }
}

RENDER.today = function (body) {
  const strip = el('div');
  body.appendChild(strip);
  wiStrip(strip);

  const feed = el('div');
  body.appendChild(feed);
  body = feed;

  fill(body, async () => {
    if (DEMO) { const d = await demoResponse('today.feed'); return { items: d.items || [] }; }
    const rows = await readRows('app_notifications',
      'select=id,kind,source,title,subtitle,fields,review_id,created_at,read_at'
      + '&order=created_at.desc&limit=40', 'today.feed', {});
    return { items: rows.map(r => Object.assign({}, r, {
      at: r.created_at, read: r.read_at !== null && r.read_at !== undefined
    })) };
  }, (d) => {
    const items = d.items || [];
    counts.today = items.filter(i => !i.read).length;
    paintCounts();
    if (!items.length) return body.appendChild(empty('Nothing waiting', 'New alerts, reviews and replies land here.'));
    for (const i of items) {
      body.appendChild(entry({
        tone: i.kind === 'review' ? 'signal' : i.kind === 'matched' ? 'good' : 'accent',
        rail: i.source || '',
        action: i.title,
        who: i.subtitle,
        evidence: (i.fields || []).map(f => [f.label, f.value]),
        tags: [[i.kind, i.kind === 'review' ? 'signal' : i.kind === 'matched' ? 'good' : 'accent'],
               [fmtDate(i.at), '']],
        actions: i.review_id ? [
          { label: 'Review', primary: true, run: () => go('approvals') }
        ] : []
      }));
    }
  });
};

RENDER.approvals = function (body) {
  // Was the last tab still going through n8n. When the gateway refuses on
  // the execution cap its error carries no CORS header, so the browser threw
  // the response away and reported "Failed to fetch" instead of a reason.
  // wi_mandates is readable directly, so nothing here needs a workflow.
  fill(body, async () => {
    const rows = await readRows('wi_mandates',
      'select=id,investor_name,organization_name,investor_country,investor_type,'
      + 'ticket_min_usd,fit_score,fit_reason'
      + '&qualification=eq.uncertain&published_at=is.null'
      + '&order=fit_score.desc.nullslast&limit=60',
      'wi.reviews.pending', {});
    return { rows: rows.map(r => Object.assign({}, r, {
      review_id: String(r.id),
      contact_name: r.investor_name,
      company: r.organization_name
    })) };
  }, (d) => {
    const rows = d.rows || [];
    counts.approvals = rows.length;
    paintCounts();
    if (!rows.length) return body.appendChild(empty('Nothing to approve', 'Screened opportunities that need a person appear here.'));
    for (const r of rows) {
      body.appendChild(entry({
        tone: 'signal',
        rail: r.review_id,
        action: r.contact_name || 'Unnamed investor',
        who: r.company || '',
        evidence: [
          ['country ', asText(r.investor_country)],
          ['type    ', asText(r.investor_type)],
          ['ticket  ', r.ticket_min_usd],
          ['score   ', r.fit_score],
          ['reason  ', asText(r.fit_reason)]
        ],
        tags: [['pending', 'signal']],
        actions: [
          { label: 'View profile', run: () => openProfile({ name: r.contact_name || r.company }) },
          { label: 'Approve', primary: true, run: () => act('wi.review.approve', { review_id: r.review_id }, 'Approved') },
          { label: 'Correct a field', run: () => editSheet(r) },
          { label: 'Reject', run: () => act('wi.review.reject', { review_id: r.review_id }, 'Rejected') }
        ]
      }));
    }
  });
};

RENDER.contacts = function (body) {
  const bar = el('div', { class: 'toolbar' });
  const input = el('input', { class: 'search', type: 'search', placeholder: 'Name, firm or city…' });
  let filter = 'all';
  const chips = el('div', { class: 'chips' });
  for (const [k, lbl] of [['all', 'Everyone'], ['clients', 'Clients'], ['taranis', 'Taranis people'],
                          ['knows', 'Knows us'], ['due', 'Due a follow-up'], ['quiet', 'Gone quiet']]) {
    chips.appendChild(el('button', { class: 'chip', onclick: () => { filter = k; run(); } }, lbl));
  }
  bar.append(input, el('button', { class: 'btn btn-sm btn-quiet', onclick: () => run() }, 'Search'));
  const out = el('div');
  clear(body); body.append(bar, chips, out);

  // The book is 400+ people. A fixed 60 silently hid most of it with no
  // sign anything was missing. Page instead: complete, but fast to paint.
  let shown = 120;
  input.addEventListener('keydown', e => { if (e.key === 'Enter') run(); });

  function run(keepCount) {
    if (!keepCount) shown = 120;
    clear(out);
    out.appendChild(el('p', { class: 'mono', style: 'color:var(--ink-3);font-size:12px' }, 'Loading…'));
    fill(out, () => {
      const q = input.value.trim();
      // contacts_app is the view from migration 3: it carries side
      // (taranis / external), the cleaned knows_us, and days_quiet.
      let sel = 'select=*&limit=' + shown + '&order=last_contact_at.desc.nullslast';
      if (q) {
        const t = '*' + q.replace(/[,()*]/g, '') + '*';
        sel += '&or=(name.ilike.' + t + ',company.ilike.' + t + ',city.ilike.' + t + ')';
      }
      if (filter === 'knows')   sel += '&knows_us=in.(yes,vaguely)';
      if (filter === 'due')     sel += '&has_open_next_step=is.true';
      if (filter === 'quiet')   sel += '&or=(days_quiet.gt.60,last_contact_at.is.null)';
      if (filter === 'taranis') sel += '&side=eq.taranis';
      if (filter === 'clients') sel += '&side=eq.external';
      return readRows('contacts_app', sel, 'contacts.search', { q, filter });
    }, (rows) => {
      if (!rows.length) return out.appendChild(empty('No one matches', 'Try a surname, or the firm on its own.'));
      for (const c of rows) {
        const q = (c.days_quiet !== null && c.days_quiet !== undefined)
          ? c.days_quiet : daysSince(c.last_interaction || c.last_contact_at);
        out.appendChild(entry({
          tone: c.knows_us === 'yes' ? 'good' : c.knows_us === 'vaguely' ? 'signal' : '',
          rail: q === null ? 'never' : q + 'd',
          action: c.name,
          who: [c.company, c.city, c.country].filter(Boolean).join(' · '),
          evidence: [
            ['last spoke ', (c.last_contact_at || c.last_interaction)
                ? fmtDate(c.last_contact_at || c.last_interaction) + (q !== null ? '  (' + q + ' days)' : '')
                : 'never'],
            ['email      ', c.email],
            ['about      ', c.last_contact_summary || c.last_contact_note],
            ['next step  ', c.next_step],
            ['ticket     ', c.aum_band],
            ['region     ', c.region],
            ['terms      ', c.introducer_terms],
            ['intel      ', c.intelligence_text || c.raw_notes]
          ],
          tags: [
            [c.knows_us === 'yes' ? 'knows us'
              : c.knows_us === 'vaguely' ? 'vaguely'
              : 'not approached',
             c.knows_us === 'yes' ? 'good' : c.knows_us === 'vaguely' ? 'signal' : 'quiet'],
            c.side === 'taranis' ? ['taranis', 'accent'] : null,
            c.category ? [c.category, ''] : null
          ].filter(Boolean),
          actions: [
            { label: 'View profile', primary: true, run: () => openProfile(c) },
            { label: 'Draft an email', run: () => { PENDING.draft = c.name; go('email'); } },
            { label: 'Book a Zoom', run: () => { PENDING.meet = c.name; go('meetings'); } },
            { label: 'History', run: () => askAbout('What did we send ' + c.name + ' and when was our last contact?') }
          ]
        }));
      }
      // A full page back means there is probably more behind it. Say so,
      // rather than letting the list just stop with no explanation.
      const foot = el('p', { class: 'mono',
        style: 'color:var(--ink-3);font-size:12px;margin-top:18px;display:flex;gap:12px;align-items:center' },
        el('span', null, 'Showing ' + rows.length));
      if (rows.length >= shown) {
        foot.appendChild(el('button', { class: 'btn btn-sm btn-quiet',
          onclick: () => { shown += 200; run(true); } }, 'Show more'));
      }
      out.appendChild(foot);
    });
  }
  run();
};

RENDER.email = function (body) {
  clear(body);
  const to = el('input', { class: 'search', placeholder: 'Contact name, e.g. Miles Kerstein' });
  const brief = el('input', { class: 'search', placeholder: 'What should it say? e.g. share the July TMS and ask for a call' });
  const go1 = el('button', { class: 'btn btn-sm' }, 'Write a draft');
  body.append(
    el('div', { class: 'banner' },
      el('b', null, 'Two steps, same as the bot. '),
      'Writing a draft never sends. The address is resolved from the contact book — nothing is invented.'),
    el('div', { class: 'toolbar' }, to),
    el('div', { class: 'toolbar' }, brief, go1));
  const out = el('div'); body.appendChild(out);
  if (PENDING.draft) { to.value = PENDING.draft; PENDING.draft = null; brief.focus(); }

  /* ------------------------------------------------- who to write to

     The book split the way the fundraising works: clients on one side,
     Taranis people on the other. Name, country, what the last exchange was
     about, and when it was — enough to decide who is worth writing to
     without opening anyone. Picking someone fills the field above.
     Read straight from contacts_app, so this needs no workflow. */

  let side = 'external', findTimer = null;
  const find = el('input', { class: 'search', type: 'search',
    placeholder: 'Search by name, firm, city or country\u2026' });
  find.addEventListener('input', () => { clearTimeout(findTimer); findTimer = setTimeout(runList, 300); });

  const sideChips = el('div', { class: 'chips' });
  const sideBtns = {};
  for (const [k, lbl] of [['external', 'Clients'], ['taranis', 'Taranis people'],
                          ['quiet', 'Gone quiet'], ['all', 'Everyone']]) {
    sideBtns[k] = el('button', { class: 'chip', onclick: () => { side = k; paintSide(); runList(); } }, lbl);
    sideChips.appendChild(sideBtns[k]);
  }
  function paintSide() {
    for (const k in sideBtns) {
      sideBtns[k].style.borderColor = (k === side) ? 'var(--accent)' : '';
      sideBtns[k].style.color       = (k === side) ? 'var(--accent)' : '';
      sideBtns[k].style.fontWeight  = (k === side) ? '600' : '';
    }
  }

  const list = el('div');
  body.append(
    el('p', { class: 'mono',
      style: 'color:var(--ink-3);font-size:11px;letter-spacing:.14em;text-transform:uppercase;margin:26px 0 8px' },
      'Who to write to'),
    el('div', { class: 'toolbar' }, find), sideChips, list);
  paintSide();

  function runList() {
    clear(list);
    list.appendChild(el('p', { class: 'mono', style: 'color:var(--ink-3);font-size:12px' }, 'Loading\u2026'));
    fill(list, () => {
      const q = find.value.trim();
      let sel = 'select=*&limit=120&order=last_contact_at.desc.nullslast';
      if (q) {
        const t = '*' + q.replace(/[,()*]/g, '') + '*';
        sel += '&or=(name.ilike.' + t + ',company.ilike.' + t
             + ',city.ilike.' + t + ',country.ilike.' + t + ')';
      }
      if (side === 'external' || side === 'taranis') sel += '&side=eq.' + side;
      else if (side === 'quiet') sel += '&or=(days_quiet.gt.60,last_contact_at.is.null)';
      return readRows('contacts_app', sel, 'contacts.search',
        { q: q, filter: side === 'taranis' ? 'taranis' : side === 'external' ? 'clients' : 'all' });
    }, (rows) => {
      if (!rows.length) {
        return list.appendChild(empty('Nobody here',
          side === 'taranis' ? 'No internal people match that.' : 'Try a surname, a firm, or a country.'));
      }
      for (const c of rows) {
        const dq = daysSince(c.last_contact_at || c.last_interaction);
        list.appendChild(entry({
          tone: c.knows_us === 'yes' ? 'good' : c.knows_us === 'vaguely' ? 'signal' : '',
          rail: dq === null ? 'never' : dq + 'd',
          action: c.name,
          who: [c.country, c.company].filter(Boolean).join('  \u00B7  '),
          evidence: [
            ['country    ', c.country],
            ['last spoke ', (c.last_contact_at || c.last_interaction)
                ? fmtDate(c.last_contact_at || c.last_interaction)
                  + (dq !== null ? '  (' + dq + ' days)' : '') : 'never'],
            ['about      ', c.last_contact_summary || c.last_contact_note],
            ['email      ', c.email]
          ],
          tags: [
            c.side === 'taranis' ? ['taranis', 'accent'] : ['client', 'good'],
            c.knows_us === 'yes' ? ['knows us', 'good'] : null
          ].filter(Boolean),
          actions: [
            { label: 'Write to them', primary: true, run: () => {
                to.value = c.name;
                brief.focus();
                window.scrollTo({ top: 0, behavior: 'smooth' });
                toast('Writing to ' + c.name + '. Say what it should cover.');
              } },
            { label: 'View profile', run: () => openProfile(c) }
          ]
        }));
      }
      list.appendChild(el('p', { class: 'mono',
        style: 'color:var(--ink-3);font-size:12px;margin-top:18px' }, 'Showing ' + rows.length));
    });
  }
  runList();

  go1.addEventListener('click', async () => {
    if (!to.value.trim()) return toast('Name the contact first.', true);
    go1.disabled = true; go1.textContent = 'Writing…';
    try {
      const d = await callGateway('crm.email.draft', { to: to.value.trim(), brief: brief.value.trim() });
      clear(out);
      out.appendChild(entry({
        tone: 'accent',
        rail: 'draft',
        action: d.subject || 'Draft ready',
        who: 'To ' + (d.contact_name || to.value) + '  <' + (d.to_addr || '?') + '>',
        evidence: [['draft id ', d.draft_id]],
        actions: [
          { label: 'Read it, then send', primary: true, run: () => reviewDraft(d) }
        ]
      }));
      const pre = el('div', { class: 'bub', style: 'margin-top:10px;max-width:78ch' }, d.body || '');
      out.appendChild(pre);
    } catch (e) { toast(e.message, true); }
    finally { go1.disabled = false; go1.textContent = 'Write a draft'; }
  });
};

RENDER.inbox = function (body) {
  clear(body);
  const input = el('input', { class: 'search', type: 'search',
    placeholder: 'Name, firm, subject or summary\u2026' });

  // Two readings of the same data. The people views answer "who are we
  // talking to and where did it get to"; the email views answer "what
  // exactly was said". Clients opens first because that is the book.
  let view = 'client';
  const chips = el('div', { class: 'chips' });
  for (const [k, lbl] of [['client', 'Clients'], ['internal', 'Taranis side'],
                          ['emails', 'All email'], ['unknown', 'Unmatched']]) {
    chips.appendChild(el('button', { class: 'chip', onclick: () => { view = k; run(); } }, lbl));
  }
  body.append(el('div', { class: 'toolbar' }, input,
    el('button', { class: 'btn btn-sm btn-quiet', onclick: () => run() }, 'Search')), chips);
  const out = el('div'); body.appendChild(out);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') run(); });

  /* Country lives on the contact record, not on the email, so it is read
     once per view and matched back by address, then by name. A person with
     no contact record still lists \u2014 they simply have no country. */
  async function contactIndex() {
    try {
      const rows = await readRows('contacts_app',
        'select=name,email,country,company,city&limit=1000',
        'contacts.search', { q: '', filter: 'all' });
      const byMail = {}, byName = {};
      for (const c of rows) {
        if (c.email) byMail[String(c.email).toLowerCase().trim()] = c;
        if (c.name)  byName[String(c.name).toLowerCase().trim()]  = c;
      }
      return { byMail, byName };
    } catch (_) { return { byMail: {}, byName: {} }; }
  }

  /* Rows arrive newest first, so the first sighting of a person is their
     most recent exchange. That is what "last spoken" and the summary mean. */
  function foldToPeople(rows, idx) {
    const seen = new Map();
    for (const m of rows) {
      const addr = String(m.counterparty_addr || '').toLowerCase().trim();
      const name = m.counterparty_name || m.person_name || addr;
      const key  = addr || String(name || '').toLowerCase().trim();
      if (!key) continue;
      const c = idx.byMail[addr] || idx.byName[String(name || '').toLowerCase().trim()] || {};
      if (!seen.has(key)) {
        seen.set(key, {
          name: name || addr,
          company: m.person_company || c.company || '',
          // Contact book first; failing that, the national domain on the
          // address. A .com proves nothing, so it is left blank.
          country: c.country || countryFromAddress(addr),
          id: m.id,
          summary: m.summary || '',
          subject: m.subject || '',
          last: m.received_at,
          outbound: String(m.direction || '').toLowerCase().indexOf('out') === 0
                 || String(m.direction || '').toLowerCase() === 'sent',
          owed: !!m.requires_action && !m.replied,
          addr: addr,
          n: 1
        });
      } else {
        const p = seen.get(key);
        p.n += 1;
        if (!p.summary && m.summary) p.summary = m.summary;
      }
    }
    // The tab is called Follow up, so it has to read like one: anyone owed a
    // reply comes first, then whoever has waited longest to hear from us.
    // Nothing is filtered out, only reordered.
    const list = Array.from(seen.values());
    list.sort((x, y) => {
      if (x.owed !== y.owed) return x.owed ? -1 : 1;
      const dx = daysSince(x.last), dy = daysSince(y.last);
      return (dy === null ? -1 : dy) - (dx === null ? -1 : dx);
    });
    return list;
  }

  function run() {
    clear(out);
    out.appendChild(el('p', { class: 'mono', style: 'color:var(--ink-3);font-size:12px' }, 'Loading\u2026'));
    const q = input.value.trim();
    const people = (view === 'client' || view === 'internal');

    let sel = 'select=*&order=received_at.desc&limit=' + (people ? 400 : 60);
    if (q) {
      const t = '*' + q.replace(/[,()*]/g, '') + '*';
      sel += '&or=(subject.ilike.' + t + ',summary.ilike.' + t
           + ',counterparty_name.ilike.' + t + ',counterparty_addr.ilike.' + t + ')';
    }
    if (view === 'client')        sel += '&side=eq.client';
    else if (view === 'internal') sel += '&side=eq.internal';
    else if (view === 'unknown')  sel += '&side=eq.unknown';
    else                          sel += '&side=in.(client,internal)';

    fill(out, async () => {
      const rows = await readRows('crm_emails_app', sel, 'emails.search',
        { q: q, side: view === 'emails' ? 'all' : view });
      if (!people) return rows;
      return foldToPeople(rows, await contactIndex());
    }, (rows) => {
      if (!rows.length) {
        return out.appendChild(empty('Nothing here',
          view === 'unknown'
            ? 'Good \u2014 every email is matched to a person.'
            : 'Try a surname, a firm, or a subject line.'));
      }

      /* ---- the two people lists: name, country, summary, last spoken ---- */
      if (people) {
        for (const p of rows) {
          const q2 = daysSince(p.last);
          out.appendChild(entry({
            tone: p.owed ? 'signal' : (view === 'internal' ? 'accent' : 'good'),
            rail: q2 === null ? '' : q2 + 'd',
            action: p.name,
            who: [p.country, p.company].filter(Boolean).join('  \u00B7  '),
            evidence: [
              ['country    ', p.country || 'not on the record'],
              ['last spoke ', p.last ? fmtDate(p.last) + (q2 !== null ? '  (' + q2 + ' days)' : '') : 'never'],
              ['about      ', p.summary || p.subject],
              ['exchanges  ', p.n]
            ],
            tags: [
              [p.outbound ? 'we spoke last' : 'they spoke last', p.outbound ? '' : 'accent'],
              p.owed ? ['owed a reply', 'signal'] : null
            ].filter(Boolean),
            actions: [
              { label: 'View profile', primary: true, run: () => openProfile(p) },
              { label: 'Draft an email', run: () => { PENDING.draft = p.name; go('email'); } },
              { label: 'Read the last email', run: () => readEmail(p.id, p.subject) },
              { label: 'All their email', run: () => { input.value = p.name; view = 'emails'; run(); } },
              { label: 'History', run: () => askAbout('What did we send ' + p.name
                  + ' and when did we last speak?') }
            ]
          }));
        }
        return;
      }

      /* ---- the raw email list, unchanged ---- */
      for (const m of rows) {
        const outbound = String(m.direction || '').toLowerCase().indexOf('out') === 0
          || String(m.direction || '').toLowerCase() === 'sent';
        out.appendChild(entry({
          tone: m.side === 'internal' ? 'accent' : m.side === 'unknown' ? 'quiet' : 'good',
          rail: outbound ? 'sent' : 'in',
          action: m.subject || '(no subject)',
          who: (outbound ? 'To ' : 'From ')
            + (m.counterparty_name || m.counterparty_addr || '')
            + (m.person_company ? '  \u00B7  ' + m.person_company : ''),
          evidence: [
            ['on      ', fmtDate(m.received_at)],
            ['about   ', m.summary],
            ['intent  ', m.intent]
          ],
          tags: [
            [m.side === 'internal' ? 'taranis side' : m.side === 'unknown' ? 'unmatched' : 'client',
             m.side === 'internal' ? 'accent' : m.side === 'unknown' ? 'quiet' : 'good'],
            m.requires_action && !m.replied ? ['owed a reply', 'signal'] : null,
            m.has_attachments ? ['attachment', ''] : null
          ].filter(Boolean),
          actions: [
            { label: 'Read the email', primary: true, run: () => readEmail(m.id, m.subject) },
            m.counterparty_name || m.counterparty_addr
              ? { label: 'View profile', run: () => openProfile({
                  name: m.counterparty_name || m.counterparty_addr,
                  email: m.counterparty_addr }) }
              : null,
            m.counterparty_name
              ? { label: 'Draft a reply', run: () => { PENDING.draft = m.counterparty_name; go('email'); } }
              : null
          ].filter(Boolean)
        }));
      }
    });
  }
  run();
};
RENDER.opps = function (body) {
  fill(body, () => readRows('wi_mandates',
        'select=id,investor_name,organization_name,investor_country,investor_city,investor_type,strategies,ticket_min_usd,qualification,fit_score,fit_reason,missing_hard_fields,linkedin_url&order=id.desc&limit=40',
        'wi.mandates.list', { limit: 40 }), (rows) => {
    if (!rows.length) return body.appendChild(empty('No opportunities yet', 'Screened mandates from With Intelligence land here.'));
    for (const m of rows) {
      const tone = m.qualification === 'matched' ? 'good' : m.qualification === 'uncertain' ? 'signal' : 'bad';
      body.appendChild(entry({
        tone,
        rail: '#' + m.id,
        action: m.investor_name || m.organization_name || ('Mandate #' + m.id),
        who: [m.organization_name, m.investor_country, m.investor_city].filter(Boolean).join(' · '),
        evidence: [
          ['type      ', asText(m.investor_type)],
          ['strategy  ', asText(m.strategies)],
          ['ticket    ', m.ticket_min_usd],
          ['score     ', m.fit_score],
          ['reason    ', asText(m.fit_reason)],
          ['not stated', asText(m.missing_hard_fields)],
          // If a mandate is empty in every column above, say so rather than
          // drawing a blank stripe with no explanation.
          ['note      ', (!m.investor_name && !m.organization_name && !m.fit_reason)
              ? 'This row has no investor details stored. WI 01 created it but never filled it in.' : null]
        ],
        tags: [[m.qualification, tone]],
        actions: [
          { label: 'View profile', run: () => openProfile({ name: m.investor_name || m.organization_name }) },
          { label: 'Fill a gap', run: () => fillSheet(m) },
          m.qualification === 'rejected'
            ? { label: 'Accept anyway', run: () => act('wi.mandate.accept', { id: m.id }, 'Accepted and published') }
            : null,
          m.linkedin_url ? { label: 'Check the network', run: () => act('li.check', { url: m.linkedin_url }, 'Checking') } : null
        ].filter(Boolean)
      }));
    }
    body.appendChild(el('p', { class: 'mono',
      style: 'color:var(--ink-3);font-size:12px;margin-top:18px' }, 'Showing ' + rows.length));
  });
};

RENDER.notes = function (body) {
  clear(body);

  /* ---------------------------------------------------------- the form */

  const title = el('input', { class: 'search', placeholder: 'What was it? e.g. Coffee with Marc Dubois' });
  const date  = el('input', { class: 'search', type: 'date' });
  date.value  = new Date().toISOString().slice(0, 10);
  const place = el('input', { class: 'search', placeholder: 'Where? e.g. Zurich, their office, a call' });
  const text  = el('textarea', { class: 'ta', placeholder: 'What was said, what they are after, what you promised to do next.' });

  // The contact block. Picking someone out of the book stores their id, so the
  // note follows them if their firm or name is corrected later. Typing the
  // fields by hand is the fallback for people who are not in the book yet.
  const look    = el('input', { class: 'search', placeholder: 'Search the contact book by name or firm' });
  const sugg    = el('div', { class: 'chips' });
  const pickBar = el('div');
  let chosen    = null;

  const cName = el('input', { class: 'search', placeholder: 'Name' });
  const cRole = el('input', { class: 'search', placeholder: 'Role' });
  const cComp = el('input', { class: 'search', placeholder: 'Company' });
  const cMail = el('input', { class: 'search', type: 'email', placeholder: 'Email' });
  const cTel  = el('input', { class: 'search', placeholder: 'Phone' });

  const saveBtn = el('button', { class: 'btn', onclick: () => save() }, 'Save the note');

  let lookTimer = null;
  look.addEventListener('input', () => {
    clearTimeout(lookTimer);
    lookTimer = setTimeout(lookup, 250);
  });

  async function lookup() {
    const q = look.value.trim();
    clear(sugg);
    if (q.length < 2) return;
    try {
      const t = '*' + q.replace(/[,()*]/g, '') + '*';
      const rows = await readRows('contacts_app',
        'select=id,name,role,company,city,country,email&limit=6'
        + '&or=(name.ilike.' + t + ',company.ilike.' + t + ')',
        'contacts.search', { q: q, filter: 'all' });
      if (!rows.length) {
        sugg.appendChild(el('span', { class: 'mono', style: 'font-size:12px;color:var(--ink-3)' },
          'Nobody by that name. Fill the fields below and the note still saves.'));
        return;
      }
      for (const c of rows) {
        sugg.appendChild(el('button', { class: 'chip', onclick: () => pick(c) },
          c.name + (c.company ? '  \u00B7  ' + c.company : '')));
      }
    } catch (e) {
      clear(sugg);
      sugg.appendChild(el('span', { class: 'mono', style: 'font-size:12px;color:var(--ink-3)' }, e.message));
    }
  }

  function pick(c) {
    chosen = c;
    cName.value = c.name || '';
    cRole.value = c.role || '';
    cComp.value = c.company || '';
    cMail.value = c.email || '';
    look.value = '';
    clear(sugg);
    drawPicked();
  }

  function drawPicked() {
    clear(pickBar);
    if (!chosen) return;
    pickBar.appendChild(el('div', { class: 'picked' },
      el('span', { class: 'nm' }, chosen.name + (chosen.company ? '  \u2014  ' + chosen.company : '')),
      el('button', { class: 'btn btn-sm btn-quiet', onclick: () => { chosen = null; drawPicked(); } },
        'Not this person')));
  }

  function lbl(t, node) {
    return el('label', { class: 'field' }, el('span', null, t), node);
  }

  async function save() {
    if (!title.value.trim() && !text.value.trim()) {
      return toast('Give the note a title, or something to say.', true);
    }
    saveBtn.disabled = true; saveBtn.textContent = 'Saving\u2026';
    try {
      const row = {
        title:           title.value.trim() || 'Untitled note',
        note_date:       date.value || new Date().toISOString().slice(0, 10),
        place:           place.value.trim() || null,
        body:            text.value.trim() || null,
        contact_id:      chosen ? chosen.id : null,
        contact_name:    cName.value.trim() || null,
        contact_role:    cRole.value.trim() || null,
        contact_company: cComp.value.trim() || null,
        contact_email:   cMail.value.trim() || null,
        contact_phone:   cTel.value.trim() || null,
        author:          (session && session.email) || 'console'
      };
      // Straight to Supabase so notes save with n8n out of executions. The
      // gateway stays as the fallback for anyone whose key cannot insert.
      try {
        await supaInsert('notes', row);
      } catch (e) {
        if (e.message === 'NO_SUPABASE') throw e;
        await callGateway('notes.save', {
          title: row.title, note_date: row.note_date, place: row.place || '',
          body: row.body || '', contact_id: row.contact_id ? String(row.contact_id) : '',
          contact_name: row.contact_name || '', contact_role: row.contact_role || '',
          contact_company: row.contact_company || '', contact_email: row.contact_email || '',
          contact_phone: row.contact_phone || ''
        });
      }
      toast('Note saved.');
      title.value = ''; place.value = ''; text.value = '';
      cName.value = ''; cRole.value = ''; cComp.value = ''; cMail.value = ''; cTel.value = '';
      chosen = null; drawPicked();
      run();
    } catch (e) {
      toast(e.message, true);
    } finally {
      saveBtn.disabled = false; saveBtn.textContent = 'Save the note';
    }
  }

  const form = el('div', { style: 'max-width:900px;margin-bottom:22px' },
    el('div', { class: 'grid2' }, lbl('Title', title), lbl('Date', date)),
    lbl('Place', place),
    lbl('The note', text),
    el('div', { style: 'height:8px' }),
    lbl('Who was it with?', look),
    sugg, pickBar,
    el('div', { class: 'grid2' }, lbl('Name', cName), lbl('Role', cRole)),
    el('div', { class: 'grid2' }, lbl('Company', cComp), lbl('Email', cMail)),
    lbl('Phone', cTel),
    saveBtn);

  let open = true;
  const toggle = el('button', { class: 'btn btn-sm btn-quiet',
    onclick: () => { open = !open; form.style.display = open ? '' : 'none'; toggle.textContent = open ? 'Hide the form' : 'Write a note'; } },
    'Hide the form');

  /* ---------------------------------------------------------- the list */

  const find = el('input', { class: 'search', placeholder: 'Search notes by title, text, place or person' });
  const out  = el('div');
  let findTimer = null;
  find.addEventListener('input', () => { clearTimeout(findTimer); findTimer = setTimeout(run, 300); });

  function run() {
    clear(out);
    out.appendChild(el('p', { class: 'mono', style: 'color:var(--ink-3);font-size:12px' }, 'Loading\u2026'));
    fill(out, async () => {
      const q = find.value.trim();
      let sel = 'select=*&order=note_date.desc,created_at.desc&limit=200';
      if (q) {
        const t = '*' + q.replace(/[,()*]/g, '') + '*';
        sel += '&or=(title.ilike.' + t + ',body.ilike.' + t
             + ',place.ilike.' + t + ',contact_name.ilike.' + t + ')';
      }
      try {
        const rows = await supaSelect('notes', sel);
        return rows.map(n => Object.assign({ in_contact_book: n.contact_id !== null }, n));
      } catch (e) {
        if (e.message === 'NO_SUPABASE') throw e;
        const d = await callGateway('notes.list', { q: q });
        return d.rows || [];
      }
    }, (rows) => {
      if (!rows.length) {
        return out.appendChild(empty('No notes yet',
          'Write the first one above \u2014 anything you would otherwise scribble down after a meeting.'));
      }
      for (const n of rows) {
        out.appendChild(entry({
          tone: n.in_contact_book ? 'good' : '',
          rail: n.note_date ? n.note_date.slice(5).replace('-', '/') : '',
          action: n.title || 'Untitled note',
          who: [n.contact_name, n.contact_company, n.place].filter(Boolean).join('  \u00B7  '),
          evidence: [
            ['on     ', fmtDate(n.note_date)],
            ['where  ', n.place],
            ['role   ', n.contact_role],
            ['email  ', n.contact_email],
            ['phone  ', n.contact_phone],
            ['note   ', n.body],
            ['by     ', n.author]
          ],
          tags: [n.in_contact_book ? ['in the book', 'good'] : ['not linked', 'quiet']],
          actions: n.contact_name ? [
            { label: 'View profile', primary: true,
              run: () => openProfile({ name: n.contact_name, email: n.contact_email, id: n.contact_id }) },
            { label: 'History', run: () => askAbout('What did we send ' + n.contact_name
                + ' and when did we last speak?') }
          ] : []
        }));
      }
    });
  }

  body.append(el('div', { class: 'toolbar' }, find, toggle), form, out);
  run();
};

RENDER.meetings = function (body) {
  clear(body);

  /* crm_meetings is written by the meeting branch of CRM 02+03. A row starts
     as 'pending' when the request is parsed, and becomes 'scheduled' only
     once Zoom has actually issued a meeting, at which point meet_url and
     passcode are filled in. The app reads the table directly, so this list
     is accurate whether the request came from Telegram or from here. */

  let filter = 'live';
  const chips = el('div', { class: 'chips' });
  for (const [k, lbl] of [['live', 'Upcoming'], ['scheduled', 'Scheduled'],
                          ['pending', 'Waiting on approval'], ['cancelled', 'Cancelled'],
                          ['all', 'Everything']]) {
    chips.appendChild(el('button', { class: 'chip', onclick: () => { filter = k; run(); } }, lbl));
  }
  body.appendChild(chips);

  /* ---------------------------------------------------------- book one

     Written straight to Supabase as 'pending', which is the same state the
     Telegram path produces after it parses a request. Zoom is not called
     from the browser: issuing the meeting, the calendar event and the invite
     all belong to the workflow. So this fills the diary now, and the link
     appears against the row once the workflow turns it into a real meeting. */

  const mTitle = el('input', { class: 'search', placeholder: 'What is the meeting? e.g. TMS review with Pictet' });
  const mWhen  = el('input', { class: 'search', type: 'datetime-local' });
  const mMins  = el('input', { class: 'search', type: 'number', value: '30', min: '15', step: '15' });
  const mTz    = el('input', { class: 'search', value: 'Africa/Cairo' });
  const mLook  = el('input', { class: 'search', placeholder: 'Search the contact book to add someone' });
  const mSugg  = el('div', { class: 'chips' });
  const mList  = el('div');
  let invited  = [];

  let lt = null;
  mLook.addEventListener('input', () => { clearTimeout(lt); lt = setTimeout(lookup, 250); });

  async function lookup() {
    const q = mLook.value.trim();
    clear(mSugg);
    if (q.length < 2) return;
    try {
      const t = '*' + q.replace(/[,()*]/g, '') + '*';
      const rows = await readRows('contacts_app',
        'select=id,name,company,email&limit=6&or=(name.ilike.' + t + ',company.ilike.' + t + ')',
        'contacts.search', { q: q, filter: 'all' });
      if (!rows.length) {
        return mSugg.appendChild(el('span', { class: 'mono', style: 'font-size:12px;color:var(--ink-3)' },
          'Nobody by that name. Type a full email address instead and press Add.'));
      }
      for (const c of rows) {
        if (!c.email) continue;
        mSugg.appendChild(el('button', { class: 'chip', onclick: () => add(c) },
          c.name + (c.company ? '  \u00B7  ' + c.company : '')));
      }
    } catch (e) {
      mSugg.appendChild(el('span', { class: 'mono', style: 'font-size:12px;color:var(--ink-3)' }, e.message));
    }
  }

  function add(c) {
    const mail = String(c.email || '').toLowerCase().trim();
    if (!mail || invited.some(x => x.email === mail)) return;
    invited.push({ contact_id: c.id || null, name: c.name || mail, email: mail });
    mLook.value = ''; clear(mSugg); drawInvited();
  }

  function drawInvited() {
    clear(mList);
    for (const p of invited) {
      mList.appendChild(el('div', { class: 'picked' },
        el('span', { class: 'nm' }, p.name + '  \u00B7  ' + p.email),
        el('button', { class: 'btn btn-sm btn-quiet', style: 'flex:none',
          onclick: () => { invited = invited.filter(x => x !== p); drawInvited(); } }, 'Remove')));
    }
  }

  const addTyped = el('button', { class: 'btn btn-sm btn-quiet', onclick: () => {
    const v = mLook.value.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) return toast('That is not an email address.', true);
    add({ id: null, name: v, email: v });
  } }, 'Add');

  const bookBtn = el('button', { class: 'btn', onclick: () => book() }, 'Put it in the diary');

  async function book() {
    if (!mTitle.value.trim()) return toast('Give the meeting a title.', true);
    if (!mWhen.value) return toast('Pick a date and time.', true);
    if (!invited.length) return toast('Add at least one person.', true);
    bookBtn.disabled = true; bookBtn.textContent = 'Saving\u2026';
    try {
      await supaInsert('crm_meetings', {
        title:        mTitle.value.trim(),
        start_utc:    new Date(mWhen.value).toISOString(),
        duration_min: Number(mMins.value) || 30,
        tz:           mTz.value.trim() || 'Africa/Cairo',
        to_people:    invited,
        status:       'pending'
      });
      toast('Saved as pending. Approve it to issue the Zoom link.');
      mTitle.value = ''; mWhen.value = ''; invited = []; drawInvited();
      run();
    } catch (e) {
      toast(e.message, true);
    } finally {
      bookBtn.disabled = false; bookBtn.textContent = 'Put it in the diary';
    }
  }

  const lbl = (t, n) => el('label', { class: 'field' }, el('span', null, t), n);
  body.appendChild(el('div', { style: 'max-width:900px;margin:0 0 24px' },
    el('div', { class: 'grid2' }, lbl('Title', mTitle), lbl('When', mWhen)),
    el('div', { class: 'grid2' }, lbl('Minutes', mMins), lbl('Timezone', mTz)),
    lbl('Who is coming?', el('div', { class: 'toolbar' }, mLook, addTyped)),
    mSugg, mList, bookBtn));

  const out = el('div');
  body.appendChild(out);

  function people(m) {
    let p = m.to_people;
    if (typeof p === 'string') { try { p = JSON.parse(p); } catch (_) { p = []; } }
    if (!Array.isArray(p)) return '';
    return p.map(x => (x && (x.name || x.email)) || x).filter(Boolean).join(', ');
  }

  function run() {
    clear(out);
    out.appendChild(el('p', { class: 'mono', style: 'color:var(--ink-3);font-size:12px' }, 'Loading\u2026'));

    let sel = 'select=*&order=start_utc.desc&limit=200';
    if (filter === 'live')          sel += '&status=eq.scheduled&start_utc=gte.' + new Date(Date.now() - 36e5).toISOString();
    else if (filter !== 'all')      sel += '&status=eq.' + filter;

    fill(out, () => readRows('crm_meetings', sel, 'zoom.upcoming', {}), (rows) => {
      if (!rows.length) {
        return out.appendChild(empty(
          filter === 'pending' ? 'Nothing waiting' : 'Nothing booked',
          filter === 'live'
            ? 'Meetings already scheduled and still ahead of you appear here.'
            : 'Meetings booked from Telegram or from here land in this list.'));
      }
      for (const m of rows) {
        const past = m.start_utc && new Date(m.start_utc) < new Date();
        const st = String(m.status || '').toLowerCase();
        out.appendChild(entry({
          tone: st === 'cancelled' ? 'quiet' : st === 'pending' ? 'signal' : past ? 'quiet' : 'good',
          rail: st === 'pending' ? 'wait' : past ? 'past' : 'next',
          action: m.title || 'Meeting',
          who: people(m),
          evidence: [
            ['starts   ', m.start_utc ? fmtDate(m.start_utc) : null],
            ['minutes  ', m.duration_min],
            ['zone     ', m.tz],
            ['join     ', m.meet_url],
            ['passcode ', m.passcode]
          ],
          tags: [
            [st || 'unknown',
             st === 'scheduled' ? 'good' : st === 'pending' ? 'signal' : 'quiet'],
            past && st === 'scheduled' ? ['already happened', 'quiet'] : null
          ].filter(Boolean),
          actions: [
            m.meet_url ? { label: 'Join the meeting', primary: true,
              run: () => window.open(m.meet_url, '_blank', 'noopener,noreferrer') } : null,
            m.meet_url ? { label: 'Copy the link', run: () => copy(m.meet_url) } : null,
            st === 'pending' ? { label: 'Approve it in Telegram',
              run: () => toast('Approving needs the workflow. Press approve on the Telegram preview.', true) } : null
          ].filter(Boolean)
        }));
      }
      out.appendChild(el('p', { class: 'mono',
        style: 'color:var(--ink-3);font-size:12px;margin-top:18px' }, 'Showing ' + rows.length));
    });
  }
  run();
};
RENDER.docs = function (body) {
  clear(body);

  /* ---------- upload ---------- */
  let picked = null;

  const input = el('input', { type: 'file', id: 'doc-file',
    accept: '.pdf,.pptx,.ppt,.docx,.doc,.xlsx,.xls,.png,.jpg,.jpeg' });
  const drop = el('label', { class: 'drop', for: 'doc-file' },
    input,
    el('h4', null, 'Add a document'),
    el('p', null, 'Drop a deck or report here, or click to choose one. Up to 50 MB.'));

  const chosen = el('div');
  const title = el('input', { class: 'search', placeholder: 'Title, e.g. Taranis Market Sentiment' });
  const kind = el('select', { class: 'search' });
  for (const [v, l] of [['tms', 'TMS presentation'], ['gdn', 'GDN monthly report'],
                        ['deck', 'Pitch deck'], ['note', 'Weekly note'], ['other', 'Other']])
    kind.appendChild(el('option', { value: v }, l));
  const period = el('input', { class: 'search', type: 'month' });
  const version = el('input', { class: 'search', placeholder: 'Version, e.g. v15' });
  const current = el('input', { type: 'checkbox', id: 'doc-current', checked: 'checked' });
  const send = el('button', { class: 'btn' }, 'Upload and announce');
  const prog = el('div', { class: 'bar' }, el('i'));
  prog.style.display = 'none';

  body.append(
    drop, chosen,
    el('div', { class: 'grid2', style: 'margin-top:12px' }, title, kind),
    el('div', { class: 'grid2', style: 'margin-top:10px' }, period, version),
    el('div', { class: 'toolbar', style: 'margin-top:12px;align-items:center' },
      el('label', { style: 'display:flex;gap:7px;align-items:center;font-size:13.5px;color:var(--ink-2)' },
        current, 'Make this the current version'),
      send),
    prog);

  function show(f) {
    picked = f;
    clear(chosen);
    if (!f) return;
    chosen.appendChild(el('div', { class: 'picked' },
      el('span', { class: 'nm' }, f.name),
      el('span', { class: 'sz' }, (f.size / 1048576).toFixed(1) + ' MB')));
    if (!title.value) title.value = f.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ');
  }
  input.addEventListener('change', () => show(input.files[0]));
  ['dragenter', 'dragover'].forEach(ev =>
    drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(ev =>
    drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', e => {
    if (e.dataTransfer.files && e.dataTransfer.files[0]) show(e.dataTransfer.files[0]);
  });

  send.addEventListener('click', async () => {
    if (!picked) return toast('Choose a file first.', true);
    if (!title.value.trim()) return toast('Give it a title.', true);
    if (picked.size > 50 * 1048576) return toast('That is over 50 MB. Ask for the limit to be raised.', true);
    if (DEMO) return toast('Sample data — connect Supabase to upload for real.', true);

    // A predictable path keeps versions of the same document together.
    const safe = picked.name.replace(/[^A-Za-z0-9._-]+/g, '-');
    const path = kind.value + '/' + (period.value || new Date().toISOString().slice(0, 7)) + '/' +
                 (version.value.trim() || 'v1') + '-' + safe;

    send.disabled = true; send.textContent = 'Uploading…';
    prog.style.display = 'block';
    try {
      await uploadToStorage(picked, path, (pc) => { prog.firstChild.style.width = pc + '%'; });
      send.textContent = 'Filing…';
      // n8n does the versioning, archiving of the previous one, and the
      // announcement — the same work DOC 01 already does today.
      await callGateway('docs.upload', {
        storage_path: path,
        doc_key: kind.value,
        title: title.value.trim(),
        version_label: version.value.trim() || null,
        period: period.value || null,
        is_current: current.checked,
        filename: picked.name,
        size_bytes: picked.size,
        mime: picked.type || null
      });
      toast('Uploaded. The team has been told.');
      go('docs');
    } catch (e) {
      toast(e.message, true);
    } finally {
      send.disabled = false; send.textContent = 'Upload and announce';
      prog.style.display = 'none'; prog.firstChild.style.width = '0';
    }
  });

  /* ---------- the archive ---------- */
  const list = el('div', { style: 'margin-top:26px' });
  body.appendChild(list);
  list.appendChild(el('p', { class: 'mono', style: 'color:var(--ink-3);font-size:12px' }, 'Loading…'));

  fill(list, () => readRows('documents',
      'select=doc_key,title,version_label,period_date,public_url,is_current,uploaded_at&order=uploaded_at.desc&limit=40',
      'docs.list', {}), (rows) => {
    if (!rows.length) return list.appendChild(empty('The archive is empty', 'Whatever you upload above appears here.'));
    for (const x of rows) list.appendChild(entry({
      tone: x.is_current ? 'good' : 'quiet',
      rail: x.version_label || '',
      action: x.title,
      who: x.month_label || (x.period_date ? fmtDate(x.period_date) : ''),
      evidence: [['link  ', x.public_url], ['added ', fmtDate(x.added_on || x.uploaded_at)]],
      tags: [x.is_current ? ['current', 'good'] : ['superseded', 'quiet']],
      // noopener so the opened tab cannot reach back into the console.
      actions: x.public_url ? [
        { label: 'View the report', primary: true,
          run: () => window.open(x.public_url, '_blank', 'noopener,noreferrer') },
        { label: 'Copy the link', run: () => copy(x.public_url) }
      ] : []
    }));
  });
};

RENDER.reports = function (body) {
  clear(body);

  /* OPS 02 writes the whole Friday dashboard into weekly_snapshots.metrics
     as one jsonb blob, then sends a Telegram message and an HTML file. The
     numbers are all in that blob, so the report can be read here instead of
     hunting for an attachment in a group chat. */

  fill(body, () => supaSelect('weekly_snapshots',
    'select=taken_at,metrics&order=taken_at.desc&limit=12'), (rows) => {

    if (!rows.length) {
      return body.appendChild(empty('No report stored yet',
        'OPS 02 runs Friday at 19:00 Cairo and saves a snapshot. Nothing has been saved so far.'));
    }

    const J = (v) => { if (typeof v === 'string') { try { return JSON.parse(v); } catch (_) { return {}; } } return v || {}; };
    const A = (v) => { const x = J(v); return Array.isArray(x) ? x : []; };
    const n = (v) => Number(v || 0);
    const money = (v) => { const x = n(v); return x >= 1e6 ? '$' + (x / 1e6).toFixed(1) + 'm'
                                    : x >= 1e3 ? '$' + Math.round(x / 1e3) + 'k' : '$' + x; };

    let at = 0;
    const host = el('div');

    const pick = el('select', { class: 'search', style: 'max-width:280px' });
    rows.forEach((r, i) => pick.appendChild(el('option', { value: String(i) },
      'Week to ' + fmtDate(r.taken_at))));
    pick.addEventListener('change', () => { at = Number(pick.value) || 0; draw(); });
    body.append(el('div', { class: 'toolbar' }, pick), host);

    function draw() {
      clear(host);
      const m = J(rows[at].metrics);
      const p = rows[at + 1] ? J(rows[at + 1].metrics) : null;
      const d = (k) => p && p[k] !== undefined ? n(m[k]) - n(p[k]) : null;
      const mv = (k) => { const x = d(k); return x === null ? '' : (x > 0 ? '  \u25B2' + x : x < 0 ? '  \u25BC' + Math.abs(x) : '  \u2014'); };

      const head = (t) => el('p', { class: 'mono',
        style: 'font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--ink-3);margin:24px 0 8px' }, t);

      // headline numbers
      const kpis = el('div', { style: 'display:flex;gap:22px;flex-wrap:wrap;margin-bottom:6px' });
      for (const [lbl, val, key] of [
        ['screened', n(m.wi_new), 'wi_new'],
        ['matched', n(m.wi_matched), 'wi_matched'],
        ['rejected', n(m.wi_rejected), 'wi_rejected'],
        ['awaiting you', n(m.wi_awaiting), null],
        ['matched value', money(m.wi_ticket_value), null],
        ['emails', n(m.crm_week), 'crm_week'],
        ['contacts', n(m.contacts_total), 'contacts_total']
      ]) {
        kpis.appendChild(el('div', { style: 'min-width:110px' },
          el('div', { class: 'mono', style: 'font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--ink-3)' }, lbl),
          el('div', { style: 'font-size:23px;font-weight:600' }, String(val)),
          key ? el('div', { class: 'mono', style: 'font-size:11.5px;color:var(--ink-3)' }, mv(key).trim()) : null));
      }
      host.append(head('The week'), kpis);

      // screening and why things were thrown out
      const rej = A(m.wi_reject_reasons);
      if (rej.length) {
        host.appendChild(head('Why opportunities were rejected'));
        const ev = el('div', { class: 'ev' });
        for (const r of rej) ev.appendChild(el('div', null,
          el('span', { class: 'k' }, String(n(r.n)).padStart(3, ' ') + '  '), String(r.k)));
        host.appendChild(ev);
      }

      const cty = A(m.wi_by_country);
      if (cty.length) {
        host.appendChild(head('Where the flow comes from'));
        const ev = el('div', { class: 'ev' });
        for (const c of cty.slice(0, 6)) ev.appendChild(el('div', null,
          el('span', { class: 'k' }, String(n(c.n)).padStart(3, ' ') + '  '),
          String(c.k) + (['GB', 'CH'].indexOf(String(c.k)) > -1 ? '   (addressable)' : '')));
        host.appendChild(ev);
      }

      // who is worth chasing
      const interest = A(m.taranis_interest).filter(r => n(r.score) > 0);
      if (interest.length) {
        host.appendChild(head('Most interested in Taranis'));
        for (const r of interest.slice(0, 8)) {
          host.appendChild(entry({
            tone: n(r.score) >= 75 ? 'good' : n(r.score) >= 55 ? 'signal' : 'quiet',
            rail: String(n(r.score)),
            action: r.name,
            who: [r.company, r.place].filter(Boolean).join('  \u00B7  '),
            evidence: [
              ['about ', r.about],
              ['last  ', r.last_date ? r.last_date + (r.days_since !== null && r.days_since !== undefined
                  ? '  (' + n(r.days_since) + ' days)' : '') : 'no email on record'],
              ['aum   ', r.aum_band]
            ],
            actions: [{ label: 'View profile', primary: true, run: () => openProfile({ name: r.name, company: r.company }) }]
          }));
        }
      }

      // the mail and the book
      host.appendChild(head('Activity'));
      const act = el('div', { class: 'ev' });
      for (const [k, v] of [
        ['messages   ', n(m.crm_week) + ' (' + n(m.crm_sent) + ' out, ' + n(m.crm_received) + ' in)'],
        ['needs reply', n(m.crm_needs_action)],
        ['engaged    ', n(m.contacts_touched) + ' contacts'],
        ['linked     ', n(m.crm_linked) + ' of ' + n(m.crm_stored_total) + ' stored']
      ]) act.appendChild(el('div', null, el('span', { class: 'k' }, k + '  '), String(v)));
      host.appendChild(act);

      host.appendChild(head('The book'));
      const bk = el('div', { class: 'ev' });
      for (const [k, v] of [
        ['contacts     ', n(m.contacts_total)],
        ['with email   ', n(m.contacts_with_email)],
        ['no email     ', n(m.contacts_total) - n(m.contacts_with_email)],
        ['correspondence', n(m.contacts_with_history)],
        ['awaiting reply', n(m.awaiting_reply)],
        ['ever replied ', n(m.ever_replied)],
        ['quiet 90d+   ', n(m.overdue_90)],
        ['open steps   ', n(m.open_next_steps)]
      ]) bk.appendChild(el('div', null, el('span', { class: 'k' }, k + '  '), String(v)));
      host.appendChild(bk);

      if (!p) {
        host.appendChild(el('p', { class: 'mono',
          style: 'color:var(--ink-3);font-size:12px;margin-top:20px' },
          'First snapshot \u2014 week-on-week movement appears once there are two.'));
      }
    }
    draw();
  });
};

RENDER.network = function (body) {
  clear(body);
  const q = el('input', { class: 'search', placeholder: 'Name to look up…' });
  body.appendChild(el('div', { class: 'toolbar' }, q,
    el('button', { class: 'btn btn-sm', onclick: () => run() }, 'Look up')));
  const out = el('div'); body.appendChild(out);
  q.addEventListener('keydown', e => { if (e.key === 'Enter') run(); });
  function run() {
    if (!q.value.trim()) return;
    clear(out);
    // linkedin_mutual gives one row per person with mutual_to as a list
    // of names, resolved from account_id through linkedin_accounts.
    fill(out, () => readRows('linkedin_mutual',
        'select=*&full_name=ilike.*' + q.value.trim().replace(/[,()*]/g, '') + '*'
          + '&order=mutual_count.desc&limit=40',
        'li.mutual', { q: q.value.trim() }),
      (rows) => {
      if (!rows.length) return out.appendChild(empty('Not a first-degree connection', 'They may still be in the contact book — check Contacts.'));
      for (const p of rows) {
        const who = Array.isArray(p.mutual_to) ? p.mutual_to.join(', ') : (p.mutual_to || '');
        out.appendChild(entry({
          tone: p.in_contact_book ? 'good' : 'accent',
          rail: (p.mutual_count || 1) + '\u00D7',
          action: p.full_name,
          who: 'Mutual to ' + (who || 'someone at Taranis'),
          evidence: [['profile ', p.profile_url], ['synced  ', fmtDate(p.last_synced)]],
          tags: p.in_contact_book ? [['in the book', 'good']] : [['not in the book', 'quiet']],
          // noopener so LinkedIn cannot reach back into the console tab.
          actions: p.profile_url ? [
            { label: 'View LinkedIn profile', primary: true,
              run: () => window.open(p.profile_url, '_blank', 'noopener,noreferrer') },
            { label: 'View profile', run: () => openProfile({ name: p.full_name }) },
            { label: 'Copy the link', run: () => copy(p.profile_url) },
            { label: 'History', run: () => askAbout('What do we know about ' + p.full_name
                + ', and have we ever been in contact?') }
          ] : []
        }));
      }
    });
  }
};

/* ------------------------------------------------------------------- ask */

RENDER.ask = function (body) {
  const host = body.parentElement;
  host.style.padding = '0';
  clear(body);
  body.style.padding = '0';
  body.style.display = 'flex';
  body.style.flexDirection = 'column';
  body.style.height = '100%';

  const log = el('div', { id: 'ask-log' });

  // Ask only is the default because it always works: it reads Supabase
  // directly and never spends an n8n execution. Ask agent is the model.
  let mode = 'local';
  const modeRow = el('div', { class: 'chips', style: 'margin-bottom:4px' });
  const modeBtns = {};
  for (const [k, lbl] of [['local', 'Ask only'], ['agent', 'Ask agent']]) {
    modeBtns[k] = el('button', { class: 'chip', onclick: () => setMode(k) }, lbl);
    modeRow.appendChild(modeBtns[k]);
  }
  const modeNote = el('span', { class: 'mono', style: 'font-size:11.5px;color:var(--ink-3);align-self:center' });
  modeRow.appendChild(modeNote);

  function setMode(k) {
    mode = k;
    for (const id in modeBtns) {
      modeBtns[id].style.borderColor = (id === k) ? 'var(--accent)' : '';
      modeBtns[id].style.color       = (id === k) ? 'var(--accent)' : '';
      modeBtns[id].style.fontWeight  = (id === k) ? '600' : '';
    }
    modeNote.textContent = (k === 'local')
      ? 'reads the database directly — always available'
      : 'runs the workflow and the model — needs n8n executions';
  }

  const chips = el('div', { class: 'chips' });
  for (const s of [
    'Who in Geneva knows us?',
    'Who is overdue a follow-up?',
    'What did we last send Pictet, and when?',
    'Which opportunities are still waiting on me?'
  ]) chips.appendChild(el('button', { class: 'chip', onclick: () => { input.value = s; send(); } }, s));

  const input = el('textarea', { id: 'ask-in', rows: '1', placeholder: 'Ask anything you used to type into the bot…' });
  const btn = el('button', { class: 'btn' }, 'Ask');
  const bar = el('div', { id: 'ask-bar' }, modeRow, chips, el('div', { id: 'ask-row' }, input, btn));
  setMode('local');
  body.append(log, bar);

  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 150) + 'px';
  });
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  });
  btn.addEventListener('click', send);

  if (!log.childNodes.length) {
    log.appendChild(el('div', { class: 'msg' },
      el('div', { class: 'from' }, 'Taranis'),
      el('div', { class: 'bub' },
        'Ask about anyone in the book, what was sent and when, opportunities, or the network. ' +
        'Ask only reads the database and shows you the records themselves. ' +
        'Ask agent sends the question to the model, which can weigh things up and answer in your language — ' +
        'that one needs n8n executions available.')));
  }

  // A question handed over from another tab (e.g. the History button on a
  // contact) is parked on PENDING and picked up once this tab is built.
  if (PENDING.q) {
    const q = PENDING.q; PENDING.q = null;
    if (PENDING.qmode) { setMode(PENDING.qmode); PENDING.qmode = null; }
    input.value = q;
    setTimeout(send, 40);
  }

  async function send() {
    const q = input.value.trim();
    if (!q) return;
    input.value = ''; input.style.height = 'auto';
    log.appendChild(el('div', { class: 'msg me' },
      el('div', { class: 'from' }, 'You'), el('div', { class: 'bub' }, q)));
    const wait = el('div', { class: 'msg' },
      el('div', { class: 'from' }, 'Taranis'),
      el('div', { class: 'bub' }, el('span', { class: 'typing' }, el('i'), el('i'), el('i'))));
    log.appendChild(wait);
    log.scrollTop = log.scrollHeight;

    if (mode === 'local') {
      wait.remove();
      const bub = el('div', { class: 'bub' });
      const m = el('div', { class: 'msg' }, el('div', { class: 'from' }, 'Taranis'), bub);
      log.appendChild(m);
      await answerLocally(bub, q);
      bub.appendChild(el('div', { class: 'srcs' },
        'read directly from the database — no model, nothing invented'));
      log.scrollTop = log.scrollHeight;
      return;
    }

    try {
      const d = await callGateway('assistant.ask', { question: q });
      wait.remove();
      const bub = el('div', { class: 'bub' });
      renderAnswer(bub, d.answer || 'No answer came back.');
      const m = el('div', { class: 'msg' }, el('div', { class: 'from' }, 'Taranis'), bub);
      if (d.sources && d.sources.length) {
        bub.appendChild(el('div', { class: 'srcs' }, 'queried: ' + d.sources.join(', ')));
      }
      log.appendChild(m);
    } catch (e) {
      wait.remove();
      const bad = el('div', { class: 'bub', style: 'border-color:var(--bad);color:var(--bad)' },
        el('div', null, e.message),
        el('div', { class: 'acts', style: 'margin-top:10px' },
          el('button', { class: 'btn btn-sm btn-quiet',
            onclick: () => { setMode('local'); input.value = q; send(); } },
            'Answer it from the database instead')));
      log.appendChild(el('div', { class: 'msg' },
        el('div', { class: 'from' }, 'Taranis'), bad));
    }
    log.scrollTop = log.scrollHeight;
  }
};

/**
 * The agent answers in Telegram HTML (<b>, <i>, <a href>, <code>).
 * Parse that allow-list explicitly. Anything else becomes text —
 * a <script> in an answer renders as characters, never as code.
 */
function renderAnswer(host, html) {
  const ALLOWED = { B: 1, I: 1, U: 1, CODE: 1, PRE: 1, A: 1, BR: 1, STRONG: 1, EM: 1 };
  const doc = new DOMParser().parseFromString('<div>' + html + '</div>', 'text/html');
  const src = doc.body.firstChild;

  (function walk(from, to) {
    for (const n of Array.from(from.childNodes)) {
      if (n.nodeType === 3) { to.appendChild(document.createTextNode(n.nodeValue)); continue; }
      if (n.nodeType !== 1) continue;
      if (!ALLOWED[n.tagName]) { to.appendChild(document.createTextNode(n.textContent)); continue; }
      const t = document.createElement(n.tagName.toLowerCase());
      if (n.tagName === 'A') {
        const href = n.getAttribute('href') || '';
        if (/^https?:\/\//i.test(href)) {         // no javascript:, no data:
          t.setAttribute('href', href);
          t.setAttribute('target', '_blank');
          t.setAttribute('rel', 'noopener noreferrer');
        }
      }
      to.appendChild(t);
      walk(n, t);
    }
  })(src, host);
}

/* --------------------------------------------------------------- actions */

async function act(action, payload, okMsg) {
  try {
    await callGateway(action, payload);
    toast(okMsg);
    go(current);
  } catch (e) { toast(e.message, true); }
}

function copy(text) {
  navigator.clipboard.writeText(text || '').then(
    () => toast('Link copied'),
    () => toast('Could not copy', true));
}

function sheet(title, bodyNodes, footNodes) {
  $('sheet-title').textContent = title;
  const b = $('sheet-body'); clear(b); bodyNodes.forEach(n => b.appendChild(n));
  const f = $('sheet-foot'); clear(f); footNodes.forEach(n => f.appendChild(n));
  $('sheet').classList.add('on');
}
/* --------------------------------------------------- reading one email

   The list carries the summary; the whole message is fetched only when
   asked for, so a page of sixty rows never drags sixty email bodies with
   it. The body goes in through textContent, never innerHTML. */

async function readEmail(id, subject) {
  if (!id) return toast('That row has no message stored against it.', true);
  try {
    const rows = await supaSelect('crm_emails',
      'select=subject,from_addr,to_addr,cc_addr,received_at,body,summary,has_attachments,attachments'
      + '&id=eq.' + encodeURIComponent(id) + '&limit=1');
    const m = rows && rows[0];
    if (!m) return toast('That email is no longer stored.', true);

    const line = (k, v) => v
      ? el('div', { class: 'ev' }, el('div', null,
          el('span', { class: 'k' }, k + '  '), String(v)))
      : null;

    sheet(m.subject || subject || '(no subject)', [
      line('from    ', m.from_addr),
      line('to      ', m.to_addr),
      line('cc      ', m.cc_addr),
      line('on      ', fmtDate(m.received_at)),
      line('about   ', m.summary),
      attachmentBlock(m),
      el('pre', {
        style: 'white-space:pre-wrap;word-break:break-word;margin-top:16px;'
             + 'font-family:inherit;font-size:13.5px;line-height:1.65;'
             + 'max-height:52vh;overflow:auto;border-top:1px solid var(--rule-2);padding-top:14px'
      }, m.body || 'No body was stored for this message.')
    ].filter(Boolean), [
      el('button', { class: 'btn btn-sm btn-quiet', onclick: closeSheet }, 'Close')
    ]);
  } catch (e) {
    toast(e.message, true);
  }
}

/** Files recovered from the original message, linked to Storage. */
function attachmentBlock(m) {
  let list = m.attachments;
  if (typeof list === 'string') { try { list = JSON.parse(list); } catch (_) { list = []; } }
  if (!Array.isArray(list) || !list.length) {
    return m.has_attachments
      ? el('div', { class: 'ev' }, el('div', null,
          el('span', { class: 'k' }, 'files     '),
          'This message had attachments, but the files were never stored.'))
      : null;
  }
  const wrap = el('div', { style: 'margin-top:12px' },
    el('p', { class: 'mono',
      style: 'color:var(--ink-3);font-size:11px;letter-spacing:.14em;text-transform:uppercase;margin:0 0 6px' },
      list.length === 1 ? 'One attachment' : list.length + ' attachments'));
  for (const f of list) {
    const kb = f.bytes ? (f.bytes > 1048576
      ? (f.bytes / 1048576).toFixed(1) + ' MB'
      : Math.max(1, Math.round(f.bytes / 1024)) + ' KB') : '';
    wrap.appendChild(el('div', { class: 'picked' },
      el('span', { class: 'nm' }, f.name || 'attachment'),
      kb ? el('span', { class: 'sz' }, kb) : null,
      el('button', { class: 'btn btn-sm', style: 'flex:none',
        onclick: () => window.open(f.url, '_blank', 'noopener,noreferrer') }, 'Open')));
  }
  return wrap;
}

/* Country when the contact book does not carry one. A national domain is
   evidence; a .com is not, so anything unrecognised stays blank rather
   than being guessed at. */
const TLD_COUNTRY = {
  uk: 'United Kingdom', gb: 'United Kingdom', ch: 'Switzerland', swiss: 'Switzerland',
  fr: 'France', de: 'Germany', it: 'Italy', es: 'Spain', pt: 'Portugal',
  nl: 'Netherlands', be: 'Belgium', lu: 'Luxembourg', ie: 'Ireland', dk: 'Denmark',
  se: 'Sweden', no: 'Norway', fi: 'Finland', at: 'Austria', pl: 'Poland',
  gr: 'Greece', cz: 'Czechia', li: 'Liechtenstein', mc: 'Monaco', mt: 'Malta',
  ae: 'United Arab Emirates', sa: 'Saudi Arabia', qa: 'Qatar', kw: 'Kuwait',
  bh: 'Bahrain', om: 'Oman', eg: 'Egypt', lb: 'Lebanon', jo: 'Jordan',
  il: 'Israel', tr: 'Turkey', za: 'South Africa', ng: 'Nigeria', ke: 'Kenya',
  ma: 'Morocco', tn: 'Tunisia', us: 'United States', ca: 'Canada', mx: 'Mexico',
  br: 'Brazil', ar: 'Argentina', cl: 'Chile', au: 'Australia', nz: 'New Zealand',
  sg: 'Singapore', hk: 'Hong Kong', jp: 'Japan', cn: 'China', in: 'India',
  kr: 'South Korea', my: 'Malaysia', th: 'Thailand', id: 'Indonesia',
  ky: 'Cayman Islands', bm: 'Bermuda', je: 'Jersey', gg: 'Guernsey', im: 'Isle of Man'
};

function countryFromAddress(addr) {
  const m = String(addr || '').toLowerCase().match(/@([a-z0-9.-]+)$/);
  if (!m) return '';
  const bits = m[1].split('.');
  return TLD_COUNTRY[bits[bits.length - 1]] || '';
}

/* ------------------------------------------------- answering without n8n

   Ask has two modes.

   ASK AGENT goes through the gateway to the model, which can reason across
   the book and phrase a reply. It costs an n8n execution and stops working
   the moment that quota runs out.

   ASK ONLY never leaves Supabase. It pulls the same records the agent would
   have queried and lays them out, unedited and unsummarised by any model.
   It cannot phrase a judgement, but it cannot be unavailable either, and it
   cannot invent anything: what you read is the row. The History button uses
   this mode, so a contact's record is always one click away.
   -------------------------------------------------------------------- */

const STOPWORDS = new Set(('what when where who whom which why how did do does done was were is are am '
  + 'we our us i me my you your he she they them their it its the a an of to for from with about '
  + 'and or but if then than that this these those on in at by as be been being have has had '
  + 'last latest recent recently send sent sending say said tell told know knows contact contacted '
  + 'email emails mail spoke speak spoken talk talked reply replied answer time times ago please '
  + 'give show find all any some more most any anything everything details detail info information'
  ).split(' '));

/** Pull the searchable part out of a sentence. Names survive, grammar does not. */
function searchTerms(q) {
  const words = String(q || '')
    .replace(/[^\p{L}\p{N}@.\- ]/gu, ' ')
    .split(/\s+/)
    .map(w => w.trim())
    .filter(w => w.length > 1 && !STOPWORDS.has(w.toLowerCase()));
  return words;
}

function ilikeAny(cols, term) {
  const t = '*' + String(term).replace(/[,()*]/g, '') + '*';
  return '&or=(' + cols.map(c => c + '.ilike.' + t).join(',') + ')';
}

/** Everything the app can say about one person, straight from the tables. */
async function localDossier(host, person) {
  const addr = String(person.email || '').toLowerCase().trim();
  let mail = [];
  try {
    let sel = 'select=*&order=received_at.desc&limit=12';
    sel += addr
      ? '&or=(counterparty_addr.eq.' + encodeURIComponent(addr)
        + ',counterparty_name.ilike.*' + String(person.name).replace(/[,()*]/g, '') + '*)'
      : ilikeAny(['counterparty_name'], person.name);
    mail = await readRows('crm_emails_app', sel, 'emails.search', { q: person.name, side: 'all' });
  } catch (_) { /* the person still shows without their mail */ }

  const q = daysSince(person.last_contact_at || person.last_interaction);
  host.appendChild(entry({
    tone: person.knows_us === 'yes' ? 'good' : person.knows_us === 'vaguely' ? 'signal' : '',
    rail: q === null ? 'never' : q + 'd',
    action: person.name,
    who: [person.role, person.company, person.city, person.country].filter(Boolean).join('  \u00B7  '),
    evidence: [
      ['last spoke ', (person.last_contact_at || person.last_interaction)
          ? fmtDate(person.last_contact_at || person.last_interaction)
            + (q !== null ? '  (' + q + ' days)' : '') : 'never'],
      ['email      ', person.email],
      ['about      ', person.last_contact_summary || person.last_contact_note],
      ['next step  ', person.next_step],
      ['status     ', person.status],
      ['ticket     ', person.aum_band],
      ['region     ', person.region],
      ['terms      ', person.introducer_terms],
      ['knows us   ', person.knows_us],
      ['exchanges  ', mail.length ? (mail.length >= 12 ? '12+' : mail.length) : null],
      ['intel      ', person.intelligence_text || person.raw_notes]
    ],
    tags: [
      person.side === 'taranis' ? ['taranis', 'accent'] : null,
      person.category ? [person.category, ''] : null
    ].filter(Boolean),
    actions: [
      { label: 'Draft an email', primary: true, run: () => { PENDING.draft = person.name; go('email'); } },
      { label: 'Book a Zoom', run: () => { PENDING.meet = person.name; go('meetings'); } }
    ]
  }));

  if (!mail.length) {
    host.appendChild(el('p', { class: 'mono', style: 'color:var(--ink-3);font-size:12px;margin:6px 0 0' },
      'No email stored against this person yet.'));
    return;
  }

  host.appendChild(el('p', { class: 'mono',
    style: 'color:var(--ink-3);font-size:11px;letter-spacing:.14em;text-transform:uppercase;margin:16px 0 6px' },
    'Every exchange on record'));

  for (const m of mail) {
    const outbound = String(m.direction || '').toLowerCase().indexOf('out') === 0
      || String(m.direction || '').toLowerCase() === 'sent';
    host.appendChild(entry({
      tone: 'quiet',
      rail: outbound ? 'sent' : 'in',
      action: m.subject || '(no subject)',
      who: fmtDate(m.received_at),
      // The summary is shown, but the whole message is one click away, so
      // nothing is lost by summarising here.
      evidence: [['about   ', m.summary], ['intent  ', m.intent]],
      actions: [{ label: 'Read the email', run: () => readEmail(m.id, m.subject) }]
    }));
  }
}

/* --------------------------------------------------------- one person

   Everything the database holds on somebody, in one panel: the record
   itself, every email either way, and any notes filed against them. The
   list views stay short because the detail lives here instead. */

async function openProfile(c) {
  // Callers hand over whatever they have. The Follow up list only knows a
  // name and an address; an approval only knows an investor name. Anything
  // that is not already a full contact record gets resolved against the
  // book first, by address, then by name, so the panel is the same panel
  // wherever it was opened from.
  if (c && c.knows_us === undefined) {
    try {
      const addr = String(c.email || c.addr || '').toLowerCase().trim();
      let sel = 'select=*&limit=1';
      if (addr) sel += '&email=ilike.' + encodeURIComponent(addr);
      else sel += ilikeAny(['name'], String(c.name || ''));
      let hit = await readRows('contacts_app', sel, 'contacts.search', { q: c.name || '', filter: 'all' });
      if (!hit.length && c.name) {
        hit = await readRows('contacts_app',
          'select=*&limit=1' + ilikeAny(['name'], String(c.name)),
          'contacts.search', { q: c.name, filter: 'all' });
      }
      if (hit.length) c = Object.assign({}, c, hit[0]);
      else c = Object.assign({}, c, { not_in_book: true });
    } catch (_) { /* show what we were given */ }
  }

  const host = el('div');
  sheet(c.name || 'Contact', [host], [
    el('button', { class: 'btn btn-sm', onclick: () => { closeSheet(); PENDING.draft = c.name; go('email'); } }, 'Draft an email'),
    el('button', { class: 'btn btn-sm btn-quiet', onclick: () => { closeSheet(); PENDING.meet = c.name; go('meetings'); } }, 'Book a Zoom'),
    el('button', { class: 'btn btn-sm btn-quiet', onclick: closeSheet }, 'Close')
  ]);

  const line = (k, v) => {
    const t = asText(v);
    return t ? el('div', { class: 'ev' }, el('div', null, el('span', { class: 'k' }, k + '  '), t)) : null;
  };
  const head = (t) => el('p', { class: 'mono',
    style: 'color:var(--ink-3);font-size:11px;letter-spacing:.14em;text-transform:uppercase;margin:18px 0 6px' }, t);

  const dq = daysSince(c.last_contact_at || c.last_interaction);
  if (c.not_in_book) {
    host.appendChild(el('div', { class: 'banner' },
      el('b', null, 'Not in the contact book. '),
      'Everything below comes from email and notes rather than a contact record.'));
  }
  host.append(...[
    line('role      ', c.role || c.title),
    line('company   ', c.company),
    line('where     ', [c.city, c.country].filter(Boolean).join(', ')),
    line('email     ', c.email),
    line('phone     ', c.phone || c.contact_phone),
    line('knows us  ', c.knows_us),
    line('side      ', c.side),
    line('category  ', c.category),
    line('status    ', c.status),
    line('next step ', c.next_step),
    line('last spoke', (c.last_contact_at || c.last_interaction)
        ? fmtDate(c.last_contact_at || c.last_interaction) + (dq !== null ? '  (' + dq + ' days)' : '')
        : 'never'),
    line('exchanges ', c.contact_count),
    line('ticket    ', c.aum_band),
    line('region    ', c.region),
    line('terms     ', c.introducer_terms),
    line('intel     ', c.intelligence_text || c.raw_notes)
  ].filter(Boolean));

  const loading = el('p', { class: 'mono', style: 'color:var(--ink-3);font-size:12px;margin-top:16px' }, 'Reading the rest\u2026');
  host.appendChild(loading);

  const addr = String(c.email || '').toLowerCase().trim();
  const nameLike = '*' + String(c.name || '').replace(/[,()*]/g, '') + '*';

  const [mail, notes] = await Promise.all([
    (async () => { try {
      let sel = 'select=*&order=received_at.desc&limit=25';
      sel += addr
        ? '&or=(counterparty_addr.eq.' + encodeURIComponent(addr) + ',counterparty_name.ilike.' + nameLike + ')'
        : '&counterparty_name.ilike.' + nameLike;
      return await readRows('crm_emails_app', sel, 'emails.search', { q: c.name, side: 'all' });
    } catch (_) { return []; } })(),
    (async () => { try {
      let sel = 'select=*&order=note_date.desc&limit=25&or=(contact_name.ilike.' + nameLike;
      if (c.id) sel += ',contact_id.eq.' + encodeURIComponent(c.id);
      sel += ')';
      return await supaSelect('notes', sel);
    } catch (_) { return []; } })()
  ]);

  loading.remove();

  if (notes.length) {
    host.appendChild(head(notes.length === 1 ? 'One note' : notes.length + ' notes'));
    for (const n of notes) {
      host.appendChild(entry({
        tone: '', rail: n.note_date ? String(n.note_date).slice(5).replace('-', '/') : '',
        action: n.title || 'Untitled note',
        who: [n.place, n.author].filter(Boolean).join('  \u00B7  '),
        evidence: [['note ', n.body]]
      }));
    }
  }

  host.appendChild(head(mail.length ? (mail.length >= 25 ? '25+ emails' : mail.length + ' emails') : 'No email on record'));
  for (const m of mail) {
    const out = String(m.direction || '').toLowerCase().indexOf('out') === 0
      || String(m.direction || '').toLowerCase() === 'sent';
    host.appendChild(entry({
      tone: 'quiet', rail: out ? 'sent' : 'in',
      action: m.subject || '(no subject)',
      who: fmtDate(m.received_at),
      evidence: [['about ', m.summary]],
      actions: [{ label: 'Read the email', run: () => readEmail(m.id, m.subject) }]
    }));
  }
}

/** Ask, answered from Supabase alone. Renders into the given container. */
async function answerLocally(host, question) {
  const words = searchTerms(question);
  const tries = [];
  if (words.length > 1) tries.push(words.slice(0, 3).join(' '));
  for (const w of words) tries.push(w);
  if (!tries.length) tries.push(String(question || '').trim());

  // Some questions are about a group, not a person. These are the shapes the
  // suggestion chips use, and a name search would answer all of them wrongly.
  const low = String(question || '').toLowerCase();
  let groupSel = null, groupLabel = '';
  if (/overdue|follow.?up|chas|quiet|gone cold|owed/.test(low)) {
    groupSel = 'select=*&or=(has_open_next_step.is.true,days_quiet.gt.60)'
             + '&order=days_quiet.desc.nullslast&limit=40';
    groupLabel = 'Overdue a follow-up, longest wait first';
  } else if (/opportunit|mandate|waiting on me|approve/.test(low)) {
    const m = await readRows('wi_mandates',
      'select=id,investor_name,organization_name,investor_country,investor_type,fit_score,fit_reason'
      + '&qualification=eq.uncertain&published_at=is.null&order=fit_score.desc.nullslast&limit=40',
      'wi.reviews.pending', {});
    if (!m.length) { host.appendChild(el('p', null, 'Nothing is waiting on a decision.')); return; }
    host.appendChild(el('p', { class: 'mono',
      style: 'color:var(--ink-3);font-size:11px;letter-spacing:.14em;text-transform:uppercase;margin:0 0 6px' },
      m.length + ' waiting on a decision'));
    for (const x of m) {
      host.appendChild(entry({
        tone: 'signal', rail: x.fit_score !== null && x.fit_score !== undefined ? String(x.fit_score) : '',
        action: x.investor_name || x.organization_name || ('Mandate #' + x.id),
        who: [x.organization_name, asText(x.investor_country), asText(x.investor_type)].filter(Boolean).join('  \u00B7  '),
        evidence: [['why  ', asText(x.fit_reason)]],
        actions: [{ label: 'Open Approvals', run: () => go('approvals') }]
      }));
    }
    return;
  }

  // "who knows us" is a filter, not a search term.
  const wantsKnown = /knows? us|know taranis|knows taranis|heard of us/.test(low);

  // People. A place name has to be matched against city and country too, or
  // "who in Geneva" only finds firms with Geneva in their name.
  for (const t of (groupSel ? [null] : tries)) {
    let people = [];
    try {
      let sel = groupSel;
      if (!sel) {
        if (!t) continue;
        sel = 'select=*&limit=40&order=last_contact_at.desc.nullslast'
            + ilikeAny(['name', 'company', 'city', 'country', 'role'], t);
      }
      if (wantsKnown) sel += '&knows_us=in.(yes,vaguely)';
      people = await readRows('contacts_app', sel, 'contacts.search', { q: t || '', filter: 'all' });
    } catch (e) {
      host.appendChild(el('div', { class: 'banner' }, el('b', null, 'Could not read. '), e.message));
      return;
    }
    if (people.length) {
      host.appendChild(el('p', { class: 'mono',
        style: 'color:var(--ink-3);font-size:11px;letter-spacing:.14em;text-transform:uppercase;margin:0 0 8px' },
        (groupLabel || (people.length + ' match \u201C' + t + '\u201D'))
        + (wantsKnown ? ', who already know us' : '')));

      // One card each. The full record is behind View profile rather than
      // printed out for everyone, so a list of thirty stays readable.
      for (const p of people) {
        const dq = daysSince(p.last_contact_at || p.last_interaction);
        host.appendChild(entry({
          tone: p.knows_us === 'yes' ? 'good' : p.knows_us === 'vaguely' ? 'signal' : '',
          rail: dq === null ? 'never' : dq + 'd',
          action: p.name,
          who: [p.role, p.company, p.city, p.country].filter(Boolean).join('  \u00B7  '),
          evidence: [
            ['last spoke ', (p.last_contact_at || p.last_interaction)
                ? fmtDate(p.last_contact_at || p.last_interaction) : 'never'],
            ['about      ', p.last_contact_summary || p.last_contact_note],
            ['next step  ', p.next_step],
            ['knows us   ', p.knows_us]
          ],
          actions: [
            { label: 'View profile', primary: true, run: () => openProfile(p) },
            { label: 'Draft an email', run: () => { PENDING.draft = p.name; go('email'); } }
          ]
        }));
      }
      if (people.length === 1) await localDossier(host, people[0]);
      return;
    }
    if (groupSel) break;
  }

  // Nobody by that name. Fall back to the words themselves, across the mail
  // and the mandate list, so the question still returns something real.
  const t = tries[0];
  let mail = [], mandates = [];
  try {
    mail = await readRows('crm_emails_app',
      'select=*&order=received_at.desc&limit=15'
      + ilikeAny(['subject', 'summary', 'counterparty_name', 'counterparty_addr'], t),
      'emails.search', { q: t, side: 'all' });
  } catch (_) {}
  try {
    mandates = await readRows('wi_mandates',
      'select=id,investor_name,organization_name,investor_country,investor_type,fit_score,fit_reason'
      + '&order=id.desc&limit=8'
      + ilikeAny(['investor_name', 'organization_name', 'investor_country', 'fit_reason'], t),
      'wi.mandates.list', {});
  } catch (_) {}

  if (!mail.length && !mandates.length) {
    host.appendChild(el('p', null,
      'Nothing in the contact book, the email history or the mandate list matches \u201C'
      + t + '\u201D. Ask agent can reason about a vaguer question \u2014 this mode only finds what is written down.'));
    return;
  }

  if (mail.length) {
    host.appendChild(el('p', { class: 'mono',
      style: 'color:var(--ink-3);font-size:11px;letter-spacing:.14em;text-transform:uppercase;margin:0 0 6px' },
      'Email mentioning that'));
    for (const m of mail) {
      host.appendChild(entry({
        tone: 'quiet', rail: fmtDate(m.received_at),
        action: m.subject || '(no subject)',
        who: m.counterparty_name || m.counterparty_addr || '',
        evidence: [['about   ', m.summary]],
        actions: [{ label: 'Read the email', run: () => readEmail(m.id, m.subject) }]
      }));
    }
  }

  if (mandates.length) {
    host.appendChild(el('p', { class: 'mono',
      style: 'color:var(--ink-3);font-size:11px;letter-spacing:.14em;text-transform:uppercase;margin:16px 0 6px' },
      'Opportunities'));
    for (const m of mandates) {
      host.appendChild(entry({
        tone: 'accent', rail: m.fit_score !== null && m.fit_score !== undefined ? String(m.fit_score) : '',
        action: m.investor_name || m.organization_name,
        who: [m.organization_name, m.investor_country, m.investor_type].filter(Boolean).join('  \u00B7  '),
        evidence: [['why  ', m.fit_reason]]
      }));
    }
  }
}

function closeSheet() { $('sheet').classList.remove('on'); }
$('sheet').addEventListener('click', e => { if (e.target.id === 'sheet') closeSheet(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSheet(); });

function editSheet(r) {
  const sel = el('select', { class: 'search' });
  for (const f of ['company', 'contact_name', 'subject', 'intelligence_text'])
    sel.appendChild(el('option', { value: f }, f));
  const val = el('textarea', { class: 'ta', placeholder: 'The corrected value' });
  sheet('Correct a field', [
    el('label', { class: 'field' }, el('span', null, 'Field'), sel),
    el('label', { class: 'field' }, el('span', null, 'New value'), val)
  ], [
    el('button', { class: 'btn btn-quiet', onclick: closeSheet }, 'Cancel'),
    el('button', {
      class: 'btn', onclick: async () => {
        closeSheet();
        await act('wi.review.edit', { review_id: r.review_id, field: sel.value, value: val.value }, 'Corrected');
      }
    }, 'Save the correction')
  ]);
}

function fillSheet(m) {
  const sel = el('select', { class: 'search' });
  for (const f of ['ticket_min_usd', 'ticket_max_usd', 'aum_usd', 'investor_type', 'investor_country',
                   'investor_city', 'linkedin_url', 'allocation_timing', 'strategies', 'contact_name'])
    sel.appendChild(el('option', { value: f }, f));
  const val = el('input', { class: 'search', placeholder: 'Value' });
  sheet('Fill a gap on #' + m.id, [
    el('label', { class: 'field' }, el('span', null, 'Field'), sel),
    el('label', { class: 'field' }, el('span', null, 'Value'), val)
  ], [
    el('button', { class: 'btn btn-quiet', onclick: closeSheet }, 'Cancel'),
    el('button', {
      class: 'btn', onclick: async () => {
        closeSheet();
        await act('wi.mandate.fill', { id: m.id, field: sel.value, value: val.value }, 'Saved');
      }
    }, 'Save')
  ]);
}

function reviewDraft(d) {
  const body = el('textarea', { class: 'ta' });
  body.value = d.body || '';
  sheet('Send to ' + (d.contact_name || ''), [
    el('p', { class: 'mono', style: 'font-size:12px;color:var(--ink-3);margin:0 0 10px' },
      (d.to_addr || '') + '  ·  ' + (d.subject || '')),
    body
  ], [
    el('button', { class: 'btn btn-quiet', onclick: closeSheet }, 'Not yet'),
    el('button', {
      class: 'btn', onclick: async () => {
        closeSheet();
        await act('crm.email.send', { draft_id: d.draft_id, body: body.value }, 'Sent, and filed against the contact');
      }
    }, 'Send it')
  ]);
}

/* ------------------------------------------------------------ background */

/* The badges used to call the gateway every 45 seconds. One tab left open
   overnight spent roughly two thousand n8n executions on refreshing two
   numbers, which is what exhausted the plan. Both counts come from tables
   the console can already read, so this now costs nothing at all.
   n8n is spent only on things that actually do something: sending an
   email, issuing a Zoom link. */

async function poll() {
  if (document.hidden) return;          // a background tab counts nothing
  try {
    const [n, m] = await Promise.all([
      supaSelect('app_notifications', 'select=id&read_at=is.null&limit=200'),
      supaSelect('wi_mandates', 'select=id&qualification=eq.uncertain&published_at=is.null&limit=200')
    ]);
    counts.today = n.length;
    counts.approvals = m.length;
    paintCounts();
  } catch (_) { /* a failed poll is not worth interrupting anyone */ }
}

/* ------------------------------------------------------------- demo data */

function demoResponse(action) {
  const wait = (v) => new Promise(r => setTimeout(() => r(v), 260));
  const D = {
    'today.counts': { unread: 3, pending_reviews: 2 },
    'today.feed': { items: [
      { kind: 'review', source: 'WI', title: 'Two opportunities need a decision',
        subtitle: 'Screened overnight, neither clean enough to publish on its own',
        at: Date.now() - 3.2e6, fields: [{ label: 'highest', value: 'Wealthspire Advisors — 0.71' }], review_id: 'wi-482' },
      { kind: 'matched', source: 'WI', title: 'Published to the team automatically',
        subtitle: 'Cheviot Asset Management — UK MFO, equity L/S, open to emerging managers',
        at: Date.now() - 7.4e6, fields: [{ label: 'score', value: '0.86' }, { label: 'ticket', value: '1,000,000' }] },
      { kind: 'followup', source: 'CRM', title: 'Four people are waiting on a reply',
        subtitle: 'Oldest has been sitting eleven days', at: Date.now() - 1.1e7,
        fields: [{ label: 'oldest', value: 'Miles Kerstein — 11 days' }] }
    ] },
    'wi.reviews.pending': { rows: [
      { review_id: 'wi-482-m1x', contact_name: 'Wealthspire Advisors', company: 'Wealthspire Advisors LLC',
        investor_country: 'US', investor_type: 'wealth manager', ticket_min_usd: '500000',
        fit_score: '0.71', fit_reason: 'US wealth manager, eligible strategy, emerging-manager appetite not stated' },
      { review_id: 'wi-486-k2p', contact_name: 'Al Rajhi family office', company: '—',
        investor_country: 'GB', investor_type: 'single family office', ticket_min_usd: '',
        fit_score: '0.63', fit_reason: 'Ticket and AUM not stated in the alert' }
    ] },
    'contacts.search': { rows: [
      { name: 'Miles Kerstein', company: 'Pictet Wealth Management', city: 'Geneva', country: 'CH',
        email: 'm.kerstein@example.ch', knows_us: 'yes', category: 'wealth manager',
        last_interaction: Date.now() - 9.5e8, next_step: 'Send the July TMS and ask for 20 minutes',
        last_contact_note: 'He asked for the track record net of fees' },
      { name: 'Sophie Ravel', company: 'Mirabaud', city: 'Geneva', country: 'CH',
        email: 's.ravel@example.ch', knows_us: 'vaguely', category: 'EAM',
        last_interaction: Date.now() - 1.6e9, next_step: 'Re-introduce via Antoine',
        last_contact_note: 'Intro forwarded, no reply' },
      { name: 'Daniel Okafor', company: 'Cheviot', city: 'London', country: 'GB',
        email: 'd.okafor@example.co.uk', knows_us: 'no', category: 'MFO',
        last_interaction: null, next_step: 'First approach', last_contact_note: '' }
    ] },
    'wi.mandates.list': { rows: [
      { id: 482, investor_name: 'Wealthspire Advisors', organization_name: 'Wealthspire Advisors LLC',
        investor_country: 'US', investor_city: 'New York', investor_type: 'wealth manager',
        strategies: '["equity_long_short"]', ticket_min_usd: '500000', qualification: 'uncertain',
        fit_score: '0.71', fit_reason: 'Eligible on strategy and domicile; appetite not stated',
        missing_hard_fields: '["emerging_managers"]', linkedin_url: '' },
      { id: 479, investor_name: 'Cheviot Asset Management', organization_name: 'Cheviot',
        investor_country: 'GB', investor_city: 'London', investor_type: 'multi family office',
        strategies: '["equity_long_short"]', ticket_min_usd: '1000000', qualification: 'matched',
        fit_score: '0.86', fit_reason: 'UK MFO, equity L/S, open to emerging managers',
        missing_hard_fields: '[]', linkedin_url: 'https://www.linkedin.com/in/example' },
      { id: 474, investor_name: 'Northbridge Infrastructure', organization_name: '',
        investor_country: 'CA', investor_city: '', investor_type: 'infrastructure',
        strategies: '[]', ticket_min_usd: '', qualification: 'rejected', fit_score: '0.12',
        fit_reason: 'Outside GB/CH/US and ineligible type', missing_hard_fields: '[]', linkedin_url: '' }
    ] },
    'docs.list': { rows: [
      { doc_key: 'tms', title: 'Taranis Market Sentiment', version_label: 'v14', month_label: 'Jul 2026',
        public_url: 'https://example.com/tms-jul.pdf', is_current: true, added_on: Date.now() - 1.2e9 },
      { doc_key: 'gdn', title: 'GDN monthly report', version_label: 'v9', month_label: 'Jun 2026',
        public_url: 'https://example.com/gdn-jun.pdf', is_current: false, added_on: Date.now() - 4e9 },
      { doc_key: 'tms', title: 'Taranis Market Sentiment', version_label: 'v13', month_label: 'Jun 2026',
        public_url: 'https://example.com/tms-jun.pdf', is_current: false, added_on: Date.now() - 4.1e9 }
    ] },
    'li.search': { rows: [
      { full_name: 'Miles Kerstein', profile_url: 'https://www.linkedin.com/in/example', match: 'exact' }
    ] },
    'emails.search': { rows: [
      { id: 1, received_at: Date.now() - 9.5e8, subject: 'Re: track record net of fees',
        summary: 'He asked for the numbers after all charges before taking it further.',
        intent: 'request', direction: 'inbound', side: 'client', counterparty_name: 'Miles Kerstein',
        person_company: 'Pictet Wealth Management', requires_action: true, replied: false,
        has_attachments: false, embedding_ready: true },
      { id: 2, received_at: Date.now() - 1.1e9, subject: 'July TMS',
        summary: 'Sent the monthly note and offered a call in the week of the 24th.',
        intent: 'share', direction: 'outbound', side: 'client', counterparty_name: 'Sophie Ravel',
        person_company: 'Mirabaud', requires_action: false, replied: true,
        has_attachments: true, embedding_ready: true },
      { id: 3, received_at: Date.now() - 2.2e9, subject: 'Desk notes',
        summary: 'Internal handover before the Geneva trip.', intent: 'internal',
        direction: 'inbound', side: 'internal', counterparty_name: 'Antoine Megarbane',
        person_company: 'Taranis', requires_action: false, replied: false,
        has_attachments: false, embedding_ready: false }
    ] },
    'li.mutual': { rows: [
      { full_name: 'Miles Kerstein', profile_url: 'https://www.linkedin.com/in/example',
        mutual_to: ['Nada Osama'], mutual_count: 1, in_contact_book: true, last_synced: Date.now() - 8.6e7 }
    ] },
    'zoom.upcoming': { rows: [] },
    'crm.email.draft': { draft_id: 'drf-9931', contact_name: 'Miles Kerstein', to_addr: 'm.kerstein@example.ch',
      subject: 'July TMS, and twenty minutes if you have them',
      body: 'Miles,\n\nJuly\u2019s Taranis Market Sentiment is attached. The section on positioning into the\nAugust roll is the part I think answers your question about the track record net\nof fees \u2014 the numbers there are after all charges.\n\nWould twenty minutes in the week of the 24th suit you?\n\nAntoine' },
    'assistant.ask': { sources: ['contacts', 'crm_emails'], answer:
      'Three people in Geneva know us, and one of them is worth calling this morning.\n\n' +
      '\u25CF <b>Miles Kerstein</b> \u2014 Pictet Wealth Management\n' +
      '     Last spoke 11 days ago. He asked for the track record net of fees and you have not\n' +
      '     sent it. July\u2019s TMS answers him directly.\n\n' +
      '\u25CF <b>Sophie Ravel</b> \u2014 Mirabaud\n' +
      '     Only knows us vaguely. Antoine\u2019s introduction went out in March and never landed.\n\n' +
      'This is a sample answer. Connect the gateway and it queries the real book.' }
  };
  return wait(D[action] || { ok: true, rows: [], items: [] });
}

/* ---------------------------------------------------------------- launch */

function start() {
  $('gate').style.display = 'none';
  $('app').className = 'on';
  $('who').textContent = DEMO ? 'Sample data' : (session.email || 'Signed in');
  buildNav();
  go('today');
  if (!DEMO) {
    poll();
    pollTimer = setInterval(poll, Math.max(60, CFG.pollSeconds) * 1000);
    // Coming back to the tab is worth one immediate refresh; sitting on
    // another tab is not worth any.
    document.addEventListener('visibilitychange', () => { if (!document.hidden) poll(); });
  } else {
    counts.today = 3; counts.approvals = 2; paintCounts();
  }
}

async function doSignIn() {
  const email = $('gate-email').value.trim();
  const pass  = $('gate-pass').value;
  if (!email || !pass) return toast('Enter your email and password.', true);
  if (!CFG.supabaseUrl) {
    $('gate-note').textContent =
      'No Supabase project connected yet. Open the sample data below, or set TARANIS_CONFIG in config.js.';
    return;
  }
  const b = $('gate-go'); b.disabled = true; b.textContent = 'Signing in…';
  try {
    saveSession(await signInWithPassword(email, pass));
    $('gate-pass').value = '';
    $('gate-note').textContent = 'Only addresses on the allow list can sign in.';
    start();
  } catch (e) {
    $('gate-note').textContent = e.message;
  } finally { b.disabled = false; b.textContent = 'Sign in'; }
}

$('gate-go').addEventListener('click', doSignIn);
$('gate-email').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('gate-pass').focus(); });
$('gate-pass').addEventListener('keydown', (e) => { if (e.key === 'Enter') doSignIn(); });

$('gate-demo').addEventListener('click', () => { DEMO = true; session = { email: 'sample' }; start(); });
$('signout').addEventListener('click', signOut);

/* ------------------------------------------------------ update watching

   The console is usually opened as an installed window, which has no reload
   button and caches hard. GitHub Actions stamps the commit hash onto the
   script URLs, so app.js can never be stale once the page itself is fresh.
   build.txt is then read with no-store, which no cache is allowed to answer,
   and a newer deployment is offered rather than forced.
   --------------------------------------------------------------------- */

async function deployedBuild() {
  try {
    const r = await fetch('./build.txt?t=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) return null;
    return (await r.text()).trim();
  } catch (_) { return null; }
}

function offerUpdate() {
  if ($('updbar')) return;
  const bar = el('div', {
    id: 'updbar', class: 'banner',
    style: 'position:fixed;top:0;left:0;right:0;z-index:99;margin:0;border-radius:0;'
         + 'display:flex;align-items:center;gap:12px;justify-content:center'
  },
    el('b', null, 'A newer version of the console is ready.'),
    el('button', { class: 'btn btn-sm', onclick: () => location.reload() }, 'Load it'));
  document.body.insertBefore(bar, document.body.firstChild);
}

async function watchForUpdates() {
  if (!CFG.build) return;          // running locally, or before the first stamped deploy
  const check = async () => {
    const b = await deployedBuild();
    if (b && b !== CFG.build) offerUpdate();
  };
  await check();
  setInterval(check, 5 * 60 * 1000);
}

watchForUpdates();

(async function boot() {
  // A recovery or invite link still arrives with the token in the fragment,
  // so that path is kept. The normal path is now a stored session.
  const t = readTokenFromUrl();
  if (t && t.token) {
    saveSession({ token: t.token, refresh: null, email: t.email, expires: Date.now() + 3600000 });
    start();
    return;
  }
  const s = loadSession();
  if (!s || !s.token) return;
  session = s;
  try {
    await ensureToken();
    const r = await fetch(CFG.supabaseUrl + '/auth/v1/user', {
      headers: { apikey: CFG.supabaseAnonKey, Authorization: 'Bearer ' + session.token }
    });
    if (!r.ok) throw new Error('stale');
    start();
  } catch (_) {
    signOut();
  }
})();
