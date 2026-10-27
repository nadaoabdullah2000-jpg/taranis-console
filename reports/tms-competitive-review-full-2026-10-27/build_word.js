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

// ---------- 27 Oct update: institutional hedge funds, Monchau tech, high-frequency tech voices
const hfc = D('hf_competitors'), hfl = D('hf_linkedin'), hfp = D('hf_posts_sample');
const mtv = D('monchau_tech_vs_other'), mtm = D('monchau_tech_monthly'), mts = D('monchau_tech_samples'), tvf = D('tech_voices_frequency');
const hfSamples = (fund) => table([{ key: 'author', label: 'Author', w: 16, bold: true }, { key: 'true_date_utc', label: 'Date', w: 9 }, { key: 'format', label: 'Format', w: 7 }, { key: 'reactions', label: 'Reactions', w: 8, num: true }, { key: 'comments', label: 'Comments', w: 8, num: true }, { key: 'shares', label: 'Shares', w: 7, num: true }, { key: 'text', label: 'Post (excerpt)', w: 45 }, { key: 'url', label: 'Link', w: 8, linkLabel: postLabel }],
  hfp.filter(r => r.author.startsWith(fund.split(' ')[0]) || (fund === 'Altimeter Capital' && /Gerstner/.test(r.author)) || (fund === 'Light Street Capital' && /Kacher/.test(r.author))), { width: LAND_W, size: 15 });

const hfSet = [
  H1('4. Focus set: five institutional tech hedge funds'),
  P('At the client\'s request the competitor set is now five institutional (non-retail) technology hedge funds. All are US-based and far larger than Taranis, so they are benchmarks for positioning and communication rather than like-for-like rivals. AUM figures come from regulatory filings or aggregators and are not comparable across firms (regulatory AUM, 13F long book and firm-stated AUM measure different things).'),
  table([{ key: 'fund', label: 'Fund', w: 12, bold: true }, { key: 'hq', label: 'HQ', w: 9 }, { key: 'founded', label: 'Founded', w: 6 }, { key: 'aum', label: 'AUM (as reported)', w: 20 }, { key: 'aum_source', label: 'AUM source', w: 8 }, { key: 'strategy', label: 'Strategy', w: 20 }, { key: 'founder', label: 'Founder / CIO', w: 10 }, { key: 'founder_linkedin', label: 'Founder LinkedIn', w: 8, linkLabel: () => 'Profile' }, { key: 'linkedin', label: 'Company LinkedIn', w: 8, linkLabel: () => 'Page' }],
    hfc, { width: LAND_W, size: 15 }),
  caption('Crustdata company IDs: Jericho 1348019, Light Street 991218, Whale Rock 993750, Coatue 1033880, Altimeter 992773. AUM: aggregator figures (aum13f, altss, thetrading.tools, QuiverQuant) and Whale Rock\'s own LinkedIn post; verify against SEC Form ADV before external use.'),
  H2('Websites: structure, gate and disclosure'),
  table([{ key: 'fund', label: 'Fund', w: 12, bold: true }, { key: 'website', label: 'Website', w: 10 }, { key: 'website_type', label: 'What the site shows', w: 48 }, { key: 'gate', label: 'Gate', w: 14 }],
    hfc.map(r => ({ ...r, website: r.site })), { width: LAND_W, size: 15 }),
  spacer(),
  P([t('Contrast with TMS: ', { bold: true }), t('none of the five publishes performance on its public site either, which is normal for private hedge funds marketed to allocators. The gap for Taranis is elsewhere: Coatue, Altimeter and Whale Rock make the investment thesis and the people visible (insights, founder interviews, conference talks), while the TMS page shows three paragraphs, names no one and does not state its two sleeves ('), link('https://taranis.net/investment/tms', 'taranis.net/investment/tms'), t('). Websites read with TinyFish on 27 Oct 2026 (Whale Rock returned a login wall).')]),
];

