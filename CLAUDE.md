# Taranis console: working rules

These apply to every session and every agent working in this repository.

## Data changes (Supabase project asqrhnwicgbgwzttopla)
1. **Dry run first.** Before any write, show what would change (counts, the rows, borderline cases) and wait
   for the user's approval of that change. A write the user approved earlier does not cover a new one.
2. **One transaction per change**, with:
   - a backup table first (`wi_mandates_backup_<date>_<topic>`, or the staging table's equivalent),
   - a `wi_fill_log` entry for every row or value changed (old value, new value, source naming the approval),
   - the SQL kept in a repo file (`repair-<topic>-<date>.sql`) with an `-- UNDO:` statement.
3. **No hard deletes or drops** to remove data: soft-delete (`deleted_at`), hide (`validation_status`) or
   filter instead. Dropping a temporary helper object is fine when the user asks.
4. **Never change the user's own decisions:** a manual verdict (`verdict_source = 'manual'`) or a person's Tech
   choice (`tech_signal` starting "Set by a person"). Andrew Carnegie (1358) is not to be touched.
5. **Rules change in three places together:** the console (`app.js` rescore), WI 01 ("Apply Taranis Hard
   Criteria" / "Build Mandate SQL", copies in `n8n/`), and the database guard where one exists. Tests in
   `tests/` cover each; run `npm test` before committing.

## With Intelligence token
6. **Never read or print `wi_auth_token`** (the access token). Its expiry may be checked with
   `expires_at` only.
7. **Token refresh rule:** before any live With Intelligence read, check the token's expiry. If it has expired,
   or a read hits a sign-in page or a CAPTCHA, stop and ask the user to refresh it. Never retry in a loop.
   Live reads are paced (seconds between calls), one investor at a time.

## Workflows (n8n)
8. Never edit or publish a live (published) workflow without the user's approval. Show the change (a diff
   of the node code) first. Keep the code copy and a `before-<date>` copy in `n8n/`, and note the published
   version and its undo version in `n8n/README.md`.
9. Enrichment: WI 01b enriches alerts as they arrive. WI 01c is the rebuilt daily backfill (05:47 UTC) for alerts WI 01b
   missed: it must stay fill-blanks-only, write money in full dollars, map countries through the full ISO list, and log
   every value in `wi_fill_log`. The old every-3-hours WI 01c code (overwrites, millions, no log) must never come back.

## Code and pull requests
10. Develop on the branch the session names. Show screenshots before merging any UI change.
11. Commit messages and PRs carry no model names.
12. Keep secrets out of replies, commits and logs: no keys, passwords or tokens.

## When something times out or is unclear
13. If a query or call times out, stop and report it. Do not retry in a loop. Offer the SQL file instead.
14. When a value is borderline (e.g. long-only versus long/short), flag it for the user rather than deciding it.
