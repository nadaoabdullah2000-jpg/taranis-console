# Step 2: Product-page teardown (TMS vs. top-5 competitors)

Research date: 2026-10-26. I read pages behind investor gates with TinyFish browser automation, logging in as a Swiss professional/qualified investor.

## Summary grid

| Fund | Product page URL | Gate | Strategy text depth | Performance disclosure | Team visibility | CTAs | Source |
|---|---|---|---|---|---|---|---|
| **TMS (Taranis)** | https://taranis.net/investment/tms | Country select (CH / UK / Other), then Professional vs Retail, then "I Accept" legal box | Short: 3 paragraphs | **None** (no numbers, NAV, factsheet or documents; only an award mention) | None on the fund page; the /team page shows little | Navigation and "Contact" only; no request-info or factsheet CTA | taranis.net (automation run 4f5b12b9) |
| BIT Global Technology Opportunities | https://bitcap.com/en/fonds/bit-global-technology-opportunities | **No hard gate.** "Marketing Information" banner; product list says "Nur für professionelle Anleger" | Medium, plus a rich firm-level AI/data story | NAV, return p.a. and volume widgets (loaded by script), performance charts, rolling 12m, risk metrics, KID download, "Subscribe to Factsheet" | High (named PMs; team page; Chief AI Officer stats) | "Invest now" broker picker (19 German brokers), contact form, factsheet subscription | bitcap.com |
| Schroder GAIA Contour Tech Equity | Schroders CH professional fund centre (C Acc USD), plus contourasset.com | Schroders: Swiss qualified-investor "I agree". Contour site: no gate | Schroders: legal objective only. Contour: 4 paragraphs of thesis | **Full**: discrete annual returns, 5y cumulative, price chart, monthly factsheet PDF, KID, prospectus, annual report | Contour site: full bios for about 15 staff. Schroders: PM name and tenure only | Schroders: watchlist, download price, compare. Contour: "Get in touch" | Schroders automation run 752f9e33; https://www.contourasset.com/index |
| Symbit Global Equity L/S | https://www.symbit.com/welcome (firm page only) | None (no fund information to gate) | Philosophy only, no fund terms | **None** | High: 4 people with bios and LinkedIn links | LinkedIn links only | symbit.com |
| U Access (IRL) Shannon River UCITS | https://www.ubp.com/en/asset-management/funds/ie00bkdrxc08 | UBP: "not a US resident", then country and investor profile, then legal | **None on page** (data only) | **Full** after the gate: NAV, MTD/YTD/1y/3y/5y/ITD, chart, plus KID, prospectus and annual report downloads | None on the page; the manager has **no website of its own** that I could find | Back to list, My Access login, newsletter | ubp.com; https://www.ubp.com/modules/ubp-funds/document?uuid=8ec02869-6bd9-4672-b2ac-cc38f9a53e8e&language=zh&isin=IE00BKDRXG46&documentName=U%20Access%20(IRL)%20Shannon%20River%20UCITS_Monthly%20Report_2024-08_EN.pdf |
| Jericho Capital | https://www.jerichocap.com | None | **None** (holding page) | **None** | Founder bio only | Email and phone | jerichocap.com |

---

## 0. Taranis Market Sentiment (baseline)
**URL:** https://taranis.net/investment/tms (the parent page https://taranis.net/investment is not gated)

| Element | Finding | Source |
|---|---|---|
| Gate | Step 1: "Please select your country of residence": Choose country / Switzerland / United Kingdom / Other. Step 2: "Are you a 'Professional / Qualified' or 'Private / Retail investor'?" Step 3: legal box ending "By clicking 'I Accept' you confirm…". | Automation run 4f5b12b9 on taranis.net/investment/tms |
| Gate wording (key lines) | "strictly only for qualified and professional investors who are resident in Switzerland and United Kingdom only"; "does not constitute a public offer, solicitation or recommendation"; "Taranis SA cannot take any responsibility for individuals accessing this website by giving false information as to their domicile or client type" | same |
| Structure | One heading: **"Taranis Market Sentiment — Long/Short Technology"**, then 3 paragraphs and an award line. No sub-sections. | same |
| Positioning (verbatim) | "a long/short equity strategy focused on technology: semiconductors, AI infrastructure, space, defense tech and selected hardware. It combines fundamental stock picking with a quantitative overlay on risk appetite and positioning." / "The developed algorithm conducts predictive analyses based on the financial market sentiment, optimism and pessimism, risk appetite and, ultimately, the Investors' behavioral language." / "With high liquidity and a unique behavioral approach… competitive risk/return profile" | same |
| Parent-page positioning | "uses alternative data and a systematic overlay to read risk appetite and positioning, not only classic fundamentals, across technology, semiconductors, AI infrastructure and space." The page also states FINMA, FinIA and SO-FIT status. | https://taranis.net/investment |
| Performance | **None.** No returns, NAV, AUM, factsheet, KID or monthly report. The only credential is "Managed Futures Newcomer of the Year 2023" (HFM European Performance Awards), plus "Past performance is not indicative of future results." | Automation run 4f5b12b9 |
| Fund terms | None shown (no ISIN, vehicle, domicile, fees, liquidity, launch date or AUM). | same |
| Team | None on the fund page. A plain fetch of /team returned only "Christian Wolf, Compliance & Risk Officer"; other names may sit in a script-rendered carousel. | https://taranis.net/team |
| CTAs | Site navigation, Contact (investments@taranis.net, +41 22 318 43 90, Rue du Marché 7, Geneva) and LinkedIn. No "request factsheet", data-room or booking CTA. | Automation run 4f5b12b9 |
| Observations | The award label "Managed Futures" does not match the current long/short-tech positioning. The page does not mention the ~50/50 split between the systematic and discretionary sleeves, or the Dec 2025 discretionary launch. | — |

