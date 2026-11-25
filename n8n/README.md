# n8n rule copies

`wi01-apply-hard-criteria.js` is the code of the node "Apply Taranis Hard Criteria" in the
workflow "WI 01 v2 — Intake, Split, Extract, Qualify" (id PXfQqCr3fR7H9YQr). Keep it the same
rule as the console's `rescore()` in `app.js`.

## 10 Nov 2026 (approved by research@taranis.net)
Published as workflow version b29d8838-e45e-42ea-8ff7-6ec09c45f3db; only this node changed.
- Strategy tags read as words (`equity_long_short` -> long/short).
- CTA / macro / market-neutral low fit only from the mandate's own text, or its tags when 3 or fewer.

Previous code: `wi01-apply-hard-criteria.before-2026-11-10.js` (version 145564a6-9cb0-4af0-b770-f420d97bff48).

Undo: in n8n, publish version 145564a6-9cb0-4af0-b770-f420d97bff48 again
(workflow history), or paste the previous code into the node and publish.

## 11 Nov 2026: manager news by links and headline (published)
`wi01-apply-hard-criteria.js` adds one check after the tag-based manager-news test. An item is
manager news (rejected as "Not an investor mandate - manager news") when its With Intelligence links
reach only a manager or fund page, or when it has no investor page, no investor type and a
manager-event headline (launch, startup, hire, flows, returns). In both cases it applies only if
the headline doesn't speak of placing money (search, seed, backs, invest, commit...).
Dry run on the 850 alert rows of the last 30 days: 8 more rows caught, all already rejected,
including the 4 untagged copies that had reached Opportunities (HF Ranch 3011, Convexa 3005,
JonesTrading 3006, First NY 3007). No open row would change.
Previous code: `wi01-apply-hard-criteria.before-2026-11-11.js` (= published version b29d8838).
Tests: `tests/wi01-manager-news.test.mjs`.
Published 11 Nov 2026 (approved by research@taranis.net) as version 7a60e603-8238-4a02-b297-b29be135b0c7.
Undo: publish b29d8838-e45e-42ea-8ff7-6ec09c45f3db again.

## 11 Nov 2026: Matched needs long/short AND technology (published)
Two nodes changed, same rule as the console's `rescore()` and the database guard `zz_match_rule`
(schema-28):
- "Apply Taranis Hard Criteria" (`wi01-apply-hard-criteria.js`): long/short without technology is
  `uncertain` (review), not `pass`. Previous code: `wi01-apply-hard-criteria.before-2026-11-11b.js`.
- "Build Mandate SQL" (`wi01-build-mandate-sql.js`): band `strong` (long/short only) is `uncertain`;
  `matched` only with long/short and technology; a long/short review is capped at 0.74.
  Previous code: `wi01-build-mandate-sql.before-2026-11-11.js`.
A new alert's technology comes from its text, so the guard then holds it in review until a With
Intelligence quote (Grok or theme line) or a person's Tech choice backs it.
Tests: `tests/wi01-manager-news.test.mjs`, `tests/wi01-build-mandate.test.mjs`.
Published 11 Nov 2026 (approved by the user) as version 6bf8ba73-c4ac-4787-8b01-791306cd1f19.
Undo: publish 7a60e603-8238-4a02-b297-b29be135b0c7 again.

## Grok gateway (MO9CD19ZeKB3YGfQ), node "Parse Request"
Copy: `grok-gateway-parse-request.js` (tests: `tests/grok-gateway.test.mjs`).
- 11 Nov 2026, version f3808fd3: todo accepts scope "focus" (undo: a6fbe075).
- 11 Nov 2026, version 973df23d: actions discover and discover_status (schema-27) (undo: f3808fd3).
- 11 Nov 2026, version f9953e88: action discover_known (the staged wi_ids, the baseline for scheduled
  discovery runs) (undo: 973df23d).

