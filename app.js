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

function ensureBrandFonts() {
  if (document.getElementById('taranis-fonts')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600'
            + '&family=Hanken+Grotesk:wght@300;400;500;600&display=swap';
  document.head.appendChild(link);
  const style = document.createElement('style');
  style.id = 'taranis-fonts';
  style.textContent =
    "html body,body input,body select,body textarea,body button{font-family:'Hanken Grotesk',system-ui,sans-serif}"
  + ".mono{font-family:'Hanken Grotesk',system-ui,sans-serif;font-variant-numeric:tabular-nums lining-nums}"
  + "html #pg-title,.word,.rpt-kpi .v,.rpt-oc .sc b{font-family:'Fraunces',Georgia,serif;font-weight:500}";
  document.head.appendChild(style);
}

function ensureCardStyle() {
  if (document.getElementById('taranis-cards')) return;
  const s = document.createElement('style');
  s.id = 'taranis-cards';
  s.textContent =
    "#pg-body{background:#F3F7FA url('./brand-pattern-light.svg') center top / 1400px auto repeat}"
  + ".entry{display:flex;gap:0;align-items:stretch;background:#fff;border:1px solid var(--rule,#E9EFF3);border-radius:12px;padding:18px 20px;margin:0 0 14px;box-shadow:0 1px 2px rgba(16,35,58,.04),0 6px 16px rgba(16,35,58,.05)}"
  + ".entry:hover{border-color:#CFE6EF;box-shadow:0 2px 4px rgba(16,35,58,.05),0 10px 24px rgba(0,120,160,.08)}"
  + ".entry.good{box-shadow:inset 3px 0 0 #1E9E63,0 1px 2px rgba(16,35,58,.03)}"
  + ".entry.signal{box-shadow:inset 3px 0 0 var(--signal,#C89000),0 1px 2px rgba(16,35,58,.03)}"
  + ".entry.bad{box-shadow:inset 3px 0 0 #C6402B,0 1px 2px rgba(16,35,58,.03)}"
  + ".entry.quiet{box-shadow:inset 3px 0 0 #C6D2DC,0 1px 2px rgba(16,35,58,.03)}"
  + ".entry-rail{display:flex;flex-direction:row;align-items:flex-start;gap:6px;min-width:0;margin:0;padding:0;background:none;border-right:0;overflow:visible}"
  + ".entry .dot{display:none}"
  + ".entry .rail-n{display:none}"
  + ".entry-main{flex:1;min-width:0}"
  + ".entry-act{font-size:16px;font-weight:500;color:var(--ink);margin:0 0 3px;line-height:1.3}"
  + ".entry-who{font-size:12px;color:var(--ink-3);margin:0 0 12px}"
  + ".entry .acts{display:flex;gap:8px;flex-wrap:wrap;align-items:center}"
  + ".entry .acts:has(.tag){margin:0 0 12px}"
  + ".entry .acts:has(.btn){margin:14px 0 0}"
  + ".entry .acts .tag{font-size:9.5px;letter-spacing:.08em;text-transform:uppercase;padding:3px 9px;border-radius:999px;background:rgba(0,168,208,.10);color:#0a6f8a;border:0}"
  + ".entry .acts .tag.signal{background:rgba(216,162,39,.16);color:#946200}"
  + ".entry .acts .tag.bad{background:#FBEAE5;color:#C1402A}"
  + ".entry .acts .tag.good{background:#E7F6EE;color:#147A50}"
  + ".entry .callout{border-radius:10px;padding:12px 14px;margin:2px 0 14px}"
  + ".entry .ev{font-size:13px}"
  + ".entry .ev .k{color:var(--ink-3);margin-right:10px}"
  + ".entry .acts .btn.btn-sm{border-radius:8px;padding:8px 14px;font-size:12.5px;font-weight:500;border:1px solid var(--rule,#E9EFF3);background:#fff;color:var(--ink-2)}"
  + ".entry .acts .btn.btn-sm:not(.btn-quiet){border-color:var(--accent,#00A8D0);color:var(--accent,#00A8D0)}"
  + ".entry .acts .btn.btn-sm:hover{background:rgba(0,168,208,.06)}";
  document.head.appendChild(s);
}

ensureBrandFonts();
ensureCardStyle();

function ensureEntrySkin() {
  if (document.getElementById('taranis-entry-skin')) return;
  const s = document.createElement('style');
  s.id = 'taranis-entry-skin';
  s.textContent =
    "#pg-body .entry{position:relative;border:1px solid var(--rule,#E9EFF3);border-radius:14px;overflow:hidden;"
      + "background:var(--card,#fff);box-shadow:0 1px 2px rgba(16,35,58,.03),0 12px 28px rgba(16,35,58,.05);"
      + "margin:0 0 14px}"
  + "#pg-body .entry::before{content:'';position:absolute;left:0;top:0;bottom:0;width:4px;background:#C6D2DC;z-index:1}"
  + "#pg-body .entry.good::before{background:#1E9E8A}#pg-body .entry.signal::before{background:#00A8D0}"
  + "#pg-body .entry.quiet::before{background:#C6D2DC}#pg-body .entry.bad::before{background:#C87A5A}"
  + "#pg-body .entry:hover{box-shadow:0 2px 4px rgba(16,35,58,.05),0 18px 40px rgba(0,120,160,.09)}"
  + "#pg-body .entry .entry-rail{position:absolute;top:14px;right:16px;left:auto;width:auto;min-width:0;padding:0}"
  + "#pg-body .entry .entry-rail .dot{display:none}"
  + "#pg-body .entry .entry-rail .rail-n{opacity:.32;font-size:10.5px;letter-spacing:.1em;text-transform:uppercase}"
  + "#pg-body .entry .entry-act{font-size:16.5px;font-weight:500;color:var(--ink,#10233A);margin:0 0 2px;line-height:1.28}"
  + "#pg-body .entry .entry-who{font-size:12.5px;color:var(--ink-3,#7A8EA0);margin:0 0 2px}"
  + "#pg-body .entry .ev{margin-top:13px;display:flex;flex-direction:column;gap:7px}"
  + "#pg-body .entry .ev>div{font-size:13px;color:var(--ink-2,#41586C);line-height:1.4}"
  + "#pg-body .entry .ev .k{color:var(--ink-3,#7A8EA0);display:inline-block;min-width:78px}"
  + "#pg-body .entry .callout{border-radius:10px;padding:13px 16px}"
  + "#pg-body .entry .acts{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:12px}"
  + "#pg-body .entry .tag{border-radius:999px;padding:3px 10px;font-size:9.5px;letter-spacing:.09em;text-transform:uppercase;font-weight:600}"
  + "#pg-body .entry .btn{border-radius:9px;padding:9px 15px;font-weight:500;letter-spacing:.01em}";
  document.head.appendChild(s);
}
// Not called: ensureCardStyle() is the single entry skin.

let DEMO = false;                 // sample-data mode
let session = null;               // { email, token }
let pollTimer = null;
const counts = { today: 0, approvals: 0, opps: 0, intake: 0, hfn: 0, tools: 0 };
let intakeView = 'all';
let todayView = 'opps';

const OPS_REVIEWERS = ['nada.osama@taranis.net'];
function isOpsReviewer() {
  return OPS_REVIEWERS.indexOf(String((session && session.email) || '').toLowerCase()) !== -1;
}

const jsonArr = (v) => {
  let x = v;
  for (let i = 0; i < 2 && typeof x === 'string'; i++) {
    try { x = JSON.parse(x); } catch (_) { x = []; }
  }
  return Array.isArray(x) ? x : [];
};

const TC_STATUS = {
  not_reviewed:        ['Not reviewed',        ''],
  pending_information: ['Pending information', 'signal'],
  under_review:        ['Under review',        'signal'],
  approved:            ['Approved',            'good'],
  rejected:            ['Rejected',            'bad']
};
const TC_RISK = { low: ['Low', 'good'], medium: ['Medium', 'signal'], high: ['High', 'bad'] };

const TC_SETTABLE = ['not_reviewed', 'pending_information', 'under_review'];

let toolsView = 'all';
let hfnFolder = 'hedge_fund';

const MEETING_PROVIDERS = [
  ['zoom',   'Zoom'],
  ['teams',  'Microsoft Teams'],
  ['meet',   'Google Meet']
];
let meetingProvider = 'zoom';

const MEETING_LANGUAGES = [['en', 'English'], ['fr', 'Français']];
let meetingLanguage = 'en';

let networkPrefill = '';
function providerLabel(v) {
  const hit = MEETING_PROVIDERS.find(p => p[0] === String(v || '').toLowerCase());
  return hit ? hit[1] : (v ? String(v) : '');
}

const HFN_FOLDERS = [
  ['hedge_fund',    'Hedge Fund Alert',           'hedge-fund'],
  ['family_office', 'Family Office Confidential', 'family-office']
];
const PENDING = { q: null, qmode: null, draft: null, meet: null };

/* ------------------------------------------------------------- DOM utils */

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

function num(v) {
  if (v === null || v === undefined || v === '') return '';
  const n = Number(v);
  if (!isFinite(n)) return String(v);
  const s = (Math.abs(n) < 1 || n % 1 !== 0) ? String(parseFloat(n.toFixed(4))) : String(Math.round(n));
  const [i, f] = s.split('.');
  return i.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (f ? '.' + f : '');
}

function scoreText(v) {
  if (v === null || v === undefined || v === '') return '';
  const n = Number(v);
  if (!isFinite(n)) return String(v);
  return parseFloat(n.toFixed(2)) + ' / 1';
}

/* ---- full legal names ---- */
const LEGAL_NAMES = {
  'texas teachers': 'Teacher Retirement System of Texas',
  'trs': 'Teacher Retirement System of Texas',
  'texas trs': 'Teacher Retirement System of Texas',
  'calpers': 'California Public Employees Retirement System',
  'calstrs': 'California State Teachers Retirement System',
  'gic': 'GIC Private Limited',
  'adia': 'Abu Dhabi Investment Authority',
  'cppib': 'Canada Pension Plan Investment Board',
  'cpp investments': 'Canada Pension Plan Investment Board',
  'nbim': 'Norges Bank Investment Management',
  'apg': 'APG Asset Management',
  'pggm': 'PGGM Investments',
  'ontario teachers': 'Ontario Teachers Pension Plan',
  'omers': 'Ontario Municipal Employees Retirement System',
  'wellcome': 'Wellcome Trust',
  'ge pension': 'General Electric Pension Trust',
  'nystrs': 'New York State Teachers Retirement System',
  'nycers': 'New York City Employees Retirement System',
  'fsba': 'Florida State Board of Administration',
  'lacera': 'Los Angeles County Employees Retirement Association'
};

function legalName(v) {
  const s = String(v == null ? '' : v).trim();
  if (!s) return s;
  return LEGAL_NAMES[s.toLowerCase().replace(/[.,]/g, '')] || s;
}

const KNOWN_MANAGERS = /(^|\b)(bridgewater|citadel|millennium management|point ?72|two sigma|renaissance technologies|d\.? ?e\.? shaw|aqr capital|man group|brevan howard|elliott management|baupost|pershing square|third point|tiger global|coatue|marshall wace|capula|winton|bluecrest|balyasny|exodus ?point|schonfeld|\bkkr\b|blackstone|apollo global|carlyle|\btpg\b|ares management|plettenberg|hippocampus)(\b|$)/i;

function resolvedInvestor(m) {
  const inv = legalName(m && m.investor_name);
  const org = legalName(m && m.organization_name);
  if (inv && org && inv !== org && KNOWN_MANAGERS.test(inv) && !KNOWN_MANAGERS.test(org)) {
    return { name: org, otherFirm: inv, corrected: true };
  }
  return { name: inv || org, otherFirm: null, corrected: false };
}

function investorLabel(m) {
  return resolvedInvestor(m).name || ('Mandate #' + (m && m.id));
}

function orgLabel(m) {
  const r = resolvedInvestor(m);
  const org = legalName(m && m.organization_name);
  return (!org || org === r.name) ? '' : org;
}

function isApproved(m) {
  return !!(m && m.approved_at);
}

function scoreChip(v, m) {
  const t = scoreText(v);
  if (!t) return document.createTextNode('');
  const b = el('button', { class: 'linkish', title: 'Why this score',
    style: 'font:inherit;padding:0;text-decoration:underline dotted' }, t);

  b.addEventListener('click', () => {
    const box = el('div', { style: 'min-width:min(720px,80vw)' });

    box.appendChild(el('p', { style: 'margin:0 0 4px;font-size:15px' },
      m ? (m.investor_name || m.organization_name || 'This investor') : 'How the score works'));
    box.appendChild(el('p', { class: 'mono',
      style: 'color:var(--ink-3);font-size:12px;margin:0 0 18px' },
      t + '   \u00B7   ' + (m ? (BAND_LABEL[bandOf(m)] || bandOf(m).replace(/_/g, ' ')) : 'scoring bands')));

    if (m) {
      box.appendChild(el('p', { style: 'margin:0 0 18px;font-size:12.5px;color:var(--ink-3);line-height:1.55' },
        'Scored on the three signals below. Only the first is a hard requirement: an investor that does '
        + 'not buy hedge funds is rejected. Strategy decides the band; technology keeps it in review. '
        + 'Geography and openness to emerging managers are shown for context and never count against anyone.'));
    }

    if (m) {
      const head = (a, bb) => el('div', { style: 'display:grid;grid-template-columns:26px 1fr 1fr;'
        + 'gap:14px;padding:0 0 7px;border-bottom:1px solid var(--rule)' },
        el('span', null, ''),
        el('span', { class: 'mono', style: 'font-size:10px;letter-spacing:.14em;'
          + 'text-transform:uppercase;color:var(--ink-3)' }, a),
        el('span', { class: 'mono', style: 'font-size:10px;letter-spacing:.14em;'
          + 'text-transform:uppercase;color:var(--ink-3)' }, bb));
      box.appendChild(head('What Taranis needs', 'What this investor is'));

      for (const row of taranisScorecard(m)) {
        const [glyph, colour, label] = MARK[row.state];
        box.appendChild(el('div', { title: label,
          style: 'display:grid;grid-template-columns:26px 1fr 1fr;gap:14px;'
               + 'padding:11px 0;border-bottom:1px solid var(--rule-2);align-items:start' },
          el('span', { style: 'color:' + colour + ';font-weight:700;font-size:15px;line-height:1.3' }, glyph),
          el('span', { style: 'font-size:13.5px;line-height:1.45' }, row.wants),
          el('span', { style: 'font-size:13.5px;line-height:1.45;color:'
            + (row.state === 'unknown' ? 'var(--ink-3)' : 'inherit') },
            row.has || (row.state === 'unknown' ? 'Not stated in the alert' : '\u2014'))));
        if (row.note) {
          box.appendChild(el('p', { style: 'margin:-4px 0 0 40px;font-size:12.5px;color:' + colour }, row.note));
        }
      }
      for (const [k, v] of contextLines(m)) {
        box.appendChild(el('div', { title: 'Context only, not scored',
          style: 'display:grid;grid-template-columns:26px 1fr 1fr;gap:14px;'
               + 'padding:11px 0;border-bottom:1px solid var(--rule-2);align-items:start;color:var(--ink-3)' },
          el('span', { style: 'font-weight:700;font-size:15px;line-height:1.3' }, '\u00B7'),
          el('span', { style: 'font-size:13.5px;line-height:1.45' }, k + ' (context, not scored)'),
          el('span', { style: 'font-size:13.5px;line-height:1.45' }, v)));
      }

      box.appendChild(el('p', { style: 'margin:18px 0 0;font-size:12.5px;color:var(--ink-3);line-height:1.55' },
        'A dash means the alert never stated it, which is not the same as failing — '
        + 'those are the gaps worth filling before a decision.'));
    }

    box.appendChild(el('p', { class: 'mono', style: 'font-size:10px;letter-spacing:.14em;'
      + 'text-transform:uppercase;color:var(--ink-3);margin:22px 0 8px' }, 'What the number means'));
    for (const [k, d] of [
      ['Matched',       '0.75 and up. Long/short equity or quant stated.'],
      ['Review',        '0.30 to 0.74. Technology interest, strategy not stated. A person decides.'],
      ['Low',           'Below 0.30. CTA, macro or market-neutral only. The wrong fit, but kept, not turned away.'],
      ['Needs data',    'No score. A hedge-fund allocator whose strategy the alert never stated.'],
      ['Rejected',      'Not a hedge-fund allocator, or not an investor mandate at all. The only reject.']
    ]) {
      box.appendChild(el('div', { style: 'display:flex;gap:14px;margin:0 0 8px;font-size:13.5px' },
        el('span', { style: 'min-width:104px;color:var(--ink-3)' }, k),
        el('span', null, d)));
    }

    sheet('Why this score', [box],
      [el('button', { class: 'btn btn-sm btn-quiet', onclick: closeSheet }, 'Close')]);
  });
  return b;
}

function money(v) {
  if (v === null || v === undefined || v === '') return '';
  const n = Number(String(v).replace(/[^0-9.-]/g, ''));
  if (!isFinite(n) || n === 0) return String(v);
  const grouped = Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const short = n >= 1e9 ? (n / 1e9).toFixed(n % 1e9 ? 1 : 0) + 'bn'
              : n >= 1e6 ? (n / 1e6).toFixed(n % 1e6 ? 1 : 0) + 'm'
              : n >= 1e3 ? Math.round(n / 1e3) + 'k'
              : '';
  return 'USD ' + grouped + (short ? '   (' + short + ')' : '');
}

const ENTITIES = {
  nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: '\u2019',
  rsquo: '\u2019', lsquo: '\u2018', ldquo: '\u201C', rdquo: '\u201D',
  ndash: '\u2013', mdash: '\u2014', hellip: '\u2026', middot: '\u00B7',
  eacute: '\u00E9', egrave: '\u00E8', agrave: '\u00E0', ccedil: '\u00E7',
  euro: '\u20AC', pound: '\u00A3', deg: '\u00B0', trade: '\u2122', copy: '\u00A9'
};

function cleanText(s) {
  let t = String(s);

  t = t
    .replace(/\u00E2\u20AC\u2122/g, '\u2019')
    .replace(/\u00E2\u20AC\u009C/g, '\u201C')
    .replace(/\u00E2\u20AC\u009D/g, '\u201D')
    .replace(/\u00E2\u20AC\u201C/g, '\u2013')
    .replace(/\u00E2\u20AC\u201D/g, '\u2014')
    .replace(/\u00E2\u0080\u0099/g, '\u2019')
    .replace(/\u00C3\u00A9/g, '\u00E9')
    .replace(/\u00C2\u00A0/g, ' ');

  t = t.replace(/&([a-zA-Z]+);/g, (m, name) => {
    const k = name.toLowerCase();
    return Object.prototype.hasOwnProperty.call(ENTITIES, k) ? ENTITIES[k] : m;
  });
  t = t.replace(/&#(\d+);/g, (m, n) => {
    const c = Number(n);
    return (c > 0 && c < 1114112) ? String.fromCodePoint(c) : m;
  });
  t = t.replace(/&#x([0-9a-fA-F]+);/g, (m, n) => {
    const c = parseInt(n, 16);
    return (c > 0 && c < 1114112) ? String.fromCodePoint(c) : m;
  });

  t = t.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]{1,80}>/g, '');

  t = t.replace(/[ \t\u00A0]+/g, ' ').trim();

  if (!/\s/.test(t) && t.indexOf('_') > -1
      && !/@/.test(t) && !/^https?:/i.test(t) && !/\//.test(t)) {
    t = t.replace(/_/g, ' ');
  }

  return t;
}

function deMojibake(s) { return cleanText(s); }

function asText(v) {
  if (v === null || v === undefined || v === '') return '';
  if (Array.isArray(v)) {
    return v.map(x => cleanText((x && typeof x === 'object')
      ? (x.name || x.label || x.value || JSON.stringify(x))
      : String(x))).filter(Boolean).join(', ');
  }
  if (typeof v === 'object') {
    const parts = [];
    for (const k in v) if (v[k] !== null && v[k] !== '') {
      parts.push(cleanText(k) + ': ' + cleanText(v[k]));
    }
    return parts.join(', ');
  }
  return cleanText(v);
}

function lastSpoken(c, days) {
  const at = c && (c.last_contact_at || c.last_interaction || c.last);
  if (at) return fmtDate(at) + (days !== null && days !== undefined ? '   (' + days + ' days)' : '');
  const addr = c && (c.email || c.addr || c.contact_email);
  return String(addr || '').trim()
    ? 'no email on record'
    : 'no email address on file';
}

function lastSpokenRail(days) {
  return (days === null || days === undefined) ? '\u2014' : days + 'd';
}

function fmtDate(v) {
  if (!v) return '\u2014';
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

async function createMeeting(payload) {
  if (DEMO) return demoResponse('meeting.create', payload);
  if (!CFG.supabaseUrl) throw new Error('No Supabase configured.');
  if (!session || !session.token) throw new Error('Signed out. Sign in again.');
  await ensureToken();

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 60000);
  try {
    const res = await fetch(CFG.supabaseUrl + '/functions/v1/create-meeting', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: CFG.supabaseAnonKey,
        Authorization: 'Bearer ' + session.token
      },
      body: JSON.stringify(payload || {}),
      signal: ctrl.signal,
      mode: 'cors'
    });
    if (res.status === 401) { signOut(); throw new Error('Signed out. Sign in again.'); }
    const out = await res.json().catch(() => ({}));
    if (!res.ok && !out.message) throw new Error('The meeting service returned ' + res.status);
    return out;
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('The meeting service did not answer in time.');
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

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
    const raw = (await res.text()).trim();
    let data = null;
    try { data = raw ? JSON.parse(raw) : null; } catch (_) { data = null; }
    // The gateway answers a refusal or an unwired action with { error }, and a
    // send that could not go out comes back as { error } with status 200. Say
    // so, rather than reporting success.
    const said = data && !Array.isArray(data) && typeof data.error === 'string' ? data.error.trim() : '';
    if (!res.ok) throw new Error(said || ('Gateway returned ' + res.status));
    if (said) throw new Error(said);
    return data || { rows: [], items: [] };
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('That took too long. Try again.');
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/* ------------------------------------------------- read straight from Supabase */

async function supaWhy(res, what) {
  let e = {};
  try { e = await res.json(); } catch (_) { /* not JSON */ }
  const msg = String(e.message || e.error || '').trim();
  const hint = String(e.hint || e.details || '').trim();

  if (res.status === 401 || res.status === 403 || /row-level security/i.test(msg)) {
    return 'Not permitted ' + what + '. That table needs a policy for the console.'
      + (msg ? ' (' + msg + ')' : '');
  }
  if (/column .* does not exist|Could not find the .* column/i.test(msg)) {
    return 'A column the app sends does not exist on that table: ' + msg;
  }
  if (/null value in column/i.test(msg)) {
    return 'A required column was left empty and has no default: ' + msg;
  }
  if (/^Cannot approve |^A compliance decision must |^Compliance decisions cannot /.test(msg)) {
    return msg;
  }
  if (/invalid input syntax|violates .* constraint/i.test(msg)) {
    return 'The database rejected a value: ' + msg + (hint ? ' \u2014 ' + hint : '');
  }
  return 'Database returned ' + res.status + ' ' + what + (msg ? ': ' + msg : '')
       + (hint ? ' (' + hint + ')' : '');
}

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
  if (!res.ok) throw new Error(await supaWhy(res, 'reading ' + table));
  return await res.json();
}

async function supaDelete(table, filter) {
  if (!CFG.supabaseUrl || !session || !session.token) throw new Error('NO_SUPABASE');
  await ensureToken();
  const res = await fetch(CFG.supabaseUrl + '/rest/v1/' + table + '?' + filter, {
    method: 'DELETE',
    headers: {
      apikey: CFG.supabaseAnonKey,
      Authorization: 'Bearer ' + session.token,
      Prefer: 'return=minimal'
    }
  });
  if (!res.ok) throw new Error(await supaWhy(res, 'deleting from ' + table));
}

async function supaPatch(table, filter, patch) {
  if (!CFG.supabaseUrl || !session || !session.token) throw new Error('NO_SUPABASE');
  await ensureToken();
  const res = await fetch(CFG.supabaseUrl + '/rest/v1/' + table + '?' + filter, {
    method: 'PATCH',
    headers: {
      apikey: CFG.supabaseAnonKey,
      Authorization: 'Bearer ' + session.token,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal'
    },
    body: JSON.stringify(patch)
  });
  if (!res.ok) throw new Error(await supaWhy(res, 'updating ' + table));
}

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
  if (!res.ok) throw new Error(await supaWhy(res, 'saving to ' + table));
  const back = await res.json();
  return Array.isArray(back) ? back[0] : back;
}

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

async function deleteFromStorage(path) {
  await ensureToken();
  const res = await fetch(CFG.supabaseUrl + '/storage/v1/object/documents/' + encodeURI(path), {
    method: 'DELETE',
    headers: { apikey: CFG.supabaseAnonKey, Authorization: 'Bearer ' + session.token }
  });
  if (!res.ok) throw new Error('Storage refused the delete (' + res.status + ')');
}

async function uploadToStorage(file, path, onProgress, replace) {
  await ensureToken();
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', CFG.supabaseUrl + '/storage/v1/object/documents/' + encodeURI(path));
    xhr.setRequestHeader('apikey', CFG.supabaseAnonKey);
    xhr.setRequestHeader('Authorization', 'Bearer ' + session.token);
    xhr.setRequestHeader('x-upsert', replace ? 'true' : 'false');
    if (file.type) xhr.setRequestHeader('Content-Type', file.type);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve(path);
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
        if (/already exists|Duplicate/i.test(why)) {
          return reject(new Error('Something is already stored at ' + path
            + '. Give this one a version label, or tick "Replace what is there" to overwrite it.'));
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

const KEEP_KEY = 'taranis.keep';

function keepSignedIn() {
  try { return localStorage.getItem(KEEP_KEY) === '1'; } catch (_) { return false; }
}

function setKeepSignedIn(on) {
  try {
    if (on) { localStorage.setItem(KEEP_KEY, '1'); }
    else { localStorage.removeItem(KEEP_KEY); localStorage.removeItem(SESSION_KEY); }
  } catch (_) { /* private mode */ }
}

function saveSession(s) {
  session = s;
  const raw = JSON.stringify(s);
  try {
    sessionStorage.setItem(SESSION_KEY, raw);
    if (keepSignedIn()) localStorage.setItem(SESSION_KEY, raw);
  } catch (_) { /* private mode */ }
}

function loadSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
             || (keepSignedIn() ? localStorage.getItem(SESSION_KEY) : null);
    return raw ? JSON.parse(raw) : null;
  } catch (_) { return null; }
}

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

async function ensureToken() {
  if (DEMO || !session || !session.token) return;
  if (!session.expires || Date.now() < session.expires - 120000) return;
  if (!(await refreshSession())) {
    signOut();
    throw new Error('Your session expired. Sign in again.');
  }
}

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
  try { localStorage.removeItem(SESSION_KEY); localStorage.removeItem(KEEP_KEY); } catch (_) {}
  if (pollTimer) clearInterval(pollTimer);
  $('app').className = '';
  $('gate').style.display = 'grid';
}

/* The three signals the current mandate scores on (used by the score popup),
   in MATCH_CRITERIA / critStatus order. Geography and emerging managers follow
   as context rows. */
const TARANIS_CRITERIA = [
  { wants: 'Buys hedge funds \u2014 the only hard requirement',
    no: 'Not a hedge-fund allocator, so it is rejected',
    has: (m) => [jsonArr(m.asset_classes).join(', '), m.investor_type].filter(Boolean).join(' \u00B7 ') },
  { wants: 'Long/short equity or quant / systematic \u2014 the strongest fit',
    no: 'Another strategy is stated',
    has: (m) => jsonArr(m.strategies).join(', ').replace(/_/g, ' ') },
  { wants: 'Technology focus \u2014 a weaker positive that keeps it in review',
    no: null,
    has: () => '' }
];

function taranisScorecard(m) {
  const st = critStatus(m);
  return TARANIS_CRITERIA.map((c, i) => ({
    wants: c.wants,
    has:   String(c.has(m) || '').trim() || (st[i] === 'yes' ? 'Yes' : ''),
    state: st[i] === 'yes' ? 'met' : st[i] === 'no' ? 'failed' : 'unknown',
    note:  st[i] === 'no' ? c.no : null
  }));
}

const MARK = {
  met:     ['\u2713', 'var(--good)',   'Meets it'],
  soft:    ['\u2713', 'var(--signal)', 'Plausible, not proven'],
  failed:  ['\u2715', 'var(--bad)',    'Does not meet it'],
  unknown: ['\u2013', 'var(--ink-3)',  'The alert never said']
};

/* ------------------------------------------------------------------ tabs */

const TABS = [
  { id: 'today', archived: true, icon: '\u25CF', label: 'Today',        title: 'Today',
    sub: 'What arrived while you were away, and what is waiting on you.' },
  { id: 'opps',     icon: '\u25B8', label: 'Opportunities', title: 'Opportunities', group: 'wi',
    sub: 'The live pipeline. Filter by read and by approved rather than moving between queues.' },
  { id: 'approvals',icon: '\u2192', label: 'Approved',      title: 'Approved Opportunities', group: 'wi', sub2: true,
    sub: 'The ones a person has approved. A subset of Opportunities, not a separate list.' },
  { id: 'rejected', icon: '\u25BD', label: 'Rejected',      title: 'Rejected', group: 'wi',
    sub: 'Screened out on two or more criteria. Kept so you can see what was turned away, and why.' },
  { id: 'hfn',      icon: '\u25A4', label: 'HFA & FOC',     title: 'Hedge Fund Alert & Family Office Confidential', group: 'wi',
    sub: 'Filed by publication, each with a summary written beside it so you need not open the PDF.' },
  { id: 'contacts', archived: true, icon: '\u25A0', label: 'Contacts',     title: 'Contacts',
    sub: 'The fundraising book. Who knows Taranis, when you last emailed, and what is owed.' },
  { id: 'notes', archived: true,    icon: '\u25A5', label: 'Notes',        title: 'Notes',
    sub: 'What was said, where, and with whom. Linked to the contact book when the person is in it.' },
  { id: 'email', archived: true,    icon: '\u2709', label: 'Email',        title: 'Email',
    sub: 'Draft to a contact, read it back, then send. Nothing leaves without you approving it.' },
  { id: 'inbox', archived: true,    icon: '\u25A4', label: 'Follow up',      title: 'Follow up',
    sub: 'Who is owed a reply and who has gone quiet, clients first. Every message is still here if you need it.' },
  { id: 'meetings', icon: '\u25D0', label: 'Meetings',      title: 'Meetings',
    sub: 'Book on Zoom, Teams or Google Meet. The link comes back on the row as soon as it is issued.' },
  { id: 'docs',     icon: '\u25AC', label: 'Documents',    title: 'Documents',
    sub: 'Upload a deck or report, and it is versioned, stored and announced to the team.' },
  { id: 'reports',  icon: '\u25F0', label: 'Weekly report',      title: 'Weekly report',
    sub: 'The Friday dashboard, read from the stored snapshot rather than a Telegram attachment.' },
  { id: 'network',  icon: '\u25CB', label: 'Network',      title: 'LinkedIn network',
    sub: 'Every LinkedIn profile that arrived on an opportunity, and whether anyone here can reach them.' },
  { id: 'find',     icon: '\u2317', label: 'Find an investor', foot: true,
    title: 'Find an investor',
    sub: 'Every screened mandate, narrowed by date, investor type, geography, asset class, strategy, ticket or outcome.' },
  { id: 'ask',      icon: '\u25C7', label: 'Ask',          title: 'Ask',
    sub: 'Anything you used to type into the bot. It queries before it answers.' },
  { id: 'tools',    icon: '\u25A3', label: 'Tools & CPs',  title: 'Tools & counterparties', foot: true,
    sub: 'Every tool, vendor and counterparty Taranis uses, and where each one stands.' }
];

let current = 'opps';

