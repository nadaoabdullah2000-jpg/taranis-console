// Builds TMS_vs_Tech_LS_Hedge_Funds.docx from data/*.csv and charts/*.png.
// usage: node build_word.js
const fs = require('fs');
const path = require('path');
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, ShadingType,
  ExternalHyperlink, ImageRun, AlignmentType, PageOrientation, LevelFormat, BorderStyle, TableOfContents,
  Header, Footer, PageNumber, PageBreak,
} = require('docx');

const HERE = __dirname;
const OUT = path.join(HERE, 'TMS_vs_Tech_LS_Hedge_Funds.docx');

// ---------- CSV
function parseCSV(text) {
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
    else if (c !== '\r') cur += c;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  const [h, ...b] = rows.filter(r => r.length > 1 || r[0] !== '');
  return b.map(r => Object.fromEntries(h.map((k, i) => [k, r[i] ?? ''])));
}
const D = n => parseCSV(fs.readFileSync(path.join(HERE, 'data', n + '.csv'), 'utf8'));

// ---------- page geometry (A4, DXA)
const A4 = { width: 11906, height: 16838 };
const MARGIN = 1134; // 2 cm
const PORTRAIT_W = A4.width - 2 * MARGIN;   // 9638
const LAND_W = A4.height - 2 * MARGIN;      // 14570

// ---------- palette & helpers
const INK = '1C1D1F', MUTED = '64656B', ACCENT = '2A78D6', TAR = 'EB6834', HEAD_BG = 'EEF2F7', TAR_BG = 'FDEFE8', LINE = 'D9D8D2';
const FONT = 'Calibri';

const t = (text, o = {}) => new TextRun({ text: String(text), font: FONT, size: o.size || 20, bold: o.bold, italics: o.italics, color: o.color || INK });
const link = (url, label, size = 20) => new ExternalHyperlink({ link: url, children: [new TextRun({ text: label || url, style: 'Hyperlink', font: FONT, size })] });
const P = (children, o = {}) => new Paragraph({ children: Array.isArray(children) ? children : [t(children, o)], spacing: { after: o.after ?? 120, before: o.before ?? 0, line: 276 }, alignment: o.align, keepNext: o.keepNext });
const H1 = s => new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: s, font: FONT })], spacing: { before: 240, after: 120 }, pageBreakBefore: false });
const H2 = s => new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: s, font: FONT })], spacing: { before: 200, after: 100 }, keepNext: true });
const bullet = (children, lvl = 0) => new Paragraph({ numbering: { reference: 'bullets', level: lvl }, children: Array.isArray(children) ? children : [t(children)], spacing: { after: 80, line: 276 } });
const numbered = (children) => new Paragraph({ numbering: { reference: 'numbers', level: 0 }, children: Array.isArray(children) ? children : [t(children)], spacing: { after: 100, line: 276 } });
const host = u => { try { return new URL(u).hostname.replace('www.', ''); } catch { return u; } };
const isUrl = v => /^https?:\/\//.test(v);
const postLabel = u => /\/company\/[^/]+\/?$/.test(u) ? 'Open page' : (/linkedin\.com\/(posts|feed)/.test(u) ? 'Open post' : host(u));