## 11 Nov 2026: themes line counts as Tech; security & defence as Space (published)
"Apply Taranis Hard Criteria" (`wi01-apply-hard-criteria.js`): an "investment themes" line naming AI,
machine learning, data, digital infrastructure, blockchain, cybersecurity or deep tech counts as
technology (THEME_TECH, same as the console's RE_THEME_TECH); "security and/& defence" counts as Space.
Previous code: `wi01-apply-hard-criteria.before-2026-11-11c.js` (= version 6bf8ba73).
Tests: `tests/themes-line.test.mjs`.
Published 11 Nov 2026 (approved by the user) as version 9b0c7bd1-9fb9-4ea7-bef2-2e3869d7ef7b.
Undo: publish 6bf8ba73-c4ac-4787-8b01-791306cd1f19 again.

## WI 01d (umIcE6l9pLFuC5JH), scratch branch: themes-line read (11 Nov 2026)
"Run iConnections lookup" branch reads With Intelligence intentions for `wi_themes_targets` into
`wi_themes_reads` (`wi01d-themes-read.js`), paced, stopping on an expired token / sign-in / CAPTCHA.
Read-only on wi_mandates. Previous branch code: `wi01d-scratch.before-2026-11-11.js`.

## 11 Nov 2026: equity in a hedge-fund context counts toward long/short (published)
"Apply Taranis Hard Criteria" (`wi01-apply-hard-criteria.js`): "equity", "equity hedge", "equity long/short", "equity l/s"
or "fundamental equity" in a sentence about hedge funds, or as a strategy tag when hedge funds are among the asset
classes, counts toward long/short. A tag beside other asset classes or a long-only tag counts toward review only
(band 'strong', so Build Mandate SQL keeps it at 74% at most). Same rule as the console's equityInHf.
Previous code: `wi01-apply-hard-criteria.before-2026-11-11d.js` (= published version 9b0c7bd1).
Tests: `tests/wi01-manager-news.test.mjs` ("equity in a hedge-fund context ...").
Published 11 Nov 2026 (approved by the user) as version 7f886bc2-9dda-4750-9ef8-8659bda8bc59 (the saved node writes
the bullet in one split pattern as the character itself where the repo file writes \u2022; same behaviour).
Undo: publish 9b0c7bd1-9fb9-4ea7-bef2-2e3869d7ef7b again.

## WI 01d (umIcE6l9pLFuC5JH), scratch branch: Tech tier-1 check (12 Nov 2026)
"Run iConnections lookup" now reads `wi_hf_targets` into `wi_hf_reads` (`wi01d-hf-read.js`): the profile and
the newest intentions of the 8 direct-statement investors, plus a name search for a negative id (NPS). Paced,
stops on an expired token / sign-in / CAPTCHA. Read-only on wi_mandates. The intentions endpoint returns the
newest 10 only: `paginationFilters.start` and a larger `limit` are ignored, and schema lookups are disabled, so
older intentions are not reachable with this query. Previous branch code: `wi01d-full-read.js` (targets from
`wi_full_targets`).

## WI 01d (umIcE6l9pLFuC5JH), 18 Nov 2026: enrichment of the 84 Needs-data rows and intentions probe (approved by the user)
Not published (manual triggers only); read-only on wi_mandates. "Load Batch" now picks only the 84 rows of the
long/short re-read that would drop to Needs data, one company at a time, with a 6 s "Pause" node between reads
(stages into wi_profile_reads). "Load iConn Batch" reads the '18 Nov probe' / '18 Nov full read' targets.
"Search WI (iConn)" (`wi01d-hf-read.js`) gains a probe mode ('probe:<id>') that tests which filter or paging forms
the intentions query honours. Before copies: `wi01d-load-batch.before-2026-11-18.sql` (both batch queries),
`wi01d-hf-read.before-2026-11-18.js`.

## WI 01 "Split Digest into Mandates": buttons written "View&nbsp;..." (18 Nov 2026, published)
With Intelligence digests write the item buttons as `View&nbsp;mandate` / `View&nbsp;investor` / `View&nbsp;intention`;
the button pattern only allowed a plain space, so items were cut only at "View article" buttons. An item without its
own article (e.g. "Mandate has been added - POBA") ran into the next item and took that item's article link, and
neighbouring intention / profile alerts were merged into one block (raw email 608: 8 blocks before, 27 after).
Fix: `View(?:\s|&nbsp;| )+` in the button pattern (`wi01-split-digest.js`; before: `wi01-split-digest.before-2026-11-18.js`).
`wi01-deterministic-extraction.js` is a copy of the unchanged "Deterministic Extraction" node, used by the test.
Test: `tests/wi01-split-digest.test.mjs`.
Published 18 Nov 2026 (approved by the user) as version 7e204dd6-c51a-4b49-86f8-ed479139b1c3.
Undo: publish 322d1d3e-4762-4cd9-975c-9744f1276def again.

## WI 01c (OlWe4Wi6flt7bDtv) "Investor Enrichment Backfill": PAUSED 12 Nov 2026 (research@taranis.net)
Unpublished (it ran every 3 hours). It re-enriched every row with `wi_enriched_at` null and OVERWROTE
type, city, country, asset classes, tickets, AUM, AUM band, evidence (family names) and the investor
name, writing AUM in millions and logging nothing. Its country fallback takes the first two letters of a
name missing from its short list (Austria -> AU, Slovenia -> SL, Monaco -> MO). Do not re-enable without
the user's OK; if needed again it must fill blanks only, write full dollars (x 1,000,000), map countries
in full, and log to wi_fill_log. Repair: `repair-aum-units-2026-11-12.sql`.
WI 01b (9Zqd98cdXXPqI0oO, live, called by WI 01) has the same country fallback, and its units fix only
covers AUM bands of $100m and up (a "< $30m" or "$30m - $100m" profile keeps millions). Not changed.

## 12 Nov 2026: enrichment fixed (approved by research@taranis.net)
- WI 01b published as 4c25f319 (undo: 49e2bf27): money x 1,000,000 always, countries from the full ISO list,
  fill blanks only; the investor name is still corrected from the profile, the alert's name kept in
  evidence.name_from_alert. Copies: `wi01b-profile-fill.js`, `wi01b-units-and-link.js`. Tests: `tests/wi01b-profile-fill.test.mjs`.
- WI 01 "Build Mandate SQL" published as 260f1c49 (undo: 7f886bc2): wi_enriched_at only when WI 01b enriched the
  alert (kept on replay); a corrected name is logged in wi_fill_log in the same statement.
  Previous code: `wi01-build-mandate-sql.before-2026-11-12.js`.
- NOTE: WI 01's node "WI Profile Enrichment (disabled)" means WI 01b is not called at the moment; new alerts are
  stored unenriched (tracking link, no profile fields) and only the backfill enriches them.
- WI 01c rebuilt (`wi01c-backfill-fixed.js`, tests `tests/wi01c-backfill.test.mjs`), daily at 05:47 UTC instead of
  every 3 hours, NOT published yet: unenriched alerts only, blanks only (guarded in SQL), dollars, ISO countries,
  name correction kept and logged, every value in wi_fill_log, wi_enriched_at stamped once.

## 13 Nov 2026: checked, no matching strategy -> low fit (approved by research@taranis.net)
- WI 01 "Apply Taranis Hard Criteria" published as 7c8f1215 (undo: publish 299df613): hedge-fund strategies
  stated (3 or fewer tags, or an alert text about hedge funds naming one) and none long/short, quant, tech or
  space -> band low, not needs_data. Same rule as the console's noMatchingStrategy.
  Copy: `wi01-apply-hard-criteria.js`; previous code: `wi01-apply-hard-criteria.before-2026-11-13.js`.

## 13 Nov 2026: WI 01 scores like the console (approved by research@taranis.net) - step 1 PUBLISHED 17 Nov 2026
n8n was unreachable when this was approved. Step 1 was published on 17 Nov 2026 after a fresh go in session.
- Step 1 (published 17 Nov 2026 as **0867eacd**; undo: publish 7c8f1215): "Apply Taranis Hard Criteria" <-
  `wi01-apply-hard-criteria.step1-parity-2026-11-13.js`. Check after publishing: row 3293 (MassPRIM, the newest WI 01
  row) rescored with the console's rescore() and the step-1 code gives uncertain / strong on both, the same as stored.
  "quantitative analysis" is not quant; 130/30 never counts as long/short; the evidence keys the console does not score
  are skipped (discovery, wi_industries, wi_intentions, stored decisions); stored decisions on the row are read like the
  console (newest_intention_criteria, equity_long_short, equity_not_long_short, equity_review_only, no_matching_strategy,
  a person's Tech choice, profile Tech/Space, hf_evidence no/not_allocator); hire cap lifted only for profile-quoted
  long/short + Tech. Parity on the 485 live non-rejected rows: same band and verdict 485/485
  (`tests/wi01-console-parity.test.mjs`). Previous code: `wi01-apply-hard-criteria.before-2026-11-13b.js` (= 7c8f1215).
- Step 2 (published 17 Nov 2026 as **3c1a4277**; undo: publish 0867eacd): inheritance at intake. New Postgres node
  "Load Investor Evidence" (`wi01-load-investor-evidence.sql`, credential "Postgres account", Always Output Data) on the
  true output of "Key Fields Present?" (which follows "WI Profile Enrichment"), before "Apply Taranis Hard Criteria". The
  query always returns one row per alert (nulls when nothing is stored), so no alert is dropped; the node replaces the
  item, so the Apply code reads the alert from `$('Key Fields Present?').item.json`. The node holds the query without
  its comment lines. Previous Apply code: `wi01-apply-hard-criteria.before-2026-11-17.js` (= 0867eacd);
  "Apply Taranis Hard Criteria" <- `wi01-apply-hard-criteria.js` (fills blanks from it); "Build Mandate SQL" <-
  `wi01-build-mandate-sql.js` (saves is_tech_investor / tech_signal / hf_evidence, never over a value on the row, and logs
  every inherited field in wi_fill_log). Previous code: `wi01-build-mandate-sql.before-2026-11-13.js`.

## 18 Nov 2026: WI 01 uses the 17 Nov score table (approved by research@taranis.net) - PUBLISHED
- Published 18 Nov 2026 as **322d1d3e**; undo: publish 3c1a4277.
- "Build Mandate SQL" <- `wi01-build-mandate-sql.js` (17 Nov table: L+T+S+E 1.00, L+T+S / L+T+E 0.95, L+T 0.90;
  L+S+E 0.74, L+S 0.70, L+E 0.65, L 0.60; T+S+E 0.70, T+S 0.65, T+E 0.60, T 0.55; S+E 0.45, S 0.40; low 0.20;
  no country bonus, no hire score, every review capped at 0.74).
- "Apply Taranis Hard Criteria" <- `wi01-apply-hard-criteria.js` (People alerts scored on their evidence, no hire band;
  the "Load Investor Evidence" wiring from step 2 kept). Saved draft checked equal to the repo copies before publishing.

## 25 Nov 2026: "Grok Ingest → Web App" (fbWUxznPyfYKG0C8) - CREATED, NOT PUBLISHED
- New workflow (no earlier version, nothing live changed). Webhook POST /webhook/grok-ingest with the same Header Auth
  credential as the Grok gateway (x-api-key). Undo: archive the workflow; the database side is in
  `../schema-31-preqin-and-ingest.sql` (its UNDO block).
- Nodes: Grok Ingest -> Parse Request (`grok-ingest-parse.js`) -> Route (error / Excel file / JSON rows) ->
  Read Excel (Extract From File, xlsx, first sheet) -> Normalize Rows (`grok-ingest-normalize.js`) -> Rows OK? ->
  Run Ingest (`select grok_fn.ingest($1..$6)`, credential "Postgres account") -> Package (`grok-ingest-package.js`) -> Reply.
  Every node's error output goes to Reply (the caller always gets an answer).
- Contract: dry run unless `dry_run: false` AND the `plan_id` from the dry run of the same rows; fills blanks only;
  Opportunities through grok_fn.save (wi_fill_log, verdict guard, save_undo), staging rows logged in ingest_log;
  field_sources stamped; uploads never create Opportunities.
- Tested 25 Nov (dry runs only, nothing written): JSON rows, a real .xlsx, a write with a wrong plan_id (refused).
  Tests: `tests/grok-ingest.test.mjs`.