const hfLi = [
  H1('5. LinkedIn activity of the hedge funds (17 Jun – 17 Sep 2026)'),
  P('Company-page cadence and typical reactions, then a sample of posts and the strong points for each fund. "Last three months" means the last three months in the Crustdata index, which ends around 17 Sep 2026; LinkedIn\'s login wall blocked a live refresh.'),
  image('k-hf.png', 620),
  image('k-hfe.png', 620),
  H2('Channel, cadence, format and engagement'),
  table([{ key: 'fund', label: 'Fund', w: 11, bold: true }, { key: 'company_posts_lifetime', label: 'Company posts (all-time)', w: 7, num: true }, { key: 'company_posts_13w', label: 'Posts, 13 weeks', w: 6, num: true }, { key: 'posts_per_week', label: 'Per week', w: 6, num: true }, { key: 'formats_13w', label: 'Formats', w: 13 }, { key: 'median_reactions_est', label: 'Typical reactions', w: 10 }, { key: 'best_post_reactions', label: 'Best', w: 5, num: true }, { key: 'best_post_url', label: 'Link', w: 6, linkLabel: postLabel }, { key: 'channel', label: 'Channel', w: 15 }, { key: 'voice', label: 'Voice', w: 14 }],
    hfl, { width: LAND_W, size: 15 }),
  caption('Founder accounts: Brad Gerstner 25 indexed posts (3 in the window); Glen Kacher 7 (1 in the window); Philippe Laffont, Alex Sacerdote and Josh Resnick barely post (15 posts combined with Kacher, all-time). Crustdata counts by profile URL.'),
  ...hfl.flatMap(r => [
    H2(r.fund),
    P([t('Strong points: ', { bold: true }), t(r.strong_points)]),
    P([t('What Taranis can learn: ', { bold: true }), t(r.what_taranis_can_learn)]),
    ...(hfp.some(x => x.author.startsWith(r.fund.split(' ')[0]) || (r.fund === 'Altimeter Capital' && /Gerstner/.test(x.author)) || (r.fund === 'Light Street Capital' && /Kacher/.test(x.author)))
      ? [hfSamples(r.fund), spacer()]
      : [P([t('No posts of its own in the index or in a live web search (27 Oct). Coverage comes from press reshared by others, e.g. '), link(r.best_post_url, 'Institutional Investor post'), t('.')])]),
  ]),
];

const monTech = [
  H2('Tech/AI posts in the last three months, compared with his other posts'),
  P('Window 17 Jun – 17 Sep 2026 (the last three months in the index). Tech/AI posts are keyword matches (AI, Nvidia, OpenAI, semiconductor, tech). Shares are the percentage of each group at or above a reaction count; "lift" is tech share divided by other share, minus one.'),
  table([{ key: 'threshold', label: 'Reactions at least', w: 12, num: true }, { key: 'tech_posts_at_or_above', label: 'Tech posts', w: 10, num: true }, { key: 'tech_share', label: 'Tech share', w: 10, num: true }, { key: 'other_posts_at_or_above', label: 'Other posts', w: 10, num: true }, { key: 'other_share', label: 'Other share', w: 10, num: true }, { key: 'tech_relative_lift', label: 'Tech lift', w: 10, num: true }],
    mtv.map(r => ({ ...r, tech_share: (100 * r.tech_share).toFixed(1) + '%', other_share: (100 * r.other_share).toFixed(1) + '%', tech_relative_lift: (r.tech_relative_lift > 0 ? '+' : '') + (100 * r.tech_relative_lift).toFixed(0) + '%' }))),
  spacer(),
  image('k-mt.png', 440),
  image('k-mtm.png', 440),
  P([t('Reading: ', { bold: true }), t('271 of 1,051 posts (26%, about 2.9 a day) were tech/AI, steady at 23–27% each month. Tech posts are slightly more reliable than his average (+6% to +7% relative at 25 and 54 reactions) but less likely to go viral (17% vs 21% above 200), because his viral outliers are humour and politics. 230 of the 271 tech posts (85%) credit a source, the same curation rate as the rest of his feed. His top tech posts are visual explainers of the AI build-out (supply-chain maps, capex vs free cash flow) and AI-disruption news with named stocks.')]),
  H2('Sample tech posts (last three months)'),
  table([{ key: 'post', label: 'Post', w: 28, bold: true }, { key: 'true_date_utc', label: 'Date', w: 9 }, { key: 'format', label: 'Format', w: 7 }, { key: 'reactions', label: 'Reactions', w: 8, num: true }, { key: 'comments', label: 'Com.', w: 6, num: true }, { key: 'shares', label: 'Shares', w: 6, num: true }, { key: 'note', label: 'Note', w: 26 }, { key: 'url', label: 'Link', w: 8, linkLabel: postLabel }], mts, { size: 15 }),
  spacer(),
];