function buildNav() {
  const list = $('navlist');
  clear(list);
  const GROUPS = { wi: 'With Intelligence' };
  let openGroup = null;
  for (const t of TABS) {
    if (t.archived) continue;
    if (t.group && t.group !== openGroup) {
      list.appendChild(el('p', { class: 'mono',
        style: 'font-size:9.5px;letter-spacing:.16em;text-transform:uppercase;'
             + 'color:var(--ink-3);margin:20px 0 6px;padding-left:12px' },
        GROUPS[t.group]));
      openGroup = t.group;
    } else if (!t.group) {
      openGroup = null;
    }
    const b = el('button', {
      class: 'navbtn', type: 'button', 'data-tab': t.id,
      onclick: () => go(t.id)
    }, el('span', { class: 'ic' }, t.icon), el('span', null, t.label));
    if (t.group) b.style.paddingLeft = t.sub2 ? '42px' : '26px';
    if (t.foot) b.style.marginTop = '18px';
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
  if (!t || !RENDER[id]) return go('opps');
  document.querySelectorAll('.navbtn').forEach(b =>
    b.setAttribute('aria-current', b.getAttribute('data-tab') === id ? 'page' : 'false'));
  $('pg-title').textContent = t.title;
  $('pg-sub').textContent = t.sub;
  stagePane((body) => RENDER[id](body));
}

/* Views never pass through an empty pane. A view renders into a hidden pane
   beside the visible one; every fill()/load() started inside it counts as
   pending, and when the last one has drawn, the new pane replaces the old in a
   single step. Until then the old content stays on screen, dimmed under a thin
   progress bar once the wait is noticeable (STAGE_SLOW_MS). A view that never
   settles is shown anyway after STAGE_MAX_MS, with whatever it has drawn. */
let STAGE = null;
const STAGE_SLOW_MS = 150, STAGE_MAX_MS = 10000;

function stagePane(build) {
  const old = $('pg-body');
  if (STAGE && !STAGE.done) STAGE.abandon();    // a newer view replaces one still loading
  if (!old.childNodes.length) busy(old);           // first view after sign-in: say so, never blank
  const next = el('div', { class: old.className, style: 'display:none' });
  old.parentNode.insertBefore(next, old.nextSibling);
  const st = { root: next, pending: 0, done: false };
  const slow = setTimeout(() => { if (!st.done) old.classList.add('is-busy'); }, STAGE_SLOW_MS);
  const cap = setTimeout(() => st.swap(), STAGE_MAX_MS);
  const stop = () => { st.done = true; clearTimeout(slow); clearTimeout(cap); if (STAGE === st) STAGE = null; };
  st.swap = () => {
    if (st.done) return;
    stop();
    old.removeAttribute('id');
    next.id = 'pg-body';
    next.style.display = '';
    old.remove();
  };
  st.abandon = () => { stop(); next.remove(); };
  STAGE = st;
  st.pending++;
  let ret;
  try { ret = build(next); }
  catch (e) { settleStage(st); throw e; }
  if (ret && typeof ret.then === 'function') ret.then(() => settleStage(st), () => settleStage(st));
  else settleStage(st);
  return ret;
}

// The stage a node is being built in, if it is still waiting to be shown.
function stageOf(node) {
  return STAGE && !STAGE.done && STAGE.root.contains(node) ? STAGE : null;
}
function settleStage(st) {
  if (--st.pending > 0) return;
  // A draw can start another fetch; give it a tick to register before showing.
  Promise.resolve().then(() => { if (st.pending === 0) st.swap(); });
}

// Reloading a list in place: keep what is on screen, dimmed, until fill()
// replaces it. An empty container says Loading instead.
function busy(node) {
  if (node.childNodes.length) { node.classList.add('is-busy'); return; }
  node.appendChild(el('p', { class: 'mono', style: 'color:var(--ink-3);font-size:12px' }, 'Loading\u2026'));
}

const RFSH_CSS = `
.rfsh{float:right;display:inline-flex;align-items:center;gap:7px;font-family:inherit;font-size:12.5px;
  color:var(--ink-2);background:var(--card);border:1px solid var(--rule);border-radius:8px;
  padding:7px 12px;cursor:pointer;margin:2px 0 0 12px}
.rfsh:hover{border-color:var(--accent);color:var(--accent)}
.rfsh:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.rfsh[disabled]{opacity:.6;cursor:default}
.rfsh .ic{font-size:15px;line-height:1;display:inline-block}
.rfsh.spin .ic{animation:rfspin .65s linear}
@keyframes rfspin{to{transform:rotate(360deg)}}
@media (max-width:640px){.rfsh .lb{display:none}.rfsh{padding:8px}}
`;

function mountRefresh() {
  if ($('rfsh')) return;
  const title = $('pg-title');
  if (!title) return;
  const head = title.parentElement || title;
  if (!$('rfsh-css')) document.head.appendChild(el('style', { id: 'rfsh-css' }, RFSH_CSS));
  const btn = el('button', { id: 'rfsh', class: 'rfsh', type: 'button',
    title: 'Refresh this view', 'aria-label': 'Refresh this view', onclick: doRefresh },
    el('span', { class: 'ic' }, '\u21BB'), el('span', { class: 'lb' }, 'Refresh'));
  head.insertBefore(btn, head.firstChild);
}

async function doRefresh() {
  const btn = $('rfsh');
  if (btn) { btn.classList.add('spin'); btn.setAttribute('disabled', ''); }
  try { if (!DEMO) await poll(); } catch (_) { /* counts are best-effort */ }
  try { if (RENDER[current]) go(current); } catch (_) { /* leave the view as it is */ }
  setTimeout(() => { const b = $('rfsh'); if (b) { b.classList.remove('spin'); b.removeAttribute('disabled'); } }, 650);
}

/* ------------------------------------------------------- entry component */
/* ---------- Match card (ported from the WI analysis page) ---------- */

/* EDIT 3 — criteria constants redefined to the new mandate. */
// The three scored criteria. Geography and openness to emerging managers are
// context (contextLines): shown on every card, never a fail, never counted.
const MATCH_CRITERIA = ['Buys hedge funds', 'Long/short or quant', 'Technology focus'];

const GEO_NAMES = { GB: 'United Kingdom', UK: 'United Kingdom', CH: 'Switzerland', US: 'United States' };
function geoText(m) {
  const city = String(m.investor_city || '').trim();
  const c = String(m.investor_country || '').trim();
  if (city && c) return city + ', ' + c;
  if (c) return GEO_NAMES[c.toUpperCase()] || c;
  return city || 'not stated';
}
function emergingText(m) {
  return m.open_to_emerging_managers === true ? 'Yes'
       : m.open_to_emerging_managers === false ? 'No' : 'not stated';
}
function contextLines(m) {
  return [['Geography', geoText(m)], ['Emerging managers', emergingText(m)]];
}

// The text a mandate's fit is actually described in (same fields the SQL/WI 01 read).
// The rule scores the investor's own fields only. A report row's evidence also
// keeps the PDF passage it was read from and the report's title; both stay
// stored for people to read, but the passage runs on into other firms' stories
// and a title such as "Hedge Funds in Hot Water" is about nobody, so neither is
// scored. Same rule as WI 01 and HFN 02. WI's profile summary (wi_summary) is
// background on the firm, not this mandate, so it is shown but never scored.
const EVIDENCE_NOT_SCORED = ['passage', 'from_report', 'page', 'wi_summary'];
// "does not state hedge fund appetite" is silence, not a hedge-fund signal.
const RE_NO_APPETITE = /(does not state|doesn't state|no) hedge.fund appetite( stated)?|hedge.fund appetite (is )?not stated/g;
function evidenceText(ev) {
  let x = ev;
  for (let i = 0; i < 2 && typeof x === 'string'; i++) {
    try { x = JSON.parse(x); } catch (_) { return String(ev); }
  }
  if (!x || typeof x !== 'object' || Array.isArray(x)) return JSON.stringify(x || {});
  const own = {};
  for (const k of Object.keys(x)) if (EVIDENCE_NOT_SCORED.indexOf(k) < 0) own[k] = x[k];
  return JSON.stringify(own);
}
function sigText(m) {
  return [m.intention_summary, m.requirements_raw, m.appetite_raw, evidenceText(m.evidence),
    JSON.stringify(jsonArr(m.strategies)), JSON.stringify(jsonArr(m.asset_classes)),
    m.investor_type].join(' ').toLowerCase().replace(RE_NO_APPETITE, ' ');
}
const RE_HEDGE = /hedge|alternative|absolute return|liquid alt/;
const RE_STRONG = /long short|long\/short|long-short|l\/s|equity hedge|equity long|quant|systematic/;
// "systematic" alone is not long/short or quant: "systematic trend following"
// is a CTA. It only counts when the text has no CTA, macro or market-neutral
// wording. A strong word inside a refusal ("avoiding any systematic or quant
// strategies") is dropped before matching. Same rule as WI 01.
const RE_STRONG_CORE = /long short|long\/short|long-short|l\/s|equity hedge|equity long|quant/;
const RE_NEGATED = /(avoid[a-z]*|exclud[a-z]*|without|\bnot\b|\bno\b)\s[^.;,]{0,40}(systematic|quant[a-z]*|long.?short|l\/s)/g;
// Technology as whole words, so biotech, techniques and technician do not
// count. Before matching, the text loses any clause that turns tech away
// ("avoid funds overly exposed to software and technology", "low on
// software/tech", "excluding ... fintech") and plan or company names
// ("Information Technology Industry", "Virginia Tech Foundation"). Plain
// "technologies" is nearly always a firm's name (Raytheon Technologies,
// Mcube Investment Technologies), so it only counts as "emerging/innovative/...
// technologies". Same rule as WI 01 and the gateway's technology topic.
const RE_TECH = /\b(?:tech|technology|software|semiconductors?|tmt|internet|saas|fintech)\b/;
const RE_TECH_OFF = /\b(?:avoid[a-z]*|exclud[a-z]*|low on|away from|otherwise be)\b[^.;]*/g;
const RE_TECH_NAME = /\b(?:information )?technology industry\b|\b[a-z]+ tech (?:foundation|university)\b/g;
const RE_TECH_PLURAL = /\b(?:emerging|innovative|new|disruptive|digital|climate|clean|financial|advanced) technologies\b/g;
function isTech(t) {
  return RE_TECH.test(String(t).replace(/_/g, ' ').replace(RE_TECH_OFF, ' ')
    .replace(RE_TECH_NAME, ' ').replace(RE_TECH_PLURAL, ' technology '));
}

// Strategy tags as words: "equity_long_short" -> "equity long short", so
// RE_STRONG can read them. A long/short or quant tag only counts when the
// mandate lists 3 strategies or fewer; on a long menu (a pension's whole
// hedge-fund book) one tag among many says little. Same rule as WI 01.
function stratWords(m) {
  return jsonArr(m.strategies).map(s => String(s).toLowerCase().replace(/_/g, ' '));
}
function isStrong(m, t) {
  const u = t.replace(RE_NEGATED, ' ');
  const sysOk = !RE_EXCL.test(t);
  if (RE_STRONG_CORE.test(u) || (sysOk && /systematic/.test(u))) return true;
  const w = stratWords(m);
  return w.length > 0 && w.length <= 3
    && w.some(s => RE_STRONG_CORE.test(s) || (sysOk && /systematic/.test(s)));
}

// A manager's own news is not an allocator's mandate: anything typed as a hedge
// fund, anything WI files under Shutter or Manager information, and People items
// with no investor type unless they speak of placing money. People items about
// an allocator stay (a pension hiring a hedge-fund head is a lead). Same as WI 01.
function isManagerNews(m, t) {
  const tag = String(m.investor_tag || '').trim().toLowerCase();
  const typ = String(m.investor_type || '').trim().toLowerCase();
  if (typ === 'hedge fund' || tag === 'shutter' || tag === 'manager information') return true;
  return tag === 'people' && !typ
    && !/third.party|allocat|commit|search|seed/.test(t.replace(RE_NEGATED, ' '));
}

/* EDIT 4 — critOf computes the four new signals. */
function critOf(m) {
  const t = sigText(m);
  const assets = jsonArr(m.asset_classes).map(s => String(s).toLowerCase());
  return [
    assets.some(a => RE_HEDGE.test(a)) || RE_HEDGE.test(t),  // buys hedge funds
    isStrong(m, t),                                          // long/short or quant
    isTech(t)                                                // technology
  ];
}

/* EDIT 5 — critStatus: yes / no / unknown for the same four. */
function critStatus(m) {
  const t = sigText(m);
  const assets = jsonArr(m.asset_classes);
  const strats = jsonArr(m.strategies);
  const cc = String(m.investor_country || '').trim().toUpperCase().slice(0, 2);
  return [
    assets.length ? (assets.some(a => RE_HEDGE.test(String(a).toLowerCase())) ? 'yes' : 'no')
                  : (RE_HEDGE.test(t) ? 'yes' : 'unknown'),
    isStrong(m, t) ? 'yes' : (strats.length ? 'no' : 'unknown'),
    isTech(t)         ? 'yes' : 'unknown'
  ];
}

// What each reason is about, so the console's own verdict and the reason WI 01
// stored for the same criterion list once. Hedge funds collapses to one line;
// for the others the first wording wins. Geography and emerging managers are
// context now, so an older stored reason about either is not shown as a fail.
const FAIL_GROUPS = [
  { key: 'hedge',    re: /does not buy hedge funds|excludes hedge funds/i, label: 'Does not buy hedge funds' },
  { key: 'strategy', re: /no long\/short or quant|no eligible strategy/i },
  { key: 'tech',     re: /no technology focus/i },
  { key: 'ticket',   re: /ticket below|maximum ticket below/i },
  { key: 'geo',      re: /outside gb\/ch\/us|investor outside/i, drop: true },
  { key: 'emerging', re: /emerging managers/i, drop: true }
];
function rejectFails(m) {
  const out = [], seen = {}, groups = {};
  const add = (s) => {
    s = String(s == null ? '' : s).trim();
    if (!s) return;
    const g = FAIL_GROUPS.find(x => x.re.test(s));
    if (g) {
      if (g.drop || groups[g.key]) return;
      groups[g.key] = true;
      if (g.label) s = g.label;
    }
    const k = s.toLowerCase().replace(/\s+/g, ' ');
    if (!seen[k]) { seen[k] = true; out.push(s); }
  };
  const st = critStatus(m);
  const noLabel = ['Does not buy hedge funds', 'No long/short or quant', 'No technology focus'];
  for (let i = 0; i < st.length; i++) if (st[i] === 'no' && noLabel[i]) add(noLabel[i]);
  const tmax = Number(m.ticket_max_usd || m.ticket_min_usd || 0);
  if (tmax > 0 && tmax < 500000) add('Ticket below USD 500k floor');
  let w = m.hard_fail_reasons;
  for (let i = 0; i < 2 && typeof w === 'string'; i++) { try { w = JSON.parse(w); } catch (_) { w = []; } }
  if (Array.isArray(w)) for (const r of w) add(r);
  return out;
}

const NOT_MANDATE_RE = /launch|new manager|market trend|service provider|people move|performance|fundrais|regulat|top story|top insight|managers insight/i;
function wiReasonsOf(m) {
  let r = m.hard_fail_reasons;
  if (typeof r === 'string') { try { r = JSON.parse(r); } catch (_) { r = []; } }
  if (!Array.isArray(r) || !r.length) r = m.fit_reason ? [m.fit_reason] : [];
  return r.map(String);
}
function isNotMandate(m) {
  return /not an investor mandate/i.test(wiReasonsOf(m).join(' '))
    || NOT_MANDATE_RE.test(String(m.investor_tag || ''));
}

function isSwiss(m) {
  return String(m.investor_country || '').trim().toUpperCase().slice(0, 2) === 'CH';
}

/* EDIT 6 — trust the DB verdict for rejection when present. */
function effectivelyRejected(m) {
  const nq = String((m && m.new_qualification) || '').toLowerCase();
  if (nq) return nq === 'rejected';
  if (String(m.qualification || '').trim().toLowerCase() !== 'rejected') return false;
  if (isSwiss(m) && !isNotMandate(m)) return false;   // Switzerland exception
  return isNotMandate(m) || rejectFails(m).length > 0;
}
/* EDIT 7 — no browser-side reclaim when the DB has an authoritative verdict. */
function reclaimedOpportunity(m) {
  if (m && m.new_qualification) return false;
  if (String(m.qualification || '').trim().toLowerCase() !== 'rejected') return false;
  if (isNotMandate(m)) return false;
  return isSwiss(m) || rejectFails(m).length === 0;
}

/* EDIT 1 — score from the DB re-score when present. */
function matchScore(m) {
  if (m && m.new_qualification) {
    const n = Number(m.new_fit_score);
    return isFinite(n) ? n : 0;
  }
  const crit = critOf(m);
  if (!crit.length) return 0;
  return crit.filter(Boolean).length / crit.length;
}

/* EDIT 2 — band from the DB verdict when present. */
function scoreBand(m) {
  const nq = String((m && m.new_qualification) || '').toLowerCase();
  if (nq === 'rejected') return 'rejected';
  if (nq === 'matched')  return 'matched';
  if (nq) return 'review';
  if (String(m.qualification || '').toLowerCase() === 'rejected') return 'rejected';
  return matchScore(m) >= 0.75 ? 'matched' : 'review';
}

/* The re-score rule in the browser — the same rule WI 01 (Apply Taranis Hard
   Criteria + Build Mandate SQL) applies, on the same 0..1 scale as the backfill. */
const RE_EXCL = /\bcta\b|managed future|trend follow|global macro|macro strategy|macro fund|macro manager|discretionary macro|systematic macro|market neutral|market-neutral/;
const RE_NOT_ALLOCATOR = /private equity|venture capital|service provider|placement agent|law firm|real estate|infrastructure|data provider/;
const IN_MARKET = new Set(['GB', 'UK', 'GBR', 'CH', 'CHE', 'US', 'USA', 'UNITEDSTATES', 'UNITEDKINGDOM', 'ENGLAND', 'SCOTLAND', 'SWITZERLAND']);
const BAND_SCORE = { strong_tech: 1, strong: 0.90, tech: 0.60, hire: 0.60, low: 0.20 };
const BAND_QUAL  = { strong_tech: 'matched', strong: 'matched', tech: 'uncertain', hire: 'uncertain', low: 'low', needs_data: 'needs_data' };

function rescore(m) {
  const t = sigText(m);
  const assets = jsonArr(m.asset_classes).map(s => String(s).toLowerCase());
  // Judged on WI's own tag, as WI 01 does: hard_fail_reasons can still carry an
  // older rule's wording, so they are not evidence here.
  if (NOT_MANDATE_RE.test(String(m.investor_tag || '')) || KNOWN_MANAGERS.test(String(m.investor_name || ''))
      || RE_NOT_ALLOCATOR.test(String(m.investor_type || '').toLowerCase())
      || isManagerNews(m, t)
      || (assets.length && !RE_HEDGE.test(assets.join(' ')) && !RE_HEDGE.test(t))) {
    return { band: 'rejected', q: 'rejected', s: 0 };
  }
  const strong = isStrong(m, t), tech = isTech(t);
  let band = strong ? (tech ? 'strong_tech' : 'strong') : tech ? 'tech' : RE_EXCL.test(t) ? 'low' : 'needs_data';
  // An allocator's hire is worth a look, never an automatic match.
  if (band.indexOf('strong') === 0 && /^people$/i.test(String(m.investor_tag || '').trim())) band = 'hire';
  let s = band in BAND_SCORE ? BAND_SCORE[band] : null;
  const cc = String(m.investor_country || '').toUpperCase().replace(/[^A-Z]/g, '');
  if (s !== null && s < 1 && IN_MARKET.has(cc) && m.open_to_emerging_managers !== false) s += 0.05;
  return { band: band, q: BAND_QUAL[band], s: s === null ? null : Math.round(s * 100) / 100 };
}

// The coarse qualification the workflow routes on, from the fine-grained band.
function legacyQual(nq) {
  return nq === 'matched' || nq === 'rejected' ? nq : 'uncertain';
}

// new_qualification / new_fit_score for a human decision to move m to `to`.
function verdictPatch(m, to) {
  if (to === 'rejected') return { new_qualification: 'rejected', new_fit_score: 0 };
  const r = rescore(m);
  if (to === 'matched') {
    const cur = m.new_fit_score === null || m.new_fit_score === undefined || m.new_fit_score === ''
      ? NaN : Number(m.new_fit_score);
    return { new_qualification: 'matched', new_fit_score: isFinite(cur) ? cur : r.s };
  }
  // Any other choice is "a person should look": keep the signal's review band,
  // and keep the score under the matched line so the two never disagree.
  const nq = (r.q === 'low' || r.q === 'needs_data') ? r.q : 'uncertain';
  return { new_qualification: nq, new_fit_score: r.s === null ? null : Math.min(r.s, 0.74) };
}

// Display label + tone for the fine-grained verdict.
const BAND_LABEL = { matched: 'matched', uncertain: 'review', low: 'low fit', needs_data: 'needs data', rejected: 'rejected' };
function bandOf(m) {
  return String((m && m.new_qualification) || (m && m.qualification) || 'uncertain').trim().toLowerCase();
}
function bandTone(b) {
  return b === 'matched' ? 'good' : b === 'rejected' ? 'bad' : 'signal';
}

function ensureMatchCss() {
  if (document.getElementById('taranis-matchcard-css')) return;
  const s = document.createElement('style');
  s.id = 'taranis-matchcard-css';
  s.textContent =
    ".matchgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px}"
  + ".mcard{background:var(--card);border:1px solid var(--rule);border-radius:12px;padding:18px 20px;display:flex;flex-direction:column;box-shadow:0 1px 2px rgba(16,35,58,.04),0 6px 16px rgba(16,35,58,.05)}"
  + ".mcard.good{box-shadow:inset 3px 0 0 var(--good),0 1px 2px rgba(16,35,58,.04)}"
  + ".mcard.signal{box-shadow:inset 3px 0 0 var(--signal),0 1px 2px rgba(16,35,58,.04)}"
  + ".mcard.bad{box-shadow:inset 3px 0 0 var(--bad),0 1px 2px rgba(16,35,58,.04)}"
  + ".mcard-h{font-family:var(--font-display);font-size:16px;font-weight:400;color:var(--ink);margin:0 0 3px;line-height:1.28}"
  + ".mcard-sub{font-size:11.5px;color:var(--ink-3);margin-bottom:14px;letter-spacing:.03em;text-transform:uppercase}"
  + ".mcard-score{display:flex;justify-content:space-between;align-items:baseline;font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--ink-3);margin-bottom:8px}"
  + ".mcard-score b{font-family:var(--font-display);font-size:15px;color:var(--ink-2)}"
  + ".mcard-seg{display:flex;gap:4px;margin-bottom:15px}"
  + ".mcard-seg .seg{height:8px;flex:1;border-radius:3px;background:var(--rule-2,#E9EFF3)}"
  + ".mcard-seg .seg.on{background:linear-gradient(90deg,#00A8D0,#00A8C8)}"
  + ".mcard-seg .seg.miss{background:var(--bad)}"
  + ".mcard-crit{display:flex;flex-direction:column;gap:8px}"
  + ".mcard-c{display:flex;align-items:center;gap:9px;font-size:13px;color:var(--ink-2)}"
  + ".mcard-c .mk{width:16px;height:16px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;flex:none}"
  + ".mcard-c .mk.yes{background:rgba(30,158,99,.14);color:var(--good)}"
  + ".mcard-c .mk.no{background:rgba(198,64,43,.12);color:var(--bad)}"
  + ".mcard-c .mk.unk{background:rgba(90,110,130,.14);color:var(--ink-3)}"
  + ".mcard-unk{margin-left:auto;font-size:9.5px;letter-spacing:.09em;text-transform:uppercase;color:var(--ink-3);background:var(--rule-2,#E9EFF3);padding:1px 7px;border-radius:10px;flex:none}"
  + ".mcard .acts{display:flex;gap:8px;flex-wrap:wrap}"
  + ".mcard-reason{margin-top:13px;padding:10px 12px;border-radius:8px;font-size:12.5px;line-height:1.45;background:rgba(198,64,43,.07);border:1px solid rgba(198,64,43,.18)}"
  + ".mcard-reason.signal{background:rgba(200,144,0,.08);border-color:rgba(200,144,0,.25)}"
  + ".mcard-reason-k{display:block;font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--ink-3);margin-bottom:3px}"
  + ".mcard-reason-v{color:var(--ink-2)}"
  + ".mcard-ints{margin-top:13px;border-top:1px solid var(--rule);padding-top:11px}"
  + ".mcard-ints-h{font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--ink-3);margin-bottom:8px}"
  + ".mcard-int{display:block;font-size:12.5px;color:var(--ink-2);padding:7px 0 7px 11px;border-left:2px solid var(--rule-2,#E9EFF3)}"
  + ".mcard-int.mcard-int-matched{border-left-color:var(--good)}.mcard-int.mcard-int-rejected{border-left-color:var(--bad)}.mcard-int.mcard-int-uncertain{border-left-color:var(--signal)}"
  + ".mcard-int-top{display:flex;justify-content:space-between;gap:10px;margin-bottom:2px}"
  + ".mcard-int-d{font-size:10.5px;letter-spacing:.03em;text-transform:uppercase;color:var(--ink-3)}"
  + ".mcard-int-t{font-variant-numeric:tabular-nums;color:var(--ink-3);font-size:11.5px;white-space:nowrap}"
  + ".mcard-int-s{display:block;line-height:1.5;overflow-wrap:break-word;word-break:normal}";
  document.head.appendChild(s);
}

// Plain context lines under the scored criteria: no mark, never red.
function contextRows(host, m) {
  for (const [k, v] of contextLines(m)) {
    host.appendChild(el('div', { class: 'mcard-c', style: 'color:var(--ink-3)' },
      el('span', { style: 'width:16px;flex:none;text-align:center' }, '\u00B7'),
      el('span', null, k + ' \u2014 ' + v)));
  }
}

function matchCard(m, opts) {
  opts = opts || {};
  ensureMatchCss();
  const crit  = critOf(m);
  const score = crit.filter(Boolean).length;
  const q     = bandOf(m);
  const rej0  = opts.reject ? true : effectivelyRejected(m);
  const tone  = opts.tone || (rej0 ? 'bad' : bandTone(q));

  const card = el('div', { class: 'mcard ' + tone });
  card.appendChild(el('h4', { class: 'mcard-h' }, investorLabel(m)));
  card.appendChild(el('div', { class: 'mcard-sub' },
    [m.investor_country, m.aum_band].filter(Boolean).join('  \u00B7  ') || '\u00A0'));

  const rejected = rej0;
  if (rejected) {
    let fails = (Array.isArray(opts.reject) && opts.reject.length) ? opts.reject : rejectFails(m);
    if (!fails.length) fails = [isNotMandate(m) ? 'Not an investor mandate' : 'Rejected'];
    const n = fails.length;
    card.appendChild(el('div', { class: 'mcard-score' },
      el('span', { style: 'color:var(--bad)' }, 'REJECTED'),
      el('b', { style: 'color:var(--bad);font-family:var(--font-body);font-weight:600;font-size:12.5px;letter-spacing:.01em;text-transform:none' },
        isNotMandate(m) ? 'not an investor mandate'
          : n + (n === 1 ? ' criterion contradicts Taranis' : ' criteria contradict Taranis'))));
    const seg = el('div', { class: 'mcard-seg' });
    for (let i = 0; i < n; i++) seg.appendChild(el('div', { class: 'seg miss' }));
    card.appendChild(seg);
    const cr = el('div', { class: 'mcard-crit' });
    fails.forEach((name) => cr.appendChild(el('div', { class: 'mcard-c' },
      el('span', { class: 'mk no' }, '\u2717'), el('span', null, name))));
    contextRows(cr, m);
    card.appendChild(cr);
  } else {
    const qLabel = (q === 'rejected') ? 'RECLAIMED' : (BAND_LABEL[q] || q.replace(/_/g, ' ')).toUpperCase();
    card.appendChild(el('div', { class: 'mcard-score' },
      el('span', null, qLabel), el('b', null, score + '/' + crit.length)));

    const seg = el('div', { class: 'mcard-seg' });
    for (let i = 0; i < crit.length; i++) seg.appendChild(el('div', { class: 'seg' + (i < score ? ' on' : '') }));
    card.appendChild(seg);

    const stat = critStatus(m);
    const cr = el('div', { class: 'mcard-crit' });
    MATCH_CRITERIA.forEach((name, i) => {
      const st   = crit[i] ? 'yes' : (stat[i] === 'unknown' ? 'unknown' : 'no');
      const mark = st === 'yes' ? '\u2713' : st === 'unknown' ? '?' : '\u2717';
      const cls  = st === 'yes' ? 'yes' : st === 'unknown' ? 'unk' : 'no';
      const row  = el('div', { class: 'mcard-c' },
        el('span', { class: 'mk ' + cls }, mark), el('span', null, name));
      if (st === 'unknown') row.appendChild(el('span', { class: 'mcard-unk' }, 'unknown'));
      cr.appendChild(row);
    });
    contextRows(cr, m);
    card.appendChild(cr);
  }

  if (opts.reasonLine) {
    const rl = el('div', { class: 'mcard-reason ' + (opts.reasonTone || 'bad') });
    if (opts.reasonLabel) rl.appendChild(el('span', { class: 'mcard-reason-k' }, opts.reasonLabel));
    rl.appendChild(el('span', { class: 'mcard-reason-v' }, opts.reasonLine));
    card.appendChild(rl);
  }

  const acts = (opts.actions || []).filter(Boolean);
  const rawInts = (m && m._intentions) || [];
  if (Array.isArray(rawInts) && rawInts.length > 1) {
    const seen = {}, ints = [];
    for (const it of rawInts) {
      const sum = String(it.intention_summary || it.fit_reason || '').replace(/\s+/g, ' ').trim();
      const key = sum.toLowerCase() + '|' + String(it.ticket_min_usd || '');
      if (seen[key]) continue;
      seen[key] = 1;
      ints.push({ it: it, sum: sum });
    }
    if (ints.length > 1) {
      const box = el('div', { class: 'mcard-ints' });
      box.appendChild(el('div', { class: 'mcard-ints-h' }, 'Intentions (' + ints.length + ')'));
      for (const row of ints.slice(0, 10)) {
        const it = row.it;
        let sum = row.sum;
        if (sum.length > 130) sum = sum.slice(0, 128) + '\u2026';
        const dt = el('span', { class: 'mcard-int-d' }, it.alert_date ? fmtDate(it.alert_date) : '');
        const tk = el('span', { class: 'mcard-int-t' }, (it.ticket_min_usd && Number(it.ticket_min_usd) > 0) ? money(it.ticket_min_usd) : '');
        const line = el('div', { class: 'mcard-int mcard-int-' + String(it.qualification || 'uncertain'),
          style: 'cursor:pointer', title: 'Open this intention' },
          el('div', { class: 'mcard-int-top' }, dt, tk),
          el('div', { class: 'mcard-int-s' }, sum || '(no summary)'));
        line.addEventListener('click', (ev) => { ev.stopPropagation(); openMandate(it); });
        box.appendChild(line);
      }
      card.appendChild(box);
    }
  }
  if (opts.controls) {
    const list = Array.isArray(opts.controls) ? opts.controls : [opts.controls];
    for (const c of list) if (c) {
      const wrap = el('div', { style: 'margin-top:14px' }, c);
      card.appendChild(wrap);
    }
  }

  if (acts.length) {
    const row = el('div', { class: 'acts', style: 'margin-top:14px' });
    for (const a of acts) {
      row.appendChild(el('button', { class: 'btn btn-sm ' + (a.primary ? '' : 'btn-quiet'), onclick: a.run }, a.label));
    }
    card.appendChild(row);
  }
  return card;
}

const QUALIFICATIONS = [
  ['matched',   'Matched'],
  ['uncertain', 'Waiting for decision'],
  ['rejected',  'Rejected']
];

function qualificationControl(m, after) {
  const cur = String(m.qualification || 'uncertain').toLowerCase();
  const sel = el('select', { class: 'search', style: 'flex:none;min-width:150px' });
  let known = false;
  for (const [v, label] of QUALIFICATIONS) {
    const o = el('option', { value: v }, label);
    if (v === cur) { o.selected = true; known = true; }
    sel.appendChild(o);
  }
  if (!known && cur) {
    const o = el('option', { value: cur }, cur.replace(/_/g, ' '));
    o.selected = true;
    sel.insertBefore(o, sel.firstChild);
  }
  sel.appendChild(el('option', { value: '__custom' }, 'Custom\u2026'));

  sel.addEventListener('change', async () => {
    let to = sel.value;
    if (to === '__custom') {
      to = String(prompt('New qualification label') || '').trim().toLowerCase().replace(/\s+/g, '_');
      if (!to) { sel.value = cur; return; }
    }
    if (to === cur) return;
    sel.disabled = true;
    try {
      const patch = Object.assign({ qualification: to }, verdictPatch(m, to));
      if (to === 'rejected') { patch.approved_at = null; patch.approved_by = null; }
      await supaPatch('wi_mandates', 'id=eq.' + encodeURIComponent(m.id), patch);
      Object.assign(m, patch);
      toast('Qualification set to ' + to.replace(/_/g, ' ') + '.');
      if (typeof after === 'function') after(to);
    } catch (e) {
      toast(e.message, true);
      sel.value = cur;
      sel.disabled = false;
    }
  });

  return el('label', { class: 'field', style: 'margin-bottom:0' },
    el('span', null, 'Qualification'), sel);
}

function routeAfterQualification(m, to) {
  if (String(to).toLowerCase() === 'rejected') return go('rejected');
  oppsMode = scoreBand(m) === 'matched' ? 'matched' : 'review';
  go('opps');
}

function ensureTodayCss() {
  if (document.getElementById('taranis-droplist-css')) return;
  const s = document.createElement('style');
  s.id = 'taranis-droplist-css';
  s.textContent =
    ".droplist{display:flex;flex-direction:column;gap:8px}"
  + ".drop{border:1px solid var(--rule);border-radius:11px;background:var(--card);overflow:hidden;box-shadow:0 1px 2px rgba(16,35,58,.04)}"
  + ".drop:hover{border-color:#CFE6EF;box-shadow:0 2px 4px rgba(16,35,58,.05),0 10px 22px -12px rgba(0,120,160,.5)}"
  + ".drop.open{border-color:#CFE6EF;box-shadow:0 2px 4px rgba(16,35,58,.05),0 12px 26px -14px rgba(0,120,160,.55)}"
  + ".drop.read{opacity:.6}"
  + ".drop-h{width:100%;display:flex;align-items:center;gap:12px;padding:14px 16px;background:none;border:0;cursor:pointer;text-align:left;font:inherit}"
  + ".drop-dot{width:8px;height:8px;border-radius:50%;flex:none;background:var(--ink-3)}"
  + ".drop-dot.good{background:var(--good)}.drop-dot.signal{background:var(--signal)}.drop-dot.accent{background:var(--sky,#00A8D0)}"
  + ".drop-t{display:flex;flex-direction:column;min-width:0;flex:1}"
  + ".drop-name{font-family:var(--font-display);font-size:15px;font-weight:400;color:var(--ink);line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}"
  + ".drop-co{font-size:12px;color:var(--ink-3);margin-top:2px;letter-spacing:.02em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}"
  + ".drop-when{font-size:11px;letter-spacing:.04em;text-transform:uppercase;color:var(--ink-3);flex:none}"
  + ".drop-chev{flex:none;color:var(--ink-3);font-size:19px;line-height:1;transform:rotate(90deg)}"
  + ".drop.open .drop-chev{transform:rotate(270deg);color:var(--sky,#00A8D0)}"
  + ".drop-p{max-height:0;overflow:hidden;padding:0 18px 0 36px}"
  + ".drop.open .drop-p{max-height:640px;padding:2px 18px 16px 36px}"
  + ".drop-p .ev{font-size:13px}.drop-p .ev>div{margin:5px 0}.drop-p .ev .k{color:var(--ink-3);margin-right:8px}";
  document.head.appendChild(s);
}

function investorKey(m) {
  return String(resolvedInvestor(m).name || '').toLowerCase().replace(/[.,]/g, '').replace(/\s+/g, ' ').trim();
}

function dedupeInvestors(rows) {
  if (!Array.isArray(rows)) return rows;
  const rank = (m) => [m && m.wi_enriched_at ? 1 : 0, Number(m && m.fit_score) || 0, Number(m && m.id) || 0];
  const better = (a, b) => { const ra = rank(a), rb = rank(b); for (let i = 0; i < 3; i++) { if (ra[i] !== rb[i]) return ra[i] > rb[i]; } return false; };
  const groups = new Map(), unnamed = [];
  for (const m of rows) {
    const key = investorKey(m);
    if (!key) { unnamed.push(m); continue; }
    let g = groups.get(key);
    if (!g) { g = []; groups.set(key, g); }
    g.push(m);
  }
  const out = [];
  for (const g of groups.values()) {
    let best = g[0];
    for (const m of g) if (better(m, best)) best = m;
    if (g.length > 1) {
      const sorted = g.slice().sort((a, b) => {
        const da = String(a.alert_date || a.created_at || ''), db = String(b.alert_date || b.created_at || '');
        if (da !== db) return db < da ? -1 : 1;
        return (Number(b.id) || 0) - (Number(a.id) || 0);
      });
      best = Object.assign({}, best, { _intentions: sorted });
    }
    out.push(best);
  }
  const res = unnamed.concat(out);
  res.sort((a, b) => (Number(b && b.id) || 0) - (Number(a && a.id) || 0));
  return res;
}

// One sort for every mandate list (Opportunities, Rejected, Approved, Find),
// applied to the rows already filtered for display. Each tab remembers its own
// choice in this browser; nothing is written to the database.
const LIST_SORTS = [
  ['best',   'Best match first'],
  ['latest', 'Latest first'],
  ['ticket', 'Biggest ticket first'],
  ['unread', 'Unread first']
];
const SORT_KEY = 'taranis.listSort';
let listSort = {};
try { listSort = JSON.parse(localStorage.getItem(SORT_KEY) || '{}') || {}; } catch (_) { listSort = {}; }
const sortModeOf = (tab) => LIST_SORTS.some(([k]) => k === listSort[tab]) ? listSort[tab] : 'best';
function setSortMode(tab, mode) {
  listSort[tab] = mode;
  try { localStorage.setItem(SORT_KEY, JSON.stringify(listSort)); } catch (_) {}
}

const numOrNull = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return isFinite(n) ? n : null;
};
const sortFit = (m) => { const a = numOrNull(m && m.new_fit_score); return a !== null ? a : numOrNull(m && m.fit_score); };
const sortTicket = (m) => {
  const hi = numOrNull(m && m.ticket_max_usd);
  if (hi !== null && hi > 0) return hi;
  const lo = numOrNull(m && m.ticket_min_usd);
  return lo !== null && lo > 0 ? lo : null;
};
const sortDate = (m) => (m && m.alert_date) ? String(m.alert_date) : null;
const descNullsLast = (a, b) => a === b ? 0 : a === null ? 1 : b === null ? -1 : (a > b ? -1 : 1);

function sortMandates(rows, mode) {
  const byId = (x, y) => (Number(y && y.id) || 0) - (Number(x && x.id) || 0);
  const best = (x, y) => descNullsLast(sortFit(x), sortFit(y)) || byId(x, y);
  const cmp = mode === 'latest' ? (x, y) => descNullsLast(sortDate(x), sortDate(y)) || byId(x, y)
            : mode === 'ticket' ? (x, y) => descNullsLast(sortTicket(x), sortTicket(y)) || best(x, y)
            : mode === 'unread' ? (x, y) => ((x && x.seen_at) ? 1 : 0) - ((y && y.seen_at) ? 1 : 0) || best(x, y)
            : best;
  return (rows || []).slice().sort(cmp);
}

// The Sort dropdown, styled like the other toolbar selects. scope says what the
// sort covers, so a capped list is not read as "across everything".
function sortControl(tab, onChange, scope) {
  const s = el('select', { class: 'search', style: 'flex:0 1 220px;min-width:180px', 'aria-label': 'Sort' });
  for (const [k, l] of LIST_SORTS) s.appendChild(el('option', { value: k }, l));
  s.value = sortModeOf(tab);
  s.addEventListener('change', () => { setSortMode(tab, s.value); onChange(s.value); });
  return el('div', { class: 'toolbar', style: 'margin-bottom:12px' },
    el('span', { class: 'mono', style: 'font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--ink-3)' }, 'Sort'),
    s,
    scope ? el('span', { class: 'mono', style: 'font-size:11.5px;color:var(--ink-3)' }, scope) : null);
}

function entry(o) {
  const rail = el('div', { class: 'entry-rail' },
    o.tone ? el('span', { class: 'dot ' + o.tone }) : null,
    (o.rail && !/^#\d+$/.test(String(o.rail)))
      ? el('span', { class: 'rail-n', title: String(o.rail), style: 'opacity:.32' }, o.rail)
      : null);

  const ev = el('div', { class: 'ev' });
  for (const [k, v] of (o.evidence || [])) {
    if (v === null || v === undefined || v === '') continue;
    const hot = /last email|email|starts|on\s/.test(k);
    const key = String(k).trim();
    let node;
    if (/^score$/i.test(key)) {
      node = scoreChip(v, o.record);
    } else if (typeof v === 'number' || (/^-?\d+(\.\d+)?$/.test(String(v)) && !/url|id$/i.test(key))) {
      node = document.createTextNode(num(v));
    } else if (hot) {
      node = el('span', { class: 'gold' }, String(v));
    } else {
      node = document.createTextNode(String(v));
    }
    ev.appendChild(el('div', null, el('span', { class: 'k' }, k + '  '), node));
  }

  const call = o.callout
    ? el('div', { class: 'callout ' + (o.calloutTone || '') },
        o.calloutLabel ? el('span', { class: 'callout-k' }, o.calloutLabel) : null,
        el('span', { class: 'callout-v' }, o.callout))
    : null;

  const main = el('div', { class: 'entry-main' },
    el('p', { class: 'entry-act' }, o.action),
    o.who ? el('p', { class: 'entry-who' }, o.who) : null,
    call,
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
  return el('div', { class: 'entry' + (o.tone ? ' ' + o.tone : '') }, rail, main);
}

function askAbout(q, mode) {
  PENDING.q = q;
  PENDING.qmode = mode || 'local';
  go('ask');
}

function empty(headline, note) {
  return el('div', { class: 'empty' },
    el('div', { class: 'big' }, headline),
    el('p', null, note || ''));
}

// Both loaders leave whatever is on screen until the data is in, then clear
// and draw in one go; inside a staged view they hold the swap until drawn.
async function fill(body, get, draw) {
  const st = stageOf(body);
  if (st) st.pending++;
  try {
    const rows = await get();
    clear(body); body.classList.remove('is-busy');
    draw(rows);
  } catch (e) {
    clear(body); body.classList.remove('is-busy');
    body.appendChild(el('div', { class: 'banner' }, el('b', null, 'Could not load. '), e.message));
  } finally {
    if (st) settleStage(st);
  }
}

async function load(body, action, payload, draw) {
  const st = stageOf(body);
  if (st) st.pending++;
  try {
    const data = await callGateway(action, payload);
    clear(body); body.classList.remove('is-busy');
    draw(data);
  } catch (e) {
    clear(body); body.classList.remove('is-busy');
    body.appendChild(el('div', { class: 'banner' },
      el('b', null, 'Could not load. '), e.message));
  } finally {
    if (st) settleStage(st);
  }
}

/* --------------------------------------------------------------- renders */

const RENDER = {};

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
      el('div', { style: 'font-size:11.5px;letter-spacing:.02em;color:var(--ink-3)' }, lbl),
      el('div', { style: 'font-size:26px;font-weight:600;letter-spacing:.01em;' + (cls || '') }, String(n)));

    const box = el('div', { style: 'border:1px solid var(--rule);border-radius:10px;padding:16px 18px;margin-bottom:22px;background:var(--card)' },
      el('p', {
        style: 'font-size:12px;letter-spacing:.02em;color:var(--ink-3);margin:0 0 14px' },
        'Screening \u2014 last 7 days'),
      el('div', { style: 'display:flex;gap:26px;flex-wrap:wrap;margin-bottom:' + (top.length ? '14px' : '0') },
        num(rows.length, 'Screened'),
        num(by.matched, 'Matched', 'color:var(--good)'),
        num(by.uncertain, 'To review', 'color:var(--signal)'),
        num(by.rejected, 'Rejected', 'color:var(--bad)')));

    if (top.length) {
      box.appendChild(el('p', {
        style: 'font-size:12px;letter-spacing:.02em;color:var(--ink-3);margin:0 0 8px' },
        'Why they were rejected'));
      const list = el('div', { class: 'ev' });
      for (const k of top) {
        list.appendChild(el('div', null,
          el('span', { class: 'k' }, String(why[k]).padStart(3, ' ') + '  '), k));
      }
      box.appendChild(list);
      box.appendChild(el('div', { class: 'acts' },
        el('button', { class: 'btn btn-sm btn-quiet', onclick: () => go('opps') }, 'See the mandates'),
        by.uncertain ? el('button', { class: 'btn btn-sm', onclick: () => {
          oppsView = 'pending'; go('opps');
        } }, by.uncertain + ' waiting on you') : null));
    }
    host.insertBefore(box, host.firstChild);
  } catch (_) { /* the feed still shows without it */ }
}

