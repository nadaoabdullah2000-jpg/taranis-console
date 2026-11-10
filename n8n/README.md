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