## 1. BIT Global Technology Opportunities (BIT Capital)
**URLs:** https://bitcap.com/en/fonds/bit-global-technology-opportunities ; firm page https://bitcap.com/en ; flagship UCITS https://bitcap.com/en/fonds/bit-global-technology-leaders

| Element | Finding | Source |
|---|---|---|
| Gate | **No hard gate.** Pages carry a "[ Marketing Information ]" banner. The product list tags the AIF "Nur für prossionelle Anleger" (sic). The legal notice is directed "exclusively at persons in countries where the mentioned funds are authorized for public distribution", with a US-person exclusion. | https://bitcap.com/en/investmentprodukte ; fund page |
| Structure | Hero (name, tagline "Global core portfolio of structural technology winners"), then Investment Strategy, then NAV / Annual yield / Volume tiles, then a share-class tab for each class (I, I-IV) holding Performance / Price / Rolling 12m / Performance & Risk Metrics, Info (ISIN, WKN, PMs), SRI, Fund Details, Terms, Asset classes, Currencies, Region & Sector allocation, Opportunities, Risks, then Fund Documents (KID), Subscribe to Factsheet, Invest now, Contact, Legal Notice. | fund page |
| Positioning (verbatim) | "the institutional core vehicle of BIT Capital's global technology strategy… invests in a concentrated manner in global technology and AI infrastructure companies based on a proprietary, data-driven research process… may selectively build short positions in companies via CFDs and swaps" | fund page |
| Firm-level AI story | "Human x AI Co-Intelligence… the final decision is always made by a human being"; ">30.000 alternative data signals analyzed daily"; "3.1 PB of data processed daily"; ">1 bn tokens in more than 30 LLM and LRM processes per month"; ">75% of all trades are now influenced by systematic data signals and models"; "AI-native investment platform". Also "High Performance Picks" case studies (Micron, IREN, etc.) with Thesis / Edge / Signal / Key Move. | https://bitcap.com/en |
| Performance | **Public**: NAV, return p.a. and volume widgets, since-inception charts, rolling 12m, risk metrics. The flagship UCITS has downloadable monthly factsheets for each share class, plus annual and semi-annual reports and the prospectus. The homepage discloses ~30% volatility and the 12-month range (+147% / −42%). | fund pages; https://bitcap.com/en |
| Team | PMs named (Jan Beckers, Carlos Bielsa). The flagship page shows a quote from Ingo Lupatelli (Director Research & PM). There is a separate /team page. | fund pages |
| CTAs | "Invest now" broker selector (Scalable, comdirect, ING and others), contact form, "Subscribe to Factsheet", newsletter, podcast ("Beckers Bets"). | fund page |
| Takeaway for TMS | This is the best example of turning a data/AI edge into marketing proof: metrics (signals per day, petabytes, % of trades influenced), case studies and a human-in-the-loop line. TMS has the same story but tells none of it. | — |

## 2. Schroder GAIA Contour Tech Equity
**URLs:** Schroders CH professional fund centre: https://www.schroders.com/en-ch/ch/professional/fund-centre/?language=en&location=ch&channel=professional&clientId=schdr&clientVersion=v1&externalId=SCHDR_F00000ZZ97&r=%2Ffund%2FSCHDR_F00000ZZ97%2F&fundName=Schroder-GAIA-Contour-Tech-Equity-C-Accumulation-USD ; manager site: https://www.contourasset.com/index

