// Builds AI_Voices_LinkedIn_Analysis.docx from data/*.csv and charts/*.png.
// usage: node build_word.js
const fs = require('fs');
const path = require('path');
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, ShadingType,
  ExternalHyperlink, ImageRun, AlignmentType, PageOrientation, LevelFormat, BorderStyle, TableOfContents,
  Header, Footer, PageNumber, PageBreak,
} = require('docx');

const HERE = __dirname;
const OUT = path.join(HERE, 'AI_Voices_LinkedIn_Analysis.docx');

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
const S = D('ai_voices_summary'), SIM = D('ai_voices_similar_summary'), SMP = D('ai_voices_samples');
const pct = v => v === '' || v === undefined ? 'n/a' : Math.round(100 * v) + '%';
const by = n => S.find(r => r.name === n);

// ---------- per-person notes (from counts and the sample posts)
const NOTES = {
  'Allie K. Miller': ['Almost everything she posts is AI (91% by keyword). Format is the engagement engine: two thirds images (carousels and annotated screenshots), numbered "what every professional should know" lists and early-access model reviews, plus a weekend "AI homework" video series.',
    'Engagement is steady rather than spiky: 17% of posts clear 500 reactions and none cleared 2,500 in the window, despite ~2M followers. Comments are high relative to reactions (her samples draw 145–307 comments), which is what the format is built for.',
    'For TMS: the repeatable weekly slot and the numbered "what this means for you" structure.'],
  'Andrew Ng': ['Posts about once a week and nearly always about AI (13 of 14). Every post is an artifact: a new course, an open-source agent, a skills map, a company launch, usually as a link/article card.',
    'The most reliable reach in the group: 9 of 14 posts cleared 5,000 reactions; samples drew 10,000–14,000. Low volume plus high usefulness beats frequency.',
    'For TMS: fewer, more useful posts (a sentiment map, a framework) that people save and share.'],
  'Satya Nadella': ['About two posts a week. Only 38% match the narrow tech keywords, but 88% match the broad set (Microsoft, Copilot, agents, compute): he writes about AI through Microsoft\'s products and results.',
    'Half of his posts clear 5,000 reactions. His best are results-day and milestone posts in his own words with 3–4 hard numbers (earnings, first Vera Rubin deliveries) and a stance on superintelligence and human control.',
    'For TMS: results and milestones written by the CEO, numbers first, one clear principle.'],
  'Reid Hoffman': ['About 2.4 posts a week, 71% tech by keyword (87% broad). Mostly 60–90 second clips from his podcasts and interviews (14 videos) and links to long-form essays (11 articles).',
    'Lowest engagement per post in the group: only 2 of 31 posts cleared 500 reactions. Clip-heavy posting builds volume but not reach on LinkedIn.',
    'For TMS: cutting BFM appearances into clips works only if each clip carries one sharp claim in the text.'],
  'Ethan Mollick': ['By far the most frequent (15.3 a week, about 2 a day). 56% match the narrow keywords and 76% the broad set; the rest is research, education and work. Image-led (87 images): screenshots of his own tests of new models with a short verdict.',
    'Tech posts do better than his other posts: 27% of tech posts clear 500 reactions against 16% of other posts (+69% relative). Very few go viral (1 post above 2,500). He credits a source in only 6% of posts: he writes his own.',
    'For TMS: first-hand tests ("we ran our sentiment model on X, here is what it said") written in the first person.'],
  'Aravind Srinivas': ['About once a week. The narrow keyword rule badly undercounts him (2 of 13); the broad set finds 11 of 13, because he writes about Perplexity products, agents and compute rather than "AI" as a word.',
    'Strong reach for a low cadence: 46% of posts clear 1,000 reactions. Posts are builder proof: what was shipped and its measurable impact in two sentences, often with a demo video.',
    'For TMS: show the machine working, with one number.'],
  'Bill Gates': ['About five posts a week, but mostly not tech: 18% by narrow keyword and 26% broad. Most posts are global health, philanthropy and personal stories with field-trip videos (24 videos) and links to his Gates Notes essays (19 articles).',
    'Reach is broad and steady (56% of posts clear 1,000 reactions); his top post in the window was a birthday note to Warren Buffett (42,692 reactions). Tech posts perform about the same as his other posts (58% vs 55% above 1,000).',
    'For TMS: warmth and people stories travel; tech is not required for reach.'],
};

