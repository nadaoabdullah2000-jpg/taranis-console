// Builds TMS_LinkedIn_Competitive_Review.docx from data/*.csv and charts/*.png.
// usage: node build_word.js
const fs = require('fs');
const path = require('path');
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, ShadingType,
  ExternalHyperlink, ImageRun, AlignmentType, PageOrientation, LevelFormat, BorderStyle, TableOfContents,
  Header, Footer, PageNumber, PageBreak,
} = require('docx');

const HERE = __dirname;
const OUT = path.join(HERE, 'TMS_LinkedIn_Competitive_Review.docx');

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
const comp = D('competitors_all'), pages = D('pages_all'), pos = D('positioning_all'), cad = D('cadence_all'), li = D('linkedin_all');
const peers = D('swiss_peers'), voices = D('voices'), plan = D('plan_all'), mix = D('monchau_mix'), monthly = D('monchau_monthly');
const topics = D('monchau_topics'), react = D('monchau_reactions'), fmtE = D('monchau_format_engagement'), samples = D('monchau_samples'), raw = D('posts_raw_all');
const isT = r => /Taranis/.test(r.group || r.firm || r.competitor || r.author || '');

// ---------- content blocks
const title = [
  P([t('Taranis SA · Geneva · 27 October 2026', { size: 20, color: MUTED })], { after: 600, before: 1800 }),
  new Paragraph({ children: [new TextRun({ text: 'TMS LinkedIn Competitive Review', font: 'Georgia', size: 56, color: INK })], spacing: { after: 240 } }),
  P([t('Taranis Market Sentiment against Swiss and international peers: product pages, LinkedIn activity, the Monchau benchmark and an operating plan', { size: 26, color: MUTED })], { after: 600 }),
  P([t('Prepared for: ', { bold: true }), t('Taranis SA (Julien Leegenhoek, CEO; marketing and investor relations)')]),
  P([t('Data window: ', { bold: true }), t('LinkedIn 17 Jun – 17 Sep 2026 (13 weeks); product pages read 26–27 Oct 2026')]),
  P([t('Interactive dashboard: ', { bold: true }), t('dashboard.html (self-contained, in the same folder)')]),
  P([t('Raw data: ', { bold: true }), t('data/posts_raw_all.csv and the other CSVs in data/')]),
  P([t('Disambiguation: ', { bold: true }), t('"Taranis" here is Taranis SA, Geneva (FINMA-authorised asset manager, '), link('https://www.linkedin.com/company/taranis-sa', 'linkedin.com/company/taranis-sa'), t('). Not Perenco\'s Taranis energy assets and not the DFSA-registered Taranis Capital.')], { after: 200 }),
  new Paragraph({ children: [new PageBreak()] }),
  new TableOfContents('Contents', { hyperlink: true, headingStyleRange: '1-2' }),
  new Paragraph({ children: [new PageBreak()] }),
];

const exec = [
  H1('1. Executive summary'),
  bullet([t('TMS discloses the least of any peer. ', { bold: true }), t('Behind its professional-investor gate the TMS page shows three paragraphs and an award line: no performance, ISIN, fees, AUM, documents or team, and it does not state the two sleeves (2016 systematic sentiment engine, Dec 2025 discretionary tech/AI-disruption sleeve). Schroders (Contour) and UBP (Shannon River) show full performance behind the same kind of Swiss qualified-investor gate; AtonRâ, BIT and DECALIA\'s factsheet show it openly. Source: '), link('https://taranis.net/investment/tms', 'taranis.net/investment/tms'), t('.')]),
  bullet([t('Taranis posts least among active peers. ', { bold: true }), t('The company page posted 2 times in 13 weeks (0.15/week); DECALIA, the Swiss boutique bar, posted 30 (2.31/week); Pictet AM 89 (6.85/week, corporate-heavy). Contour, Jericho and Shannon River post nothing, confirmed by live web search, so the international TMT long/short channel is empty.')]),
  bullet([t('People carry reach, not company pages. ', { bold: true }), t('Symbit\'s page got 0 reactions on news its co-founder\'s reshare turned into 108; DECALIA\'s page best is 63 while its CIO\'s own post reached 153; Julien Leegenhoek\'s own posts get 48–64 while the Taranis page\'s reshares of them get 14.')]),
  bullet([t('Monchau is a curation engine to learn from, not copy. ', { bold: true }), t('About 81 posts a week, 86% credited to an outside "Source". His own-view and Syz-branded posts clear 54 reactions 5% of the time against 59% for curated posts. His most transferable asset is the single-chart post with a short read-through.')]),
  bullet([t('The Swiss tech-AI thesis lane is open. ', { bold: true }), t('AtonRâ writes the strongest original tech theses but gets 0–10 reactions per post; Pictet\'s Robotics and Digital PMs post nothing; only 13% of DECALIA\'s posts are about tech. A named founder with TV airtime can own the lane.')]),
];

