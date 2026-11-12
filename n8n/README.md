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
