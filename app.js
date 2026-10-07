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
  link.href = 'https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600&family=Inter:wght@300;400;500;600&display=swap';
  document.head.appendChild(link);
  const style = document.createElement('style');
  style.id = 'taranis-fonts';
  style.textContent =
    "@font-face{font-family:'GT Flexa Extended';src:url('fonts/GT-Flexa-Extended-Regular.woff2') format('woff2');font-weight:400;font-display:swap}"
  + "@font-face{font-family:'GT Flexa Extended';src:url('fonts/GT-Flexa-Extended-Medium.woff2') format('woff2');font-weight:500;font-display:swap}"
  + "@font-face{font-family:'Aktiv Grotesk';src:url('fonts/AktivGrotesk-Light.woff2') format('woff2');font-weight:300;font-display:swap}"
  + "@font-face{font-family:'Aktiv Grotesk';src:url('fonts/AktivGrotesk-Regular.woff2') format('woff2');font-weight:400;font-display:swap}"
  + "@font-face{font-family:'Aktiv Grotesk';src:url('fonts/AktivGrotesk-Medium.woff2') format('woff2');font-weight:500;font-display:swap}"
  + "html body,body input,body select,body textarea,body button{font-family:'Aktiv Grotesk','Inter',system-ui,sans-serif}"
  + ".mono{font-family:'Aktiv Grotesk','Inter',system-ui,sans-serif;font-variant-numeric:tabular-nums lining-nums}"
  + "html #pg-title,.word,.rpt-kpi .v,.rpt-oc .sc b{font-family:'GT Flexa Extended','Archivo',system-ui,sans-serif}";
  document.head.appendChild(style);
}

function ensureCardStyle() {
  if (document.getElementById('taranis-cards')) return;
  const s = document.createElement('style');
  s.id = 'taranis-cards';
  s.textContent =
    "#pg-body{background:#F3F7FA}"
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
      + "margin:0 0 14px;transition:box-shadow .16s ease}"
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

/* ==__CONTINUES__: Part 2 appends below this line (do not deploy until the
   marker is gone and the file ends at the boot() IIFE). == */
