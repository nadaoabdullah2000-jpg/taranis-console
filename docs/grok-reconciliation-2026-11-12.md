# Grok → live tool reconciliation (read-only audit, 12 Nov 2026)

Project `asqrhnwicgbgwzttopla`. Only SELECT queries were run. `wi_auth_token` was not touched. Nothing was fixed.
"Live" = `wi_mandates` rows with `validation_status` null or not in ('pending','merged'). Rejected-verdict rows count as live.

## 1. Sources used

| Source | What it holds | Rows |
|---|---|---|
| `grok.wi_discovered` (base table; it exists) | Grok discovery finds (action `discover`) | 99 (67 `imported`, 32 `staged`) |
| `wi_fill_log` where `source like 'Grok · %'` | every value Grok's `save` wrote (mandates + I-Connections), run-tagged | 873 rows / 326 run tags; no `Grok undo` rows |
| `wi_fill_log` where `source like 'Grok focus check%'` | "not stated (checked)" marks from `checked`/`record_focus` | 624 (focus.tech 389, focus.emerging 205, iconnections.focus.* 30) |
| other `wi_fill_log` rows mentioning Grok | rescore after Grok fills (85), approved links (5), resets for re-check (30) | 120 — used as "later deliberate step" evidence |
| `iconn_wi_profiles` (payload.raw.source = 'grok') | I-Connections profiles Grok saved | 32 |
| `iconn_wi_lookup` (tried = {grok}) | Grok link candidates | 20 (17 Exact, 1 Grok candidate, 2 Rejected candidate) |
| `grok_checked` | done/no_profile/unsure marks (no field data) | 1,593 |
| `wi_disc_fill_plan`, `wi_mandates_backup_20261111_disc_fields` | discovery field-fill plan + pre-fill backup | 76 / 76 |
| `wi_investor_contacts` | contacts | 0 (expected) |

No separate gateway request/payload table exists: the n8n gateway (`n8n/grok-gateway-parse-request.js`) calls `grok_fn.save` / `grok_fn.discover` directly, so `wi_fill_log` (save) and `grok.wi_discovered` (discover) are the only records of what Grok sent. Grok never sent Space (`is_space`) values: there are no Grok-sourced Space log rows and `wi_discovered` has no space column, so Space could not be compared.

## 2. Summary

Grok save (wi_fill_log, latest value per row+field, mandates scope)

| Field | Checked | Match | Dropped | Differs | Expected (why) | Genuine |
|---|---|---|---|---|---|---|
| Emerging managers | 195 | 194 | 1 | 0 | 1 (AlphaBee 2924 reset by research 11 Nov) | 0 |
| Emerging quote (evidence.emerging_evidence) | 31 | 30 | 1 | 0 | 1 (same reset) | 0 |
| Tech (is_tech_investor) | 96 | 73 | 23 | 0 | 23 (reset 11 Nov "re-check under tightened rule" / "VC only"; 8 of them pending or merged, 2 manual) | 0 |
| Tech quote (tech_signal) | 96 | 71 | 23 | 2 | 25 (resets + 2 replaced by the approved theme-line read: 2739, 2896) | 0 |
| AUM (aum_usd) | 25 | 21 | 0 | 4 | 0 | **4 (unit: stored in millions; 3 pending, 1 live)** |
| AUM band | 8 | 2 | 0 | 6 | 6 (all pending rows; "USD 100m - 500m" vs "$100m - $500m" is format only; 713/751 changed by the later enrichment) | 0 |
| Ticket min / max | 24 / 29 | all | 0 | 0 | – | 0 |
| Strategies / Asset classes | 33 / 16 | all | 0 | 0 | – | 0 |
| Type / Country / City | 1 / 3 / 12 | all | 0 | 0 | – | 0 |
| Min manager AUM | 8 | 8 | 0 | 0 | – | 0 |
| WI summary / WI id / WI link | 137 / 37 / 17 | all | 0 | 0 | – | 0 |
| Sibling rows of the same investor | 363 tech / 315 emerging live rows | – | 5 / 5 plain blank | – | FERI 36 (reset, awaiting re-check) | 4 rows, low (rejected sibling rows) |

