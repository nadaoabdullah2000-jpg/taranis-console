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