const method = [
  H1('2. Scope, sources and method'),
  bullet([t('Competitor set: verified Swiss peers (AtonRâ Partners, DECALIA, Pictet AM), international structural twins and category peers (Symbit Capital, BIT Capital, Shannon River, Schroder GAIA Contour Tech Equity, Jericho Capital, Wellington Disruptive Technology & Innovation), plus a scan of Vontobel, GAM, Bellevue and Mirabaud.')]),
  bullet([t('LinkedIn: Crustdata /social_post/search. Cadence from free limit=0 count queries (actor id + actor type + date window 17 Jun – 17 Sep 2026); engagement and text from small paid pulls of top posts (about 47 credits across three rounds). Every query is logged in the companion CSVs.')]),
  bullet([t('Product pages: read with TinyFish (fetch and browser runs through Swiss qualified/professional-investor gates) and plain fetches on 26–27 Oct 2026; facts not on a page were taken from public factsheets or FT and are labelled as such.')]),
  bullet([t('Dates: every post\'s true date is decoded from its LinkedIn activity ID (id >> 22 = milliseconds since epoch), because the index\'s own dates are imputed for older posts and can drift by up to four weeks even in 2026.')]),
  H2('Caveats'),
  bullet('The Crustdata index ends around 17 Sep 2026 (only 471 posts platform-wide are dated after 18 Sep). LinkedIn\'s login wall blocked a live refresh with TinyFish, so posts after mid-September are not counted.'),
  bullet([t('AtonRâ shows 0 posts in the window, but this is an index gap: Crustdata entity 985778 is the right page, a live company post dated 30 Sep 2026 exists ('), link('https://www.linkedin.com/posts/atonra_invest-with-proof-not-faith-activity-7511080011416875008-nFgh', 'post'), t('), and atonra.ch published nine dated research notes between 2 Jul and 29 Sep 2026 ('), link('https://www.atonra.ch/investment-research', 'research hub'), t('). Its 2025 same-window rate (15 posts, 1.15/week) is used as the estimate.')]),
  bullet('Contour, Jericho and Shannon River read 0, and live web searches on 27 Oct found no posts of their own (only employee profiles and third-party press posts), so they are genuinely quiet rather than under-indexed.'),
  bullet('Pictet and DECALIA counts include corporate content (results, hires, interns, events). Topic shares are keyword matches; themes overlap and chart-only posts are missed.'),
  bullet('The index\'s "repost" label reflects how a post was crawled, not curation; curation is measured from "Source" credits in the text.'),
  bullet('Post images are linked, not embedded. Follower counts are mostly unavailable (Taranis 1,976 from the index; Monchau\'s 290,000+ is from a search snippet and unverified).'),
  bullet('Items from the brief that could not be reproduced are labelled where they appear: Monchau\'s Sep 1–16 hand-coded topic counts and format medians are shown as reference values; the "Anthropic conspiracy theories" post was not found (the index match was a Fort Knox post); the JPM "AI borrowers" post shows 1 share in the index, so "most-shared" is not borne out.'),
  bullet([t('Founding year: the brief says 2021; Crustdata lists 2020 and Julien Leegenhoek\'s Sep 2024 post refers to "founding Taranis four years ago" ('), link('https://www.linkedin.com/posts/julien-leegenhoek_withintellligence-liquidalternatives-alphagenerator-activity-7239259080861626368-FwAo', 'post'), t('). Not resolved.')]),
];