"Not stated (checked)" marks (Grok focus check, mandates)

| Mark | Checked | Match | Mark mismatch | Expected |
|---|---|---|---|---|
| tech not_stated | 368 | 345 | 23 | 23 (15 later filled by the approved themes read / theme line, 1 set by a person (Crewcial 2929); 8 re-marked `private_markets_only` by the themes read) |
| tech private_markets_only | 11 | 11 | 0 | – |
| emerging not_stated / pmo | 199 / 6 | 199 / 6 | 0 | – |
| I-Connections focus (tech 22, emerging 8) | 30 | 30 | 0 | – |

I-Connections links and profiles

| Item | Checked | Match | Other |
|---|---|---|---|
| Links Grok saved (`iconnections.link`) | 16 firms | 16 (in `iconn_wi_links`, certain) | none rejected |
| Candidates | 4 | 2 approved (TIFF, TSWII) | 2 rejected by a person (Blackstone, M4invest) – expected |
| Profiles (`iconnections.profile`) | 32 | 32 stored, status ok | – |
| Profile blanks fills (keys) | 95 keys / 47 firms | 95 | 0 |

Discovery (`grok.wi_discovered`, 67 imported → 67 `Discovery find` rows, all live; plus 9 parent firms added by hand)

| Field | Grok had value | Match | Dropped | Differs | Expected | Genuine |
|---|---|---|---|---|---|---|
| Type | 67 | 67 | 0 | 0 | – | 0 |
| Country | 67 | 65 | 0 | 2 | 0 | **2 (Austria stored as AU = Australia)** |
| AUM | 62 | 2 | 0 | 60 | 0 | **60 (stored in millions after an unlogged overwrite)** |
| Ticket | 5 | 1 | 1 | 3 | 3 (blanks-only: row already had the earlier capture / live-read hedge-fund preference) | **1 (Reitan 3178: dropped and marked not_stated)** |
| Strategies | 15 | 4 | 0 | 11 | 11 (blanks-only; Grok re-sent richer lists after the insert, times_seen=3) | 0 (see note) |
| Asset classes | 59 | 39 | 0 | 20 | 20 (blanks-only, or only "Unspecified" missing – filtered on purpose) | 0 (see note) |
| Emerging managers | 6 | 5 | 0 | 1 | 0 | **1 (UBP 3223: true → false)** |
| Tech | 3 | 1 | 2 | 0 | 2 marked not_stated by the strict rule (Carrington 3186 market view; MacArthur 3210 newest themes line) | 0 (1 quote not carried, MacArthur) |
| Intentions | 24 | 24 (intention_summary + evidence.wi_intentions) | 0 | 0 | – | 0 |
| Summary | 66 | 66 | 0 | 0 | – | 0 |
| Contacts | 56 finds / 531 contacts (865 across all 99) | 0 | 56 | – | wi_investor_contacts empty is expected | not loaded anywhere yet |
| 32 staged, not imported | 12 already in the tool by WI id (gaps only on rejected rows: summary for Dodge, JP Morgan; emerging for Squarepoint 2772); 18 fund vehicles + Citadel Multi-Strategy + Quilter Investors (+ Millennium by name) left out as the insert plan says | | | | all expected | 0 |

## 3. Problems, worst first

