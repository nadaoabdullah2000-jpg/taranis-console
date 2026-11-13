const m = $json;
const arr = (v) => { if (Array.isArray(v)) return v; if (typeof v === 'string') { try { return JSON.parse(v || '[]'); } catch (e) { return []; } } return []; };
const norm = (s) => String(s || '').toLowerCase().replace(/[_\-\/]+/g, ' ').replace(/\s+/g, ' ').trim();

// Text the mandate is actually described in (alert prose + extracted fields).
// Scored on the investor's own fields. A report row's evidence also keeps the
// PDF passage and the report's title for people to read; neither is scored (the
// passage runs on into other firms' stories), and nor is WI's profile summary
// (wi_summary describes the firm, not what it wants). "does not state hedge fund
// appetite" is silence, not a hedge-fund signal. Same rule as the console.
const evidenceText = (ev) => {
  let x = ev;
  for (let i = 0; i < 2 && typeof x === 'string'; i++) { try { x = JSON.parse(x); } catch (e) { return String(ev); } }
  if (!x || typeof x !== 'object' || Array.isArray(x)) return JSON.stringify(x || {});
  const own = {};
  for (const k of Object.keys(x)) if (['passage', 'from_report', 'page', 'wi_summary'].indexOf(k) < 0) own[k] = x[k];
  return JSON.stringify(own);
};
const NO_APPETITE = /(does not state|doesn't state|no) hedge.fund appetite( stated)?|hedge.fund appetite (is )?not stated/g;
// Strategy tags read as words ("equity_long_short" -> "equity long short"), so a
// tag says long/short however With Intelligence spells it. Same rule as the console.
const tagWords = arr(m.strategies).map(s => String(s).toLowerCase().replace(/_/g, ' '));
const txt = [m.intention_summary, m.requirements_raw, m.appetite_raw, evidenceText(m.evidence),
  JSON.stringify(tagWords), JSON.stringify(arr(m.asset_classes))]
  .join(' ').toLowerCase().replace(NO_APPETITE, ' ');
// What the mandate itself says, for the CTA / macro / market-neutral test: its own
// text, and its strategy tags only when there are 3 or fewer. A long tag list is the
// investor's whole With Intelligence menu, so one "cta" or "global macro" among many
// does not make the mandate a macro or CTA mandate (9 Nov 2026). Same as the console's mandateText().
const mandateTxt = [m.intention_summary, m.requirements_raw, m.appetite_raw, evidenceText(m.evidence),
  tagWords.length <= 3 ? JSON.stringify(tagWords) : '']
  .join(' ').toLowerCase().replace(NO_APPETITE, ' ');

const reasons = []; const notes = []; const missing = [];

// ---------- NOT AN INVESTOR MANDATE (news / launch) ----------
const itag = String(m.investor_tag || '').toLowerCase();
if (/launch|new manager|market trend|service provider|people move|performance|fundrais|regulat|top story|top insight|managers insight/.test(itag)) {
  return { json: { ...m, hard_status: 'fail', us_review: false,
    hard_fail_reasons: JSON.stringify(['Not an investor mandate' + (m.investor_tag ? ' - WI filed it under ' + m.investor_tag : '')]),
    missing_hard_fields: JSON.stringify([]), soft_flags: JSON.stringify([]),
    hard_notes: JSON.stringify(['Stored so it can be read, kept out of review on purpose']),
    needs_data_reason: 'Not an investor mandate' } };
}

// ---------- A MANAGER IS NOT AN INVESTOR ----------
const RAISES_CAPITAL = /(^|\b)(bridgewater|citadel|millennium management|point ?72|two sigma|renaissance technologies|d\.? ?e\.? shaw|aqr capital|man group|brevan howard|elliott management|baupost|pershing square|third point|tiger global|coatue|marshall wace|capula|winton|bluecrest|balyasny|exodus ?point|schonfeld|\bkkr\b|blackstone|apollo global|carlyle|\btpg\b|ares management|mirabaud|haussmann fund|bradesco asset management|\bbram\b)(\b|$)/i;
if (RAISES_CAPITAL.test(String(m.investor_name || ''))) {
  return { json: { ...m, hard_status: 'fail', us_review: false,
    hard_fail_reasons: JSON.stringify([m.investor_name + ' raises capital rather than placing it, so it is not an investor']),
    missing_hard_fields: JSON.stringify([]), soft_flags: JSON.stringify([]),
    hard_notes: JSON.stringify(['Kept out of review deliberately']),
    needs_data_reason: 'Manager, not an investor' } };
}

// ---------- A MANAGER'S OWN NEWS IS NOT A MANDATE ----------
// Anything typed as a hedge fund, anything WI files under Shutter or Manager
// information, and People items with no investor type unless they speak of
// placing money. People items about an allocator stay. Same as the console.
// Hedge Fund Alert is WI's hedge-fund industry desk (launches, hires, new
// firms, performance): manager news too, unless the item has an investor
// type or speaks of placing money ("Ex-analyst to debut small-cap fund" was
// matched on its own launch strategy, 29 Oct 2026). The guard reads "search
// for" / "manager search", not any "search", so a new executive-search firm
// stays manager news.
const NEG = /(avoid[a-z]*|exclud[a-z]*|without|\bnot\b|\bno\b)\s[^.;,]{0,40}(systematic|quant[a-z]*|long.?short|l\/s)/g;
const ttype = String(m.investor_type || '').trim().toLowerCase();
// Whole words, so a manager's "head of quant research", "investment
// committee" or "seedling" does not make its People item an allocator's.
const PEOPLE_PLACES = /third.party|allocat|\bcommit(s|ted|ting|ment|ments)?\b|\bsearch(es|ing)?\b|\bseed(s|ed|er|ers|ing)?\b/;
const HFA_PLACES = /third.party|allocat|commit|\bsearch(es|ing)? for\b|manager search|\bseed(s|ed|er|ers|ing)?\b/;
// Any type that makes the firm a hedge fund itself ("startup hedge fund",
// "hedge fund manager"), but not a fund OF hedge funds, which is an investor.
const HF_TYPE = /\bhedge funds?\b/.test(ttype) && !/\b(funds?|fund-of) of hedge funds?\b|\bfund of funds\b/.test(ttype);
const mgrNews = HF_TYPE || itag === 'shutter' || itag === 'manager information'
  || (itag === 'people' && !ttype && !PEOPLE_PLACES.test((txt + ' ' + ttype).replace(NEG, ' ')))
  || (itag === 'hedge fund alert' && !ttype && !HFA_PLACES.test(txt.replace(NEG, ' ')));
if (mgrNews) {
  return { json: { ...m, hard_status: 'fail', us_review: false,
    hard_fail_reasons: JSON.stringify(['Not an investor mandate - manager news' + (m.investor_tag ? ' (WI filed it under ' + m.investor_tag + ')' : '')]),
    missing_hard_fields: JSON.stringify([]), soft_flags: JSON.stringify([]),
    hard_notes: JSON.stringify(['A manager\'s hire, shutter or relaunch, not an allocator placing money']),
    needs_data_reason: 'Not an investor mandate' } };
}

// ---------- MANAGER NEWS BY ITS LINKS AND HEADLINE (11 Nov 2026) ----------
// The tag test above needs With Intelligence's tag; the same story often comes
// again untagged (HF Ranch, Convexa, JonesTrading on 6 Nov). So an item is also
// manager news when (a) its With Intelligence links reach only a manager or fund
// page, never an investor page, or (b) it has no investor page and no investor
// type and its headline is a manager's own event (launch, startup, hire, flows,
// returns) with no word of placing money.
const linkLabels = arr(m.source_links).map(l => String((l && l.label) || '').replace(/\s+/g, ' ').trim());
const linkMgr = linkLabels.some(l => /^view (manager|fund)$/i.test(l));
const linkInv = linkLabels.some(l => /^view investor$/i.test(l)) || /withintelligence\.com\/(explore\/)?investors\//i.test(String(m.view_investor_url || ''));
const headline = linkLabels.filter(l => l && !/^view /i.test(l)).join(' | ') || String(m.intention_summary || '');
const MGR_EVENT = /\b(launch(es|ed|ing)?|unveils?|debuts?|startup|start-up|spins? (out|off)|spin-?(out|off)|posts?|net (in)?flows|returned|takes on|taps|hires?|names|appoints?|joins|promotes?|rebrands?|shutters?|winds? down)\b/i;
const PLACES_MONEY = /allocat|commit|\bsearch(es|ing)?\b|\bseeks?\b|\beyes?\b|\bplans?\b|\bconsider|\binvest(s|ing|ment)?\b|\bwants?\b|\bmandates?\b|\brfp\b|\bseed(s|ed|ing)?\b|\bbacks?\b|\bfavou?rs?\b|\bprefers?\b|\binvestors? (target|seek|eye)\w*/i;
const mgrByLinks = linkMgr && !linkInv && !PLACES_MONEY.test(headline);   // a seeder "backs startups": kept
const mgrByHead = !linkInv && !ttype && MGR_EVENT.test(headline) && !PLACES_MONEY.test(headline);
if (mgrByLinks || mgrByHead) {
  return { json: { ...m, hard_status: 'fail', us_review: false,
    hard_fail_reasons: JSON.stringify(['Not an investor mandate - manager news (' + (mgrByLinks ? 'With Intelligence links only to a manager or fund page' : 'headline is a manager event') + ')']),
    missing_hard_fields: JSON.stringify([]), soft_flags: JSON.stringify([]),
    hard_notes: JSON.stringify(['A manager\'s launch, hire or results, not an allocator placing money']),
    needs_data_reason: 'Not an investor mandate' } };
}

// ---------- HEDGE FUND IS THE ONLY HARD FILTER ----------
// Reject only when we have POSITIVE evidence the allocator is not a hedge-fund
// buyer: asset classes stated and none are hedge/alternative, OR an ineligible
// entity type. Silence is never a reject - it is needs-data.
const assets = arr(m.asset_classes).map(norm);
const acText = assets.join(' ');
const HEDGE = /(hedge|alternative|absolute return|liquid alt)/;
const itype = norm(m.investor_type);
const INELIGIBLE_T = /(private equity|venture capital|service provider|placement agent|law firm|real estate|infrastructure|data provider)/;
const notHedge = (assets.length > 0 && !HEDGE.test(acText) && !HEDGE.test(txt));
if (INELIGIBLE_T.test(itype)) {
  return { json: { ...m, hard_status: 'fail', us_review: false,
    hard_fail_reasons: JSON.stringify(['Type not a hedge-fund allocator: ' + m.investor_type]),
    missing_hard_fields: JSON.stringify([]), soft_flags: JSON.stringify([]),
    hard_notes: JSON.stringify([]), needs_data_reason: null } };
}
if (notHedge) {
  return { json: { ...m, hard_status: 'fail', us_review: false,
    hard_fail_reasons: JSON.stringify(['Asset class excludes hedge funds: ' + (arr(m.asset_classes).join(', ') || '?')]),
    missing_hard_fields: JSON.stringify([]), soft_flags: JSON.stringify([]),
    hard_notes: JSON.stringify([]), needs_data_reason: null } };
}

// ---------- STRATEGY / TECH SIGNAL (the spine) ----------
// "systematic" alone is not long/short or quant ("systematic trend following"
// is a CTA): it counts only when the text has no CTA/macro/market-neutral wording.
// A strong word inside a refusal ("avoiding any systematic or quant") is dropped.
// "equity long" never as "equity long-only" (the opposite of long/short);
// "quant" never as "quantitative easing". Same rule as the console.
const STRONG = /long short|long\/short|long-short|l\/s|equity hedge|equity long(?![ -]?only)|\bquant(?!itative (?:easing|tightening|analysis|due diligence|screening|assessment|review|research))/;
const EXCL = /\bcta\b|managed future|trend follow|global macro|macro strategy|macro fund|macro manager|discretionary macro|systematic macro|market neutral|market-neutral/;
const txtS = (txt + ' ' + ttype);
const sysOk = !EXCL.test(txtS);
// Long/short is read from the mandate's own text, evidence and asset classes, not the strategy tags: a tag
// counts only on a short list (tagStrong, 3 or fewer). A long/short tag in a long list is the investor's whole
// With Intelligence menu (13 Nov 2026, decided by research@taranis.net). Same rule as the console's lsText().
const txtLS = [m.intention_summary, m.requirements_raw, m.appetite_raw, evidenceText(m.evidence),
  JSON.stringify(arr(m.asset_classes)), ttype].join(' ').toLowerCase().replace(NO_APPETITE, ' ');
const txtN = txtLS.replace(NEG, ' ');
// Strategy tags as words ("equity_long_short" -> "equity long short"). A tag
// only counts when the mandate lists 3 strategies or fewer: on a long menu (a
// pension's whole hedge-fund book) one long/short tag among many says little.
// Same rule as the console's isStrong(). Tags can arrive double-encoded.
let tags = m.strategies;
for (let i = 0; i < 2 && typeof tags === 'string'; i++) { try { tags = JSON.parse(tags); } catch (e) { tags = []; } }
const stratWords = (Array.isArray(tags) ? tags : []).map(s => String(s).toLowerCase().replace(/_/g, ' '));
const tagStrong = stratWords.length > 0 && stratWords.length <= 3
  && stratWords.some(s => STRONG.test(s) || (sysOk && /systematic/.test(s)));
const strongCore = STRONG.test(txtN) || (sysOk && /systematic/.test(txtN)) || tagStrong;
// Equity in a hedge-fund context counts toward long/short (11 Nov 2026; same rule as the console's
// equityInHf): "equity", "equity hedge", "equity long/short", "equity l/s" or "fundamental equity" in a
// sentence about hedge funds (may match), or as a strategy tag when hedge funds are among the asset
// classes: a match only when hedge funds are the only asset class and there is no long-only tag;
// otherwise long/short for review only. Never long-only, private equity, equity market-neutral, or
// listed / public equity without hedge-fund context.
const EQ_TAG = /^(fundamental )?equit(y|ies)$|^equity (hedge|long ?\/ ?short|long short|l\/s)$/;
const HF_WORD = /\bhedge[- ]funds?\b|\bhfs?\b|\bfund of hedge funds\b|\babsolute return\b/;
const EQ_NOT = /private equity|equity market[- ]neutral|long[- ]only equit(y|ies)|equit(y|ies) long[- ]only|long[- ]only|(listed|public) equit(y|ies)/g;
let eqHow = null;
{
  const own = [m.intention_summary, m.requirements_raw, m.appetite_raw].map(x => String(x || '')).join(' ').toLowerCase();
  for (const sen of own.split(/(?<=[.!?;\u2022])\s+/)) {
    if (HF_WORD.test(sen) && /\b(fundamental )?equit(y|ies)\b/.test(sen.replace(EQ_NOT, ' '))) { eqHow = 'text'; break; }
  }
  const assetNames = arr(m.asset_classes).map(a => String(a));
  if (!eqHow && assetNames.some(a => /hedge/i.test(a)) && stratWords.some(w => EQ_TAG.test(w.trim()))) {
    const onlyHf = assetNames.every(a => /hedge|alternative|absolute return/i.test(a));
    const longOnly = stratWords.some(w => /long only|long-only|long bias/.test(w));
    eqHow = onlyHf && !longOnly ? 'tag' : 'review';
  }
}
const strong = strongCore || !!eqHow;
const eqReviewOnly = !strongCore && eqHow === 'review';
// Technology as whole words: not biotech, techniques or technician. Clauses
// that turn tech away ("avoid funds overly exposed to software and
// technology") and plan or firm names ("Information Technology Industry",
// "Virginia Tech Foundation") are dropped first; plain "technologies" is
// nearly always a firm's name, so only "emerging/innovative/... technologies"
// counts. Same rule as the console (isTech) and the gateway's topic filter.
const TECH = /\b(?:tech|technology|software|semiconductors?|tmt|internet|saas|fintech)\b/;
// The turning-away clause runs to the end of the sentence, but stops at a
// comma that opens a positive clause ("excluding tobacco, focus on
// technology"). Same rule as the console.
const TECH_OFF = /\b(?:avoid[a-z]*|exclud[a-z]*|low on|away from|otherwise be)\b(?:(?!,\s*(?:and\s+)?(?:instead|but|while|whereas|rather|focus\w*|prefer\w*|seek\w*|look\w*|interest\w*|keen|target\w*|want\w*|lik\w*)\b)[^.;])*/g;
const TECH_NAME = /\b(?:information )?technology industry\b|\b[a-z]+ tech (?:foundation|university)\b/g;
const TECH_PLURAL = /\b(?:emerging|innovative|new|disruptive|digital|climate|clean|financial|advanced) technologies\b/g;
// A With Intelligence "investment themes" line naming AI, data, digital infrastructure, blockchain,
// cybersecurity or deep tech counts as technology (11 Nov 2026). Same rule as the console (RE_THEME_TECH).
const THEME_TECH = /\b(?:investment )?themes?\b[^.;]{0,40}?\b(?:over|for|include[sd]?|focus(?:es|ed)? on|are|is)\b[^.;]*?\b(?:artificial intelligence|ai|machine learning|data|digital infrastructure|blockchain|cyber ?security|deep tech)\b/i;
const techTxt = txtS.replace(/_/g, ' ').replace(TECH_OFF, ' ');
const tech   = TECH.test(techTxt.replace(TECH_NAME, ' ').replace(TECH_PLURAL, ' technology ')) || THEME_TECH.test(techTxt);
const excl   = EXCL.test(mandateTxt);
// Checked, no matching strategy (13 Nov 2026; same rule as the console's noMatchingStrategy): hedge-fund
// strategies are stated (as tags, or in an alert text about hedge funds) and none is long/short, quant, tech or
// space -> low fit, not needs data. Needs data stays for an allocator with no hedge-fund strategy stated.
const HF_STRAT = /\b(?:global )?macro\b|event[- ]driven|multi[- ]?strateg|relative value|\bcta\b|managed futures?|trend[- ]follow|market[- ]neutral|merger arbitrage|convertible arbitrage|fixed income arbitrage|statistical arbitrage|volatility|risk premia|insurance[- ]linked/;
const hfStratStated = (stratWords.length > 0 && stratWords.length <= 3 && stratWords.some(w => HF_STRAT.test(w)) && !stratWords.some(w => STRONG.test(w)))
  || (t => HF_WORD.test(t) && HF_STRAT.test(t))([m.intention_summary, m.requirements_raw, m.appetite_raw].map(x => String(x || '')).join(' ').toLowerCase());
// Space (4 Nov 2026; security & defence counts too, 11 Nov 2026): replaces "buys hedge funds" as a scored point; scores
// like technology. Explicit space wording only: not "office space", "in the AI
// space" or "satellite allocations". Same rule as the console (RE_SPACE).
const SPACE = /\b(space (economy|technology|technologies|tech|sector|industry|exploration|infrastructure|companies|startups?|ventures?|investing|investments?|theme)|spacetech|new space|outer space|satellite (operators?|compan(y|ies)|communications|constellations?|launch(es)?|imagery|broadband|internet|networks?)|aerospace|orbital|launch vehicles?|space-related|space and defen[cs]e|security (?:and|&) defen[cs]e|security & defen[cs]e)\b/i;
const spaceHit = (txtS.match(SPACE) || [])[0] || null;
const space = !!spaceHit;
const theme = tech || space;

const c = String(m.investor_country || '').toUpperCase().replace(/[^A-Z]/g, '');
const US = ['US','USA','UNITEDSTATES'];
const GBCHUS = ['GB','UK','GBR','CH','CHE','US','USA','UNITEDSTATES','UNITEDKINGDOM','ENGLAND','SCOTLAND','SWITZERLAND'];
if (!c) missing.push('investor_country');

// Context-only emerging flag (never a hard reject here; it nudges the score).
if (m.open_to_emerging_managers === null || m.open_to_emerging_managers === undefined) missing.push('emerging_managers');

// ---------- VERDICT ----------
// pass     -> strong (L/S or quant): clean, can publish if the scorer agrees
// uncertain-> tech-only (rescue), CTA/macro/MN (low but kept), or no signal (needs-data)
// Nothing here rejects for a thin record; that is what needs-data means.
let hard_status, band, needs_data_reason = null;
if (strong && itag === 'people') { hard_status = 'uncertain'; band = 'hire'; notes.push('An allocator\'s hire with a strategy match - worth a look, not an automatic match'); }
// Matched requires long/short (or quant) AND technology (11 Nov 2026): long/short
// without technology (space does not count) passes to review, not to a match.
else if (strong && eqReviewOnly) { hard_status = 'uncertain'; band = 'strong'; notes.push('Long/short from an equity tag beside other asset classes or a long-only tag - review, not a match'); }
else if (strong) { hard_status = tech ? 'pass' : 'uncertain'; band = theme ? 'strong_tech' : 'strong'; notes.push('Strategy matches directly' + (eqHow && !strongCore ? ' (equity in a hedge-fund context)' : '') + (tech ? ' (+ technology)' : ' - no technology, so review, not a match') + (space ? ' (+ space)' : '')); }
else if (theme)  { hard_status = 'uncertain'; band = 'tech';        notes.push('No strategy stated, ' + (tech ? 'technology' : 'space') + ' interest - kept for review'); }
else if (excl)   { hard_status = 'uncertain'; band = 'low';         notes.push('CTA/macro/market-neutral and no L/S, quant or tech - low but kept'); }
else if (hfStratStated) { hard_status = 'uncertain'; band = 'low'; notes.push('Checked, no matching strategy: hedge-fund strategies stated, none long/short, quant, tech or space - low fit'); }
else             { hard_status = 'uncertain'; band = 'needs_data';  needs_data_reason = 'No strategy or tech signal in the text'; notes.push('Hedge-fund allocator, strategy not stated - needs data'); }

return { json: { ...m,
  hard_status,
  score_band: band,
  us_review: US.includes(c),
  in_market: GBCHUS.includes(c),
  sig_strong: strong, sig_tech: tech, sig_space: space, sig_excluded: excl,
  is_space: space ? true : (String(txtS).trim() ? false : null),
  space_signal: space ? 'Alert text mentions "' + spaceHit + '"' : (String(txtS).trim() ? 'Alert text: no space' : null),
  needs_data_reason,
  hard_fail_reasons: JSON.stringify(reasons),
  missing_hard_fields: JSON.stringify(missing),
  soft_flags: JSON.stringify([]),
  hard_notes: JSON.stringify(notes) } };