const set = [
  H1('3. Competitor set'),
  P('Swiss peers lead, then international funds. Wellington\'s disruptive-tech long/short launched in March 2020, last reported USD 10.6m (March 2021) and is no longer listed on wellington.com, so it appears closed and is kept only as a category reference.'),
  table([
    { key: 'group', label: 'Group', w: 9 }, { key: 'fund', label: 'Fund', w: 22, bold: true }, { key: 'manager', label: 'Manager', w: 12 }, { key: 'hq', label: 'HQ', w: 9 },
    { key: 'aum', label: 'AUM', w: 13 }, { key: 'aum_date', label: 'As of', w: 9 }, { key: 'strategy', label: 'Strategy', w: 26 }, { key: 'why_close', label: 'Why close to TMS', w: 19 },
    { key: 'status', label: 'Status', w: 14 }, { key: 'linkedin', label: 'LinkedIn', w: 8, linkLabel: () => 'LinkedIn' }, { key: 'source', label: 'Source', w: 11 },
  ], comp, { width: LAND_W, hl: r => r.group === 'Taranis', size: 15 }),
  caption('Crustdata company IDs: AtonRâ 985778, DECALIA 999635, Pictet AM 6035837, Symbit 74483772, BIT Capital 1120813, Shannon River 12895966, Contour 6803658, Jericho 1348019, Wellington 905379, Taranis 7865447.'),
  H2('Wider Swiss scan'),
  P('Only AtonRâ and Pictet run dedicated tech or AI products in Switzerland. Vontobel offers a multi-theme Megatrends fund; GAM runs the long-only Star Disruptive Growth; Bellevue is healthcare only; Mirabaud has no tech fund.'),
  table([{ key: 'firm', label: 'Firm', w: 10, bold: true }, { key: 'fund', label: 'Nearest fund', w: 26 }, { key: 'strategy', label: 'Strategy', w: 26 }, { key: 'performance_disclosure', label: 'Performance', w: 14 }, { key: 'linkedin_posts_per_week', label: 'LinkedIn / week', w: 10, num: true }, { key: 'url', label: 'Page', w: 14 }], peers, { width: LAND_W }),
];

const fundCols = Object.keys(pages[0]).slice(1);
const pagesTable = (cols) => table([{ key: 'attribute', label: 'Attribute', w: 13, bold: true }, ...cols.map(c => ({ key: c, label: c, w: 20 }))], pages, { width: LAND_W, size: 14 });
const posParas = pos.map(r => P([t(r.firm + '. ', { bold: true }), t(r.summary + ' '), link(r.page_url, host(r.page_url))], { after: 140 }));

const pagesSec = [
  H1('4. Deliverable A: product-page teardown'),
  P([t('The key contrast: ', { bold: true }), t('TMS sits behind a three-step gate (country, professional/retail, "I Accept") that is in line with Schroders and UBP, but behind it the page shows no performance, fund facts or team and does not state its two sleeves. Schroders shows Contour\'s discrete annual returns, a 5-year figure, a monthly factsheet, the KID and prospectus behind its Swiss qualified-investor gate; UBP shows Shannon River\'s NAV and returns from MTD to inception plus the full document library behind its own. The gate is not the problem; what sits behind it is.')]),
  H2('Comparison, part 1: Swiss peers and Taranis'),
  pagesTable(['AtonRâ', 'DECALIA', 'Pictet AM', 'Taranis TMS']),
  spacer(),
  H2('Comparison, part 2: international funds and Taranis'),
  pagesTable(['Symbit', 'BIT Capital', 'Shannon River (UBP)', 'Contour (Schroders)', 'Jericho', 'Taranis TMS']),
  caption('Wellington DTI is omitted from part 2 because no current fund page exists. Full per-cell sources: step2_product_pages_research.md and swiss_A_product_pages_research.md in the report folders.'),
  H2('Positioning summaries'),
  ...posParas,
];