const voiceTech = [
  H2('Famous tech voices who post like Monchau'),
  P('High-frequency tech and AI voices on LinkedIn, measured over the same 13 weeks by profile URL. None comes close to Monchau\'s ~81 posts a week; the most prolific post 12–19 times a week (about 2–3 a day).'),
  image('k-tv.png', 620),
  image('k-tvc.png', 620),
  table([{ key: 'name', label: 'Voice', w: 18, bold: true }, { key: 'posts_per_week', label: 'Posts / week', w: 7, num: true }, { key: 'credited_share', label: 'Credit a source', w: 7, num: true }, { key: 'top_post', label: 'Top post', w: 20 }, { key: 'top_format', label: 'Format', w: 6 }, { key: 'top_reactions', label: 'Reactions', w: 7, num: true }, { key: 'top_url', label: 'Link', w: 6, linkLabel: postLabel }, { key: 'authorship_signal', label: 'Do they write their own posts? (signal)', w: 26 }],
    tvf.map(r => ({ ...r, credited_share: r.credited_share === '' ? 'n/a' : (100 * r.credited_share).toFixed(0) + '%' })), { width: LAND_W, size: 15 }),
  spacer(),
  P([t('Do they write their own posts? ', { bold: true }), t('The measurable signal is attribution. Monchau credits a source in 86% of posts and his text largely follows the cited account: he is a curator. The tech voices credit others in 6–19% of posts and write first-person commentary, explainers and listicles: they publish in their own voice. Two caveats: several of their biggest hits are third-party humour videos posted natively without credit (Ordax, Bornet), and whether a team or ghostwriter drafts their posts cannot be verified from public data. Ethan Mollick is the clearest own-voice example (first-hand tests, 6% credited).')]),
  H2('Famous tech voices (reference)'),
];


// ---------- 28 Oct update: re-screened landscape, Monchau live sample, voices like Monchau
const land = D('tms_competitor_landscape'), live = D('monchau_live_sep17_oct28'), vlm = D('voices_like_monchau');
const tierTitle = { A: 'Tier A. Closest hybrids: systematic or sentiment signal plus discretionary picking', B: 'Tier B. Systematic sentiment, alternative-data and machine-learning specialists', C: 'Tier C. Discretionary tech/AI long/short specialists' };
const landCols = [
  { key: 'name', label: 'Fund / manager', w: 15, bold: true }, { key: 'hq', label: 'HQ', w: 7 }, { key: 'aumx', label: 'AUM (as of)', w: 11 },
  { key: 'approach', label: 'Approach', w: 19 }, { key: 'sentiment_or_altdata', label: 'Sentiment / alt-data', w: 12 }, { key: 'tech_ai_focus', label: 'Tech/AI focus', w: 10 },
  { key: 'investor_type', label: 'Investors', w: 8 }, { key: 'closeness_1to5', label: 'Close-ness (1–5)', w: 5, num: true },
  { key: 'li', label: 'Posts 13 wk (per wk)', w: 7, num: true }, { key: 'company_linkedin', label: 'LinkedIn', w: 6, linkLabel: () => 'Page' }, { key: 'aum_source', label: 'Source', w: 8 },
];
const landRows = tier => land.filter(r => r.tier === tier).map(r => ({ ...r,
  name: r.name + (r.manager && !r.name.startsWith(r.manager.split(' ')[0]) ? ' (' + r.manager + ')' : ''),
  aumx: r.aum + ' (' + r.aum_date + ')' + (r.aum_conflict ? ' ⚠' : ''),
  li: r.posts_13w === '' ? 'n/a' : r.posts_13w + ' (' + (+r.posts_per_week).toFixed(2) + ')',
  company_linkedin: isUrl(r.company_linkedin) ? r.company_linkedin : 'none found' }));