| Element | Finding | Source |
|---|---|---|
| Gate (Schroders CH) | "I agree" to: "Schroder Investment Management (Switzerland) AG ('SIMSAG') webpages are aimed exclusively at qualified investors with their registered office or residence in Switzerland… also contains information about collective investment schemes which are not approved for distribution to non-qualified investors in Switzerland." The UK intermediary site says "This marketing material is for professional clients or advisers only." | Automation run 752f9e33; Schroders UK page |
| Structure (Schroders) | Tabs: Overview, Risk Considerations, Performance, Asset Allocation, Fund Facts, Documents, Insights, Important information. | Automation run 752f9e33 |
| Positioning | Schroders uses the legal objective only: "positive return after fees… over a three year period… may be net long or net short… may use derivatives extensively… may use leverage". Contour's own site gives the thesis: "exploit rapidly evolving trends within TMT in order to deliver strong risk-adjusted returns independent of market direction"; "the current pace of change is the fastest it has been since at least the late 1990s"; "top-down perspective, combined with deep rooted bottom-up company specific analysis"; "derives the majority of its performance from alpha rather than beta". It also mentions the minority stake held by Brummer & Partners. | Automation run 752f9e33; https://www.contourasset.com/index |
| Performance | **Full public disclosure to qualified investors.** Discrete 12-month returns for each year Sep-16 to Sep-25 (e.g. +41.9% FY23, +32.5% FY25), 5-year cumulative +81.2% to 22 Oct 2026, comparison with SOFR, price history chart. Documents: monthly factsheet (Sep 2026), prospectus, PRIIPs KID, annual report. | Automation run 752f9e33 |
| Fund facts | C Acc USD, ISIN LU1725199621, launched 20 Dec 2017, OCF 1.67%, entry charge up to 1%, performance fee 20% over SOFR. | same |
| Team | Schroders shows the PM name and tenure only (David Meyer, since 2017). contourasset.com lists full bios for about 15 people (PM, analysts, IR, operations). | same; contourasset.com |
| CTAs | Schroders: Add to watchlist, Download price, Add comparators, View all funds. Contour: "Get in touch" (email to the office manager). | same |
| Contour site gating | No gate, no fund data, no performance. It is a single-page About / Strategy / Team / Contact site with a privacy-policy PDF. | https://www.contourasset.com/index |

## 3. Symbit Global Equity L/S Fund (Symbit Capital)
**URL:** https://www.symbit.com/welcome (there is no separate fund page)

| Element | Finding | Source |
|---|---|---|
| Gate | None. The site has no fund information at all. | https://www.symbit.com/welcome |
| Structure | Hero "Cooperation. Evolution.", then Our vision (Intelligence / Ownership / Culture), then a Munger quote, then Our origin (Barricelli 1953 "symbiogenesis"), then Our team (4 cards with LinkedIn links). | same |
| Positioning (verbatim) | "Our decades of investment experience meet the analyst of the next decade."; "Build an AI-native investment firm: combine decades of investment experience with AI to connect evidence across businesses, industries and mental models."; "human experience and machine intelligence, working together." | same |
| Fund facts | Not on the site. Press coverage: market-neutral, ~200% gross, 10–15 core longs, professional investors, EU/EEA pre-marketing. | https://hedgeweek.com/news/new-york-investment-veterans-launch-ai-native-hedge-fund-in-switzerland |
| Performance | None. | — |
| Team | Prominent: Skrondal and Torvund (both ex-NBIM PMs), Brenner (ex-GAM), Ring (ex-Future Fund), each with credentials and a LinkedIn link. | symbit.com |
| CTAs | LinkedIn profile links only. No contact form or email shown in the fetched content. | same |
| Takeaway for TMS | A brand-led, minimal page that leans on founder pedigree. It shows how to present "human + machine" as a philosophy rather than a black box. | — |

## 4. U Access (IRL) Shannon River UCITS (UBP platform)
**URL:** https://www.ubp.com/en/asset-management/funds/ie00bkdrxc08 (C CHF class; other classes at /ie00bkdrx427, /ie00bkdrxg46, …)