function notificationMandateId(n) {
  if (n && n.mandate_id) return String(n.mandate_id);
  const m = String((n && n.review_id) || '').match(/^wi-(\d+)-/);
  return m ? m[1] : null;
}

async function openMandateById(id, fallbackTab) {
  try {
    const rows = await supaSelect('wi_mandates',
      'select=*&limit=1&id=eq.' + encodeURIComponent(id));
    if (rows && rows[0]) return openMandate(rows[0]);
    toast('That opportunity is no longer in the table.', true);
  } catch (e) {
    toast(e.message, true);
  }
  if (fallbackTab) go(fallbackTab);
}

RENDER.today = function (body) {
  clear(body);
  const strip = el('div');
  body.appendChild(strip);
  wiStrip(strip);

  const feed = el('div');
  body.appendChild(feed);
  body = feed;

  fill(body, async () => {
    const cutoff = new Date(Date.now() - 7 * 86400000).toISOString();
    const mands = await readRows('wi_mandates',
      'select=*&qualification=neq.rejected&created_at=gte.' + cutoff
      + '&order=id.desc&limit=150', 'today.mandates', {});
    return { mands: mands };
  }, (d) => {
    const seen = (m) => !!m.seen_at;
    const grouped = dedupeInvestors(d.mands || []);
    counts.today = grouped.filter(m => !seen(m)).length;
    paintCounts();

    const VIEWS = [['new', 'New'], ['read', 'Cleared']];
    if (['new', 'read'].indexOf(todayView) === -1) todayView = 'new';
    const chips = el('div', { class: 'chips', style: 'margin-bottom:14px' });
    for (const [k, lbl] of VIEWS) {
      const on = todayView === k;
      const n = grouped.filter(m => (k === 'read' ? seen(m) : !seen(m))).length;
      const c = el('button', { class: 'chip', onclick: () => { todayView = k; go('today'); } }, lbl + '  ' + n);
      c.style.borderColor = on ? 'var(--accent)' : '';
      c.style.color = on ? 'var(--accent)' : '';
      c.style.fontWeight = on ? '600' : '';
      chips.appendChild(c);
    }
    body.appendChild(chips);

    const rows = grouped.filter(m => (todayView === 'read' ? seen(m) : !seen(m)));
    if (!rows.length) {
      return body.appendChild(todayView === 'read'
        ? empty('Nothing cleared yet', 'Investors you mark as read collect here.')
        : empty('You are up to date', 'New investors worth a decision land here.'));
    }
    const grid = el('div', { class: 'matchgrid' });
    body.appendChild(grid);
    for (const m of rows) {
      const tone = m.qualification === 'matched' ? 'good' : m.qualification === 'uncertain' ? 'signal' : 'bad';
      grid.appendChild(matchCard(m, {
        tone: tone,
        actions: [
          { label: 'View the mandate', primary: true, run: () => { markSeen(m); openMandate(m); } },
          { label: 'Fill a gap', run: () => fillSheet(m) },
          seen(m) ? null : { label: 'Mark as read', run: async () => {
              try { await markSeen(m); go('today'); } catch (e) { toast(e.message, true); } } }
        ].filter(Boolean)
      }));
    }
  });
};

RENDER.intake = function (body) {
  clear(body);

  let data = null;
  let view = intakeView;

  const VIEWS = [
    ['all',        'Everything',   'accent'],
    ['matched',    'Accepted',     'good'],
    ['uncertain',  'Needs review', 'signal'],
    ['rejected',   'Rejected',     'bad'],
    ['incomplete', 'To complete',  'signal'],
    ['unread',     'Nothing read', 'bad']
  ];

  const chips = el('div', { class: 'chips' });
  const btns  = {};
  const list  = el('div', { style: 'margin-top:14px' });
  body.append(chips, list);

  const verdict = (m) => String(m.qualification || '').toLowerCase();
  const shown   = (m) => view === 'all' || verdict(m) === view;

  const jarr = (v) => {
    let x = v;
    for (let n = 0; n < 2 && typeof x === 'string'; n++) { try { x = JSON.parse(x); } catch (_) { x = []; } }
    return Array.isArray(x) ? x.map(s => String(s).trim()).filter(Boolean) : [];
  };

  const gapsOf = (m) => {
    const blank = (v) => v === null || v === undefined || String(v).trim() === '';
    const g = [];
    if (blank(m.investor_country))   g.push('investor_country');
    if (blank(m.investor_type))      g.push('investor_type');
    if (blank(m.contact_name))       g.push('contact_name');
    if (blank(m.ticket_min_usd))     g.push('ticket_min_usd');
    if (blank(m.aum_usd) && blank(m.aum_band)) g.push('aum_usd');
    if (blank(m.linkedin_url))       g.push('linkedin_url');
    if (blank(m.allocation_timing))  g.push('allocation_timing');
    if (!jarr(m.strategies).length)  g.push('strategies');
    return g;
  };

  for (const v of VIEWS) {
    btns[v[0]] = el('button', { class: 'chip',
      onclick: () => { view = v[0]; intakeView = view; paintChips(); paint(); } }, v[1]);
    chips.appendChild(btns[v[0]]);
  }

  function paintChips() {
    for (const [key, label, tone] of VIEWS) {
      const b = btns[key];
      const on = key === view;
      b.style.borderColor = on ? 'var(--' + tone + ')' : '';
      b.style.color       = on ? 'var(--' + tone + ')' : '';
      b.style.fontWeight  = on ? '600' : '';
      if (data) {
        let n = 0;
        if (key === 'incomplete') {
          n = (data.incomplete || []).length;
        } else if (key === 'unread') {
          n = data.emails.filter(e => !e.items.length).length;
        } else {
          for (const e of data.emails) {
            n += (key === 'all') ? e.items.length
                                 : e.items.filter(m => verdict(m) === key).length;
          }
        }
        b.textContent = label + '  ' + n;
        b.style.opacity = n ? '' : '.45';
      } else {
        b.textContent = label;
      }
    }
  }

  function paintIncomplete() {
    const rows = data.incomplete || [];
    list.appendChild(el('p', { class: 'mono',
      style: 'color:var(--ink-3);font-size:12px;margin:0 0 14px' },
      'Already sent to the team, but with fields the alert never stated. '
      + 'Best fit score first. This is the one view that looks past today.'));

    if (!rows.length) {
      return list.appendChild(empty('Nothing to complete',
        'Every mandate published in the last month has what it needs.'));
    }

    for (const m of rows) {
      const g = gapsOf(m);
      list.appendChild(entry({
        tone: 'signal',
        rail: '#' + m.id,
        action: investorLabel(m),
        who: [orgLabel(m), m.investor_country, m.investor_city].filter(Boolean).join('  \u00B7  '),
        callout: g.join(', ').replace(/_/g, ' '),
        calloutLabel: g.length === 1 ? 'One field missing' : g.length + ' fields missing',
        calloutTone: 'signal',
        record: m,
        evidence: [
          ['score     ', m.fit_score],
          ['published ', m.published_at ? fmtDate(m.published_at) : null],
          ['ticket    ', money(m.ticket_min_usd)],
          ['strategy  ', asText(m.strategies)],
          ['WI filed as', asText(m.investor_tag)]
        ],
        tags: [['published', 'good'], [g.length + (g.length === 1 ? ' gap' : ' gaps'), 'signal']],
        actions: [
          { label: 'Fill the gaps', primary: true, run: () => fillSheet(m) },
          { label: 'View the mandate', run: () => openMandate(m) }
        ]
      }));
    }
  }

  function paint() {
    clear(list);
    if (view === 'incomplete') return paintIncomplete();

    const emails = (data && data.emails) || [];
    if (!emails.length) {
      return list.appendChild(empty('Nothing in yet today',
        'Alerts appear here as soon as WI 01 finishes reading them.'));
    }

    if (view === 'unread') {
      list.appendChild(el('div', { class: 'banner' },
        el('b', null, 'Stored, but nothing could be read out. '),
        'The splitter found no "Asset class:" line, which usually means the '
        + 'forward arrived without its HTML. The alert is safe in wi_raw_emails, '
        + 'so re-sending it as HTML and replaying is enough to recover it.'));
    }

    let drawn = 0, shownEmails = 0;
    for (const e of emails) {
      const keep   = e.items.filter(shown);
      const silent = !e.items.length;

      if (view === 'unread') { if (!silent) continue; }
      else if (view !== 'all' && !keep.length) continue;

      const forwarded = /megarbane/i.test(String(e.from_addr || ''));
      const count = (view === 'all' || silent)
        ? (e.items.length + (e.items.length === 1 ? ' item' : ' items'))
        : (keep.length + ' of ' + e.items.length + ' items');

      shownEmails++;

      if (view !== 'all' && view !== 'unread') {
        list.appendChild(el('p', { class: 'mono',
          style: 'font-size:10px;letter-spacing:.12em;text-transform:uppercase;'
               + 'color:var(--ink-3);margin:24px 0 9px' },
          (cleanText(e.subject) || 'No subject') + '  \u00B7  ' + count));
      } else {
      list.appendChild(el('div', { class: 'entry' + (silent ? ' bad' : '') },
        el('div', { class: 'entry-rail' },
          el('span', { class: 'dot ' + (silent ? 'bad' : 'good') })),
        el('div', { class: 'entry-main' },
          el('p', { class: 'entry-act' }, cleanText(e.subject) || 'No subject'),
          el('p', { class: 'entry-who' },
            (forwarded ? 'Forwarded by ' + cleanText(e.from_addr)
                       : 'Sent direct by With Intelligence')
            + '  \u00B7  ' + fmtDate(e.received_at)),
          silent
            ? el('div', { class: 'callout bad' },
                el('span', { class: 'callout-k' }, 'Nothing read out of this'),
                el('span', { class: 'callout-v' },
                  'The message was stored but no item was found in it. Usually the '
                  + 'forward arrived without its HTML, so there was no "Asset class:" '
                  + 'line to split on.'))
            : el('div', { class: 'ev' },
                el('div', null,
                  el('span', { class: 'k' }, 'read out  '),
                  document.createTextNode(count)))
        )));
      }

      for (const m of keep) {
        drawn++;
        const q = verdict(m);
        const tone = q === 'matched' ? 'good' : q === 'uncertain' ? 'signal' : 'bad';
        list.appendChild(entry({
          tone,
          rail: '#' + m.id,
          action: m.investor_name || m.organization_name || ('Item #' + m.id),
          who: asText(m.intention_summary),
          record: m,
          evidence: [
            ['WI filed as', asText(m.investor_tag)],
            ['country    ', asText(m.investor_country)],
            ['type       ', asText(m.investor_type)],
            ['strategy   ', asText(m.strategies)],
            ['ticket     ', money(m.ticket_min_usd)],
            ['score      ', m.fit_score]
          ],
          tags: [[q, tone]],
          actions: [
            { label: 'Open it', primary: true,
              run: () => go(q === 'rejected' ? 'rejected' : 'opps') }
          ]
        }));
      }
    }

    if (view !== 'all' && !drawn && !shownEmails) {
      list.appendChild(empty(
        view === 'unread' ? 'Everything was read' : 'Nothing under that filter',
        view === 'unread'
          ? 'Every alert that arrived today was split into items successfully.'
          : 'Today\'s post carried no items with that verdict.'));
    }
  }

  paintChips();
  list.appendChild(el('p', { class: 'mono',
    style: 'color:var(--ink-3);font-size:12px' }, 'Loading…'));

  fill(list, async () => {
    if (DEMO) return { demo: true, emails: [], incomplete: [] };

    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const monthBack = new Date(Date.now() - 30 * 864e5).toISOString();

    const [emails, published] = await Promise.all([
      supaSelect('wi_raw_emails',
        'select=id,from_addr,subject,received_at'
        + '&received_at=gte.' + encodeURIComponent(dayStart.toISOString())
        + '&order=received_at.desc&limit=50'),
      supaSelect('wi_mandates',
        'select=*&published_at=not.is.null'
        + '&created_at=gte.' + encodeURIComponent(monthBack)
        + '&order=new_fit_score.desc.nullslast,fit_score.desc.nullslast&limit=200')
    ]);

    const incomplete = published.filter(m => gapsOf(m).length > 0);

    if (!emails.length) return { emails: [], incomplete: incomplete };

    const ids = emails.map(e => e.id).filter(v => v !== null && v !== undefined);
    const mandates = ids.length ? await supaSelect('wi_mandates',
      'select=id,raw_email_id,investor_name,organization_name,qualification,fit_score,'
      + 'investor_country,investor_type,investor_tag,strategies,ticket_min_usd,intention_summary'
      + '&raw_email_id=in.(' + ids.join(',') + ')'
      + '&order=id.asc&limit=300') : [];

    const byEmail = new Map();
    for (const m of mandates) {
      const key = String(m.raw_email_id);
      if (!byEmail.has(key)) byEmail.set(key, []);
      byEmail.get(key).push(m);
    }

    return {
      emails: emails.map(e =>
        Object.assign({}, e, { items: byEmail.get(String(e.id)) || [] })),
      incomplete: incomplete
    };
  }, (d) => {
    if (d.demo) {
      return list.appendChild(empty('Not in the sample',
        'Intake reads the real mailbox. Sign in to see it.'));
    }
    data = d;
    counts.intake = (d.emails || []).filter(e => !e.items.length).length;
    paintCounts();
    paintChips();
    paint();
  });
};

RENDER.approvals = function (body) {
  fill(body, async () => {
    const rows = await readRows('wi_mandates',
      'select=id,investor_name,organization_name,investor_country,investor_type,'
      + 'ticket_min_usd,ticket_max_usd,alert_date,fit_score,fit_reason,approved_at,approved_by,seen_at,qualification,new_qualification,new_fit_score,'
      + 'intention_summary,requirements_raw,appetite_raw,evidence,strategies,asset_classes,investor_city,open_to_emerging_managers'
      + '&approved_at=not.is.null'
      + '&qualification=neq.rejected'
      + '&order=approved_at.desc.nullslast&limit=200',
      'wi.reviews.pending', {});
    return { rows: rows.map(r => Object.assign({}, r, {
      review_id: String(r.id),
      contact_name: r.investor_name,
      company: r.organization_name
    })) };
  }, (d) => {
    const rows = dedupeInvestors(d.rows || []);
    counts.approvals = 0;
    paintCounts();
    if (!rows.length) {
      return body.appendChild(empty('Nothing approved yet',
        'Approve an opportunity and it appears here. This is a view of Opportunities, not a queue of its own.'));
    }
    const grid = el('div', { class: 'matchgrid' });
    body.append(sortControl('approvals', () => paintApproved(),
      'Sorts the ' + rows.length + ' loaded \u2014 the 200 most recently approved, not the whole table'), grid);
    paintApproved();
    function paintApproved() {
      clear(grid);
      for (const r of sortMandates(rows, sortModeOf('approvals'))) {
        grid.appendChild(matchCard(r, {
          tone: 'good',
          rail: r.review_id,
          action: investorLabel(r),
          who: orgLabel(r) || '',
          record: r,
          evidence: [
            ['country  ', asText(r.investor_country)],
            ['type     ', asText(r.investor_type)],
            ['ticket   ', money(r.ticket_min_usd)],
            ['score    ', r.fit_score],
            ['approved ', r.approved_at ? fmtDate(r.approved_at) : null],
            ['by       ', r.approved_by],
            ['reason   ', asText(r.fit_reason)]
          ],
          tags: [['approved', 'good']],
          actions: [
            { label: 'View the mandate', primary: true, run: () => openMandate(r) },
            { label: 'Fill the gaps', run: () => fillSheet(r) },
            { label: 'Withdraw approval',
              run: () => setApproved(r, false, () => go('approvals')) },
            { label: 'Reject',
              run: () => setQualification(r, 'rejected', 'Moved to Rejected.', () => go('rejected')) }
          ]
        }));
      }
    }
  });
};

const tcMissing = (r) => jsonArr(r.missing_requirements);

const tcDue = (r) => {
  if (!r.next_review_date) return false;
  const d = new Date(r.next_review_date + 'T23:59:59');
  return !isNaN(d.getTime()) && d <= new Date();
};

function tcRow(label, node) {
  return el('label', { class: 'field' }, el('span', null, label), node);
}

function tcSelect(options, value) {
  const s = el('select', { class: 'search' });
  for (const [v, lbl] of options) {
    const o = el('option', { value: v }, lbl);
    if (v === value) o.selected = true;
    s.appendChild(o);
  }
  return s;
}

function tcReqEditor(r) {
  const host = el('div');
  let docs   = jsonArr(r && r.required_documents);
  let got    = jsonArr(r && r.documents_received);
  let checks = jsonArr(r && r.compliance_checks);

  const heading = (t, note) => el('div', { style: 'margin:22px 0 8px' },
    el('p', { class: 'mono', style: 'font-size:10px;letter-spacing:.14em;'
      + 'text-transform:uppercase;color:var(--ink-3);margin:0' }, t),
    note ? el('p', { style: 'font-size:12.5px;color:var(--ink-3);margin:4px 0 0' }, note) : null);

  const docList = el('div');
  const chkList = el('div');

  function drawDocs() {
    clear(docList);
    if (!docs.length) {
      docList.appendChild(el('p', { style: 'font-size:13px;color:var(--ink-3);margin:0 0 6px' },
        'No documents required yet.'));
    }
    docs.forEach((d, i) => {
      const has = got.some(g => g.key === d.key);
      const tick = el('input', { type: 'checkbox' });
      tick.checked = has;
      tick.addEventListener('change', () => {
        if (tick.checked) {
          if (!got.some(g => g.key === d.key)) {
            got.push({ key: d.key, received_at: new Date().toISOString(),
                       by: (session && session.email) || null });
          }
        } else {
          got = got.filter(g => g.key !== d.key);
        }
        drawDocs();
      });
      const mand = el('input', { type: 'checkbox' });
      mand.checked = d.mandatory !== false;
      mand.addEventListener('change', () => { docs[i].mandatory = mand.checked; drawDocs(); });

      docList.appendChild(el('div', { style: 'display:flex;gap:10px;align-items:center;'
        + 'padding:7px 0;border-bottom:1px solid var(--rule-2)' },
        tick,
        el('span', { style: 'flex:1;font-size:13.5px'
          + (has ? '' : ';color:var(--ink-2)') }, d.label || d.key),
        el('span', { class: 'mono', style: 'font-size:11px;color:var(--ink-3);'
          + 'display:flex;gap:5px;align-items:center' }, mand, 'required'),
        el('button', { class: 'linkish', style: 'color:var(--bad)',
          onclick: () => { docs.splice(i, 1); got = got.filter(g => g.key !== d.key); drawDocs(); } }, 'remove')));
    });
    const nd = el('input', { class: 'search', placeholder: 'Add a required document\u2026' });
    nd.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      const label = nd.value.trim();
      if (!label) return;
      const key = label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
      if (!docs.some(d => d.key === key)) docs.push({ key: key, label: label, mandatory: true });
      nd.value = '';
      drawDocs();
    });
    docList.appendChild(el('div', { style: 'margin-top:9px' }, nd));
  }

  function drawChecks() {
    clear(chkList);
    if (!checks.length) {
      chkList.appendChild(el('p', { style: 'font-size:13px;color:var(--ink-3);margin:0 0 6px' },
        'No checks defined yet.'));
    }
    checks.forEach((c, i) => {
      const sel = tcSelect([['pending', 'Pending'], ['passed', 'Passed'], ['failed', 'Failed']],
        c.status || 'pending');
      sel.style.maxWidth = '130px';
      sel.addEventListener('change', () => {
        checks[i].status = sel.value;
        checks[i].checked_at = new Date().toISOString();
        checks[i].by = (session && session.email) || null;
        drawChecks();
      });
      const mand = el('input', { type: 'checkbox' });
      mand.checked = c.mandatory !== false;
      mand.addEventListener('change', () => { checks[i].mandatory = mand.checked; });

      chkList.appendChild(el('div', { style: 'display:flex;gap:10px;align-items:center;'
        + 'padding:7px 0;border-bottom:1px solid var(--rule-2)' },
        el('span', { style: 'flex:1;font-size:13.5px' }, c.label || c.key),
        sel,
        el('span', { class: 'mono', style: 'font-size:11px;color:var(--ink-3);'
          + 'display:flex;gap:5px;align-items:center' }, mand, 'required'),
        el('button', { class: 'linkish', style: 'color:var(--bad)',
          onclick: () => { checks.splice(i, 1); drawChecks(); } }, 'remove')));
    });
    const nc = el('input', { class: 'search', placeholder: 'Add a compliance check\u2026' });
    nc.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      const label = nc.value.trim();
      if (!label) return;
      const key = label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
      if (!checks.some(c => c.key === key)) {
        checks.push({ key: key, label: label, mandatory: true, status: 'pending' });
      }
      nc.value = '';
      drawChecks();
    });
    chkList.appendChild(el('div', { style: 'margin-top:9px' }, nc));
  }

  host.append(
    heading('Required documents', 'Tick one when it arrives. Untick "required" for anything optional.'),
    docList,
    heading('Compliance checks', 'A check counts as done only at Passed. Pending and Failed both block approval.'),
    chkList);

  drawDocs();
  drawChecks();

  return { node: host,
           read: () => ({ required_documents: docs, documents_received: got, compliance_checks: checks }) };
}

function toolSheet(r) {
  const isNew = !r;
  r = r || {};

  const name  = el('input', { class: 'search', value: r.name || '' });
  const type  = tcSelect([['tool', 'Tool'], ['counterparty', 'Counterparty']], r.entity_type || 'tool');
  const prov  = el('input', { class: 'search', value: r.provider || '' });
  const purp  = el('input', { class: 'search', value: r.purpose || '' });
  const owner = el('input', { class: 'search', value: r.owner || (session && session.email) || '' });
  const risk  = tcSelect([['low', 'Low'], ['medium', 'Medium'], ['high', 'High']], r.risk_level || 'medium');
  const stat  = tcSelect(TC_SETTABLE.map(k => [k, TC_STATUS[k][0]]),
                         TC_SETTABLE.indexOf(r.compliance_status) >= 0 ? r.compliance_status : 'not_reviewed');
  const rev   = el('input', { class: 'search', value: r.reviewer || '' });
  const lastR = el('input', { class: 'search', type: 'date', value: r.last_review_date || '' });
  const nextR = el('input', { class: 'search', type: 'date', value: r.next_review_date || '' });
  const notes = el('textarea', { class: 'search', rows: '3', style: 'resize:vertical' });
  notes.value = r.notes || '';

  const reqs = tcReqEditor(r);

  const inner = el('div', { style: 'min-width:min(780px,80vw)' },
    tcRow('Name', name),
    el('div', { class: 'grid2' }, tcRow('Type', type), tcRow('Provider / company', prov)),
    tcRow('Purpose / use case', purp),
    el('div', { class: 'grid2' }, tcRow('Owner', owner), tcRow('Risk level', risk)),
    reqs.node);

  const gate = el('p', { style: 'font-size:12.5px;color:var(--ink-3);margin:6px 0 0' },
    'Approved and Rejected are not on this list. Both follow from a decision '
    + 'recorded under "Record a decision", which is also what the database requires.');

  inner.append(
    el('p', { class: 'mono', style: 'font-size:10px;letter-spacing:.14em;text-transform:uppercase;'
      + 'color:var(--ink-3);margin:22px 0 8px' }, 'Where it stands'),
    el('div', { class: 'grid2' }, tcRow('Status', stat), tcRow('Reviewer', rev)),
    gate,
    el('div', { class: 'grid2' }, tcRow('Last reviewed', lastR), tcRow('Next review', nextR)),
    tcRow('Notes', notes));

  if (!isNew) {
    const missing = tcMissing(r);
    inner.appendChild(el('div', { class: 'banner', style: missing.length
        ? 'background:var(--bad-soft);border-color:var(--bad);color:var(--bad)' : '' },
      el('b', null, missing.length
        ? (missing.length + (missing.length === 1 ? ' requirement outstanding. ' : ' requirements outstanding. '))
        : 'Nothing outstanding. '),
      missing.length
        ? missing.map(m => m.label).join(', ')
        : 'This record can be put to a reviewer for a decision.'));
  }

  const save = el('button', { class: 'btn btn-sm' }, isNew ? 'Add it' : 'Save changes');
  save.addEventListener('click', async () => {
    if (!name.value.trim()) return toast('Give it a name.', true);
    const payload = Object.assign({
      name: name.value.trim(),
      entity_type: type.value,
      provider: prov.value.trim() || null,
      purpose: purp.value.trim() || null,
      owner: owner.value.trim() || null,
      risk_level: risk.value,
      compliance_status: stat.value,
      reviewer: rev.value.trim() || null,
      last_review_date: lastR.value || null,
      next_review_date: nextR.value || null,
      notes: notes.value.trim() || null
    }, reqs.read());

    if (!isNew && (r.compliance_status === 'approved' || r.compliance_status === 'rejected')) {
      delete payload.compliance_status;
    }

    try {
      if (isNew) await supaInsert('tools_counterparties', payload);
      else await supaPatch('tools_counterparties', 'id=eq.' + encodeURIComponent(r.id), payload);
      closeSheet();
      toast(isNew ? 'Added.' : 'Saved.');
      go('tools');
    } catch (e) { toast(e.message, true); }
  });

  sheet(isNew ? 'Add a tool or counterparty' : r.name, [inner],
    [el('button', { class: 'btn btn-sm btn-quiet', onclick: closeSheet }, 'Cancel'), save]);
}

function decisionSheet(r) {
  const missing  = tcMissing(r);
  const docs     = jsonArr(r.required_documents);
  const checks   = jsonArr(r.compliance_checks);
  const reviewed = docs.map(d => ({ kind: 'document', key: d.key, label: d.label || d.key }))
    .concat(checks.map(c => ({ kind: 'check', key: c.key, label: c.label || c.key,
                               status: c.status || 'pending' })));

  const decision = tcSelect(
    (missing.length ? [] : [['approved', 'Approve']])
      .concat([['more_information_required', 'Ask for more information'], ['rejected', 'Reject']]),
    missing.length ? 'more_information_required' : 'approved');
  const comments = el('textarea', { class: 'search', rows: '3', style: 'resize:vertical' });
  const reason   = el('input', { class: 'search',
    placeholder: 'Why, in one line \u2014 recorded against your name' });

  const inner = el('div', { style: 'min-width:min(640px,76vw)' });

  if (missing.length) {
    inner.appendChild(el('div', { class: 'banner', style: 'background:var(--bad-soft);border-color:var(--bad);color:var(--bad)' },
      el('b', null, 'Approval is not available. '),
      missing.length + (missing.length === 1 ? ' mandatory requirement is ' : ' mandatory requirements are ')
      + 'outstanding: ' + missing.map(m => m.label).join(', ')
      + '. You can still ask for more information or reject.'));
  }

  inner.append(
    el('p', { style: 'font-size:13.5px;color:var(--ink-2);margin:4px 0 16px;line-height:1.55' },
      'This is recorded against your sign-in, with the time, and cannot be edited '
      + 'afterwards. A correction is made by recording a further decision.'),
    tcRow('Decision', decision),
    tcRow('Reason', reason),
    tcRow('Comments', comments));

  if (reviewed.length) {
    inner.append(
      el('p', { class: 'mono', style: 'font-size:10px;letter-spacing:.14em;text-transform:uppercase;'
        + 'color:var(--ink-3);margin:20px 0 8px' }, 'What you are confirming you reviewed'),
      el('div', { class: 'ev' }, ...reviewed.map(x => el('div', null,
        el('span', { class: 'k' }, (x.kind === 'check' ? 'check    ' : 'document ')),
        document.createTextNode(x.label + (x.status ? ' \u2014 ' + x.status : ''))))));
  }

  const go2 = el('button', { class: 'btn btn-sm' }, 'Record it');
  go2.addEventListener('click', async () => {
    if (!reason.value.trim()) return toast('Give a reason. It is the part that is read later.', true);
    const d = decision.value;
    go2.disabled = true; go2.textContent = 'Recording\u2026';
    try {
      await supaInsert('compliance_reviews', {
        subject_type: 'tool_counterparty',
        subject_id: r.id,
        decision: d,
        decided_by: (session && session.email) || 'unknown',
        reason: reason.value.trim(),
        comments: comments.value.trim() || null,
        requirements_reviewed: reviewed
      });
      const status = d === 'approved' ? 'approved'
                   : d === 'rejected' ? 'rejected'
                   : 'pending_information';
      await supaPatch('tools_counterparties', 'id=eq.' + encodeURIComponent(r.id),
        { compliance_status: status, last_review_date: new Date().toISOString().slice(0, 10) });
      closeSheet();
      toast('Decision recorded.');
      go('tools');
    } catch (e) {
      toast(e.message, true);
      go2.disabled = false; go2.textContent = 'Record it';
    }
  });

  sheet('Decision \u2014 ' + r.name, [inner],
    [el('button', { class: 'btn btn-sm btn-quiet', onclick: closeSheet }, 'Cancel'), go2]);
}

function historySheet(r) {
  const inner = el('div', { style: 'min-width:min(720px,78vw)' });
  inner.appendChild(el('p', { class: 'mono', style: 'font-size:12px;color:var(--ink-3);margin:0 0 14px' },
    'Every change, newest first. Written by the database, not by this page.'));
  const host = el('div');
  inner.appendChild(host);
  sheet('History \u2014 ' + r.name, [inner],
    [el('button', { class: 'btn btn-sm btn-quiet', onclick: closeSheet }, 'Close')]);

  fill(host, async () => {
    const [log, revs] = await Promise.all([
      supaSelect('audit_log',
        'select=*&table_name=eq.tools_counterparties&row_id=eq.' + encodeURIComponent(r.id)
        + '&order=changed_at.desc&limit=60'),
      supaSelect('compliance_reviews',
        'select=*&subject_type=eq.tool_counterparty&subject_id=eq.' + encodeURIComponent(r.id)
        + '&order=decided_at.desc&limit=30')
    ]);
    return { log: log, revs: revs };
  }, (d) => {
    if (d.revs.length) {
      host.appendChild(el('p', { class: 'mono', style: 'font-size:10px;letter-spacing:.14em;'
        + 'text-transform:uppercase;color:var(--ink-3);margin:0 0 8px' }, 'Decisions'));
      for (const v of d.revs) {
        host.appendChild(entry({
          tone: v.decision === 'approved' ? 'good' : v.decision === 'rejected' ? 'bad' : 'signal',
          action: (TC_STATUS[v.decision] ? TC_STATUS[v.decision][0] : v.decision).replace(/_/g, ' '),
          who: asText(v.reason),
          evidence: [
            ['by      ', v.decided_by],
            ['at      ', fmtDate(v.decided_at)],
            ['comments', asText(v.comments)],
            ['reviewed', jsonArr(v.requirements_reviewed).length + ' items']
          ]
        }));
      }
    }
    host.appendChild(el('p', { class: 'mono', style: 'font-size:10px;letter-spacing:.14em;'
      + 'text-transform:uppercase;color:var(--ink-3);margin:22px 0 8px' }, 'Changes'));
    if (!d.log.length) {
      return host.appendChild(empty('Nothing recorded', 'Changes appear here as they are made.'));
    }
    for (const a of d.log) {
      const ch = jsonArr(a.changes);
      host.appendChild(entry({
        tone: a.action === 'insert' ? 'good' : a.action === 'delete' ? 'bad' : 'accent',
        action: a.action === 'insert' ? 'Created'
              : a.action === 'delete' ? 'Deleted'
              : ch.length + (ch.length === 1 ? ' field changed' : ' fields changed'),
        who: (a.changed_by || 'unknown') + '  \u00B7  ' + fmtDate(a.changed_at),
        evidence: ch.slice(0, 8).map(c => [
          String(c.field).replace(/_/g, ' ').padEnd(10),
          (asText(c.old) || '\u2014') + '  \u2192  ' + (asText(c.new) || '\u2014')
        ])
      }));
    }
  });
}