// table(cols: [{key,label,w,num,link,linkLabel}], rows, {width, hl})
function table(cols, rows, opt = {}) {
  const width = opt.width || PORTRAIT_W;
  const total = cols.reduce((s, c) => s + c.w, 0);
  const widths = cols.map(c => Math.floor(c.w / total * width));
  widths[widths.length - 1] += width - widths.reduce((a, b) => a + b, 0);
  const size = opt.size || 16;
  const border = { style: BorderStyle.SINGLE, size: 4, color: LINE };
  const borders = { top: border, bottom: border, left: border, right: border };
  const cell = (children, w, shade, align) => new TableCell({
    width: { size: w, type: WidthType.DXA }, borders, margins: { top: 60, bottom: 60, left: 90, right: 90 },
    shading: shade ? { type: ShadingType.CLEAR, color: 'auto', fill: shade } : undefined,
    children: [new Paragraph({ children, alignment: align, spacing: { after: 0, line: 252 } })],
  });
  const head = new TableRow({ tableHeader: true, children: cols.map((c, i) => cell([t(c.label, { bold: true, size, color: '33363B' })], widths[i], HEAD_BG, c.num ? AlignmentType.RIGHT : undefined)) });
  const body = rows.map(r => {
    const shade = opt.hl && opt.hl(r) ? TAR_BG : undefined;
    return new TableRow({ cantSplit: true, children: cols.map((c, i) => {
      const v = r[c.key] ?? '';
      let kids;
      if (v && isUrl(v)) kids = [link(v, c.linkLabel ? c.linkLabel(v) : host(v), size)];
      else kids = [t(v, { size, bold: c.bold })];
      return cell(kids, widths[i], shade, c.num ? AlignmentType.RIGHT : undefined);
    }) });
  });
  return new Table({ width: { size: width, type: WidthType.DXA }, columnWidths: widths, rows: [head, ...body] });
}
const caption = s => P([t(s, { size: 16, italics: true, color: MUTED })], { after: 200 });
function image(file, widthPx) {
  const buf = fs.readFileSync(path.join(HERE, 'charts', file));
  const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
  return new Paragraph({ children: [new ImageRun({ type: 'png', data: buf, transformation: { width: widthPx, height: Math.round(widthPx * h / w) }, altText: { title: file, description: file, name: file } })], spacing: { after: 80 }, alignment: AlignmentType.CENTER });
}
const spacer = () => P('', { after: 60 });

// ---------- data
const FS = D('focus_set'), PC = D('pages_compare'), POS = D('positioning'), LI = D('linkedin_table'), CQ = D('count_queries');
const PLAN = D('plan'), RAW = D('posts_raw'), TVF = D('tech_voices_frequency'), VO = D('voices'), MIX = D('monchau_mix'), PP = D('product_pages');
const sources = (s, label) => String(s || '').split(/\s;\s|\s+/).filter(isUrl).map(u => u.replace(/[),;]+$/, '')).filter((u, i, a) => a.indexOf(u) === i);

const title = [
  P([t('Taranis SA · Geneva · 28 October 2026', { size: 20, color: MUTED })], { after: 600, before: 1800 }),
  new Paragraph({ children: [new TextRun({ text: 'TMS vs Tech Long/Short Hedge Funds', font: 'Georgia', size: 56, color: INK })], spacing: { after: 240 } }),
  P([t('Product-page teardown and LinkedIn activity of Cadian, Atreides, Alkeon, Sylebra and Whale Rock against Taranis Market Sentiment, with Monchau and famous tech voices as benchmarks, a SWOT and an operating plan', { size: 26, color: MUTED })], { after: 600 }),
  P([t('Subject: ', { bold: true }), t('Taranis Market Sentiment (TMS), Taranis SA, Geneva (CEO/founder Julien Leegenhoek); '), link('https://www.linkedin.com/company/taranis-sa', 'linkedin.com/company/taranis-sa'), t('. Not Perenco\'s Taranis energy assets and not the DFSA-registered Taranis Capital.')]),
  P([t('Data window: ', { bold: true }), t('LinkedIn 17 Jun – 17 Sep 2026 (13 weeks, Crustdata index) plus a live check to 28 Oct; sites and Form ADV checked 28 Oct 2026')]),
  P([t('Companion files: ', { bold: true }), t('dashboard.html (self-contained), data/*.csv, including posts_raw.csv and count_queries.csv')]),
  new Paragraph({ children: [new PageBreak()] }),
  new TableOfContents('Contents', { hyperlink: true, headingStyleRange: '1-2' }),
  new Paragraph({ children: [new PageBreak()] }),
];