const landSec = [
  H1('3. Competitor landscape, re-screened (28 Oct)'),
  P([t('Benchmark used for the screen: ', { bold: true }), t('"Taranis Market Sentiment is a long/short equity fund combining a systematic sentiment-driven strategy established in 2016 with a discretionary fundamental approach focused on technology and AI disruption, introduced in December 2025. With approximately equal allocations, the fund dynamically combines quantitative discipline and fundamental stock selection."')]),
  P('A fund qualifies if it is long/short or market-neutral equity (or, for one reference case, an AI-run macro fund), sold to professional or institutional investors, and matches at least one TMS sleeve: the systematic sentiment / alternative-data half or the discretionary tech / AI-disruption half. Funds that match both are Tier A. Closeness is our 1–5 judgement of how directly an allocator would compare the fund with TMS (5 = same niche, size and country). LinkedIn activity is the number of company-page posts in the 13 weeks 17 Jun – 17 Sep 2026, from free Crustdata counts. The five hedge funds from the 27 Oct brief are kept in Tier C and covered in depth in sections 4 and 5.'),
  image('k-ls.png', 700),
  caption('Crustdata company IDs are in data/tms_competitor_landscape.csv. Taranis: 2 posts (0.15 a week). ⚠ in the AUM column = the figure conflicts with another source (see below).'),
  ...['A', 'B', 'C'].flatMap(k => [H2(tierTitle[k]), table(landCols, landRows(k), { width: LAND_W, size: 14 }), spacer()]),
  H2('What the re-screen shows'),
  bullet([t('Only a handful of funds run TMS\'s exact hybrid. ', { bold: true }), t('Symbit (Zug, launched July 2026: AI models plus discretionary research, sentiment among its inputs, professional investors only) is the closest match in size, country and design. Marshall Wace (TOPS alpha capture is a systematic read of sell-side sentiment, run alongside fundamental books) and Man Group (Numeric/AHL quant plus GLG discretionary) run the same blend at scale.')]),
  bullet([t('The closest peers are as quiet as Taranis. ', { bold: true }), t('Symbit posted twice and Marshall Wace once in 13 weeks, the same as Taranis (2). Of the 22 funds with a matched page, 7 posted nothing. The space is open: a hybrid fund that explains its two sleeves every week would have little competition on LinkedIn.')]),
  bullet([t('The active posters are big firms and recruit or market at firm level. ', { bold: true }), t('Man Group (75 posts, 5.8 a week), Coatue (63), Two Sigma (37; its profile says LinkedIn is for recruiting only), Altimeter (29), WorldQuant (22) and Point72 (19) account for most posts. Among sub-USD 3bn boutiques only Numerai (8), RAM AI (6) and Lakefield (5) post at all.')]),
  bullet([t('Swiss and European boutiques are the natural shortlist for allocators comparing with TMS: ', { bold: true }), t('Symbit (Zug), Lakefield (Zurich), RAM AI (Geneva), Machina (Paris), plus the UCITS tech long/shorts Shannon River (on UBP\'s U Access platform) and Contour (Schroder GAIA). Check share classes before treating the UCITS funds as non-retail peers.')]),
  H2('Data conflicts and unverified items'),
  bullet('Whale Rock: about USD 19bn in this screen against "USD 14bn+" in Whale Rock\'s own May 2026 post used in section 4.'),
  bullet('Jericho: USD 3.97bn regulatory AUM and founded 2009 in this screen, against about USD 10.1bn (third-party estimate) and 1994 in section 4. Regulatory AUM is gross and can differ from net fund assets; check Form ADV before quoting either figure.'),
  bullet('Unverified: Duo Reges (latest source 2021, no company page; may be inactive), Cubist AUM and key person, QRT key person, Lakefield fund size, and the date of RAM\'s AUM figure. Situational Awareness\'s LinkedIn page was not matched in Crustdata, and the fund lost about 75% of AUM in July 2026 and faces SEC subpoenas (kept only as an AI-thesis reference).'),
  bullet('Point72\'s 19 posts and Bridgewater\'s 12 are firm-wide: Turion and AIA Labs have no pages of their own. Man Group\'s 75 include corporate and recruiting posts.'),
  H2('Considered but excluded'),
  bullet('BIT Capital (Berlin): "human x AI" tech investing, but the flagship is a long-only retail UCITS plus an active ETF.'),
  bullet('AtonRâ Partners (Geneva): thematic AI & Robotics funds are long-only with retail share classes (covered in Appendix C).'),
  bullet('D1 Capital (generalist, no quant), Kepos Capital (no 2026 AUM or hybrid evidence) and Acadian (systematic, no sentiment angle found).'),
];

const liveTech = live.filter(r => r.topic === 'Tech/AI');
const monLive = [
  H2('Update to today: live posts 17 Sep – 28 Oct 2026'),
  P('The Crustdata index stops around 17 Sep, so posts from 17 Sep to 28 Oct were collected from public LinkedIn post pages found by web search, plus the four links sent by the client. True dates are decoded from each post\'s activity ID. Logged-out pages show the comment count but not reactions, so engagement here is comments only.'),
  P([t('This is a sample, not a census. ', { bold: true }), t(`At about 11 posts a day he likely published 450 or more posts in these six weeks; the ${live.length} found here (${liveTech.length} tech/AI) were located with tech-oriented searches, so they show what his tech posts look like now, not his topic mix. The window share of tech posts (26%) is still the best estimate of the mix.`)]),
  table([{ key: 'true_date_utc', label: 'Date', w: 9 }, { key: 'topic', label: 'Topic', w: 8 }, { key: 'format', label: 'Format', w: 11 }, { key: 'source_credited', label: 'Credits a source', w: 7 }, { key: 'comments', label: 'Com.', w: 6, num: true }, { key: 'text', label: 'Post (opening)', w: 45 }, { key: 'url', label: 'Link', w: 8, linkLabel: () => 'Open post' }],
    live.map(r => ({ ...r, comments: r.comments || '–', text: (/Client/.test(r.how_found) ? '★ ' : '') + (r.text.length > 150 ? r.text.slice(0, 147) + '…' : r.text) })), { size: 14, hl: r => /Client/.test(r.how_found) }),
  caption('★ and shading = the four posts sent by the client (lnkd.in/p/euC99Vsd, eJRUivkH, ewj6HKDZ, eg9U9XrY). "–" = comment count not shown on the public page.'),
  P([t('Reading: ', { bold: true }), t('The four client posts drew 15 (Anthropic S-1 cash), 228 (Brazil market crash), 58 (gold) and 112 (Musk on neocloud debt) comments. Two of the four are not tech, and the non-tech Brazil post drew the most comments of anything in the sample. Among tech posts, the ones that drew comments combine a famous name and a market consequence: Musk on debt markets (112), Altman and Amodei (35), Michael Burry covering shorts (26), Jensen Huang (26).')]),
  P([t('What changed since September: ', { bold: true }), t('his tech posting now centres on the Anthropic IPO and results, OpenAI financing, AI debt and credit risk, and Nvidia and Micron cash flows. He also publishes more of his own long-form work on AI: three Syz notes ("Anthropic Q3: Spectacular Numbers…", "AI: bubble, super-cycle, or both?", the 17 Oct weekly wrap on AI debt fears) and a LinkedIn article on investing in AI without over-concentration. That is the format TMS could match most directly: an own view on AI disruption, backed by a chart.')]),
  P([t('Credits: ', { bold: true }), t(`${liveTech.filter(r => r.source_credited === 'yes').length} of the ${liveTech.length} tech posts in the sample credit a source, below his 85% in the window, because the search surfaced more of his own commentary and Syz notes. Treat this as a sampling effect, not a change in style.`)]),
];

