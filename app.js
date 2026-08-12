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
  pollSeconds: 45
}, window.TARANIS_CONFIG || {});

let DEMO = false;                 // sample-data mode
let session = null;               // { email, token }
let pollTimer = null;
const counts = { today: 0, approvals: 0 };
const PENDING = { q: null, draft: null, meet: null };   // a question handed from one tab to another

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
      if (xhr.status >= 200 && xhr.status < 300) resolve(path);
      else if (xhr.status === 409) reject(new Error('A file with that name is already stored. Change the version label.'));
      else if (xhr.status === 401 || xhr.status === 403) reject(new Error('Not allowed to upload. Ask for the documents bucket to be opened to you.'));
      else reject(new Error('Upload failed (' + xhr.status + ')'));
    };
    xhr.onerror = () => reject(new Error('Upload failed. Check your connection.'));
    xhr.send(file);
  });
}

/* ------------------------------------------------------------------ auth */

async function sendMagicLink(email) {
  const res = await fetch(CFG.supabaseUrl + '/auth/v1/otp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: CFG.supabaseAnonKey },
    body: JSON.stringify({ email, create_user: false })
  });
  if (!res.ok) throw new Error('Could not send the link. Check the address is on the allow list.');
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
  { id: 'email',    icon: '\u2709', label: 'Email',        title: 'Email',
    sub: 'Draft to a contact, read it back, then send. Nothing leaves without you approving it.' },
  { id: 'inbox',    icon: '\u25A4', label: 'Correspondence', title: 'Correspondence',
    sub: 'Every email sent and received, split between clients and the Taranis side.' },
  { id: 'opps',     icon: '\u25B2', label: 'Opportunities',title: 'Opportunities',
    sub: 'Mandates from With Intelligence, scored against the Taranis criteria.' },
  { id: 'meetings', icon: '\u25D0', label: 'Meetings',     title: 'Meetings',
    sub: 'Schedule a Zoom against a contact and keep it on their record.' },
  { id: 'docs',     icon: '\u25AC', label: 'Documents',    title: 'Documents',
    sub: 'Upload a deck or report, and it is versioned, stored and announced to the team.' },
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
    const hot = /last spoke|starts|on\s/.test(k);
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
function askAbout(q) { PENDING.q = q; go('ask'); }

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

