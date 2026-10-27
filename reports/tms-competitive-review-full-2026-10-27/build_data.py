"""Builds the consolidated tables for the full TMS LinkedIn Competitive Review (27 Oct 2026).
Reads the CSVs produced by the 26 Oct (international) and 27 Oct (Swiss) rounds, adds the
new Monchau format-engagement counts and sample posts, and writes data/*.csv.

usage: build_data.py <out_dir>"""
import csv, datetime, os, re, sys

OUT = sys.argv[1]
HERE = os.path.dirname(os.path.abspath(__file__))
INTL = os.path.join(HERE, "..", "tms-linkedin-competitive-2026-10", "data")
SWISS = os.path.join(HERE, "..", "tms-swiss-competitors-2026-10", "data")
os.makedirs(OUT, exist_ok=True)

def read(folder, name):
    with open(os.path.join(folder, name), newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))

def write(name, header, rows):
    with open(os.path.join(OUT, name), "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f); w.writerow(header); w.writerows(rows)

def true_date(url):
    m = re.search(r'(?:activity|ugcPost|share)[-:](\d{18,20})', url)
    if not m: return ""
    return datetime.datetime.fromtimestamp((int(m.group(1)) >> 22) / 1000, datetime.UTC).strftime("%Y-%m-%d")

# ---------------------------------------------------------------- competitor set
competitors = [
 # group, fund, manager, crustdata_id, linkedin, site, hq, aum, aum_date, strategy, vehicle, why_close, status, source
 ("Swiss", "AtonRâ AI & Robotics AMC (+ 11 theme certificates, UCITS umbrella)", "AtonRâ Partners", "985778", "https://www.linkedin.com/company/atonra", "https://www.atonra.ch", "Geneva", "Not disclosed per product", "", "Conviction thematic tech/health/energy; research since 2004, proprietary indexes since 2014; AI/quant platform Fundy", "JP Morgan-issued AMC; Lux UCITS umbrella", "Closest Swiss match on tech theme and hybrid method; long-only", "Active (live post 30 Sep 2026; index gap since 30 Apr)", "https://www.atonra.ch/investment-funds/ai-robotics"),
 ("Swiss", "DECALIA SICAV - Future SOCIETY", "DECALIA SA", "999635", "https://www.linkedin.com/company/decalia-asset-management-sa", "https://www.decalia.com", "Geneva", "EUR 139m", "2026-05-31", "Long-only multi-thematic growth (~52% IT, ~35% AI infrastructure); mid-cap/healthcare barbell", "Lux UCITS SICAV", "Most active Swiss boutique on LinkedIn; tech-tilted fund", "Active", "https://funds-static.pictet.com/funds/decalia/factsheet/MR_ES_en_LU2407358063_YES_2026-05-31.pdf"),
 ("Swiss", "Pictet - Robotics / Digital; Pictet TR - Atlas Titan", "Pictet Asset Management", "6035837", "https://www.linkedin.com/company/pictet-asset-management", "https://am.pictet.com/ch/en", "Geneva", "Robotics EUR 13.0bn; Atlas Titan EUR 688m", "2026-10-26", "Thematic tech equities (discretionary); Atlas Titan discretionary global L/S", "Lux UCITS SICAVs", "Incumbent; scale benchmark; Atlas Titan is the L/S analogue", "Active", "https://am.pictet.com/ch/en/intermediaries/funds/pictet-robotics/LU1279334210"),
 ("International", "Symbit Global Equity L/S", "Symbit Capital", "74483772", "https://www.linkedin.com/company/symbit-capital", "https://www.symbit.com", "Zug", "Not disclosed", "launched Jul 2026", "AI-native: fundamental discretionary + proprietary AI (incl. investor sentiment); market-neutral, ~200% gross", "Irish ICAV (AIF), professional investors", "Closest structural twin to TMS's hybrid model; generalist", "Active (new)", "https://hedgeweek.com/news/new-york-investment-veterans-launch-ai-native-hedge-fund-in-switzerland"),
 ("International", "BIT Global Technology Opportunities", "BIT Capital", "1120813", "https://www.linkedin.com/company/bit-capital-gmbh", "https://bitcap.com", "Berlin", "Fund ~EUR 685-690m; firm EUR 3.0bn", "Oct 2026 (aggregators, no as-of date)", "Concentrated global tech / AI infra; data-driven; >75% of trades influenced by systematic signals; can short via CFDs/swaps", "Lux SICAV-FIS (AIF), professional investors", "Same 'human x AI' hybrid; net-long bias; retail-heavy brand", "Active", "https://bitcap.com/en/fonds/bit-global-technology-opportunities"),
 ("International", "U Access (IRL) Shannon River UCITS", "Shannon River Fund Management", "12895966", "https://www.linkedin.com/company/shannon-river-capital-management", "", "New York (UBP Geneva platform)", "USD 21.4m UCITS (may be share class); firm ~USD 905m", "2026-10-22", "Mid-cap tech L/S; ~half of longs second-order AI beneficiaries; net 20-50%", "Irish UCITS on UBP U Access", "Sold through a Geneva private bank to the same Swiss buyers", "Active fund; silent on LinkedIn", "https://www.ubp.com/en/asset-management/funds/ie00bkdrxc08"),
 ("International", "Schroder GAIA Contour Tech Equity", "Contour Asset Management", "6803658", "https://www.linkedin.com/company/contour-asset-management", "https://www.contourasset.com", "New York", "USD 860.9m", "2026-10-22", "TMT long/short; top-down + bottom-up; discretionary; SOFR+ target", "Lux UCITS (Schroder GAIA)", "Same shelf: tech L/S UCITS sold to Swiss/EU professionals", "Active fund; silent on LinkedIn", "https://www.finanzen.ch/fonds/schroder-gaia-contour-tech-equity-a1-lu1725199464"),
 ("International", "Jericho Capital (flagship + Special Opportunities)", "Jericho Capital Asset Management", "1348019", "https://www.linkedin.com/company/jericho-capital-asset-management-l-p", "https://www.jerichocap.com", "Los Angeles / New York", "~USD 10.1bn (third-party est. from ADV)", "2026", "Global TMT long/short, concentrated, discretionary", "Private hedge fund LPs", "Leading pure-TMT L/S; aspirational benchmark", "Active fund; silent on LinkedIn (press-only)", "https://www.quiverquant.com/institutions/Jericho%20Capital%20Asset%20Management%20L.P./"),
 ("International", "Wellington Disruptive Technology & Innovation", "Wellington Management", "905379", "https://www.linkedin.com/company/wellington-management", "https://www.wellington.com", "Boston", "USD 10.6m (last data)", "Mar 2021", "Global disruptive-tech long/short (bottom-up)", "Lux UCITS", "Category peer only", "Appears closed: launched 27 Mar 2020, no current data, absent from wellington.com", "https://www.investmentweek.co.uk/news/4014116/wellington-launches-long-short-disruptive-tech-fund"),
 ("Taranis", "Taranis Market Sentiment (TMS)", "Taranis SA", "7865447", "https://www.linkedin.com/company/taranis-sa", "https://taranis.net", "Geneva", "Not shown", "", "Tech L/S: 2016 systematic sentiment engine + Dec 2025 discretionary tech/AI-disruption sleeve (~50/50)", "Not shown on page", "Subject", "Active", "https://taranis.net/investment/tms"),
]
write("competitors_all.csv", ["group", "fund", "manager", "crustdata_id", "linkedin", "site", "hq", "aum", "aum_date", "strategy", "vehicle", "why_close", "status", "source"], competitors)

# ---------------------------------------------------------------- product-page comparison (attributes x funds)
cols = ["AtonRâ", "DECALIA", "Pictet AM", "Symbit", "BIT Capital", "Shannon River (UBP)", "Contour (Schroders)", "Jericho", "Wellington DTI", "Taranis TMS"]
pages = [
 ("Structure", "Theme page: description, monthly performance grid, statistics, holdings, risks; sidebar with price, ISIN, factsheet, KIID", "Strategy themes on corporate site; fund pages on separate gated SICAV site", "Standard microsite per share class: key info, objective, process, performance, risk, portfolio, literature", "Firm one-pager: vision, origin story, team cards; no fund page", "Hero, strategy, NAV tiles, share-class tabs (performance, risk, fund details), documents, factsheet subscribe, contact", "UBP data page: Performance / Library / Key information tabs; manager has no own site", "Schroders tabs (overview, risk, performance, allocation, facts, documents) + 1-page contourasset.com", "Holding page: addresses and founder bio", "No current fund page found", "One heading, three paragraphs, award line, disclaimer"),
 ("Navigation / languages", "2-3 clicks, no gate; English seen", "3+ clicks plus gate; EN/FR/DE/IT", "3+ clicks, audience in URL; EN/FR/DE/IT", "1 page; English", "2 clicks, no hard gate; EN/DE", "Gate then tabs; EN/FR/DE", "Gate then tabs (Schroders); EN", "1 page; English", "n/a", "2 clicks plus gate; English only"),
 ("Fund facts shown", "ISIN, inception, ccy, price; fees in factsheet", "In public factsheet (ISIN, inception, fees via FT)", "NAV, size, inception, SFDR, SRI, benchmark", "None", "ISIN, WKN, PMs, terms, allocations", "NAV, AUM, ISIN, fees, min, dealing", "ISIN, inception, OCF, perf fee", "None", "n/a", "None (no ISIN, vehicle, fees, AUM)"),
 ("Performance disclosure", "Full (YTD on page; monthly 2019-2026 in factsheet)", "Full (public factsheet)", "Full on page vs benchmark", "None", "Full, public (NAV, charts, rolling 12m)", "Full after gate (MTD to ITD)", "Full after gate (annual, 5y, factsheet)", "None", "n/a", "None (award line only)"),
 ("Documents", "Factsheet, KIID", "Factsheet public; KID/prospectus gated", "Factsheet, KID, prospectus, reports, SFDR", "None", "KID, factsheet subscription; reports for UCITS", "KID, prospectus, annual/semi-annual reports", "Monthly factsheet, KID, prospectus, annual report", "None", "n/a", "None"),
 ("Team visibility", "Team page with LinkedIn links", "PMs in factsheet and press", "PM names in docs; none on LinkedIn", "High: 4 founders with LinkedIn links", "Named PMs, team page, Chief AI Officer", "None on page", "PM only (Schroders); ~15 bios (Contour site)", "Founder bio", "n/a", "None on fund page"),
 ("Strategy in own words", "AI pure players across semiconductors, data, software, robotics", "Multi-thematic, innovative sectors and disruptive companies", "Active, high-conviction stock picking", "Human experience and machine intelligence, working together", "Institutional core vehicle of a global technology strategy", "No strategy text on page", "Exploit rapidly evolving trends within TMT", "Investing in global TMT", "n/a", "Fundamental picks with a quantitative overlay on risk appetite"),
 ("Differentiators claimed", "Research since 2004; 1,300-sub-sector taxonomy; Fundy AI/quant platform", "Multi-thematic, ESG, mid-cap bias, barbell", "Scale, 30-year thematic franchise, ESG", "Ex-NBIM PMs; AI-native platform", ">30,000 data signals/day; >75% of trades signal-influenced; human final say", "Mid-cap inflection points; AI second-order", "Alpha not beta; fastest pace of change since the 1990s", "Concentration; track record (press)", "n/a", "Behavioural sentiment algorithm + fundamentals; long/short"),
 ("Systematic vs discretionary", "Hybrid", "Discretionary", "Discretionary (Atlas adds quant indicators)", "Hybrid (AI + discretionary)", "Hybrid (signals + human)", "Discretionary", "Discretionary", "Discretionary", "Discretionary", "Hybrid (~50/50 sleeves, not stated on page)"),
 ("Target audience / tone", "Broad; marketing-heavy", "Private + institutional; factual", "Segmented; regulatory", "Allocators; brand-led", "Professional (AIF) but retail brand; marketing with data", "Professional; data-only", "Qualified investors; legal (Schroders) / thesis (Contour)", "Allocators via press", "n/a", "Qualified/professional CH/UK; short, low information"),
 ("Investor gate", "None", "Investor category + country", "Profile selector in URL", "None (no fund info)", "None (marketing banner)", "Not-US + country + profile + legal", "Swiss qualified-investor 'I agree'", "None", "n/a", "Country, then professional/retail, then I Accept"),
 ("Primary CTAs", "Factsheet, KIID, contact, WhatsApp", "Discover funds, newsletter", "Download factsheet / NAV / literature", "LinkedIn links", "Invest now (brokers), factsheet, podcast", "Login, newsletter", "Watchlist, download; 'Get in touch'", "Email, phone", "n/a", "Contact only"),
 ("Primary source", "https://www.atonra.ch/investment-funds/ai-robotics", "https://www.decalia.com/en-ch/funds/", "https://am.pictet.com/ch/en/intermediaries/funds/pictet-robotics/LU1279334210", "https://www.symbit.com/welcome", "https://bitcap.com/en/fonds/bit-global-technology-opportunities", "https://www.ubp.com/en/asset-management/funds/ie00bkdrxc08", "https://www.contourasset.com/index", "https://www.jerichocap.com", "https://www.investmentweek.co.uk/news/4014116/wellington-launches-long-short-disruptive-tech-fund", "https://taranis.net/investment/tms"),
]
write("pages_all.csv", ["attribute"] + cols, pages)

positioning = [
 ("AtonRâ Partners", "https://www.atonra.ch/investment-funds/ai-robotics", "Sells thematic tech as 12+ single-theme certificates plus a UCITS umbrella, backed by research since 2004, a 1,300-sub-sector taxonomy and the Fundy AI/quant platform. Ungated pages show price, YTD and ISIN; the factsheet has monthly returns and fees. Closest Swiss peer on tech theme and hybrid method, but long-only and broad in tone."),
 ("DECALIA", "https://funds-static.pictet.com/funds/decalia/factsheet/MR_ES_en_LU2407358063_YES_2026-05-31.pdf", "A EUR 139m long-only multi-thematic growth UCITS now ~52% IT and ~35% AI infrastructure. Markets through PM interviews and multilingual corporate pages; the fund site is gated but full-performance factsheets are public. Tech is real exposure but not the brand."),
 ("Pictet Asset Management", "https://am.pictet.com/ch/en/intermediaries/funds/pictet-robotics/LU1279334210", "The scale benchmark: Robotics EUR 13bn, Digital USD 4.3bn, each with a standardised data-dense page and full document library. Regulatory tone, no personal voices. TR-Atlas Titan (EUR 688m) is its discretionary L/S, not tech-specific."),
 ("Symbit Capital", "https://www.symbit.com/welcome", "A Zug startup (Jul 2026) running an AI-native market-neutral L/S built by ex-NBIM PMs. Brand-led one-pager that leads with founders and a 'human + machine' philosophy, with no fund data. The closest structural twin to TMS, without a track record."),
 ("BIT Capital", "https://bitcap.com/en/fonds/bit-global-technology-opportunities", "Turns its data/AI edge into numbers (signals per day, petabytes, % of trades influenced) with a human-in-the-loop line, and publishes NAV, charts and factsheets openly. Strongest storytelling of the hybrid model; retail-heavy brand and net-long bias."),
 ("Shannon River", "https://www.ubp.com/en/asset-management/funds/ie00bkdrxc08", "A mid-cap tech L/S distributed as a UCITS on UBP's Geneva platform. The platform page is data-only (full performance after the gate); the manager has no website of its own and does not post."),
 ("Contour (Schroder GAIA)", "https://www.contourasset.com/index", "A USD 861m TMT L/S UCITS on the Schroder GAIA platform. Schroders publishes full returns and documents behind a Swiss qualified gate; Contour's own one-pager gives the thesis and ~15 team bios. Purely discretionary; silent on LinkedIn."),
 ("Jericho Capital", "https://www.jerichocap.com", "The leading US TMT L/S (~USD 10bn) with a bare holding website. Markets through allocator relationships and press (Institutional Investor), not its own channels."),
 ("Wellington DTI", "https://www.investmentweek.co.uk/news/4014116/wellington-launches-long-short-disruptive-tech-fund", "Launched in 2020 as a disruptive-tech L/S UCITS; last data USD 10.6m (Mar 2021) and no longer listed on wellington.com, so it appears closed. Kept only as a category reference."),
 ("Taranis TMS", "https://taranis.net/investment/tms", "The only tech L/S with a behavioural-sentiment quant overlay in the set, but the gated page shows no ISIN, fees, AUM, performance, documents or team and does not state its two sleeves. Its only proof point is a 2023 'Managed Futures' award. Peers behind the same kind of Swiss gate (Schroders, UBP) show full performance."),
]
write("positioning_all.csv", ["firm", "page_url", "summary"], positioning)

# ---------------------------------------------------------------- cadence, all accounts
cad = []
seen = set()
for r in read(INTL, "cadence.csv"):
    if r["account"].startswith("Wellington"): r["account"] = "Wellington Management (parent)"
    if r["account"].startswith("Schroders"): r["account"] = "Schroders (parent, Contour's platform)"
    grp = {"Benchmark": "Benchmark", "Tech voice": "Tech voice", "Large-manager reference": "Parent", "Competitor parent": "Parent", "Competitor": "International competitor", "Taranis": "Taranis"}[r["group"]]
    cad.append((r["account"], grp, r["channel"], r["posts_13w"], r["posts_per_week"], "", r["profile_url"]))
    seen.add(r["account"])
for r in read(SWISS, "swiss_cadence.csv"):
    if r["account"] in ("Taranis",): continue
    grp = "Swiss competitor" if r["group"] == "Swiss competitor" else "Swiss peer"
    cad.append((r["account"], grp, r["channel"], r["posts_13w"], r["posts_per_week"], r["note"], r["source"]))
cad.sort(key=lambda x: -float(x[4]))
write("cadence_all.csv", ["account", "group", "channel", "posts_13w", "posts_per_week", "note", "source"], cad)

# ---------------------------------------------------------------- LinkedIn per competitor
li = [
 ("AtonRâ Partners", "Swiss", "Company page + staff (BD lead)", "~1.15 est. (0 indexed)", "Image + long-form thesis", "Original (13 of 15 2026 posts); own research links; 0 'Source'", "~6", "10", "https://www.linkedin.com/posts/atonra_thematicinvesting-atonra-chinatech-activity-7444624629765214209-6YMx", "Owns the original tech-thesis format but gets 0-10 reactions under a brand page and puts YTD numbers in posts. Gap: the same theses from a named founder, compliant."),
 ("DECALIA", "Swiss", "Company page + CIO Fabrizio Quirighetti", "2.31", "Mixed: document 9, image 7, article 7, video 6", "73% original; 0 'Source'", "~14", "63", "https://www.linkedin.com/posts/decalia-asset-management-sa_decalia-teamspirit-cycling-activity-7493591569711755264-pQqi", "Sets the Swiss boutique bar (~2/week, FR/EN, people and events). The CIO outdraws the page (153 vs 63). Gap: only 13% tech/AI."),
 ("Pictet Asset Management", "Swiss", "Company page; thematic PMs silent", "6.85", "Image 47, video 24 of 89", "76% original; 1 'Source'", "~25", "147", "https://www.linkedin.com/posts/pictet-asset-management_today-the-pictet-group-announced-the-figures-activity-7499022732894855168-PQMN", "Production quality and a risk warning on product posts; AI ETF launch did well (141). Gap: no named tech PM voice."),
 ("Symbit Capital", "International", "Founders (page gets 0)", "0.15 page + 0.15 founders", "Short quote-reshare", "Original", "0 (page)", "108 (founder)", "https://www.linkedin.com/posts/marius-skrondal_we-just-wrapped-a-week-on-the-road-meeting-activity-7474749100635176960-0GyQ", "Same news: page 0 reactions vs co-founder 108. Lead through individuals."),
 ("BIT Capital", "International", "Company page + founder podcasts", "0.85", "Image + long German text + disclaimer", "Original; podcast-led", "~107-137 (top 4)", "195", "https://www.linkedin.com/posts/bit-capital-gmbh_bitcapital-technologyinvesting-ucits-activity-7470861891536355330-zCqW", "Turns performance milestones and founder podcasts into posts with a disclaimer each time. Gap: German-only."),
 ("Shannon River", "International", "Company page exists (161 followers), no posts", "0", "none", "n/a", "n/a", "", "https://www.linkedin.com/company/shannon-river-capital-management", "Silent (confirmed by live search 27 Oct)."),
 ("Contour (Schroder GAIA)", "International", "None; Schroders mentions Contour/GAIA 2x ever", "0", "none", "n/a", "n/a", "", "https://www.linkedin.com/company/contour-asset-management", "Silent; employees only (live search 27 Oct)."),
 ("Jericho Capital", "International", "None; press coverage reshared by others", "0", "none", "n/a", "n/a", "", "https://www.linkedin.com/posts/institutional-investor_jerichos-high-conviction-playbook-shows-activity-7477818522937663489-RhMU", "Press-only presence (Institutional Investor); no own posts found live."),
 ("Wellington (parent)", "Parent", "Company page; DTI fund not mentioned", "8.9", "Image; HR and corporate", "Original", "n/a", "555", "https://www.linkedin.com/posts/wellington-management_we-are-pleased-to-announce-that-john-norberg-activity-7470452261069049856-7Bil", "Corporate cadence context only."),
 ("Taranis", "Taranis", "Company page reshares CEO TV clips", "0.15", "Video / article (BFM clips)", "Reshares of CEO's own posts", "~14", "52", "https://www.linkedin.com/posts/taranis-sa_emergingmanagers-hedgefunds-alternativeinvestments-ugcPost-7429190604317753344-mL-E", "Lowest active cadence; CEO's own posts (48-64) beat the page's reshares (14)."),
]
write("linkedin_all.csv", ["competitor", "group", "channel", "posts_per_week", "dominant_format", "original_vs_curated", "median_reactions", "best_post_reactions", "best_post_url", "lesson"], li)

# ---------------------------------------------------------------- Monchau
for name in ("monchau_monthly.csv", "monchau_mix.csv", "monchau_reactions.csv"):
    rows = read(INTL, name)
    write(name, list(rows[0].keys()), [list(r.values()) for r in rows])
topics = [
 ("Tech / AI", 40, 0.294, 328, 0.264),
 ("Macro / rates", 38, 0.279, 180, 0.145),
 ("Energy", 29, 0.213, 150, 0.121),
 ("Crypto", 5, 0.037, 61, 0.049),
]
write("monchau_topics.csv", ["topic", "sep_posts", "sep_share_of_136", "summer_posts", "summer_share_of_1244"], topics)
fmt_eng = [
 ("Video", 78, "~300", 0.756, 0.615, "~130", "Only 4 of 23 own-original videos reach 54; the high median comes from viral reshared clips"),
 ("Image", 1112, "~66", 0.565, 0.0, "54", "92% of originals; most reliable format"),
 ("Document", 45, "~25", 0.089, 0.0, "25", "PDF carousels underperform"),
 ("Article", 2, "n/a (n=2)", 0.0, 0.0, "24", "Too few to measure"),
]
write("monchau_format_engagement.csv", ["format", "posts", "median_reactions_est", "share_ge54", "share_ge200", "brief_ref_median_sep", "note"], fmt_eng)
monchau_samples = [
 ("My take on FOMC", "https://www.linkedin.com/posts/charles-henry-monchau-cfa-cmt-caia-4003096_my-take-on-yesterdays-fomc-as-expected-activity-7506098378204708865-eZr7", 19, "Own view on the Fed"),
 ("Dear Donald (oil + AI capex)", "https://www.linkedin.com/posts/charles-henry-monchau-cfa-cmt-caia-4003096_dear-donald-the-no-war-no-peace-with-iran-activity-7505921077903257600--Z_Y", 75, "Synthesis: Brent supply shock + hyperscaler debt competing with Treasuries"),
 ("JPM: largest AI borrowers", "https://www.linkedin.com/posts/charles-henry-monchau-cfa-cmt-caia-4003096_the-largest-ai-borrowers-are-not-weak-credits-activity-7505634083658489857-lxSe", 14, "Curated (Source: JPM); 1 share in index, so 'most-shared' not borne out"),
 ("Hyperscaler debt is exploding", "https://www.linkedin.com/posts/charles-henry-monchau-cfa-cmt-caia-4003096_hyperscaler-debt-is-exploding-amazon-activity-7504939484937969664-4uAF", 230, "Best tech chart post; 21 shares"),
 ("Pierce Brosnan photo (humour)", "https://www.linkedin.com/posts/charles-henry-monchau-cfa-cmt-caia-4003096_the-camera-man-is-a-genius-for-those-activity-7505271378573594624-jGSn", 17611, "Viral outlier"),
]
write("monchau_samples.csv", ["post", "url", "reactions", "note"], monchau_samples)

# ---------------------------------------------------------------- voices, Swiss peers
rows = read(INTL, "voices.csv"); write("voices.csv", list(rows[0].keys()), [list(r.values()) for r in rows])
rows = read(SWISS, "swiss_peers.csv"); write("swiss_peers.csv", list(rows[0].keys()), [list(r.values()) for r in rows])

# ---------------------------------------------------------------- plan
plan = [
 ("1. Cadence vs DECALIA (Swiss)", "Lift the company page from 0.15 to at least 2.3 posts/week: weekly TMS sentiment-gauge chart + one fund, event or BFM post", "2.3", "DECALIA 30 posts in 13 weeks; Taranis 2"),
 ("2. Take the tech-AI thesis lane (Swiss)", "One original AI-disruption thesis a week from Julien: chart first, three lines of read-through, link to a short note", "1", "AtonRâ's theses get 0-10 reactions and lapsed in the index after April; Pictet PMs post 0; DECALIA 13% tech"),
 ("3. Lead through Leegenhoek", "Julien is the primary voice (3 posts/week total incl. the thesis); a partner covers allocators; the page re-shares with a one-line frame", "3", "Symbit page 0 vs founder 108; DECALIA page 63 vs CIO 153; Taranis page 14 vs CEO 64"),
 ("4. POV over curation", "About 80/20 original vs curated; curate only to frame a TMS view", "", "Monchau own-view posts clear 54 reactions 5% of the time; curation works at his scale, not at ~2,000 followers"),
 ("5. Post in English (plus French)", "Lead in English for allocators; French for Swiss Romandie and BFM clips", "", "Recent Taranis posts are French-only; DECALIA and Pictet post in 4 languages"),
 ("6. Fix the product page first", "Add vehicle, ISIN, fees, liquidity, the two sleeves and weights, named PMs, a gated factsheet and a 'request factsheet / book a call' CTA; relabel the award", "", "Every active peer discloses performance somewhere; Schroders and UBP do so behind the same Swiss gate"),
 ("7. Compliant by design", "One-line risk warning on fund posts; no performance numbers in posts; pre-approve the weekly chart template", "", "Pictet and BIT add risk lines; AtonRâ posts YTD figures publicly"),
]
write("plan_all.csv", ["lever", "recommendation", "target_posts_per_week", "evidence"], plan)

# ---------------------------------------------------------------- raw posts, merged
out = []
for r in read(INTL, "posts_raw.csv") + read(SWISS, "swiss_posts_raw.csv"):
    out.append((r["author"], r["channel"], r["true_date_utc"], r["format"], r["reactions"], r["comments"], r["shares"], r["text_truncated"], r["url"], r["source"]))
extra = [
 ("Charles-Henry Monchau (Syz CIO)", "individual", "image", 75, 8, 1, "Dear Donald, the 'no war no peace' with Iran doesn't work here... Brent closing in on $110... hyperscaler capex >100% of operating cash flow... The trade funding the equity bull is now financing the tightening cycle. Source: TME", "https://www.linkedin.com/posts/charles-henry-monchau-cfa-cmt-caia-4003096_dear-donald-the-no-war-no-peace-with-iran-activity-7505921077903257600--Z_Y"),
 ("Charles-Henry Monchau (Syz CIO)", "individual", "image", 14, 0, 1, "The largest AI borrowers are not weak credits. JPM estimates hyperscaler gross leverage at roughly 1.6x... AI is increasingly a capital-markets story. Source: JPM", "https://www.linkedin.com/posts/charles-henry-monchau-cfa-cmt-caia-4003096_the-largest-ai-borrowers-are-not-weak-credits-activity-7505634083658489857-lxSe"),
 ("Charles-Henry Monchau (Syz CIO)", "individual", "image", 254, 34, 14, "AMERICA'S BIGGEST MYSTERY COULD FINALLY FACE A PUBLIC AUDIT... Fort Knox... decades of conspiracy theories... Source: Bull Theory", "https://www.linkedin.com/posts/charles-henry-monchau-cfa-cmt-caia-4003096_americas-biggest-mystery-could-finally-activity-7466795705756598272-60Ow"),
]
for a, ch, fm, re_, co, sh, t, u in extra:
    out.append((a, ch, true_date(u), fm, re_, co, sh, t, u, "Crustdata /social_post/search (index through ~2026-09-17)"))
out.sort(key=lambda x: (x[0], x[2]), reverse=False)
write("posts_raw_all.csv", ["author", "channel", "true_date_utc", "format", "reactions", "comments", "shares", "text", "url", "source"], out)
print(len(out), "posts;", len(cad), "cadence rows")