const voiceLike = [
  H2('Who posts most like Monchau? (re-screened)'),
  P('The 27 Oct list was chosen for fame in tech; none of those voices curates markets the way Monchau does. The re-screen looks for his three traits together: a very high post rate, chart- or news-led market posts, and credited sources. Nobody combines all three. The closest fall into two groups.'),
  image('k-vl.png', 620),
  table([{ key: 'name', label: 'Voice', w: 13, bold: true }, { key: 'ppw', label: 'Posts / week', w: 6, num: true }, { key: 'tech', label: 'Tech share', w: 6, num: true }, { key: 'cred', label: 'Credits a source', w: 6, num: true }, { key: 'style', label: 'Style', w: 20 }, { key: 'similar_on', label: 'Like Monchau in', w: 16 }, { key: 'different_on', label: 'Unlike Monchau in', w: 14 }, { key: 'sample_reactions', label: 'Sample post reactions', w: 7, num: true }, { key: 'sample_url', label: 'Sample', w: 6, linkLabel: () => 'Open post' }, { key: 'profile_url', label: 'Profile', w: 6, linkLabel: () => 'Profile' }],
    vlm.map(r => ({ ...r, ppw: r.posts_per_week, tech: r.tech_share === '' ? 'n/a' : Math.round(100 * r.tech_share) + '%', cred: r.credit_share === '' ? 'n/a' : Math.round(100 * r.credit_share) + '%', sample_url: r.sample_url || '–' })),
    { width: LAND_W, size: 14, hl: r => /Monchau/.test(r.name) }),
  caption('Counts: Crustdata, 17 Jun – 17 Sep 2026, by profile URL (free). Tech and credit shares: keyword and "Source/via/credit" matches on each voice\'s posts in the window. Lacalle and Feroldi post too rarely for the share measures. Sample reactions are from the index.'),
  bullet([t('Tech-news curators (closest in topic): ', { bold: true }), t('Linas Beliūnas (15 a week, 93% tech) and Endrit Restelica (10 a week, 75% tech) post "BREAKING"-style news hooks with a short explainer, Monchau\'s format, but credit sources in only 19% and 5% of posts. Eduardo Ordax, Brij Kishore Pandey and Pascal Bornet are tech-heavy but write explainers or share clips.')]),
  bullet([t('Market-chart posters (closest in audience): ', { bold: true }), t('Liz Ann Sonders (14.5 a week), Ryan Detrick (10.8), Mike Zaccardi (10.1) and Ian Bremmer (12) post one chart or one view at a time to investors, but in their own words, with almost no tech and almost no credits.')]),
  bullet([t('Conclusion: ', { bold: true }), t('Monchau is unusual. His mix of very high volume, 85% credited sources and a market audience has no famous peer on LinkedIn. For TMS, the useful model is the market-chart group (own chart, own one-line read, 1–2 a day at most), with Beliūnas and Restelica as the template for tech news hooks.')]),
];

