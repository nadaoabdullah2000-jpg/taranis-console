"""Derived tables for the TMS vs tech long/short hedge funds review (28 Oct 2026).

Inputs in data/ (written by the research passes):
  product_pages.csv, positioning.csv          site teardown + hard-filter checks (one row per fund + TMS)
  linkedin_counts.csv, count_queries.csv      free Crustdata counts, every query logged
  posts_sample.csv                            paid pull + live public post pages
  monchau_*.csv, voices.csv, tech_voices_frequency.csv  copied from the 27 Oct review
Copied from ../tms-competitive-review-full-2026-10-27/data: hf_posts_sample.csv (Coatue/Altimeter samples).
Writes focus_set.csv, pages_compare.csv, linkedin_table.csv, cadence.csv, plan.csv, posts_raw.csv.
usage: python3 build_data.py
"""
import csv, os

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "data")
PREV = os.path.join(HERE, "..", "tms-competitive-review-full-2026-10-27", "data")
WEEKS = 13


def load(path):
    return list(csv.DictReader(open(path, encoding="utf-8")))


def write(name, rows, fields=None):
    with open(os.path.join(DATA, name), "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fields or list(rows[0]))
        w.writeheader(); w.writerows(rows)


def first_link(s):
    for part in str(s).replace(")", " ").replace("(", " ").split():
        if part.startswith("http"):
            return part.rstrip(";,")
    return ""


def mark(s):
    s = str(s)
    if s.startswith("CONFLICT") or s.startswith("✗/FLAG"):
        return "⚠"
    if s.startswith("✓ partial"):
        return "✓ partial"
    return s[:1] if s[:1] in "✓✗" else "?"


# Focus set: brief facts + live verification
FUNDS = [
    # name, page key, crustdata id, linkedin, hq, est, strategy, founder, founder LinkedIn
    ("Cadian Capital Management", "Cadian", 988803, "https://www.linkedin.com/company/cadian-capital-management", "New York", "2007",
     "Fundamental, value-oriented global L/S equity; TMT first, also healthcare, industrials, consumer", "Eric Bannasch", "https://www.linkedin.com/in/eric-bannasch-7638598"),
    ("Atreides Management", "Atreides", 990159, "https://www.linkedin.com/company/atreides-management", "Boston", "2019",
     "Tech and consumer L/S with public/private crossover", "Gavin Baker", "https://www.linkedin.com/in/gavinbaker-portfoliomanager"),
    ("Alkeon Capital Management", "Alkeon", 1544140, "https://www.linkedin.com/company/alkeon-capital", "New York / San Francisco / Hong Kong", "2001",
     "L/S growth equity in tech innovators plus private innovation (VC) sleeve", "Panayotis (Takis) Sparaggis", ""),
    ("Sylebra Capital", "Sylebra", 983853, "https://www.linkedin.com/company/sylebra", "Palo Alto / Hong Kong (site); HK/London in brief", "2011",
     "Small/mid-cap TMT L/S per Form ADV; site now presents 'Sylebra Growth Partners', a growth-equity firm", "Dan Gibson", "https://www.linkedin.com/in/daniel-gibson-690b7711"),
    ("Whale Rock Capital Management", "Whale Rock", 993750, "https://www.linkedin.com/company/whale-rock-capital-management-llc", "Boston", "2006",
     "TMT/semis L/S plus late-stage private; also long-only and MegaCap Tech vehicles", "Alex Sacerdote", "https://www.linkedin.com/in/alex-sacerdote-59747814"),
]
VERDICT = {
    "Cadian": ("Pass", "Tech focus partial (multi-sector value L/S)"),
    "Atreides": ("Pass", "Also runs 23 VC + 1 PE vehicles; hedge funds hold most assets"),
    "Alkeon": ("Pass, hedge fund only", "Firm also manages a UCITS fund and sub-advises registered funds; only the private hedge funds are compared"),
    "Sylebra": ("At risk", "Own site now a growth-equity firm; hedge fund shown in Form ADV only as of 31 Dec 2025"),
    "Whale Rock": ("Pass, hedge fund only", "Firm also runs long-only vehicles; professional-only inferred from Reg D minimums"),
}


def main():
    pages = {r["fund"]: r for r in load(os.path.join(DATA, "product_pages.csv"))}
    page = lambda key: next(v for k, v in pages.items() if k.startswith(key.split()[0]))
    counts = {r["entity"]: r for r in load(os.path.join(DATA, "linkedin_counts.csv"))}

    focus = []
    for name, key, cid, li, hq, est, strat, founder, furl in FUNDS:
        p = page(name)
        verdict, flag = VERDICT[key]
        focus.append({"fund": name, "crustdata_id": cid, "linkedin": li, "site": p["url"], "hq": hq, "founded": est, "strategy": strat,
                      "founder": founder, "founder_linkedin": furl or "profile not found",
                      "aum": p["aum_latest"], "aum_date": p["aum_date"], "aum_source": first_link(p["aum_source"]),
                      "hedge_fund": mark(p["hedge_fund_check"]), "professional_only": mark(p["professional_only_check"]), "tech_focused": mark(p["tech_focused_check"]),
                      "filter_result": verdict, "flag": flag, "adv": first_link(p["adv_or_13f_link"])})
    write("focus_set.csv", focus)

    # Product-page comparison: attributes x (5 funds + TMS)
    cols = [("Cadian", "Cadian"), ("Atreides", "Atreides"), ("Alkeon", "Alkeon"), ("Sylebra", "Sylebra"), ("Whale Rock", "Whale Rock"), ("Taranis TMS", "Taranis")]
    attrs = [("Hedge fund ✓ / professional-only ✓ / tech-focused ✓", None), ("Site type", "site_type"), ("Gate", "gate"), ("Sections", "sections"),
             ("Nav depth", "nav_depth"), ("Languages", "languages"), ("Strategy, own words", "strategy_own_words"), ("Tagline", "tagline"),
             ("Differentiators", "differentiators"), ("Team shown", "team_shown"), ("AUM on site", "aum_public"), ("Performance disclosure", "performance_disclosure"),
             ("Documents", "documents"), ("Letters", "letters"), ("Investor eligibility", "investor_eligibility"), ("Target audience", "target_audience"),
             ("Tone", "tone"), ("Primary CTA", "primary_cta"), ("AUM (Form ADV, latest)", "aum_latest"), ("Notes and flags", "notes"), ("Page", "url")]
    comp = []
    for label, field in attrs:
        row = {"attribute": label}
        for col, key in cols:
            p = page(key)
            if field is None:
                row[col] = "subject" if key == "Taranis" else " / ".join(mark(p[k]) for k in ("hedge_fund_check", "professional_only_check", "tech_focused_check"))
            else:
                row[col] = p[field]
        comp.append(row)
    write("pages_compare.csv", comp)

    # LinkedIn table per fund (+ subject and benchmarks)
    hf = {r["fund"]: r for r in load(os.path.join(PREV, "hf_linkedin.csv"))}
    LESSON = {
        "Cadian": ("Company page empty since creation; founder Eric Bannasch has no posts.", "None. Nothing to copy; confirms that the hedge-fund peer set does not use LinkedIn."),
        "Atreides": ("Company page empty (0 posts ever). Gavin Baker's own profile: 1 post in the window, 6 ever. His reach comes from other people's channels (podcasts, NVIDIA GTC, Sohn).",
                     "Founder-as-brand without posting: Baker is quoted and filmed on third-party channels. Taranis can do both: keep Julien's BFM/RTS appearances and post them himself."),
        "Alkeon": ("Company page empty (0 posts ever). Founder profile not found on LinkedIn.", "Its public story is a VC logo wall (Anthropic, Databricks, Stripe). TMS has no equivalent proof; a sentiment chart is its proof."),
        "Sylebra": ("5 posts ever, none since 2023; founder Dan Gibson has no posts.", "Rebranded as growth equity; no LinkedIn presence for the hedge fund."),
        "Whale Rock": ("1 company post in the window (summer interns, 233 reactions); 7 ever. Rare milestones (20th anniversary, Sohn, podcast) just before the window. Founder silent.",
                       "Rare milestone posts with a number still draw ~230 reactions. Taranis's awards and TV appearances are the same raw material."),
    }
    samples = load(os.path.join(DATA, "posts_sample.csv"))
    li = []
    for name, key, *_ in FUNDS:
        c = counts[key]
        best = next((s for s in samples if s["author"].startswith(key)), None)
        li.append({"account": name, "group": "Focus fund", "channel": LESSON[key][0], "posts_13w": c["window_total"], "posts_per_week": c["posts_per_week"],
                   "lifetime_posts": c["lifetime_total"], "dominant_format": "image (1 post)" if key == "Whale Rock" else "none",
                   "original_vs_curated": "original (0 credited)" if key == "Whale Rock" else "n/a (no posts)",
                   "best_post_reactions": best["reactions"] if best else "", "best_post_url": best["url"] if best else "", "lesson": LESSON[key][1]})
    t = counts["Taranis"]
    li.append({"account": "Taranis (TMS)", "group": "Subject", "channel": "Company page 2 posts in window (video, article; both <25 reactions); Julien Leegenhoek 1 in window, 15 ever, posting again since 23 Sep (BFM, RTS)",
               "posts_13w": t["window_total"], "posts_per_week": t["posts_per_week"], "lifetime_posts": t["lifetime_total"], "dominant_format": "video / article link",
               "original_vs_curated": "original (0 credited)", "best_post_reactions": "28", "best_post_url": next(s["url"] for s in samples if "Infomaniak" in s["text_truncated"]),
               "lesson": "Already ahead of four of the five peers on LinkedIn; the founder's posts outperform the page."})
    for bm, key in (("Coatue Management", "Coatue"), ("Altimeter Capital", "Altimeter")):
        h = hf[bm]
        li.append({"account": bm, "group": "Benchmark (not a peer)", "channel": h["channel"], "posts_13w": h["company_posts_13w"], "posts_per_week": h["posts_per_week"],
                   "lifetime_posts": h["company_posts_lifetime"], "dominant_format": h["formats_13w"], "original_vs_curated": "original",
                   "best_post_reactions": h["best_post_reactions"], "best_post_url": h["best_post_url"], "lesson": h["what_taranis_can_learn"]})
    write("linkedin_table.csv", li)

    # Cadence (company pages, founders, benchmarks)
    cad = []
    for name, key, *_ in FUNDS:
        cad.append({"account": name, "group": "Focus fund", "posts_13w": counts[key]["window_total"], "posts_per_week": counts[key]["posts_per_week"]})
    for k in ("Gavin Baker (Atreides)", "Eric Bannasch (Cadian)", "Dan Gibson (Sylebra)", "Alex Sacerdote (Whale Rock)"):
        cad.append({"account": k, "group": "Founder", "posts_13w": counts[k]["window_total"], "posts_per_week": counts[k]["posts_per_week"]})
    cad.append({"account": "Taranis (company page)", "group": "Taranis", "posts_13w": t["window_total"], "posts_per_week": t["posts_per_week"]})
    j = counts["Julien Leegenhoek (Taranis)"]
    cad.append({"account": "Julien Leegenhoek (Taranis)", "group": "Taranis", "posts_13w": j["window_total"], "posts_per_week": j["posts_per_week"]})
    for k in ("Coatue", "Altimeter"):
        cad.append({"account": k + " (benchmark)", "group": "Benchmark", "posts_13w": counts[k]["window_total"], "posts_per_week": counts[k]["posts_per_week"]})
    # Monchau window is 1 Jun - 27 Oct; counts run to the index end (17 Sep, 108 days), so posts_13w holds his 1 Jun - 17 Sep total
    cad.append({"account": "Charles-Henry Monchau (benchmark)", "group": "Benchmark", "posts_13w": 1244, "posts_per_week": round(1244 / (108 / 7), 2)})
    write("cadence.csv", cad)

    # Operating plan
    plan = [
        ("1. Lead through Julien", "Julien Leegenhoek is the public face, Atreides/Gerstner style: every BFM/RTS appearance becomes a post by him with one quoted claim; the company page reshares.", "2–3 (Julien)",
         "Peers' founders are silent on their own pages (Baker 1 post in 13 weeks; Bannasch, Gibson, Sacerdote 0); Baker's reach comes from podcasts and conferences; Gerstner's TV clips draw 120+ (Altimeter)."),
        ("2. Own the AI-disruption + sentiment lane", "A weekly 'Sentiment vs disruption' post: what the 2016 sentiment engine reads on one AI/semis theme, and what the discretionary sleeve thinks of it. No peer publishes either half.", "1",
         "0 posts on any thesis from Cadian, Atreides, Alkeon, Sylebra or Whale Rock pages in the window."),
        ("3. Cadence 3–5 posts a week", "About 2–3 from Julien and 1–2 from the page; above Altimeter (2.2) and below Coatue (4.85), never Monchau's 81.", "3–5",
         "Taranis 0.15/week; peers 0–0.08; Coatue 4.85; Altimeter 2.23."),
        ("4. One-line thesis + one chart", "Open every post with one claim and carry one chart or clip (Coatue style); English first, French second.", "every post",
         "Coatue's best posts pair a one-line thesis with a chart; Monchau's image posts are his most reliable format."),
        ("5. Fix the product page", "State the two sleeves and their weights (systematic sentiment since 2016; discretionary tech/AI since Dec 2025), name the PMs, add vehicle, factsheet behind the gate and a 'request factsheet' CTA; relabel the 'Managed Futures' award.", "–",
         "TMS page shows no fund facts, team, performance or sleeves; Atreides shows its full team, Alkeon a portfolio wall."),
        ("6. Milestones as events", "Awards, new hires (e.g. Paul Monsigny, 15 Oct), anniversaries and TV slots posted with a number.", "monthly",
         "Whale Rock's intern post drew 233 reactions; its rare milestone posts average ~240."),
        ("7. Compliant by design", "One-line risk warning on fund posts, no performance numbers in posts, one Compliance pre-approval of the weekly template.", "–",
         "FinSA limits public performance talk; the TMS gate already restricts to professional investors."),
    ]
    write("plan.csv", [{"lever": a, "recommendation": b, "target_posts_per_week": c, "evidence": d} for a, b, c, d in plan])

    # Raw posts (author, true_date_utc, format, reactions, comments, shares, text_truncated, url)
    raw = []
    def add(author, date, fmt, rx, cm, sh, text, url, src):
        raw.append({"author": author, "true_date_utc": str(date)[:10], "format": fmt, "reactions": rx, "comments": cm, "shares": sh,
                    "text_truncated": (text or "")[:200], "url": url, "source": src})
    for s in samples:
        add(s["author"], s["true_date_utc"], s["format"], s["reactions"], s["comments"], s["shares"], s["text_truncated"], s["url"], s["source"])
    for s in load(os.path.join(PREV, "hf_posts_sample.csv")):
        if s["author"].startswith(("Coatue", "Altimeter", "Brad Gerstner", "Whale Rock")) and s["url"] not in {r["url"] for r in raw}:
            add(s["author"], s["true_date_utc"], s["format"], s["reactions"], s["comments"], s["shares"], s["text"], s["url"], "Crustdata paid pull (27 Oct review)")
    for s in load(os.path.join(PREV, "monchau_tech_samples.csv")):
        add("Charles-Henry Monchau", s["true_date_utc"], s["format"], s["reactions"], s["comments"], s["shares"], s["post"], s["url"], "Crustdata paid pull (27 Oct review)")
    for s in load(os.path.join(DATA, "monchau_live_sep17_oct28.csv")):
        add("Charles-Henry Monchau", s["true_date_utc"], s["format"], "", s["comments"], "", s["text"], s["url"], "Live public post page (28 Oct)")
    raw.sort(key=lambda r: (r["author"], r["true_date_utc"]))
    write("posts_raw.csv", raw)
    print("focus", len(focus), "pages attrs", len(comp), "linkedin", len(li), "cadence", len(cad), "raw", len(raw))


if __name__ == "__main__":
    main()
