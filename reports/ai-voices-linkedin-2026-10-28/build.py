"""AI voices on LinkedIn: tech/AI posting frequency and engagement for 7 named voices plus similar voices.

Inputs (all from free Crustdata limit=0 count queries, window 17 Jun - 17 Sep 2026 = 13 weeks):
  data/ai_voices_counts.csv           totals, tech counts, reaction thresholds, monthly split (7 named voices)
  data/ai_voices_formats_credits.csv  source credits and content-type counts (7 named voices)
  data/ai_voices_tech_broad.csv       tech count with a broader keyword set (adds Perplexity, model, agent, software,
                                      compute, Copilot, Microsoft, GPT, robot)
  data/ai_voices_similar.csv          similar voices found in this screen (totals, tech, thresholds)
  ../tms-competitive-review-full-2026-10-27/data/posts_raw_all.csv  sample posts pulled earlier
Writes data/ai_voices_summary.csv, data/ai_voices_similar_summary.csv, data/ai_voices_samples.csv
and the chart page (CHART_OUT), using the d3 bundle at D3_PATH.
"""
import csv, json, os

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "data")
RAW = os.path.join(HERE, "..", "tms-competitive-review-full-2026-10-27", "data", "posts_raw_all.csv")
WEEKS = 13
THRESHOLDS = [500, 1000, 2500, 5000]
ROLE = {
    "Allie K. Miller": "LinkedIn-native AI creator (~2M followers), engagement-engineered",
    "Andrew Ng": "Foundational AI educator, research to practice",
    "Satya Nadella": "Big-tech CEO (Microsoft), agenda-setting",
    "Reid Hoffman": "AI investor-builder, long-form theses",
    "Ethan Mollick": "Original hands-on AI experimentation (Wharton)",
    "Aravind Srinivas": "Active AI founder voice (Perplexity)",
    "Bill Gates": "Broad-reach tech/AI essays",
}


def load(path):
    return list(csv.DictReader(open(path, encoding="utf-8")))


def num(v):
    return None if v in ("", None) else float(v)


def lift(r):
    """Pick the threshold where all posts at/above is closest to half; compare tech vs other there."""
    total, tech = num(r["total_13w"]), num(r["tech_13w"])
    best = None
    for t in THRESHOLDS:
        a, k = num(r.get(f"all_ge{t}")), num(r.get(f"tech_ge{t}"))
        if a is None or k is None or not total:
            continue
        d = abs(a / total - 0.5)
        if best is None or d < best[0]:
            best = (d, t, a, k)
    if not best:
        return {}
    _, t, a, k = best
    other_n = total - tech
    return {"lift_threshold": t, "all_share_at_t": round(a / total, 3),
            "tech_share_at_t": round(k / tech, 3) if tech else "",
            "other_share_at_t": round((a - k) / other_n, 3) if other_n else "",
            "tech_relative_lift": round((k / tech) / ((a - k) / other_n) - 1, 3) if tech and other_n and a - k > 0 else "",
            "other_n": int(other_n)}


def main():
    counts = load(os.path.join(DATA, "ai_voices_counts.csv"))
    fmts = {r["name"]: r for r in load(os.path.join(DATA, "ai_voices_formats_credits.csv"))}
    broad = {r["name"]: int(r["tech_broad_13w"]) for r in load(os.path.join(DATA, "ai_voices_tech_broad.csv"))}
    out = []
    for r in counts:
        total, tech = num(r["total_13w"]), num(r["tech_13w"])
        f = fmts[r["name"]]
        row = {"name": r["name"], "role": ROLE.get(r["name"], ""), "profile_url": "https://www.linkedin.com/in/" + r["slug"],
               "total_13w": int(total), "posts_per_week": round(total / WEEKS, 2), "tech_13w": int(tech),
               "tech_share": round(tech / total, 3) if total else "", "tech_per_week": round(tech / WEEKS, 2),
               "tech_broad_13w": broad.get(r["name"], ""), "tech_broad_share": round(broad[r["name"]] / total, 3) if r["name"] in broad and total else "",
               "credited_13w": f["credited_13w"], "credited_share": round(int(f["credited_13w"]) / total, 3) if total else ""}
        known = 0
        for k in ("video", "image", "article"):
            v = int(f[k + "_13w"]); known += v
            row["fmt_" + k] = round(v / total, 3) if total else 0
        row["fmt_other"] = round(max(total - known, 0) / total, 3) if total else 0
        for m in ("jun", "jul", "aug", "sep"):
            mt, mk = num(r[m + "_total"]), num(r[m + "_tech"])
            row[m + "_total"], row[m + "_tech"] = ("" if mt is None else int(mt)), ("" if mk is None else int(mk))
            row[m + "_share"] = round(mk / mt, 3) if mt and mk is not None else ""
        for t in THRESHOLDS:
            row[f"all_ge{t}"], row[f"tech_ge{t}"] = r.get(f"all_ge{t}", ""), r.get(f"tech_ge{t}", "")
        row.update(lift(r))
        out.append(row)
    out.sort(key=lambda x: -x["posts_per_week"])
    write("ai_voices_summary.csv", out)

    sim = []
    for r in load(os.path.join(DATA, "ai_voices_similar.csv")):
        total, tech = num(r["total_13w"]), num(r["tech_13w"])
        if not total:
            continue
        row = {k: r[k] for k in ("name", "role", "similar_to", "why_similar", "profile_url", "url_source")}
        row.update({"total_13w": int(total), "posts_per_week": round(total / WEEKS, 2), "tech_13w": int(tech or 0),
                    "tech_share": round((tech or 0) / total, 3)})
        for t in THRESHOLDS:
            row[f"all_ge{t}"], row[f"tech_ge{t}"] = r.get(f"all_ge{t}", ""), r.get(f"tech_ge{t}", "")
        row.update(lift(r))
        row["sample_post_url"], row["sample_comments"] = r.get("sample_post_url", ""), r.get("sample_comments", "")
        sim.append(row)
    sim.sort(key=lambda x: -x["posts_per_week"])
    write("ai_voices_similar_summary.csv", sim)

    names = {r["name"] for r in out}
    samples = [r for r in load(RAW) if r["author"] in names]
    samples.sort(key=lambda r: (r["author"], r["true_date_utc"]))
    write("ai_voices_samples.csv", samples)

    d3 = open(os.environ["D3_PATH"], encoding="utf-8").read()
    tpl = open(os.path.join(HERE, "charts_template.html"), encoding="utf-8").read()
    data = {"summary": out, "similar": sim}
    html = tpl.replace("/*__D3__*/", d3.replace("</script", "<\\/script")).replace("/*__DATA__*/", json.dumps(data, ensure_ascii=False).replace("</", "<\\/"))
    open(os.environ["CHART_OUT"], "w", encoding="utf-8").write(html)
    print("voices", len(out), "similar", len(sim), "samples", len(samples))


def write(name, rows):
    with open(os.path.join(DATA, name), "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0]))
        w.writeheader(); w.writerows(rows)


if __name__ == "__main__":
    main()
