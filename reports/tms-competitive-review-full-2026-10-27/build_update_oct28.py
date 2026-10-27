"""28 Oct update: re-screened TMS competitor landscape with LinkedIn cadence.

Inputs: the landscape screen (scratchpad landscape.csv, copied to data/landscape_screen_raw.csv)
plus free Crustdata limit=0 counts of company-page posts dated 17 Jun 2026 onwards
(the index ends ~17 Sep 2026, so the window is 13 weeks).
Writes data/tms_competitor_landscape.csv and renders the update chart page.
usage: python3 build_update_oct28.py
"""
import csv, json, os

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "data")
WEEKS = 13

# name -> (crustdata company id, 13-week company-page posts, note)
LINKEDIN = {
    "Symbit Global Equity L/S Fund": (74483772, 2, ""),
    "Marshall Wace": (916061, 1, ""),
    "Man Group": (1003431, 75, "Firm-wide page (systematic + discretionary + corporate)"),
    "Duo Reges Capital Management": (None, None, "No company page found"),
    "Lakefield Swiss Equity Long/Short": (991564, 5, "Firm page (Lakefield Partners AG)"),
    "RAM (Lux) Systematic": (994568, 6, "Firm page (RAM Active Investments)"),
    "Machina Capital": (3398737, 0, ""),
    "Numerai": (629571, 8, ""),
    "The Voleon Group": (962311, 0, ""),
    "Cubist Systematic Strategies": (1041766, 4, ""),
    "Qube Research & Technologies": (1001284, 11, "Mostly recruiting"),
    "Two Sigma": (1036397, 37, "Profile states LinkedIn is for recruiting only"),
    "WorldQuant": (1033624, 22, ""),
    "Bridgewater AIA Labs": (1043803, 12, "Firm page (Bridgewater Associates)"),
    "Point72 Turion": (632830, 19, "Firm page (Point72); Turion has no page of its own"),
    "Situational Awareness LP": (None, None, "Page URL not matched in Crustdata"),
    "Coatue Management": (1033880, 63, ""),
    "Whale Rock Capital": (993750, 1, "7 posts all-time"),
    "Altimeter Capital": (992773, 29, "Plus founder Brad Gerstner (3 posts in window)"),
    "Tiger Global Management": (1288770, 0, ""),
    "Jericho Capital": (1348019, 0, ""),
    "Light Street Capital": (991218, 0, "Founder Glen Kacher posts occasionally"),
    "Shannon River": (12895966, 0, ""),
    "Schroder GAIA Contour Tech Equity": (6803658, 0, "Contour Asset Management page"),
}

# Conflicts with figures used earlier in this review (shown, not resolved).
CONFLICTS = {
    "Whale Rock Capital": "Earlier section uses 'USD 14bn+' from Whale Rock's own May 2026 post",
    "Jericho Capital": "Earlier section uses ~USD 10.1bn (QuiverQuant est.) and founded 1994; this screen has USD 3.97bn RAUM and 2009",
    "Coatue Management": "AUM vs RAUM differ (gross vs net)",
}


def key_for(name):
    for k in LINKEDIN:
        if name.startswith(k) or k.startswith(name.split(" (")[0]):
            return k
    raise KeyError(name)


def main():
    rows = list(csv.DictReader(open(os.path.join(DATA, "landscape_screen_raw.csv"), encoding="utf-8")))
    out = []
    for r in rows:
        cid, n, note = LINKEDIN[key_for(r["name"])]
        out.append({
            "tier": r["tier"],
            "tier_label": {"A": "Hybrid systematic + discretionary", "B": "Systematic sentiment / alt-data / ML", "C": "Discretionary tech/AI L/S"}[r["tier"]],
            "name": r["name"], "manager": r["manager"], "hq": r["hq"], "founded": r["founded"],
            "aum": r["aum"], "aum_date": r["aum_date"], "aum_source": r["aum_source"],
            "aum_conflict": CONFLICTS.get(key_for(r["name"]), ""),
            "approach": r["approach"], "sentiment_or_altdata": r["sentiment_or_altdata"], "tech_ai_focus": r["tech_ai_focus"],
            "vehicle": r["vehicle"], "investor_type": r["investor_type"], "why_comparable": r["why_comparable"],
            "closeness_1to5": r["closeness_1to5"],
            "company_linkedin": r["company_linkedin"], "crustdata_id": cid or "",
            "posts_13w": "" if n is None else n,
            "posts_per_week": "" if n is None else round(n / WEEKS, 2),
            "linkedin_note": note,
            "key_person": r["key_person"], "key_person_linkedin": r["key_person_linkedin"], "source": r["source"],
        })
    out.sort(key=lambda r: (r["tier"], -int(r["closeness_1to5"])))
    with open(os.path.join(DATA, "tms_competitor_landscape.csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(out[0]))
        w.writeheader(); w.writerows(out)
    print("landscape rows", len(out))

    # merge the live Monchau sample and the voices' sample posts into the raw post file (dedupe by URL)
    raw_path = os.path.join(DATA, "posts_raw_all.csv")
    raw = list(csv.DictReader(open(raw_path, encoding="utf-8")))
    seen = {r["url"] for r in raw}
    for r in csv.DictReader(open(os.path.join(DATA, "monchau_live_sep17_oct28.csv"), encoding="utf-8")):
        if r["url"] not in seen:
            seen.add(r["url"])
            raw.append({"author": "Charles-Henry Monchau", "channel": "Individual", "true_date_utc": r["true_date_utc"], "format": r["format"],
                        "reactions": "", "comments": r["comments"], "shares": "", "text": r["text"], "url": r["url"],
                        "source": "Live public post page, 28 Oct (" + r["how_found"] + ")"})
    for r in csv.DictReader(open(os.path.join(DATA, "voices_like_monchau.csv"), encoding="utf-8")):
        if r["sample_url"] and r["sample_url"] not in seen:
            seen.add(r["sample_url"])
            raw.append({"author": r["name"], "channel": "Individual", "true_date_utc": "", "format": "", "reactions": r["sample_reactions"],
                        "comments": "", "shares": "", "text": r["style"], "url": r["sample_url"], "source": "Crustdata index (voices like Monchau sample)"})
    with open(raw_path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(raw[0])); w.writeheader(); w.writerows(raw)
    print("raw posts", len(raw))

    # chart page (same template and d3 bundle as the 27 Oct charts)
    def load(n):
        return list(csv.DictReader(open(os.path.join(DATA, n + ".csv"), encoding="utf-8")))
    data = {n: load(n) for n in ["hf_linkedin", "monchau_tech_vs_other", "monchau_tech_monthly", "tech_voices_frequency",
                                 "tms_competitor_landscape", "voices_like_monchau", "monchau_live_sep17_oct28"]}
    d3 = open(os.environ["D3_PATH"], encoding="utf-8").read()
    tpl = open(os.path.join(HERE, "charts_update_template.html"), encoding="utf-8").read()
    html = tpl.replace("/*__D3__*/", d3.replace("</script", "<\\/script")).replace("/*__DATA__*/", json.dumps(data, ensure_ascii=False).replace("</", "<\\/"))
    open(os.environ["CHART_OUT"], "w", encoding="utf-8").write(html)


if __name__ == "__main__":
    main()
