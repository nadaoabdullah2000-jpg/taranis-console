# WI 01: dedup wiring (prepared 20 Nov 2026, NOT applied, NOT published)

Live version today: 7e204dd6 (the digest-splitter fix). Undo after publishing: publish 7e204dd6 again.
Code changes are in `wi01-deterministic-extraction.js` and `wi01-normalize-record-key.js` (before copies:
`*.before-2026-11-20.js`). Tests: `tests/wi01-dedup-names.test.mjs`. No database change: the key is stored in
`evidence.item_key` by the existing "Build Mandate SQL" (it writes the whole evidence object).

## Connections

Before:
```
Normalize + Record Key ──> WI Profile Enrichment ──> Key Fields Present? ...
SQL Dedup Check  (no input: never runs)
Is New? (no input) ──false──> Skip Duplicate ──> Duplicate To App
```
After:
```
Normalize + Record Key ──> SQL Dedup Check ──> Restore After Dedup ──> Is New?
Is New? ──true (no stored copy)──> WI Profile Enrichment ──> Key Fields Present? ...   (unchanged from here)
Is New? ──false (copy found)────> Skip Duplicate ──> Duplicate To App                  (existing debug notice)
```

## Nodes

**SQL Dedup Check** (Postgres, existing node): query and settings.
```sql
SELECT (SELECT id FROM wi_mandates WHERE evidence->>'item_key' = $1 ORDER BY id LIMIT 1) AS dup_id;
```
- Query parameter: `={{ $json.item_key || '-' }}` (was `$json.record_key`). The sub-select always returns one row.
- Settings: Always Output Data on (as now); **On Error: Continue (regular output)**. If the lookup fails, the
  row has no `dup_id` and the item is treated as new: a failure can at worst store a duplicate, never lose an item.

**Restore After Dedup** (new Code node, run once for each item): puts the item back after the lookup.
```js
return { json: { ...$('Normalize + Record Key').item.json, dup_id: $json.dup_id ?? null } };
```

**Is New?** (existing If node): condition `{{ $json.dup_id }}` is empty (was `{{ $json.id }}`).

**Skip Duplicate** (existing Set node): add `dup_id` = `{{ $json.dup_id }}`, `item_key` = `{{ $json.item_key }}`,
`investor_name` = `{{ $json.investor_name }}`.

**Duplicate To App** (existing): fields become stored row, item key, investor, record key, so every skip is visible.

## When can the skip path drop a genuinely new item?

The skip fires only when a stored row has the same `item_key`. The key is:
- `L:` hash of (the item's own With Intelligence record link without the per-email tracking part, the alert
  date, the headline, the "has been added/updated" status word), or
- `T:` hash of (the item's own text without links, buttons and styles, the alert date) when it has no link.

So a later alert on the same record (new date), or "Mandate has been updated" after "...has been added" (status
word), always gets a new key (tested). What is left: With Intelligence sending a *changed* item with the same
link, the same date, the same headline and the same status word. That item is skipped, but not silently: it goes
to Duplicate To App with the stored row's id. Two copies arriving in the same run (both new at lookup time) are
both stored: a duplicate, not a loss.