const liSec = [
  H1('5. Deliverable B: LinkedIn activity'),
  P('Posts per week for every account in the 13-week window. The axis is capped at 16 posts a week; Monchau\'s bar is cut and labelled with his real rate.'),
  image('c-cad.png', 860),
  caption('Source: Crustdata /social_post/search count queries, 17 Jun – 17 Sep 2026 (cadence_all.csv).'),
  H2('Channel, cadence, format and best post by competitor'),
  table([
    { key: 'competitor', label: 'Competitor', w: 12, bold: true }, { key: 'channel', label: 'Channel', w: 14 }, { key: 'posts_per_week', label: 'Posts / week', w: 8 },
    { key: 'dominant_format', label: 'Dominant format', w: 13 }, { key: 'original_vs_curated', label: 'Original vs curated', w: 13 }, { key: 'median_reactions', label: 'Median reactions', w: 8 },
    { key: 'best_post_reactions', label: 'Best post', w: 7, num: true }, { key: 'best_post_url', label: 'Link', w: 7, linkLabel: postLabel }, { key: 'lesson', label: 'What Taranis can learn / where the gap is', w: 26 },
  ], li, { width: LAND_W, hl: r => r.group === 'Taranis', size: 15 }),
  H2('Per-competitor notes'),
  bullet([t('AtonRâ: ', { bold: true }), t('long, data-dense, original theses (China tech, grid infrastructure, AI capex) that link to its own research, but 0–10 reactions each, and some posts quote YTD performance ("up 10.3% YTD and 60% since launch"), '), link('https://www.linkedin.com/posts/atonra_thematicinvesting-atonra-chinatech-activity-7455499972474753025-B7ws', 'example'), t('. Staff (BD lead Victor Marchand, head of quant Tony Guida) post occasionally with 4–9 reactions.')]),
  bullet([t('DECALIA: ', { bold: true }), t('lumpy but steady (0 in late June, 10 in July, 14 in August, 6 in early September), FR and EN, mostly events, people and conference recaps; 0 "Source" credits. CIO Fabrizio Quirighetti\'s light Geneva post reached 153 ('), link('https://www.linkedin.com/posts/fabrizio-quirighetti_playmobil-g7-suisse-activity-7472977106063486976-Dvvg', 'post'), t(') and his AI-economics take "Are you token to me?" 43 ('), link('https://www.linkedin.com/posts/fabrizio-quirighetti_bloomberg-ai-mag7-activity-7480640956753547264-v_r0', 'post'), t(').')]),
  bullet([t('Pictet AM: ', { bold: true }), t('steady (36 in July, 37 in August), image- and video-led (47 and 24 of 89), 76% original, about 26% tech/AI by keyword. Its AI-enhanced ETF launch drew 141 reactions ('), link('https://www.linkedin.com/posts/pictet-asset-management_we-are-launching-our-first-european-range-activity-7477986927124860928-vZy_', 'post'), t(') with a capital-risk warning in the post. Thematic PMs (Portner, Lingen, Tsang, Gladwyn) posted 0.')]),
  bullet([t('Symbit: ', { bold: true }), t('company page posts get 0 reactions; co-founder Marius Skrondal\'s one-line reshare of the same roadshow news got 108 ('), link('https://www.linkedin.com/posts/marius-skrondal_we-just-wrapped-a-week-on-the-road-meeting-activity-7474749100635176960-0GyQ', 'post'), t(').')]),
  bullet([t('BIT Capital: ', { bold: true }), t('about one post a week in German, built on NAV milestones and founder Jan Beckers\' podcasts, each with a risk disclaimer; best 195 ('), link('https://www.linkedin.com/posts/bit-capital-gmbh_bitcapital-technologyinvesting-ucits-activity-7470861891536355330-zCqW', 'post'), t(').')]),
  bullet([t('Shannon River, Contour, Jericho: ', { bold: true }), t('no posts of their own (Shannon River\'s page has 161 followers per a search snippet). Jericho appears only through press reshared by others, e.g. Institutional Investor ('), link('https://www.linkedin.com/posts/institutional-investor_jerichos-high-conviction-playbook-shows-activity-7477818522937663489-RhMU', 'post'), t(').')]),
  bullet([t('Taranis: ', { bold: true }), t('the company page mainly reshares Julien\'s BFM Business TV clips in French (14 reactions each in the window); his own posts reach 48–64 ('), link('https://www.linkedin.com/posts/julien-leegenhoek_ai-tech-investment-activity-7453425812810358784-PdDb', 'example'), t(').')]),
];