RENDER.today = function (body) {
  load(body, 'today.feed', {}, (d) => {
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
  load(body, 'wi.reviews.pending', {}, (d) => {
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
          ['country ', r.investor_country],
          ['type    ', r.investor_type],
          ['ticket  ', r.ticket_min_usd],
          ['score   ', r.fit_score],
          ['reason  ', r.fit_reason]
        ],
        tags: [['pending', 'signal']],
        actions: [
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
  input.addEventListener('keydown', e => { if (e.key === 'Enter') run(); });

  function run() {
    clear(out);
    out.appendChild(el('p', { class: 'mono', style: 'color:var(--ink-3);font-size:12px' }, 'Loading…'));
    fill(out, () => {
      const q = input.value.trim();
      // contacts_app is the view from migration 3: it carries side
      // (taranis / external), the cleaned knows_us, and days_quiet.
      let sel = 'select=*&limit=60&order=last_contact_at.desc.nullslast';
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
            ['about      ', c.last_contact_summary || c.last_contact_note],
            ['next step  ', c.next_step],
            ['email      ', c.email]
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
            { label: 'Draft an email', primary: true, run: () => { PENDING.draft = c.name; go('email'); } },
            { label: 'Book a Zoom', run: () => { PENDING.meet = c.name; go('meetings'); } },
            { label: 'History', run: () => askAbout('What did we send ' + c.name + ' and when was our last contact?') }
          ]
        }));
      }
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
    placeholder: 'Subject, summary, or who it was with\u2026' });
  // Default excludes mail with no contact resolved: that is where the
  // provider notices and other noise end up, and it is not correspondence.
  let side = 'matched';
  const chips = el('div', { class: 'chips' });
  for (const [k, lbl] of [['matched', 'Correspondence'], ['client', 'Clients'],
                          ['internal', 'Taranis side'], ['unknown', 'Unmatched'],
                          ['all', 'Everything']]) {
    chips.appendChild(el('button', { class: 'chip', onclick: () => { side = k; run(); } }, lbl));
  }
  body.append(el('div', { class: 'toolbar' }, input,
    el('button', { class: 'btn btn-sm btn-quiet', onclick: () => run() }, 'Search')), chips);
  const out = el('div'); body.appendChild(out);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') run(); });

  function run() {
    clear(out);
    out.appendChild(el('p', { class: 'mono', style: 'color:var(--ink-3);font-size:12px' }, 'Loading\u2026'));
    const q = input.value.trim();
    let sel = 'select=*&order=received_at.desc&limit=60';
    if (q) {
      const t = '*' + q.replace(/[,()*]/g, '') + '*';
      sel += '&or=(subject.ilike.' + t + ',summary.ilike.' + t
           + ',counterparty_name.ilike.' + t + ',counterparty_addr.ilike.' + t + ')';
    }
    if (side === 'matched') sel += '&side=in.(client,internal)';
    else if (side !== 'all') sel += '&side=eq.' + side;

    fill(out, () => readRows('crm_emails_app', sel, 'emails.search', { q, side }), (rows) => {
      if (!rows.length) {
        return out.appendChild(empty('Nothing here',
          side === 'unknown'
            ? 'Good \u2014 every email is matched to a person.'
            : 'Try a subject line, or the name of whoever it was with.'));
      }
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
            m.requires_action && !m.replied ? ['needs a reply', 'signal'] : null,
            m.has_attachments ? ['attachment', ''] : null,
            m.embedding_ready === false ? ['not searchable yet', 'quiet'] : null
          ].filter(Boolean),
          actions: m.counterparty_name ? [
            { label: 'What else with them', run: () => { input.value = m.counterparty_name; side = 'all'; run(); } },
            { label: 'Ask about this', run: () => askAbout('What did we last send ' + m.counterparty_name + ', and when?') }
          ] : []
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
        action: m.investor_name || 'Unnamed',
        who: [m.organization_name, m.investor_country, m.investor_city].filter(Boolean).join(' · '),
        evidence: [
          ['type      ', m.investor_type],
          ['strategy  ', m.strategies],
          ['ticket    ', m.ticket_min_usd],
          ['score     ', m.fit_score],
          ['reason    ', m.fit_reason],
          ['not stated', m.missing_hard_fields]
        ],
        tags: [[m.qualification, tone]],
        actions: [
          { label: 'Fill a gap', run: () => fillSheet(m) },
          m.qualification === 'rejected'
            ? { label: 'Accept anyway', run: () => act('wi.mandate.accept', { id: m.id }, 'Accepted and published') }
            : null,
          m.linkedin_url ? { label: 'Check the network', run: () => act('li.check', { url: m.linkedin_url }, 'Checking') } : null
        ].filter(Boolean)
      }));
    }
  });
};

