"""Writes the Swiss product-page, positioning, peer-scan and plan tables (data/*.csv).
Facts come from the product-page teardown in swiss_A_product_pages.md; each row carries its source URLs."""
import csv, os, sys

OUT = sys.argv[1]
A = "https://www.atonra.ch/investment-funds/ai-robotics"
AF = "https://atonra.stainly-bench.com/report/factsheet-artificial-intelligence-robotics-xs1668112011/"
D = "https://www.decalia.com/en-ch/funds/"
DF = "https://funds-static.pictet.com/funds/decalia/factsheet/MR_ES_en_LU2407358063_YES_2026-05-31.pdf"
P = "https://am.pictet.com/ch/en/intermediaries/funds/pictet-robotics/LU1279334210"
PA = "https://am.pictet.com/ch/en/institutions/funds/pictet-tr-atlas-titan/LU2206555984"
T = "https://taranis.net/investment/tms"

pages = [
    ("Page analysed", "AI & Robotics AMC", "DECALIA SICAV - Future SOCIETY", "Pictet - Robotics (+ Digital, TR-Atlas Titan)", "Taranis Market Sentiment", A, DF, P, T),
    ("Structure", "Product page in multi-theme site: description, monthly performance grid, statistics, holdings, risks; sidebar with price, ISIN, factsheet, KIID", "Strategy themes on corporate site; fund pages on a separate gated SICAV site; factsheet: objective, team, key facts, performance, holdings", "Standard fund microsite per share class: key info, objective, process, performance, risk, portfolio, literature", "One heading, three paragraphs, award line, disclaimer", A, D, P, T),
    ("Navigation depth", "2-3 clicks, no gate", "3+ clicks plus gate", "3+ clicks; audience in URL", "2 clicks plus gate", "https://www.atonra.ch", D, "https://am.pictet.com/ch/en", T),
    ("Languages", "English only seen (not verified)", "EN, FR, DE, IT", "EN, FR, DE, IT", "English only", A, "https://www.decalia.com/fr-ch/", P, T),
    ("Vehicle / domicile", "JP Morgan-issued AMC (XS1668112011); UCITS umbrella LU2170994805", "Luxembourg UCITS SICAV", "Luxembourg UCITS SICAV (Robotics Art. 8)", "Not shown", AF, DF, P, T),
    ("Inception", "Jun 2019", "Nov 2021", "Oct 2015 (Robotics P EUR)", "Not shown", A, DF, P, T),
    ("Fees", "1.30% mgmt + 0.20% issuer + 15% perf (factsheet)", "OCF 1.60% (FT)", "Not on page; OCF 1.98% (FT)", "Not shown", AF, "https://markets.ft.com/data/funds/tearsheet/summary?s=LU2407358063:EUR", "https://markets.ft.com/data/funds/tearsheet/summary?s=lu1279334210:eur", T),
    ("AUM", "Not shown", "EUR 139m (31 May 2026)", "EUR 13.0bn (26 Oct 2026)", "Not shown", A, DF, P, T),
    ("Benchmark", "MSCI ACWI (reference)", "MSCI World NR EUR", "MSCI AC World", "None", AF, DF, P, T),
    ("Performance disclosure", "Full: YTD on page; monthly net returns 2019-2026 in factsheet", "Full in public factsheet (YTD, 1Y, 3Y, SI, calendar years)", "Full on page vs benchmark (YTD to SI)", "None (award line only)", AF, DF, P, T),
    ("Documents", "Factsheet, KIID", "Factsheet public; KID/prospectus behind gate", "Factsheet, KID, prospectus, reports, SFDR, NAV history", "None", A, DF, P, T),
    ("Risk disclosure", "SRI 6 in factsheet; page says no specific risks info", "SRI scale + risk text", "Full SRI + extra risks + capital-loss warning", "Gate disclaimer only", AF, DF, P, T),
    ("Minimum / share classes", "Not shown / single certificate", "No minimum (R) / R, RP, IP, A1P, S", "Not on page / many classes, one URL each", "Not shown / not shown", A, DF, P, T),
    ("Strategy in own words", "AI pure players: semiconductors, data, software, robotics; 1,300-sub-sector taxonomy", "Multi-thematic global equity in innovative, disruptive companies; mid-cap bias, barbell", "Active, high-conviction stock picking in robotics (universe ~200)", "Tech L/S: fundamental picks + quant overlay on risk appetite and positioning", A, DF, P, T),
    ("Hook / tagline", "The third step of technological evolution", "Disruptive companies shaping our society", "Robots are no longer confined to the factory floor", "Anticipate Trends", A, DF, P, "https://taranis.net"),
    ("Differentiators", "Research heritage since 2004; proprietary taxonomy; AI/quant platform (Fundy)", "Multi-thematic, active ESG, mid-cap bias, barbell, peer ranking", "Scale, 30-year thematic franchise, ESG", "Behavioural sentiment algorithm + fundamentals; long/short", A, "https://www.finews.com/news/english-news/74003-decalia-future-society-fund-interview-quirien-lemey-iana-perova", P, T),
    ("Systematic vs discretionary", "Hybrid (discretionary themes, systematic optimisation)", "Discretionary", "Discretionary (Atlas Titan adds quant indicators)", "Hybrid (fundamental + quant sentiment overlay)", "https://www.atonra.ch/investment-funds", DF, PA, T),
    ("Target audience", "Broad: seasoned investors to newcomers", "Private and institutional", "Segmented: individuals / intermediaries / institutions", "Qualified and professional investors in CH/UK", "https://www.atonra.ch", D, "https://am.pictet.com/ch/en", T),
    ("Tone", "Marketing-heavy", "Factual, institutional", "Regulatory, technical", "Short, low information", A, DF, P, T),
    ("Investor gate", "None", "Investor category + country", "Profile selector in URL", "Country, then professional/retail, then I Accept", A, D, "https://am.pictet.com/ch/en", T),
    ("Primary CTAs", "Factsheet, KIID, contact, WhatsApp, login", "Discover funds, newsletter", "Download factsheet / NAV / all literature", "Contact only", A, "https://www.decalia.com/en-ch/news/", P, T),
]

