"""Writes REPORT.md for the full TMS LinkedIn Competitive Review from data/*.csv."""
import csv, os
HERE = os.path.dirname(os.path.abspath(__file__))
def D(n):
    with open(os.path.join(HERE, "data", n + ".csv"), newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))
def cell(v):
    v = (v or "").replace("|", "/").replace("\n", " ")
    if v.startswith("http"):
        lab = "post" if "/posts/" in v or "/feed/" in v else ("page" if "/company/" in v else v.split("/")[2].replace("www.", ""))
        return f"[{lab}]({v})"
    return v
def table(rows, cols):
    out = ["| " + " | ".join(l for _, l in cols) + " |", "|" + "---|" * len(cols)]
    out += ["| " + " | ".join(cell(r.get(k, "")) for k, _ in cols) + " |" for r in rows]
    return "\n".join(out)

hfc, hfl, hfp, mtv, mtm, mts, tvf = D("hf_competitors"), D("hf_linkedin"), D("hf_posts_sample"), D("monchau_tech_vs_other"), D("monchau_tech_monthly"), D("monchau_tech_samples"), D("tech_voices_frequency")
comp, pages, pos, li, cad = D("competitors_all"), D("pages_all"), D("positioning_all"), D("linkedin_all"), D("cadence_all")
peers, voices, plan, mix, monthly = D("swiss_peers"), D("voices"), D("plan_all"), D("monchau_mix"), D("monchau_monthly")
topics, react, fmt, samples, raw = D("monchau_topics"), D("monchau_reactions"), D("monchau_format_engagement"), D("monchau_samples"), D("posts_raw_all")
pcols = list(pages[0].keys())

