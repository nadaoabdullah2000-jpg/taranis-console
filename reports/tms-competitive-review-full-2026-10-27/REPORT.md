# TMS LinkedIn Competitive Review

Prepared 27 Oct 2026 for Taranis SA (Geneva). "Taranis" here is Taranis SA, the FINMA-authorised asset manager ([LinkedIn](https://www.linkedin.com/company/taranis-sa)), not Perenco's Taranis energy assets or the DFSA-registered Taranis Capital.

**Deliverables in this folder**
- `dashboard.html`: self-contained dashboard (d3 and all data inlined; opens offline).
- `TMS_LinkedIn_Competitive_Review.docx`: detailed Word report with links and charts.
- `data/posts_raw_all.csv`: 132 posts (author, true_date_utc, format, reactions, comments, shares, text, url).
- `data/*.csv`: every table below. `count_queries.csv` and `count_queries_swiss.csv`: every Crustdata count query.
- Build scripts: `build_data.py`, `build_dashboard.py`, `build_word.js`, `build_report_md.py`.

## Update (27 Oct): institutional tech hedge funds

The competitor set is now five non-retail tech hedge funds. The earlier Swiss/UCITS peer set below is kept for reference.

| Fund | HQ | Founded | AUM (as reported) | Source | Strategy | Founder | Founder LinkedIn | Company LinkedIn | Website | Gate |
|---|---|---|---|---|---|---|---|---|---|---|
| Jericho Capital | Los Angeles / New York | 1994 | ~USD 10.1bn (third-party est. from Form ADV) | [quiverquant.com](https://www.quiverquant.com/institutions/Jericho%20Capital%20Asset%20Management%20L.P./) | TMT long/short, concentrated, discretionary | Josh Resnick | [linkedin.com](https://www.linkedin.com/in/josh-resnick-a3027a12) | [page](https://www.linkedin.com/company/jericho-capital-asset-management-l-p) | None (nothing to gate) |  |
| Light Street Capital | Palo Alto | 2010 | ~USD 1.6bn regulatory AUM (aggregator, Mar 2026) | [aum13f.com](https://aum13f.com/firm/light-street-capital-management-llc) | Tech long/short ('Halogen') plus private investments; Tiger Cub | Glen Kacher | [linkedin.com](https://www.linkedin.com/in/kacher) | [page](https://www.linkedin.com/company/light-street-capital-management-llc) | Investor login |  |
| Whale Rock Capital | Boston | 2006 | USD 14bn+ for 450+ investors (firm's own LinkedIn post, May 2026) | [post](https://www.linkedin.com/posts/whale-rock-capital-management-llc_may-1-2026-marks-whale-rocks-20th-year-ugcPost-7455981839569104896-hTMt) | TMT long/short, long-only, MegaCap Tech and late-stage private (AI) strategies | Alex Sacerdote | [linkedin.com](https://www.linkedin.com/in/alex-sacerdote-59747814) | [page](https://www.linkedin.com/company/whale-rock-capital-management-llc) | Login required |  |
| Coatue Management | New York | 1999 | ~USD 92.7bn regulatory AUM (Form ADV aggregators, ~Mar 2026); firm cites ~USD 73bn+ (Dec 2025) | [altss.com](https://altss.com/profile/coatue-management.md) | Tech crossover long/short, public + private ('lifecycle investment platform') | Philippe Laffont | [linkedin.com](https://www.linkedin.com/in/philippe-laffont-8092771) | [page](https://www.linkedin.com/company/coatue) | None for content; investor materials separate |  |
| Altimeter Capital | Menlo Park / Boston | 2008 | ~USD 9.8bn Q2 2026 13F long book (aggregator); Form ADV figures differ | [thetrading.tools](https://www.thetrading.tools/altimeter-capital-13f) | Tech/AI public + private; long/short | Brad Gerstner | [linkedin.com](https://www.linkedin.com/in/bradgerstner) | [page](https://www.linkedin.com/company/altimeter-capital) | None (nothing to gate) |  |

**LinkedIn, 17 Jun – 17 Sep 2026**

| Fund | Posts all-time | Posts 13w | Per week | Formats | Typical reactions | Best | Link | Channel | Strong points | What Taranis can learn |
|---|---|---|---|---|---|---|---|---|---|---|
| Jericho Capital | 0 | 0 | 0.0 | none | n/a |  | [post](https://www.linkedin.com/posts/institutional-investor_jerichos-high-conviction-playbook-shows-activity-7477818522937663489-RhMU) | Press only (Institutional Investor, others reshare) | Reputation built off-platform: top-tier press on performance; zero marketing noise suits a closed, allocator-led fund | Silence works for an established USD 10bn fund marketed through allocators and press; a boutique raising capital cannot copy it |
| Light Street Capital | 0 | 0 | 0.0 | none (company page empty) | n/a | 147 | [post](https://www.linkedin.com/posts/activity-7475250417921105920-VNLq) | Founder only (Glen Kacher, personal) | Founder posts rarely but personally (147 reactions on a Navy/defence-tech post); website shows a track record of private-investment IPO exits | A rare personal founder post outperforms a corporate page; show track record as outcomes, not adjectives |
| Whale Rock Capital | 7 | 1 | 0.08 | image 4, article 2, video 1 (all 7 lifetime posts) | ~233 (7 posts) | 709 | [post](https://www.linkedin.com/posts/whale-rock-capital-management-llc_may-1-2026-marks-whale-rocks-20th-year-ugcPost-7455981839569104896-hTMt) | Company page, milestone-driven; founder speaks at conferences/podcasts | Very rare but very high engagement (avg ~243 reactions/post): 20th-anniversary letter disclosing USD 14bn and 450+ investors (709); Sohn conference thesis; Invest Like the Best podcast | Post less often but make each post a milestone with a thesis and a number; reuse conference and podcast appearances |
| Coatue Management | 280 | 63 | 4.85 | image 22, video 17, document 12, article 4 | ~55 (54% ≥50; 16% ≥100) | 232 | [post](https://www.linkedin.com/posts/coatue_in-february-we-co-led-anthropics-series-activity-7465869305302196224-NJ7K) | Company page + LinkedIn newsletter + insights site | Highest cadence in the set (4.85/week); every post ties to a portfolio company or a founder TV clip; one-line hooks ('Intelligence is becoming a utility you pay for monthly'); newsletter and insights hub | Turn each research view into a one-line hook plus a chart or clip; run a newsletter from the company page |
| Altimeter Capital | 126 | 29 | 2.23 | article 10, image 6, video 2, text ~11 | ~40 (76% ≥20; 38% ≥50) | 354 | [post](https://www.linkedin.com/posts/altimeter-capital_small-team-big-ambition-every-summer-activity-7483897150100131840-4pLm) | Company page + founder Brad Gerstner (personal) + partners | Founder is the brand: Gerstner TV clips (122), AI policy views, personal posts (181 on Invest America); team-culture post best (354); partners interview portfolio CEOs (118) | Make Julien the public face: TV clips with a quote, a clear policy/market stance, partners interviewing companies |

**Sample posts**

| Author | Date | Format | Reactions | Comments | Shares | Post | Link |
|---|---|---|---|---|---|---|---|
| Coatue Management | 2026-05-28 | image | 232 | 2 | 14 | In February we co-led Anthropic's Series G. Today, we're co-leading their Series H... Run-rate revenue crossed $47 billion. Why we are tripling down. | [post](https://www.linkedin.com/posts/coatue_in-february-we-co-led-anthropics-series-activity-7465869305302196224-NJ7K) |
| Coatue Management | 2026-08-13 | image | 165 | 2 | 6 | Coatue first invested in Databricks in 2019. The pace of Databricks' execution continues to stand out. | [post](https://www.linkedin.com/posts/coatue_coatue-first-invested-in-databricks-in-2019-activity-7493751839570497536-ahvz) |
| Coatue Management | 2026-06-24 | video | 153 | 2 | 9 | Intelligence is becoming a utility you pay for monthly... Philippe Laffont joined CNBC's Squawk Box. | [post](https://www.linkedin.com/posts/coatue_philippe-laffont-on-cnbcs-squawk-box-activity-7475569597241380864-KbWm) |
| Coatue Management | 2026-07-23 | image | 136 | 3 | 3 | At the RAISE Summit in Paris, Max Cook shared some takeaways on the shift toward multi-model AI. | [post](https://www.linkedin.com/posts/coatue_at-the-raise-summit-in-paris-max-cook-shared-activity-7486147335702347776-jTrt) |
| Altimeter Capital | 2026-07-17 | image | 354 | 4 | 7 | Small team. Big ambition. Every summer, we take a brief moment to celebrate the people behind Altimeter... | [post](https://www.linkedin.com/posts/altimeter-capital_small-team-big-ambition-every-summer-activity-7483897150100131840-4pLm) |
| Altimeter Capital | 2026-07-16 | image | 131 | 3 | 2 | Congratulations to Altimeter Founder & CEO Brad Gerstner on being named to Observer's 2026 A.I. Power Index. | [post](https://www.linkedin.com/posts/altimeter-capital_congratulations-to-altimeter-founder-ceo-activity-7483582762902257664-m16k) |
| Altimeter Capital | 2026-09-11 | video | 122 | 11 | 5 | Scott Wapner opened by asking Brad Gerstner about the week's AI safety debate... | [post](https://www.linkedin.com/posts/altimeter-capital_scott-wapner-opened-by-asking-brad-gerstner-ugcPost-7504304229507911680-Dn8A) |
| Altimeter Capital | 2026-07-09 | image | 118 | 2 | 5 | Altimeter Partner Apoorv Agrawal sat down with Glean Founder & CEO Arvind Jain at RAISE Summit... | [post](https://www.linkedin.com/posts/altimeter-capital_altimeter-partner-apoorv-agrawal-sat-down-activity-7481092432130887680-onZn) |
| Brad Gerstner (Altimeter founder) | 2026-09-07 | image | 181 | 16 | 7 | The Social Security Act of 1935 is to labor what the Invest America Act / Trump Accounts are to capital... | [post](https://www.linkedin.com/posts/bradgerstner_the-social-security-act-of-1935-is-to-labor-activity-7502778602866941952-DbPa) |
| Brad Gerstner (Altimeter founder) | 2026-09-09 | text | 39 | 0 | 1 | Peace through strength. | [post](https://www.linkedin.com/posts/bradgerstner_the-west-has-a-deep-precision-strike-gap-ugcPost-7503530011795030016-yl33) |
| Whale Rock Capital | 2026-05-01 | image | 709 | 113 | 24 | May 1, 2026 marks Whale Rock's 20th year... manages over $14 billion for more than 450 investors... | [post](https://www.linkedin.com/posts/whale-rock-capital-management-llc_may-1-2026-marks-whale-rocks-20th-year-ugcPost-7455981839569104896-hTMt) |
| Whale Rock Capital | 2026-05-18 | image | 252 | 1 | 7 | Alex Sacerdote spoke at the 31st Annual Sohn Investor Conference... 'golden age of hardware'. | [post](https://www.linkedin.com/posts/whale-rock-capital-management-llc_whale-rock-ceo-and-portfolio-manager-alex-activity-7462252798181556224-kuRn) |
| Whale Rock Capital | 2026-06-02 | video | 244 | 4 | 5 | Alex Sacerdote featured at Sohn: the 'golden age of hardware investing'... | [post](https://www.linkedin.com/posts/whale-rock-capital-management-llc_whale-rocks-founder-and-portfolio-manager-ugcPost-7467704828232826880-hJAg) |
| Whale Rock Capital | 2026-08-03 | image | 233 | 5 | 1 | Our 2026 summer intern class wrapped up... projects ranging from robotics and power semiconductors to AI. | [post](https://www.linkedin.com/posts/whale-rock-capital-management-llc_this-past-friday-our-2026-summer-intern-activity-7490038602467332096-Aqwx) |
| Whale Rock Capital | 2026-06-09 | article | 142 | 0 | 2 | Grateful to Patrick O'Shaughnessy and the Invest Like the Best team for having Alex Sacerdote on the podcast. | [post](https://www.linkedin.com/posts/whale-rock-capital-management-llc_alex-sacerdote-how-to-invest-through-technology-activity-7470121869430624257-XZw2) |
| Glen Kacher (Light Street founder) | 2026-06-23 | text | 147 | 5 | 0 | Congratulations to my brother for his exemplary 36 years of service in the U.S. Navy... The Defense Tech opportunity... | [post](https://www.linkedin.com/posts/activity-7475250417921105920-VNLq) |

## Update (27 Oct): Monchau's tech posts vs his other posts (17 Jun – 17 Sep 2026)

| ≥ reactions | Tech posts | Tech share | Other posts | Other share | Tech lift |
|---|---|---|---|---|---|
| 25 | 200 | 0.738 | 543 | 0.696 | 0.06 |
| 54 | 151 | 0.557 | 407 | 0.522 | 0.068 |
| 100 | 99 | 0.365 | 281 | 0.36 | 0.014 |
| 200 | 46 | 0.17 | 166 | 0.213 | -0.202 |

| Period | Tech posts | All posts | Tech share |
|---|---|---|---|
| Jun 17-30 | 39 | 160 | 0.244 |
| Jul | 153 | 573 | 0.267 |
| Aug | 42 | 182 | 0.231 |
| Sep 1-16 | 37 | 136 | 0.272 |

| Post | Date | Format | Reactions | Comments | Shares | Note | Link |
|---|---|---|---|---|---|---|---|
| Morgan Stanley maps the AI infrastructure supply chain | 2026-07-28 | image | 2452 | 76 | 156 | Curated (Source: Milk Road); picks-and-shovels framing | [post](https://www.linkedin.com/posts/charles-henry-monchau-cfa-cmt-caia-4003096_morgan-stanley-just-mapped-out-the-entire-activity-7487933666971615233-ThPI) |
| AI-generated 'Champion of the Universe' video | 2026-07-02 | video | 1487 | 56 | 138 | Humour clip, AI as subject (Source: Laurent Lequeu) | [post](https://www.linkedin.com/posts/charles-henry-monchau-cfa-cmt-caia-4003096_these-ai-generated-videos-are-amazing-ugcPost-7478449831934373889-xN9F) |
| Bloodbath in IT outsourcing (Accenture, Indian IT) | 2026-06-19 | image | 680 | 76 | 46 | AI-disruption narrative with names and moves (Source: Bull Theory) | [post](https://www.linkedin.com/posts/charles-henry-monchau-cfa-cmt-caia-4003096_massive-bloodbath-in-the-it-outsourcing-sector-activity-7473592905933242368-Dg-w) |
| Ken Griffin: AI does a week of PhD work in hours | 2026-08-04 | video | 628 | 59 | 54 | Hedge-fund relevance: AI quant agents | [post](https://www.linkedin.com/posts/charles-henry-monchau-cfa-cmt-caia-4003096_ken-griffin-says-ai-can-now-do-a-weeks-worth-ugcPost-7490293667644022784-42nW) |
| AI spending boom consuming hyperscaler cash flows | 2026-06-26 | image | 608 | 52 | 36 | Data chart, capex vs FCF | [post](https://www.linkedin.com/posts/charles-henry-monchau-cfa-cmt-caia-4003096_the-ai-spending-boom-is-consuming-hyperscaler-activity-7476325916621770752-smtp) |
| Hyperscaler debt is exploding | 2026-09-13 | image | 230 | 15 | 21 | Data chart (Bloomberg, Hedgeye) | [post](https://www.linkedin.com/posts/charles-henry-monchau-cfa-cmt-caia-4003096_hyperscaler-debt-is-exploding-amazon-activity-7504939484937969664-4uAF) |
| Token demand doubled in a month (AI infra crash: zoom out) | 2026-09-02 | image | 206 | 28 | 19 | Contrarian reassurance after a sell-off | [post](https://www.linkedin.com/posts/charles-henry-monchau-cfa-cmt-caia-4003096_if-todays-crash-in-ai-infrastructure-stocks-activity-7500815918898274304-RTIZ) |
| Masayoshi Son sold 4% of Nvidia for under $4bn | 2026-09-02 | video | 163 | 5 | 9 | Short stat hook | [post](https://www.linkedin.com/posts/charles-henry-monchau-cfa-cmt-caia-4003096_masayoshi-son-sold-4-of-his-nvidia-stake-ugcPost-7501007438876172288-sasV) |
| AI agents use 1,400% more tokens than in February | 2026-09-07 | image | 145 | 6 | 13 | Memory-cycle angle ($MU, $SKHY) | [post](https://www.linkedin.com/posts/charles-henry-monchau-cfa-cmt-caia-4003096_ai-agents-are-using-1400-more-tokens-today-activity-7502795340476047360-LkXQ) |
| Dear Donald (oil + AI capex) | 2026-09-16 | image | 75 | 8 | 1 | His own synthesis; below his tech average | [post](https://www.linkedin.com/posts/charles-henry-monchau-cfa-cmt-caia-4003096_dear-donald-the-no-war-no-peace-with-iran-activity-7505921077903257600--Z_Y) |
| JPM: the largest AI borrowers are not weak credits | 2026-09-15 | image | 14 | 0 | 1 | Dense credit analysis; low engagement | [post](https://www.linkedin.com/posts/charles-henry-monchau-cfa-cmt-caia-4003096_the-largest-ai-borrowers-are-not-weak-credits-activity-7505634083658489857-lxSe) |

## Update (27 Oct): high-frequency tech voices like Monchau

| Voice | Posts 13w | Per week | Credit a source | Top post | Reactions | Link | Own posts? (signal) |
|---|---|---|---|---|---|---|---|
| Charles-Henry Monchau (benchmark) | 1051 | 80.8 | 0.863 | Pierce Brosnan photo (humour) | 17611 | [post](https://www.linkedin.com/posts/charles-henry-monchau-cfa-cmt-caia-4003096_the-camera-man-is-a-genius-for-those-activity-7505271378573594624-jGSn) | Curator: 86% credit a Source/via (907 of 1,051); text largely follows the cited account |
| Eduardo Ordax (AWS, GenAI GTM) | 250 | 19.2 | 0.108 | Vibe coder at 2AM (humour video) | 6837 | [post](https://www.linkedin.com/posts/eordax_ai-humor-ugcPost-7474863040736350209-PN7h) | Mostly own short commentary; humour clips posted natively without a credit line |
| Linas Beliūnas (fintech/AI) | 200 | 15.4 | 0.19 | Watch this Stanford lecture instead of Netflix | 16285 | [post](https://www.linkedin.com/posts/linasbeliunas_instead-of-watching-2-hours-of-netflix-tonight-ugcPost-7481787865924956160-4yUE) | Curates others' content but re-frames it in his own voice; 19% carry a credit |
| Ethan Mollick (Wharton) | 199 | 15.3 | 0.06 | New book: Co-Existence | 3928 | [post](https://www.linkedin.com/posts/emollick_i-have-a-new-book-coming-out-october-20-activity-7468411654381289472-oxlx) | Writes his own: first-hand tests and opinions; 6% credit others |
| Ruben Hassid (AI writing) | 177 | 13.6 | 0.186 | Don't post obvious AI-written content: 12 tells | 4400 | [post](https://www.linkedin.com/posts/ruben-hassid_dont-post-obvious-ai-written-content-activity-7486374672033316864-tYgN) | Own listicle templates with a lead magnet; repeatable format (production team not verifiable) |
| Brij Kishore Pandey (AI architect) | 158 | 12.2 | 0.19 | The cloud is not really a cloud (rack diagram) | 3516 | [post](https://www.linkedin.com/posts/brijpandeyji_the-cloud-is-not-really-a-cloud-behind-activity-7498739395370393600-WM3x) | Own explainer text over diagrams; ends with a question |
| Pascal Bornet (AI/automation author) | 151 | 11.6 | 0.106 | Friday software release (humour video) | 10707 | [post](https://www.linkedin.com/posts/pascalbornet_developerhumor-softwareengineering-releasemanagement-ugcPost-7503316540650360833-eue9) | Viral clips with his own caption; credits rare (11%) |
| Bernard Marr (futurist) | 121 | 9.3 | 0.066 | Why no one really understands AI | 207 | [post](https://www.linkedin.com/posts/bernardmarr_ai-hallucinate-unpredictably-activity-7483761636822953984-MJV6) | Own articles and newsletter excerpts, hashtag-heavy |
| Andreas Horn (AI, AIOps) | 117 | 9.0 | 0.12 |  |  |  | Not sampled; 12% credit others |
| Ronald van Loon (AI influencer) | 99 | 7.6 |  |  |  |  | Not sampled |
| Evan Kirstel (B2B tech) | 95 | 7.3 |  |  |  |  | Not sampled |
| Antonio Grasso (digital transformation) | 77 | 5.9 |  |  |  |  | Not sampled |

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

| Group | Fund | HQ | AUM | As of | Strategy | Why close | Status | LinkedIn | Source |
|---|---|---|---|---|---|---|---|---|---|
| Swiss | AtonRâ AI & Robotics AMC (+ 11 theme certificates, UCITS umbrella) | Geneva | Not disclosed per product |  | Conviction thematic tech/health/energy; research since 2004, proprietary indexes since 2014; AI/quant platform Fundy | Closest Swiss match on tech theme and hybrid method; long-only | Active (live post 30 Sep 2026; index gap since 30 Apr) | [page](https://www.linkedin.com/company/atonra) | [atonra.ch](https://www.atonra.ch/investment-funds/ai-robotics) |
| Swiss | DECALIA SICAV - Future SOCIETY | Geneva | EUR 139m | 2026-05-31 | Long-only multi-thematic growth (~52% IT, ~35% AI infrastructure); mid-cap/healthcare barbell | Most active Swiss boutique on LinkedIn; tech-tilted fund | Active | [page](https://www.linkedin.com/company/decalia-asset-management-sa) | [funds-static.pictet.com](https://funds-static.pictet.com/funds/decalia/factsheet/MR_ES_en_LU2407358063_YES_2026-05-31.pdf) |
| Swiss | Pictet - Robotics / Digital; Pictet TR - Atlas Titan | Geneva | Robotics EUR 13.0bn; Atlas Titan EUR 688m | 2026-10-26 | Thematic tech equities (discretionary); Atlas Titan discretionary global L/S | Incumbent; scale benchmark; Atlas Titan is the L/S analogue | Active | [page](https://www.linkedin.com/company/pictet-asset-management) | [am.pictet.com](https://am.pictet.com/ch/en/intermediaries/funds/pictet-robotics/LU1279334210) |
| International | Symbit Global Equity L/S | Zug | Not disclosed | launched Jul 2026 | AI-native: fundamental discretionary + proprietary AI (incl. investor sentiment); market-neutral, ~200% gross | Closest structural twin to TMS's hybrid model; generalist | Active (new) | [page](https://www.linkedin.com/company/symbit-capital) | [hedgeweek.com](https://hedgeweek.com/news/new-york-investment-veterans-launch-ai-native-hedge-fund-in-switzerland) |
| International | BIT Global Technology Opportunities | Berlin | Fund ~EUR 685-690m; firm EUR 3.0bn | Oct 2026 (aggregators, no as-of date) | Concentrated global tech / AI infra; data-driven; >75% of trades influenced by systematic signals; can short via CFDs/swaps | Same 'human x AI' hybrid; net-long bias; retail-heavy brand | Active | [page](https://www.linkedin.com/company/bit-capital-gmbh) | [bitcap.com](https://bitcap.com/en/fonds/bit-global-technology-opportunities) |
| International | U Access (IRL) Shannon River UCITS | New York (UBP Geneva platform) | USD 21.4m UCITS (may be share class); firm ~USD 905m | 2026-10-22 | Mid-cap tech L/S; ~half of longs second-order AI beneficiaries; net 20-50% | Sold through a Geneva private bank to the same Swiss buyers | Active fund; silent on LinkedIn | [page](https://www.linkedin.com/company/shannon-river-capital-management) | [ubp.com](https://www.ubp.com/en/asset-management/funds/ie00bkdrxc08) |
| International | Schroder GAIA Contour Tech Equity | New York | USD 860.9m | 2026-10-22 | TMT long/short; top-down + bottom-up; discretionary; SOFR+ target | Same shelf: tech L/S UCITS sold to Swiss/EU professionals | Active fund; silent on LinkedIn | [page](https://www.linkedin.com/company/contour-asset-management) | [finanzen.ch](https://www.finanzen.ch/fonds/schroder-gaia-contour-tech-equity-a1-lu1725199464) |
| International | Jericho Capital (flagship + Special Opportunities) | Los Angeles / New York | ~USD 10.1bn (third-party est. from ADV) | 2026 | Global TMT long/short, concentrated, discretionary | Leading pure-TMT L/S; aspirational benchmark | Active fund; silent on LinkedIn (press-only) | [page](https://www.linkedin.com/company/jericho-capital-asset-management-l-p) | [quiverquant.com](https://www.quiverquant.com/institutions/Jericho%20Capital%20Asset%20Management%20L.P./) |
| International | Wellington Disruptive Technology & Innovation | Boston | USD 10.6m (last data) | Mar 2021 | Global disruptive-tech long/short (bottom-up) | Category peer only | Appears closed: launched 27 Mar 2020, no current data, absent from wellington.com | [page](https://www.linkedin.com/company/wellington-management) | [investmentweek.co.uk](https://www.investmentweek.co.uk/news/4014116/wellington-launches-long-short-disruptive-tech-fund) |
| Taranis | Taranis Market Sentiment (TMS) | Geneva | Not shown |  | Tech L/S: 2016 systematic sentiment engine + Dec 2025 discretionary tech/AI-disruption sleeve (~50/50) | Subject | Active | [page](https://www.linkedin.com/company/taranis-sa) | [taranis.net](https://taranis.net/investment/tms) |

**Wider Swiss scan.** Only AtonRâ and Pictet run dedicated tech/AI products in Switzerland.

| Firm | Nearest fund | Strategy | Performance | LinkedIn/week | Page |
|---|---|---|---|---|---|
| Vontobel | Vontobel Fund II - Megatrends (multi-theme) | No dedicated tech/AI fund; multi-thematic megatrends | Public factsheets | 4.23 | [am.vontobel.com](https://am.vontobel.com/en/document/c2255db0-ed98-43fe-b3bc-7a1c89d838c8/Factsheet_20251231_EN_LU2275724008.pdf) |
| GAM | GAM Star Disruptive Growth | Long-only global growth around disruption, 40-60 stocks | Not on featured page | 3.15 | [gam.com](https://www.gam.com/en/funds/featured-funds/gam-star-disruptive-growth) |
| Bellevue | No tech fund (healthcare: Digital Health, AI Health) | Healthcare specialist | Full | 0.92 | [bellevue.ch](https://www.bellevue.ch/all-en/all/products/healthcare-investments/thematic/bellevue-digital-health/i-shares-usd) |
| Mirabaud | No tech/disruptive fund | European SMID and quality global equities | n/a (qualified gate) | 4.85 | [mirabaud-am.com](https://www.mirabaud-am.com/en/) |

## 4. Deliverable A: product-page teardown

The TMS gate (country → professional/retail → "I Accept") matches Schroders' and UBP's; what sits behind it does not.

| Attribute | AtonRâ | DECALIA | Pictet AM | Symbit | BIT Capital | Shannon River (UBP) | Contour (Schroders) | Jericho | Wellington DTI | Taranis TMS |
|---|---|---|---|---|---|---|---|---|---|---|
| Structure | Theme page: description, monthly performance grid, statistics, holdings, risks; sidebar with price, ISIN, factsheet, KIID | Strategy themes on corporate site; fund pages on separate gated SICAV site | Standard microsite per share class: key info, objective, process, performance, risk, portfolio, literature | Firm one-pager: vision, origin story, team cards; no fund page | Hero, strategy, NAV tiles, share-class tabs (performance, risk, fund details), documents, factsheet subscribe, contact | UBP data page: Performance / Library / Key information tabs; manager has no own site | Schroders tabs (overview, risk, performance, allocation, facts, documents) + 1-page contourasset.com | Holding page: addresses and founder bio | No current fund page found | One heading, three paragraphs, award line, disclaimer |
| Navigation / languages | 2-3 clicks, no gate; English seen | 3+ clicks plus gate; EN/FR/DE/IT | 3+ clicks, audience in URL; EN/FR/DE/IT | 1 page; English | 2 clicks, no hard gate; EN/DE | Gate then tabs; EN/FR/DE | Gate then tabs (Schroders); EN | 1 page; English | n/a | 2 clicks plus gate; English only |
| Fund facts shown | ISIN, inception, ccy, price; fees in factsheet | In public factsheet (ISIN, inception, fees via FT) | NAV, size, inception, SFDR, SRI, benchmark | None | ISIN, WKN, PMs, terms, allocations | NAV, AUM, ISIN, fees, min, dealing | ISIN, inception, OCF, perf fee | None | n/a | None (no ISIN, vehicle, fees, AUM) |
| Performance disclosure | Full (YTD on page; monthly 2019-2026 in factsheet) | Full (public factsheet) | Full on page vs benchmark | None | Full, public (NAV, charts, rolling 12m) | Full after gate (MTD to ITD) | Full after gate (annual, 5y, factsheet) | None | n/a | None (award line only) |
| Documents | Factsheet, KIID | Factsheet public; KID/prospectus gated | Factsheet, KID, prospectus, reports, SFDR | None | KID, factsheet subscription; reports for UCITS | KID, prospectus, annual/semi-annual reports | Monthly factsheet, KID, prospectus, annual report | None | n/a | None |
| Team visibility | Team page with LinkedIn links | PMs in factsheet and press | PM names in docs; none on LinkedIn | High: 4 founders with LinkedIn links | Named PMs, team page, Chief AI Officer | None on page | PM only (Schroders); ~15 bios (Contour site) | Founder bio | n/a | None on fund page |
| Strategy in own words | AI pure players across semiconductors, data, software, robotics | Multi-thematic, innovative sectors and disruptive companies | Active, high-conviction stock picking | Human experience and machine intelligence, working together | Institutional core vehicle of a global technology strategy | No strategy text on page | Exploit rapidly evolving trends within TMT | Investing in global TMT | n/a | Fundamental picks with a quantitative overlay on risk appetite |
| Differentiators claimed | Research since 2004; 1,300-sub-sector taxonomy; Fundy AI/quant platform | Multi-thematic, ESG, mid-cap bias, barbell | Scale, 30-year thematic franchise, ESG | Ex-NBIM PMs; AI-native platform | >30,000 data signals/day; >75% of trades signal-influenced; human final say | Mid-cap inflection points; AI second-order | Alpha not beta; fastest pace of change since the 1990s | Concentration; track record (press) | n/a | Behavioural sentiment algorithm + fundamentals; long/short |
| Systematic vs discretionary | Hybrid | Discretionary | Discretionary (Atlas adds quant indicators) | Hybrid (AI + discretionary) | Hybrid (signals + human) | Discretionary | Discretionary | Discretionary | Discretionary | Hybrid (~50/50 sleeves, not stated on page) |
| Target audience / tone | Broad; marketing-heavy | Private + institutional; factual | Segmented; regulatory | Allocators; brand-led | Professional (AIF) but retail brand; marketing with data | Professional; data-only | Qualified investors; legal (Schroders) / thesis (Contour) | Allocators via press | n/a | Qualified/professional CH/UK; short, low information |
| Investor gate | None | Investor category + country | Profile selector in URL | None (no fund info) | None (marketing banner) | Not-US + country + profile + legal | Swiss qualified-investor 'I agree' | None | n/a | Country, then professional/retail, then I Accept |
| Primary CTAs | Factsheet, KIID, contact, WhatsApp | Discover funds, newsletter | Download factsheet / NAV / literature | LinkedIn links | Invest now (brokers), factsheet, podcast | Login, newsletter | Watchlist, download; 'Get in touch' | Email, phone | n/a | Contact only |
| Primary source | [atonra.ch](https://www.atonra.ch/investment-funds/ai-robotics) | [decalia.com](https://www.decalia.com/en-ch/funds/) | [am.pictet.com](https://am.pictet.com/ch/en/intermediaries/funds/pictet-robotics/LU1279334210) | [symbit.com](https://www.symbit.com/welcome) | [bitcap.com](https://bitcap.com/en/fonds/bit-global-technology-opportunities) | [ubp.com](https://www.ubp.com/en/asset-management/funds/ie00bkdrxc08) | [contourasset.com](https://www.contourasset.com/index) | [jerichocap.com](https://www.jerichocap.com) | [investmentweek.co.uk](https://www.investmentweek.co.uk/news/4014116/wellington-launches-long-short-disruptive-tech-fund) | [taranis.net](https://taranis.net/investment/tms) |

**Positioning summaries**

- **AtonRâ Partners** ([atonra.ch](https://www.atonra.ch/investment-funds/ai-robotics)): Sells thematic tech as 12+ single-theme certificates plus a UCITS umbrella, backed by research since 2004, a 1,300-sub-sector taxonomy and the Fundy AI/quant platform. Ungated pages show price, YTD and ISIN; the factsheet has monthly returns and fees. Closest Swiss peer on tech theme and hybrid method, but long-only and broad in tone.
- **DECALIA** ([funds-static.pictet.com](https://funds-static.pictet.com/funds/decalia/factsheet/MR_ES_en_LU2407358063_YES_2026-05-31.pdf)): A EUR 139m long-only multi-thematic growth UCITS now ~52% IT and ~35% AI infrastructure. Markets through PM interviews and multilingual corporate pages; the fund site is gated but full-performance factsheets are public. Tech is real exposure but not the brand.
- **Pictet Asset Management** ([am.pictet.com](https://am.pictet.com/ch/en/intermediaries/funds/pictet-robotics/LU1279334210)): The scale benchmark: Robotics EUR 13bn, Digital USD 4.3bn, each with a standardised data-dense page and full document library. Regulatory tone, no personal voices. TR-Atlas Titan (EUR 688m) is its discretionary L/S, not tech-specific.
- **Symbit Capital** ([symbit.com](https://www.symbit.com/welcome)): A Zug startup (Jul 2026) running an AI-native market-neutral L/S built by ex-NBIM PMs. Brand-led one-pager that leads with founders and a 'human + machine' philosophy, with no fund data. The closest structural twin to TMS, without a track record.
- **BIT Capital** ([bitcap.com](https://bitcap.com/en/fonds/bit-global-technology-opportunities)): Turns its data/AI edge into numbers (signals per day, petabytes, % of trades influenced) with a human-in-the-loop line, and publishes NAV, charts and factsheets openly. Strongest storytelling of the hybrid model; retail-heavy brand and net-long bias.
- **Shannon River** ([ubp.com](https://www.ubp.com/en/asset-management/funds/ie00bkdrxc08)): A mid-cap tech L/S distributed as a UCITS on UBP's Geneva platform. The platform page is data-only (full performance after the gate); the manager has no website of its own and does not post.
- **Contour (Schroder GAIA)** ([contourasset.com](https://www.contourasset.com/index)): A USD 861m TMT L/S UCITS on the Schroder GAIA platform. Schroders publishes full returns and documents behind a Swiss qualified gate; Contour's own one-pager gives the thesis and ~15 team bios. Purely discretionary; silent on LinkedIn.
- **Jericho Capital** ([jerichocap.com](https://www.jerichocap.com)): The leading US TMT L/S (~USD 10bn) with a bare holding website. Markets through allocator relationships and press (Institutional Investor), not its own channels.
- **Wellington DTI** ([investmentweek.co.uk](https://www.investmentweek.co.uk/news/4014116/wellington-launches-long-short-disruptive-tech-fund)): Launched in 2020 as a disruptive-tech L/S UCITS; last data USD 10.6m (Mar 2021) and no longer listed on wellington.com, so it appears closed. Kept only as a category reference.
- **Taranis TMS** ([taranis.net](https://taranis.net/investment/tms)): The only tech L/S with a behavioural-sentiment quant overlay in the set, but the gated page shows no ISIN, fees, AUM, performance, documents or team and does not state its two sleeves. Its only proof point is a 2023 'Managed Futures' award. Peers behind the same kind of Swiss gate (Schroders, UBP) show full performance.

## 5. Deliverable B: LinkedIn activity (17 Jun – 17 Sep 2026)

**Posts per week, every account** (axis note: Monchau 80.8/week is off any shared scale).

| Account | Group | Channel | Posts, 13w | Per week | Note |
|---|---|---|---|---|---|
| Charles-Henry Monchau (Syz CIO) | Benchmark | Individual | 1051 | 80.8 |  |
| Ethan Mollick | Tech voice | Individual | 199 | 15.3 |  |
| Wellington Management (parent) | Parent | Company page | 116 | 8.9 |  |
| Schroders (parent, Contour's platform) | Parent | Company page | 112 | 8.6 |  |
| Pictet Asset Management | Swiss competitor | Company page | 89 | 6.85 | corporate-heavy |
| Syz Group | Benchmark | Company page | 73 | 5.6 |  |
| Bill Gates | Tech voice | Individual | 68 | 5.2 |  |
| Mirabaud Group | Swiss peer | Company page | 63 | 4.85 |  |
| Vontobel | Swiss peer | Company page | 55 | 4.23 |  |
| Allie K. Miller | Tech voice | Individual | 53 | 4.1 |  |
| GAM Investments | Swiss peer | Company page | 41 | 3.15 |  |
| Reid Hoffman | Tech voice | Individual | 31 | 2.4 |  |
| DECALIA | Swiss competitor | Company page | 30 | 2.31 |  |
| Satya Nadella | Tech voice | Individual | 24 | 1.8 |  |
| AtonRâ 2025 same window (reference) | Swiss competitor | Company page | 15 | 1.15 | 17 Jun-17 Sep 2025 |
| Andrew Ng | Tech voice | Individual | 14 | 1.1 |  |
| Aravind Srinivas | Tech voice | Individual | 13 | 1.0 |  |
| Bellevue Asset Management | Swiss peer | Company page | 12 | 0.92 |  |
| BIT Capital | International competitor | Company page | 11 | 0.85 |  |
| DECALIA key people (4) | Swiss competitor | Individuals | 8 | 0.62 | CIO Quirighetti carries most |
| Jan Beckers (BIT founder/PM) | International competitor | Individual | 2 | 0.15 |  |
| Symbit Capital | International competitor | Company page | 2 | 0.15 |  |
| Symbit founders (4 people combined) | International competitor | Individual | 2 | 0.15 |  |
| Taranis | Taranis | Company page | 2 | 0.15 |  |
| Julien Leegenhoek (Taranis CEO) | Taranis | Individual | 1 | 0.08 |  |
| AtonRâ key people (6) | Swiss competitor | Individuals | 1 | 0.08 | index likely incomplete |
| Shannon River Capital Mgmt | International competitor | Company page | 0 | 0 |  |
| Jericho Capital | International competitor | Company page | 0 | 0 |  |
| Contour (David Meyer) + Jericho (Josh Resnick) | International competitor | Individual | 0 | 0 |  |
| AtonRâ Partners | Swiss competitor | Company page | 0 | 0 | index gap: live posts exist (e.g. 30 Sep 2026) |
| Pictet AM thematic PMs (4) | Swiss competitor | Individuals | 0 | 0 |  |

**Per competitor**

| Competitor | Channel | Posts/week | Dominant format | Original vs curated | Median | Best | Link | What Taranis can learn / gap |
|---|---|---|---|---|---|---|---|---|
| AtonRâ Partners | Company page + staff (BD lead) | ~1.15 est. (0 indexed) | Image + long-form thesis | Original (13 of 15 2026 posts); own research links; 0 'Source' | ~6 | 10 | [post](https://www.linkedin.com/posts/atonra_thematicinvesting-atonra-chinatech-activity-7444624629765214209-6YMx) | Owns the original tech-thesis format but gets 0-10 reactions under a brand page and puts YTD numbers in posts. Gap: the same theses from a named founder, compliant. |
| DECALIA | Company page + CIO Fabrizio Quirighetti | 2.31 | Mixed: document 9, image 7, article 7, video 6 | 73% original; 0 'Source' | ~14 | 63 | [post](https://www.linkedin.com/posts/decalia-asset-management-sa_decalia-teamspirit-cycling-activity-7493591569711755264-pQqi) | Sets the Swiss boutique bar (~2/week, FR/EN, people and events). The CIO outdraws the page (153 vs 63). Gap: only 13% tech/AI. |
| Pictet Asset Management | Company page; thematic PMs silent | 6.85 | Image 47, video 24 of 89 | 76% original; 1 'Source' | ~25 | 147 | [post](https://www.linkedin.com/posts/pictet-asset-management_today-the-pictet-group-announced-the-figures-activity-7499022732894855168-PQMN) | Production quality and a risk warning on product posts; AI ETF launch did well (141). Gap: no named tech PM voice. |
| Symbit Capital | Founders (page gets 0) | 0.15 page + 0.15 founders | Short quote-reshare | Original | 0 (page) | 108 (founder) | [post](https://www.linkedin.com/posts/marius-skrondal_we-just-wrapped-a-week-on-the-road-meeting-activity-7474749100635176960-0GyQ) | Same news: page 0 reactions vs co-founder 108. Lead through individuals. |
| BIT Capital | Company page + founder podcasts | 0.85 | Image + long German text + disclaimer | Original; podcast-led | ~107-137 (top 4) | 195 | [post](https://www.linkedin.com/posts/bit-capital-gmbh_bitcapital-technologyinvesting-ucits-activity-7470861891536355330-zCqW) | Turns performance milestones and founder podcasts into posts with a disclaimer each time. Gap: German-only. |
| Shannon River | Company page exists (161 followers), no posts | 0 | none | n/a | n/a |  | [page](https://www.linkedin.com/company/shannon-river-capital-management) | Silent (confirmed by live search 27 Oct). |
| Contour (Schroder GAIA) | None; Schroders mentions Contour/GAIA 2x ever | 0 | none | n/a | n/a |  | [page](https://www.linkedin.com/company/contour-asset-management) | Silent; employees only (live search 27 Oct). |
| Jericho Capital | None; press coverage reshared by others | 0 | none | n/a | n/a |  | [post](https://www.linkedin.com/posts/institutional-investor_jerichos-high-conviction-playbook-shows-activity-7477818522937663489-RhMU) | Press-only presence (Institutional Investor); no own posts found live. |
| Wellington (parent) | Company page; DTI fund not mentioned | 8.9 | Image; HR and corporate | Original | n/a | 555 | [post](https://www.linkedin.com/posts/wellington-management_we-are-pleased-to-announce-that-john-norberg-activity-7470452261069049856-7Bil) | Corporate cadence context only. |
| Taranis | Company page reshares CEO TV clips | 0.15 | Video / article (BFM clips) | Reshares of CEO's own posts | ~14 | 52 | [post](https://www.linkedin.com/posts/taranis-sa_emergingmanagers-hedgefunds-alternativeinvestments-ugcPost-7429190604317753344-mL-E) | Lowest active cadence; CEO's own posts (48-64) beat the page's reshares (14). |

## 6. Monchau deep-dive

[Profile](https://www.linkedin.com/in/charles-henry-monchau-cfa-cmt-caia-4003096) · Crustdata person 28667460 · voice: curator first, educational, data-driven; cautious on rates, constructive on AI; broadcast style.

**a. Posts per day by month**

| Month | Posts | Days | Per day |
|---|---|---|---|
| 2026-Q1 (Jan-Mar) | 491 | 90 | 5.46 |
| 2026-04 | 226 | 30 | 7.53 |
| 2026-05 | 224 | 31 | 7.23 |
| 2026-06 | 353 | 30 | 11.77 |
| 2026-07 | 573 | 31 | 18.48 |
| 2026-08 | 182 | 31 | 5.87 |
| 2026-09 (1-16) | 136 | 16 | 8.50 |

**b. Curated vs own view** (share reaching 54+ reactions)

| Segment | Posts | ≥54 | Share | Definition |
|---|---|---|---|---|
| Curated (credits a 'Source') | 1074 | 634 | 0.590 | text contains 'Source' |
| Not source-credited | 170 | 58 | 0.341 | all posts minus curated |
| Own view / Syz-branded | 78 | 4 | 0.051 | text contains 'my take' or 'our view' or 'Syz' |

**c. Topic mix** (Sep 1–16 hand-coded reference from the brief, n=136; Jun–Sep keyword counts, n=1,244)

| Topic | Sep posts | Sep share | Jun–Sep posts | Jun–Sep share |
|---|---|---|---|---|
| Tech / AI | 40 | 0.294 | 328 | 0.264 |
| Macro / rates | 38 | 0.279 | 180 | 0.145 |
| Energy | 29 | 0.213 | 150 | 0.121 |
| Crypto | 5 | 0.037 | 61 | 0.049 |

**d. Reaction distribution**

| ≥ reactions | Posts | Share |
|---|---|---|
| 25 | 901 | 0.724 |
| 40 | 777 | 0.625 |
| 54 | 692 | 0.556 |
| 70 | 601 | 0.483 |
| 100 | 487 | 0.391 |
| 200 | 279 | 0.224 |

**e. Engagement by format** (median estimated from threshold counts, Jun 1 – Sep 16)

| Format | Posts | Median (est.) | Share ≥54 | Brief Sep ref. | Note |
|---|---|---|---|---|---|
| Video | 78 | ~300 | 0.756 | ~130 | Only 4 of 23 own-original videos reach 54; the high median comes from viral reshared clips |
| Image | 1112 | ~66 | 0.565 | 54 | 92% of originals; most reliable format |
| Document | 45 | ~25 | 0.089 | 25 | PDF carousels underperform |
| Article | 2 | n/a (n=2) | 0.0 | 24 | Too few to measure |

**Sample posts**

| Post | Reactions | Note | Link |
|---|---|---|---|
| My take on FOMC | 19 | Own view on the Fed | [post](https://www.linkedin.com/posts/charles-henry-monchau-cfa-cmt-caia-4003096_my-take-on-yesterdays-fomc-as-expected-activity-7506098378204708865-eZr7) |
| Dear Donald (oil + AI capex) | 75 | Synthesis: Brent supply shock + hyperscaler debt competing with Treasuries | [post](https://www.linkedin.com/posts/charles-henry-monchau-cfa-cmt-caia-4003096_dear-donald-the-no-war-no-peace-with-iran-activity-7505921077903257600--Z_Y) |
| JPM: largest AI borrowers | 14 | Curated (Source: JPM); 1 share in index, so 'most-shared' not borne out | [post](https://www.linkedin.com/posts/charles-henry-monchau-cfa-cmt-caia-4003096_the-largest-ai-borrowers-are-not-weak-credits-activity-7505634083658489857-lxSe) |
| Hyperscaler debt is exploding | 230 | Best tech chart post; 21 shares | [post](https://www.linkedin.com/posts/charles-henry-monchau-cfa-cmt-caia-4003096_hyperscaler-debt-is-exploding-amazon-activity-7504939484937969664-4uAF) |
| Pierce Brosnan photo (humour) | 17611 | Viral outlier | [post](https://www.linkedin.com/posts/charles-henry-monchau-cfa-cmt-caia-4003096_the-camera-man-is-a-genius-for-those-activity-7505271378573594624-jGSn) |

## 7. Famous tech voices

| Voice | Posts/week | Top formats | Best | Link | What to borrow |
|---|---|---|---|---|---|
| Bill Gates | 5.2 | Video + photo | 42692 | [post](https://www.linkedin.com/posts/williamhgates_happy-birthday-warren-buffett-warren-ugcPost-7499851761705218048-XbDk) | Personal relationship stories and short field-trip videos; warmth over data |
| Satya Nadella | 1.8 | Text-only + one photo | 18107 | [post](https://www.linkedin.com/posts/satyanadella_delivery-day-at-our-microsoft-dcs-as-the-ugcPost-7496695636868726785-Pjuo) | Results-day post in his own words with 3-4 hard numbers and a framework; physical-milestone photo |
| Andrew Ng | 1.1 | Article/link + video | 14177 | [post](https://www.linkedin.com/posts/andrewyng_new-a-map-of-the-most-important-skills-in-ugcPost-7494067762659512320-76O2) | Low volume; every post is a useful artifact (a map / a launch); one-line hook |
| Ethan Mollick | 15.3 | Image + text-only | 3928 | [post](https://www.linkedin.com/posts/emollick_i-have-a-new-book-coming-out-october-20-activity-7468411654381289472-oxlx) | Daily first-hand tests of new AI models with a clear verdict and some dry humor |
| Aravind Srinivas | 1.0 | Video demo + image | 2935 | [post](https://www.linkedin.com/posts/aravind-srinivas-16051987_we-built-a-replacement-for-aws-dynamodb-activity-7505723706539716608-4WuL) | Builder proof: what we built and the dollar impact in two sentences |
| Allie K. Miller | 4.1 | Video tutorial + numbered list | 2362 | [post](https://www.linkedin.com/posts/alliekmiller_if-your-barrier-to-building-an-app-was-code-ugcPost-7472370024033423360-MmLu) | Early-access hands-on review in a numbered list; weekend homework series |
| Reid Hoffman | 2.4 | Video clips from his podcast | 2297 | [post](https://www.linkedin.com/posts/reidhoffman_satya-nadella-described-a-future-at-microsoft-ugcPost-7475668981039955969-9UKc) | Cut long-form interviews into 60-90s clips with one takeaway paragraph |

## 8. SWOT

| | |
|---|---|
| **Strengths** | The only tech L/S with a behavioural-sentiment overlay in the set; founder-CEO with BFM Business airtime whose own posts beat the page (64 vs 14); award history; clear AI-disruption thesis. |
| **Weaknesses** | 0.15 posts/week, lowest among active peers; page mirrors TV clips; French-only recent posts; 1,976 followers; product page shows nothing; "Managed Futures" award label. |
| **Opportunities** | Close competitors silent on LinkedIn; no Swiss tech-AI personal voice with reach; a proprietary weekly sentiment read no peer can copy. |
| **Threats** | BIT and AtonRâ already tell the human + AI story with numbers; Symbit occupies "Swiss + AI + L/S"; Pictet markets AI-enhanced equity at scale; FinSA limits public performance talk. |

## 9. Recommendations and operating plan

| Lever | Recommendation | Target/week | Evidence |
|---|---|---|---|
| 1. Lead through Julien (Altimeter-style) | Julien is the public face: 60-90s BFM clips with one quoted line, a clear stance on the AI cycle; a partner interviews companies or allocators | 3 | Altimeter's Gerstner clips 120+ reactions; Taranis page 14 vs Julien 64 |
| 2. One-line thesis + chart (Coatue-style) | Open every post with one claim and one chart or clip; Monday TMS sentiment-gauge chart as the signature | 1 | Coatue's best posts pair a thesis line with a portfolio fact or TV clip (136-232 reactions) |
| 3. Cadence 3-5 posts/week | ~3 from Julien + ~2 from the company page | 5 | Altimeter 2.23/week, Coatue 4.85/week, DECALIA 2.3/week; Taranis 0.15 |
| 4. Milestones as events (Whale Rock-style) | Awards, anniversaries, conferences, podcasts posted with a thesis and a number |  | Whale Rock's 7 posts average ~243 reactions; 20th-anniversary letter 709 |
| 5. Own voice over curation; tech as core lane | ~80/20 original to curated; English first, French second |  | Monchau tech posts only +7% vs his average; own-voice tech creators (Mollick, Pandey) credit others in 6-19% of posts |
| 6. Fix the product page | Two sleeves and weights, named PMs, vehicle/ISIN/fees/liquidity, gated factsheet, 'request factsheet' CTA, relabel the award |  | TMS page shows three paragraphs; Coatue runs an insights hub beside a gated investor area |
| 7. Compliant by design | One-line risk warning on fund posts; no performance in posts; pre-approved chart template |  | FinSA limits public performance talk |

**Measure monthly** by re-running the free count queries once the index catches up. Three-month targets: company page ≥2.3 posts/week; Julien ≥1 original thesis/week; median ≥25 reactions on Julien's originals.