1. **AUM stored ~1,000,000× too small on 61 Grok-sourced live rows (60 discovery + Compound Planning 3012).** Grok (and the discovery insert) wrote dollars; e.g. Achelis & Bodman 3182 Grok 143,000,000 → live 142.60; Ironwood 3188 9,700,000,000 → 9,700.00; OCBC 3221 266.3bn → 266,282.57; Memorial Hermann 3187 647m → 646.90; Compound Planning 3012 5,000,000,000 → 5,000.00. Backup `wi_mandates_backup_20261111_disc_fields` still holds the dollar values; the change happened after the field fill (wi_enriched_at 11 Nov 15:03–15:06; for 3012 9 Nov 15:00) and **is not in wi_fill_log**. The numbers are With Intelligence's own figures in millions (1553, 95287, 23764.70), so a With Intelligence enrichment step (n8n, sets `wi_enriched_at`; not in the repo) overwrote filled values with `latest_aum.value_usd` in millions — the same bug repair-wi-reread-2026-11-04.sql fixed once. Same pattern on pending rows 713 NJDOI, 737 BEW, 751 UTIMCO. Wider: 104 rows (90 live) have aum_usd < 1,000,000, all enriched since 5 Nov. aum_band is correct, so the band display is right; anything reading the number (sort, filters, scoring, a "$" display) is wrong. Two rules are broken here: the value was wrong, and the overwrite skipped both blanks-only and logging.
2. **Country mis-mapped: Mahi546 3179 and Mahi Alpha Select 3189** — Grok "Austria" (city Vienna), backup had `AT`, live is `AU` (Australia). The change is also unlogged and happened after the field fill (same window as #1).
3. **UBP (Union Bancaire Privée) 3223, emerging managers**: Grok `true` ("Hedge Funds preferences: Emerging Managers Yes"); live `false` from the field fill, quoting "Does not consider first-time funds." The EM rule (`scripts/discovery-field-fill.mjs`) counts "first-time funds" as emerging managers, so a first-time-fund refusal became a No. This looks like a mis-map, not a deliberate decision.
4. **Reitan Kapital AS 3178, ticket**: Grok sent 10.81m–54.06m USD; live ticket blank and `focus_checks.ticket = not_stated` (live read). This is a MARK MISMATCH: Grok had a value, but the tool says "not stated (checked)". The amounts look converted from NOK; if so, `stated_other_currency` would be the right mark. The live read may not have seen it, because Grok re-sent after the insert.
5. **MacArthur Foundation 3210, Tech (quote not carried)**: Grok tech `true` with the May 2026 hedge-fund themes line (AI, digital infrastructure, blockchain, fintech…). Live has `focus_checks.tech = not_stated` because the newest (Nov 2026) themes line names only healthcare and longevity. The rule is deliberate ("newest themes line"), but the Grok quote is in neither tech_signal nor the note. Flag for a person to decide.
6. **Grok's later discovery re-captures never reached the tool (blanks-only)**: 11 strategy and 20 asset-class lists, plus tickets for Kauffman 3216 (Grok 50–100m vs live 50–50m), UBP 3223 (5–100m vs 10–30m) and Pritzker 3213 (min 15m vs 15–15m). The richest gaps are Carrington Wealth 3186 (live strategies only UCITS; Grok adds L/S Equity, Relative Value, FI Arbitrage) and Pritzker 3213 (live asset classes only Hedge Funds; Grok lists 11 more). Brooks Macdonald 3247, Reitan 3178, CaixaBank 3237 and Ironwood 3188 are similar. Each was skipped because the row already had a value, which matches the documented rule. Listed so a person can choose whether to merge them.
7. **Discovery contacts not loaded**: 865 contacts on 88 finds (531 on the 56 imported finds that have any). No discovery row has a contact_name, emails or linkedin, and `wi_investor_contacts` is empty. This was expected, but all of it is still pending.
8. **Low: sibling rows without the investor-level Grok value**: Citi Global Wealth 1732 and 1770 (Grok tech + emerging true on 137), McKnight Foundation 3085 and 3098 (created 11 Nov after Grok's 10 Nov save; emerging true on 1384), University of Nebraska Foundation 2696 (emerging true on 138). All are rejected-verdict rows, so they only matter in Rejected. Also FERI AG 36: tech is blank with no mark after the 11 Nov reset, and is still waiting for Grok's re-check.

Checked and fine: Grok save tickets, strategies, asset classes, type, country, city, min manager AUM, WI summary, WI id and link (100%); focus marks (all mismatches traced to approved later steps); I-Connections links, profiles, blanks fills and focus marks (100%); discovery intentions and summaries (100%). Expected rows confirmed: Massachusetts PRIM 323 and 448 (manual) and Crewcial 2929 ("Set by a person"); merged or pending rows 889, 903, 910, 1352, 1713, 1806, 2387 and 713, 726, 737, 751. Memorial Hermann 3187: Tech was not touched by Grok (only its AUM is in #1). Andrew Carnegie 1358 appears in no finding. Carnegie Corporation's link (9564) matches.

## 4. SQL (re-runnable)

```sql
-- A. Grok save vs live (latest value per row + field)
with g as (select distinct on (mandate_id, field) id, mandate_id, field, new_value
             from wi_fill_log where source like 'Grok · %' and mandate_id is not null and field not like 'iconnections%'
            order by mandate_id, field, id desc),
j as (select g.*, m.investor_name, m.validation_status, m.verdict_source,
        case g.field when 'open_to_emerging_managers' then m.open_to_emerging_managers::text when 'is_tech_investor' then m.is_tech_investor::text
          when 'tech_signal' then m.tech_signal when 'strategies' then m.strategies::text when 'asset_classes' then m.asset_classes::text
          when 'aum_usd' then m.aum_usd::text when 'aum_band' then m.aum_band when 'ticket_min_usd' then m.ticket_min_usd::text
          when 'ticket_max_usd' then m.ticket_max_usd::text when 'min_manager_aum_usd' then m.min_manager_aum_usd::text
          when 'investor_city' then m.investor_city when 'investor_country' then m.investor_country when 'investor_type' then m.investor_type
          when 'view_investor_url' then m.view_investor_url else m.evidence->>substr(g.field,10) end live
      from g join wi_mandates m on m.id = g.mandate_id)
select field, count(*),
  count(*) filter (where live = new_value or (field in ('strategies','asset_classes') and live::jsonb = new_value::jsonb)
                     or (field like '%usd' and live::numeric = new_value::numeric)) match,
  count(*) filter (where live is null or live in ('','[]')) dropped
from j group by 1;
-- later deliberate change: exists (select 1 from wi_fill_log l2 where l2.mandate_id = j.mandate_id and l2.id > j.id and l2.source not like 'Grok · %' and l2.field = j.field)

-- B. Focus marks vs focus_checks
with g as (select distinct on (mandate_id, field) id, mandate_id, substr(field,7) k, split_part(new_value,':',1) res
             from wi_fill_log where source like 'Grok focus check%' and field like 'focus.%' order by mandate_id, field, id desc)
select k, res, count(*), count(*) filter (where m.focus_checks->k->>'result' = res) match
from g join wi_mandates m on m.id = g.mandate_id group by 1,2;

-- C. Discovery vs live
select count(*) filter (where d.aum_usd is not null and m.aum_usd = d.aum_usd) aum_match,
       count(*) filter (where d.aum_usd is not null and m.aum_usd <> d.aum_usd) aum_diff,
       count(*) filter (where d.emerging_managers is not null and m.open_to_emerging_managers is distinct from d.emerging_managers) em_diff
from grok.wi_discovered d join wi_mandates m on m.evidence->>'wi_investor_id' = d.wi_id and m.alert_type = 'Discovery find'
where d.review_status = 'imported';

-- D. Unlogged changes since the discovery field fill
select count(*) filter (where b.aum_usd is not null and m.aum_usd is distinct from b.aum_usd) aum_chg,
       count(*) filter (where b.investor_country is not null and m.investor_country is distinct from b.investor_country) ctry_chg
from wi_mandates_backup_20261111_disc_fields b join wi_mandates m using (id);

-- E. AUM-in-millions scope
select count(*), count(*) filter (where coalesce(validation_status,'') not in ('pending','merged')) live
from wi_mandates where aum_usd > 0 and aum_usd < 1000000;

-- F. I-Connections focus marks
with g as (select distinct on (wi_investor_id, field) wi_investor_id w, substr(field,20) k, split_part(new_value,':',1) res
             from wi_fill_log where source like 'Grok focus check%' and field like 'iconnections.focus.%' order by wi_investor_id, field, id desc)
select k, count(*), count(*) filter (where exists (select 1 from iconn_wi_profiles p where p.wi_id = g.w and p.status = 'ok'
        and p.payload->'norm'->'focus_checks'->k->>'result' = g.res)) match from g group by 1;
```