// ---------- sections
const title = [
  P([t('Taranis SA · Geneva · 28 October 2026', { size: 20, color: MUTED })], { after: 600, before: 1800 }),
  new Paragraph({ children: [new TextRun({ text: 'AI Voices on LinkedIn', font: 'Georgia', size: 56, color: INK })], spacing: { after: 240 } }),
  P([t('How often seven leading AI voices post about tech, how their tech posts perform, and who posts like them', { size: 26, color: MUTED })], { after: 600 }),
  P([t('Voices: ', { bold: true }), t('Allie K. Miller, Andrew Ng, Satya Nadella, Reid Hoffman, Ethan Mollick, Aravind Srinivas, Bill Gates, plus similar voices found in this screen')]),
  P([t('Data window: ', { bold: true }), t('LinkedIn posts 17 Jun – 17 Sep 2026 (13 weeks, Crustdata index)')]),
  P([t('Companion to: ', { bold: true }), t('TMS LinkedIn Competitive Review (same method as the Charles-Henry Monchau analysis)')]),
  P([t('Raw data: ', { bold: true }), t('data/*.csv in this folder')]),
  new Paragraph({ children: [new PageBreak()] }),
  new TableOfContents('Contents', { hyperlink: true, headingStyleRange: '1-2' }),
  new Paragraph({ children: [new PageBreak()] }),
];

const exec = [
  H1('1. Summary'),
  bullet([t('Frequency varies 15-fold. ', { bold: true }), t(`Ethan Mollick posts ${by('Ethan Mollick').posts_per_week} times a week; Bill Gates ${by('Bill Gates').posts_per_week}, Allie K. Miller ${by('Allie K. Miller').posts_per_week}, Reid Hoffman ${by('Reid Hoffman').posts_per_week}, Satya Nadella ${by('Satya Nadella').posts_per_week}, Andrew Ng ${by('Andrew Ng').posts_per_week} and Aravind Srinivas ${by('Aravind Srinivas').posts_per_week}. None approaches Monchau's 81 a week.`)]),
  bullet([t('Tech posting frequency: ', { bold: true }), t(`by the same keyword rule used for Monchau, Mollick posts ${by('Ethan Mollick').tech_per_week} tech/AI posts a week, Miller ${by('Allie K. Miller').tech_per_week}, Hoffman ${by('Reid Hoffman').tech_per_week}, Ng ${by('Andrew Ng').tech_per_week}, Gates ${by('Bill Gates').tech_per_week}, Nadella ${by('Satya Nadella').tech_per_week} and Srinivas ${by('Aravind Srinivas').tech_per_week}. As a share of their posts: Ng ${pct(by('Andrew Ng').tech_share)}, Miller ${pct(by('Allie K. Miller').tech_share)}, Hoffman ${pct(by('Reid Hoffman').tech_share)}, Mollick ${pct(by('Ethan Mollick').tech_share)}, Nadella ${pct(by('Satya Nadella').tech_share)}, Gates ${pct(by('Bill Gates').tech_share)}, Srinivas ${pct(by('Aravind Srinivas').tech_share)}, against Monchau's 26%.`)]),
  bullet([t('The keyword rule undercounts the builders. ', { bold: true }), t(`Nadella and Srinivas write about Microsoft, Copilot, Perplexity, agents and compute rather than "AI" or "tech". With a broader keyword set their tech shares rise to ${pct(by('Satya Nadella').tech_broad_share)} and ${pct(by('Aravind Srinivas').tech_broad_share)}. Only Gates stays mostly non-tech (${pct(by('Bill Gates').tech_broad_share)} broad).`)]),
  bullet([t('Do tech posts perform better? Only clearly for Mollick. ', { bold: true }), t('27% of his tech posts clear 500 reactions against 16% of his other posts (+69% relative). For Gates and Srinivas tech and other posts perform about the same; for Nadella, Miller and Hoffman tech posts do slightly worse; Ng posts almost nothing but tech, so there is no comparison. Samples are small for everyone except Mollick and Gates.')]),
  bullet([t('Reach comes from usefulness and authority, not volume. ', { bold: true }), t('Ng (1.1 posts a week) has 9 of 14 posts above 5,000 reactions and Nadella (1.8 a week) half of his; Mollick (15.3 a week) has one post above 2,500 and Hoffman (2.4 a week) two above 500.')]),
  bullet([t('They write their own posts. ', { bold: true }), t('Six of the seven mention a source ("Source", "via", "credit") in 3–11% of posts and Srinivas in 4 of 13, against Monchau\'s 86%. These are original voices, not curators.')]),
  bullet([t('Similar voices: ', { bold: true }), t(SIM.length ? `${SIM.length} active voices with comparable profiles are measured in section 5 (${SIM.slice(0, 6).map(r => r.name).join(', ')}${SIM.length > 6 ? ' and others' : ''}).` : 'see section 5.')]),
];

