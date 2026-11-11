# Dry run, 11 Nov 2026: themes-line fill, Space, verdict moves, discovery inserts

Nothing below is applied yet. Files: `repair-themes-space-fill-2026-11-11.sql` (one transaction, reads the plan
table `wi_fill_plan_20261111`) and `repair-discovery-insert-2026-11-11.sql`. Both back up, log every change and
carry an undo. Your own verdicts and your own Tech choices are never changed.

Source of each line: **live** = read today from the investor's With Intelligence intentions (newest themes line
wins; "HF / PE/VC / general" = which intentions carry it); **stored** = the security & defence line already in
the database (the 31-investor Space dry run).

## 1. Technology = Yes (11 investors, 13 rows), live read, line not limited to private equity / venture

| Investor | Rows | Themes line (evidence) | Carried on |
|---|---|---|---|
| AARP | 2871 | primary investment themes over the next 12-18 months target artificial intelligence, healthcare and longevity, and security and defense | 2025-07-31 general |
| Advocate Health | 997 | primary investment themes over the next 12-18 months are security and defense, healthcare and longevity, financial technology, and artificial intelligence | HF + PE/VC |
| Kumpulan Wang Persaraan (KWAP) | 2085, 2155 | ... focus on energy transition, digital infrastructure, healthcare and longevity, sustainability, and education | HF + PE/VC |
| Rutgers University | 2900 | ... focus on energy transition, digital infrastructure, artificial intelligence, sustainability, healthcare and longevity, financial technology, security and defense, and blockchain | HF + PE/VC |
| Simon Quick Advisors | 2955 | The investor's investment themes over the next 12-18 months include digital infrastructure, and security and defense | HF + PE/VC |
| The Rotary Foundation (your own verdict, kept) | 1369 | ... include energy transition, artificial intelligence, digital infrastructure, healthcare and longevity, security and defense, and financial technology | HF + PE/VC |
| UTIMCO | 751 | The investor's investment theme over the next 12-18 months includes artificial intelligence | HF + PE/VC |
| Tulane University Endowment | 1379 | Primary investment themes are energy transition, digital infrastructure, artificial intelligence, healthcare and longevity, security and defense, financial technology, and blockchain | HF + PE/VC |
| University of Cincinnati | 1389 | primary investment theme for the next 12-18 months is artificial intelligence | general + PE/VC |
| Wilshire | 2913 | ... include artificial intelligence, energy transition, and security and defense | HF + PE/VC |
| YMCA Retirement Fund | 1879, 1896 | ... include energy transition, artificial intelligence, digital infrastructure, healthcare and longevity, and security and defense | HF + PE/VC |

## 2. Technology: private markets only (8 investors, 10 rows), Tech stays blank, recorded as a check

The tech themes line appears only on private equity / venture intentions: Children's Hospital of Philadelphia
Foundation (1259), Kentucky Public Pensions Authority (342), Montgomery County ERS (2509, your own verdict),
New Jersey Division of Investment (713), Robert Wood Johnson Foundation (1388), The California Endowment (1494),
**True North Capital (158, currently Matched)**, University of Nebraska Foundation (138, 2696).
Wealthspire (9) is left out as you decided.

## 3. Space = Yes (48 investors, 58 rows), the line names security & defence