const exec = [
  H1('1. Executive summary'),
  bullet([t('The tech long/short hedge-fund peer set is essentially silent on LinkedIn. ', { bold: true }), t('In 13 weeks the five company pages published one post between them: Whale Rock\'s intern class (233 reactions). Cadian, Atreides and Alkeon have never posted on their pages; Sylebra last posted in 2023. Their founders are silent too (Gavin Baker 1 post; Bannasch, Gibson and Sacerdote 0).')]),
  bullet([t('Atreides is not the active exception. ', { bold: true }), t('Its page has no indexed posts ever and a live search found none. Gavin Baker\'s visibility comes from other people\'s channels (podcasts, NVIDIA GTC, the Sohn conference), not his own posts. The only tech funds that post regularly are the benchmarks, Coatue (4.85 a week) and Altimeter (2.23).')]),
  bullet([t('The lane is open, and no direct Swiss peer exists. ', { bold: true }), t('Taranis\'s page (2 posts) and Julien Leegenhoek (back to posting since 23 Sep on BFM and RTS) already out-post every focus fund. No fund publishes an AI-disruption or market-sentiment thesis, and all five are US- or Asia-based.')]),
  bullet([t('Peer sites are minimal by design; the TMS page undersells. ', { bold: true }), t('Cadian and Whale Rock run one-paragraph holding pages, Atreides shows its full team, Alkeon a VC portfolio wall. TMS sits behind a 3-step gate and then shows no fund facts, team or two-sleeve structure, and its award still reads "Managed Futures Newcomer of the Year 2023".')]),
  bullet([t('Four of five pass the hard filter; Sylebra is at risk. ', { bold: true }), t('Sylebra\'s site now presents "Sylebra Growth Partners", a growth-equity firm, and its hedge fund appears only in Form ADV data as of 31 Dec 2025. Alkeon (also a UCITS fund and registered sub-advisory) and Whale Rock (also long-only vehicles) are kept on their private hedge funds only.')]),
];

const method = [
  H1('2. Scope, sources and method'),
  bullet('Hard filter: private technology/TMT long/short equity hedge fund for professional, qualified or accredited investors; UCITS/retail classes, signal vendors, long-only and pure VC/PE excluded. Each fund was re-checked on its live site (TinyFish render, 28 Oct) and in Form ADV data.'),
  bullet(`LinkedIn: Crustdata /social_post/search counts (free, limit=0) by company id and actor type, window 17 Jun – 17 Sep 2026; founders by profile URL after verifying each profile by web search. ${CQ.length} queries are logged in data/count_queries.csv. One paid pull (0.5 credit) fetched Whale Rock's only window post.`),
  bullet('Live refresh: TinyFish web search for public linkedin.com/posts pages after 17 Sep, read with TinyFish fetch. True dates are decoded from each post\'s activity ID (id >> 22 = milliseconds since epoch).'),
  bullet('Curation is measured from "Source", "via" or "credit" in the post text, not the index\'s "repost" label.'),
  H2('Caveats'),
  bullet('The Crustdata index ends around 17 Sep 2026. LinkedIn\'s login wall blocked fetches of the Atreides and Whale Rock company pages and Gavin Baker\'s profile, so posts after 17 Sep there cannot be fully ruled out; the live search found none. Logged-out pages show comments but not reaction totals.'),
  bullet('Hedge-fund sites are holding or login pages by design; this is recorded as a finding. adviserinfo.sec.gov was unreachable from this environment, so Form ADV facts come from aggregators (privatefunddata, Radient, formds, FINTRX) with the official links given by CRD number.'),
  bullet('AUM figures conflict for every fund (regulatory vs discretionary vs 13F vs press). Each is shown with its source; none is resolved.'),
  bullet('Whale Rock posted on 18 May, 2 Jun and 9 Jun, just before the window, so 13 weeks understates its usual pace. Its intern post is dated 12 Aug in the index and 3 Aug by its post ID.'),
  bullet('Alkeon founder Panayotis Sparaggis has no findable LinkedIn profile. Monchau figures use his 1 Jun – 27 Oct window: counts to 17 Sep (1,244 posts), live sample after; his 290k+ follower count is from a search snippet and unverified.'),
];