RENDER.tools = function (body) {
  clear(body);

  let all = null;

  const find = el('input', { class: 'search', type: 'search',
    placeholder: 'Name, provider or owner\u2026' });
  const fType = tcSelect([['', 'Any type'], ['tool', 'Tools'], ['counterparty', 'Counterparties']], '');
  const fRisk = tcSelect([['', 'Any risk'], ['high', 'High'], ['medium', 'Medium'], ['low', 'Low']], '');
  const dueBox = el('input', { type: 'checkbox', id: 'tc-due' });
  const dueLbl = el('label', { for: 'tc-due',
    style: 'display:flex;gap:7px;align-items:center;font-size:13px;color:var(--ink-2);white-space:nowrap' },
    dueBox, 'Review due');
  const addBtn = el('button', { class: 'btn btn-sm', onclick: () => toolSheet(null) }, 'Add');

  body.appendChild(el('div', { class: 'toolbar' }, find, fType, fRisk, dueLbl, addBtn));

  const chips = el('div', { class: 'chips', style: 'margin:12px 0 4px' });
  const out = el('div');
  body.append(chips, out);

  const VIEWS = [
    ['all',          'Everything',   'accent'],
    ['outstanding',  'Outstanding',  'signal'],
    ['not_reviewed', 'Not reviewed', ''],
    ['under_review', 'Under review', 'signal'],
    ['approved',     'Approved',     'good'],
    ['rejected',     'Rejected',     'bad'],
    ['high',         'High risk',    'bad']
  ];
  const btns = {};
  for (const [k, lbl] of VIEWS) {
    btns[k] = el('button', { class: 'chip',
      onclick: () => { toolsView = k; paintChips(); paint(); } }, lbl);
    chips.appendChild(btns[k]);
  }

  const inView = (r, k) =>
      k === 'all'         ? true
    : k === 'outstanding' ? tcMissing(r).length > 0
    : k === 'high'        ? r.risk_level === 'high'
    :                       r.compliance_status === k;

  function paintChips() {
    for (const [k, lbl, tone] of VIEWS) {
      const b = btns[k];
      const on = k === toolsView;
      b.style.borderColor = on ? 'var(--' + (tone || 'accent') + ')' : '';
      b.style.color       = on ? 'var(--' + (tone || 'accent') + ')' : '';
      b.style.fontWeight  = on ? '600' : '';
      if (all) {
        const n = all.filter(r => inView(r, k)).length;
        b.textContent = lbl + '  ' + n;
        b.style.opacity = n ? '' : '.45';
      } else {
        b.textContent = lbl;
      }
    }
  }

  function paint() {
    clear(out);
    const q = find.value.trim().toLowerCase();
    let rows = all.filter(r => inView(r, toolsView));
    if (fType.value) rows = rows.filter(r => r.entity_type === fType.value);
    if (fRisk.value) rows = rows.filter(r => r.risk_level === fRisk.value);
    if (dueBox.checked) rows = rows.filter(tcDue);
    if (q) {
      rows = rows.filter(r => [r.name, r.provider, r.owner, r.purpose]
        .some(v => String(v || '').toLowerCase().includes(q)));
    }

    if (!rows.length) {
      return out.appendChild(all.length
        ? empty('Nothing under that filter', 'Widen the filters, or clear the search box.')
        : empty('The register is empty',
            'Add the first tool or counterparty and it starts at Not reviewed.'));
    }

    for (const r of rows) {
      const missing = tcMissing(r);
      const st = TC_STATUS[r.compliance_status] || ['Unknown', ''];
      const rk = TC_RISK[r.risk_level] || ['?', ''];
      const due = tcDue(r);

      let call = null, callLabel = null, callTone = '';
      if (missing.length) {
        call = missing.map(m => m.label + (m.why === 'failed' ? ' (failed)' : '')).join('   \u00B7   ');
        callLabel = missing.length === 1 ? '1 requirement outstanding'
                                         : missing.length + ' requirements outstanding';
        callTone = 'bad';
      } else if (r.compliance_status === 'approved' && due) {
        call = 'The review date has passed. Approval stands until someone reconsiders it.';
        callLabel = 'Review overdue';
        callTone = 'signal';
      } else if (r.compliance_status === 'approved') {
        call = 'Approved by ' + (r.approved_by || 'a reviewer')
             + (r.approval_date ? ' on ' + fmtDate(r.approval_date) : '') + '.';
        callLabel = 'Cleared';
        callTone = 'good';
      } else if (r.compliance_status !== 'rejected') {
        call = 'Nothing outstanding. It needs a reviewer to record a decision.';
        callLabel = 'Ready for a decision';
        callTone = 'signal';
      }

      out.appendChild(entry({
        tone: missing.length ? 'bad' : (st[1] || 'accent'),
        rail: '#' + r.id,
        action: r.name,
        who: asText(r.purpose),
        callout: call,
        calloutLabel: callLabel,
        calloutTone: callTone,
        evidence: [
          ['type      ', r.entity_type === 'counterparty' ? 'Counterparty' : 'Tool'],
          ['provider  ', asText(r.provider)],
          ['owner     ', asText(r.owner)],
          ['reviewer  ', asText(r.reviewer)],
          ['last review', r.last_review_date ? fmtDate(r.last_review_date) : null],
          ['next review', r.next_review_date ? fmtDate(r.next_review_date) : null]
        ],
        tags: [[st[0], st[1]], [rk[0] + ' risk', rk[1]]].concat(due ? [['review due', 'signal']] : []),
        actions: [
          { label: 'Open', primary: true, run: () => toolSheet(r) },
          { label: 'Record a decision', run: () => decisionSheet(r) },
          { label: 'History', run: () => historySheet(r) }
        ]
      }));
    }

    out.appendChild(el('p', { class: 'mono',
      style: 'color:var(--ink-3);font-size:12px;margin-top:18px' },
      'Showing ' + rows.length + ' of ' + all.length));
  }

  for (const c of [fType, fRisk]) c.addEventListener('change', paint);
  dueBox.addEventListener('change', paint);
  find.addEventListener('input', () => { if (all) paint(); });

  paintChips();
  out.appendChild(el('p', { class: 'mono', style: 'color:var(--ink-3);font-size:12px' }, 'Loading\u2026'));

  fill(out, async () => {
    if (DEMO) return [];
    return await supaSelect('tools_counterparties', 'select=*&order=name.asc&limit=300');
  }, (rows) => {
    all = rows;
    counts.tools = rows.filter(r => tcMissing(r).length > 0).length;
    paintCounts();
    paintChips();
    paint();
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
  bar.append(input,
    el('button', { class: 'btn btn-sm btn-quiet', onclick: () => run() }, 'Search'),
    el('button', { class: 'btn btn-sm', onclick: () => addContactSheet(() => run()) }, '+ Add a person'));
  const out = el('div');
  clear(body); body.append(bar, chips, out);

  let shown = 120;

  function markDuplicates(rows) {
    const byMail = {}, byName = {};
    for (const c of rows) {
      const m = String(c.email || '').toLowerCase().trim();
      const n = (String(c.name || '').toLowerCase().trim() + '|'
               + String(c.company || '').toLowerCase().trim());
      if (m) (byMail[m] = byMail[m] || []).push(c);
      if (n !== '|') (byName[n] = byName[n] || []).push(c);
    }
    for (const c of rows) {
      const m = String(c.email || '').toLowerCase().trim();
      const n = (String(c.name || '').toLowerCase().trim() + '|'
               + String(c.company || '').toLowerCase().trim());
      const twins = new Set();
      for (const g of [byMail[m], byName[n]]) {
        if (!g || g.length < 2) continue;
        for (const other of g) if (other !== c) twins.add(other);
      }
      c._dupes = Array.from(twins);
    }
    return rows;
  }
  input.addEventListener('keydown', e => { if (e.key === 'Enter') run(); });

  function run(keepCount) {
    if (!keepCount) shown = 120;
    busy(out);
    fill(out, () => {
      const q = input.value.trim();
      let sel = 'select=*&limit=' + shown + '&order=last_contact_at.desc.nullslast';
      if (q) {
        const t = lk(q);
        sel += '&or=(name.ilike.' + t + ',company.ilike.' + t + ',city.ilike.' + t + ')';
      }
      if (filter === 'knows')   sel += '&knows_us=in.(yes,vaguely)';
      if (filter === 'due')     sel += '&has_open_next_step=is.true&side=neq.taranis';
      if (filter === 'quiet')   sel += '&side=neq.taranis&or=(days_quiet.gt.60,last_contact_at.is.null)';
      if (filter === 'taranis') sel += '&side=eq.taranis';
      if (filter === 'clients') sel += '&side=eq.external';
      return readRows('contacts_app', sel, 'contacts.search', { q, filter });
    }, (rows) => {
      markDuplicates(rows);
      if (!rows.length) return out.appendChild(empty('No one matches', 'Try a surname, or the firm on its own.'));
      for (const c of rows) {
        const q = (c.days_quiet !== null && c.days_quiet !== undefined)
          ? c.days_quiet : daysSince(c.last_interaction || c.last_contact_at);
        out.appendChild(entry({
          tone: c.knows_us === 'yes' ? 'good' : c.knows_us === 'vaguely' ? 'signal' : '',
          rail: lastSpokenRail(q),
          action: c.name,
          who: [c.company, c.city, c.country].filter(Boolean).join(' · '),
          evidence: [
            ['last email ', lastSpoken(c, q)],
            ['email      ', c.email],
            ['about      ', c.last_contact_summary || c.last_contact_note],
            ['next step  ', c.next_step],
            ['ticket     ', c.aum_band],
            ['duplicate  ', (c._dupes && c._dupes.length)
                ? 'Also in the book as #' + c._dupes.map(d => d.id).join(', #')
                  + ' \u2014 same ' + (c._dupes.some(d =>
                      String(d.email || '').toLowerCase() === String(c.email || '').toLowerCase() && c.email)
                    ? 'email address' : 'name and firm')
                : null],
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
            c.category ? [c.category, ''] : null,
            (c._dupes && c._dupes.length) ? ['possible duplicate', 'signal'] : null
          ].filter(Boolean),
          actions: [
            { label: 'View profile', primary: true, run: () => openProfile(c) },
            { label: 'Draft an email', run: () => { PENDING.draft = c.name; go('email'); } },
            { label: 'Book a Zoom', run: () => { PENDING.meet = c.name; go('meetings'); } },
            { label: 'History', run: () => askAbout('What did we send ' + c.name + ' and when was our last contact?') }
          ]
        }));
      }
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
  const out = el('div'); body.appendChild(out);
  if (PENDING.draft) { to.value = PENDING.draft; PENDING.draft = null; brief.focus(); }

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

  const cSubj = el('input', { class: 'search', placeholder: 'Subject' });
  const cBody = el('textarea', { class: 'ta', style: 'min-height:200px',
    placeholder: 'Write the email. It is saved as a draft \u2014 nothing sends until you approve it.' });
  const cSave = el('button', { class: 'btn', onclick: () => saveDraft() }, 'Save as a draft');

  async function saveDraft() {
    const who = to.value.trim();
    if (!who) return toast('Say who it goes to first.', true);
    if (!cSubj.value.trim()) return toast('Give it a subject.', true);
    if (!cBody.value.trim()) return toast('The email is empty.', true);
    cSave.disabled = true; cSave.textContent = 'Saving\u2026';
    try {
      const hit = await readRows('contacts_app',
        'select=id,name,email&limit=2' + ilikeAny(['name', 'email'], who),
        'contacts.search', { q: who, filter: 'all' });
      const found = hit.filter(x => x.email);
      if (!found.length) throw new Error('Nobody in the book called "' + who + '" has an email address.');
      if (found.length > 1) throw new Error('That matches ' + found.length + ' people. Use a fuller name.');
      const c = found[0];

      const id = 'app-' + Date.now().toString(36) + '-'
        + Math.random().toString(36).slice(2, 8);
      await supaInsert('outbound_email_drafts', {
        draft_id:   id,
        contact_id: c.id,
        to_addr:    c.email,
        subject:    cSubj.value.trim(),
        body_text:  cBody.value.trim(),
        status:     'pending_approval'
      });
      toast('Draft saved for ' + c.name + '. Approve it below to send.');
      cSubj.value = ''; cBody.value = '';
      runDrafts();
    } catch (e) {
      toast(e.message, true);
    } finally {
      cSave.disabled = false; cSave.textContent = 'Save as a draft';
    }
  }

  const composeForm = el('div', { style: 'max-width:900px;display:none;margin:6px 0 18px' },
    el('label', { class: 'field' }, el('span', null, 'Subject'), cSubj),
    el('label', { class: 'field' }, el('span', null, 'The email'), cBody),
    cSave);

  let composeOpen = false;
  const composeToggle = el('button', { class: 'btn btn-sm btn-quiet', onclick: () => {
    composeOpen = !composeOpen;
    composeForm.style.display = composeOpen ? 'block' : 'none';
    composeToggle.textContent = composeOpen ? 'Never mind' : 'Write it yourself';
    if (composeOpen) cSubj.focus();
  } }, 'Write it yourself');

  const drafts = el('div');

  function runDrafts() {
    clear(drafts);
    fill(drafts, () => supaSelect('outbound_email_drafts',
      'select=draft_id,to_addr,subject,body_text,status,created_at'
      + '&status=eq.pending_approval&order=created_at.desc&limit=25'), (rows) => {
      if (!rows.length) return;
      drafts.appendChild(el('p', { class: 'mono',
        style: 'color:var(--ink-3);font-size:11px;letter-spacing:.14em;text-transform:uppercase;margin:22px 0 8px' },
        rows.length === 1 ? 'One draft waiting' : rows.length + ' drafts waiting'));
      for (const d of rows) {
        drafts.appendChild(entry({
          tone: 'signal', rail: 'draft',
          action: d.subject || '(no subject)',
          who: 'To ' + d.to_addr,
          evidence: [['written', fmtDate(d.created_at)], ['says   ', d.body_text]],
          actions: [
            { label: 'Send it', primary: true, run: async () => {
                if (!confirm('Send this to ' + d.to_addr + '? It goes immediately.')) return;
                toast('Sending\u2026');
                try {
                  await callGateway('email.send', { draft_id: d.draft_id });
                  toast('Sent.');
                  runDrafts();
                } catch (e) { toast(e.message, true); }
              } },
            { label: 'Discard', run: async () => {
                if (!confirm('Throw this draft away?')) return;
                try {
                  await supaPatch('outbound_email_drafts',
                    'draft_id=eq.' + encodeURIComponent(d.draft_id), { status: 'rejected' });
                  runDrafts();
                } catch (e) { toast(e.message, true); }
              } }
          ]
        }));
      }
    });
  }

  body.append(
    el('div', { class: 'banner' },
      el('b', null, 'Two steps, same as the bot. '),
      'Writing a draft never sends. The address is resolved from the contact book — nothing is invented.'),
    el('div', { class: 'toolbar' }, to),
    el('div', { class: 'toolbar' }, brief, go1, composeToggle));
  body.append(composeForm, drafts);
  runDrafts();

  const nName  = el('input', { class: 'search', placeholder: 'Full name' });
  const nMail  = el('input', { class: 'search', type: 'email', placeholder: 'Email address' });
  const nPhone = el('input', { class: 'search', placeholder: 'Phone' });
  const nComp  = el('input', { class: 'search', placeholder: 'Company' });
  const nRole  = el('input', { class: 'search', placeholder: 'Role' });
  const nCity  = el('input', { class: 'search', placeholder: 'City' });
  const nCtry  = el('input', { class: 'search', placeholder: 'Country' });
  const nSide  = el('select', { class: 'search' },
    el('option', { value: 'client' }, 'Client'),
    el('option', { value: 'taranis' }, 'Taranis'));
  const nKnows = el('select', { class: 'search' },
    el('option', { value: '' }, 'Do they know Taranis?'),
    el('option', { value: 'yes' }, 'Yes'),
    el('option', { value: 'vaguely' }, 'Vaguely'),
    el('option', { value: 'no' }, 'No'));
  const nNotes = el('textarea', { class: 'ta', style: 'min-height:90px',
    placeholder: 'Anything else worth knowing \u2014 where you met, what they are after, ticket size.' });

  const addBtn = el('button', { class: 'btn', onclick: () => addPerson() }, 'Add them to the book');

  async function addPerson() {
    if (!nName.value.trim()) return toast('A name is the one thing required.', true);
    addBtn.disabled = true; addBtn.textContent = 'Saving\u2026';
    try {
      const row = {
        name:              nName.value.trim(),
        email:             nMail.value.trim().toLowerCase() || null,
        phone:             nPhone.value.trim() || null,
        company:           nComp.value.trim() || null,
        role:              nRole.value.trim() || null,
        city:              nCity.value.trim() || null,
        country:           nCtry.value.trim() || null,
        category:          nSide.value === 'taranis' ? 'taranis' : 'client',
        knows_taranis:     nKnows.value || null,
        intelligence_text: nNotes.value.trim() || null,
        source:            'console'
      };
      const saved = await supaInsert('contacts', row);
      toast(row.name + ' added to the book.');
      [nName, nMail, nPhone, nComp, nRole, nCity, nCtry].forEach(x => { x.value = ''; });
      nNotes.value = ''; nKnows.value = '';
      runList();
      if (saved && saved.id) openProfile(Object.assign({ knows_us: 'unknown' }, saved));
    } catch (e) {
      toast(e.message, true);
    } finally {
      addBtn.disabled = false; addBtn.textContent = 'Add them to the book';
    }
  }

  const lbl2 = (t, node) => el('label', { class: 'field' }, el('span', null, t), node);
  const addForm = el('div', { style: 'max-width:900px;display:none;margin-bottom:8px' },
    el('div', { class: 'grid2' }, lbl2('Name', nName), lbl2('Email', nMail)),
    el('div', { class: 'grid2' }, lbl2('Phone', nPhone), lbl2('Company', nComp)),
    el('div', { class: 'grid2' }, lbl2('Role', nRole), lbl2('Taranis or client', nSide)),
    el('div', { class: 'grid2' }, lbl2('City', nCity), lbl2('Country', nCtry)),
    lbl2('Do they know Taranis?', nKnows),
    lbl2('Anything else', nNotes),
    addBtn);

  let addOpen = false;
  const addToggle = el('button', { class: 'btn btn-sm btn-quiet', onclick: () => {
    addOpen = !addOpen;
    addForm.style.display = addOpen ? 'block' : 'none';
    addToggle.textContent = addOpen ? 'Never mind' : '+ Add a person';
    if (addOpen) nName.focus();
  } }, '+ Add a person');

  const list = el('div');
  body.append(
    el('p', { class: 'mono',
      style: 'color:var(--ink-3);font-size:11px;letter-spacing:.14em;text-transform:uppercase;margin:26px 0 8px' },
      'Who to write to'),
    el('div', { class: 'toolbar' }, find, addToggle),
    addForm, sideChips, list);
  paintSide();

  function runList() {
    busy(list);
    fill(list, () => {
      const q = find.value.trim();
      let sel = 'select=*&limit=120&order=last_contact_at.desc.nullslast';
      if (q) {
        const t = lk(q);
        sel += '&or=(name.ilike.' + t + ',company.ilike.' + t
             + ',city.ilike.' + t + ',country.ilike.' + t + ')';
      }
      if (side === 'external' || side === 'taranis') sel += '&side=eq.' + side;
      else if (side === 'quiet') sel += '&side=neq.taranis&or=(days_quiet.gt.60,last_contact_at.is.null)';
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
          rail: lastSpokenRail(dq),
          action: c.name,
          who: [c.country, c.company].filter(Boolean).join('  \u00B7  '),
          evidence: [
            ['country    ', c.country],
            ['last email ', lastSpoken(c, dq)],
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
    const list = Array.from(seen.values());
    list.sort((x, y) => {
      if (x.owed !== y.owed) return x.owed ? -1 : 1;
      const dx = daysSince(x.last), dy = daysSince(y.last);
      return (dy === null ? -1 : dy) - (dx === null ? -1 : dx);
    });
    return list;
  }

  function run() {
    busy(out);
    const q = input.value.trim();
    const people = (view === 'client' || view === 'internal');

    let sel = 'select=*&order=received_at.desc&limit=' + (people ? 400 : 60);
    if (q) {
      const t = lk(q);
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
              ['last email ', lastSpoken(p, q2)],
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

let oppsView = 'all';
let oppsMode = 'review';
let oppsFilters = { q: '', country: '', type: '', strategy: '', asset: '', tmin: '' };
let oppsFilterOpen = true;

const OPPS_COUNTRY_NAMES = { GB: 'United Kingdom', US: 'United States', CH: 'Switzerland',
  SG: 'Singapore', AE: 'UAE', SA: 'Saudi Arabia', DE: 'Germany', FR: 'France',
  HK: 'Hong Kong', CA: 'Canada', AU: 'Australia', IE: 'Ireland', NL: 'Netherlands',
  SE: 'Sweden', NO: 'Norway', DK: 'Denmark', IT: 'Italy', ES: 'Spain', LU: 'Luxembourg',
  IL: 'Israel', JP: 'Japan', CN: 'China', IN: 'India' };

function oppsPasses(m, skip) {
  const F = oppsFilters;
  const jarr = (v) => {
    let x = v;
    for (let i = 0; i < 2 && typeof x === 'string'; i++) { try { x = JSON.parse(x); } catch (_) { x = []; } }
    return Array.isArray(x) ? x.map(s => String(s).toLowerCase()) : [];
  };
  if (skip !== 'country'  && F.country && String(m.investor_country || '').toUpperCase() !== F.country) return false;
  if (skip !== 'type'     && F.type && !String(m.investor_type || '').toLowerCase().includes(F.type)) return false;
  if (skip !== 'strategy' && F.strategy && !jarr(m.strategies).some(s => s.includes(F.strategy))) return false;
  if (skip !== 'asset'    && F.asset && !jarr(m.asset_classes).some(a => a.includes(F.asset))) return false;
  if (skip !== 'tmin'     && F.tmin) {
    const t = Number(m.ticket_max_usd || m.ticket_min_usd || 0);
    if (!(t >= Number(F.tmin))) return false;
  }
  if (skip !== 'q'        && F.q) {
    const hay = [m.investor_name, m.organization_name, m.investor_city, m.investor_country,
      m.investor_type, asText(m.strategies), asText(m.fit_reason)]
      .filter(Boolean).join(' ').toLowerCase();
    if (!hay.includes(F.q.toLowerCase())) return false;
  }
  return true;
}

// A row's verdict is new_qualification where the DB re-score set one, the old
// qualification column otherwise. PostgREST filters for each side of it.
const VERDICT_OPEN = 'or=(new_qualification.neq.rejected,'
  + 'and(new_qualification.is.null,or(qualification.is.null,qualification.neq.rejected)))';
const VERDICT_REJECTED = 'or=(new_qualification.eq.rejected,'
  + 'and(new_qualification.is.null,qualification.eq.rejected))';

// Everything the Opportunities tab lists, one row per investor: every row not
// rejected, plus the rejected rows the browser reclaims, minus investors with an
// effectively rejected row. read(verdictFilter, limit) fetches the rows. The tab
// and the nav badge both count this list, so the badge always equals Matched +
// Waiting.
async function openOpportunities(read) {
  const main = await read(VERDICT_OPEN, 1000);
  let reclaimed = [];
  const rejectedKeys = new Set();
  try {
    const rejList = (await read(VERDICT_REJECTED, 500)) || [];
    reclaimed = rejList.filter(reclaimedOpportunity);
    for (const m of rejList) {
      if (!isNotMandate(m) && effectivelyRejected(m)) {
        const k = investorKey(m); if (k) rejectedKeys.add(k);
      }
    }
  } catch (_) { /* leave the pipeline as it is */ }
  const merged = (main || []).concat(reclaimed), byId = {}, uniq = [];
  for (const m of merged) {
    const k = investorKey(m);
    if (k && rejectedKeys.has(k)) continue;
    const id = m && m.id;
    if (id == null) { uniq.push(m); continue; }
    if (!byId[id]) { byId[id] = 1; uniq.push(m); }
  }
  return dedupeInvestors(uniq);
}

// What the badge needs from a row that has a DB verdict: the verdict, the names
// the investor key is built from and the fields dedupe ranks by. A row without a
// DB verdict falls back to the browser rule, which reads the whole row.
const OPPS_COUNT_COLS = 'id,qualification,new_qualification,new_fit_score,investor_name,'
  + 'organization_name,investor_tag,hard_fail_reasons,fit_reason,wi_enriched_at,fit_score,'
  + 'alert_date,created_at';

async function openOpportunityCount() {
  const rows = await openOpportunities(async (verdict, limit) => {
    const q = (sel, extra) => supaSelect('wi_mandates',
      'select=' + sel + '&' + verdict + extra + '&order=id.desc&limit=' + limit);
    const [scored, unscored] = await Promise.all([
      q(OPPS_COUNT_COLS, '&new_qualification=not.is.null'),
      q('*', '&new_qualification=is.null')
    ]);
    return scored.concat(unscored).sort((a, b) => Number(b.id) - Number(a.id)).slice(0, limit);
  });
  return rows.length;
}

RENDER.opps = function (body) {
  clear(body);

  const modeRow = el('div', { style: 'display:flex;gap:12px;flex-wrap:wrap;margin-bottom:14px' });
  const filterBar = el('div', { style: 'margin-bottom:14px' });
  const chips = el('div', { class: 'chips', style: 'margin-bottom:14px' });
  const sortBar = el('div');
  const list  = el('div');

  body.appendChild(el('div', { class: 'toolbar', style: 'margin-bottom:12px' },
    el('button', { class: 'btn btn-sm btn-quiet', onclick: () => importSheet() },
      'Import an investor list')));
  body.append(modeRow, filterBar, chips, sortBar, list);

  const VIEWS = [
    ['all',      'Everything',    'accent'],
    ['unread',   'Unread',        'signal'],
    ['pending',  'Not approved',  'signal'],
    ['approved', 'Approved',      'good']
  ];
  const seen = (m) => !!m.seen_at;
  const inView = (m, k) =>
      k === 'all'      ? true
    : k === 'unread'   ? !seen(m)
    : k === 'approved' ? isApproved(m)
    :                    !isApproved(m);

  const inMode = (m) => (scoreBand(m) === 'matched') === (oppsMode === 'matched');

  fill(list, () => openOpportunities(
    (verdict, limit) => readRows('wi_mandates',
      'select=*&' + verdict + '&order=id.desc&limit=' + limit, 'wi.mandates.list', { limit: limit })
  ), (all) => {
    const nMatched = all.filter(m => scoreBand(m) === 'matched').length;
    const nReview  = all.length - nMatched;
    const bigBtn = (mode, label, count, tone) => {
      const on = oppsMode === mode;
      const b = el('button', {
        class: 'btn' + (on ? '' : ' btn-quiet'),
        style: 'flex:1;min-width:200px;padding:16px 20px;font-size:16px;border-radius:12px;'
             + 'display:flex;flex-direction:column;align-items:flex-start;gap:2px;'
             + (on ? 'background:var(--' + tone + ');border-color:var(--' + tone + ');color:#fff' : ''),
        onclick: () => { oppsMode = mode; go('opps'); }
      },
        el('span', { style: 'font-family:var(--font-display);font-weight:600' }, label),
        el('span', { style: 'font-size:12px;opacity:.8;letter-spacing:.02em' },
          count + (mode === 'matched' ? ' clear strategy fit' : ' review, low fit or needs data')));
      return b;
    };
    modeRow.append(
      bigBtn('matched', 'Matched',              nMatched, 'good'),
      bigBtn('review',  'Waiting for decision', nReview,  'signal'));

    const F = oppsFilters;
    const anyFilter = !!(F.q || F.country || F.type || F.strategy || F.asset || F.tmin);
    const toggle = el('button', { class: 'btn btn-sm btn-quiet',
      onclick: () => { oppsFilterOpen = !oppsFilterOpen; go('opps'); } },
      (oppsFilterOpen ? '\u25BE ' : '\u25B8 ') + 'Filters' + (anyFilter ? '  \u00B7  on' : ''));
    filterBar.appendChild(toggle);

    if (oppsFilterOpen) {
      const panel = el('div', { class: 'card', style: 'padding:16px;margin-top:10px' });
      const mk = (label, node, key) => {
        node.value = F[key] || '';
        node.addEventListener(node.tagName === 'SELECT' ? 'change' : 'input',
          () => { F[key] = node.value; go('opps'); });
        return el('label', { class: 'field' }, el('span', null, label), node);
      };
      const sel = (opts) => {
        const s = el('select', { class: 'search' });
        for (const [v, l] of opts) s.appendChild(el('option', { value: v }, l));
        return s;
      };

      const geoBase  = all.filter(m => inMode(m) && oppsPasses(m, 'country'));
      const typeBase = all.filter(m => inMode(m) && oppsPasses(m, 'type'));

      const geoCounts = new Map();
      for (const r of geoBase) {
        const c = String(r.investor_country || '').trim().toUpperCase();
        if (c) geoCounts.set(c, (geoCounts.get(c) || 0) + 1);
      }
      const geoCodes = new Set(['GB', 'CH', 'US']);
      for (const r of all) { const c = String(r.investor_country || '').trim().toUpperCase(); if (c) geoCodes.add(c); }
      const geos = new Map();
      for (const c of geoCodes) geos.set(c, geoCounts.get(c) || 0);
      const fGeo = sel([['', 'Anywhere']]);
      for (const [v, n] of [...geos].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))) {
        fGeo.appendChild(el('option', { value: v },
          (OPPS_COUNTRY_NAMES[v] || v) + '  (' + n + ')'));
      }

      const typeCounts = new Map();
      for (const r of typeBase) {
        const t = String(r.investor_type || '').trim().toLowerCase();
        if (t) typeCounts.set(t, (typeCounts.get(t) || 0) + 1);
      }
      const typeCodes = new Set();
      for (const r of all) { const t = String(r.investor_type || '').trim().toLowerCase(); if (t) typeCodes.add(t); }
      const types = new Map();
      for (const t of typeCodes) types.set(t, typeCounts.get(t) || 0);
      const fType = sel([['', 'Any investor type']]);
      for (const [v, n] of [...types].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))) {
        fType.appendChild(el('option', { value: v },
          v.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase()) + '  (' + n + ')'));
      }

      const fStrat = sel([['', 'Any strategy'], ['equity_long_short', 'Equity long/short'],
        ['macro', 'Macro'], ['cta', 'CTA / managed futures'], ['market_neutral', 'Market neutral'],
        ['quant', 'Quant / systematic'], ['multi_strategy', 'Multi-strategy'], ['event', 'Event driven']]);
      const fAsset = sel([['', 'Any asset class'], ['hedge', 'Hedge funds'], ['equit', 'Equities'],
        ['credit', 'Credit'], ['private', 'Private markets'], ['real', 'Real assets'],
        ['multi', 'Multi-asset']]);
      const fTick = sel([['', 'Any ticket'], ['500000', 'USD 500k and up'],
        ['1000000', 'USD 1m and up'], ['5000000', 'USD 5m and up'], ['10000000', 'USD 10m and up']]);
      const fQ = el('input', { class: 'search', type: 'search',
        placeholder: 'Name, organisation or what the alert said\u2026' });

      panel.append(
        mk('Search', fQ, 'q'),
        el('div', { class: 'grid2' }, mk('Geography', fGeo, 'country'), mk('Investor type', fType, 'type')),
        el('div', { class: 'grid2' }, mk('Strategy', fStrat, 'strategy'), mk('Asset class', fAsset, 'asset')),
        mk('Minimum ticket', fTick, 'tmin'));

      const clearBtn = el('button', { class: 'btn btn-sm btn-quiet', style: 'margin-top:10px' }, 'Clear filters');
      clearBtn.addEventListener('click', () => {
        oppsFilters = { q: '', country: '', type: '', strategy: '', asset: '', tmin: '' };
        go('opps');
      });
      panel.appendChild(clearBtn);
      filterBar.appendChild(panel);
    }

    const scoped = all.filter(m => inMode(m) && oppsPasses(m));
    for (const [k, lbl, tone] of VIEWS) {
      const on = k === oppsView;
      const n  = scoped.filter(m => inView(m, k)).length;
      const c  = el('button', { class: 'chip',
        onclick: () => { oppsView = k; go('opps'); } }, lbl + '  ' + n);
      c.style.borderColor = on ? 'var(--' + tone + ')' : '';
      c.style.color       = on ? 'var(--' + tone + ')' : '';
      c.style.fontWeight  = on ? '600' : '';
      c.style.opacity     = n ? '' : '.45';
      chips.appendChild(c);
    }

    sortBar.appendChild(sortControl('opps', () => go('opps'),
      'Sorts the ' + all.length + ' loaded \u2014 the newest 1,000 live mandates, not the whole table'));
    const rows = sortMandates(scoped.filter(m => inView(m, oppsView)), sortModeOf('opps'));
    if (!rows.length) {
      return list.appendChild(all.length
        ? empty('Nothing under these filters',
            anyFilter ? 'Loosen a filter, or switch to Waiting for decision.' : 'Try Waiting for decision.')
        : empty('No opportunities yet', 'Screened mandates from With Intelligence land here.'));
    }
    const grid = el('div', { class: 'matchgrid' });
    list.appendChild(grid);
    for (const m of rows) {
      const tone = scoreBand(m) === 'matched' ? 'good' : 'signal';

      const jarr = (v) => {
        let x = v;
        for (let i = 0; i < 2 && typeof x === 'string'; i++) { try { x = JSON.parse(x); } catch (_) { x = []; } }
        return Array.isArray(x) ? x.map(s => String(s).trim()).filter(Boolean) : [];
      };

      grid.appendChild(matchCard(m, {
        tone,
        controls: qualificationControl(m, (to) => routeAfterQualification(m, to)),
        actions: [
          { label: 'View the mandate', primary: true, run: () => { markSeen(m); openMandate(m); } },
          { label: 'Fill a gap', run: () => fillSheet(m) },
          seen(m) ? null : { label: 'Mark as read', run: async () => {
              try { await markSeen(m); go('opps'); } catch (e) { toast(e.message, true); } } },
          m.linkedin_url ? { label: 'Check the network', run: () => act('li.check', { url: m.linkedin_url }, 'Checking') } : null
        ].filter(Boolean).concat(verdictActions(m, (to) => {
          go(to === 'rejected' ? 'rejected' : 'opps');
        }))
      }));
    }
    list.appendChild(el('p', { class: 'mono',
      style: 'color:var(--ink-3);font-size:12px;margin-top:18px' }, 'Showing ' + rows.length));
  });
};

RENDER.notes = function (body) {
  clear(body);

  const title = el('input', { class: 'search', placeholder: 'What was it? e.g. Coffee with Marc Dubois' });
  const date  = el('input', { class: 'search', type: 'date' });
  date.value  = new Date().toISOString().slice(0, 10);
  const place = el('input', { class: 'search', placeholder: 'Where? e.g. Zurich, their office, a call' });
  const text  = el('textarea', { class: 'ta', placeholder: 'What was said, what they are after, what you promised to do next.' });

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
      const t = lk(q);
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

  const find = el('input', { class: 'search', placeholder: 'Search notes by title, text, place or person' });
  const out  = el('div');
  let findTimer = null;
  find.addEventListener('input', () => { clearTimeout(findTimer); findTimer = setTimeout(run, 300); });

  function run() {
    busy(out);
    fill(out, async () => {
      const q = find.value.trim();
      let sel = 'select=*&order=note_date.desc,created_at.desc&limit=200';
      if (q) {
        const t = lk(q);
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
          tone: n.done_at ? 'quiet' : (n.in_contact_book ? 'good' : ''),
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
          tags: [n.in_contact_book ? ['in the book', 'good'] : ['not linked', 'quiet'],
                 n.done_at ? ['dealt with', 'quiet'] : null].filter(Boolean),
          actions: [
            n.contact_name ? { label: 'View profile', primary: true,
              run: () => openProfile({ name: n.contact_name, email: n.contact_email, id: n.contact_id }) } : null,
            { label: 'Edit', run: () => editNoteSheet(n, run) },
            n.done_at
              ? { label: 'Reopen', run: async () => {
                  try { await supaPatch('notes', 'id=eq.' + encodeURIComponent(n.id), { done_at: null }); run(); }
                  catch (e) { toast(e.message, true); } } }
              : { label: 'Mark as dealt with', run: async () => {
                  try {
                    await supaPatch('notes', 'id=eq.' + encodeURIComponent(n.id),
                      { done_at: new Date().toISOString() });
                    toast('Marked as dealt with.'); run();
                  } catch (e) { toast(e.message, true); } } },
            { label: 'Delete', run: async () => {
                if (!confirm('Delete this note? It cannot be undone.')) return;
                try {
                  await supaDelete('notes', 'id=eq.' + encodeURIComponent(n.id));
                  toast('Deleted.'); run();
                } catch (e) { toast(e.message, true); }
              } }
          ].filter(Boolean)
        }));
      }
    });
  }

  body.append(el('div', { class: 'toolbar' }, find, toggle), form, out);
  run();
};

async function markSeen(m) {
  if (m.seen_at) return;
  m.seen_at = new Date().toISOString();
  await supaPatch('wi_mandates', 'id=eq.' + encodeURIComponent(m.id),
    { seen_at: m.seen_at, seen_by: (session && session.email) || null });
}

async function setApproved(m, on, after) {
  if (on && isApproved(m)) return toast('Already approved.');
  if (!on && !isApproved(m)) return toast('It is not approved.');
  const ask = on
    ? 'Approve this opportunity? It moves into Approved opportunities and stops asking for a decision.'
    : 'Take the approval back? It returns to Opportunities as not approved.';
  if (!confirm(ask)) return;
  const patch = on
    ? { approved_at: new Date().toISOString(), approved_by: (session && session.email) || null }
    : { approved_at: null, approved_by: null };
  if (on && (String(m.qualification || '').trim().toLowerCase() === 'rejected'
             || String(m.new_qualification || '').trim().toLowerCase() === 'rejected')) {
    patch.qualification = 'uncertain';
    Object.assign(patch, verdictPatch(m, 'uncertain'));
  }
  try {
    await supaPatch('wi_mandates', 'id=eq.' + encodeURIComponent(m.id), patch);
    Object.assign(m, patch);
    toast(on ? 'Approved.' : 'Approval withdrawn.');
    if (typeof after === 'function') after(on ? 'approved' : 'opps');
  } catch (e) {
    toast(e.message, true);
  }
}

async function setQualification(m, to, said, after) {
  const from = String(m.qualification || '').toLowerCase();
  if (from === to) return toast('It is already there.');
  const ask = to === 'rejected'
    ? 'Reject this mandate? It moves to the Rejected list and you can still change your mind.'
    : to === 'matched'
      ? 'Approve this mandate? It is marked matched, leaves your approvals queue, '
        + 'and stops asking for a decision.'
      : 'Move this back to Opportunities for a decision?';
  if (!confirm(ask)) return;
  try {
    const patch = Object.assign({ qualification: to }, verdictPatch(m, to));
    if (to === 'rejected') { patch.approved_at = null; patch.approved_by = null; }
    await supaPatch('wi_mandates', 'id=eq.' + encodeURIComponent(m.id), patch);
    Object.assign(m, patch);
    toast(said);
    if (typeof after === 'function') after(to);
  } catch (e) {
    toast(e.message, true);
  }
}

function verdictActions(m, after) {
  const q = String(m.qualification || '').toLowerCase();
  const acts = [];
  acts.push(isApproved(m)
    ? { label: 'Withdraw approval', run: () => setApproved(m, false, after) }
    : { label: 'Approve',           run: () => setApproved(m, true,  after) });
  if (q !== 'matched') {
    acts.push({ label: 'Mark as matched', run: () => setQualification(m, 'matched', 'Marked as matched.', after) });
  }
  if (q !== 'uncertain') {
    acts.push({ label: q === 'rejected' ? 'Reconsider' : 'Send to review',
      run: () => setQualification(m, 'uncertain', 'Moved to Opportunities.', after) });
  }
  if (q !== 'rejected') {
    acts.push({ label: 'Reject', run: () => setQualification(m, 'rejected', 'Moved to Rejected.', after) });
  }
  return acts;
}

RENDER.rejected = function (body) {
  clear(body);

  let all = null, tone = 'all';
  const out = el('div');
  const find = el('input', { class: 'search', type: 'search',
    placeholder: 'Name, firm, country or reason\u2026' });
  find.addEventListener('input', () => { clearTimeout(find._t); find._t = setTimeout(paint, 250); });

  const CHIPS = [
    ['all',       'Everything',            'x'],
    ['one',       'Missed by one',         'x'],
    ['none',      'Rejected on score',     'x'],
    ['news',      'Not a mandate',         'x'],
    ['strategy',  'Strategy',              'r'],
    ['asset',     'Asset class',           'r'],
    ['type',      'Investor type',         'r'],
    ['country',   'Outside GB/CH/US',      'r'],
    ['emerging',  'No emerging managers',  'r'],
    ['parse',     'Failed parse',          'r'],
    ['ticket',    'Ticket below USD 500k', 'd']
  ];
  const DATA_ONLY = { ticket: 'A minimum ticket below USD 500,000 is not itself a rejection '
    + '\u2014 only a maximum below the floor is. These were turned away for other reasons.' };

  const chips = el('div');
  const btns = {};
  const groupLabel = (t) => el('p', { class: 'mono',
    style: 'font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--ink-3);margin:10px 0 5px' }, t);

  const rowX = el('div', { class: 'chips' });
  const rowR = el('div', { class: 'chips' });
  const rowD = el('div', { class: 'chips' });
  for (const [k, lbl, grp] of CHIPS) {
    btns[k] = el('button', { class: 'chip', onclick: () => { tone = k; paintChips(); paint(); } }, lbl);
    (grp === 'r' ? rowR : grp === 'd' ? rowD : rowX).appendChild(btns[k]);
  }
  chips.append(rowX, groupLabel('Turned away for'), rowR, groupLabel('Or by what the record says'), rowD);
  function paintChips() {
    for (const [k, lbl] of CHIPS) {
      const b = btns[k];
      b.style.borderColor = (k === tone) ? 'var(--bad)' : '';
      b.style.color       = (k === tone) ? 'var(--bad)' : '';
      b.style.fontWeight  = (k === tone) ? '600' : '';
      if (all) {
        const mand = all.filter(m => !notMandate(m) && effectivelyRejected(m));
        const n = k === 'news' ? all.filter(notMandate).length
                : k === 'all'  ? mand.length
                : mand.filter(m => passes(m, k)).length;
        b.textContent = lbl + '  ' + n;
        b.style.opacity = n ? '' : '.45';
      } else {
        b.textContent = lbl;
      }
    }
  }

  const sortBar = sortControl('rejected', () => paint(),
    'Sorts every rejected mandate (up to 5,000)');
  body.append(el('div', { class: 'toolbar' }, find), chips, sortBar, out);
  paintChips();

  const reasons = (m) => {
    let w = m.hard_fail_reasons;
    for (let i = 0; i < 2 && typeof w === 'string'; i++) {
      try { w = JSON.parse(w); } catch (_) { w = []; }
    }
    if (!Array.isArray(w)) return [];
    const out = [], seen = {};
    for (const r of w) {
      const s = String(r == null ? '' : r).trim();
      if (!s) continue;
      const k = s.toLowerCase().replace(/\s+/g, ' ');
      if (seen[k]) continue;
      seen[k] = true;
      out.push(s);
    }
    return out;
  };

  const NOT_MANDATE = /launch|new manager|market trend|service provider|people move|performance|fundrais|regulat|top story|top insight|managers insight/i;
  const notMandate = (m) =>
    /not an investor mandate/i.test(reasons(m).join(' '))
    || NOT_MANDATE.test(String(m.investor_tag || ''));

  const missCount = (n) =>
    n === 0 ? 'no reason was recorded'
    : n === 1 ? 'one criterion only'
    : n === 2 ? 'two criteria missed'
    : n === 3 ? 'three criteria missed'
    : n + ' criteria missed';

  const num = (v) => (v === null || v === undefined || v === '') ? null : Number(v);
  const strOf = (v) => asText(v).toLowerCase();

  const TESTS = {
    one:  (m, why) => why.length === 1,
    none: (m, why) => why.length === 0,

    strategy: (m, why) => /eligible strategy/i.test(why.join(' '))
      || (strOf(m.strategies) !== '' &&
          !/equity|equities|long short|market neutral|quant|systematic|cta|managed future|macro|multi.?strategy|alternative/i
            .test(strOf(m.strategies))),

    asset: (m, why) => /asset class/i.test(why.join(' '))
      || (strOf(m.asset_classes) !== '' &&
          !/hedge|alternative|absolute return|liquid alts/i.test(strOf(m.asset_classes))),

    type: (m, why) => /ineligible type/i.test(why.join(' '))
      || /private equity|venture|\bvc\b|service provider|placement agent|law firm|real estate|infrastructure/i
           .test(strOf(m.investor_type)),

    country: (m, why) => /outside gb/i.test(why.join(' '))
      || (String(m.investor_country || '').trim() !== '' &&
          ['GB','UK','CH','US'].indexOf(String(m.investor_country).toUpperCase().slice(0, 2)) < 0),

    emerging: (m, why) => /emerging managers/i.test(why.join(' '))
      || m.open_to_emerging_managers === false,

    ticket: (m) => {
      const hi = num(m.ticket_max_usd), lo = num(m.ticket_min_usd);
      if (hi !== null && hi > 0) return hi < 500000;
      if (lo !== null && lo > 0) return lo < 500000;
      return false;
    },

    parse: (m, why) => /failed parse/i.test(why.join(' '))
      || (!String(m.investor_country || '').trim()
          && !String(m.investor_type || '').trim()
          && strOf(m.asset_classes) === '')
  };

  const passes = (m, k) => k === 'all' || (TESTS[k] ? TESTS[k](m, reasons(m)) : true);

  function paint() {
    clear(out);
    if (!all) return;
    const q = find.value.trim().toLowerCase();
    const pool = (tone === 'news') ? all.filter(notMandate)
                                   : all.filter(m => !notMandate(m) && effectivelyRejected(m));
    let rows = pool;

    rows = rows.filter(m => passes(m, tone));

    if (q) {
      rows = rows.filter(m => [m.investor_name, m.organization_name, m.investor_country,
        m.investor_type, reasons(m).join(' '), asText(m.strategies)]
        .filter(Boolean).join(' ').toLowerCase().indexOf(q) > -1);
    }

    rows = sortMandates(rows, sortModeOf('rejected'));

    if (DATA_ONLY[tone]) {
      out.appendChild(el('div', { class: 'banner' },
        el('b', null, 'This filter reads the record, not the reason. '), DATA_ONLY[tone]));
    }

    if (tone === 'news') {
      out.appendChild(el('div', { class: 'banner' },
        el('b', null, 'These were never mandates. '),
        'WI files them as launches, market trends or service-provider pieces, and '
        + 'WI 01 sets them aside before the criteria run. They are kept because the '
        + 'reading is often useful \u2014 the reports themselves live under Newsletters.'));
    }

    if (!rows.length) {
      return out.appendChild(empty('Nothing here',
        tone === 'one'    ? 'No mandate was turned away on a single criterion.'
        : tone === 'none' ? 'Every rejected mandate failed a hard criterion \u2014 none were rejected on the score alone.'
        : tone === 'news'   ? 'No launches or industry pieces have been set aside yet.'
        : tone === 'ticket' ? 'No rejected mandate has a ticket under USD 500,000.'
        : 'No mandate was turned away for that reason.'));
    }

    const grid = el('div', { class: 'matchgrid' });
    out.appendChild(grid);
    for (const m of rows) {
      grid.appendChild(matchCard(m, {
        tone: 'bad',
        controls: qualificationControl(m, (to) => routeAfterQualification(m, to)),
        actions: [
          { label: 'View the mandate', primary: true, run: () => openMandate(m) }
        ].concat(verdictActions(m, (to) => {
          if (to === 'rejected') { all = null; load(); } else { routeAfterQualification(m, to); }
        }))
      }));
    }
    out.appendChild(el('p', { class: 'mono',
      style: 'color:var(--ink-3);font-size:12px;margin-top:18px' },
      'Showing ' + rows.length + ' of ' + pool.length
      + (tone === 'news' ? ' set aside' : ' rejected mandates')
      + (tone === 'all' ? '. The counts on the filters overlap \u2014 a mandate that missed on three criteria is counted under all three.' : '')));
  }

  function load() {
    clear(out);
    fill(out, () => readRows('wi_mandates',
      'select=*&' + VERDICT_REJECTED + '&order=id.desc&limit=5000',
      'wi.mandates.list', {}), (rows) => {
      all = dedupeInvestors(rows);
      paintChips();
      if (!rows.length) {
        return out.appendChild(empty('Nothing rejected', 'Everything screened is still in play.'));
      }
      paint();
    });
  }
  load();
};

RENDER.meetings = function (body) {
  clear(body);

  let filter = 'live';
  const VIEWS = [['new', 'Schedule a meeting'], ['live', 'Upcoming'],
                 ['scheduled', 'Scheduled'], ['pending', 'Not issued yet'],
                 ['cancelled', 'Cancelled'], ['all', 'Everything']];
  const chips = el('div', { class: 'chips' });
  function drawChips() {
    clear(chips);
    for (const [k, lbl] of VIEWS) {
      chips.appendChild(el('button', {
        class: 'chip' + (filter === k ? ' on' : ''),
        onclick: () => { filter = k; drawChips(); run(); }
      }, lbl));
    }
  }
  drawChips();
  body.appendChild(chips);

  const mTitle = el('input', { class: 'search', placeholder: 'What is the meeting? e.g. TMS review with Pictet' });
  const mWhen  = el('input', { class: 'search', type: 'datetime-local' });
  const mMins  = el('input', { class: 'search', type: 'number', value: '30', min: '15', step: '15' });
  const mTz = el('select', { class: 'search' });
  for (const [v] of ZOOM_TIMEZONES) mTz.appendChild(el('option', { value: v }, timezoneLabel(v)));
  mTz.value = isZoomTimezone('Europe/Zurich') ? 'Europe/Zurich' : defaultTimezone();   // Geneva time by default
  const mTzNote = el('div', { style: 'font-size:12px;color:var(--ink-3);margin:-4px 0 10px;line-height:1.5' });
  // Says which zone the picker's time is in, then the same moment in Geneva,
  // Cairo and London, so nobody books an hour out. Display only: the booking
  // still uses the Timezone chosen above.
  function drawTzNote() {
    const tz = mTz.value || 'UTC';
    const n = teamZonesNote(mWhen.value, tz);
    clear(mTzNote);
    mTzNote.appendChild(el('b', { style: 'font-weight:600;color:var(--ink-2)' }, n.label));
    mTzNote.appendChild(document.createTextNode(n.line ? '  \u00B7  ' + n.line
      : '  \u00B7  pick a date and time to see it in Geneva, Cairo and London.'));
  }
  mTz.addEventListener('change', drawTzNote);
  mWhen.addEventListener('input', drawTzNote);
  mWhen.addEventListener('change', drawTzNote);
  drawTzNote();

  const firefliesBox = (id) => {
    const box = el('input', { type: 'checkbox', id });
    const label = el('label', { for: id,
      style: 'display:flex;gap:7px;align-items:center;font-size:13px;color:var(--ink-2);margin:4px 0 8px' },
      box, 'Add Fireflies notetaker (records and transcribes the meeting)');
    return { box, label };
  };
  const firefliesText = (st) => st === 'on' ? 'Fireflies: on'
    : st && st.startsWith('not invited') ? 'Fireflies: not invited \u2014 ' + st.replace(/^not invited:\s*/, '')
    : 'Fireflies: off';
  const { box: mFireflies, label: mFirefliesLbl } = firefliesBox('mtg-fireflies');

  const mProv  = el('select', { class: 'search' });
  for (const [v, l] of MEETING_PROVIDERS) mProv.appendChild(el('option', { value: v }, l));
  mProv.value = meetingProvider;
  mProv.addEventListener('change', () => { meetingProvider = mProv.value; });

  const mLang = el('select', { class: 'search' });
  for (const [v, l] of MEETING_LANGUAGES) mLang.appendChild(el('option', { value: v }, l));
  mLang.value = meetingLanguage;
  mLang.addEventListener('change', () => { meetingLanguage = mLang.value; });

  const mFor = el('input', { class: 'search',
    placeholder: 'Start typing a name, or write one that is not in the book' });
  const mForSugg = el('div', { class: 'chips' });

  let ft = null;
  mFor.addEventListener('input', () => { clearTimeout(ft); ft = setTimeout(nameLookup, 250); });

  async function nameLookup() {
    const q = mFor.value.trim();
    clear(mForSugg);
    if (q.length < 2 || DEMO) return;
    try {
      const t = lk(q);
      const rows = await readRows('contacts_app',
        'select=id,name,company&limit=6&or=(name.ilike.' + t + ',company.ilike.' + t + ')',
        'contacts.search', { q: q, filter: 'all' });
      for (const c of rows) {
        if (!c.name) continue;
        mForSugg.appendChild(el('button', { class: 'chip',
          onclick: () => { mFor.value = c.name; clear(mForSugg); } },
          c.name + (c.company ? '  \u00B7  ' + c.company : '')));
      }
    } catch (_) { /* suggestions are a convenience; typing still works */ }
  }
  const mLook  = el('input', { class: 'search',
    placeholder: 'Type a name or an address \u2014 anyone added here is emailed the invitation' });
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
      const t = lk(q);
      const rows = await readRows('contacts_app',
        'select=id,name,company,email&limit=6&or=(name.ilike.' + t + ',company.ilike.' + t + ')',
        'contacts.search', { q: q, filter: 'all' });
      if (!rows.length) {
        return mSugg.appendChild(el('span', { style: 'font-size:12px;color:var(--ink-3)' },
          'Nobody by that name. Type the address itself and press Add.'));
      }
      let offered = 0;
      for (const c of rows) {
        if (!c.email) continue;
        offered++;
        mSugg.appendChild(el('button', { class: 'chip', onclick: () => add(c) },
          c.email + (c.name ? '  \u00B7  ' + c.name : '')));
      }
      if (!offered) {
        mSugg.appendChild(el('span', { style: 'font-size:12px;color:var(--ink-3)' },
          'Nobody by that name has an address on file. Type the address itself and press Add.'));
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

  const bookBtn = el('button', { class: 'btn', onclick: () => book(true) },
    'Schedule and send the invitation');
  const linkBtn = el('button', { class: 'btn btn-quiet', onclick: () => book(false) },
    'Just get me a link');
  const emailBtn = el('button', { class: 'btn', onclick: () => book(false, { openEmail: true }) },
    '\u2709 Send an email');
  const issued = el('div');

  async function book(sendInvites, opts) {
    if (!mTitle.value.trim()) return toast('Give the meeting a title.', true);
    if (!mWhen.value) return toast('Pick a date and time.', true);

    const provider = mProv.value || 'zoom';
    const label = (MEETING_PROVIDERS.find(p => p[0] === provider) || ['', provider])[1];
    const payload = {
      provider:     provider,
      title:        mTitle.value.trim(),
      start_utc:    zonedTimeToUtc(mWhen.value, mTz.value || 'UTC'),
      duration_min: Number(mMins.value) || 30,
      tz:           mTz.value || 'UTC',
      to_people:    invited,
      send_invitations: sendInvites !== false && invited.length > 0,
      language:     mLang.value || 'en',
      invitee_name: mFor.value.trim(),
      add_fireflies: mFireflies.checked === true
    };

    const pressed = (opts && opts.openEmail) ? emailBtn
                  : (sendInvites === false ? linkBtn : bookBtn);
    const pressedLabel = pressed.textContent;
    bookBtn.disabled = true; linkBtn.disabled = true; emailBtn.disabled = true;
    pressed.textContent = 'Creating the meeting\u2026';
    clear(issued);
    try {
      const r = await createMeeting(payload) || {};
      const url = r.join_url || r.meet_url || r.url || null;
      if (url) {
        showLink(label, url, r.passcode, r.message, r.invited,
          buildGcalUrl(payload.title, payload.start_utc, payload.duration_min, url),
          { meeting_id: r.meeting_id || r.id, title: payload.title, start_utc: payload.start_utc,
            duration_min: payload.duration_min, tz: payload.tz, provider: payload.provider,
            fireflies: r.fireflies || 'off' },
          opts && opts.openEmail);
        if (r.time_warning) toast(r.time_warning, true);
        else if (payload.add_fireflies && r.fireflies !== 'on') toast('Meeting created, but ' + firefliesText(r.fireflies || 'not invited: no answer from the server'), true);
        else toast(label + ' meeting created.');
      } else {
        showPending(label, r.message || 'The gateway did not return a join link.');
        toast('Booked, but no link came back.', true);
      }
      mTitle.value = ''; mWhen.value = ''; mFor.value = ''; mFireflies.checked = false;
      clear(mForSugg); invited = []; drawInvited(); drawTzNote();
      run();
    } catch (e) {
      try {
        await supaInsert('crm_meetings', {
          title:        payload.title,
          start_utc:    payload.start_utc,
          duration_min: payload.duration_min,
          tz:           payload.tz,
          to_people:    payload.to_people,
          provider:     payload.provider,
          status:       'pending'
        });
        showPending(label, e.message);
        toast('Saved without a link \u2014 ' + e.message, true);
        mTitle.value = ''; mWhen.value = ''; mFireflies.checked = false; invited = []; drawInvited(); drawTzNote();
        run();
      } catch (e2) {
        toast(e2.message, true);
      }
    } finally {
      bookBtn.disabled = false; linkBtn.disabled = false; emailBtn.disabled = false;
      pressed.textContent = pressedLabel;
    }
  }

  function buildGcalUrl(title, startIso, minutes, joinUrl) {
    const s = new Date(startIso);
    if (isNaN(s.getTime())) return '';
    const e = new Date(s.getTime() + (Number(minutes) || 30) * 60000);
    const z = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    return 'https://calendar.google.com/calendar/render?action=TEMPLATE'
      + '&text=' + encodeURIComponent(title || 'Meeting')
      + '&dates=' + z(s) + '/' + z(e)
      + '&details=' + encodeURIComponent('Join: ' + (joinUrl || ''))
      + '&location=' + encodeURIComponent(joinUrl || '');
  }

  function showLink(label, url, passcode, message, invited, calUrl, meta, autoEmail) {
    clear(issued);
    issued.appendChild(el('div', { class: 'callout good', style: 'margin-top:14px' },
      el('span', { class: 'callout-k' }, label),
      el('span', { class: 'callout-v', style: 'word-break:break-all' }, url)));
    const ffLine = el('span', null, firefliesText(meta && meta.fireflies));
    if (meta && meta.start_utc) {
      issued.appendChild(el('p', { style: 'margin:6px 0 0;font-size:13px;color:var(--ink-2)' },
        'Starts ' + fmtInZone(meta.start_utc, meta.tz) + '  \u00B7  ', ffLine));
    }
    if (passcode) {
      issued.appendChild(el('p', { style: 'margin:6px 0 0;font-size:13px;color:var(--ink-2)' },
        'Passcode ' + passcode));
    }
    issued.appendChild(el('div', { class: 'acts' },
      el('button', { class: 'btn btn-sm', onclick: () => copy(url, 'Link') }, 'Copy the link'),
      el('button', { class: 'btn btn-sm btn-quiet',
        onclick: () => window.open(url, '_blank', 'noopener,noreferrer') }, 'Open it'),
      calUrl ? el('button', { class: 'btn btn-sm', style: 'background:#1a73e8;border-color:#1a73e8;color:#fff',
        onclick: () => window.open(calUrl, '_blank', 'noopener,noreferrer') }, 'Add to Google Calendar') : null));

    let draftBox = null;
    if (message) {
      issued.appendChild(el('p', { style: 'margin:18px 0 6px;font-size:11px;letter-spacing:.14em;'
        + 'text-transform:uppercase;color:var(--ink-3)' },
        invited ? 'Sent to ' + invited : 'The invitation \u2014 edit it, then send or copy'));
      draftBox = el('textarea', { style: 'width:100%;min-height:220px;padding:13px 15px;'
        + 'font:inherit;font-size:13.5px;line-height:1.6;border:1px solid var(--rule);'
        + 'border-radius:6px;background:var(--card);color:var(--ink);resize:vertical' });
      draftBox.value = message;
      issued.appendChild(draftBox);
      issued.appendChild(el('div', { class: 'acts' },
        el('button', { class: 'btn btn-sm', onclick: () => copy(draftBox.value, 'Message') },
          'Copy the message'),
        el('button', { class: 'btn btn-sm btn-quiet',
          onclick: () => { draftBox.value = message; toast('Back to the original.'); } }, 'Reset')));
    }

    if (meta && meta.meeting_id) {
      const contactNames = {};
      const nameToEmail = {};
      const book = [];
      const learn = (r) => {
        if (!r || !r.email) return;
        const em = String(r.email).toLowerCase().trim();
        if (!book.some((b) => b.email === em)) book.push({ email: em, name: r.name || '' });
        if (r.name) {
          contactNames[em] = r.name;
          nameToEmail[String(r.name).toLowerCase().replace(/\s+/g, ' ').trim()] = em;
        }
      };
      readRows('contacts_app', 'select=email,name&email=not.is.null&order=name.asc&limit=800', 'contacts.emails', {})
        .then((rows) => { (rows || []).forEach(learn); })
        .catch(() => {});

      const wrap = el('div', { style: 'margin-top:18px;border-top:1px solid var(--rule);padding-top:14px' });
      const panel = el('div', { style: 'display:none;margin-top:12px' });
      wrap.appendChild(el('button', { class: 'btn btn-sm', onclick: () => {
        panel.style.display = (panel.style.display === 'none') ? '' : 'none';
      } }, '\u2709 Send an email'));
      wrap.appendChild(panel);
      issued.appendChild(wrap);
      if (autoEmail) { panel.style.display = ''; setTimeout(() => { try { wrap.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (_) {} }, 60); }

      const field = (ph) => {
        const input = el('input', { class: 'search', placeholder: ph, style: 'margin:0', autocomplete: 'off' });
        const sugg = el('div', { class: 'chips', style: 'margin:6px 0 0' });
        let t = null, seq = 0;
        const current = () => {
          const v = input.value;
          const cut = Math.max(v.lastIndexOf(','), v.lastIndexOf(';'), v.lastIndexOf('\n'));
          return { head: v.slice(0, cut + 1), term: v.slice(cut + 1).trim() };
        };
        const pick = (email) => {
          const { head } = current();
          input.value = (head ? head.replace(/\s*$/, ' ') : '') + email + ', ';
          clear(sugg); input.focus();
          input.dispatchEvent(new Event('change'));
        };
        const draw = (term, extra) => {
          clear(sugg);
          if (!term) return;
          const q = term.toLowerCase();
          const already = input.value.toLowerCase();
          const hits = [];
          for (const c of book.concat(extra || [])) {
            if (hits.length >= 6) break;
            if (!c.email || hits.some((h) => h.email === c.email)) continue;
            if (already.includes(c.email + ',')) continue;
            if (c.email.includes(q) || String(c.name || '').toLowerCase().includes(q)) hits.push(c);
          }
          for (const c of hits) {
            sugg.appendChild(el('button', { class: 'chip', type: 'button',
              onclick: () => pick(c.email) },
              c.email + (c.name ? '  \u00B7  ' + c.name : '')));
          }
        };
        const suggest = () => {
          const { term } = current();
          draw(term);
          clearTimeout(t);
          if (term.length < 2 || DEMO) return;
          const mine = ++seq;
          t = setTimeout(async () => {
            try {
              const k = lk(term);
              const rows = await readRows('contacts_app',
                'select=email,name&email=not.is.null&limit=8&or=(name.ilike.' + k + ',email.ilike.' + k + ',company.ilike.' + k + ')',
                'contacts.search', { q: term, filter: 'all' });
              (rows || []).forEach(learn);
              if (mine === seq) draw(current().term);
            } catch (_) { /* suggestions are a convenience; typing still works */ }
          }, 250);
        };
        input.addEventListener('input', suggest);
        input.addEventListener('focus', suggest);
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' && sugg.firstChild) { e.preventDefault(); sugg.firstChild.click(); }
          else if (e.key === 'Escape') clear(sugg);
        });
        input.sugg = sugg;
        return input;
      };
      const toI = field('To \u2014 names or emails, comma-separated');
      const ccI = field('CC (optional)');
      const bccI = field('BCC (optional)');
      if (invited) toI.value = invited + ', ';
      const subjI = el('input', { class: 'search', style: 'margin:0', value: 'Invitation: ' + (meta.title || 'Meeting') });
      const lbl = (t, n) => el('div', null,
        el('label', { class: 'field', style: 'margin-top:8px' }, el('span', null, t), n), n.sugg || null);
      const resolveList = (s) => {
        const emails = [], unresolved = [], seen = {};
        for (const raw of String(s || '').split(/[,;\n]+/)) {
          const e = raw.trim();
          if (!e) continue;
          if (/.+@.+\..+/.test(e)) {
            const em = e.toLowerCase();
            if (!seen[em]) { seen[em] = 1; emails.push(em); }
          } else {
            const hit = nameToEmail[e.toLowerCase().replace(/\s+/g, ' ').trim()];
            if (hit) { if (!seen[hit]) { seen[hit] = 1; emails.push(hit); } }
            else unresolved.push(e);
          }
        }
        return { emails, unresolved };
      };
      const parse = (s) => resolveList(s).emails;

      let lastGreeting = '';
      const firstName = () => {
        const first = (parse(toI.value)[0] || '').toLowerCase();
        if (!first) return '';
        let nm = contactNames[first] || first.split('@')[0].replace(/[._+-]+/g, ' ');
        nm = String(nm).trim().split(/\s+/)[0] || '';
        return nm ? nm.charAt(0).toUpperCase() + nm.slice(1) : '';
      };
      const personalise = () => {
        if (!draftBox) return;
        const nm = firstName();
        if (!nm) return;
        const lines = draftBox.value.split('\n');
        const opener = (lines[0] || '').trim();
        if (/^(Hello|Bonjour)\b.*,?$/.test(opener) && (lastGreeting === '' || opener === lastGreeting)) {
          const fr = /^Bonjour\b/.test(opener);
          lines[0] = (fr ? 'Bonjour ' : 'Hello ') + nm + ',';
          lastGreeting = lines[0];
          draftBox.value = lines.join('\n');
        }
      };
      toI.addEventListener('change', personalise);
      toI.addEventListener('blur', personalise);

      panel.appendChild(lbl('To', toI));
      panel.appendChild(lbl('CC', ccI));
      panel.appendChild(lbl('BCC', bccI));
      panel.appendChild(lbl('Subject', subjI));
      const ffNote = el('div', { style: 'font-size:12px;color:var(--ink-3);margin:10px 0 0' });
      const ff = firefliesBox('mtg-email-fireflies');
      const drawFf = () => {
        const on = meta.fireflies === 'on';
        ff.label.style.display = on ? 'none' : 'flex';
        ffNote.textContent = on ? 'Fireflies: on \u2014 already invited to this meeting.' : '';
        ffLine.textContent = firefliesText(meta.fireflies);
      };
      drawFf();
      panel.appendChild(ff.label);
      panel.appendChild(ffNote);
      panel.appendChild(el('div', { style: 'font-size:12px;color:var(--ink-3);margin:10px 0 2px' },
        draftBox ? 'The message above is what will be sent \u2014 edit it there before sending.'
                 : 'A short invitation will be sent.'));
      panel.appendChild(el('div', { style: 'font-size:12px;color:var(--ink-3);margin:0 0 4px' },
        '\uD83D\uDCC5 A calendar invite (.ics) is attached, so it lands in their calendar.'));

      const sendNow = el('button', { class: 'btn btn-sm' }, 'Send from nada.osama@taranis.net');
      sendNow.onclick = async () => {
        const toR = resolveList(toI.value), ccR = resolveList(ccI.value), bccR = resolveList(bccI.value);
        const to = toR.emails, cc = ccR.emails, bcc = bccR.emails;
        const unresolved = toR.unresolved.concat(ccR.unresolved, bccR.unresolved);
        if (unresolved.length) {
          toast('No email found for: ' + unresolved.join(', ') + '. Pick them from the suggestions or type their address.', true);
          return;
        }
        if (!to.length && !cc.length && !bcc.length) { toast('Add at least one recipient.', true); return; }
        personalise();
        sendNow.disabled = true; sendNow.textContent = 'Sending\u2026';
        try {
          const r = await createMeeting({
            meeting_id: String(meta.meeting_id), provider: meta.provider,
            title: meta.title, start_utc: meta.start_utc, duration_min: meta.duration_min, tz: meta.tz,
            to_people: to.map((e) => ({ email: e })), cc: cc, bcc: bcc,
            invitee_name: firstName(),
            subject: subjI.value, body: draftBox ? draftBox.value : (message || ''),
            attach_ics: true, send_invitations: true,
            add_fireflies: ff.box.checked === true
          }) || {};
          const askedFf = ff.box.checked;
          if (r.fireflies) meta.fireflies = r.fireflies === 'on' ? 'on' : meta.fireflies;
          ff.box.checked = false; drawFf();
          if (askedFf && r.fireflies !== 'on') toast('Sent, but ' + firefliesText(r.fireflies || 'not invited: no answer from the server'), true);
          for (const e of to.concat(cc, bcc)) { try { await supaInsert('contacts', { email: e }); } catch (_) {} }
          if (r.emailed === false && r.email_status) {
            toast('Meeting saved, but the email did not send: ' + r.email_status, true);
          } else if (askedFf && r.fireflies !== 'on') {
            panel.style.display = 'none';
          } else {
            toast('Sent, with the calendar invite attached.');
            panel.style.display = 'none';
          }
        } catch (err) { toast(err.message, true); sendNow.disabled = false; sendNow.textContent = 'Send from nada.osama@taranis.net'; }
      };
      panel.appendChild(el('div', { class: 'acts', style: 'margin-top:12px' }, sendNow));
    }
  }

  function showPending(label, why) {
    clear(issued);
    issued.appendChild(el('div', { class: 'callout signal', style: 'margin-top:14px' },
      el('span', { class: 'callout-k' }, 'No link yet'),
      el('span', { class: 'callout-v' },
        'The meeting is in the diary, but ' + label + ' did not issue a link. ' + (why || ''))));
  }

  const lbl = (t, n) => el('label', { class: 'field' }, el('span', null, t), n);
  const form = el('div', { style: 'max-width:900px;margin:0 0 24px' },
    el('div', { class: 'grid2' }, lbl('Title', mTitle), lbl('When', mWhen)),
    el('div', { class: 'grid2' }, lbl('Minutes', mMins), lbl('Time zone', mTz)),
    mTzNote,
    el('div', { class: 'grid2' }, lbl('Platform', mProv), lbl('Invitation language', mLang)),
    mFirefliesLbl,
    lbl('Address the message to', mFor), mForSugg,
    el('div', { class: 'acts', style: 'margin-top:16px' }, linkBtn, emailBtn),
    issued);
  body.appendChild(form);

  const out = el('div');
  body.appendChild(out);

  function people(m) {
    let p = m.to_people;
    if (typeof p === 'string') { try { p = JSON.parse(p); } catch (_) { p = []; } }
    if (!Array.isArray(p)) return '';
    return p.map(x => (x && (x.name || x.email)) || x).filter(Boolean).join(', ');
  }

  function run() {
    form.style.display = filter === 'new' ? '' : 'none';
    out.style.display  = filter === 'new' ? 'none' : '';
    if (filter === 'new') { clear(out); return; }

    busy(out);

    let sel = 'select=*&order=start_utc.desc&limit=200';
    if (filter === 'live')          sel += '&status=eq.scheduled&start_utc=gte.' + new Date(Date.now() - 36e5).toISOString();
    else if (filter !== 'all')      sel += '&status=eq.' + filter;

    fill(out, () => readRows('crm_meetings', sel, 'zoom.upcoming', {}), (rows) => {
      if (!rows.length) {
        return out.appendChild(empty(
          filter === 'pending' ? 'Nothing waiting'
            : filter === 'cancelled' ? 'Nothing cancelled' : 'Nothing booked',
          filter === 'live'
            ? 'Meetings already scheduled and still ahead of you appear here. '
              + 'Press Schedule a meeting to book one.'
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
            ['platform ', providerLabel(m.provider)],
            ['starts   ', m.start_utc ? fmtInZone(m.start_utc, m.tz) : null],
            ['minutes  ', m.duration_min],
            ['zone     ', m.tz ? timezoneLabel(m.tz, m.start_utc) : null],
            ['fireflies', m.fireflies === true ? 'on' : 'off'],
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
            m.meet_url ? { label: 'Copy the link', run: () => copy(m.meet_url, 'Link') } : null,
            m.invitation_body ? { label: 'Invitation',
              run: () => invitationSheet(Object.assign({}, m, { to_csv_display: people(m) })) } : null,
            st !== 'cancelled' ? { label: 'Cancel it',
              run: async () => {
                const label = providerLabel(m.provider) || 'the meeting';
                if (!confirm('Cancel this meeting? It is removed from ' + label
                  + ' as well, so the join link stops working.')) return;
                toast('Cancelling\u2026');
                try {
                  const r = await createMeeting({ action: 'cancel', meeting_id: String(m.id) }) || {};
                  toast(r.ok ? 'Cancelled.'
                             : (r.message || 'Cancelled here, but the platform refused.'),
                        !r.ok);
                  run();
                } catch (e) { toast(e.message, true); }
              } } : null,
            (st === 'pending' || !m.meet_url) ? { label: 'Issue the link', primary: true,
              run: () => {
                const label = providerLabel(m.provider) || 'the meeting';
                const ff = firefliesBox('mtg-issue-fireflies');
                const go = el('button', { class: 'btn btn-sm', onclick: async () => {
                  closeSheet();
                  toast('Creating\u2026');
                  try {
                    const r = await createMeeting({
                      meeting_id: String(m.id), provider: m.provider || meetingProvider,
                      title: m.title, start_utc: m.start_utc,
                      duration_min: m.duration_min, tz: m.tz,
                      to_people: m.to_people || [],
                      add_fireflies: ff.box.checked === true }) || {};
                    const url = r.join_url || r.meet_url || r.url;
                    if (url && ff.box.checked && r.fireflies !== 'on') {
                      toast('Created, but ' + firefliesText(r.fireflies || 'not invited: no answer from the server'), true);
                    } else {
                      toast(url ? 'Created. The invitation is on its way.'
                                : 'Booked, but no link came back.', !url);
                    }
                    run();
                  } catch (e) { toast(e.message, true); }
                } }, 'Create and send');
                sheet('Issue the link', [
                  el('p', { style: 'margin:0 0 10px;font-size:14px' },
                    'Create ' + label + ' and email the invitation to everyone on it?'),
                  ff.label
                ], [
                  el('button', { class: 'btn btn-sm btn-quiet', onclick: closeSheet }, 'Cancel'),
                  go
                ]);
              } } : null
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
  const replace = el('input', { type: 'checkbox', id: 'doc-replace' });
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
      el('label', { style: 'display:flex;gap:7px;align-items:center;font-size:13.5px;color:var(--ink-2)' },
        replace, 'Replace what is there'),
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

    const safe = picked.name.replace(/[^A-Za-z0-9._-]+/g, '-');
    const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
    const label = version.value.trim();
    const path = kind.value + '/' + (period.value || new Date().toISOString().slice(0, 7)) + '/' +
                 (label || stamp) + '-' + safe;

    send.disabled = true; send.textContent = 'Uploading…';
    prog.style.display = 'block';
    try {
      await uploadToStorage(picked, path, (pc) => { prog.firstChild.style.width = pc + '%'; },
        replace.checked);
      send.textContent = 'Filing…';
      const pub = CFG.supabaseUrl + '/storage/v1/object/public/documents/' + encodeURI(path);
      const row = {
        doc_key:       kind.value,
        title:         title.value.trim(),
        version_label: label || null,
        period_date:   (period.value || new Date().toISOString().slice(0, 7)) + '-01',
        storage_path:  path,
        public_url:    pub,
        is_current:    !!current.checked
      };
      try {
        if (current.checked) {
          await supaPatch('documents', 'doc_key=eq.' + encodeURIComponent(kind.value)
            + '&is_current=is.true', { is_current: false });
        }
        await supaInsert('documents', row);
      } catch (err) {
        if (err.message === 'NO_SUPABASE') throw err;
        await callGateway('docs.upload', {
          storage_path: path,
          doc_key: kind.value,
          title: title.value.trim(),
          version_label: label || null,
          period_date: row.period_date,
          make_current: !!current.checked
        });
      }
      toast('Uploaded. The team has been told.');
      go('docs');
    } catch (e) {
      toast(e.message, true);
    } finally {
      send.disabled = false; send.textContent = 'Upload and announce';
      prog.style.display = 'none'; prog.firstChild.style.width = '0';
    }
  });

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
      actions: x.public_url ? [
        { label: 'View the report', primary: true,
          run: () => window.open(x.public_url, '_blank', 'noopener,noreferrer') },
        { label: 'Copy the link', run: () => copy(x.public_url) }
      ] : []
    }));
  });
};

RENDER.hfn = function (body) {
  clear(body);

  let picked = null;

  const input = el('input', { type: 'file', id: 'hfn-file', accept: '.pdf' });
  const drop = el('label', { class: 'drop', for: 'hfn-file' },
    input,
    el('h4', null, 'File a report'),
    el('p', null, 'Drop a PDF here, or click to choose one. Up to 50 MB. '
      + 'It is filed under the folder selected above.'));

  const folders = el('div', { class: 'chips', style: 'margin-bottom:14px' });
  const fBtn = {};
  for (const [key, label] of HFN_FOLDERS) {
    fBtn[key] = el('button', { class: 'chip',
      onclick: () => { hfnFolder = key; go('hfn'); } }, label);
    folders.appendChild(fBtn[key]);
  }
  body.appendChild(folders);

  const chosen  = el('div');
  const title   = el('input', { class: 'search', placeholder: 'Title, e.g. Hedge Fund Alert — August 2026' });
  const pubName = el('input', { class: 'search', placeholder: 'Publisher, e.g. With Intelligence' });
  const issue   = el('input', { class: 'search', type: 'date' });
  issue.value = new Date().toISOString().slice(0, 10);
  const send    = el('button', { class: 'btn' }, 'File it');
  const prog    = el('div', { class: 'bar' }, el('i'));
  prog.style.display = 'none';

  body.append(
    drop, chosen,
    el('div', { class: 'grid2', style: 'margin-top:12px' }, title, pubName),
    el('div', { class: 'grid2', style: 'margin-top:10px' }, issue, send),
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
    if (DEMO) return toast('Sample data - connect Supabase to file a newsletter.', true);

    const safe  = picked.name.replace(/[^A-Za-z0-9._-]+/g, '-');
    const when  = issue.value || new Date().toISOString().slice(0, 10);
    const stamp = Date.now().toString(36);
    const slug  = (HFN_FOLDERS.find(f => f[0] === hfnFolder) || HFN_FOLDERS[0])[2];
    const path  = 'newsletters/' + slug + '/' + when.slice(0, 7)
                + '/' + when + '-' + stamp + '-' + safe;

    send.disabled = true; send.textContent = 'Uploading…';
    prog.style.display = 'block';
    try {
      await uploadToStorage(picked, path, (pc) => { prog.firstChild.style.width = pc + '%'; }, false);
      send.textContent = 'Filing…';
      await supaInsert('hf_newsletters', {
        title:        title.value.trim(),
        publisher:    pubName.value.trim() || null,
        issue_date:   issue.value || null,
        report_type:  hfnFolder,
        storage_path: path,
        public_url:   CFG.supabaseUrl + '/storage/v1/object/public/documents/' + encodeURI(path),
        filename:     picked.name,
        size_bytes:   picked.size,
        mime:         picked.type || 'application/pdf',
        uploaded_by:  (session && session.email) || null
      });
      toast('Filed. The summary appears here once it has been read.');
      go('hfn');
    } catch (e) {
      toast(e.message, true);
    } finally {
      send.disabled = false; send.textContent = 'File it';
      prog.style.display = 'none'; prog.firstChild.style.width = '0';
    }
  });

  const list = el('div', { style: 'margin-top:26px' });
  body.appendChild(list);
  list.appendChild(el('p', { class: 'mono', style: 'color:var(--ink-3);font-size:12px' }, 'Loading…'));

  fill(list, async () => {
    if (DEMO) return [];
    return await supaSelect('hf_newsletters',
      'select=id,title,publisher,issue_date,public_url,summary,key_points,allocator_signals,'
      + 'managers_mentioned,relevance,summary_status,summary_error,summary_attempts,'
      + 'uploaded_at,storage_path,was_truncated,report_type'
      + '&report_type=eq.' + encodeURIComponent(hfnFolder)
      + '&order=issue_date.desc.nullslast,uploaded_at.desc&limit=40');
  }, (rows) => {
    for (const [key, label] of HFN_FOLDERS) {
      const on = key === hfnFolder;
      fBtn[key].style.borderColor = on ? 'var(--accent)' : '';
      fBtn[key].style.color       = on ? 'var(--accent)' : '';
      fBtn[key].style.fontWeight  = on ? '600' : '';
      fBtn[key].textContent = on ? label + '  ' + rows.length : label;
    }
    if (!rows.length) {
      return list.appendChild(empty('Nothing in this folder yet',
        'Whatever you file above appears here, with its summary beside it.'));
    }

    const jarr = (v) => {
      let x = v;
      for (let i = 0; i < 2 && typeof x === 'string'; i++) { try { x = JSON.parse(x); } catch (_) { x = []; } }
      return Array.isArray(x) ? x.map(s => String(s).trim()).filter(Boolean) : [];
    };

    rows = rows.slice().sort((a, b) => {
      const da = a.issue_date || '', db = b.issue_date || '';
      if (da !== db) return da < db ? 1 : -1;
      return String(b.uploaded_at || '').localeCompare(String(a.uploaded_at || ''));
    });

    const heading = (t) => el('p', { class: 'mono',
      style: 'font-size:10px;letter-spacing:.14em;text-transform:uppercase;'
           + 'color:var(--ink-3);margin:20px 0 8px' }, t);
    const bullets = (arr) => {
      const d = el('div', { class: 'ev' });
      for (const x of arr) {
        d.appendChild(el('div', null,
          el('span', { class: 'k' }, '\u2014  '), document.createTextNode(x)));
      }
      return d;
    };

    function summarySheet(r) {
      const signals  = jarr(r.allocator_signals);
      const points   = jarr(r.key_points);
      const managers = jarr(r.managers_mentioned);
      const inner = el('div', { style: 'min-width:min(720px,74vw)' });

      const meta = [r.publisher,
                    r.issue_date ? fmtDate(r.issue_date) : null,
                    r.relevance ? r.relevance + ' relevance' : null,
                    r.was_truncated ? 'long issue, front section only' : null]
        .filter(Boolean).join('   \u00B7   ');
      if (meta) {
        inner.appendChild(el('p', { class: 'mono',
          style: 'font-size:12px;color:var(--ink-3);margin:0 0 18px' }, meta));
      }

      for (const p of String(r.summary || '').split(/\n{2,}/).map(s => s.trim()).filter(Boolean)) {
        inner.appendChild(el('p', { style: 'margin:0 0 13px;line-height:1.6' }, p));
      }

      const fo = (r.report_type || 'hedge_fund') === 'family_office';
      if (signals.length)  { inner.appendChild(heading(fo ? 'Offices worth approaching' : 'Someone is allocating'));
                             inner.appendChild(bullets(signals)); }
      if (points.length)   { inner.appendChild(heading(fo ? 'Who they are' : 'Key points'));
                             inner.appendChild(bullets(points)); }
      if (managers.length) { inner.appendChild(heading(fo ? 'Managers they already use' : 'Managers named'));
                             inner.appendChild(bullets([managers.join(', ')])); }

      const foot = [el('button', { class: 'btn btn-quiet', onclick: closeSheet }, 'Close')];
      if (r.public_url) {
        foot.push(el('button', { class: 'btn',
          onclick: () => window.open(r.public_url, '_blank', 'noopener,noreferrer') }, 'Open the PDF'));
      }
      sheet(r.title || 'Summary', [inner], foot);
    }

    function newsletterSheet(r) {
      const t = el('input', { class: 'search', value: r.title || '' });
      const p = el('input', { class: 'search', value: r.publisher || '' });
      const d = el('input', { class: 'search', type: 'date', value: r.issue_date || '' });
      const fold = el('select', { class: 'search' });
      for (const [key, label] of HFN_FOLDERS) {
        const o = el('option', { value: key }, label);
        if ((r.report_type || 'hedge_fund') === key) o.selected = true;
        fold.appendChild(o);
      }
      const again = el('input', { type: 'checkbox' });

      const inner = el('div', { style: 'min-width:min(560px,74vw)' },
        el('label', { class: 'field' }, el('span', null, 'Title'), t),
        el('label', { class: 'field' }, el('span', null, 'Publisher'), p),
        el('label', { class: 'field' }, el('span', null, 'Issue date'), d),
        el('label', { class: 'field' }, el('span', null, 'Folder'), fold),
        el('p', { class: 'mono', style: 'font-size:12px;color:var(--ink-3);margin:10px 0 0' },
          'The issue date is what orders this list. It defaults to the day you filed '
          + 'the report, which is right for the current issue and wrong for a back one.'),
        el('label', { style: 'display:flex;gap:8px;align-items:center;margin-top:16px;'
             + 'font-size:13.5px;color:var(--ink-2)' },
          again, 'Read it again after saving'));

      const del = el('button', { class: 'btn btn-sm btn-quiet',
        style: 'color:var(--bad);border-color:var(--bad)' }, 'Delete');
      del.addEventListener('click', async () => {
        if (!confirm('Delete "' + (r.title || 'this report') + '"? The summary goes with '
          + 'it and the PDF is removed from storage. This cannot be undone.')) return;
        try {
          await supaDelete('hf_newsletters', 'id=eq.' + encodeURIComponent(r.id));
          let orphan = false;
          if (r.storage_path) {
            try { await deleteFromStorage(r.storage_path); } catch (_) { orphan = true; }
          }
          closeSheet();
          toast(orphan
            ? 'Deleted, but the PDF is still in storage \u2014 run migration 5 to allow that.'
            : 'Deleted.', orphan);
          go('hfn');
        } catch (e) { toast(e.message, true); }
      });

      const save = el('button', { class: 'btn btn-sm' }, 'Save changes');
      save.addEventListener('click', async () => {
        const patch = {
          title: t.value.trim() || r.title,
          publisher: p.value.trim() || null,
          issue_date: d.value || null,
          report_type: fold.value
        };
        if (again.checked) {
          patch.summary_status = 'pending';
          patch.summary_attempts = 0;
          patch.summary_error = null;
        }
        try {
          await supaPatch('hf_newsletters', 'id=eq.' + encodeURIComponent(r.id), patch);
          closeSheet();
          toast(again.checked ? 'Saved. It will be read again within the half hour.' : 'Saved.');
          go('hfn');
        } catch (e) { toast(e.message, true); }
      });

      sheet('Edit ' + (r.title || 'report'), [inner],
        [del, el('button', { class: 'btn btn-sm btn-quiet', onclick: closeSheet }, 'Cancel'), save]);
    }

    counts.hfn = rows.filter(r => r.summary_status === 'failed').length;
    paintCounts();

    const waiting = rows.some(r =>
      r.summary_status === 'pending' || r.summary_status === 'running');
    if (waiting) setTimeout(() => { if (current === 'hfn') go('hfn'); }, 60000);

    for (const r of rows) {
      const st       = String(r.summary_status || 'pending');
      const signals  = jarr(r.allocator_signals);
      const points   = jarr(r.key_points);
      const managers = jarr(r.managers_mentioned);

      let call, callLabel, callTone;
      if (st === 'done' && signals.length) {
        call = signals.join('   \u00B7   ');
        callLabel = signals.length === 1 ? 'Someone is allocating' : signals.length + ' allocators moving';
        callTone = 'good';
      } else if (st === 'failed') {
        call = r.summary_error || 'It could not be read.';
        callLabel = 'Not summarised';
        callTone = 'bad';
      } else if (st === 'pending' || st === 'running') {
        call = st === 'running' ? 'Being read now.' : 'Waiting to be read. HFN 01 picks it up within the half hour.';
        callLabel = 'No summary yet';
        callTone = 'signal';
      } else if (st === 'done') {
        call = 'Nothing in this issue names an investor who could be approached.';
        callLabel = 'No allocator signal';
        callTone = '';
      }

      const evidence = [
        ['publisher', asText(r.publisher)],
        ['issue    ', r.issue_date ? fmtDate(r.issue_date) : null],
        ['relevance', st === 'done' ? asText(r.relevance) : null],
        ['points   ', (st === 'done' && points.length)
            ? points.length + (points.length === 1 ? ' point' : ' points')
              + (managers.length ? ', ' + managers.length + ' managers named' : '')
            : null],
        ['filed    ', fmtDate(r.uploaded_at)]
      ];

      const actions = [];
      if (st === 'done') {
        actions.push({ label: 'View summary', primary: true, run: () => summarySheet(r) });
      }
      if (r.public_url) {
        actions.push({ label: 'Open the PDF', primary: st !== 'done',
          run: () => window.open(r.public_url, '_blank', 'noopener,noreferrer') });
        actions.push({ label: 'Copy the link', run: () => copy(r.public_url) });
      }
      actions.push({ label: 'Edit or delete', run: () => newsletterSheet(r) });
      if (st === 'failed') {
        actions.push({ label: 'Summarise again', run: async () => {
          try {
            await supaPatch('hf_newsletters', 'id=eq.' + encodeURIComponent(r.id),
              { summary_status: 'pending', summary_attempts: 0, summary_error: null });
            toast('Queued. It will be read within the half hour.');
            go('hfn');
          } catch (e) { toast(e.message, true); }
        } });
      }

      list.appendChild(entry({
        tone: st === 'failed' ? 'bad' : st === 'done' ? 'good' : 'signal',
        rail: '#' + r.id,
        action: r.title,
        who: st === 'done' ? (() => {
          const s = asText(r.summary);
          return s.length > 200 ? s.slice(0, 200).replace(/\s+\S*$/, '') + '\u2026' : s;
        })() : '',
        callout: call,
        calloutLabel: callLabel,
        calloutTone: callTone,
        evidence: evidence,
        tags: [[st, st === 'failed' ? 'bad' : st === 'done' ? 'good' : 'signal']],
        actions: actions
      }));
    }

    list.appendChild(el('p', { class: 'mono',
      style: 'color:var(--ink-3);font-size:12px;margin-top:18px' }, 'Showing ' + rows.length));
  });
};

const RPT_CSS = `
.rpt-c1{--c:#00A1C4} .rpt-c2{--c:#C48500} .rpt-c3{--c:#9FDCE9} .rpt-c4{--c:#00657B} .rpt-cbad{--c:var(--bad)}
.rpt-kpi .v.rpt-c1,.rpt-kpi .v.rpt-c2,.rpt-kpi .v.rpt-c4,.rpt-kpi .v.rpt-cbad{color:var(--c)}
@media (prefers-color-scheme: dark){ .rpt-kpi .v.rpt-c4{color:#9FDCE9} }
.rpt-cap{font-size:12.5px;color:var(--ink-3);margin:2px 0 16px}
.rpt-kpis{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:0;border-top:1px solid var(--rule);border-bottom:1px solid var(--rule);margin:2px 0 6px}
.rpt-kpi{padding:15px 15px 13px;border-left:1px solid var(--rule)}
.rpt-kpi:first-child{border-left:0}
.rpt-kpi .l{font-size:9.5px;letter-spacing:.15em;text-transform:uppercase;color:var(--ink-3)}
.rpt-kpi .v{font-size:26px;font-weight:600;color:var(--ink);line-height:1.05;margin-top:8px;letter-spacing:.01em}
.rpt-kpi .d{font-size:11px;margin-top:5px;color:var(--ink-3)}
.rpt-kpi .d.up{color:var(--good)} .rpt-kpi .d.down{color:var(--bad)}
.rpt-h{font-size:10.5px;letter-spacing:.18em;text-transform:uppercase;color:var(--ink-3);margin:28px 0 12px;display:flex;align-items:center;gap:12px}
.rpt-h::after{content:"";flex:1;height:1px;background:var(--rule)}
.rpt-funnel{display:flex;flex-direction:column;gap:9px}
.rpt-stage{display:flex;align-items:center;gap:13px}
.rpt-stage .bar{height:34px;border-radius:6px;display:flex;align-items:center;padding:0 13px;color:#fff;font-weight:600;min-width:52px}
.rpt-stage .meta{font-size:12.5px;color:var(--ink-2)}
.rpt-cols{display:grid;grid-template-columns:1fr 1fr;gap:30px}
.rpt-bar{display:grid;grid-template-columns:154px 1fr 44px;align-items:center;gap:11px;margin:0 0 10px}
.rpt-bar .k{font-size:12.5px;color:var(--ink-2);text-align:right;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.rpt-bar .t{background:rgba(0,161,196,.10);border-radius:5px;height:18px;overflow:hidden}
.rpt-bar .f{height:100%;border-radius:5px}
.rpt-bar .n{font-size:12.5px;color:var(--ink);text-align:right;font-weight:600}
.rpt-tag{font-size:9px;letter-spacing:.07em;text-transform:uppercase;padding:2px 6px;border-radius:4px;background:rgba(0,161,196,.14);color:var(--accent);margin-left:6px}
.rpt-rows{border-top:1px solid var(--rule)}
.rpt-row{display:flex;justify-content:space-between;gap:16px;padding:10px 2px;border-bottom:1px solid var(--rule);font-size:13px}
.rpt-row .k{color:var(--ink-3)} .rpt-row .v{color:var(--ink);font-weight:500}
.rpt-opps{display:grid;grid-template-columns:repeat(3,1fr);gap:0;border-top:1px solid var(--rule)}
.rpt-oc{border-bottom:1px solid var(--rule);border-right:1px solid var(--rule);padding:18px 20px;display:flex;flex-direction:column}
.rpt-oc:nth-child(3n){border-right:0}
.rpt-oc h4{margin:0 0 3px;font-size:15px;font-weight:500;color:var(--ink);line-height:1.28}
.rpt-oc .sub{font-size:11.5px;color:var(--ink-3);margin-bottom:13px}
.rpt-oc .sc{display:flex;justify-content:space-between;align-items:baseline;font-size:10.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--ink-3);margin-bottom:7px}
.rpt-oc .sc b{font-size:14px;color:var(--accent)}
.rpt-oc .seg{display:flex;gap:4px;margin-bottom:14px}
.rpt-oc .seg i{height:8px;flex:1;border-radius:3px;background:rgba(0,168,208,.14)}
.rpt-oc .seg i.on{background:var(--accent)}
.rpt-oc.q-matched .seg i.on{background:#00A1C4}
.rpt-oc.q-matched .sc b,.rpt-oc.q-matched .sc span{color:#00A1C4}
.rpt-oc.q-rejected .seg i.on{background:var(--bad)}
.rpt-oc.q-rejected .sc b,.rpt-oc.q-rejected .sc span{color:var(--bad)}
.rpt-oc .cr{display:grid;grid-template-columns:1fr 1fr;gap:9px 14px;font-size:12.5px;margin-bottom:15px}
.rpt-oc .cr .c{display:flex;align-items:center;gap:8px;color:var(--ink-2)}
.rpt-oc .cr .mk{width:16px;height:16px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;flex:none}
.rpt-oc .cr .y{background:rgba(0,168,208,.14);color:var(--accent)} .rpt-oc .cr .no{background:#EEF2F6;color:#aab6c2}
.rpt-oc .btns{margin-top:auto;display:flex;gap:8px}
.rpt-ob{font-family:inherit;font-size:12.5px;padding:8px 14px;border-radius:6px;border:1px solid var(--rule);background:#fff;color:var(--ink-2);cursor:pointer}
.rpt-ob.prim{border-color:var(--accent);color:var(--accent)} .rpt-ob:hover{background:rgba(0,168,208,.06)}
.rpt-ob[disabled]{opacity:.6;cursor:default}
@media (max-width:860px){.rpt-kpis{grid-template-columns:repeat(3,1fr)}.rpt-cols{grid-template-columns:1fr}.rpt-opps{grid-template-columns:1fr}}
`;

function wiJobj(v) { let x = v; for (let i = 0; i < 2 && typeof x === 'string'; i++) { try { x = JSON.parse(x); } catch (_) { x = {}; } } return (x && typeof x === 'object' && !Array.isArray(x)) ? x : {}; }

function renderOpenOpps(host) {
  host.appendChild(el('p', { class: 'rpt-h' }, 'Open opportunities'));
  host.appendChild(el('p', { class: 'rpt-cap', style: 'margin:-4px 0 14px' },
    'Still awaiting a decision. Open one to read it, or mark it read to clear it from here.'));
  const grid = el('div', { class: 'rpt-opps' });
  host.appendChild(grid);
  grid.appendChild(el('p', { class: 'mono', style: 'color:var(--ink-3);font-size:12px;padding:12px 2px' }, 'Loading\u2026'));

  const emptyOut = () => { grid.className = ''; clear(grid);
    grid.appendChild(empty('Nothing open', 'Every screened opportunity has been read or actioned.')); };

  fill(grid, () => supaSelect('wi_mandates',
    'select=id,investor_name,organization_name,investor_country,investor_city,investor_type,open_to_emerging_managers,strategies,asset_classes,aum_usd,aum_band,'
    + 'qualification,fit_score,new_qualification,new_fit_score,intention_summary,requirements_raw,appetite_raw,'
    + 'view_investor_url,linkedin_url,contact_name,evidence,seen_at,approved_at,alert_date'
    + '&qualification=in.(matched,uncertain)&approved_at=is.null&seen_at=is.null'
    + '&order=new_fit_score.desc.nullslast,fit_score.desc.nullslast&limit=24'), (rows) => {

    if (!rows.length) return emptyOut();
    grid.className = 'rpt-opps';

    for (const m of rows) {
      const crit = critOf(m);
      const score = crit.filter(Boolean).length;
      const card = el('div', { class: 'rpt-oc q-' + (m.qualification || 'open') });
      card.appendChild(el('h4', {}, m.investor_name || m.organization_name || 'Investor'));
      card.appendChild(el('div', { class: 'sub' },
        [m.investor_country, m.aum_band].filter(Boolean).join('  \u00B7  ') || '\u00A0'));
      const sc = el('div', { class: 'sc' });
      const band = bandOf(m);
      sc.append(el('span', {}, BAND_LABEL[band] || band.replace(/_/g, ' ')), el('b', {}, score + '/' + crit.length));
      card.appendChild(sc);
      const seg = el('div', { class: 'seg' });
      for (let i = 0; i < crit.length; i++) seg.appendChild(el('i', { class: i < score ? 'on' : '' }));
      card.appendChild(seg);
      const cr = el('div', { class: 'cr' });
      const rstat = critStatus(m);
      MATCH_CRITERIA.forEach((name, i) => {
        const st   = crit[i] ? 'yes' : (rstat[i] === 'unknown' ? 'unknown' : 'no');
        const mark = st === 'yes' ? '\u2713' : st === 'unknown' ? '?' : '\u2717';
        const cls  = st === 'yes' ? 'y' : st === 'unknown' ? 'no' : 'no';
        const row  = el('div', { class: 'c' },
          el('span', { class: 'mk ' + cls, style: st === 'unknown' ? 'background:rgba(90,110,130,.14);color:var(--ink-3)' : '' }, mark),
          el('span', null, name));
        if (st === 'unknown') row.appendChild(el('span', {
          style: 'margin-left:auto;font-size:9.5px;letter-spacing:.09em;text-transform:uppercase;color:var(--ink-3)' }, 'unknown'));
        cr.appendChild(row);
      });
      for (const [k, v] of contextLines(m)) {
        cr.appendChild(el('div', { class: 'c', style: 'color:var(--ink-3)' },
          el('span', { style: 'width:16px;text-align:center' }, '\u00B7'), el('span', null, k + ' \u2014 ' + v)));
      }
      card.appendChild(cr);
      const btns = el('div', { class: 'btns' });
      const readBtn = el('button', { class: 'rpt-ob' }, 'Mark as read');
      btns.append(
        el('button', { class: 'rpt-ob prim', onclick: () => openMandate(m) }, 'Open'),
        readBtn);
      readBtn.addEventListener('click', async () => {
        readBtn.setAttribute('disabled', ''); readBtn.textContent = 'Clearing\u2026';
        try {
          await markSeen(m);
          card.remove();
          if (!grid.querySelector('.rpt-oc')) emptyOut();
        } catch (e) {
          readBtn.removeAttribute('disabled'); readBtn.textContent = 'Mark as read';
          toast(e.message, true);
        }
      });
      card.appendChild(btns);
      grid.appendChild(card);
    }
  });
}

const REPORT_FIRST_WEEK = '2026-08-26';

RENDER.reports = function (body) {
  clear(body);

  if (!$('rpt-css')) document.head.appendChild(el('style', { id: 'rpt-css' }, RPT_CSS));

  fill(body, () => supaSelect('weekly_snapshots',
    'select=taken_at,metrics&order=taken_at.desc&limit=60'), (rows) => {

    // Snapshots before 26 Aug 2026 are hidden from the week picker only; the rows
    // stay in the database and in `rows`, so the first shown week still compares
    // against the week before it.
    const shown = rows.map((r, i) => i).filter((i) => String(rows[i].taken_at || '').slice(0, 10) >= REPORT_FIRST_WEEK);
    if (!shown.length) {
      return body.appendChild(empty('No report stored yet',
        'OPS 02 runs Friday at 19:00 Cairo and saves a snapshot. Nothing has been saved so far.'));
    }

    const J = (v) => { if (typeof v === 'string') { try { return JSON.parse(v); } catch (_) { return {}; } } return v || {}; };
    const A = (v) => { const x = J(v); return Array.isArray(x) ? x : []; };
    const n = (v) => Number(v || 0);
    const shortMoney = (v) => { const x = n(v); return x >= 1e6 ? '$' + (x / 1e6).toFixed(1) + 'm'
                                    : x >= 1e3 ? '$' + Math.round(x / 1e3) + 'k' : '$' + x; };

    let at = shown[0];
    let liCount = null;
    const host = el('div');

    const pick = el('select', { class: 'search', style: 'max-width:280px' });
    for (const i of shown) pick.appendChild(el('option', { value: String(i) },
      'Week to ' + fmtDate(rows[i].taken_at)));
    pick.addEventListener('change', () => { at = Number(pick.value) || 0; draw(); });
    body.append(el('div', { class: 'toolbar' }, pick), host);

    const oppsWrap = el('div');
    body.appendChild(oppsWrap);
    renderOpenOpps(oppsWrap);

    function draw() {
      clear(host);
      const m = J(rows[at].metrics);
      const p = rows[at + 1] ? J(rows[at + 1].metrics) : null;
      const d = (k) => p && p[k] !== undefined ? n(m[k]) - n(p[k]) : null;
      const delta = (k) => {
        const x = d(k); if (x === null) return null;
        const cls = x > 0 ? 'up' : x < 0 ? 'down' : '';
        const s = x > 0 ? '\u25B2' + x : x < 0 ? '\u25BC' + Math.abs(x) : '\u2014';
        return el('div', { class: 'd ' + cls }, s);
      };
      const H = (t) => el('p', { class: 'rpt-h' }, t);

      const kpis = el('div', { class: 'rpt-kpis' });
      // Brand palette: Primary #00A1C4 (rpt-c1), Secondary #C48500 (rpt-c2),
      // Accent #9FDCE9 (rpt-c3), Accent-dark #00657B (rpt-c4); Rejected keeps
      // the app's brick (--bad) so it still reads as a stop.
      for (const [lbl, val, key, tone] of [
        ['Screened', n(m.wi_new), 'wi_new', 'rpt-c4'],
        ['Matched', n(m.wi_matched), 'wi_matched', 'rpt-c1'],
        ['Rejected', n(m.wi_rejected), 'wi_rejected', 'rpt-cbad'],
        ['Awaiting you', n(m.wi_awaiting), null, 'rpt-c2'],
        ['Matched value', shortMoney(m.wi_ticket_value), null, 'rpt-c1'],
        ['Emails', n(m.crm_week), 'crm_week', 'rpt-c4'],
        ['LinkedIn', liCount == null ? '\u2014' : String(liCount), null, 'rpt-c4']
      ]) {
        kpis.appendChild(el('div', { class: 'rpt-kpi' },
          el('div', { class: 'l' }, lbl),
          el('div', { class: 'v ' + tone }, String(val)),
          key ? delta(key) : null));
      }
      host.append(kpis);

      const scr = n(m.wi_new) || 1;
      const stage = (lbl, val, grad) => {
        const pct = Math.max(6, Math.round(val / scr * 100));
        return el('div', { class: 'rpt-stage' },
          el('div', { class: 'bar', style: 'width:' + pct + '%;background:' + grad }, String(val)),
          el('div', { class: 'meta' }, lbl + '  \u00B7  ' + Math.round(val / scr * 100) + '% of screened'));
      };
      host.appendChild(H('Screening outcome'));
      host.appendChild(el('div', { class: 'rpt-funnel' },
        stage('Screened', n(m.wi_new), '#00657B'),
        stage('Matched', n(m.wi_matched), '#00A1C4'),
        stage('Awaiting you', n(m.wi_awaiting), '#C48500'),
        stage('Rejected', n(m.wi_rejected), '#A6402E')));   // the light theme's --bad: white text stays readable in dark mode too

      const bar = (label, value, max, grad, tagAddr) => {
        const k = el('div', { class: 'k' }, label);
        if (tagAddr) k.appendChild(el('span', { class: 'rpt-tag' }, 'addressable'));
        return el('div', { class: 'rpt-bar' }, k,
          el('div', { class: 't' }, el('div', { class: 'f',
            style: 'width:' + Math.max(3, value / max * 100) + '%;background:' + grad })),
          el('div', { class: 'n' }, String(value)));
      };
      const rej = A(m.wi_reject_reasons);
      const cty = A(m.wi_by_country);
      const cols = el('div', { class: 'rpt-cols' });

      const cA = el('div');
      if (rej.length) {
        cA.appendChild(H('Why opportunities were rejected'));
        const max = Math.max.apply(null, rej.map((r) => n(r.n)).concat([1]));
        for (const r of rej) cA.appendChild(bar(String(r.k), n(r.n), max, '#00657B'));
      }
      const cB = el('div');
      if (cty.length) {
        cB.appendChild(H('Where the flow comes from'));
        const ADDR = ['GB', 'CH', 'US'];
        const max = Math.max.apply(null, cty.map((c) => n(c.n)).concat([1]));
        for (const c of cty.slice(0, 8)) {
          const addr = ADDR.indexOf(String(c.k)) > -1;
          cB.appendChild(bar(String(c.k), n(c.n), max,
            addr ? '#00A1C4' : '#9FDCE9', addr));
        }
      }
      cols.append(cA, cB);
      host.appendChild(cols);

      if (!p) {
        host.appendChild(el('p', { class: 'mono',
          style: 'color:var(--ink-3);font-size:12px;margin-top:18px' },
          'First snapshot \u2014 week-on-week movement appears once there are two.'));
      }
    }
    draw();

    (async () => {
      try {
        const li = await supaSelect('contacts', 'select=id&linkedin_url=not.is.null&limit=5000');
        liCount = Array.isArray(li) ? li.length : 0;
        draw();
      } catch (_) { /* leave the em dash */ }
    })();
  });
};

RENDER.network = function (body) {
  clear(body);
  const q = el('input', { class: 'search', type: 'search',
    placeholder: 'A name, or paste a LinkedIn profile URL\u2026' });
  let connView = 'all';
  const warmBtn = el('button', { class: 'btn btn-sm btn-quiet',
    onclick: () => showWarm('all') }, 'Opportunity profiles');
  const mutBtn = el('button', { class: 'btn btn-sm btn-quiet',
    onclick: () => showWarm('mutual') }, 'Mutual');
  const soloBtn = el('button', { class: 'btn btn-sm btn-quiet',
    onclick: () => showWarm('solo') }, 'No mutuals');

  if (counts.network > 0) {
    warmBtn.classList.remove('btn-quiet');
    warmBtn.textContent = counts.network + ' new connection'
      + (counts.network === 1 ? '' : 's');
  }

  function markActive() {
    for (const [b, k] of [[warmBtn, 'all'], [mutBtn, 'mutual'], [soloBtn, 'solo']]) {
      b.classList.toggle('btn-quiet', connView !== k);
    }
  }

  body.appendChild(el('div', { class: 'toolbar' }, q,
    el('button', { class: 'btn btn-sm', onclick: () => run() }, 'Look up'),
    warmBtn, mutBtn, soloBtn));
  const out = el('div'); body.appendChild(out);
  q.addEventListener('keydown', e => { if (e.key === 'Enter') run(); });

  async function showWarm(view) {
    connView = view || 'all';
    markActive();
    clear(out);
    out.appendChild(el('p', { style: 'color:var(--ink-3);font-size:12px' },
      'Reading the profiles\u2026'));

    let rows;
    try { rows = await connectionFeed(); }
    catch (e) { clear(out); return out.appendChild(empty('Could not read it', e.message)); }

    clear(out);
    if (!rows.length) {
      return out.appendChild(empty('No profiles on file',
        'This lists everyone with a LinkedIn profile \u2014 the people at your '
        + 'investors, and anyone named on an alert \u2014 with the opportunity they '
        + 'belong to and whether anyone here can reach them. Importing an investor '
        + 'export fills it.'));
    }

    const fresh  = rows.filter(r => r.isNew);
    const shared = rows.filter(r => r.via.length > 0);
    const linked = rows.filter(r => r.mandate);

    const inView = connView === 'mutual' ? shared
                 : connView === 'solo'   ? rows.filter(r => !r.via.length)
                 :                         rows;

    out.appendChild(el('div', { class: 'callout ' + (shared.length ? 'good' : 'signal'),
      style: 'margin-bottom:16px' },
      el('span', { class: 'callout-k' },
        fresh.length ? fresh.length + ' new' : (shared.length ? 'Reachable' : 'No warm routes')),
      el('span', { class: 'callout-v' },
        rows.length + ' profiles on the pipeline, ' + shared.length
        + ' reachable through somebody here, ' + linked.length
        + ' tied to an opportunity.'
        + (connView === 'mutual' ? '  Showing the reachable ones.'
         : connView === 'solo'   ? '  Showing the ones with no route in.' : ''))));

    if (!inView.length) {
      out.appendChild(empty(
        connView === 'mutual' ? 'No warm routes yet' : 'Every profile has a route in',
        connView === 'mutual'
          ? 'Nobody here is connected to any of these people. The synced connection '
            + 'list is one person\u2019s \u2014 adding the others is what would change '
            + 'this.'
          : 'Somebody here is connected to every profile on the pipeline.'));
      markConnSeen(new Set(rows.map(r => r.handle)));
      return;
    }

    const showing = inView.slice(0, 400);
    for (const r of showing) {
      const m = r.mandate;
      const c = r.contact;
      const warm = r.via.length > 0;
      out.appendChild(entry({
        tone: warm ? 'good' : r.isNew ? 'signal' : 'quiet',
        rail: warm ? r.shared + '\u00D7' : 'cold',
        action: r.full_name,
        who: [r.role, r.firm].filter(Boolean).join('  \u00B7  '),
        callout: warm
          ? (r.via.length > 1 ? 'Mutual \u2014 known to ' + r.via.join(' and ')
                              : 'Connected to ' + r.via.join(', '))
          : 'Nobody here is connected. An approach would be cold.',
        calloutLabel: warm ? (r.via.length > 1 ? 'Mutual' : 'Via') : 'No route',
        calloutTone: warm ? 'good' : 'quiet',
        record: m || c,
        evidence: [
          ['profile  ', r.handle],
          ['known by ', r.via.join(', ')],
          ['at       ', r.firm],
          ['verdict  ', m ? m.qualification : null],
          ['email    ', c ? c.email : null]
        ],
        tags: (m ? [[m.qualification, m.qualification === 'matched' ? 'good'
                    : m.qualification === 'rejected' ? 'bad' : 'signal']] : [])
          .concat(warm ? [['reachable', 'good']] : [['no route', 'quiet']])
          .concat(r.isNew ? [['new', 'good']] : [])
          .concat(m && isApproved(m) ? [['approved', 'good']] : [])
          .concat(!m ? [['no opportunity on file', 'quiet']] : []),
        actions: [
          m ? { label: 'Open the opportunity', primary: true,
                run: () => { markSeen(m); openMandate(m); } } : null,
          { label: 'Open the profile', primary: !m,
            run: () => window.open(r.profile_url, '_blank', 'noopener,noreferrer') },
          c && c.email ? { label: 'Draft an email',
            run: () => { PENDING.draft = c.name; go('email'); } } : null
        ].filter(Boolean)
      }));
    }

    if (inView.length > showing.length) {
      out.appendChild(el('p', { style: 'margin-top:14px;font-size:12.5px;color:var(--ink-3)' },
        'Showing the first ' + showing.length + ' of ' + inView.length
        + '. Search above for anyone further down.'));
    }

    markConnSeen(new Set(rows.map(r => r.handle)));
  }

  if (counts.network > 0 && !networkPrefill) setTimeout(() => showWarm('all'), 0);

  function asHandle(v) {
    const m = String(v || '').match(/linkedin\.com\/in\/([^/?#\s]+)/i);
    return m ? decodeURIComponent(m[1]).toLowerCase() : null;
  }

  if (networkPrefill) { q.value = networkPrefill; networkPrefill = ''; }

  let mutualIndex = null;

  async function buildIndex() {
    if (mutualIndex) return mutualIndex;
    mutualIndex = {};
    try {
      const rows = await readRows('linkedin_mutual',
        'select=full_name,profile_url,mutual_to,mutual_count&limit=2000', 'li.mutual', { q: '' });
      for (const r of rows) {
        const h = asHandle(r.profile_url);
        if (h) mutualIndex[h] = r;
      }
    } catch (_) { /* the tab still works on names alone */ }
    return mutualIndex;
  }

  function run() {
    const raw = q.value.trim();
    if (!raw) return;
    clear(out);
    const handle = asHandle(raw);
    const term = handle || raw;

    fill(out, async () => {
      const idx = await buildIndex();

      const conns = await readRows('linkedin_mutual',
        'select=*&or=(full_name.ilike.' + lk(term) + ',profile_url.ilike.' + lk(term) + ')'
        + '&order=mutual_count.desc&limit=60',
        'li.mutual', { q: raw });

      let mand = [];
      try {
        mand = await readRows('wi_mandates',
          'select=id,investor_name,organization_name,linkedin_url,qualification,investor_country'
          + '&linkedin_url=not.is.null&limit=400', 'wi.mandates.list', {});
      } catch (_) {}

      const seen = {};
      for (const c of conns) { const h = asHandle(c.profile_url); if (h) seen[h] = true; }

      const extra = mand.filter(m => {
        const h = asHandle(m.linkedin_url);
        if (h && seen[h]) return false;
        const hay = [m.investor_name, m.organization_name, h].filter(Boolean).join(' ').toLowerCase();
        return hay.indexOf(String(term).toLowerCase()) > -1;
      }).map(m => {
        const h = asHandle(m.linkedin_url);
        const known = h ? idx[h] : null;
        return {
          from_mandate: true,
          mandate: m,
          full_name: m.investor_name || m.organization_name || h,
          profile_url: m.linkedin_url,
          mutual_to: known ? known.mutual_to : null,
          mutual_count: known ? known.mutual_count : 0,
          in_contact_book: false
        };
      });

      return conns.concat(extra);
    }, (rows) => {
      if (!rows.length) {
        return out.appendChild(empty('Not a first-degree connection',
          asHandle(q.value)
            ? 'That profile is not in the cached connection list. They may still be in the contact book — check Contacts.'
            : 'No connection by that name. Try a surname on its own, or paste their profile URL.'));
      }
      for (const p of rows) {
        const who = Array.isArray(p.mutual_to) ? p.mutual_to.join(', ') : (p.mutual_to || '');
        const fromMandate = !!p.from_mandate;
        out.appendChild(entry({
          tone: fromMandate ? (who ? 'good' : 'signal') : (p.in_contact_book ? 'good' : 'accent'),
          rail: fromMandate ? 'wi' : ((p.mutual_count || 1) + '\u00D7'),
          action: p.full_name,
          who: who
            ? 'Mutual to ' + who
            : (fromMandate
                ? 'From a mandate \u2014 nobody at Taranis is connected to them'
                : 'Mutual to someone at Taranis'),
          evidence: [['profile ', p.profile_url], ['synced  ', fmtDate(p.last_synced)]],
          tags: (fromMandate
            ? [['from a mandate', 'signal'],
               who ? ['already connected', 'good'] : ['no connection yet', 'quiet']]
            : (p.in_contact_book ? [['in the book', 'good']] : [['not in the book', 'quiet']])),
          actions: p.profile_url ? [
            { label: 'View LinkedIn profile', primary: true,
              run: () => window.open(p.profile_url, '_blank', 'noopener,noreferrer') },
            fromMandate
              ? { label: 'View the mandate', run: () => openMandate(p.mandate) }
              : { label: 'View profile', run: () => openProfile({ name: p.full_name }) },
            { label: 'Copy the link', run: () => copy(p.profile_url) },
            { label: 'History', run: () => askAbout('What do we know about ' + p.full_name
                + ', and have we ever been in contact?') }
          ] : []
        }));
      }
    });
  }
};

/* ------------------------------------------------------------------- find */

let findState = { from: '', to: '', type: '', country: '', asset: '', strategy: '',
                  tmin: '', status: '', q: '' };

RENDER.find = function (body) {
  clear(body);

  const F = findState;
  const mk = (label, node, key) => {
    node.value = F[key] || '';
    node.addEventListener(node.tagName === 'SELECT' ? 'change' : 'input',
      () => { F[key] = node.value; run(); });
    return el('label', { class: 'field' }, el('span', null, label), node);
  };
  const sel = (opts) => {
    const s = el('select', { class: 'search' });
    for (const [v, l] of opts) s.appendChild(el('option', { value: v }, l));
    return s;
  };

  const panel = el('div', { class: 'card', style: 'padding:16px;margin-bottom:16px' });
  const findScope = el('span');
  const sortBar = sortControl('find', () => run(), findScope);
  const out   = el('div');
  body.append(panel, sortBar, out);

  const fFrom = el('input', { class: 'search', type: 'date' });
  const fTo   = el('input', { class: 'search', type: 'date' });
  const fType = sel([['', 'Any investor type']]);
  const fGeo  = sel([['', 'Anywhere']]);
  const COUNTRY_NAMES = { GB: 'United Kingdom', US: 'United States', CH: 'Switzerland',
    SG: 'Singapore', AE: 'UAE', SA: 'Saudi Arabia', DE: 'Germany', FR: 'France',
    HK: 'Hong Kong', CA: 'Canada', AU: 'Australia', IE: 'Ireland', NL: 'Netherlands',
    SE: 'Sweden', NO: 'Norway', DK: 'Denmark', IT: 'Italy', ES: 'Spain', LU: 'Luxembourg',
    IL: 'Israel', JP: 'Japan', CN: 'China', IN: 'India' };

  // Type and country are read in one normal form by both the facet counts and
  // the filter, so a count can never promise rows the filter will not return.
  // "Multi-Family Office", "multi-family office" and "multi_family_office" are
  // one type; "family office" is its own type, not a prefix of the others.
  const typeKey = (m) => String(m.investor_type || '').trim().toLowerCase().replace(/[\s_-]+/g, ' ');
  const geoKey  = (m) => String(m.investor_country || '').trim().toUpperCase();

  // Each facet counts investors (one per investor, as the list shows them)
  // among the rows that pass every OTHER filter, so "(113)" is exactly what
  // selecting it returns.
  function fillFacets() {
    const facet = (node, key, getKey, label) => {
      const keep = findState[key] || '';
      const groups = new Map(), spell = new Map();
      for (const m of all) {
        if (!matches(m, key)) continue;
        const k = getKey(m);
        if (!k) continue;
        if (!groups.has(k)) { groups.set(k, []); spell.set(k, new Map()); }
        groups.get(k).push(m);
        const sp = spell.get(k), raw = String(key === 'type' ? m.investor_type : m.investor_country).trim();
        sp.set(raw, (sp.get(raw) || 0) + 1);
      }
      while (node.options.length > 1) node.remove(1);
      const counts = [...groups].map(([k, rows]) => [k, dedupeInvestors(rows).length]);
      if (keep && !groups.has(keep)) counts.push([keep, 0]);
      for (const [k, n] of counts.sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))) {
        const sp = spell.get(k);
        const raw = sp ? [...sp].sort((a, b) => b[1] - a[1])[0][0] : k;
        node.appendChild(el('option', { value: k }, label(k, raw) + '  (' + n + ')'));
      }
      node.value = keep;
    };
    facet(fType, 'type', typeKey, (k, raw) => raw.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase()));
    facet(fGeo, 'country', geoKey, (k) => COUNTRY_NAMES[k] || k);
  }
  const fAsset = sel([['', 'Any asset class'], ['hedge', 'Hedge funds'], ['equit', 'Equities'],
    ['credit', 'Credit'], ['private', 'Private markets'], ['real', 'Real assets'],
    ['multi', 'Multi-asset']]);
  const fStrat = sel([['', 'Any strategy'], ['equity_long_short', 'Equity long/short'],
    ['macro', 'Macro'], ['cta', 'CTA / managed futures'], ['market_neutral', 'Market neutral'],
    ['quant', 'Quant / systematic'], ['multi_strategy', 'Multi-strategy'], ['event', 'Event driven']]);
  const fTick = sel([['', 'Any ticket'], ['500000', 'USD 500k and up'],
    ['1000000', 'USD 1m and up'], ['5000000', 'USD 5m and up'], ['10000000', 'USD 10m and up']]);
  /* EDIT 9 — Outcome dropdown on the fine-grained re-score bands. */
  const fStat = sel([['', 'Any outcome'], ['matched', 'Matched'],
    ['uncertain', 'Review / tech-only'], ['low', 'Low fit (macro / CTA)'],
    ['needs_data', 'Needs data'], ['rejected', 'Rejected'],
    ['approved', 'Approved by a person'], ['notapproved', 'Not approved yet'],
    ['unread', 'Unread']]);
  const fQ    = el('input', { class: 'search', type: 'search',
    placeholder: 'Name, organisation or what the alert said\u2026' });

  panel.append(
    mk('Name or wording', fQ, 'q'),
    el('div', { class: 'grid2' }, mk('Alert dated from', fFrom, 'from'), mk('to', fTo, 'to')),
    el('div', { class: 'grid2' }, mk('Investor type', fType, 'type'), mk('Geography', fGeo, 'country')),
    el('div', { class: 'grid2' }, mk('Asset class', fAsset, 'asset'), mk('Strategy', fStrat, 'strategy')),
    el('div', { class: 'grid2' }, mk('Minimum ticket', fTick, 'tmin'), mk('Outcome', fStat, 'status')));

  const clearBtn = el('button', { class: 'btn btn-sm btn-quiet', style: 'margin-top:10px' }, 'Clear all');
  clearBtn.addEventListener('click', () => {
    findState = { from: '', to: '', type: '', country: '', asset: '', strategy: '',
                  tmin: '', status: '', q: '' };
    go('find');
  });
  panel.appendChild(clearBtn);

  let all = null, allInvestors = 0;
  const jarr = (v) => {
    let x = v;
    for (let i = 0; i < 2 && typeof x === 'string'; i++) { try { x = JSON.parse(x); } catch (_) { x = []; } }
    return Array.isArray(x) ? x.map(s => String(s).toLowerCase()) : [];
  };

  // skip names one filter to leave out, for that facet's own counts.
  function matches(m, skip) {
    const F = findState;
    const d = m.alert_date || (m.source_email_date || '').slice(0, 10) || (m.created_at || '').slice(0, 10);
    if (F.from && (!d || d < F.from)) return false;
    if (F.to   && (!d || d > F.to))   return false;
    if (F.type && skip !== 'type' && typeKey(m) !== F.type) return false;
    if (F.country && skip !== 'country' && geoKey(m) !== F.country) return false;
    if (F.asset    && !jarr(m.asset_classes).some(a => a.includes(F.asset)))   return false;
    if (F.strategy && !jarr(m.strategies).some(s => s.includes(F.strategy)))   return false;
    if (F.tmin) {
      const t = Number(m.ticket_max_usd || m.ticket_min_usd || 0);
      if (!(t >= Number(F.tmin))) return false;
    }
    /* EDIT 9 — status filter on new_qualification bands, falling back to qualification. */
    const nq = String(m.new_qualification || '').toLowerCase();
    if (F.status === 'unread')           { if (m.seen_at) return false; }
    else if (F.status === 'approved')    { if (!isApproved(m)) return false; }
    else if (F.status === 'notapproved') { if (isApproved(m)) return false; }
    else if (['matched','uncertain','low','needs_data','rejected'].indexOf(F.status) >= 0) {
      const have = nq || String(m.qualification || '').toLowerCase();
      if (have !== F.status) return false;
    }
    else if (F.status && m.qualification !== F.status) return false;
    if (F.q) {
      const hay = [m.investor_name, m.organization_name, m.contact_name,
                   m.intention_summary, m.investor_city].join(' ').toLowerCase();
      if (!hay.includes(F.q.toLowerCase())) return false;
    }
    return true;
  }

  // One card per investor, as on every other mandate tab. The card is the
  // investor's best verdict among the rows that matched; all of those rows are
  // folded into its intentions list (_intentions).
  const VERDICT_RANK = { matched: 0, uncertain: 1, low: 2, needs_data: 3, rejected: 4 };
  function bestOf(rows) {
    const rank = (m) => { const q = bandOf(m); return q in VERDICT_RANK ? VERDICT_RANK[q] : 5; };
    const fit = (m) => { const n = Number(m.new_fit_score); return isFinite(n) && m.new_fit_score !== null ? n : -1; };
    return rows.slice().sort((a, b) => rank(a) - rank(b)
      || (isApproved(b) ? 1 : 0) - (isApproved(a) ? 1 : 0)
      || fit(b) - fit(a) || (Number(b.id) || 0) - (Number(a.id) || 0))[0];
  }
  function investorCards(rows) {
    return dedupeInvestors(rows).map(c => c._intentions
      ? Object.assign({}, bestOf(c._intentions), { _intentions: c._intentions }) : c);
  }

  function run() {
    if (!all) return;
    clear(out);
    fillFacets();
    const matched = all.filter(m => matches(m));
    const rows = sortMandates(investorCards(matched), sortModeOf('find'));
    findScope.textContent = 'Sorts all ' + allInvestors + ' investors';
    const anyFilter = Object.values(findState).some(v => v);

    out.appendChild(el('p', { class: 'mono', style: 'color:var(--ink-3);font-size:12px;margin:0 0 12px' },
      anyFilter ? rows.length + ' of ' + allInvestors + ' investors match  \u00B7  '
                  + matched.length + ' mandate' + (matched.length === 1 ? '' : 's')
                : allInvestors + ' investors, ' + all.length + ' mandates \u2014 narrow them above'));

    if (!rows.length) {
      return out.appendChild(empty('Nothing matches',
        'Widen a filter. Geography and asset class are the two that most often exclude everything.'));
    }

    for (const m of rows.slice(0, 200)) {
      const q = bandOf(m);
      const tone = bandTone(q);
      out.appendChild(entry({
        tone,
        rail: '#' + m.id,
        action: investorLabel(m),
        who: [orgLabel(m), m.investor_country, m.investor_city]
               .filter(Boolean).join('  \u00B7  '),
        record: m,
        evidence: [
          ['type    ', asText(m.investor_type)],
          ['strategy', asText(m.strategies)],
          ['asset   ', asText(m.asset_classes)],
          ['ticket  ', money(m.ticket_max_usd || m.ticket_min_usd)]
        ],
        tags: [[BAND_LABEL[q] || q.replace(/_/g, ' '), tone]]
                .concat(m.seen_at ? [] : [['unread', 'signal']])
                .concat(isApproved(m) ? [['approved', 'good']] : [])
                .concat(m._intentions ? [[m._intentions.length + ' mandates', 'quiet']] : []),
        actions: [{ label: 'View the mandate', primary: true,
                    run: () => { markSeen(m); openMandate(m); } }]
                 .concat(verdictActions(m, () => go('find')))
      }));
    }
    if (rows.length > 200) {
      out.appendChild(el('p', { class: 'mono', style: 'color:var(--ink-3);font-size:12px;margin-top:14px' },
        'Showing the first 200. Narrow the filters to see the rest.'));
    }
  }

  out.appendChild(el('p', { class: 'mono', style: 'color:var(--ink-3);font-size:12px' }, 'Loading\u2026'));
  fill(out, async () => {
    if (DEMO) return [];
    /* EDIT 8 — raise the row cap from 1000 so all ~1,286 mandates load. */
    return await supaSelect('wi_mandates', 'select=*&order=id.desc&limit=5000');
  }, (rows) => { all = rows; allInvestors = dedupeInvestors(rows).length; run(); });
};

RENDER.search = function (body) { return RENDER.find(body); };

RENDER.ask = function (body) {
  const host = body.parentElement;
  host.style.padding = '0';
  clear(body);
  body.style.padding = '0';
  body.style.display = 'flex';
  body.style.flexDirection = 'column';
  body.style.height = '100%';

  const log = el('div', { id: 'ask-log' });

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

  // Sourcing prompts. Each chip carries the mode it needs: the strategy, tech
  // and emerging-manager questions go to the model (Ask agent), which can read
  // the mandates; the decision queue is answered locally from the database.
  const chips = el('div', { class: 'chips' });
  for (const [s, m] of [
    ['Which investors want long/short equity or quant?', 'agent'],
    ['Show me technology-focused investors',             'agent'],
    ["Who's open to emerging managers?",                 'agent'],
    ["What's waiting on me to decide?",                  'local']
  ]) chips.appendChild(el('button', { class: 'chip', onclick: () => { setMode(m); input.value = s; send(); } }, s));

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
        if (/^https?:\/\//i.test(href)) {
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

function copy(text, what) {
  navigator.clipboard.writeText(text || '').then(
    () => toast((what || 'Link') + ' copied'),
    () => toast('Could not copy', true));
}

function invitationSheet(m) {
  const original = String(m.invitation_body || '');
  const subject  = String(m.invitation_subject || m.title || 'Meeting');

  const area = el('textarea', {
    style: 'width:min(720px,80vw);min-height:340px;padding:13px 15px;font:inherit;'
         + 'font-size:13.5px;line-height:1.6;border:1px solid var(--rule);'
         + 'border-radius:6px;background:var(--card);color:var(--ink);resize:vertical'
  });
  area.value = original;

  const head = el('div', { style: 'margin-bottom:10px' },
    el('div', { style: 'font-size:11px;letter-spacing:.14em;text-transform:uppercase;'
      + 'color:var(--ink-3);margin-bottom:3px' }, 'Subject'),
    el('div', { style: 'font-size:15px;font-weight:600' }, subject));

  const note = el('p', { style: 'margin:9px 0 0;font-size:12.5px;color:var(--ink-3);line-height:1.55' },
    m.to_csv_display
      ? 'This is what was emailed to ' + m.to_csv_display + '. Editing here changes your copy only.'
      : 'Nobody was emailed. Edit it if you like, then copy it and send it yourself.');

  sheet('Invitation' + (m.invitation_language === 'fr' ? '  \u00B7  Français' : ''),
    [el('div', null, head, area, note)],
    [
      el('button', { class: 'btn btn-sm btn-quiet',
        onclick: () => { area.value = original; toast('Back to the original.'); } }, 'Reset'),
      el('button', { class: 'btn btn-sm btn-quiet',
        onclick: () => copy(subject, 'Subject') }, 'Copy the subject'),
      el('button', { class: 'btn btn-sm',
        onclick: () => copy(area.value, 'Message') }, 'Copy the message'),
      el('button', { class: 'btn btn-sm btn-quiet', onclick: closeSheet }, 'Close')
    ]);
}

function sheet(title, bodyNodes, footNodes) {
  $('sheet-title').textContent = title;
  const b = $('sheet-body'); clear(b); bodyNodes.forEach(n => b.appendChild(n));
  const f = $('sheet-foot'); clear(f); footNodes.forEach(n => f.appendChild(n));
  $('sheet').classList.add('on');
}

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

/* ------------------------------------------------- answering without n8n */

const STOPWORDS = new Set(('what when where who whom which why how did do does done was were is are am '
  + 'we our us i me my you your he she they them their it its the a an of to for from with about '
  + 'and or but if then than that this these those on in at by as be been being have has had '
  + 'last latest recent recently send sent sending say said tell told know knows contact contacted '
  + 'email emails mail spoke speak spoken talk talked reply replied answer time times ago please '
  + 'give show find all any some more most any anything everything details detail info information'
  ).split(' '));

function searchTerms(q) {
  const words = String(q || '')
    .replace(/[^\p{L}\p{N}@.\- ]/gu, ' ')
    .split(/\s+/)
    .map(w => w.trim())
    .filter(w => w.length > 1 && !STOPWORDS.has(w.toLowerCase()));
  return words;
}

function lk(term) {
  return '"*' + String(term == null ? '' : term)
    .replace(/[\\"(),]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim() + '*"';
}

function ilikeAny(cols, term) {
  const t = lk(term);
  return '&or=(' + cols.map(c => c + '.ilike.' + t).join(',') + ')';
}

async function localDossier(host, person) {
  const addr = String(person.email || '').toLowerCase().trim();
  let mail = [];
  try {
    let sel = 'select=*&order=received_at.desc&limit=12';
    sel += addr
      ? '&or=(counterparty_addr.eq.' + encodeURIComponent(addr)
        + ',counterparty_name.ilike.' + lk(person.name) + ')'
      : ilikeAny(['counterparty_name'], person.name);
    mail = await readRows('crm_emails_app', sel, 'emails.search', { q: person.name, side: 'all' });
  } catch (_) { /* the person still shows without their mail */ }

  const q = daysSince(person.last_contact_at || person.last_interaction);
  host.appendChild(entry({
    tone: person.knows_us === 'yes' ? 'good' : person.knows_us === 'vaguely' ? 'signal' : '',
    rail: lastSpokenRail(q),
    action: person.name,
    who: [person.role, person.company, person.city, person.country].filter(Boolean).join('  \u00B7  '),
    evidence: [
      ['last email ', lastSpoken(person, q)],
      ['email      ', person.email],
      ['about      ', person.last_contact_summary || person.last_contact_note],
      ['next step  ', person.next_step],
      ['status     ', person.status],
      ['ticket     ', person.aum_band],
      ['region     ', person.region],
      ['terms      ', person.introducer_terms],
      ['knows us   ', person.knows_us],
      ['exchanges  ', mail.length ? (mail.length >= 12 ? '12+' : mail.length) : null],
      ['records    ', (person._merged && person._merged.length > 1)
          ? person._merged.length + ' duplicate records shown as one (#'
            + person._merged.join(', #') + ')' : null],
      ['intel      ', person.intelligence_text || person.raw_notes]
    ],
    tags: [
      person.side === 'taranis' ? ['taranis', 'accent'] : null,
      person.category ? [person.category, ''] : null
    ].filter(Boolean),
    actions: [
      { label: 'View profile', primary: true, run: () => openProfile(person) },
      { label: 'Draft an email', run: () => { PENDING.draft = person.name; go('email'); } },
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
      evidence: [['about   ', m.summary], ['intent  ', m.intent]],
      actions: [{ label: 'Read the email', run: () => readEmail(m.id, m.subject) }]
    }));
  }
}

/* --------------------------------------------------------- one person */

/* Internal plumbing on a mandate: audit stamps, pipeline state, the re-score
   snapshot and verdict columns. They stay in the database and the logic keeps
   reading them (new_qualification / new_fit_score are what the app runs on,
   qualification_old / fit_score_old are the rollback snapshot) -- they are only
   left off anything a person reads. */
const HIDDEN_FIELDS = ['alert_date', 'commercial_status', 'compliance_status', 'intake_stage',
  'intake_missing', 'source_kind', 'seen_at', 'seen_by', 'wi_enriched_at', 'name_reparsed_at',
  'qualification_old', 'fit_score_old', 'new_qualification', 'new_fit_score', 'rescored_at',
  'hard_status', 'matched', 'published_via', 'alert_type'];

/* The investor in plain language, at the top of the mandate page: who they
   are, what they intend, and who to speak to. */
function investorView(full, m) {
  const box = el('div', { style: 'max-width:820px;margin:0 0 22px' });
  const section = (title, ...kids) => el('section', { style: 'margin:0 0 16px' },
    el('h3', { style: 'font-family:var(--font-display);font-weight:500;font-size:17px;margin:0 0 6px;color:var(--ink-2)' }, title),
    ...kids.filter(Boolean));
  const para = (t, muted) => el('p', { style: 'margin:0 0 6px;font-size:14.5px;line-height:1.55'
    + (muted ? ';color:var(--ink-3)' : '') }, t);
  const list = (items) => el('ul', { style: 'margin:4px 0 0;padding-left:18px;font-size:14px;line-height:1.55' },
    ...items.map(t => el('li', null, t)));
  const line = (label, text) => text ? el('div', { style: 'font-size:14px;line-height:1.55;margin:0 0 4px' },
    el('span', { style: 'color:var(--ink-3)' }, label + ' \u2014 '), text) : null;

  // Who they are: the summary the alert gives, then what stands out.
  const who = [asText(full.investor_type), geoText(full) !== 'not stated' ? geoText(full) : '',
    full.aum_band ? 'AUM ' + asText(full.aum_band) : ''].filter(Boolean).join('  \u00B7  ');
  const summary = asText(full.intention_summary);
  const signals = jsonArr(full.positive_signals).map(String).filter(Boolean);
  let ev = full.evidence;
  for (let i = 0; i < 2 && typeof ev === 'string'; i++) { try { ev = JSON.parse(ev); } catch (_) { ev = {}; } }
  // WI sends the profile as HTML (<p>, <em>); show its words, not its tags.
  const profile = ev && typeof ev === 'object' ? htmlToText(ev.wi_summary) : '';
  box.appendChild(section('Summary',
    who ? para(who, true) : null,
    summary ? para(summary) : para('The alert gave no summary.', true),
    profile && profile !== summary ? para('WI profile: ' + profile, true) : null,
    signals.length ? list(signals) : null));

  // Intentions: every distinct intention when the investor has several,
  // otherwise what this one asks for.
  const seen = {}, ints = [];
  for (const it of ((m && m._intentions) || full._intentions || [])) {
    const t = String(it.intention_summary || it.fit_reason || '').replace(/\s+/g, ' ').trim();
    if (!t || seen[t.toLowerCase()]) continue;
    seen[t.toLowerCase()] = 1;
    ints.push([it.alert_date ? fmtDate(it.alert_date) : '', t, money(it.ticket_min_usd)]);
  }
  const detail = [line('Looking for', asText(full.requirements_raw)), line('Appetite', asText(full.appetite_raw)),
    line('Timing', asText(full.allocation_timing))].filter(Boolean);
  box.appendChild(section('Intentions',
    ints.length > 1
      ? list(ints.map(([d, t, tk]) => [d, t, tk ? 'ticket ' + tk : ''].filter(Boolean).join('  \u00B7  ')))
      : (detail.length ? el('div', null, ...detail) : para('Only the summary above was stated.', true))));

  // Contact person.
  const emails = jsonArr(full.emails).map(String).filter(Boolean);
  const links = jsonArr(full.linkedin_urls).map(String).filter(Boolean);
  box.appendChild(section('Contact person',
    para(asText(full.contact_name) || 'not stated', !asText(full.contact_name)),
    emails.length ? line('Email', emails.join(', ')) : null,
    links.length ? line('LinkedIn', links.join(', ')) : null));
  return box;
}

async function openMandate(m) {
  closeSheet();
  if (current !== 'mandate') PROFILE_BACK = current;
  current = 'mandate';
  document.querySelectorAll('.navbtn').forEach(b => b.setAttribute('aria-current', 'false'));

  // Built in a staged pane: the page swaps in when its record is drawn.
  return stagePane(async (body) => {
    $('pg-title').textContent = investorLabel(m);
    $('pg-sub').textContent = 'With Intelligence mandate';
    const host = el('div');
    body.appendChild(host);

    let full = m;
    try {
      const rows = await supaSelect('wi_mandates', 'select=*&limit=1&id=eq.' + encodeURIComponent(m.id));
      if (rows && rows[0]) full = rows[0];
    } catch (_) { /* show what we were given */ }

    const q = String(full.qualification || '').toLowerCase();
    host.appendChild(el('div', { class: 'acts', style: 'margin-bottom:20px' },
      el('button', { class: 'btn btn-sm btn-quiet', onclick: () => go(PROFILE_BACK || 'opps') }, '\u2190 Back'),
      full.view_article_url
        ? el('button', { class: 'btn btn-sm',
            onclick: () => window.open(full.view_article_url, '_blank', 'noopener,noreferrer') },
            full.source_page ? 'View article  \u00B7  p.' + full.source_page : 'View article')
        : null,
      full.view_intention_url
        ? el('button', { class: 'btn btn-sm btn-quiet',
            onclick: () => window.open(full.view_intention_url, '_blank', 'noopener,noreferrer') }, 'View intention')
        : null,
      full.view_investor_url
        ? el('button', { class: 'btn btn-sm btn-quiet',
            onclick: () => window.open(full.view_investor_url, '_blank', 'noopener,noreferrer') }, 'Investor page')
        : null,
      full.linkedin_url
        ? el('button', { class: 'btn btn-sm btn-quiet',
            onclick: () => window.open(full.linkedin_url, '_blank', 'noopener,noreferrer') }, 'LinkedIn')
        : null,
      el('button', { class: 'btn btn-sm btn-quiet', onclick: () => fillSheet(full) }, 'Fill a gap'),
      ...verdictActions(full, () => openMandate(full)).map(v =>
        el('button', { class: 'btn btn-sm btn-quiet', onclick: v.run }, v.label))));

    host.appendChild(el('div', { class: 'banner',
      style: q === 'rejected' ? 'border-color:var(--bad);background:transparent;color:var(--bad)' : '' },
      el('b', null, q === 'rejected' ? 'Rejected. ' : q === 'matched' ? 'Matched. ' : 'Awaiting a decision. '),
      asText(full.fit_reason) || 'No reason recorded.'));

    if (full.linkedin_url) {
      const handle = String(full.linkedin_url)
        .match(/linkedin\.com\/in\/([^/?#\s]+)/i);
      const who = el('div', { class: 'banner', style: 'margin-top:-8px' },
        el('span', { style: 'color:var(--ink-3)' }, 'Checking who knows them\u2026'));
      host.appendChild(who);

      (async () => {
        try {
          if (!handle) {
            clear(who);
            who.appendChild(el('span', { style: 'color:var(--ink-3)' },
              'That LinkedIn address is not a personal profile, so it cannot be matched '
              + 'against the connection list.'));
            return;
          }
          const slug = decodeURIComponent(handle[1]).toLowerCase();
          const hits = await readRows('linkedin_mutual',
            'select=full_name,profile_url,mutual_to,mutual_count'
            + '&profile_url=ilike.*' + encodeURIComponent(slug) + '*&limit=5',
            'li.mutual', { q: slug });

          clear(who);
          const hit = (hits || [])[0];
          const names = hit && Array.isArray(hit.mutual_to) ? hit.mutual_to
                      : (hit && hit.mutual_to ? [hit.mutual_to] : []);

          if (hit && names.length) {
            who.style.borderColor = 'var(--good)';
            who.appendChild(el('b', null, 'Connected. '));
            who.appendChild(el('span', null,
              names.join(', ') + (names.length === 1 ? ' is' : ' are')
              + ' a first-degree connection of ' + (hit.full_name || 'them') + '.'));
          } else if (hit) {
            who.appendChild(el('b', null, 'On the list, but not connected. '));
            who.appendChild(el('span', null,
              (hit.full_name || 'They') + ' appears in the synced list, but nobody at '
              + 'Taranis is a first-degree connection.'));
          } else {
            who.appendChild(el('b', null, 'Nobody here knows them. '));
            who.appendChild(el('span', null,
              'That profile is not in the synced connection list \u2014 which means '
              + 'no warm introduction, not that the profile is wrong.'));
          }
          who.appendChild(el('div', { class: 'acts' },
            el('button', { class: 'btn btn-sm btn-quiet',
              onclick: () => { networkPrefill = slug; go('network'); } }, 'Open in Network')));
        } catch (e) {
          clear(who);
          who.appendChild(el('span', { style: 'color:var(--ink-3)' },
            'The connection list could not be read: ' + e.message));
        }
      })();
    }

    const field = (label, value, big) => {
      const t = asText(value);
      if (!t) return null;
      return el('div', { style: 'margin-bottom:' + (big ? '14px' : '11px') },
        el('div', { class: 'mono',
          style: 'font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--ink-3);margin-bottom:3px' },
          label),
        el('div', { style: 'font-size:' + (big ? '16px' : '14.5px')
          + ';font-weight:' + (big ? '600' : '500') + ';line-height:1.5' }, t));
    };

    host.appendChild(investorView(full, m));

    const grid = el('div', { class: 'grid2', style: 'max-width:820px' });
    const c1 = el('div'), c2 = el('div');
    grid.append(c1, c2);
    c1.append(...[
      field('Investor', investorLabel(full), true),
      field('Organisation', orgLabel(full), true),
      resolvedInvestor(full).corrected
        ? field('Corrected', 'The alert stored ' + resolvedInvestor(full).otherFirm
            + ' as the investor. That firm receives allocations rather than making them, '
            + 'so the organisation is shown as the investor instead.')
        : null,
      field('Where', [full.investor_city, full.investor_country].filter(Boolean).join(', '), true),
      field('Type', full.investor_type),
      field('Strategies', full.strategies)
    ].filter(Boolean));
    c2.append(...[
      field('Minimum ticket', money(full.ticket_min_usd), true),
      el('div', { style: 'margin-bottom:14px' },
        el('div', { style: 'font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;'
          + 'color:var(--ink-3);margin-bottom:3px' }, 'Fit score'),
        el('div', { style: 'font-size:16px;font-weight:600;line-height:1.5' },
          scoreChip(matchScore(full), full))),
      el('div', { style: 'margin-bottom:14px' }, qualificationControl(full, (to) => routeAfterQualification(full, to))),
      field('Approved', full.approved_at
        ? (fmtDate(full.approved_at) + (full.approved_by ? '  by ' + full.approved_by : ''))
        : 'not approved yet'),
      field('Not stated', full.missing_hard_fields),
      field('Hard failures', full.hard_fail_reasons),
      field('Published', full.published_at ? fmtDate(full.published_at) : 'not published')
    ].filter(Boolean));
    host.appendChild(grid);

    const shown = ['id','investor_name','organization_name','investor_city','investor_country',
      'investor_type','strategies','ticket_min_usd','fit_score','fit_reason','qualification',
      'missing_hard_fields','hard_fail_reasons','published_at','linkedin_url',
      'approved_at','approved_by','source_page',
      'view_article_url','view_intention_url','view_investor_url',
      // shown in the readable investor view above
      'intention_summary','positive_signals','requirements_raw','appetite_raw','allocation_timing',
      'contact_name','emails','linkedin_urls','aum_band'];

    const HIDE = ['record_key','raw_email_id','source_message_id','block_index',
      'source_email_date','created_at','updated_at','field_sources','soft_flags',
      'hard_notes','content_hash','embedding'].concat(HIDDEN_FIELDS);
    const prov = fillProvenance(full);
    if (prov.length) {
      host.appendChild(el('p', { class: 'mono',
        style: 'font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--ink-3);'
             + 'margin:28px 0 8px;padding-bottom:6px;border-bottom:1px solid var(--rule)' },
        'Filled in by hand'));
      const ev = el('div', { class: 'ev' });
      for (const line of prov) ev.appendChild(el('div', null, line));
      host.appendChild(ev);
    }

    const rest = Object.keys(full).filter(k =>
      shown.indexOf(k) < 0 && HIDE.indexOf(k) < 0 && asText(full[k]));
    if (rest.length) {
      host.appendChild(el('p', { class: 'mono rec-head' }, 'Everything else on the record'));
      const ev = el('div', { class: 'ev rec' });
      for (const k of rest) {
        ev.appendChild(el('div', null,
          el('span', { class: 'k' }, k.replace(/_/g, ' ').padEnd(20, ' ') + '  '),
          asText(full[k]).slice(0, 400)));
      }
      host.appendChild(ev);
    }
  });
}

let PROFILE_BACK = null;

function editNoteSheet(n, after) {
  const F = {};
  const mk = (k, label, node) => { F[k] = node;
    return el('label', { class: 'field' }, el('span', null, label), node); };
  const txt = (v) => el('input', { class: 'search', value: v == null ? '' : String(v) });

  const form = el('div', { style: 'min-width:min(680px,72vw)' },
    el('div', { class: 'grid2' },
      mk('title', 'Title', txt(n.title)),
      mk('note_date', 'Date', (() => {
        const d = el('input', { class: 'search', type: 'date' });
        d.value = n.note_date ? String(n.note_date).slice(0, 10) : '';
        return d;
      })())),
    mk('place', 'Place', txt(n.place)),
    mk('body', 'The note', (() => {
      const t = el('textarea', { class: 'ta', style: 'min-height:160px' });
      t.value = n.body || '';
      return t;
    })()),
    el('div', { class: 'grid2' },
      mk('contact_name', 'Who it was with', txt(n.contact_name)),
      mk('contact_company', 'Company', txt(n.contact_company))));

  const save = el('button', { class: 'btn btn-sm' }, 'Save the changes');
  save.addEventListener('click', async () => {
    const patch = {};
    for (const k in F) {
      const v = String(F[k].value == null ? '' : F[k].value).trim();
      patch[k] = v === '' ? null : v;
    }
    if (!patch.title && !patch.body) return toast('A note needs a title or something in it.', true);
    save.disabled = true; save.textContent = 'Saving\u2026';
    try {
      await supaPatch('notes', 'id=eq.' + encodeURIComponent(n.id), patch);
      toast('Saved.');
      closeSheet();
      if (typeof after === 'function') after();
    } catch (e) {
      toast(e.message, true);
      save.disabled = false; save.textContent = 'Save the changes';
    }
  });

  sheet('Edit the note', [form], [
    save, el('button', { class: 'btn btn-sm btn-quiet', onclick: closeSheet }, 'Cancel')
  ]);
}

function addContactSheet(after) {
  const F = {};
  const mk = (key, label, node) => { F[key] = node;
    return el('label', { class: 'field' }, el('span', null, label), node); };
  const txt = (ph, type) => el('input', { class: 'search', type: type || 'text', placeholder: ph || '' });
  const opt = (pairs) => {
    const s = el('select', { class: 'search' });
    for (const [v, l] of pairs) s.appendChild(el('option', { value: v }, l));
    return s;
  };

  const form = el('div', { style: 'min-width:min(680px,72vw)' },
    el('div', { class: 'grid2' },
      mk('name', 'Name', txt('Full name')),
      mk('email', 'Email', txt('name@firm.com', 'email'))),
    el('div', { class: 'grid2' },
      mk('phone', 'Phone', txt('')),
      mk('company', 'Company', txt(''))),
    el('div', { class: 'grid2' },
      mk('role', 'Role', txt('')),
      mk('category', 'Taranis or client', opt([['client', 'Client'], ['taranis', 'Taranis']]))),
    el('div', { class: 'grid2' },
      mk('city', 'City', txt('')),
      mk('country', 'Country', txt(''))),
    el('div', { class: 'grid2' },
      mk('knows_taranis', 'Do they know Taranis?',
        opt([['', 'Not known'], ['yes', 'Yes'], ['vaguely', 'Vaguely'], ['no', 'No']])),
      mk('aum_band', 'Ticket band', txt('e.g. 1-5m'))),
    mk('next_step', 'Next step', txt('')),
    mk('intelligence_text', 'Anything else',
      el('textarea', { class: 'ta', style: 'min-height:100px',
        placeholder: 'Where you met, what they are after, who introduced you.' })));

  const save = el('button', { class: 'btn btn-sm' }, 'Add them to the book');
  save.addEventListener('click', async () => {
    const row = { source: 'console' };
    for (const k in F) {
      const v = String(F[k].value == null ? '' : F[k].value).trim();
      row[k] = v === '' ? null : v;
    }
    if (!row.name) return toast('A name is the one thing required.', true);
    save.disabled = true; save.textContent = 'Saving\u2026';
    try {
      const saved = await supaInsert('contacts', row);
      toast(row.name + ' added to the book.');
      closeSheet();
      if (typeof after === 'function') after();
      if (saved && saved.id) openProfile(Object.assign({ knows_us: row.knows_taranis || 'unknown' }, saved));
    } catch (e) {
      toast(e.message, true);
      save.disabled = false; save.textContent = 'Add them to the book';
    }
  });

  sheet('Add a person', [form], [
    save, el('button', { class: 'btn btn-sm btn-quiet', onclick: closeSheet }, 'Cancel')
  ]);
}

async function editProfile(c) {
  const F = {};
  const mk = (key, label, node) => {
    F[key] = node;
    return el('label', { class: 'field' }, el('span', null, label), node);
  };
  const txt = (v) => el('input', { class: 'search', value: v == null ? '' : String(v) });
  const sel = (v, opts) => {
    const s = el('select', { class: 'search' });
    for (const [val, lbl] of opts) {
      const o = el('option', { value: val }, lbl);
      if (String(v || '') === val) o.selected = true;
      s.appendChild(o);
    }
    return s;
  };

  const form = el('div', { style: 'max-width:900px' },
    el('div', { class: 'grid2' },
      mk('name', 'Name', txt(c.name)),
      mk('email', 'Email', txt(c.email))),
    el('div', { class: 'grid2' },
      mk('phone', 'Phone', txt(c.phone)),
      mk('company', 'Company', txt(c.company))),
    el('div', { class: 'grid2' },
      mk('role', 'Role', txt(c.role || c.title)),
      mk('category', 'Category', txt(c.category))),
    el('div', { class: 'grid2' },
      mk('city', 'City', txt(c.city)),
      mk('country', 'Country', txt(c.country))),
    el('div', { class: 'grid2' },
      mk('knows_taranis', 'Knows Taranis', sel(c.knows_us,
        [['', 'not known'], ['yes', 'Yes'], ['vaguely', 'Vaguely'], ['no', 'No']])),
      mk('aum_band', 'Ticket band', txt(c.aum_band))),
    el('div', { class: 'grid2' },
      mk('status', 'Status', txt(c.status)),
      mk('region', 'Region', txt(c.region))),
    mk('next_step', 'Next step', txt(c.next_step)),
    mk('introducer_terms', 'Introducer terms', txt(c.introducer_terms)),
    mk('intelligence_text', 'What we know',
      el('textarea', { class: 'ta', style: 'min-height:120px' },
        asText(c.intelligence_text || c.raw_notes))));

  const save = el('button', { class: 'btn btn-sm' }, 'Save the changes');
  save.addEventListener('click', async () => {
    save.disabled = true; save.textContent = 'Saving\u2026';
    try {
      const patch = {};
      for (const k in F) {
        const v = String(F[k].value == null ? '' : F[k].value).trim();
        patch[k] = v === '' ? null : v;
      }
      if (!patch.name) throw new Error('A contact needs a name.');
      await supaPatch('contacts', 'id=eq.' + encodeURIComponent(c.id), patch);
      toast('Saved.');
      closeSheet();
      openProfile({ id: c.id, name: patch.name, email: patch.email });
    } catch (e) {
      toast(e.message, true);
      save.disabled = false; save.textContent = 'Save the changes';
    }
  });

  sheet('Edit ' + (c.name || 'contact'), [form], [
    save,
    el('button', { class: 'btn btn-sm btn-quiet', onclick: closeSheet }, 'Cancel')
  ]);
}

async function openProfile(c) {
  closeSheet();
  if (current !== 'profile') PROFILE_BACK = current;
  current = 'profile';
  document.querySelectorAll('.navbtn').forEach(b => b.setAttribute('aria-current', 'false'));

  // Built in a staged pane: the page swaps in when its record is drawn.
  return stagePane(async (body) => {
    $('pg-title').textContent = (c && c.name) || 'Contact';
    $('pg-sub').textContent = 'Reading the record\u2026';
    const host = el('div');
    body.appendChild(host);
    host.appendChild(el('p', { class: 'mono', style: 'color:var(--ink-3);font-size:12px' }, 'Loading\u2026'));

    if (c && c.knows_us === undefined) {
      try {
        const addr = String(c.email || c.addr || '').toLowerCase().trim();
        let hit = [];
        if (addr) {
          hit = await readRows('contacts_app', 'select=*&limit=1&email=ilike.' + encodeURIComponent(addr),
            'contacts.search', { q: c.name || '', filter: 'all' });
        }
        if (!hit.length && c.name) {
          hit = await readRows('contacts_app', 'select=*&limit=1' + ilikeAny(['name'], String(c.name)),
            'contacts.search', { q: c.name, filter: 'all' });
        }
        c = hit.length ? Object.assign({}, c, hit[0]) : Object.assign({}, c, { not_in_book: true });
      } catch (_) { /* show what we were given */ }
    }

    clear(host);
    $('pg-title').textContent = c.name || 'Contact';
    $('pg-sub').textContent = [c.role || c.title, c.company].filter(Boolean).join('  \u00B7  ')
      || 'Contact record';

    const back = el('div', { class: 'acts', style: 'margin-bottom:20px' },
      el('button', { class: 'btn btn-sm btn-quiet',
        onclick: () => go(PROFILE_BACK || 'contacts') }, '\u2190 Back'),
      c.not_in_book ? null : el('button', { class: 'btn btn-sm', onclick: () => editProfile(c) }, 'Edit'),
      el('button', { class: 'btn btn-sm',
        onclick: () => { PENDING.draft = c.name; go('email'); } }, 'Draft an email'),
      el('button', { class: 'btn btn-sm btn-quiet',
        onclick: () => { PENDING.meet = c.name; go('meetings'); } }, 'Book a Zoom'));
    host.appendChild(back);

    if (c.not_in_book) {
      host.appendChild(el('div', { class: 'banner' },
        el('b', null, 'Not in the contact book. '),
        'Everything below comes from email and notes rather than a contact record.'));
    }

    const field = (label, value, big) => {
      const t = asText(value);
      if (!t) return null;
      return el('div', { style: 'margin-bottom:' + (big ? '14px' : '11px') },
        el('div', { class: 'mono',
          style: 'font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--ink-3);margin-bottom:3px' },
          label),
        el('div', { style: 'font-size:' + (big ? '16px' : '14.5px')
          + ';font-weight:' + (big ? '600' : '500') + ';line-height:1.5' }, t));
    };
    const head = (t) => el('p', { class: 'mono',
      style: 'font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--ink-3);'
           + 'margin:28px 0 10px;padding-bottom:6px;border-bottom:1px solid var(--rule)' }, t);

    const dq = daysSince(c.last_contact_at || c.last_interaction);
    const grid = el('div', { class: 'grid2', style: 'max-width:820px' });
    const col1 = el('div'), col2 = el('div');
    grid.append(col1, col2);

    col1.append(...[
      field('Company', c.company, true),
      field('Email', c.email, true),
      field('Phone', c.phone || c.contact_phone, true),
      field('Role', c.role || c.title),
      field('Where', [c.city, c.country].filter(Boolean).join(', ')),
      field('Region', c.region)
    ].filter(Boolean));

    col2.append(...[
      field('Last email', (c.last_contact_at || c.last_interaction)
        ? fmtDate(c.last_contact_at || c.last_interaction) + (dq !== null ? '   (' + dq + ' days ago)' : '')
        : (String(c.email || '').trim() ? 'No email on record' : 'No email address on file'), true),
      field('Knows Taranis', c.knows_us),
      field('Side', c.side === 'taranis' ? 'Taranis' : c.side === 'external' ? 'Client' : c.side),
      field('Category', c.category),
      field('Status', c.status),
      field('Next step', c.next_step),
      field('Ticket band', c.aum_band),
      field('Introducer terms', c.introducer_terms),
      field('Exchanges', c.contact_count)
    ].filter(Boolean));

    host.appendChild(grid);

    const intel = asText(c.intelligence_text || c.raw_notes);
    if (intel) {
      host.append(head('What we know'), el('p', { style: 'max-width:820px;line-height:1.7' }, intel));
    }

    const loading = el('p', { class: 'mono', style: 'color:var(--ink-3);font-size:12px;margin-top:22px' },
      'Reading their email and notes\u2026');
    host.appendChild(loading);

    const addr = String(c.email || '').toLowerCase().trim();
    const nameLike = lk(c.name);

    const [mail, notes] = await Promise.all([
      (async () => {
        const out = new Map();
        const hasId = c.id !== undefined && c.id !== null && /^\d+$/.test(String(c.id));

        if (!hasId && !addr) return [];

        try {
          const ors = [];
          if (addr) ors.push('counterparty_addr.eq.' + encodeURIComponent(addr));
          if (hasId) ors.push('contact_id.eq.' + c.id);
          if (ors.length) {
            const rows = await supaSelect('crm_emails_app',
              'select=*&order=received_at.desc&limit=25&or=(' + ors.join(',') + ')');
            for (const m of rows) out.set(String(m.id), m);
          }
        } catch (_) { /* the raw table below still covers it */ }

        try {
          const ors = [];
          if (hasId) ors.push('contact_id.eq.' + c.id);
          if (addr) {
            const t = lk(addr);
            ors.push('from_addr.ilike.' + t, 'to_addr.ilike.' + t, 'cc_addr.ilike.' + t);
          }
          if (ors.length) {
            const rows = await supaSelect('crm_emails',
              'select=id,received_at,direction,from_addr,to_addr,cc_addr,subject,summary'
              + '&or=(' + ors.join(',') + ')&order=received_at.desc&limit=40');
            for (const m of rows) if (!out.has(String(m.id))) out.set(String(m.id), m);
          }
        } catch (_) {}

        return Array.from(out.values())
          .sort((x, y) => String(y.received_at || '').localeCompare(String(x.received_at || '')));
      })(),
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

    host.appendChild(head(mail.length
      ? (mail.length >= 25 ? '25+ emails' : mail.length + (mail.length === 1 ? ' email' : ' emails'))
      : 'No email on record'));
    if (!mail.length && !String(c.email || '').trim()) {
      host.appendChild(el('p', { class: 'mono', style: 'color:var(--ink-3);font-size:12px;margin:0' },
        'This record has no email address, so their correspondence cannot be matched to them. '
        + 'Add one with Edit and any email either way will appear here.'));
    }
    const clean = (v) => String(v || '').replace(/["<>]/g, '').replace(/\s+/g, ' ').trim();
    const onIt = (m) => {
      if (!addr) return '';
      const inF = String(m.from_addr || '').toLowerCase().indexOf(addr) > -1;
      const inT = String(m.to_addr || '').toLowerCase().indexOf(addr) > -1;
      const inC = String(m.cc_addr || '').toLowerCase().indexOf(addr) > -1;
      return inF ? 'they sent it' : inT ? 'sent to them' : inC ? 'copied in' : '';
    };

    for (const m of mail) {
      const out = String(m.direction || '').toLowerCase().indexOf('out') === 0
        || String(m.direction || '').toLowerCase() === 'sent';
      host.appendChild(entry({
        tone: 'quiet', rail: out ? 'sent' : 'in',
        action: m.subject || '(no subject)',
        who: fmtDate(m.received_at) + (onIt(m) ? '  ·  ' + onIt(m) : ''),
        evidence: [
          ['about ', m.summary],
          ['from  ', clean(m.from_addr)],
          ['to    ', clean(m.to_addr)],
          ['cc    ', clean(m.cc_addr)],
          ['intent', m.intent]
        ],
        actions: [
          { label: 'Read the email', primary: true, run: () => readEmail(m.id, m.subject) }
        ]
      }));
    }
  });
}

function foldPeople(rows) {
  const key = (c) => {
    const m = String(c.email || '').toLowerCase().trim();
    if (m) return 'm:' + m;
    return 'n:' + String(c.name || '').toLowerCase().replace(/\s+/g, ' ').trim()
      + '|' + String(c.company || '').toLowerCase().trim();
  };
  const filled = (c) => Object.keys(c).filter(k => {
    const v = c[k];
    return v !== null && v !== undefined && v !== '' &&
      !(Array.isArray(v) && !v.length);
  }).length;

  const groups = new Map();
  for (const c of rows) {
    const k = key(c);
    if (!k || k === 'n:|') { groups.set('x' + Math.random(), [c]); continue; }
    (groups.get(k) || groups.set(k, []).get(k)).push(c);
  }

  const out = [];
  for (const g of groups.values()) {
    if (g.length === 1) { out.push(g[0]); continue; }
    const sorted = g.slice().sort((x, y) => filled(y) - filled(x));
    const main = Object.assign({}, sorted[0]);
    for (const other of sorted.slice(1)) {
      for (const k in other) {
        const v = other[k];
        const cur = main[k];
        const emptyCur = cur === null || cur === undefined || cur === ''
          || (Array.isArray(cur) && !cur.length);
        if (emptyCur && v !== null && v !== undefined && v !== '') main[k] = v;
      }
    }
    main._merged = sorted.map(c => c.id).filter(v => v !== undefined && v !== null);
    out.push(main);
  }
  return out;
}

/* ------------------------------------------------ local mandate filters */

// WI sends some text as HTML (<p>, <em>). This keeps the words, one paragraph
// per line. DOMParser builds an inert document, so nothing in it runs.
function htmlToText(s) {
  const src = String(s == null ? '' : s);
  if (!/<[a-z!\/]/i.test(src)) return src.trim();
  const marked = src.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|h\d)>/gi, '\n');
  const doc = new DOMParser().parseFromString('<div>' + marked + '</div>', 'text/html');
  return String(doc.body.textContent || '').replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();
}

// A mandate's signals read the way the re-score reads them (sigText, so WI's
// profile summary never counts).
function mandateSignals(m) {
  const t = sigText(m);
  return {
    tech: isTech(t),
    strong: isStrong(m, t),
    emerging: m.open_to_emerging_managers === true,
    country: String(m.investor_country || '').trim().toUpperCase().slice(0, 2)
  };
}

// Mandates for the Ask page's local sourcing answers, one per investor, best
// score first. Every key is optional:
//   verdicts  ['uncertain', ...] on new_qualification, falling back to qualification
//   waiting   true: not approved yet
//   tech, strong  true or false: technology signal / stated long/short or quant
//   countries ['GB', 'CH', 'US']
//   emerging  true: open to emerging managers
async function localMandates(f) {
  const q = ['select=*', 'order=id.desc', 'limit=1000'];
  if (f.verdicts && f.verdicts.length) {
    const list = f.verdicts.join(',');
    q.push('or=(new_qualification.in.(' + list + '),'
      + 'and(new_qualification.is.null,qualification.in.(' + list + ')))');
  } else {
    q.push(VERDICT_OPEN);
  }
  if (f.waiting) q.push('approved_at=is.null');
  if (f.emerging) q.push('open_to_emerging_managers=is.true');
  const rows = await readRows('wi_mandates', q.join('&'), 'wi.mandates.list', { limit: 40 });
  const keep = (rows || []).filter(m => {
    const s = mandateSignals(m);
    if (f.tech !== undefined && s.tech !== f.tech) return false;
    if (f.strong !== undefined && s.strong !== f.strong) return false;
    if (f.countries && f.countries.length && f.countries.indexOf(s.country) < 0) return false;
    return true;
  });
  return sortMandates(dedupeInvestors(keep), 'best');
}

// The best With Intelligence page for an investor: its profile, else the
// intention, else the article.
function wiPageUrl(m) {
  for (const k of ['view_investor_url', 'view_intention_url', 'view_article_url']) {
    const u = String((m && m[k]) || '').trim();
    if (/^https?:\/\//i.test(u)) return u;
  }
  return '';
}

// The card shows one row per investor; when that row has no WI link, one of the
// investor's other alerts (_intentions, from dedupeInvestors) may.
function investorLink(m) {
  let url = wiPageUrl(m);
  for (const x of (m && m._intentions) || []) { if (url) break; url = wiPageUrl(x); }
  const name = investorLabel(m);
  return url ? el('a', { href: url, target: '_blank', rel: 'noopener noreferrer' }, name) : name;
}

// One readable line on why a mandate is interesting: the sentence of what they
// want that carries the signal asked for (re), else the first one, from the
// intention summary or WI's positive signals. Never a raw field dump. When no
// such sentence carries the signal, the word that raised it is named (label)
// so the line still says why the row is here.
function interestLine(m, re, label) {
  const own = legalName(m.investor_name).toLowerCase();
  const sentences = htmlToText(m.intention_summary).split(/(?<=[.!?])\s+|\n/)
    .map(s => s.trim())
    .filter(s => s && !/profile alert$/i.test(s) && s.toLowerCase() !== own);
  const signals = jsonArr(m.positive_signals).map(s => htmlToText(s)).filter(Boolean);
  const pick = (re && (sentences.find(s => re.test(s.toLowerCase()))
                     || signals.find(s => re.test(s.toLowerCase()))))
            || sentences[0] || signals[0] || '';
  let line = pick
    .replace(/^(the investor'?s |its )?primary investment themes( over the next 12-18 months)?( include| focus on)?:?\s*/i,
             'Themes for the next 12\u201318 months: ')
    .replace(/^themes over the next 12-18 months (include|focus on)\s*/i, 'Themes for the next 12\u201318 months: ');
  if (line.length > 180) line = line.slice(0, 180).replace(/\s+\S*$/, '') + '\u2026';
  if (re && label && !re.test(pick.toLowerCase())) {
    const hit = sigText(m).match(new RegExp('[a-z-]*(?:' + re.source + ')[a-z-]*'));
    if (hit) line = (line ? line + ' \u2014 ' : '') + label + ' signal: \u201C' + hit[0] + '\u201D';
  }
  return line;
}

// "What's waiting on me to decide?": the tech-rescue band. Waiting rows (in
// review, not approved) with a technology signal and no stated long/short or
// quant strategy.
async function answerTechWaiting(host) {
  const rows = await localMandates({ verdicts: ['uncertain'], waiting: true, tech: true, strong: false });
  if (!rows.length) {
    host.appendChild(el('p', null, 'Nothing is waiting on a decision with a technology angle.'));
    return;
  }
  host.appendChild(el('p', { class: 'mono',
    style: 'color:var(--ink-3);font-size:11px;letter-spacing:.14em;text-transform:uppercase;margin:0 0 6px' },
    rows.length + ' waiting on a decision \u00B7 technology angle, no long/short stated'));
  for (const x of rows) {
    host.appendChild(entry({
      tone: 'signal', record: x,
      action: investorLink(x),
      who: [asText(x.investor_type), geoText(x)].filter(Boolean).join('  \u00B7  '),
      evidence: [['why  ', interestLine(x, RE_TECH, 'technology') || 'WI gives no summary of what they want.']],
      actions: [{ label: 'View the mandate', primary: true, run: () => openMandate(x) }]
    }));
  }
}

async function answerLocally(host, question) {
  const words = searchTerms(question);
  const tries = [];
  if (words.length > 1) tries.push(words.slice(0, 3).join(' '));
  for (const w of words) tries.push(w);
  if (!tries.length) tries.push(String(question || '').trim());

  const low = String(question || '').toLowerCase();
  let groupSel = null, groupLabel = '';
  if (/overdue|follow.?up|chas|quiet|gone cold|owed/.test(low)) {
    groupSel = 'select=*&or=(has_open_next_step.is.true,days_quiet.gt.60)'
             + '&order=days_quiet.desc.nullslast&limit=40';
    groupLabel = 'Overdue a follow-up, longest wait first';
  } else if (/waiting on me|to decide/.test(low)) {
    await answerTechWaiting(host);
    return;
  } else if (/opportunit|mandate|approve/.test(low)) {
    const m = await readRows('wi_mandates',
      'select=id,investor_name,organization_name,investor_country,investor_type,fit_score,fit_reason'
      + '&qualification=eq.uncertain&published_at=is.null&order=new_fit_score.desc.nullslast,fit_score.desc.nullslast&limit=40',
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
        actions: [
          { label: 'View the mandate', primary: true, run: () => openMandate(x) },
          { label: 'See what is waiting', run: () => { oppsView = 'pending'; go('opps'); } }
        ]
      }));
    }
    return;
  }

  if (/deck|pitch|presentation|slide|factsheet|fact sheet|report|document|newsletter|weekly note|one pager|onepager|tms|gdn/.test(low)) {
    let docs = [];
    try {
      docs = await readRows('documents',
        'select=doc_key,title,version_label,period_date,public_url,is_current,uploaded_at'
        + '&order=uploaded_at.desc&limit=25', 'docs.list', {});
    } catch (_) { /* fall through to the ordinary search */ }

    if (docs.length) {
      const wantsLatest = /latest|newest|current|most recent|last/.test(low);

      const KINDS = [
        { re: /pitch|deck|desk/,            keys: ['deck', 'pitch'] },
        { re: /presentation|prez|slide/,    keys: ['presentation', 'prez', 'slide'] },
        { re: /fact\s?sheet/,               keys: ['factsheet', 'fact_sheet', 'fact sheet'] },
        { re: /weekly|newsletter/,          keys: ['weekly', 'newsletter', 'note'] },
        { re: /month/,                      keys: ['month'] },
        { re: /report/,                     keys: ['report'] },
        { re: /one\s?pager/,                keys: ['one_pager', 'onepager', 'pager'] },
        { re: /\btms\b/,                    keys: ['tms', 'taranis market sentiment'] },
        { re: /\bgdn\b/,                    keys: ['gdn'] }
      ];
      const groups = KINDS.filter(k => k.re.test(low));

      const matches = (d, needle) =>
        String(d.doc_key || '').toLowerCase().indexOf(needle) > -1 ||
        String(d.title || '').toLowerCase().indexOf(needle) > -1;

      let show = docs;
      if (groups.length) {
        const strict = docs.filter(d => groups.every(g => g.keys.some(k => matches(d, k))));
        if (strict.length) {
          show = strict;
        } else {
          const loose = docs.filter(d => groups.some(g => g.keys.some(k => matches(d, k))));
          if (loose.length) show = loose;
        }
      } else {
        const term = (searchTerms(question)[0] || '').toLowerCase();
        if (term.length > 2) {
          const hits = docs.filter(d => matches(d, term));
          if (hits.length) show = hits;
        }
      }

      const total = show.length;
      if (wantsLatest && show.length > 1) {
        const cur = show.filter(d => d.is_current);
        if (cur.length) show = cur;
        show = show.slice().sort((x, y) =>
          String(y.uploaded_at || '').localeCompare(String(x.uploaded_at || '')));
        show = [show[0]];
      }

      host.appendChild(el('p', { class: 'mono',
        style: 'color:var(--ink-3);font-size:11px;letter-spacing:.14em;text-transform:uppercase;margin:0 0 8px' },
        show.length === 1
          ? (wantsLatest && total > 1 ? 'The latest one' : 'One document')
          : show.length + ' documents'));

      for (const d of show.slice(0, 10)) {
        host.appendChild(entry({
          tone: d.is_current ? 'good' : 'quiet',
          rail: d.period_date ? String(d.period_date).slice(0, 7) : '',
          action: d.title || d.doc_key,
          who: [d.version_label, d.period_date ? fmtDate(d.period_date) : null].filter(Boolean).join('  \u00B7  '),
          evidence: [
            ['kind   ', String(d.doc_key || '').replace(/_/g, ' ')],
            ['added  ', fmtDate(d.uploaded_at)]
          ],
          tags: [d.is_current ? ['current version', 'good'] : ['superseded', 'quiet']],
          actions: d.public_url ? [
            { label: 'View the report', primary: true,
              run: () => window.open(d.public_url, '_blank', 'noopener,noreferrer') },
            { label: 'Copy the link', run: () => copy(d.public_url) }
          ] : []
        }));
      }
      if (wantsLatest && total > 1) {
        host.appendChild(el('p', { class: 'mono',
          style: 'color:var(--ink-3);font-size:12px;margin-top:12px' },
          (total - 1) + ' other ' + (total - 1 === 1 ? 'version is' : 'versions are')
          + ' stored. Open Documents to see them.'));
      }
      return;
    }
  }

  const wantsKnown = /knows? us|know taranis|knows taranis|heard of us/.test(low);

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
      people = foldPeople(
        await readRows('contacts_app', sel, 'contacts.search', { q: t || '', filter: 'all' }));
    } catch (e) {
      host.appendChild(el('div', { class: 'banner' }, el('b', null, 'Could not read. '), e.message));
      return;
    }
    if (people.length) {
      host.appendChild(el('p', { class: 'mono',
        style: 'color:var(--ink-3);font-size:11px;letter-spacing:.14em;text-transform:uppercase;margin:0 0 8px' },
        (groupLabel || (people.length + ' match \u201C' + t + '\u201D'))
        + (wantsKnown ? ', who already know us' : '')));

      if (people.length === 1) {
        await localDossier(host, people[0]);
        return;
      }

      for (const p of people) {
        const dq = daysSince(p.last_contact_at || p.last_interaction);
        host.appendChild(entry({
          tone: p.knows_us === 'yes' ? 'good' : p.knows_us === 'vaguely' ? 'signal' : '',
          rail: lastSpokenRail(dq),
          action: p.name,
          who: [p.role, p.company, p.city, p.country].filter(Boolean).join('  \u00B7  '),
          evidence: [
            ['last email ', lastSpoken(p, null)],
            ['about      ', p.last_contact_summary || p.last_contact_note],
            ['next step  ', p.next_step],
            ['knows us   ', p.knows_us],
            ['records    ', (p._merged && p._merged.length > 1)
                ? p._merged.length + ' duplicate records shown as one (#'
                  + p._merged.join(', #') + ')' : null]
          ],
          actions: [
            { label: 'View profile', primary: true, run: () => openProfile(p) },
            { label: 'Draft an email', run: () => { PENDING.draft = p.name; go('email'); } }
          ]
        }));
      }
      return;
    }
    if (groupSel) break;
  }

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
        action: investorLabel(m),
        who: [orgLabel(m), m.investor_country, m.investor_type].filter(Boolean).join('  \u00B7  '),
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

const FILLABLE = [
  ['investor_name',     'Investor name',        'text'],
  ['organization_name', 'Organisation',         'text'],
  ['investor_type',     'Investor type',        'text'],
  ['investor_country',  'Country',              'text'],
  ['investor_city',     'City',                 'text'],
  ['ticket_min_usd',    'Minimum ticket (USD)', 'number'],
  ['ticket_max_usd',    'Maximum ticket (USD)', 'number'],
  ['aum_usd',           'AUM (USD)',            'number'],
  ['strategies',        'Strategies',           'list'],
  ['asset_classes',     'Asset classes',        'list'],
  ['allocation_timing', 'Allocation timing',    'text'],
  ['contact_name',      'Contact name',         'text'],
  ['emails',            'Emails',               'lines'],
  ['linkedin_urls',     'LinkedIn URLs',        'lines'],
  ['view_article_url',  'Article URL',          'text'],
  ['view_intention_url','Intention URL',        'text'],
  ['view_investor_url', 'Investor page URL',    'text'],
  ['notes',             'Notes',                'text']
];

function fillSheet(m) {
  const who = (session && session.email) || 'console';
  const F = {}, was = {};
  const gapRows = [], filledRows = [];
  let total = 0;

  for (const [key, label, kind] of FILLABLE) {
    if (!(key in m)) continue;
    total++;
    const cur = m[key];
    const shown = kind === 'list'   ? asText(cur)
                : kind === 'lines'  ? jsonArr(cur).join('\n')
                : kind === 'number' ? num(cur)
                : (cur == null ? '' : String(cur));
    const empty = shown === '';
    was[key] = shown;

    let input;
    if (kind === 'lines') {
      input = el('textarea', { class: 'search', rows: '3',
        placeholder: empty ? 'one per line \u2014 add as many as you like' : 'one per line',
        style: 'min-height:78px;resize:vertical;font:inherit;line-height:1.5' });
    } else {
      input = el('input', {
        class: 'search',
        type: 'text',
        inputmode: kind === 'number' ? 'numeric' : 'text',
        placeholder: kind === 'list' ? 'comma separated'
                   : (empty ? 'not stated in the alert' : '')
      });
    }
    input.value = shown;
    if (kind === 'number') {
      input.addEventListener('blur', () => {
        const digits = input.value.replace(/[^0-9.-]/g, '');
        input.value = digits === '' ? '' : num(digits);
      });
    }
    F[key] = { input, kind };

    const row = el('label', { class: 'field' },
      el('span', null, label + (empty ? '' : '   \u2713')), input);
    (empty ? gapRows : filledRows).push(row);
  }

  const emptyCount = gapRows.length;

  const pair = (arr) => {
    const g = el('div');
    for (let i = 0; i < arr.length; i += 2) {
      g.appendChild(el('div', { class: 'grid2' }, arr[i], arr[i + 1] || el('div')));
    }
    return g;
  };
  const gapGrid    = pair(gapRows);
  const filledGrid = pair(filledRows);
  filledGrid.style.display = emptyCount ? 'none' : '';

  const grid = el('div', { style: 'min-width:min(720px,74vw)' });
  if (emptyCount) {
    grid.appendChild(el('p', { class: 'mono',
      style: 'font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--ink-3);margin:0 0 8px' },
      'To update'));
  }
  grid.appendChild(gapGrid);

  if (filledRows.length && emptyCount) {
    const toggle = el('label', {
      style: 'display:inline-flex;align-items:center;gap:8px;margin:14px 0 10px;'
           + 'font-size:12.5px;color:var(--ink-2);cursor:pointer' });
    const box = el('input', { type: 'checkbox' });
    box.addEventListener('change', () => { filledGrid.style.display = box.checked ? '' : 'none'; });
    toggle.append(box, el('span', null, 'Show ' + filledRows.length
      + (filledRows.length === 1 ? ' field already on file' : ' fields already on file')));
    grid.appendChild(toggle);
    grid.appendChild(filledGrid);
  } else if (filledRows.length) {
    grid.appendChild(filledGrid);
  }

  const head = el('p', { class: 'mono', style: 'font-size:12px;color:var(--ink-3);margin:0 0 14px' },
    emptyCount === 0
      ? 'Every field on this mandate is already filled. Anything you change here is recorded as a correction.'
      : emptyCount + ' of ' + total + ' fields were never stated in the alert. Fill any of them and the score updates on save.');

  const save = el('button', { class: 'btn btn-sm' }, 'Save what I filled in');
  save.addEventListener('click', async () => {
    const patch = {}, filled = [];
    for (const key in F) {
      const { input, kind } = F[key];
      const v = String(input.value == null ? '' : input.value).trim();
      if (v === was[key]) continue;
      if (kind === 'number') {
        patch[key] = v === '' ? null : Number(v.replace(/[^0-9.-]/g, ''));
      } else if (kind === 'list') {
        patch[key] = v === '' ? null : v.split(',').map(s => s.trim()).filter(Boolean);
      } else if (kind === 'lines') {
        patch[key] = v.split(/[\n,;]+/).map(s => s.trim()).filter(Boolean);
      } else {
        patch[key] = v === '' ? null : v;
      }
      filled.push(key);
    }
    if (!filled.length) { closeSheet(); return toast('Nothing changed.'); }

    if ('linkedin_urls' in patch) {
      patch.linkedin_url = (Array.isArray(patch.linkedin_urls) ? patch.linkedin_urls : [])[0] || null;
    }

    let src = m.field_sources;
    if (typeof src === 'string') { try { src = JSON.parse(src); } catch (_) { src = {}; } }
    if (!src || typeof src !== 'object') src = {};
    const at = new Date().toISOString();
    for (const k of filled) src[k] = { by: who, via: 'console', at: at };
    patch.field_sources = src;

    save.disabled = true; save.textContent = 'Saving\u2026';
    try {
      await supaPatch('wi_mandates', 'id=eq.' + encodeURIComponent(m.id), patch);
      Object.assign(m, patch);

      let scoreMsg = '';
      try {
        const isRej = String(m.qualification || '').toLowerCase() === 'rejected'
                   || String(m.new_qualification || '').toLowerCase() === 'rejected';
        let sp = null;
        if (m.new_qualification) {
          // Re-run the mandate rule on the corrected fields. A rejected row stays
          // rejected, and a field edit never rejects on its own — Reject does that.
          const r = rescore(m);
          if (isRej) {
            scoreMsg = '  Still rejected.';
          } else if (r.q === 'rejected') {
            scoreMsg = '  These fields now read as not a hedge-fund allocator \u2014 Reject it if you agree.';
          } else {
            sp = { new_qualification: r.q, new_fit_score: r.s, qualification: legacyQual(r.q) };
            if (r.s !== null) sp.fit_score = r.s;
            scoreMsg = r.s === null ? '  Still needs data: no strategy or technology signal.'
                                    : '  Score is now ' + scoreText(r.s) + ' (' + BAND_LABEL[r.q] + ').';
          }
        } else {
          const ns = Math.round(matchScore(m) * 100) / 100;
          sp = { fit_score: ns };
          if (!isRej) sp.qualification = ns >= 0.75 ? 'matched' : 'uncertain';
          scoreMsg = '  Score is now ' + scoreText(ns) + '.';
        }
        if (sp) {
          await supaPatch('wi_mandates', 'id=eq.' + encodeURIComponent(m.id), sp);
          Object.assign(m, sp);
        }
      } catch (_) { scoreMsg = ''; /* keep the field save even if the re-score write fails */ }

      toast((filled.length === 1 ? 'One field saved.' : filled.length + ' fields saved.') + scoreMsg);
      closeSheet();
      if (current === 'mandate') openMandate(m); else go(current);
    } catch (e) {
      toast(e.message, true);
      save.disabled = false; save.textContent = 'Save what I filled in';
    }
  });

  sheet('Fill the gaps on #' + m.id, [head, grid], [
    save, el('button', { class: 'btn btn-sm btn-quiet', onclick: closeSheet }, 'Cancel')
  ]);
}

function fillProvenance(m) {
  let src = m.field_sources;
  if (typeof src === 'string') { try { src = JSON.parse(src); } catch (_) { src = {}; } }
  if (!src || typeof src !== 'object') return [];
  const out = [];
  for (const k in src) {
    const s = src[k] || {};
    const label = (FILLABLE.find(f => f[0] === k) || [k, k])[1];
    out.push(label + ' \u2014 filled from ' + (s.via === 'telegram' ? 'Telegram' : s.via || 'the console')
      + (s.by ? ' by ' + s.by : '') + (s.at ? ' on ' + fmtDate(s.at) : ''));
  }
  return out;
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
  if (document.hidden) return;
  try {
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);

    const [n, opps] = await Promise.all([
      supaSelect('app_notifications', 'select=id&read_at=is.null&limit=200'),
      openOpportunityCount()
    ]);
    counts.today = n.length;
    counts.opps = opps;
    counts.approvals = 0;
    counts.network = await newConnectionCount();

    paintCounts();
  } catch (_) { /* a failed poll is not worth interrupting anyone */ }
}

function importSheet() {
  const pick = el('input', { type: 'file', class: 'search',
    accept: '.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const note = el('div', { style: 'margin-top:12px;font-size:13px;line-height:1.6;color:var(--ink-2)' });
  const go = el('button', { class: 'btn btn-sm', onclick: () => run() }, 'Read it');

  const explain = el('div', { style: 'font-size:13px;line-height:1.65;color:var(--ink-2)' },
    el('p', { style: 'margin:0 0 10px' },
      'Two sheets: investors, and their contacts joined on Investor ID. '
      + 'Every investor is screened against the Taranis criteria on the way in, '
      + 'so what appears in Opportunities is already sorted into matched, '
      + 'uncertain and rejected.'),
    el('p', { style: 'margin:0 0 10px' },
      'Contacts go to the contact book with their LinkedIn profiles, which is '
      + 'what makes warm introductions findable in Network.'),
    el('p', { style: 'margin:0;color:var(--ink-3)' },
      'Uploading the same export again updates those investors rather than '
      + 'duplicating them.'));

  sheet('Import an investor list', [explain, el('div', { style: 'margin-top:16px' }, pick), note],
    [go, el('button', { class: 'btn btn-sm btn-quiet', onclick: closeSheet }, 'Close')]);

  async function run() {
    const file = pick.files && pick.files[0];
    if (!file) return toast('Choose a file first.', true);

    go.disabled = true; go.textContent = 'Uploading\u2026';
    clear(note);
    try {
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '');
      const path = 'imports/' + stamp + '-' + file.name.replace(/[^\w.\-]/g, '_');
      await uploadToStorage(file, path, (pct) => { go.textContent = 'Uploading ' + pct + '%'; }, false);

      go.textContent = 'Reading it\u2026';
      await ensureToken();
      const res = await fetch(CFG.supabaseUrl + '/functions/v1/import-investors', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: CFG.supabaseAnonKey,
          Authorization: 'Bearer ' + session.token
        },
        body: JSON.stringify({ bucket: 'documents', path: path })
      });
      const out = await res.json().catch(() => ({}));

      clear(note);
      if (!out.ok) {
        note.appendChild(el('div', { class: 'callout bad' },
          el('span', { class: 'callout-k' }, 'Not imported'),
          el('span', { class: 'callout-v' }, out.message || ('The importer returned ' + res.status))));
        return;
      }

      note.appendChild(el('div', { class: 'callout good' },
        el('span', { class: 'callout-k' }, 'Done'),
        el('span', { class: 'callout-v' }, out.message)));

      const show = (title, names, tone) => {
        if (!names || !names.length) return;
        note.appendChild(el('p', { style: 'margin:14px 0 4px;font-size:11px;'
          + 'letter-spacing:.14em;text-transform:uppercase;color:var(--ink-3)' }, title));
        note.appendChild(el('div', { class: 'chips' },
          ...names.map(n => el('span', { class: 'tag ' + tone }, n))));
      };
      show('Written', out.written, 'good');
      show('Screened out', out.rejected, 'quiet');
      show('Skipped', out.skipped, 'bad');

      note.appendChild(el('div', { class: 'acts' },
        el('button', { class: 'btn btn-sm', onclick: () => { closeSheet(); go('opps'); } },
          'See them in Opportunities')));
    } catch (e) {
      clear(note);
      note.appendChild(el('div', { class: 'callout bad' },
        el('span', { class: 'callout-k' }, 'Failed'),
        el('span', { class: 'callout-v' }, e.message)));
    } finally {
      go.disabled = false; go.textContent = 'Read it';
    }
  }
}

/* ---- the profiles on the pipeline ---- */
const CONN_SEEN_KEY = 'taranis.profiles.seen';

function liHandle(v) {
  const m = String(v || '').match(/linkedin\.com\/in\/([^/?#\s]+)/i);
  return m ? decodeURIComponent(m[1]).toLowerCase().replace(/\/$/, '') : null;
}

function connSeen() {
  try {
    const raw = localStorage.getItem(CONN_SEEN_KEY);
    return raw ? new Set(JSON.parse(raw)) : null;
  } catch (_) { return null; }
}

function markConnSeen(handles) {
  try { localStorage.setItem(CONN_SEEN_KEY, JSON.stringify([...handles])); } catch (_) {}
  counts.network = 0; paintCounts();
}

async function connectionFeed() {
  const [mandates, conns, people] = await Promise.all([
    supaSelect('wi_mandates',
      'select=id,investor_name,organization_name,linkedin_url,qualification,'
      + 'investor_country,investor_city,fit_score,approved_at,source_kind,alert_date,seen_at'
      + '&limit=3000'),
    supaSelect('linkedin_mutual',
      'select=full_name,profile_url,mutual_to,mutual_count&limit=20000'),
    supaSelect('contacts',
      'select=id,name,company,role,email,linkedin_url,created_at'
      + '&linkedin_url=not.is.null&limit=20000')
  ]);

  const byHandle = {};
  for (const c of conns || []) {
    const h = liHandle(c.profile_url);
    if (h) byHandle[h] = c;
  }

  const byFirm = {};
  for (const m of mandates || []) {
    for (const n of [m.investor_name, m.organization_name]) {
      const k = String(n || '').toLowerCase().trim();
      if (k && !byFirm[k]) byFirm[k] = m;
    }
  }

  const seen = connSeen();
  const out = [];
  const used = {};

  const add = (row) => {
    if (!row.handle || used[row.handle]) return;
    used[row.handle] = true;
    out.push(row);
  };

  for (const p of people || []) {
    const h = liHandle(p.linkedin_url);
    if (!h) continue;
    const hit = byHandle[h];
    const via = hit
      ? (Array.isArray(hit.mutual_to) ? hit.mutual_to.filter(Boolean)
        : (hit.mutual_to ? [hit.mutual_to] : []))
      : [];
    add({
      handle: h,
      profile_url: p.linkedin_url,
      full_name: p.name || (hit && hit.full_name) || h,
      role: p.role || null,
      firm: p.company || null,
      contact: p,
      mandate: byFirm[String(p.company || '').toLowerCase().trim()] || null,
      via: via,
      shared: via.length ? (Number(hit.mutual_count) || via.length) : 0,
      when: p.created_at || null,
      isNew: seen ? !seen.has(h) : false
    });
  }

  for (const m of mandates || []) {
    const h = liHandle(m.linkedin_url);
    if (!h) continue;
    const hit = byHandle[h];
    const via = hit
      ? (Array.isArray(hit.mutual_to) ? hit.mutual_to.filter(Boolean)
        : (hit.mutual_to ? [hit.mutual_to] : []))
      : [];
    add({
      handle: h,
      profile_url: m.linkedin_url,
      full_name: (hit && hit.full_name) || investorLabel(m),
      role: null,
      firm: investorLabel(m),
      contact: null,
      mandate: m,
      via: via,
      shared: via.length ? (Number(hit.mutual_count) || via.length) : 0,
      when: m.alert_date || null,
      isNew: seen ? !seen.has(h) : false
    });
  }

  out.sort((a, b) =>
    (b.via.length ? 1 : 0) - (a.via.length ? 1 : 0) ||
    (b.isNew ? 1 : 0) - (a.isNew ? 1 : 0) ||
    String(b.when || '').localeCompare(String(a.when || '')));
  return out;
}

async function newConnectionCount() {
  try {
    const seen = connSeen();
    if (!seen) return 0;
    const [people, mandates] = await Promise.all([
      supaSelect('contacts', 'select=linkedin_url&linkedin_url=not.is.null&limit=20000'),
      supaSelect('wi_mandates', 'select=linkedin_url&linkedin_url=not.is.null&limit=3000')
    ]);
    const fresh = new Set();
    for (const r of [...(people || []), ...(mandates || [])]) {
      const h = liHandle(r.linkedin_url);
      if (h && !seen.has(h)) fresh.add(h);
    }
    return fresh.size;
  } catch (_) { return 0; }
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
      '     Last email 11 days ago. He asked for the track record net of fees and you have not\n' +
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
  go('opps');
  mountRefresh();
  if (!DEMO) {
    poll();
    pollTimer = setInterval(poll, Math.max(60, CFG.pollSeconds) * 1000);
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
    setKeepSignedIn(!!(keepBox && keepBox.checked));
    saveSession(await signInWithPassword(email, pass));
    $('gate-pass').value = '';
    $('gate-note').textContent = 'Only addresses on the allow list can sign in.';
    start();
  } catch (e) {
    $('gate-note').textContent = e.message;
  } finally { b.disabled = false; b.textContent = 'Sign in'; }
}

const keepBox = el('input', { type: 'checkbox', id: 'gate-keep' });
keepBox.checked = keepSignedIn()
  || (window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
const keepRow = el('p', { class: 'gate-note',
  style: 'display:flex;gap:8px;align-items:center;justify-content:center;margin-top:10px' },
  keepBox, el('label', { for: 'gate-keep', style: 'cursor:pointer' }, 'Keep me signed in on this device'));
const goBtn = $('gate-go');
if (goBtn && goBtn.parentElement) goBtn.parentElement.insertBefore(keepRow, goBtn.nextSibling);

$('gate-go').addEventListener('click', doSignIn);
$('gate-email').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('gate-pass').focus(); });
$('gate-pass').addEventListener('keydown', (e) => { if (e.key === 'Enter') doSignIn(); });

$('gate-demo').addEventListener('click', () => { DEMO = true; session = { email: 'sample' }; start(); });
$('signout').addEventListener('click', signOut);

/* ------------------------------------------------------ update watching */

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
  if (!CFG.build) return;
  const check = async () => {
    const b = await deployedBuild();
    if (b && b !== CFG.build) offerUpdate();
  };
  await check();
  setInterval(check, 5 * 60 * 1000);
}

/* ------------------------------------------------------------ installing */

let installPrompt = null;

function isStandalone() {
  return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches)
      || window.navigator.standalone === true;
}

function isiOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
      || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function showInstallBar() {
  if ($('installbar') || isStandalone()) return;
  const bar = el('div', {
    id: 'installbar',
    style: 'position:fixed;left:12px;right:12px;bottom:12px;z-index:120;max-width:520px;margin:0 auto;'
         + 'background:#0E1113;color:#DCE9EC;border:1px solid rgba(87,192,214,.3);border-radius:10px;'
         + 'padding:13px 15px;display:flex;gap:12px;align-items:center;'
         + 'box-shadow:0 14px 34px -14px rgba(0,0,0,.6)'
  });
  bar.appendChild(el('div', { style: 'flex:1;font-size:13.5px;line-height:1.45' },
    el('b', { style: 'display:block;font-size:14px;margin-bottom:2px' }, 'Put Taranis on your home screen'),
    installPrompt
      ? 'Opens without a browser bar, like an app.'
      : (isiOS()
          ? 'Tap the Share button below, then "Add to Home Screen".'
          : 'Open your browser menu and choose "Install app".')));

  if (installPrompt) {
    bar.appendChild(el('button', { class: 'btn btn-sm', style: 'flex:none', onclick: async () => {
      const p = installPrompt; installPrompt = null;
      bar.remove();
      try { p.prompt(); await p.userChoice; } catch (_) {}
    } }, 'Install'));
  }
  bar.appendChild(el('button', {
    class: 'btn btn-sm btn-quiet',
    style: 'flex:none;background:transparent;color:#8FB6C0;border-color:rgba(87,192,214,.3)',
    onclick: () => { bar.remove(); try { localStorage.setItem('taranis.noinstall', '1'); } catch (_) {} }
  }, 'Not now'));

  document.body.appendChild(bar);
}

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installPrompt = e;
  if (!isStandalone()) setTimeout(showInstallBar, 1500);
});

(function offerOniOS() {
  if (!isiOS() || isStandalone()) return;
  let dismissed = null;
  try { dismissed = localStorage.getItem('taranis.noinstall'); } catch (_) {}
  if (!dismissed) setTimeout(showInstallBar, 2500);
})();

watchForUpdates();

(async function boot() {
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