const method = [
  H1('2. Method and caveats'),
  bullet('All figures are Crustdata /social_post/search count queries (free, limit=0) by LinkedIn profile URL for posts dated 17 Jun – 17 Sep 2026 (13 weeks). The index ends around 17 Sep, so later posts are not counted.'),
  bullet('Tech/AI posts: posts whose text matches AI, Nvidia, OpenAI, semiconductor or tech, the rule used for Monchau (26% tech), so shares are comparable. A broader set (adding Perplexity, model, agent, software, compute, Copilot, Microsoft, GPT, robot) is shown alongside because the narrow rule misses product-led writers.'),
  bullet('Engagement: share of posts at or above a reaction threshold (500, 1,000, 2,500, 5,000). For each person the comparison uses the threshold closest to half of all posts, then compares tech posts with other posts.'),
  bullet('Formats come from the index content type (video, image, article/link); text-only and documents are the remainder. Source credits = posts containing "Source", "via" or "credit".'),
  bullet('Monthly split: June covers only 17–30 June and the index holds few late-June posts for most voices, so month-to-month changes should be read with care.'),
  bullet('Sample posts (three per voice) were pulled earlier for the TMS review and are listed in section 4 with links.'),
];

const overview = [
  H1('3. Frequency and tech share'),
  image('k-ppw.png', 620),
  image('k-tech.png', 620),
  table([{ key: 'name', label: 'Voice', w: 16, bold: true }, { key: 'role', label: 'Profile', w: 26 }, { key: 'total_13w', label: 'Posts 13 wk', w: 7, num: true }, { key: 'posts_per_week', label: 'Per week', w: 7, num: true },
    { key: 'tech_13w', label: 'Tech posts', w: 7, num: true }, { key: 'tech_per_week', label: 'Tech / week', w: 7, num: true }, { key: 'ts', label: 'Tech share', w: 7, num: true }, { key: 'tb', label: 'Tech share (broad)', w: 8, num: true }, { key: 'cs', label: 'Credits a source', w: 7, num: true }, { key: 'profile_url', label: 'Profile', w: 7, linkLabel: () => 'Profile' }],
    S.map(r => ({ ...r, ts: pct(r.tech_share), tb: pct(r.tech_broad_share), cs: pct(r.credited_share) })), { size: 15 }),
  caption('Monchau benchmark: 1,051 posts, 80.8 a week, 271 tech (26%), 86% credit a source.'),
  H2('Do tech posts perform better than their other posts?'),
  image('k-lift.png', 560),
  table([{ key: 'name', label: 'Voice', w: 18, bold: true }, { key: 'lift_threshold', label: 'Threshold (reactions ≥)', w: 12, num: true }, { key: 'al', label: 'All posts at/above', w: 12, num: true }, { key: 'tl', label: 'Tech posts at/above', w: 12, num: true }, { key: 'ol', label: 'Other posts at/above', w: 12, num: true }, { key: 'li', label: 'Tech lift', w: 10, num: true }, { key: 'n', label: 'Tech / other posts', w: 12, num: true }],
    S.map(r => ({ ...r, al: pct(r.all_share_at_t), tl: pct(r.tech_share_at_t), ol: pct(r.other_share_at_t), li: r.tech_relative_lift === '' ? 'n/a' : (r.tech_relative_lift > 0 ? '+' : '') + Math.round(100 * r.tech_relative_lift) + '%', n: r.tech_13w + ' / ' + r.other_n })), { size: 15 }),
  caption('Lift = tech share divided by other share, minus one. With fewer than ~10 posts in a group the comparison is indicative only (Ng has 1 non-tech post; Srinivas 2 tech posts by the narrow rule).'),
  H2('Reaction thresholds, all posts vs tech posts'),
  table([{ key: 'name', label: 'Voice', w: 18, bold: true }, ...[500, 1000, 2500, 5000].map(t => ({ key: 'x' + t, label: '≥' + t.toLocaleString('en') + ' (all / tech)', w: 12, num: true }))],
    S.map(r => Object.fromEntries([['name', r.name], ...[500, 1000, 2500, 5000].map(t => ['x' + t, r['all_ge' + t] + ' / ' + r['tech_ge' + t]])])), { size: 15 }),
  H2('Tech share by month and format mix'),
  image('k-month.png', 560),
  image('k-fmt.png', 560),
];