const setSec = [
  H1('3. Focus set and hard-filter verification'),
  table([{ key: 'fund', label: 'Fund', w: 12, bold: true }, { key: 'hq', label: 'HQ', w: 9 }, { key: 'founded', label: 'Est.', w: 4 }, { key: 'strategy', label: 'Strategy', w: 18 }, { key: 'founder', label: 'Founder / CIO', w: 8 },
    { key: 'aum', label: 'AUM (Form ADV)', w: 11 }, { key: 'aum_date', label: 'As of', w: 8 }, { key: 'hedge_fund', label: 'Hedge fund', w: 5 }, { key: 'professional_only', label: 'Prof. only', w: 5 }, { key: 'tech_focused', label: 'Tech', w: 5 },
    { key: 'filter_result', label: 'Filter', w: 7 }, { key: 'flag', label: 'Flag', w: 14 }, { key: 'aum_source', label: 'Source', w: 7 }], FS, { width: LAND_W, size: 14, hl: r => r.filter_result === 'At risk' }),
  caption('✓ pass · ⚠ conflict or flag · ✓ partial = tech-led but multi-sector. Crustdata company ids: Cadian 988803, Atreides 990159, Alkeon 1544140, Sylebra 983853, Whale Rock 993750; Taranis 7865447.'),
  H2('Evidence behind each check'),
  ...PP.filter(r => !r.fund.startsWith('Taranis')).flatMap(r => [
    P([t(r.fund + '. ', { bold: true }), t('Hedge fund: ' + r.hedge_fund_check.replace(/\s*\(https?:[^)]*\)/g, '') + ' Professional-only: ' + r.professional_only_check.replace(/\s*\(https?:[^)]*\)/g, '') + ' Tech focus: ' + r.tech_focused_check.replace(/\s*\(https?:[^)]*\)/g, '')), t(' Sources: '),
      ...sources(r.hedge_fund_check + ' ' + r.professional_only_check + ' ' + r.adv_or_13f_link).slice(0, 4).flatMap((u, i) => [i ? t(' · ') : t(''), link(u, host(u))])], { after: 100 }),
    P([t('AUM conflicts and flags: ', { bold: true }), t(r.notes.replace(/\s*\(https?:[^)]*\)/g, ''))], { after: 160 }),
  ]),
];

const pagesSec = [
  H1('4. Product / strategy-page teardown'),
  P('Rows are attributes and columns are funds; Taranis is the last column. Full cells with their source links are in data/product_pages.csv.'),
  table([{ key: 'attribute', label: 'Attribute', w: 10, bold: true }, ...['Cadian', 'Atreides', 'Alkeon', 'Sylebra', 'Whale Rock', 'Taranis TMS'].map(c => ({ key: c, label: c, w: 15 }))],
    PC.filter(r => !['Notes and flags', 'AUM (Form ADV, latest)'].includes(r.attribute)).map(r => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, isUrl(v) ? v : String(v).replace(/\s*\(https?:[^)]*\)/g, '').replace(/https?:\/\/\S+/g, '').slice(0, 260)]))), { width: LAND_W, size: 13 }),
  H2('Positioning summaries'),
  ...POS.map(r => P([t(r.fund + '. ', { bold: true }), t(r.summary + ' '), link(r.page_url, host(r.page_url))], { after: 140 })),
  P([t('Contrast with TMS: ', { bold: true }), t('every peer page is thin, but each tells the visitor one true thing (Atreides: the team; Alkeon: the portfolio; Whale Rock: 20 years in TMT). The TMS page asks for three clicks and then says less about the fund than any of them: no fund facts, no team, no statement of the two sleeves, and an award labelled "Managed Futures".')]),
];