RENDER.meetings = function (body) {
  clear(body);
  body.appendChild(el('div', { class: 'banner' },
    el('b', null, 'Not yet wired. '),
    'None of the eighteen workflows book Zoom calls today — this tab is the shape of it, ready for the Zoom workflow to be added behind it.'));
  const who = el('input', { class: 'search', placeholder: 'Who is it with?' });
  const when = el('input', { class: 'search', type: 'datetime-local' });
  const mins = el('input', { class: 'search', type: 'number', value: '30', min: '15', step: '15', style: 'max-width:110px' });
  body.append(el('div', { class: 'toolbar' }, who),
              el('div', { class: 'toolbar' }, when, mins,
                 el('button', { class: 'btn btn-sm', onclick: () => book() }, 'Create the meeting')));
  const out = el('div'); body.appendChild(out);
  if (PENDING.meet) { who.value = PENDING.meet; PENDING.meet = null; when.focus(); }

  async function book() {
    if (!who.value.trim() || !when.value) return toast('Name the person and pick a time.', true);
    try {
      const d = await callGateway('zoom.create', {
        contact: who.value.trim(), start: when.value, minutes: Number(mins.value) || 30
      });
      clear(out);
      out.appendChild(entry({
        tone: 'good', rail: 'zoom',
        action: 'Meeting created',
        who: d.topic || who.value,
        evidence: [['starts ', fmtDate(d.start_time)], ['join   ', d.join_url]]
      }));
      toast('Meeting created and saved to the contact.');
    } catch (e) { toast(e.message, true); }
  }

  // crm_meetings is the table that already exists, with meet_url on it.
  fill(out, () => readRows('crm_meetings',
      'select=id,title,status,start_utc,duration_min,meet_url,to_people'
      + '&order=start_utc.desc&limit=40', 'zoom.upcoming', {}), (rows) => {
    if (!rows.length) {
      return out.appendChild(empty('Nothing booked',
        'Meetings booked anywhere appear here once they are saved to the database.'));
    }
    for (const m of rows) {
      const who = Array.isArray(m.to_people)
        ? m.to_people.map(p => (p && (p.name || p.email)) || p).join(', ') : '';
      const past = m.start_utc && new Date(m.start_utc) < new Date();
      out.appendChild(entry({
        tone: past ? 'quiet' : 'good',
        rail: past ? 'past' : 'next',
        action: m.title || 'Meeting',
        who: who,
        evidence: [['starts   ', fmtDate(m.start_utc)],
                   ['minutes  ', m.duration_min],
                   ['join     ', m.meet_url]],
        tags: m.status ? [[m.status, past ? 'quiet' : 'good']] : [],
        actions: m.meet_url ? [{ label: 'Copy the link', run: () => copy(m.meet_url) }] : []
      }));
    }
  });
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
      actions: x.public_url ? [{ label: 'Copy the link', run: () => copy(x.public_url) }] : []
    }));
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
          tags: p.in_contact_book ? [['in the book', 'good']] : [['not in the book', 'quiet']]
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
  const chips = el('div', { class: 'chips' });
  for (const s of [
    'Who in Geneva knows us?',
    'Who is overdue a follow-up?',
    'What did we last send Pictet, and when?',
    'Which opportunities are still waiting on me?'
  ]) chips.appendChild(el('button', { class: 'chip', onclick: () => { input.value = s; send(); } }, s));

  const input = el('textarea', { id: 'ask-in', rows: '1', placeholder: 'Ask anything you used to type into the bot…' });
  const btn = el('button', { class: 'btn' }, 'Ask');
  const bar = el('div', { id: 'ask-bar' }, chips, el('div', { id: 'ask-row' }, input, btn));
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
        'Ask about anyone in the book, what was sent and when, opportunities, documents, or the network. ' +
        'Every answer is queried fresh — it never answers from what it said earlier.')));
  }

  // A question handed over from another tab (e.g. the History button on a
  // contact) is parked on PENDING and picked up once this tab is built.
  if (PENDING.q) { const q = PENDING.q; PENDING.q = null; input.value = q; setTimeout(send, 40); }

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
      log.appendChild(el('div', { class: 'msg' },
        el('div', { class: 'from' }, 'Taranis'),
        el('div', { class: 'bub', style: 'border-color:var(--bad);color:var(--bad)' }, e.message)));
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

async function poll() {
  try {
    const d = await callGateway('today.counts', {});
    counts.today = d.unread || 0;
    counts.approvals = d.pending_reviews || 0;
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
    pollTimer = setInterval(poll, Math.max(20, CFG.pollSeconds) * 1000);
  } else {
    counts.today = 3; counts.approvals = 2; paintCounts();
  }
}

$('gate-go').addEventListener('click', async () => {
  const email = $('gate-email').value.trim();
  if (!email) return toast('Enter your work email.', true);
  if (!CFG.supabaseUrl) {
    $('gate-note').textContent =
      'No Supabase project connected yet. Open the sample data below, or set TARANIS_CONFIG in config.js.';
    return;
  }
  const b = $('gate-go'); b.disabled = true; b.textContent = 'Sending…';
  try {
    await sendMagicLink(email);
    $('gate-note').textContent = 'Check ' + email + '. The link works once and expires in an hour.';
  } catch (e) {
    $('gate-note').textContent = e.message;
  } finally { b.disabled = false; b.textContent = 'Send sign-in link'; }
});

$('gate-demo').addEventListener('click', () => { DEMO = true; session = { email: 'sample' }; start(); });
$('signout').addEventListener('click', signOut);

(function boot() {
  const t = readTokenFromUrl();
  if (t) { session = t; start(); }
})();