const monSec = [
  H1('6. Monchau deep-dive'),
  P([t('Charles-Henry Monchau, CIO of Syz Group ('), link('https://www.linkedin.com/in/charles-henry-monchau-cfa-cmt-caia-4003096', 'profile'), t('; Crustdata person 28667460). 1,051 posts in the 13-week window, about 81 a week (11.5 a day). Voice: curator first, educational and data-driven; cautious and hawkish on rates, constructive on AI; broadcast style.')]),
  H2('a. Average posts per day by month'),
  image('c-month.png', 440),
  caption('Q1 5.5/day → June 11.8 → July 18.5 → August 5.9 (summer) → Sep 1–16 8.5. The July spike is not verified post by post.'),
  H2('b. Curated vs own view'),
  image('c-mix.png', 440),
  caption('86% of posts (1,074 of 1,244, Jun 1 – Sep 16) credit a "Source"; 59% of those clear 54 reactions. Only 4 of 78 own-view or Syz-branded posts ("my take", "our view", "Syz") do.'),
  H2('c. Topic mix'),
  image('c-top.png', 440),
  caption('Grey: Sep 1–16 hand-coded reference from the brief (136 posts; Other ~18%). Blue: Jun 1 – Sep 16 keyword counts (1,244 posts). Keyword matching undercounts chart-only posts.'),
  H2('d. Reaction distribution'),
  image('c-react.png', 440),
  caption('Share of all 1,244 posts at or above each reaction count; median about 65–70.'),
  H2('e. Engagement by format'),
  image('c-fmt.png', 440),
  caption('Estimated median reactions from threshold counts: video ~300 (78 posts), image ~66 (1,112), document ~25 (45); articles too few (2). The brief\'s Sep reference medians were video ~130, image 54, document 25, article 24. Video\'s high median comes from viral reshared clips: only 4 of his 23 own videos clear 54.'),
  H2('Sample posts'),
  table([{ key: 'post', label: 'Post', w: 24, bold: true }, { key: 'reactions', label: 'Reactions', w: 10, num: true }, { key: 'note', label: 'Note', w: 50 }, { key: 'url', label: 'Link', w: 12, linkLabel: postLabel }], samples),
  spacer(),
  P([t('What to borrow: ', { bold: true }), t('the single stat-dense chart with a 5–7 line read-through ("Hyperscaler debt is exploding", 230 reactions, 21 shares) and synthesis posts that join two stories ("Dear Donald": oil supply shock plus AI capex competing with Treasuries). What not to borrow: volume, humour reshares and unattributed curation, which work at his scale and not at about 2,000 followers.')]),
];

const voiceSec = [
  H1('7. Famous tech voices'),
  P('Benchmark their formats, not their reaction counts: their audiences are in the millions. Counts are Crustdata, 17 Jun – 17 Sep 2026, by profile URL.'),
  table([{ key: 'name', label: 'Voice', w: 12, bold: true }, { key: 'posts_per_week', label: 'Posts / week', w: 8, num: true }, { key: 'dominant_format_top3', label: 'Top formats', w: 16 }, { key: 'best_post_reactions', label: 'Best post', w: 9, num: true }, { key: 'best_post_url', label: 'Link', w: 8, linkLabel: postLabel }, { key: 'what_taranis_can_borrow', label: 'What Taranis can borrow', w: 40 }], voices, { width: LAND_W }),
];

const sw = (h, items) => new TableCell({ width: { size: Math.floor(PORTRAIT_W / 2), type: WidthType.DXA }, margins: { top: 100, bottom: 100, left: 120, right: 120 },
  borders: { top: { style: BorderStyle.SINGLE, size: 4, color: LINE }, bottom: { style: BorderStyle.SINGLE, size: 4, color: LINE }, left: { style: BorderStyle.SINGLE, size: 4, color: LINE }, right: { style: BorderStyle.SINGLE, size: 4, color: LINE } },
  children: [P([t(h, { bold: true, color: ACCENT })], { after: 80 }), ...items.map(i => bullet(i))] });
const swot = new Table({ width: { size: PORTRAIT_W, type: WidthType.DXA }, columnWidths: [Math.floor(PORTRAIT_W / 2), PORTRAIT_W - Math.floor(PORTRAIT_W / 2)], rows: [
  new TableRow({ cantSplit: true, children: [sw('Strengths', ['The only tech long/short with a behavioural-sentiment quant overlay in the set', 'Founder-CEO with BFM Business airtime; his own posts already beat the page (64 vs 14)', 'Award history and a clear AI-disruption thesis']),
                            sw('Weaknesses', ['0.15 posts a week, the lowest among active peers; the page mirrors TV clips', 'Recent posts are French-only; 1,976 followers', 'Product page shows no facts, performance, sleeves or team; award label says "Managed Futures"'])] }),
  new TableRow({ cantSplit: true, children: [sw('Opportunities', ['Close competitors are silent: Contour, Jericho, Shannon River post nothing; Symbit\'s page gets 0', 'No Swiss tech-AI personal voice with reach (Pictet PMs 0 posts, AtonRâ 0–10 reactions, DECALIA 13% tech)', 'A proprietary weekly sentiment read no peer can copy']),
                            sw('Threats', ['BIT and AtonRâ already tell the human + AI story with numbers', 'Symbit occupies "Swiss + AI + long/short"; Pictet markets AI-enhanced equity at scale', 'FinSA limits public performance talk'])] }),
] });