| Element | Finding | Source |
|---|---|---|
| Gate | Redirects to https://www.ubp.com/en/asset-management/disclaimer?…: "The content of our website is not intended for persons resident… inside the United States… To browse on UBP.com, please confirm that you are not a US resident." It then asks for "Country of domicile" and "Investor profile", followed by "Legal information". | fetch of ubp.com |
| Manager website | **None found.** shannonpartners.com is unreachable. Shannon River's public presence is the LinkedIn page, SEC IAPD and press coverage. | https://adviserinfo.sec.gov/firm/summary/161538 ; https://www.linkedin.com/company/shannon-river-capital-management |
| Documents | UBP hosts monthly reports (e.g. Aug 2024 PDF: manager "Shannon River Fund Management, LLC", "1.20% Management Fee; 20% Performance Fee"). | UBP monthly report PDF (search snippet) |
| Positioning (third-party) | "long/short equity investment strategy focused on technology"; "inflection points of a multi-year transition in companies on the right side of a tech trend"; mid-cap focus; ~half the long book in second-order AI beneficiaries; "We are investors and not traders." | https://citywire.com/funds-insider/fund/u-access-irl-shannon-river-ucits/c850020 ; https://thehedgefundjournal.com/u-access-shannon-river-ucits-mid-cap-tech-equities/ |
| Gate (full flow) | First, confirm "not a US resident". Then a 2-step wizard: "Investor profile" (Country of domicile = Switzerland; Investor profile = Professional (Institutional)), then "Legal information", then Continue. | Automation run f8401617 |
| Structure | Tabs: **Performance** (default) / **Library** / **Key information**. Under Performance: General information, Cumulated performance, Annualised performance, 12 months rolling performance, Disclaimer. Under Key information: Sub-fund data, Share class data, Identifiers. | same |
| Positioning on page | **None.** The page has no objective or strategy text; it is a data-only platform page. | same |
| Performance | **Full, to professional investors.** NAV 121.10 CHF; MTD −5.71%, YTD −6.85%, 1y −6.12%, 3y +34.10%, 5y +5.25%, ITD +21.10% (annualised: 3y 10.27%, 5y 1.03%, ITD 2.76%), as of 22 Oct 2026; chart with time filters. | same |
| Fund facts | C CHF, ISIN IE00BKDRXC08, launched 10 Oct 2019, AUM **USD 21.37m** (22 Oct 2026), U ACCESS (Ireland) UCITS plc, daily dealing, min. USD 10m, mgmt fee 1.00%, perf fee 16% (high-water mark), SFDR Art. 6, asset class "Single Hedge Fund". | same |
| Library | Annual report (2025), PRIIPs KID (May 2026), prospectus (Aug 2026), semi-annual report, articles of association, reportable income: all PDF downloads. (Monthly reports also exist; e.g. Aug 2024 found by search.) | same |
| Team | **No managers named** on the page. | same |
| CTAs | Back to list, "My Access" (client login), newsletter subscribe. No contact or request CTA specific to the fund. | same |
| Disclaimer (verbatim) | "Past performance is not indicative of present and/or future results."; "For retail, performance data for sub-funds with less than a 12 month performance record is not displayed."; "For professional, performance under 1 year is shown cumulated and performance over 1 year is shown annualised."; "Data source: UBP SA" | same |

## 5. Jericho Capital Asset Management
**URL:** https://www.jerichocap.com

| Element | Finding | Source |
|---|---|---|
| Page type | **A bare holding page.** It shows the firm name, LA and NY addresses, email and phone. The only other page is a founder bio (/josh-resnick.html). | https://www.jerichocap.com ; https://www.jerichocap.com/josh-resnick.html |
| Strategy text | Only in the bio: "an investment manager focused on investing in the global technology, media and telecommunications (TMT) sectors." | bio page |
| Performance, gating, CTAs | None. No investor login, no gate, no disclaimer beyond contact details. | — |
| Takeaway | Typical of a large US hedge fund: it markets through allocator relationships and press (e.g. Institutional Investor), not through its website. | https://www.institutionalinvestor.com/article/premium/jerichos-three-year-hot-streak-shows-no-signs-cooling |

---

## Takeaways for the TMS page
1. **Performance disclosure**: TMS is the only gated competitor page that shows no performance at all once a qualified investor is through the gate. Schroders/Contour publish discrete annual returns and a monthly factsheet behind a similar Swiss qualified-investor gate. BIT publishes NAV, charts and factsheets openly. A post-gate factsheet download or "request factsheet" form would close most of the gap.
2. **The hybrid story is under-told**: BIT turns its data and AI edge into numbers (signals per day, % of trades influenced) and gives a human-in-the-loop assurance. TMS's "behavioral language" algorithm and its new discretionary sleeve get 3 short paragraphs. The ~50/50 split between the systematic and discretionary sleeves is not mentioned.
3. **Team visibility**: Symbit and Contour lead with named PMs and their pedigree. The TMS page names no one.
4. **Fund facts**: Schroders and BIT show ISIN, vehicle, fees and share classes. TMS shows none.
5. **Credential mismatch**: the "Managed Futures Newcomer 2023" award label conflicts with the current "Long/Short Technology" positioning.
6. **Gate design**: TMS's three-step gate (country, investor type, accept) is in line with Schroders CH and UBP and is not a weakness. BIT is the outlier: it puts everything in front of the gate, which suits a retail brand.