// ---------- content blocks
const title = [
  P([t('Taranis SA · Geneva · 28 October 2026', { size: 20, color: MUTED })], { after: 600, before: 1800 }),
  new Paragraph({ children: [new TextRun({ text: 'TMS LinkedIn Competitive Review', font: 'Georgia', size: 56, color: INK })], spacing: { after: 240 } }),
  P([t('Taranis Market Sentiment against a re-screened field of 24 hybrid, systematic and tech long/short funds, with a focus on five institutional tech hedge funds: LinkedIn activity, websites, the Monchau benchmark to 28 Oct, voices like Monchau and an operating plan', { size: 26, color: MUTED })], { after: 600 }),
  P([t('Prepared for: ', { bold: true }), t('Taranis SA (Julien Leegenhoek, CEO; marketing and investor relations)')]),
  P([t('Data window: ', { bold: true }), t('LinkedIn 17 Jun – 17 Sep 2026 (13 weeks, Crustdata index); Monchau live sample 17 Sep – 28 Oct 2026; product pages read 26–27 Oct 2026')]),
  P([t('Interactive dashboard: ', { bold: true }), t('dashboard.html (self-contained, in the same folder)')]),
  P([t('Raw data: ', { bold: true }), t('data/posts_raw_all.csv and the other CSVs in data/')]),
  P([t('Disambiguation: ', { bold: true }), t('"Taranis" here is Taranis SA, Geneva (FINMA-authorised asset manager, '), link('https://www.linkedin.com/company/taranis-sa', 'linkedin.com/company/taranis-sa'), t('). Not Perenco\'s Taranis energy assets and not the DFSA-registered Taranis Capital.')], { after: 200 }),
  new Paragraph({ children: [new PageBreak()] }),
  new TableOfContents('Contents', { hyperlink: true, headingStyleRange: '1-2' }),
  new Paragraph({ children: [new PageBreak()] }),
];

const exec = [
  H1('1. Executive summary'),
  bullet([t('Re-screened against the full TMS strategy, the competitor field has 24 funds in three tiers. ', { bold: true }), t('Tier A runs TMS\'s hybrid of a systematic or sentiment signal plus discretionary picking (Symbit, Marshall Wace, Man Group, Duo Reges). Tier B holds systematic sentiment, alternative-data and ML specialists (Lakefield, RAM AI, Machina, Numerai, Voleon, Cubist, QRT, Two Sigma, WorldQuant, Bridgewater AIA). Tier C holds discretionary tech/AI long/shorts (Point72 Turion, Situational Awareness, Coatue, Whale Rock, Altimeter, Tiger Global, Jericho, Light Street, Shannon River, Contour). The closest single match is Symbit (Zug, AI plus discretionary, launched July 2026). Section 3.')]),
  bullet([t('The closest competitors are as silent on LinkedIn as Taranis. ', { bold: true }), t('Symbit posted 2 times in 13 weeks, Marshall Wace once and Taranis twice; 7 of the 22 matched funds posted nothing. Posting volume sits with large firms (Man Group 5.8 a week, Coatue 4.85, Two Sigma 2.85, Altimeter 2.23), much of it recruiting. A hybrid fund that explains both sleeves every week would be nearly alone.')]),
  bullet([t('Monchau to today (17 Sep – 28 Oct): same machine, more AI long-form. ', { bold: true }), t('A live sample of 26 posts, including the four sent by the client, shows his tech posts now centre on the Anthropic IPO, OpenAI financing and AI debt, plus three Syz notes and a LinkedIn article on AI. The client\'s four posts drew 15, 228, 58 and 112 comments; the Brazil crash post (not tech) drew the most. Section 6.')]),
  bullet([t('Nobody posts quite like Monchau. ', { bold: true }), t('The closest are tech-news curators Linas Beliūnas (15 a week, 93% tech) and Endrit Restelica (10 a week, 75% tech), and market-chart posters Liz Ann Sonders, Ryan Detrick and Mike Zaccardi (10–15 a week), all mostly in their own words. Section 7.')]),
  bullet([t('The institutional tech hedge funds barely use LinkedIn, and the ones that do lead with people. ', { bold: true }), t('Of the five, only Coatue (4.85 posts/week) and Altimeter (2.23/week) post regularly; Whale Rock posts a handful of milestones a year; Light Street and Jericho post nothing on their company pages. Coatue ties every post to a portfolio company or a founder TV clip; Altimeter runs on Brad Gerstner as a public figure; Whale Rock\'s rare posts average about 240 reactions. Taranis posts 0.15/week with about 14 reactions per company post.')]),
  bullet([t('Their websites are minimal or gated, so LinkedIn and press carry the story. ', { bold: true }), t('Jericho and Altimeter run one-paragraph holding pages, Whale Rock and Light Street sit behind investor logins, and only Coatue runs a content site (insights, podcasts, portfolio). None publishes performance publicly. For a non-retail fund this is normal; what differs is that Coatue, Altimeter and Whale Rock make their founders\' views visible.')]),
  bullet([t('Monchau\'s tech posts are about a quarter of his output and perform slightly better than his other posts. ', { bold: true }), t('In the last three indexed months (17 Jun – 17 Sep 2026), 271 of his 1,051 posts (26%) were tech/AI. 56% of them cleared 54 reactions against 52% of his other posts (+7% relative), but fewer went viral (17% vs 21% above 200 reactions), because his viral outliers are humour. 85% of his tech posts credit a source.')]),
  bullet([t('No famous tech voice posts as often as Monchau; the closest post 12–19 times a week and mostly in their own voice. ', { bold: true }), t('Eduardo Ordax (19.2/week), Linas Beliūnas (15.4), Ethan Mollick (15.3), Ruben Hassid (13.6), Brij Kishore Pandey (12.2) and Pascal Bornet (11.6) credit an outside source in only 6–19% of posts against Monchau\'s 86%. Whether a team or ghostwriter helps them cannot be verified from public data.')]),
  bullet([t('TMS still discloses the least and posts the least. ', { bold: true }), t('Its gated page shows three paragraphs, no fund facts, performance or team, and does not state its two sleeves. The recommended model borrows from Altimeter (founder as the public face) and Coatue (one-line thesis plus a chart or clip), at a sustainable 3–5 posts a week.')]),
];