const profiles = [
  H1('4. Voice by voice'),
  ...S.flatMap(r => [
    H2(`${r.name}: ${r.posts_per_week} posts a week, ${pct(r.tech_share)} tech (${pct(r.tech_broad_share)} broad)`),
    ...(NOTES[r.name] || []).map(n => bullet(n)),
    table([{ key: 'true_date_utc', label: 'Date', w: 10 }, { key: 'format', label: 'Format', w: 8 }, { key: 'reactions', label: 'Reactions', w: 9, num: true }, { key: 'comments', label: 'Comments', w: 9, num: true }, { key: 'shares', label: 'Shares', w: 8, num: true }, { key: 'text', label: 'Post (opening)', w: 46 }, { key: 'url', label: 'Link', w: 10, linkLabel: () => 'Open post' }],
      SMP.filter(p => p.author === r.name).map(p => ({ ...p, text: p.text.length > 140 ? p.text.slice(0, 137) + '…' : p.text })), { size: 15 }),
    spacer(),
  ]),
];

const simSec = [
  H1('5. Similar voices'),
  P('Voices with a comparable profile to one of the seven, confirmed active on LinkedIn (at least 5 posts in the window) and measured the same way. Profile URLs were verified by web search before counting.'),
  ...(SIM.length ? [
    table([{ key: 'name', label: 'Voice', w: 13, bold: true }, { key: 'role', label: 'Role', w: 15 }, { key: 'similar_to', label: 'Similar to', w: 10 }, { key: 'why_similar', label: 'Why similar', w: 22 }, { key: 'posts_per_week', label: 'Posts / week', w: 6, num: true }, { key: 'ts', label: 'Tech share', w: 6, num: true },
      { key: 'eng', label: 'Posts ≥1,000 reactions', w: 7, num: true }, { key: 'sample_post_url', label: 'Sample', w: 6, linkLabel: () => 'Open post' }, { key: 'profile_url', label: 'Profile', w: 6, linkLabel: () => 'Profile' }],
      SIM.map(r => ({ ...r, ts: pct(r.tech_share), eng: r.all_ge1000 === '' ? 'n/a' : r.all_ge1000 + ' of ' + r.total_13w, sample_post_url: r.sample_post_url || '–' })), { width: LAND_W, size: 14 }),
    spacer(),
    bullet([t('Same pattern as the seven: ', { bold: true }), t('the CEOs post rarely and reach widely (Pichai 10 posts, 6 above 5,000 reactions; Benioff 13, all on AI; Mensch 8, 5 above 2,500), while the creators and commentators post 3–4 times a week with modest reach (Conor Grennan 53 posts, 1 above 500; Gary Marcus 34, 1 above 500).')]),
    bullet([t('Most active founder voice: ', { bold: true }), t('Clem Delangue (Hugging Face) posts 4.4 times a week and is the only high-frequency voice with steady reach (23 of 57 posts above 500 reactions).')]),
    bullet([t('Researchers: ', { bold: true }), t('Yann LeCun (3.9 a week) and Sebastian Raschka (1.5 a week) are undercounted by the keyword rule because they write "LLM" and "world models" rather than "AI"; Raschka still has 16 of 20 posts above 1,000 reactions.')]),
    bullet('Checked but not kept (fewer than 5 posts or unverifiable): Vinod Khosla, Greg Brockman, Arvind Krishna, Rowan Cheung, Zain Kahn, Aidan Gomez, Fei-Fei Li (5 posts each for the last three), Mustafa Suleyman (profile not found). Jensen Huang is active (9 posts) but was not measured further.'),
  ] : [P('No similar voices could be confirmed.')]),
];

