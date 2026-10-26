# TODO (a): WI 01 writes the reason from the rule, GPT's opinion moves to its own field

Status: **not built**. To do the next time WI 01 v2 (`PXfQqCr3fR7H9YQr`) is changed.
Decided 12 Oct 2026. Part (b), the app-only fix, shipped first: the console builds its
reason from the rule (`verdictReason` in `app.js`) and shows `fit_reason` only as a
folded "AI opinion".

## Why

Each `wi_mandates` row holds two scorers' outputs from the same intake run:

| Columns | Written by | Used for |
|---|---|---|
| `new_qualification`, `new_fit_score` | the rule: *Apply Taranis Hard Criteria* (`score_band`), mapped in *Build Mandate SQL* | the verdict everywhere (app, OPS 02, bots) |
| `qualification`, `fit_score`, `fit_reason`, `positive_signals`, `risks`, `missing_information` | GPT: *AI Fit Scoring* + *Merge Score + Mandate* (or *Set Rejected Fields* on the hard-fail path: "Hard criteria failure") | the reason text, and the score in some Telegram posts |

Nothing reconciles the two. On 12 Oct 2026, 166 rows had a reason that contradicted their
verdict. For example, NYU (2026) was matched 1.0 by the rule, but GPT's reason read
"macro/CTA - wrong fit" with 0.30. Eight matched rows read "Hard criteria failure".

## Change

1. **Schema** (new file `schema-16-ai-opinion.sql`):
   ```sql
   alter table wi_mandates
     add column if not exists ai_fit_reason text,
     add column if not exists ai_fit_score numeric;
   -- keep what GPT said on existing rows, so nothing is lost
   update wi_mandates set ai_fit_reason = fit_reason, ai_fit_score = fit_score
    where ai_fit_reason is null and fit_reason is not null
      and coalesce(verdict_source,'') <> 'manual';
   ```
   Do not move the reason on manual rows. Their `fit_reason` is a person's words; the
   `wi_keep_manual_verdict` trigger already protects it.

2. **Apply Taranis Hard Criteria**: return the signals it matched on, alongside
   `score_band`. These are the same tests as `critStatus` / `isStrong` / `isTech` /
   `RE_EXCL` in `app.js`. Add, for example, `rule_signals: { hedge: 'yes'|'no'|'unknown',
   strong_term: 'quant'|'systematic'|'long/short equity'|null, tech: bool, excl_term: string|null }`.

3. **Build Mandate SQL**:
   - Compute `fit_reason` from `newQ` + `rule_signals` with the same wording as
     `verdictReason()` in `app.js`. Port that function; don't invent new phrasing.
     On the reject path, use `hard_fail_reasons`, the way `rejectFails()` does.
   - Write GPT's `reason` / `score` to `ai_fit_reason` / `ai_fit_score`.
   - Keep `fit_score` = `newS` if anything still reads it; otherwise leave it as the
     legacy column.
   - In the `ON CONFLICT` list, add `ai_fit_reason=EXCLUDED.ai_fit_reason,
     ai_fit_score=EXCLUDED.ai_fit_score`. `fit_reason=EXCLUDED.fit_reason` stays; the
     manual trigger still guards hand rows.

4. **Merge Score + Mandate**: keep emitting `fit_reason` from GPT, but rename it to
   `ai_fit_reason` in its output, so the two can't be confused downstream.

5. **Places that show GPT's text to people today**. Switch each to the rule's reason (and
   the rule's score):
   - WI 01 *Send Telegram Review*: prints `Fit score: fit_score` and `<i>fit_reason</i>`.
   - WI 01 *Build Review Row*: `Fit reason: fit_reason` goes into the review data table.
   - WI 01 *Notify Gaps*: prints `fit_score`.
   - WI approval (`P7WV6Yt6NT2USMiF`) *Claim Manual Publish* returns `fit_score, fit_reason`,
     and *Send Approved to CRM Group* prints `Fit score: fit_score`.
   - Contact bot (`ishH4fg2k9KHjCvS`) *Opportunities SQL*: returns `fit_reason` and
     searches it with `ILIKE`; the tool description tells the bot it may quote it.
   - Gateway (`7V1Wn00ubm0mWICa`) *Q Pending Reviews* and *Q Mandates*: return `fit_score,
     fit_reason`. The app's fallback path reads these. The app now ignores `fit_reason`,
     but return the rule reason anyway.

6. **The app** then reads `fit_reason` directly again, or keeps `verdictReason()`; both
   agree once (3) is in. Point `aiOpinion()` at `ai_fit_reason` / `ai_fit_score`.

## Check after building

- Replay one stored digest with the Telegram nodes disabled. Then for every row it
  touched, check that `fit_reason` matches what `verdictReason()` gives in the app, and
  that `ai_fit_reason` holds GPT's text.
- `select count(*) from wi_mandates where new_qualification='matched' and fit_reason ~*
  'wrong fit|hard criteria failure'` returns 0 for rows written after the change.
- Manual rows (`verdict_source='manual'`) keep their `fit_reason` byte for byte.

## Known data notes (12 Oct 2026)

- 2026, 2033 (NYU) and 1673 (WYNNES): `fit_reason` was rewritten by hand on 12 Oct
  (see `cleanup_notes`), so it is not GPT's text. The GPT originals are in
  `snap_wi_mandates_20261012_reasons`. When the backfill in (1) runs, copy those three
  from the snapshot into `ai_fit_reason`, not the current value.
- A replay of those digests before (3) ships will put GPT's text back into
  `fit_reason` on those rows. That's harmless while the app ignores it.