const liSec = [
  H1('5. LinkedIn activity'),
  image('c-cad.png', 600),
  table([{ key: 'account', label: 'Account', w: 11, bold: true }, { key: 'group', label: 'Group', w: 7 }, { key: 'channel', label: 'Channel', w: 22 }, { key: 'posts_13w', label: 'Posts 13 wk', w: 5, num: true }, { key: 'posts_per_week', label: 'Per week', w: 5, num: true },
    { key: 'lifetime_posts', label: 'Posts ever', w: 5, num: true }, { key: 'dominant_format', label: 'Format', w: 8 }, { key: 'original_vs_curated', label: 'Original vs curated', w: 8 }, { key: 'best_post_reactions', label: 'Best post', w: 5, num: true },
    { key: 'best_post_url', label: 'Link', w: 5, linkLabel: postLabel }, { key: 'lesson', label: 'What Taranis can learn / gap', w: 19 }], LI, { width: LAND_W, size: 14, hl: r => r.group === 'Subject' }),
  caption('Formats, curation and reaction thresholds were counted for every fund; for the four funds with no window posts all breakdowns are 0. Coatue and Altimeter are benchmarks for how a tech fund can post, not peers.'),
  H2('Posts after the index (17 Sep – 28 Oct, live check)'),
  table([{ key: 'author', label: 'Author', w: 16, bold: true }, { key: 'true_date_utc', label: 'Date', w: 8 }, { key: 'format', label: 'Format', w: 10 }, { key: 'reactions', label: 'Reactions', w: 7, num: true }, { key: 'comments', label: 'Comments', w: 7, num: true },
    { key: 'text_truncated', label: 'Post (opening)', w: 42 }, { key: 'url', label: 'Link', w: 7, linkLabel: () => 'Open post' }], RAW.filter(r => r.true_date_utc > '2026-09-17' && !/Monchau/.test(r.author)), { width: LAND_W, size: 14 }),
  caption('No posts by the five funds or their founders were found after 17 Sep; all live posts found are Taranis-related.'),
];

const monSec = [
  H1('6. Benchmark: Charles-Henry Monchau'),
  P([t('Context, not a peer: Monchau (Syz Group CIO, '), link('https://www.linkedin.com/in/charles-henry-monchau-cfa-cmt-caia-4003096', 'profile'), t(`) is the "loud individual voice" model. Window 1 Jun – 27 Oct 2026: from 1 Jun to 17 Sep (the index end) he published 1,244 posts (about 81 a week, 11.5 a day); 18 Sep – 27 Oct is covered by a live sample. ${Math.round(100 * MIX[0].posts / (+MIX[0].posts + +MIX[1].posts))}% credit a "Source"; only 4 of 78 own-view or Syz-branded posts cleared 54 reactions. Tech/AI is 26% of posts by the narrow keyword rule (328 of 1,244) and about 39–41% with a wide net of tech names and themes; tech posts beat his average only slightly (+7–8% at 25 and 54 reactions) and go viral less often, because his viral outliers are humour.`)]),
  image('c-month.png', 440), image('c-mix.png', 440), image('c-top.png', 440), image('c-react.png', 440), image('c-fmt.png', 440), image('c-tech.png', 440),
  P([t('Reading for Taranis: ', { bold: true }), t('copy the chart-first image format (his most reliable, 57% of image posts clear 54 reactions), not the volume or the curation.')]),
];

const voiceSec = [
  H1('7. Famous tech voices, by format'),
  P('Their audiences are in the millions, so formats matter more than reactions. None posts as often as Monchau (the most frequent, Eduardo Ordax, posts 19 a week) and none credits sources as much (6–19% against his 86%).'),
  table([{ key: 'name', label: 'Voice', w: 18, bold: true }, { key: 'posts_per_week', label: 'Posts / week', w: 7, num: true }, { key: 'cs', label: 'Credits a source', w: 7, num: true }, { key: 'top_format', label: 'Top format', w: 7 }, { key: 'top_url', label: 'Top post', w: 7, linkLabel: () => 'Open post' }, { key: 'authorship_signal', label: 'Own voice or curator?', w: 30 }],
    TVF.map(r => ({ ...r, cs: r.credited_share === '' ? 'n/a' : Math.round(100 * r.credited_share) + '%' })), { width: LAND_W, size: 14, hl: r => /Monchau/.test(r.name) }),
  spacer(),
  table([{ key: 'name', label: 'Voice', w: 14, bold: true }, { key: 'posts_per_week', label: 'Posts / week', w: 7, num: true }, { key: 'dominant_format_top3', label: 'Top formats', w: 16 }, { key: 'best_post_url', label: 'Best post', w: 7, linkLabel: () => 'Open post' }, { key: 'what_taranis_can_borrow', label: 'What Taranis can borrow', w: 40 }], VO, { width: LAND_W, size: 14 }),
];