const method = [
  H1('2. Scope, sources and method'),
  bullet([t('Competitor landscape (re-screened 28 Oct against the full TMS strategy text): 24 professional or institutional long/short funds found by web research (fund sites, Form ADV aggregators, trade press), tiered by which TMS sleeve they match and scored 1–5 for closeness; LinkedIn cadence from free Crustdata counts. Every row links its source in data/tms_competitor_landscape.csv.')]),
  bullet([t('Competitor set (updated 27 Oct at the client\'s request): five institutional, non-retail tech hedge funds: Jericho Capital, Light Street Capital, Whale Rock Capital, Coatue Management and Altimeter Capital. The earlier Swiss and UCITS peer set (AtonRâ, DECALIA, Pictet AM, Symbit, BIT Capital, Shannon River, Contour, Wellington) is kept in Appendices C–E for reference.')]),
  bullet([t('LinkedIn: Crustdata /social_post/search. Cadence from free limit=0 count queries (actor id + actor type + date window 17 Jun – 17 Sep 2026); engagement and text from small paid pulls of top posts (about 68 credits across four rounds). Every query is logged in the companion CSVs.')]),
  bullet([t('Product pages: read with TinyFish (fetch and browser runs through Swiss qualified/professional-investor gates) and plain fetches on 26–27 Oct 2026; facts not on a page were taken from public factsheets or FT and are labelled as such.')]),
  bullet([t('Dates: every post\'s true date is decoded from its LinkedIn activity ID (id >> 22 = milliseconds since epoch), because the index\'s own dates are imputed for older posts and can drift by up to four weeks even in 2026.')]),
  H2('Caveats'),
  bullet('Live posts after 17 Sep (Monchau sample) come from public post pages, which show comments but not reactions to logged-out readers, so they cannot be compared with indexed reaction counts.'),
  bullet('Crustdata credits: the balance fell from about 2.25 to 1.75 between rounds without a matching paid call in our log; the 28 Oct counts were all free (limit=0). Several calls dropped mid-reply and were repeated once.'),
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
  H1('Appendix C. Earlier peer set: Swiss and UCITS funds'),
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
  H1('Appendix D. Product-page teardown of the earlier peer set'),
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
  H1('Appendix E. LinkedIn activity of the earlier peer set'),
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
  ...monTech,
  ...monLive,
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
  H1('7. Tech voices'),
  ...voiceTech,
  P('Benchmark their formats, not their reaction counts: their audiences are in the millions. Counts are Crustdata, 17 Jun – 17 Sep 2026, by profile URL.'),
  table([{ key: 'name', label: 'Voice', w: 12, bold: true }, { key: 'posts_per_week', label: 'Posts / week', w: 8, num: true }, { key: 'dominant_format_top3', label: 'Top formats', w: 16 }, { key: 'best_post_reactions', label: 'Best post', w: 9, num: true }, { key: 'best_post_url', label: 'Link', w: 8, linkLabel: postLabel }, { key: 'what_taranis_can_borrow', label: 'What Taranis can borrow', w: 40 }], voices, { width: LAND_W }),
  ...voiceLike,
];

const sw = (h, items) => new TableCell({ width: { size: Math.floor(PORTRAIT_W / 2), type: WidthType.DXA }, margins: { top: 100, bottom: 100, left: 120, right: 120 },
  borders: { top: { style: BorderStyle.SINGLE, size: 4, color: LINE }, bottom: { style: BorderStyle.SINGLE, size: 4, color: LINE }, left: { style: BorderStyle.SINGLE, size: 4, color: LINE }, right: { style: BorderStyle.SINGLE, size: 4, color: LINE } },
  children: [P([t(h, { bold: true, color: ACCENT })], { after: 80 }), ...items.map(i => bullet(i))] });