const recSec = [
  H1('8. SWOT and recommendations'),
  swot,
  spacer(),
  H2('Recommendations'),
  numbered([t('Benchmark cadence against DECALIA, not zero (Swiss). ', { bold: true }), t('Lift the company page from 0.15 to at least 2.3 posts a week: a weekly TMS sentiment-gauge chart plus one fund, event or BFM post. DECALIA posted 30 times in the window; Taranis 2.')]),
  numbered([t('Take the tech-AI thesis lane AtonRâ has vacated (Swiss). ', { bold: true }), t('One original AI-disruption thesis a week under Julien\'s name: chart first, three lines of read-through, link to a short note. AtonRâ owns the format but not the audience (0–10 reactions; nothing indexed since April); Pictet\'s tech PMs are absent.')]),
  numbered([t('Lead through Julien Leegenhoek. ', { bold: true }), t('He is the primary voice at about 3 posts a week (including the thesis); a partner such as Antoine Megarbane covers allocators every two weeks; the company page re-shares with a one-line frame. Evidence: Symbit 0 vs 108, DECALIA 63 vs 153, Taranis 14 vs 64.')]),
  numbered([t('Point of view over curation. ', { bold: true }), t('About 80/20 original to curated, and curate only to frame a TMS view. Monchau\'s curation works at his scale; his own-view posts clear 54 reactions 5% of the time, so Taranis wins on a distinct view, not volume.')]),
  numbered([t('Post in English first, French second. ', { bold: true }), t('Allocators read English; keep French for Romandie and the BFM clips. Recent Taranis posts are French-only, while DECALIA and Pictet run four languages.')]),
  numbered([t('Fix the product page before pushing traffic. ', { bold: true }), t('Add vehicle, ISIN, fees, liquidity, the two sleeves and their weights, named PMs, a factsheet behind the existing gate and a "request factsheet / book a call" CTA; relabel the "Managed Futures" award and align the public /investment intro ("alternative data and a systematic overlay") with the gated text.')]),
  numbered([t('Compliant by design. ', { bold: true }), t('A one-line risk warning on fund posts (as Pictet and BIT do), no performance numbers in posts (unlike AtonRâ), and one Compliance pre-approval of the weekly chart template.')]),
  H2('Operating plan'),
  table([{ key: 'lever', label: 'Lever', w: 18, bold: true }, { key: 'recommendation', label: 'Recommendation', w: 38 }, { key: 'target_posts_per_week', label: 'Target / week', w: 9, num: true }, { key: 'evidence', label: 'Evidence', w: 30 }], plan),
  spacer(),
  P([t('Measure monthly: ', { bold: true }), t('re-run the free count queries (count_queries.csv, count_queries_swiss.csv) once the index catches up. Three-month targets: company page at least 2.3 posts a week; Julien at least 1 original thesis a week; median at least 25 reactions on Julien\'s originals (Pictet\'s company-page median).')]),
];

const rawSec = [
  H1('Appendix A. Raw posts'),
  P(`All ${raw.length} posts pulled for this review, sorted by author. True dates are decoded from LinkedIn activity IDs. Text is truncated; the full CSV is data/posts_raw_all.csv.`),
  table([{ key: 'author', label: 'Author', w: 18, bold: true }, { key: 'true_date_utc', label: 'Date', w: 9 }, { key: 'format', label: 'Format', w: 7 }, { key: 'reactions', label: 'React.', w: 6, num: true }, { key: 'comments', label: 'Com.', w: 5, num: true }, { key: 'shares', label: 'Shr.', w: 5, num: true }, { key: 'text', label: 'Text (truncated)', w: 42 }, { key: 'url', label: 'Link', w: 8, linkLabel: postLabel }],
    raw.map(r => ({ ...r, text: r.text.length > 160 ? r.text.slice(0, 157) + '…' : r.text })), { width: LAND_W, size: 14, hl: r => /Taranis|Leegenhoek/.test(r.author) }),
];