const sw = (h, items) => new TableCell({ width: { size: Math.floor(PORTRAIT_W / 2), type: WidthType.DXA }, margins: { top: 100, bottom: 100, left: 120, right: 120 },
  borders: { top: { style: BorderStyle.SINGLE, size: 4, color: LINE }, bottom: { style: BorderStyle.SINGLE, size: 4, color: LINE }, left: { style: BorderStyle.SINGLE, size: 4, color: LINE }, right: { style: BorderStyle.SINGLE, size: 4, color: LINE } },
  children: [P([t(h, { bold: true, color: ACCENT })], { after: 80 }), ...items.map(i => bullet(i))] });
const swot = new Table({ width: { size: PORTRAIT_W, type: WidthType.DXA }, columnWidths: [Math.floor(PORTRAIT_W / 2), PORTRAIT_W - Math.floor(PORTRAIT_W / 2)], rows: [
  new TableRow({ cantSplit: true, children: [sw('Strengths', ['The only fund in the set with a behavioural-sentiment quant engine (since 2016) beside discretionary tech picking', 'Founder-CEO with BFM Business and RTS airtime, posting again since 23 Sep', 'Already posts more than all five peers; HFM award history']),
    sw('Weaknesses', ['0.15 posts a week on the page; posts mostly in French', 'Product page hides fund facts, team and the two sleeves; award labelled "Managed Futures"', 'Much smaller than the peers (USD 2.7–25bn regulatory AUM)'])] }),
  new TableRow({ cantSplit: true, children: [sw('Opportunities', ['The tech long/short hedge-fund peer set is silent on LinkedIn: the lane is open', 'Nobody publishes an AI-disruption or market-sentiment thesis', 'No direct Swiss peer in the set']),
    sw('Threats', ['Founders like Gavin Baker win reach through podcasts and conferences without posting', 'Coatue and Altimeter set the bar for how a tech fund communicates', 'FinSA limits public performance talk'])] }),
] });

const recSec = [
  H1('8. SWOT and recommendations'),
  swot, spacer(),
  H2('Recommendations'),
  numbered([t('Lead through Julien Leegenhoek as an individual voice. ', { bold: true }), t('The founder-as-brand model of Atreides (Baker on podcasts and stages) and Altimeter (Gerstner on TV and LinkedIn): every BFM or RTS appearance becomes a post by Julien with one quoted claim, and the company page reshares. His posts already beat the page (19–28 reactions against <25).')]),
  numbered([t('Own the empty AI-disruption + market-sentiment thesis lane. ', { bold: true }), t('A weekly "Sentiment vs disruption" post: what the 2016 sentiment engine reads on one AI or semiconductor theme, and what the discretionary sleeve thinks of it. None of the five peers publishes either half.')]),
  numbered([t('Cadence 3–5 posts a week. ', { bold: true }), t('About 2–3 from Julien and 1–2 from the page: above Altimeter (2.2), below Coatue (4.85), never Monchau\'s 81.')]),
  numbered([t('One-line thesis plus one chart. ', { bold: true }), t('Open with a single claim and carry one chart or clip, Coatue style; Monchau\'s image posts are his most reliable format. English first, French second.')]),
  numbered([t('Fix the product page. ', { bold: true }), t('State the two sleeves and their weights, name the PMs, add vehicle, a factsheet behind the existing gate and a "request factsheet" CTA, and relabel the "Managed Futures" award.')]),
  numbered([t('Milestones as events. ', { bold: true }), t('Awards, hires (e.g. Paul Monsigny, 15 Oct) and TV slots posted with a number; Whale Rock\'s rare milestone posts still draw about 230 reactions.')]),
  numbered([t('Compliant by design. ', { bold: true }), t('A one-line risk warning on fund posts, no performance numbers in posts, one Compliance pre-approval of the weekly template.')]),
  H2('Operating plan'),
  table([{ key: 'lever', label: 'Lever', w: 18, bold: true }, { key: 'recommendation', label: 'Recommendation', w: 40 }, { key: 'target_posts_per_week', label: 'Target / week', w: 9 }, { key: 'evidence', label: 'Evidence', w: 33 }], PLAN, { size: 15 }),
];