const takeaways = [
  H1('6. What Taranis can take from them'),
  numbered([t('Pick an archetype, not a frequency. ', { bold: true }), t('The two models that fit a fund are Nadella (CEO, results and milestones with hard numbers, ~2 a week) and Ng (one genuinely useful artifact a week). Mollick\'s daily cadence only works because each post is a first-hand test.')]),
  numbered([t('Make tech the core but not the only lane. ', { bold: true }), t('Tech posts beat other posts clearly only for Mollick; for Gates people stories perform as well. A 70/30 tech-to-other mix (Hoffman-like) keeps the AI-disruption focus while leaving room for team, clients and markets.')]),
  numbered([t('Write it yourself. ', { bold: true }), t('Six of the seven credit a source in 11% or fewer of posts (Srinivas 4 of 13, on a small base). Original, first-person posts are the norm among the most followed AI voices; curation is Monchau\'s niche, not theirs.')]),
  numbered([t('Show the machine. ', { bold: true }), t('Srinivas and Mollick get reach by showing what a tool did, with one number. The TMS equivalent: "what our sentiment model flagged this week" with one chart.')]),
  numbered([t('Use a repeatable slot. ', { bold: true }), t('Miller\'s weekend "AI homework" and numbered model reviews show a recurring format builds comments, which LinkedIn rewards.')]),
];

const rawSec = [
  H1('Appendix. Count data'),
  P('All counts behind this report. Files: data/ai_voices_counts.csv, ai_voices_formats_credits.csv, ai_voices_tech_broad.csv, ai_voices_similar.csv, plus the derived ai_voices_summary.csv.'),
  table([{ key: 'name', label: 'Voice', w: 14, bold: true }, ...['total_13w', 'tech_13w', 'tech_broad_13w', 'credited_13w', 'jun_total', 'jun_tech', 'jul_total', 'jul_tech', 'aug_total', 'aug_tech', 'sep_total', 'sep_tech'].map(k => ({ key: k, label: k.replace(/_/g, ' '), w: 6, num: true }))], S, { width: LAND_W, size: 14 }),
];

const header = new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [t('AI Voices on LinkedIn · 28 Oct 2026', { size: 16, color: MUTED })] })] });
const footer = new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ children: ['Page ', PageNumber.CURRENT], font: FONT, size: 16, color: MUTED })] })] });
const portrait = { page: { size: { width: A4.width, height: A4.height }, margin: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN } } };
const landscape = { page: { size: { width: A4.width, height: A4.height, orientation: PageOrientation.LANDSCAPE }, margin: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN } } };
const sec = (props, children) => ({ properties: props, headers: { default: header }, footers: { default: footer }, children });

const doc = new Document({
  creator: 'Taranis SA', title: 'AI Voices on LinkedIn', description: 'Tech posting frequency and engagement of seven AI voices and similar voices',
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
    sec(portrait, [...title, ...exec, ...method, ...overview, ...profiles]),
    sec(landscape, simSec),
    sec(portrait, takeaways),
    sec(landscape, rawSec),
  ],
});

Packer.toBuffer(doc).then(b => { fs.writeFileSync(OUT, b); console.log(OUT, b.length, 'bytes'); });
