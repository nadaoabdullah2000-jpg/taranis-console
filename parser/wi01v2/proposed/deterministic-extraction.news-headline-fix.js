const block = $json.raw_block || "";

const ac = block.match(/Asset\s*class\s*[:.]\s*([^<\n|]+)/i);
const rg = block.match(/Region\s*[:.]\s*([^<\n|]+)/i);
const st = block.match(/Strategy\s*[:.]\s*([^<\n|]+)/i);
const dm = block.match(/(\d{1,2})(?:st|nd|rd|th)?\s+(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{4})/i);
let alert_date = null;
if (dm) { const d = new Date(dm[0]); if (!isNaN(d.getTime())) alert_date = d.toISOString().split("T")[0]; }

const links = [];
const re = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
let mm;
while ((mm = re.exec(block)) !== null) {
  let url = mm[1].replace(/&amp;/g, '&').trim();
  if (!/^https?:\/\//i.test(url)) continue;
  const label = mm[2].replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
  links.push({ label: label, url: url.split('#')[0] });
}

const byLabel = (pats, exclude) => {
  for (const p of pats) {
    const hit = links.find(l => l.label && p.test(l.label) && (!exclude || exclude.indexOf(l.url) === -1));
    if (hit) return hit.url;
  }
  return null;
};
const investorUrl = byLabel([/^view\s*investor$/i, /view\s*investor/i, /view\s*profile/i]);
const t1 = investorUrl ? [investorUrl] : [];
const intentionUrl = byLabel([/^view\s*intention$/i, /view\s*intention/i, /view\s*mandate/i], t1);
const t2 = t1.concat(intentionUrl ? [intentionUrl] : []);
const articleUrl = byLabel([/^view\s*article$/i, /view\s*article/i, /read\s*(the\s*)?article/i], t2);

const plainBlock = block.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ')
  .replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

// HEADLINE - the longest anchor label that is not a button.
const BUTTONISH = /^(view|read|open|unsubscribe|manage|update|privacy|terms|contact|click|here|learn|see)\b/i;
let headline = null, best = 0;
for (const l of links) {
  if (!l.label || BUTTONISH.test(l.label)) continue;
  if (l.label.length > best && l.label.length >= 20) { best = l.label.length; headline = l.label; }
}
if (!headline) {
  const cut = block.search(/Asset\s*class\s*[:.]/i);
  const head = cut > 0 ? block.slice(0, cut) : block;
  const lines = head.replace(/<[^>]*>/g, '\n').split('\n')
    .map(s => s.replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/\s+/g,' ').trim())
    .filter(s => s.length >= 25 && s.length <= 220 && !/^https?:/i.test(s) && !/[{}<>]/.test(s) && !/\.(png|jpg|gif|css)/i.test(s));
  if (lines.length) headline = lines.sort((a,b) => b.length - a.length)[0];
}

// CATEGORY - WI labels every block with what kind of item it is.
const catCut = block.search(/Asset\s*class\s*[:.]/i);
const catHead = catCut > 0 ? block.slice(0, catCut) : block;
let category = null;
const catRe = /<p[^>]*font-weight:\s*700[^>]*color:\s*#383844[^>]*>([^<]{2,40})<\/p>/gi;
let cm;
while ((cm = catRe.exec(catHead)) !== null) {
  const t = cm[1].replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
  if (t) category = t;
}
if (!category) {
  const plainHead = catHead.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
  const km = plainHead.match(/(Profile alert|Manager searches|Managers insight|Investor insight|Service providers|Market trend|People moves|New manager|Top story|Top insight|Performance|Fundraising|Regulation|Launch|Mandate|Intention)/i);
  if (km) category = km[1];
}

const cl = String(category || '').toLowerCase();
let item_type = 'unknown';
if (/manager search|investor insight|mandate|intention|allocat|profile alert/.test(cl)) item_type = 'mandate';
else if (/launch|new manager/.test(cl)) item_type = 'launch';
else if (/market trend|service provider|people|investor information|article|performance|fundrais|regulat|top story|top insight|managers? insight|manager move|obituary/.test(cl)) item_type = 'news';