md = f"""# TMS LinkedIn Competitive Review

Prepared 27 Oct 2026 for Taranis SA (Geneva). "Taranis" here is Taranis SA, the FINMA-authorised asset manager ([LinkedIn](https://www.linkedin.com/company/taranis-sa)), not Perenco's Taranis energy assets or the DFSA-registered Taranis Capital.

**Deliverables in this folder**
- `dashboard.html`: self-contained dashboard (d3 and all data inlined; opens offline).
- `TMS_LinkedIn_Competitive_Review.docx`: detailed Word report with links and charts.
- `data/posts_raw_all.csv`: {len(raw)} posts (author, true_date_utc, format, reactions, comments, shares, text, url).
- `data/*.csv`: every table below. `count_queries.csv` and `count_queries_swiss.csv`: every Crustdata count query.
- Build scripts: `build_data.py`, `build_dashboard.py`, `build_word.js`, `build_report_md.py`.

## Update (27 Oct): institutional tech hedge funds

The competitor set is now five non-retail tech hedge funds. The earlier Swiss/UCITS peer set below is kept for reference.

{table(hfc, [("fund","Fund"),("hq","HQ"),("founded","Founded"),("aum","AUM (as reported)"),("aum_source","Source"),("strategy","Strategy"),("founder","Founder"),("founder_linkedin","Founder LinkedIn"),("linkedin","Company LinkedIn"),("website_type","Website"),("gate","Gate")])}

**LinkedIn, 17 Jun – 17 Sep 2026**

{table(hfl, [("fund","Fund"),("company_posts_lifetime","Posts all-time"),("company_posts_13w","Posts 13w"),("posts_per_week","Per week"),("formats_13w","Formats"),("median_reactions_est","Typical reactions"),("best_post_reactions","Best"),("best_post_url","Link"),("channel","Channel"),("strong_points","Strong points"),("what_taranis_can_learn","What Taranis can learn")])}

**Sample posts**

{table(hfp, [("author","Author"),("true_date_utc","Date"),("format","Format"),("reactions","Reactions"),("comments","Comments"),("shares","Shares"),("text","Post"),("url","Link")])}

## Update (27 Oct): Monchau's tech posts vs his other posts (17 Jun – 17 Sep 2026)

{table(mtv, [("threshold","≥ reactions"),("tech_posts_at_or_above","Tech posts"),("tech_share","Tech share"),("other_posts_at_or_above","Other posts"),("other_share","Other share"),("tech_relative_lift","Tech lift")])}

{table(mtm, [("period","Period"),("tech_posts","Tech posts"),("all_posts","All posts"),("tech_share","Tech share")])}

{table(mts, [("post","Post"),("true_date_utc","Date"),("format","Format"),("reactions","Reactions"),("comments","Comments"),("shares","Shares"),("note","Note"),("url","Link")])}

## Update (27 Oct): high-frequency tech voices like Monchau

{table(tvf, [("name","Voice"),("posts_13w","Posts 13w"),("posts_per_week","Per week"),("credited_share","Credit a source"),("top_post","Top post"),("top_reactions","Reactions"),("top_url","Link"),("authorship_signal","Own posts? (signal)")])}

Attribution is the measurable signal: Monchau credits a source in 86% of posts (a curator); these voices credit others in 6–19% and write in their own voice. Ghostwriting or team support cannot be verified from public data.

## 1. Executive summary

- **TMS discloses the least of any peer.** Behind its professional-investor gate, [the TMS page](https://taranis.net/investment/tms) shows three paragraphs and an award line: no performance, ISIN, fees, AUM, documents or team, and the two sleeves (2016 systematic sentiment engine; Dec 2025 discretionary tech/AI-disruption sleeve) are not stated. Schroders (Contour) and UBP (Shannon River) show full performance behind the same kind of Swiss gate; AtonRâ, BIT and DECALIA's factsheet show it openly.
- **Taranis posts least among active peers.** 2 company-page posts in 13 weeks (0.15/week) against DECALIA's 30 (2.31/week, the Swiss boutique bar) and Pictet's 89 (6.85/week, corporate-heavy). Contour, Jericho and Shannon River post nothing (confirmed by live search), so the international TMT long/short channel is empty.
- **People carry reach, not pages.** Symbit's page: 0 reactions; co-founder's reshare of the same news: 108. DECALIA's page best: 63; its CIO's own post: 153. Julien Leegenhoek's posts: 48–64; the Taranis page's reshares of them: 14.
- **Monchau is a curation engine.** About 81 posts a week, 86% crediting a "Source". Own-view and Syz-branded posts clear 54 reactions 5% of the time, curated ones 59%. Borrow his chart-first format, not his volume.
- **The Swiss tech-AI thesis lane is open.** AtonRâ writes the best original tech theses but gets 0–10 reactions; Pictet's tech PMs post nothing; DECALIA's feed is 13% tech.

## 2. Caveats

- The Crustdata index ends around 17 Sep 2026; LinkedIn's login wall blocked a live TinyFish refresh, so later posts are not counted.
- AtonRâ reads 0 in the window, but a [live post dated 30 Sep 2026](https://www.linkedin.com/posts/atonra_invest-with-proof-not-faith-activity-7511080011416875008-nFgh) and nine [research notes](https://www.atonra.ch/investment-research) from July to September exist; the index misses it. Its 2025 same-window rate (15 posts, 1.15/week) is the estimate.
- Contour, Jericho and Shannon River read 0 and live web search (27 Oct) found no posts of their own: genuinely quiet, not under-indexed.
- Pictet and DECALIA counts include corporate content. Topic shares are keyword matches and overlap.
- Index dates drift by up to four weeks; true dates are decoded from post IDs (`id >> 22` = ms since epoch). The index's "repost" label is not a curation signal; "Source" credits are used.
- Post images are linked, not embedded. From the brief, Monchau's Sep 1–16 topic counts and format medians are shown as reference values; the "Anthropic conspiracy theories" post was not found (the index match is a Fort Knox post); the JPM "AI borrowers" post shows 1 share, so "most-shared" is not borne out.
- Founding year: the brief says 2021; Crustdata says 2020 and Leegenhoek's Sep 2024 post refers to founding "four years ago" ([post](https://www.linkedin.com/posts/julien-leegenhoek_withintellligence-liquidalternatives-alphagenerator-activity-7239259080861626368-FwAo)). Not resolved.

## 3. Competitor set

{table(comp, [("group","Group"),("fund","Fund"),("hq","HQ"),("aum","AUM"),("aum_date","As of"),("strategy","Strategy"),("why_close","Why close"),("status","Status"),("linkedin","LinkedIn"),("source","Source")])}

**Wider Swiss scan.** Only AtonRâ and Pictet run dedicated tech/AI products in Switzerland.

{table(peers, [("firm","Firm"),("fund","Nearest fund"),("strategy","Strategy"),("performance_disclosure","Performance"),("linkedin_posts_per_week","LinkedIn/week"),("url","Page")])}

## 4. Deliverable A: product-page teardown

The TMS gate (country → professional/retail → "I Accept") matches Schroders' and UBP's; what sits behind it does not.

{table(pages, [(c, c if i else "Attribute") for i, c in enumerate(pcols)])}

**Positioning summaries**

""" + "\n".join(f"- **{r['firm']}** ({cell(r['page_url'])}): {r['summary']}" for r in pos) + f"""

## 5. Deliverable B: LinkedIn activity (17 Jun – 17 Sep 2026)

**Posts per week, every account** (axis note: Monchau 80.8/week is off any shared scale).

{table(cad, [("account","Account"),("group","Group"),("channel","Channel"),("posts_13w","Posts, 13w"),("posts_per_week","Per week"),("note","Note")])}

**Per competitor**

{table(li, [("competitor","Competitor"),("channel","Channel"),("posts_per_week","Posts/week"),("dominant_format","Dominant format"),("original_vs_curated","Original vs curated"),("median_reactions","Median"),("best_post_reactions","Best"),("best_post_url","Link"),("lesson","What Taranis can learn / gap")])}

## 6. Monchau deep-dive

[Profile](https://www.linkedin.com/in/charles-henry-monchau-cfa-cmt-caia-4003096) · Crustdata person 28667460 · voice: curator first, educational, data-driven; cautious on rates, constructive on AI; broadcast style.

**a. Posts per day by month**

{table(monthly, [("month","Month"),("posts","Posts"),("days","Days"),("posts_per_day","Per day")])}

**b. Curated vs own view** (share reaching 54+ reactions)

{table(mix, [("segment","Segment"),("posts","Posts"),("posts_ge54","≥54"),("share_ge54","Share"),("definition","Definition")])}

**c. Topic mix** (Sep 1–16 hand-coded reference from the brief, n=136; Jun–Sep keyword counts, n=1,244)

{table(topics, [("topic","Topic"),("sep_posts","Sep posts"),("sep_share_of_136","Sep share"),("summer_posts","Jun–Sep posts"),("summer_share_of_1244","Jun–Sep share")])}

**d. Reaction distribution**

{table(react, [("threshold","≥ reactions"),("posts_at_or_above","Posts"),("share_of_1244","Share")])}

**e. Engagement by format** (median estimated from threshold counts, Jun 1 – Sep 16)

{table(fmt, [("format","Format"),("posts","Posts"),("median_reactions_est","Median (est.)"),("share_ge54","Share ≥54"),("brief_ref_median_sep","Brief Sep ref."),("note","Note")])}

**Sample posts**

{table(samples, [("post","Post"),("reactions","Reactions"),("note","Note"),("url","Link")])}

## 7. Famous tech voices

{table(voices, [("name","Voice"),("posts_per_week","Posts/week"),("dominant_format_top3","Top formats"),("best_post_reactions","Best"),("best_post_url","Link"),("what_taranis_can_borrow","What to borrow")])}

## 8. SWOT

| | |
|---|---|
| **Strengths** | The only tech L/S with a behavioural-sentiment overlay in the set; founder-CEO with BFM Business airtime whose own posts beat the page (64 vs 14); award history; clear AI-disruption thesis. |
| **Weaknesses** | 0.15 posts/week, lowest among active peers; page mirrors TV clips; French-only recent posts; 1,976 followers; product page shows nothing; "Managed Futures" award label. |
| **Opportunities** | Close competitors silent on LinkedIn; no Swiss tech-AI personal voice with reach; a proprietary weekly sentiment read no peer can copy. |
| **Threats** | BIT and AtonRâ already tell the human + AI story with numbers; Symbit occupies "Swiss + AI + L/S"; Pictet markets AI-enhanced equity at scale; FinSA limits public performance talk. |

## 9. Recommendations and operating plan

{table(plan, [("lever","Lever"),("recommendation","Recommendation"),("target_posts_per_week","Target/week"),("evidence","Evidence")])}

**Measure monthly** by re-running the free count queries once the index catches up. Three-month targets: company page ≥2.3 posts/week; Julien ≥1 original thesis/week; median ≥25 reactions on Julien's originals.
"""
open(os.path.join(HERE, "REPORT.md"), "w", encoding="utf-8").write(md)
print("REPORT.md", len(md))