const srcSec = [
  H1('Appendix B. Key sources'),
  ...[
    ['Taranis TMS page (gated)', 'https://taranis.net/investment/tms'], ['Taranis investment overview', 'https://taranis.net/investment'],
    ['AtonRâ AI & Robotics', 'https://www.atonra.ch/investment-funds/ai-robotics'], ['AtonRâ research hub', 'https://www.atonra.ch/investment-research'],
    ['DECALIA Future SOCIETY factsheet', 'https://funds-static.pictet.com/funds/decalia/factsheet/MR_ES_en_LU2407358063_YES_2026-05-31.pdf'], ['DECALIA PM interview (finews)', 'https://www.finews.com/news/english-news/74003-decalia-future-society-fund-interview-quirien-lemey-iana-perova'],
    ['Pictet Robotics', 'https://am.pictet.com/ch/en/intermediaries/funds/pictet-robotics/LU1279334210'], ['Pictet TR-Atlas Titan', 'https://am.pictet.com/ch/en/institutions/funds/pictet-tr-atlas-titan/LU2206555984'],
    ['Symbit launch (Hedgeweek)', 'https://hedgeweek.com/news/new-york-investment-veterans-launch-ai-native-hedge-fund-in-switzerland'], ['BIT Global Technology Opportunities', 'https://bitcap.com/en/fonds/bit-global-technology-opportunities'],
    ['U Access (IRL) Shannon River UCITS (UBP)', 'https://www.ubp.com/en/asset-management/funds/ie00bkdrxc08'], ['Contour Asset Management', 'https://www.contourasset.com/index'],
    ['Schroder GAIA Contour Tech Equity (finanzen.ch)', 'https://www.finanzen.ch/fonds/schroder-gaia-contour-tech-equity-a1-lu1725199464'], ['Jericho Capital', 'https://www.jerichocap.com'],
    ['Wellington DTI launch (Investment Week)', 'https://www.investmentweek.co.uk/news/4014116/wellington-launches-long-short-disruptive-tech-fund'], ['Crustdata pricing / API', 'https://docs.crustdata.com/general/pricing'],
  ].map(([l, u]) => bullet([t(l + ': '), link(u, host(u) + new URL(u).pathname.slice(0, 60))])),
];

// ---------- document
const header = new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [t('TMS LinkedIn Competitive Review · 27 Oct 2026', { size: 16, color: MUTED })] })] });
const footer = new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ children: ['Page ', PageNumber.CURRENT], font: FONT, size: 16, color: MUTED })] })] });
const portrait = { page: { size: { width: A4.width, height: A4.height }, margin: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN } } };
const landscape = { page: { size: { width: A4.width, height: A4.height, orientation: PageOrientation.LANDSCAPE }, margin: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN } } };
const sec = (props, children) => ({ properties: props, headers: { default: header }, footers: { default: footer }, children });

const doc = new Document({
  creator: 'Taranis SA', title: 'TMS LinkedIn Competitive Review', description: 'Competitive review of Taranis Market Sentiment vs Swiss and international peers',
  features: { updateFields: true },
  styles: {
    default: { document: { run: { font: FONT, size: 20 } } },
    paragraphStyles: [
      { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: 'Georgia', size: 34, color: INK }, paragraph: { spacing: { before: 240, after: 120 }, outlineLevel: 0 } },
      { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: FONT, size: 24, bold: true, color: '2F3338' }, paragraph: { spacing: { before: 200, after: 100 }, outlineLevel: 1 } },
    ],
  },
  numbering: { config: [
    { reference: 'bullets', levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 360, hanging: 260 } } } }, { level: 1, format: LevelFormat.BULLET, text: '–', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 260 } } } }] },
    { reference: 'numbers', levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 400, hanging: 300 } } } }] },
  ] },
  sections: [
    sec(portrait, [...title, ...exec, ...method]),
    sec(landscape, [...set, ...pagesSec]),
    sec(landscape, liSec),
    sec(portrait, [...monSec, ...recSec]),
    sec(landscape, [...voiceSec, ...rawSec]),
    sec(portrait, srcSec),
  ],
});

Packer.toBuffer(doc).then(b => { fs.writeFileSync(OUT, b); console.log(OUT, b.length, 'bytes'); });