Live read (19): AARP, Advocate Health, Children's Health System of Texas, Children's Hospital of Philadelphia
Foundation, ERS Texas, Georgia Tech Foundation (full line: "...focus on healthcare and longevity, and security and
defense"), Kentucky PPA, NCP Capital Partners, New Jersey DOI, Ohio PERS, Rutgers, SBCERA, Simon Quick, The Rotary
Foundation, Texas Permanent School Fund, Tulane, Verger Capital, Wilshire, YMCA Retirement Fund.

Stored lines (29): Bank of Singapore (127 your own, 468), Bessley Capital, BCBS Michigan, Brandeis, Chicago
Teachers (CTPF), Commonfund, CommonSpirit Health, Curi Insurance, DUMAC, Fox Rock Capital, HRK Group, Laird
Norton Wetherby, LACERS, LSERS, Maihar Capital, Mass General Brigham, NMPERA, NYU, NC State, Okabena, Oldendorff,
Philos, Pomona College, ProVise, Rush University Medical Center, SWIB, TRS Texas (your own verdict, kept),
University of Chicago, Utah RS.

**Not set:** West Virginia University Foundation: its newest themes line (July 2026) is "healthcare and longevity"
only; security and defense was in the February line. The newest line decides, so no Space, and its step-B move
is dropped. Andrew Carnegie: yours, untouched.

## 4. Verdict moves (20 rows), the console's rescore once the fill is in

| Row | Investor | Now | After | Why |
|---|---|---|---|---|
| 2900 | Rutgers University | Review 74% | **Matched 100%** | long/short + quoted Tech (themes line) |
| 2871 | AARP | Review 74% | **Matched 100%** | long/short + quoted Tech (themes line) |
| 1879 | YMCA Retirement Fund | Review 74% | **Matched 95%** | long/short + quoted Tech (themes line) |
| 1896 | YMCA Retirement Fund | Review 74% | **Matched 95%** | same |
| 997 | Advocate Health | Needs data | Review 70% | Tech + Space |
| 1379 | Tulane University Endowment | Needs data | Review 70% | Tech + Space |
| 2955 | Simon Quick Advisors | Needs data | Review 60% | Tech + Space |
| 751 | UTIMCO | Needs data | Review 60% | Tech |
| 1389 | University of Cincinnati | Needs data | Review 60% | Tech |
| 460 | Children's Health System of Texas | Needs data | Review 60% | Space |
| 358 | Texas Permanent School Fund | Needs data | Review 60% | Space |
| 464 | ERS Texas | Needs data | Review 60% | Space |
| 342 | Kentucky Public Pensions Authority | Needs data | Review 60% | Space |
| 1259 | Children's Hospital of Philadelphia Fdn | Needs data | Review 55% | Space |
| 477 | SBCERA | Needs data | Review 50% | Space |
| 2913 | Wilshire | Low 25% | Review 60% | Tech + Space beat the macro/CTA wording |
| 530 | Verger Capital Management | Low 25% | Review 60% | Space beats the macro/CTA wording |
| 1366 | Ohio PERS | Low 20% | Review 50% | Space beats the macro/CTA wording |
| 1207 | NC State University (your Tech = No stays) | Needs data | Review 60% | step B (Space) |
| 468 | Bank of Singapore | Needs data | Review 55% | step B (Space); row 127 (yours) untouched |

Not moved: The Rotary Foundation 1369 (your own Needs data stays, although the rule would now match it),
Montgomery County 2509, TRS 533 and Bank of Singapore 127 (yours).

## 5. Matched check after the fill

30 Matched rows (26 investors), 3 of them your own (Crewcial, Seidor, Bank of Singapore 127). Every non-manual
Matched row has long/short; every one has a quoted Tech **except two that are Matched today and are not in the
approved list**:
- **True North Capital (158)**: Tech only from private-markets themes (above), not quoted for hedge funds.
- **Institute for Advanced Study (398)**: Tech only from an alert-text fragment.

Your call: move both to Waiting for decision (74% at most) in the same transaction, or leave them.

## 6. Final counts (projected, before the discovery inserts)

| | Investors now | after | Rows now | after |
|---|---|---|---|---|
| Matched | 23 | 26 | 26 | 30 |
| Review | 121 | 133 | 146 | 158 |
| Low | 33 | 30 | 45 | 42 |
| Needs data | 169 | 157 | 205 | 192 |
| Rejected | 765 | 765 | 1,484 | 1,484 |

With True North and IAS moved: Matched 24 investors / 28 rows, Review +2. The discovery inserts add 74 to Needs
data (investors and rows).

## 7. Discovery inserts: 74 new allocators as Needs data, each with its With Intelligence link

**65 found directly:** Access Family Office Corp; Achelis & Bodman Foundation; Altman Foundation; AFM-EPF;
Bainum Family Foundation; Big Win Philanthropy; Brooks Macdonald; CaixaBank Asset Management; Canaccord Genuity
Wealth Management UK; Cardinal Brook Trust; Carrington Wealth Management; Chapwood Investments; Circle of Service
Foundation; Emergence Fonds d'accélération; Eres Group; Ewing Marion Kauffman Foundation; Harris Family
Foundation; Hillman Family Foundations; Hunt Consolidated; IPS Capital; Ironwood Capital Management; James S.
McDonnell Foundation; Jeffrey Carlton Charitable Foundation; John D. & Catherine T. MacArthur Foundation; John
Simon Guggenheim Memorial Foundation; Kenneth Rainin Foundation; L3Harris Technologies; Main Line Health System;
MIT (Defined Benefit); Mayo Clinic Defined Benefit Plans; Memorial Hermann Healthcare System Pension Plan;
Mississippi Higher Education Assistance Corporation; Morgan Creek Capital Management; Oprah Winfrey Charitable
Foundation; Oregon State University Foundation; OCBC; Peter G. Peterson Foundation; Philharmonic Symphony Society
of New York Pension Plan; Pritzker Foundation; Pritzker Traubert Family Foundation; Reitan Kapital; Richard &
Susan Smith Family Foundation; Richard King Mellon Foundation; Rockefeller Brothers Fund; Samuel I. Newhouse
Foundation; San Francisco Symphony Retirement Plan; Spartanburg County Foundation; Sturm Family Foundation; Texas
Children's Hospital Cash Balance Pension Plan; Texas State University System; The Bikoff Foundation; The Coca-Cola
Company Master Retirement Trust; The Michael & Susan Dell Foundation; The Morris & Alma Schapiro Fund; The New
York-Presbyterian Hospital Retirement Plan; The Pacific Financial Group; The Private Office; The Schmidt Family
Foundation; Union Bancaire Privée; University of California Retirement Plan; University of Michigan; University
of Texas System Permanent University Fund; University of Utah Endowment; University of Washington; William T.
Grant Foundation.

**9 firms behind fund vehicles** (With Intelligence id from a name search today): UBS Asset Management
(1081870399; A&Q Multi-Strategy Fund, UBS Global Alpha Strategies Fund), Banque de Luxembourg Investments
(2147332152), Candriam (2147318765; two Candriam funds), Cape Capital AG (2147324750), Cross Shore Capital
Management (2147318784), GCM Grosvenor (2147318845; two GCM funds), Lombard Odier Investment Managers
(2147318890), Pictet Alternative Advisors (2147318953; Mosaic), Piguet Galland (2147318956).

**Not inserted:** your 13 (FPPA, Dodge, JP Morgan Private Bank, Kaiser, Millennium, MOSERS, Oregon PERF, RBC
Brewin Dolphin, Squarepoint, Golden LEAF, U Chicago, U Kentucky, Wyoming RS); Citadel Multi-Strategy (a fund);
Quilter Investors (you have Quilter, row 752); the 19 fund vehicles / share classes themselves; Butterfield Asset
Management, Fundana and SYZ Capital (no firm profile on With Intelligence, only their funds); Mahi Alpha Select /
Mahi546 (run by a consultant). No insert matches an existing row by id or name.

## 8. Investors with no With Intelligence id (14, not read)

Cornerstone Alternatives (3067), Farro Capital (3082), First National Bank of Omaha (465), General Electric Pension
Trust (399), JP Morgan Private Bank (3069, 3075), Legadus (722), Notely (740), Prairie Management Group (3068),
Riptide Advisors (711), Seidor founding family's new CIO (3047, yours), Unidentified: British Virgin Islands wealth
manager (149), Unidentified: Peruvian MFO hedge funds (2773), infrastructure (2534, 2633), mezzanine debt (2536, 2634).