positioning = [
    ("AtonRâ Partners", "AI & Robotics AMC", A, "Sells thematic tech as 12+ single-theme certificates plus a UCITS umbrella. Leans on research heritage since 2004, a 1,300-sub-sector taxonomy and its AI/quant platform Fundy. Product pages are ungated and show price, YTD and ISIN; the factsheet gives monthly net returns and fees. Tone is marketing-heavy and pitched broadly."),
    ("DECALIA", "Future SOCIETY", DF, "A long-only multi-thematic growth UCITS (EUR 139m) tilted to tech (~52% IT, ~35% AI infrastructure) with a mid-cap/healthcare barbell. Promoted through PM interviews; full-performance factsheets are public even though fund pages sit behind an investor-category gate. Multilingual and institutional in tone."),
    ("Pictet Asset Management", "Robotics / Digital / TR-Atlas Titan", P, "The scale benchmark: Robotics alone is EUR 13bn. Every share class has a standardised page with NAV, size, SRI, benchmark-relative returns and a full document library. TR-Atlas Titan (EUR 688m) is the closest TMS analogue, a discretionary global L/S that is not tech-specific."),
    ("Taranis", "Market Sentiment (TMS)", T, "The only tech long/short with a behavioural-sentiment quant overlay in the Swiss set, a real positioning gap. But the gated page has no ISIN, vehicle, fees, AUM, performance, documents or team, and its only proof point is a 2023 'Managed Futures' award. The public /investment intro now reads more quant than the gated page."),
]

peers = [
    ("Vontobel", "Vontobel Fund II - Megatrends (multi-theme)", "https://am.vontobel.com/en/document/c2255db0-ed98-43fe-b3bc-7a1c89d838c8/Factsheet_20251231_EN_LU2275724008.pdf", "No dedicated tech/AI fund; multi-thematic megatrends", "Public factsheets", 4.23),
    ("GAM", "GAM Star Disruptive Growth", "https://www.gam.com/en/funds/featured-funds/gam-star-disruptive-growth", "Long-only global growth around disruption, 40-60 stocks", "Not on featured page", 3.15),
    ("Bellevue", "No tech fund (healthcare: Digital Health, AI Health)", "https://www.bellevue.ch/all-en/all/products/healthcare-investments/thematic/bellevue-digital-health/i-shares-usd", "Healthcare specialist", "Full", 0.92),
    ("Mirabaud", "No tech/disruptive fund", "https://www.mirabaud-am.com/en/", "European SMID and quality global equities", "n/a (qualified gate)", 4.85),
]

plan = [
    ("1. Match the Swiss boutique bar", "Get the company page to at least DECALIA's cadence (~2/week): weekly sentiment-gauge chart + one fund/BFM post", 2.3, "DECALIA 30 posts in 13 weeks; Taranis 2"),
    ("2. Take the tech-AI thesis lane", "Publish one original AI-disruption thesis a week from Julien: AtonRâ owns the format but gets 0-10 reactions per post and its index presence lapsed after April; Pictet's PMs are silent", 1, "AtonRâ best 2026 post 10 reactions; Pictet PMs 0 posts"),
    ("3. Lead with people, Swiss-style", "Founder and partners post in their own names; humour and local colour work (Quirighetti's Playmobil post 153 vs DECALIA page best 63)", 2, "DECALIA CIO vs page; Taranis CEO 64 vs page 14"),
    ("4. Fix the product page before pushing traffic", "Add ISIN, vehicle, fees, sleeve split, named PMs, gated factsheet and a 'request factsheet' CTA; every Swiss peer shows full performance somewhere", "", "AtonRâ, DECALIA, Pictet all disclose; Taranis none"),
    ("5. Bilingual and compliant", "Post in FR + EN (DECALIA and Pictet run 4 languages); add a one-line risk warning and keep performance behind the gate (AtonRâ posts YTD numbers publicly)", "", "Pictet risk warning on posts; AtonRâ performance claims"),
]

def write(name, header, rows):
    with open(os.path.join(OUT, name), "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f); w.writerow(header); w.writerows(rows)

write("swiss_pages.csv", ["attribute", "atonra", "decalia", "pictet", "taranis", "src_atonra", "src_decalia", "src_pictet", "src_taranis"], pages)
write("swiss_positioning.csv", ["firm", "fund", "page_url", "summary"], positioning)
write("swiss_peers.csv", ["firm", "fund", "url", "strategy", "performance_disclosure", "linkedin_posts_per_week"], peers)
write("swiss_plan.csv", ["recommendation", "action", "target_posts_per_week", "evidence"], plan)
print("ok")