const swot = new Table({ width: { size: PORTRAIT_W, type: WidthType.DXA }, columnWidths: [Math.floor(PORTRAIT_W / 2), PORTRAIT_W - Math.floor(PORTRAIT_W / 2)], rows: [
  new TableRow({ cantSplit: true, children: [sw('Strengths', ['The only tech long/short with a behavioural-sentiment quant overlay in the set', 'Founder-CEO with BFM Business airtime; his own posts already beat the page (64 vs 14)', 'Award history and a clear AI-disruption thesis']),
                            sw('Weaknesses', ['0.15 posts a week, the lowest among active peers; the page mirrors TV clips', 'Recent posts are French-only; 1,976 followers', 'Product page shows no facts, performance, sleeves or team; award label says "Managed Futures"'])] }),
  new TableRow({ cantSplit: true, children: [sw('Opportunities', ['Institutional tech hedge funds are quiet: Jericho and Light Street post nothing, Whale Rock a few milestones a year', 'Coatue and Altimeter show that founder-led, thesis-first posting works for non-retail funds', 'A proprietary weekly sentiment read no peer can copy; no Swiss tech-AI personal voice with reach']),
                            sw('Threats', ['Coatue and Altimeter own the AI-investor narrative with portfolio access (Anthropic, Databricks) and TV airtime', 'Scale gap: competitors run USD 1.6–90bn; allocators may see Taranis as sub-scale', 'FinSA limits public performance talk'])] }),
] });

const recSec = [
  H1('8. SWOT and recommendations'),
  swot,
  spacer(),
  H2('Recommendations'),
  numbered([t('Lead through Julien Leegenhoek, Altimeter-style. ', { bold: true }), t('Make the founder the public face: his BFM appearances cut into 60–90s clips with one quoted line (Altimeter\'s Gerstner clips draw 120+), plus a clear stance on the AI cycle. A partner (e.g. Antoine Megarbane) interviews companies or allocators, as Altimeter\'s partners do. Evidence: Taranis page 14 vs Julien 64; Symbit page 0 vs founder 108.')]),
  numbered([t('One-line thesis plus a chart, Coatue-style. ', { bold: true }), t('Every post opens with a single claim ("Intelligence is becoming a utility you pay for monthly") and carries one chart or clip. The Monday TMS sentiment-gauge chart is the signature format no peer can copy.')]),
  numbered([t('Cadence: 3–5 posts a week, not Monchau\'s 81. ', { bold: true }), t('About 3 from Julien and 2 from the company page puts Taranis between Altimeter (2.2/week) and Coatue (4.85/week), and above DECALIA (2.3/week), the Swiss boutique bar.')]),
  numbered([t('Milestones as events, Whale Rock-style. ', { bold: true }), t('Treat awards, anniversaries, conference talks and podcasts as posts with a thesis and a number; Whale Rock\'s rare posts average about 240 reactions and its 20th-anniversary letter drew 709.')]),
  numbered([t('Own voice over curation, with tech as the core lane. ', { bold: true }), t('About 80/20 original to curated. Monchau\'s tech posts beat his average only slightly and his own-view posts rarely travel; the high-frequency tech voices (Mollick, Pandey) grow on first-person explainers. Post in English first, French second.')]),
  numbered([t('Claim the hybrid niche before Symbit does. ', { bold: true }), t('The funds closest to TMS (Symbit, Marshall Wace, Duo Reges) are nearly invisible on LinkedIn. A recurring post that shows both sleeves, such as "what the sentiment model says this week, and what our AI-disruption analysts think of it", is a format no direct competitor publishes. Man Group (5.8 posts a week) shows a large hybrid manager can explain quant and discretionary side by side.')]),
  numbered([t('Fix the product page before pushing traffic. ', { bold: true }), t('State the two sleeves and their weights, name the PMs, add vehicle, ISIN, fees and liquidity, put a factsheet behind the existing gate and add a "request factsheet / book a call" CTA; relabel the "Managed Futures" award. Coatue shows how an insights hub can sit next to a gated investor area.')]),
  numbered([t('Compliant by design. ', { bold: true }), t('A one-line risk warning on fund posts, no performance numbers in posts, and one Compliance pre-approval of the weekly chart template.')]),
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
const header = new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [t('TMS LinkedIn Competitive Review · 28 Oct 2026', { size: 16, color: MUTED })] })] });
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
    sec(landscape, [...landSec, ...hfSet, ...hfLi]),
    sec(portrait, monSec),
    sec(landscape, voiceSec),
    sec(portrait, recSec),
    sec(landscape, rawSec),
    sec(portrait, srcSec),
    sec(landscape, [...set, ...pagesSec, ...liSec]),
  ],
});

Packer.toBuffer(doc).then(b => { fs.writeFileSync(OUT, b); console.log(OUT, b.length, 'bytes'); });
