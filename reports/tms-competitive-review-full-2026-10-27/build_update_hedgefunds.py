"""Writes the 27 Oct update tables: the five institutional hedge-fund competitors, Monchau's tech
posts vs his other posts, and high-frequency tech voices on LinkedIn (data/*.csv).
All counts are Crustdata /social_post/search limit=0 queries over 17 Jun - 17 Sep 2026 unless noted."""
import csv, datetime, os, re
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "data")

def write(name, header, rows):
    with open(os.path.join(OUT, name), "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f); w.writerow(header); w.writerows(rows)

def true_date(url):
    m = re.search(r'(?:activity|ugcPost|share)[-:](\d{18,20})', url)
    return datetime.datetime.fromtimestamp((int(m.group(1)) >> 22) / 1000, datetime.UTC).strftime("%Y-%m-%d") if m else ""

# ------------------------------------------------------------------ hedge funds
hf = [
 # fund, crustdata_id, linkedin, site, hq, founded, aum, aum_source, strategy_note, founder, founder_linkedin, website, website_type, gate
 ("Jericho Capital", 1348019, "https://www.linkedin.com/company/jericho-capital-asset-management-l-p", "https://www.jerichocap.com", "Los Angeles / New York", 1994,
  "~USD 10.1bn (third-party est. from Form ADV)", "https://www.quiverquant.com/institutions/Jericho%20Capital%20Asset%20Management%20L.P./",
  "TMT long/short, concentrated, discretionary", "Josh Resnick", "https://www.linkedin.com/in/josh-resnick-a3027a12",
  "Contact-only holding page (addresses, email, phone) + founder bio", "None (nothing to gate)"),
 ("Light Street Capital", 991218, "https://www.linkedin.com/company/light-street-capital-management-llc", "https://www.lightstreet.com", "Palo Alto", 2010,
  "~USD 1.6bn regulatory AUM (aggregator, Mar 2026)", "https://aum13f.com/firm/light-street-capital-management-llc",
  "Tech long/short ('Halogen') plus private investments; Tiger Cub", "Glen Kacher", "https://www.linkedin.com/in/kacher",
  "One-liner 'Investing in disruptive technology businesses globally' + logo wall of private investments (IPO exits) + disclaimers", "Investor login"),
 ("Whale Rock Capital", 993750, "https://www.linkedin.com/company/whale-rock-capital-management-llc", "https://www.whalerockcapital.com", "Boston", 2006,
  "USD 14bn+ for 450+ investors (firm's own LinkedIn post, May 2026)", "https://www.linkedin.com/posts/whale-rock-capital-management-llc_may-1-2026-marks-whale-rocks-20th-year-ugcPost-7455981839569104896-hTMt",
  "TMT long/short, long-only, MegaCap Tech and late-stage private (AI) strategies", "Alex Sacerdote", "https://www.linkedin.com/in/alex-sacerdote-59747814",
  "Site returns an investor login wall (TinyFish fetch, 27 Oct)", "Login required"),
 ("Coatue Management", 1033880, "https://www.linkedin.com/company/coatue", "https://www.coatue.com", "New York", 1999,
  "~USD 92.7bn regulatory AUM (Form ADV aggregators, ~Mar 2026); firm cites ~USD 73bn+ (Dec 2025)", "https://altss.com/profile/coatue-management.md",
  "Tech crossover long/short, public + private ('lifecycle investment platform')", "Philippe Laffont", "https://www.linkedin.com/in/philippe-laffont-8092771",
  "Full content site: hero, partnerships (Anthropic, Databricks), Insights (podcasts, interviews, summit talks), featured portfolio (250+ private companies), strategies, CoatueCTEK link", "None for content; investor materials separate"),
 ("Altimeter Capital", 992773, "https://www.linkedin.com/company/altimeter-capital", "https://www.altimeter.com", "Menlo Park / Boston", 2008,
  "~USD 9.8bn Q2 2026 13F long book (aggregator); Form ADV figures differ", "https://www.thetrading.tools/altimeter-capital-13f",
  "Tech/AI public + private; long/short", "Brad Gerstner", "https://www.linkedin.com/in/bradgerstner",
  "One-paragraph mission ('built by a founder for founders') + offices + IR and press emails", "None (nothing to gate)"),
]
write("hf_competitors.csv", ["fund", "crustdata_id", "linkedin", "site", "hq", "founded", "aum", "aum_source", "strategy", "founder", "founder_linkedin", "website", "website_type", "gate"], hf)

hfli = [
 # fund, company_posts_lifetime, company_posts_13w, per_week, formats_13w, median_est, best_reactions, best_url, founder_posts_lifetime, founder_posts_13w, channel, voice, strong_points, learn
 ("Jericho Capital", 0, 0, 0.0, "none", "n/a", "", "https://www.linkedin.com/posts/institutional-investor_jerichos-high-conviction-playbook-shows-activity-7477818522937663489-RhMU",
  "≈0 (Resnick: included in 1 post combined with Meyer, all-time)", 0, "Press only (Institutional Investor, others reshare)", "None of its own",
  "Reputation built off-platform: top-tier press on performance; zero marketing noise suits a closed, allocator-led fund", "Silence works for an established USD 10bn fund marketed through allocators and press; a boutique raising capital cannot copy it"),
 ("Light Street Capital", 0, 0, 0.0, "none (company page empty)", "n/a", "147", "https://www.linkedin.com/posts/activity-7475250417921105920-VNLq",
  "7", "1", "Founder only (Glen Kacher, personal)", "Personal, values-led (family, defence tech)",
  "Founder posts rarely but personally (147 reactions on a Navy/defence-tech post); website shows a track record of private-investment IPO exits", "A rare personal founder post outperforms a corporate page; show track record as outcomes, not adjectives"),
 ("Whale Rock Capital", 7, 1, 0.08, "image 4, article 2, video 1 (all 7 lifetime posts)", "~233 (7 posts)", "709", "https://www.linkedin.com/posts/whale-rock-capital-management-llc_may-1-2026-marks-whale-rocks-20th-year-ugcPost-7455981839569104896-hTMt",
  "see note", "see note", "Company page, milestone-driven; founder speaks at conferences/podcasts", "Founder-letter tone; one clear thesis ('golden age of hardware')",
  "Very rare but very high engagement (avg ~243 reactions/post): 20th-anniversary letter disclosing USD 14bn and 450+ investors (709); Sohn conference thesis; Invest Like the Best podcast", "Post less often but make each post a milestone with a thesis and a number; reuse conference and podcast appearances"),
 ("Coatue Management", 280, 63, 4.85, "image 22, video 17, document 12, article 4", "~55 (54% ≥50; 16% ≥100)", "232", "https://www.linkedin.com/posts/coatue_in-february-we-co-led-anthropics-series-activity-7465869305302196224-NJ7K",
  "≈0 (Laffont, combined 15 posts across 4 founders all-time)", "n/a", "Company page + LinkedIn newsletter + insights site", "Confident one-line theses; portfolio news",
  "Highest cadence in the set (4.85/week); every post ties to a portfolio company or a founder TV clip; one-line hooks ('Intelligence is becoming a utility you pay for monthly'); newsletter and insights hub", "Turn each research view into a one-line hook plus a chart or clip; run a newsletter from the company page"),
 ("Altimeter Capital", 126, 29, 2.23, "article 10, image 6, video 2, text ~11", "~40 (76% ≥20; 38% ≥50)", "354", "https://www.linkedin.com/posts/altimeter-capital_small-team-big-ambition-every-summer-activity-7483897150100131840-4pLm",
  "25", "3", "Company page + founder Brad Gerstner (personal) + partners", "Founder-as-public-figure: CNBC clips, policy (Invest America), partner conversations",
  "Founder is the brand: Gerstner TV clips (122), AI policy views, personal posts (181 on Invest America); team-culture post best (354); partners interview portfolio CEOs (118)", "Make Julien the public face: TV clips with a quote, a clear policy/market stance, partners interviewing companies"),
]
write("hf_linkedin.csv", ["fund", "company_posts_lifetime", "company_posts_13w", "posts_per_week", "formats_13w", "median_reactions_est", "best_post_reactions", "best_post_url", "founder_posts_lifetime", "founder_posts_13w", "channel", "voice", "strong_points", "what_taranis_can_learn"], hfli)

hf_posts = [
 ("Coatue Management", "image", 232, 2, 14, "https://www.linkedin.com/posts/coatue_in-february-we-co-led-anthropics-series-activity-7465869305302196224-NJ7K", "In February we co-led Anthropic's Series G. Today, we're co-leading their Series H... Run-rate revenue crossed $47 billion. Why we are tripling down."),
 ("Coatue Management", "image", 165, 2, 6, "https://www.linkedin.com/posts/coatue_coatue-first-invested-in-databricks-in-2019-activity-7493751839570497536-ahvz", "Coatue first invested in Databricks in 2019. The pace of Databricks' execution continues to stand out."),
 ("Coatue Management", "video", 153, 2, 9, "https://www.linkedin.com/posts/coatue_philippe-laffont-on-cnbcs-squawk-box-activity-7475569597241380864-KbWm", "Intelligence is becoming a utility you pay for monthly... Philippe Laffont joined CNBC's Squawk Box."),
 ("Coatue Management", "image", 136, 3, 3, "https://www.linkedin.com/posts/coatue_at-the-raise-summit-in-paris-max-cook-shared-activity-7486147335702347776-jTrt", "At the RAISE Summit in Paris, Max Cook shared some takeaways on the shift toward multi-model AI."),
 ("Altimeter Capital", "image", 354, 4, 7, "https://www.linkedin.com/posts/altimeter-capital_small-team-big-ambition-every-summer-activity-7483897150100131840-4pLm", "Small team. Big ambition. Every summer, we take a brief moment to celebrate the people behind Altimeter..."),
 ("Altimeter Capital", "image", 131, 3, 2, "https://www.linkedin.com/posts/altimeter-capital_congratulations-to-altimeter-founder-ceo-activity-7483582762902257664-m16k", "Congratulations to Altimeter Founder & CEO Brad Gerstner on being named to Observer's 2026 A.I. Power Index."),
 ("Altimeter Capital", "video", 122, 11, 5, "https://www.linkedin.com/posts/altimeter-capital_scott-wapner-opened-by-asking-brad-gerstner-ugcPost-7504304229507911680-Dn8A", "Scott Wapner opened by asking Brad Gerstner about the week's AI safety debate..."),
 ("Altimeter Capital", "image", 118, 2, 5, "https://www.linkedin.com/posts/altimeter-capital_altimeter-partner-apoorv-agrawal-sat-down-activity-7481092432130887680-onZn", "Altimeter Partner Apoorv Agrawal sat down with Glean Founder & CEO Arvind Jain at RAISE Summit..."),
 ("Brad Gerstner (Altimeter founder)", "image", 181, 16, 7, "https://www.linkedin.com/posts/bradgerstner_the-social-security-act-of-1935-is-to-labor-activity-7502778602866941952-DbPa", "The Social Security Act of 1935 is to labor what the Invest America Act / Trump Accounts are to capital..."),
 ("Brad Gerstner (Altimeter founder)", "text", 39, 0, 1, "https://www.linkedin.com/posts/bradgerstner_the-west-has-a-deep-precision-strike-gap-ugcPost-7503530011795030016-yl33", "Peace through strength."),
 ("Whale Rock Capital", "image", 709, 113, 24, "https://www.linkedin.com/posts/whale-rock-capital-management-llc_may-1-2026-marks-whale-rocks-20th-year-ugcPost-7455981839569104896-hTMt", "May 1, 2026 marks Whale Rock's 20th year... manages over $14 billion for more than 450 investors..."),
 ("Whale Rock Capital", "image", 252, 1, 7, "https://www.linkedin.com/posts/whale-rock-capital-management-llc_whale-rock-ceo-and-portfolio-manager-alex-activity-7462252798181556224-kuRn", "Alex Sacerdote spoke at the 31st Annual Sohn Investor Conference... 'golden age of hardware'."),
 ("Whale Rock Capital", "video", 244, 4, 5, "https://www.linkedin.com/posts/whale-rock-capital-management-llc_whale-rocks-founder-and-portfolio-manager-ugcPost-7467704828232826880-hJAg", "Alex Sacerdote featured at Sohn: the 'golden age of hardware investing'..."),
 ("Whale Rock Capital", "image", 233, 5, 1, "https://www.linkedin.com/posts/whale-rock-capital-management-llc_this-past-friday-our-2026-summer-intern-activity-7490038602467332096-Aqwx", "Our 2026 summer intern class wrapped up... projects ranging from robotics and power semiconductors to AI."),
 ("Whale Rock Capital", "article", 142, 0, 2, "https://www.linkedin.com/posts/whale-rock-capital-management-llc_alex-sacerdote-how-to-invest-through-technology-activity-7470121869430624257-XZw2", "Grateful to Patrick O'Shaughnessy and the Invest Like the Best team for having Alex Sacerdote on the podcast."),
 ("Glen Kacher (Light Street founder)", "text", 147, 5, 0, "https://www.linkedin.com/posts/activity-7475250417921105920-VNLq", "Congratulations to my brother for his exemplary 36 years of service in the U.S. Navy... The Defense Tech opportunity..."),
]
write("hf_posts_sample.csv", ["author", "format", "reactions", "comments", "shares", "url", "text", "true_date_utc"], [r + (true_date(r[5]),) for r in hf_posts])

# ------------------------------------------------------------------ Monchau: tech vs other (17 Jun - 17 Sep 2026)
TOTAL, TECH = 1051, 271
OTHER = TOTAL - TECH
all_ge = {25: 743, 54: 558, 100: 380, 200: 212}
tech_ge = {25: 200, 54: 151, 100: 99, 200: 46}
rows = []
for th in (25, 54, 100, 200):
    o = all_ge[th] - tech_ge[th]
    ts, os_ = tech_ge[th] / TECH, o / OTHER
    rows.append((th, tech_ge[th], round(ts, 3), o, round(os_, 3), round(ts / os_ - 1, 3)))
write("monchau_tech_vs_other.csv", ["threshold", "tech_posts_at_or_above", "tech_share", "other_posts_at_or_above", "other_share", "tech_relative_lift"], rows)
write("monchau_tech_monthly.csv", ["period", "tech_posts", "all_posts", "tech_share"], [
    ("Jun 17-30", 39, 160, round(39 / 160, 3)), ("Jul", 153, 573, round(153 / 573, 3)), ("Aug", 42, 182, round(42 / 182, 3)), ("Sep 1-16", 37, 136, round(37 / 136, 3))])
write("monchau_tech_summary.csv", ["metric", "value", "note"], [
    ("Posts in window", TOTAL, "17 Jun - 17 Sep 2026"), ("Tech/AI posts", TECH, "keyword AI|Nvidia|OpenAI|semiconductor|tech"),
    ("Tech share of all posts", round(TECH / TOTAL, 3), ""), ("Tech posts crediting a Source", 230, "84.9% of tech posts (all posts: 86%)"),
    ("Tech posts per day", round(TECH / 92, 2), "92 days")])
mts = [
 ("Morgan Stanley maps the AI infrastructure supply chain", "image", 2452, 76, 156, "https://www.linkedin.com/posts/charles-henry-monchau-cfa-cmt-caia-4003096_morgan-stanley-just-mapped-out-the-entire-activity-7487933666971615233-ThPI", "Curated (Source: Milk Road); picks-and-shovels framing"),
 ("AI-generated 'Champion of the Universe' video", "video", 1487, 56, 138, "https://www.linkedin.com/posts/charles-henry-monchau-cfa-cmt-caia-4003096_these-ai-generated-videos-are-amazing-ugcPost-7478449831934373889-xN9F", "Humour clip, AI as subject (Source: Laurent Lequeu)"),
 ("Bloodbath in IT outsourcing (Accenture, Indian IT)", "image", 680, 76, 46, "https://www.linkedin.com/posts/charles-henry-monchau-cfa-cmt-caia-4003096_massive-bloodbath-in-the-it-outsourcing-sector-activity-7473592905933242368-Dg-w", "AI-disruption narrative with names and moves (Source: Bull Theory)"),
 ("Ken Griffin: AI does a week of PhD work in hours", "video", 628, 59, 54, "https://www.linkedin.com/posts/charles-henry-monchau-cfa-cmt-caia-4003096_ken-griffin-says-ai-can-now-do-a-weeks-worth-ugcPost-7490293667644022784-42nW", "Hedge-fund relevance: AI quant agents"),
 ("AI spending boom consuming hyperscaler cash flows", "image", 608, 52, 36, "https://www.linkedin.com/posts/charles-henry-monchau-cfa-cmt-caia-4003096_the-ai-spending-boom-is-consuming-hyperscaler-activity-7476325916621770752-smtp", "Data chart, capex vs FCF"),
 ("Hyperscaler debt is exploding", "image", 230, 15, 21, "https://www.linkedin.com/posts/charles-henry-monchau-cfa-cmt-caia-4003096_hyperscaler-debt-is-exploding-amazon-activity-7504939484937969664-4uAF", "Data chart (Bloomberg, Hedgeye)"),
 ("Token demand doubled in a month (AI infra crash: zoom out)", "image", 206, 28, 19, "https://www.linkedin.com/posts/charles-henry-monchau-cfa-cmt-caia-4003096_if-todays-crash-in-ai-infrastructure-stocks-activity-7500815918898274304-RTIZ", "Contrarian reassurance after a sell-off"),
 ("Masayoshi Son sold 4% of Nvidia for under $4bn", "video", 163, 5, 9, "https://www.linkedin.com/posts/charles-henry-monchau-cfa-cmt-caia-4003096_masayoshi-son-sold-4-of-his-nvidia-stake-ugcPost-7501007438876172288-sasV", "Short stat hook"),
 ("AI agents use 1,400% more tokens than in February", "image", 145, 6, 13, "https://www.linkedin.com/posts/charles-henry-monchau-cfa-cmt-caia-4003096_ai-agents-are-using-1400-more-tokens-today-activity-7502795340476047360-LkXQ", "Memory-cycle angle ($MU, $SKHY)"),
 ("Dear Donald (oil + AI capex)", "image", 75, 8, 1, "https://www.linkedin.com/posts/charles-henry-monchau-cfa-cmt-caia-4003096_dear-donald-the-no-war-no-peace-with-iran-activity-7505921077903257600--Z_Y", "His own synthesis; below his tech average"),
 ("JPM: the largest AI borrowers are not weak credits", "image", 14, 0, 1, "https://www.linkedin.com/posts/charles-henry-monchau-cfa-cmt-caia-4003096_the-largest-ai-borrowers-are-not-weak-credits-activity-7505634083658489857-lxSe", "Dense credit analysis; low engagement"),
]
write("monchau_tech_samples.csv", ["post", "format", "reactions", "comments", "shares", "url", "note", "true_date_utc"], [r + (true_date(r[5]),) for r in mts])

# ------------------------------------------------------------------ high-frequency tech voices (like Monchau)
cur = [
 # name, url, posts_13w, credited_posts, top_post_title, top_format, top_reactions, top_url, authorship_signal
 ("Charles-Henry Monchau (benchmark)", "https://www.linkedin.com/in/charles-henry-monchau-cfa-cmt-caia-4003096", 1051, 907, "Pierce Brosnan photo (humour)", "image", 17611, "https://www.linkedin.com/posts/charles-henry-monchau-cfa-cmt-caia-4003096_the-camera-man-is-a-genius-for-those-activity-7505271378573594624-jGSn", "Curator: 86% credit a Source/via (907 of 1,051); text largely follows the cited account"),
 ("Eduardo Ordax (AWS, GenAI GTM)", "https://www.linkedin.com/in/eordax", 250, 27, "Vibe coder at 2AM (humour video)", "video", 6837, "https://www.linkedin.com/posts/eordax_ai-humor-ugcPost-7474863040736350209-PN7h", "Mostly own short commentary; humour clips posted natively without a credit line"),
 ("Linas Beliūnas (fintech/AI)", "https://www.linkedin.com/in/linasbeliunas", 200, 38, "Watch this Stanford lecture instead of Netflix", "video", 16285, "https://www.linkedin.com/posts/linasbeliunas_instead-of-watching-2-hours-of-netflix-tonight-ugcPost-7481787865924956160-4yUE", "Curates others' content but re-frames it in his own voice; 19% carry a credit"),
 ("Ethan Mollick (Wharton)", "https://www.linkedin.com/in/emollick", 199, 12, "New book: Co-Existence", "image", 3928, "https://www.linkedin.com/posts/emollick_i-have-a-new-book-coming-out-october-20-activity-7468411654381289472-oxlx", "Writes his own: first-hand tests and opinions; 6% credit others"),
 ("Ruben Hassid (AI writing)", "https://www.linkedin.com/in/ruben-hassid", 177, 33, "Don't post obvious AI-written content: 12 tells", "image", 4400, "https://www.linkedin.com/posts/ruben-hassid_dont-post-obvious-ai-written-content-activity-7486374672033316864-tYgN", "Own listicle templates with a lead magnet; repeatable format (production team not verifiable)"),
 ("Brij Kishore Pandey (AI architect)", "https://www.linkedin.com/in/brijpandeyji", 158, 30, "The cloud is not really a cloud (rack diagram)", "image", 3516, "https://www.linkedin.com/posts/brijpandeyji_the-cloud-is-not-really-a-cloud-behind-activity-7498739395370393600-WM3x", "Own explainer text over diagrams; ends with a question"),
 ("Pascal Bornet (AI/automation author)", "https://www.linkedin.com/in/pascalbornet", 151, 16, "Friday software release (humour video)", "video", 10707, "https://www.linkedin.com/posts/pascalbornet_developerhumor-softwareengineering-releasemanagement-ugcPost-7503316540650360833-eue9", "Viral clips with his own caption; credits rare (11%)"),
 ("Bernard Marr (futurist)", "https://www.linkedin.com/in/bernardmarr", 121, 8, "Why no one really understands AI", "article", 207, "https://www.linkedin.com/posts/bernardmarr_ai-hallucinate-unpredictably-activity-7483761636822953984-MJV6", "Own articles and newsletter excerpts, hashtag-heavy"),
 ("Andreas Horn (AI, AIOps)", "https://www.linkedin.com/in/andreashorn1", 117, 14, "", "", "", "", "Not sampled; 12% credit others"),
 ("Ronald van Loon (AI influencer)", "https://www.linkedin.com/in/ronald-van-loon-5411a", 99, "", "", "", "", "", "Not sampled"),
 ("Evan Kirstel (B2B tech)", "https://www.linkedin.com/in/evankirstel", 95, "", "", "", "", "", "Not sampled"),
 ("Antonio Grasso (digital transformation)", "https://www.linkedin.com/in/antgrasso", 77, "", "", "", "", "", "Not sampled"),
]
rows = []
for n, u, p, c, tt, tf, tr, tu, a in cur:
    share = round(c / p, 3) if c != "" else ""
    rows.append((n, u, p, round(p / 13, 1), c, share, tt, tf, tr, tu, a))
write("tech_voices_frequency.csv", ["name", "profile_url", "posts_13w", "posts_per_week", "credited_posts", "credited_share", "top_post", "top_format", "top_reactions", "top_url", "authorship_signal"], rows)
print("ok")