const rawSec = [
  H1('Appendix A. Raw posts'),
  P(`${RAW.length} posts used in this review (data/posts_raw.csv). True dates are decoded from LinkedIn activity IDs; text is truncated.`),
  table([{ key: 'author', label: 'Author', w: 16, bold: true }, { key: 'true_date_utc', label: 'Date', w: 8 }, { key: 'format', label: 'Format', w: 9 }, { key: 'reactions', label: 'React.', w: 5, num: true }, { key: 'comments', label: 'Com.', w: 5, num: true }, { key: 'shares', label: 'Shr.', w: 5, num: true },
    { key: 'text_truncated', label: 'Text (truncated)', w: 37 }, { key: 'url', label: 'Link', w: 6, linkLabel: () => 'Open post' }, { key: 'source', label: 'Source', w: 9 }], RAW, { width: LAND_W, size: 13, hl: r => /Taranis|Leegenhoek/.test(r.author) }),
  H1('Appendix B. Crustdata query log'),
  P(`Every Crustdata query (${CQ.length}), with result and credits. Total credits spent: ${CQ.reduce((s, r) => s + (+r.credits_spent || 0), 0)}.`),
  table([{ key: 'query_id', label: 'Id', w: 5 }, { key: 'entity', label: 'Entity', w: 12, bold: true }, { key: 'filters_summary', label: 'Filters', w: 45 }, { key: 'date_from', label: 'From', w: 8 }, { key: 'date_to', label: 'To', w: 8 }, { key: 'result_count', label: 'Result', w: 6, num: true }, { key: 'status', label: 'Status', w: 9 }, { key: 'credits_spent', label: 'Credits', w: 6, num: true }],
    CQ.map(r => ({ ...r, filters_summary: r.filters_summary.slice(0, 160) })), { width: LAND_W, size: 12 }),
];

const header = new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [t('TMS vs Tech Long/Short Hedge Funds · 28 Oct 2026', { size: 16, color: MUTED })] })] });
const footer = new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ children: ['Page ', PageNumber.CURRENT], font: FONT, size: 16, color: MUTED })] })] });
const portrait = { page: { size: { width: A4.width, height: A4.height }, margin: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN } } };
const landscape = { page: { size: { width: A4.width, height: A4.height, orientation: PageOrientation.LANDSCAPE }, margin: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN } } };
const sec = (props, children) => ({ properties: props, headers: { default: header }, footers: { default: footer }, children });

const doc = new Document({
  creator: 'Taranis SA', title: 'TMS vs Tech Long/Short Hedge Funds', description: 'Product pages and LinkedIn activity of five tech long/short hedge funds vs Taranis Market Sentiment',
  features: { updateFields: true },
  styles: {
    default: { document: { run: { font: FONT, size: 20 } } },
    paragraphStyles: [
      { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: 'Georgia', size: 34, color: INK }, paragraph: { spacing: { before: 240, after: 120 }, outlineLevel: 0 } },
      { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: FONT, size: 24, bold: true, color: '2F3338' }, paragraph: { spacing: { before: 200, after: 100 }, outlineLevel: 1 } },
    ],
  },
  numbering: { config: [
    { reference: 'bullets', levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 360, hanging: 260 } } } }] },
    { reference: 'numbers', levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 400, hanging: 300 } } } }] },
  ] },
  sections: [
    sec(portrait, [...title, ...exec, ...method]),
    sec(landscape, [...setSec, ...pagesSec, ...liSec]),
    sec(portrait, monSec),
    sec(landscape, voiceSec),
    sec(portrait, recSec),
    sec(landscape, rawSec),
  ],
});

Packer.toBuffer(doc).then(b => { fs.writeFileSync(OUT, b); console.log(OUT, b.length, 'bytes'); });