// ---------- WHO IS THIS ABOUT? ----------
// With Intelligence writes three shapes, and until recently only one was read.
//
//   EVENT        "Al Rajhi family starts direct lending search"
//                A news sentence, so the firm precedes the verb.
//
//   DEFINITION   "A new Investor profile has been added to With Intelligence
//                 Prasid Uno Family Trust is the Mumbai, India based single
//                 family office of Tushar Kumar."
//                The headline names nobody; the subject is in the line below.
//
//   ANNOUNCEMENT "Mandate has been added - Houston Police Officers' Pension
//                 System (HPOPS) The pension system is considering a full
//                 redemption from Arkkan Opportunities Fund."
//                The name is to the RIGHT of the dash. The headline reader
//                split on that dash and kept the left, "Mandate has been
//                added", which the sentence guard then correctly rejected.
//
// Both shapes that were not read produced no name and went to Log Parse Drift,
// so every profile alert and every mandate announcement was discarded. Those
// are new investor records and live mandates - the two most valuable things in
// the digest.
//
// A name ends where the next sentence begins, and these entries always begin
// theirs by referring back - "The pension system is...", "It has..." - so that
// determiner is the boundary. Far more reliable than guessing where a proper
// noun stops.
const STOP_AT = '(?=\\s+(?:The|This|That|These|It|Its|They|He|She|In|Following)\\s|\\s*Asset\\s*class|\\s*Region\\s*:|$)';

// WI sends UTF-8 that some forwards mangle into latin-1, so an apostrophe
// arrives as a stray character. Left alone, "Houston Police Officers Pension
// System" is what gets stored and what somebody has to read.
const demojibake = (s) => String(s)
  .replace(/â€™|â€˜|â(?=\s)/g, "'")
  .replace(/â€\u009c|â€\u009d/g, '"')
  .replace(/â€”/g, '-');

const readable = demojibake(plainBlock);
let namedSubject = null;

// ANNOUNCEMENT first: when it matches, the name is stated outright.
const annRe = new RegExp(
  '\\b(?:mandate|intention|investor|profile|consultant)\\s+has\\s+been\\s+added\\s*[-\\u2013\\u2014:]\\s*([^.|]{3,90}?)' + STOP_AT, 'i');
const ann = readable.match(annRe);
if (ann) namedSubject = ann[1];

// DEFINITION next.
if (!namedSubject && /profile has been added/i.test(readable)) {
  const after = readable.split(/profile has been added to With Intelligence/i)[1] || readable;
  // The definition opens with the name and then qualifies it - "The Fukutake
  // Foundation, established in 2004...", "Pangaea Wealth Pte Ltd ("Pangaea
  // Wealth") is a..." - so the name ends at the first comma, bracket or verb.
  const lead = after.match(/^\s*([A-Z][^,(.|]{2,88}?)\s*(?:,|\(|\s+(?:is|was|are)\s)/);
  const pm = lead || after.match(/^\s*([A-Z][^.|]{2,90}?)\s+is\s+(?:the|a|an|based|headquartered)\b/);
  if (pm) namedSubject = pm[1];
}
if (!namedSubject) {
  const pm2 = readable.match(/(?:profile has been added to With Intelligence\s+)?([A-Z][^.|]{2,90}?)\s+is\s+(?:the|a|an)\s+/);
  if (pm2) namedSubject = pm2[1];
}

if (namedSubject) {
  namedSubject = namedSubject.replace(/^(the|a|an)\s+/i, '')
    .replace(/[.,;:&\-–—]+$/, '').trim();
  // A stated subject is a name, not a sentence. A verb means the match has
  // swallowed something it should not have.
  if (namedSubject.length < 3 || namedSubject.length > 80 ||
      /\b(has|have|been|will|seeks?|plans?|adds?|added|announces?|considering)\b/i.test(namedSubject)) {
    namedSubject = null;
  }
}

// EVENT: the firm precedes the verb in a news headline.
let fromHeadline = null;
if (headline) {
  const VERBS = /\b(starts?|seeks?|plans?|looks?|eyes|hires?|adds?|targets?|launch(?:es)?|weighs?|mulls?|taps?|backs?|commits?|allocat(?:es|ing)|explor(?:es|ing)|consider(?:s|ing)|expand(?:s|ing)|boosts?|cuts?|reviews?|appoints?|names?|picks?|selects?|issues?|opens?|to\s+\w+|is\s+\w+ing|has\s+\w+ed|wants?|prepar(?:es|ing)|shifts?|moves?|raises?|doubl(?:es|ing)|trims?|drops?|returns?|revamps?|rethinks?|steps?)\b/i;
  const m = demojibake(headline).match(VERBS);
  const hl = demojibake(headline);
  // Only a known verb marks where the subject ends. Without one there is no
  // safe cut: splitting on punctuation took a headline's first word ("Pharma-
  // advisory dynasty bolsters..." became "Pharma", "ABL, distressed debt ...
  // lead Julius Baer ..." became "ABL"). The model reads the whole block, so
  // its name stands instead of a guess.
  let cand = m ? hl.slice(0, m.index).trim() : '';
  cand = cand.replace(/^(the|a|an)\s+/i, '').replace(/[.,;:]+$/, '').trim();
  const words = cand.split(/\s+/);
  if (words.length > 6) cand = words.slice(0, 6).join(' ');
  if (cand.length >= 3 && cand.length <= 80 && !/[<>{}]/.test(cand) && !/\.(png|jpg|gif)/i.test(cand)) {
    fromHeadline = cand;
  }
}

// A stated subject wins. Where a block says "X is the ..." or "added - X",
// X is the subject beyond argument; a headline-derived name is a guess about
// grammar.
if (namedSubject) fromHeadline = namedSubject;

// MANDATE-ALERT HEADER: the "Intentions / Investor - <Name>" header carries the
// investor name in a bare span, and it beats the headline for these blocks -
// the headline there reads a requirements sentence like "Excludes Fund I...".
// It does not fire on news blocks (plural "Investors" sub-label, no name span)
// nor on profile alerts (name is in the definition sentence, handled above).
let headerName = null;
const DATE_ONLY = /^\d{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]+\s+\d{4}$/;
// Since Oct 2026 WI puts a dot-spacer table (~600 chars of markup) between the
// "Investor" label and the name span, so the window is wide and the span must
// hold text, not whitespace. Profile alerts have no name span there: the first
// one is the alert date, which is never a name.
const hnm = block.match(/color:#63626a[^>]*>\s*Investor\b[\s\S]{0,2000}?<span[^>]*>\s*([^<\s][^<]{1,89}?)\s*<\/span>/i);
if (hnm) {
  let hn = demojibake(hnm[1]).replace(/&#0?39;|&rsquo;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&').replace(/\s+/g, ' ').replace(/[.,;:]+$/, '').trim();
  if (hn.length >= 2 && hn.length <= 90 && !/^investors?$/i.test(hn)
      && !/^https?:/i.test(hn) && !/[{}<>]/.test(hn) && !DATE_ONLY.test(hn)) headerName = hn;
}
if (headerName) fromHeadline = headerName;

let liUrl = links.find(l => /linkedin\.com\/in\//i.test(l.url));
liUrl = liUrl ? liUrl.url.split('?')[0] : null;

return { json: { ...$json,
  det_headline: namedSubject ? (namedSubject + ' — ' + (category || 'new record')) : headline,
  det_investor_from_headline: fromHeadline,
  det_investor_name: null,
  det_investor_tag: null,
  det_category: category,
  det_item_type: item_type,
  det_named_subject: namedSubject,
  det_asset_class: ac ? ac[1].trim() : null,
  det_region: rg ? rg[1].trim() : null,
  det_strategy: st ? st[1].trim() : null,
  det_alert_date: alert_date || ($json.source_email_date ? String($json.source_email_date).split("T")[0] : null),
  det_view_article_url: articleUrl,
  det_view_intention_url: intentionUrl,
  det_view_investor_url: investorUrl,
  det_linkedin_url: liUrl,
  det_source_links: JSON.stringify(links.slice(0, 20))
}};