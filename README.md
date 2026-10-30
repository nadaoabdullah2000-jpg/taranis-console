# Taranis Console

Replaces the Telegram bots with a signed-in web console over the same
eighteen n8n workflows and the same Supabase database.

---

## What the eighteen workflows actually are

Reading them changed the shape of the job. Only **three** take input from
Telegram. The other fifteen only *send* to it.

**Telegram is the front door (3)** — these are what the app replaces:

| Workflow | What you type into it |
|---|---|
| `ishH4fg2k9KHjCvS` Taranis Contact bot v4 | Free questions, add/remove contacts, file uploads. 76 nodes, 3 AI agents, pgvector notes search |
| `P7WV6Yt6NT2USMiF` WI approval | `Approve` · `Reject` · `Edit <id> field=…` · `Fill <id> <field> <value>` · `Accept <id>` |
| `PYx8P27QopOme17N` CRM 02+03 Email drafting & send | `Draft email to <name>` then `Approve <draft_id>` |

**Telegram is only the output (15)** — these keep running untouched; they
just write to `app_notifications` as well:

`WI 01` intake/qualify · `CRM 00` backfill · `CRM 01` inbox+sent sync ·
`CRM 04` new contacts · `CRM 05` follow-up reminders · `CRM 06` Excel export ·
`CRM 07` refresh last contact · `CRM 08` summarise · `CRM 09` group queue ·
`LI 01`/`LI 02` LinkedIn · `OPS` health · `OPS 02` weekly dashboard ·
`OPS` schema · `Execute SQL query`

So the migration is much smaller than it looks: **three entry points to
rebuild, fifteen output taps to duplicate.**

---

## Architecture

```
Browser (GitHub Pages, static, no secrets)
   │  Authorization: Bearer <Supabase JWT>
   ▼
n8n Gateway workflow  ── verifies JWT, checks console_users, logs to console_audit
   │
   ├─ wi.review.* ──────► P7WV6Yt6NT2USMiF   (existing logic, Telegram nodes bypassed)
   ├─ crm.email.* ──────► PYx8P27QopOme17N
   ├─ assistant.ask ────► ishH4fg2k9KHjCvS   (the agent, minus the Telegram wrapper)
   ├─ contacts / opps / docs / li ─► direct Postgres reads
   └─ zoom.* ───────────► new workflow, to build
   ▼
Supabase Postgres — contacts, crm_emails, wi_mandates, documents,
                    linkedin_connections + the new console tables
```

One webhook, an `action` field, a `switch` node. Structurally identical to
the `Route CRM Action` and `Route WI Review Command` switches you already
have — the router moves from Telegram text prefixes to JSON actions.

---

## Three things you asked for that need correcting

**1. "Make the HTML completely secured."** A static page on GitHub cannot
hold a secret. Anyone can read its source. So the security is not *in* the
HTML — the HTML holds nothing worth stealing, and the gateway does the
checking. What is in place:

- No bot token, no database password, no n8n API key, no `service_role` key
  in any file that ships. The only key present is the Supabase **anon** key,
  which is meant to be public and is governed by RLS.
- Every request carries a signed JWT. n8n verifies it and looks the email up
  in `console_users` before doing anything. Today's check is
  `message.from.id === '848084617'` — a Telegram user id, which is not a
  credential and cannot be revoked.
- Content-Security-Policy restricts the app to your two origins.
- Nothing from the database or the assistant is written with `innerHTML`.
  The assistant's Telegram HTML goes through an explicit allow-list
  (`<b> <i> <code> <a>`), and `href` must be `http(s)` — no `javascript:`.
- The deploy step greps for service keys, private keys and Telegram bot
  tokens and **fails the build** rather than publish one.
- `console_audit` replaces the Telegram thread as the record of who did what.

**2. "Put the HTML in GitHub so workflow updates reflect in it."** This is
backwards, and worth saying plainly: GitHub deploys the *app*. What keeps
the app current with the workflows is that both read the same Supabase
tables and call the same workflows. Change a query in n8n and the console
shows the new result on next load — no redeploy. Push to `main` and Pages
redeploys the app itself in about a minute.

**3. "A tab for Zoom meetings."** None of the eighteen workflows touch Zoom.
The tab is built and the `meetings` table is in the schema, but there is no
workflow behind it yet — that is new work, not a migration. The tab says so
on screen rather than pretending.

---

## Setup

1. **Database** — run `schema.sql` in the Supabase SQL editor. Change the
   seeded admin email first.
2. **Auth** — Supabase → Authentication → enable Email, turn *off* public
   sign-ups, add your redirect URL (the Pages URL).
3. **Gateway** — one n8n workflow, Webhook trigger at `/webhook/console`,
   JWT verify → `console_users` lookup → switch on `action` →
   Execute Sub-workflow → Respond to Webhook.
4. **Deploy** — push to GitHub, set repo secrets `GATEWAY_URL`,
   `SUPABASE_URL`, `SUPABASE_ANON_KEY`, enable Pages (source: Actions).

Open `index.html` and click **Open the sample console** to see the whole
interface working on sample data before any of this exists.

---

## Migration order — do not deactivate anything yet

Turning off eighteen live workflows before the replacement is proven is how
a fundraise loses a week of alerts. Run both for a fortnight.

1. **Duplicate, don't move.** Add one `notify_console(...)` call beside each
   existing Telegram send node. Both fire. Nothing breaks.
2. **Build the gateway** and point the console at it. Read-only tabs first —
   Contacts, Opportunities, Documents, Network. No writes, no risk.
3. **Move the three input bots.** For each, add a Webhook trigger *alongside*
   the Telegram trigger into the same router. Both doors, one room.
4. **Watch for two weeks.** Every approval done in the console should show up
   in `console_audit` and produce the same database change as the bot did.
5. **Then unpublish the Telegram triggers** — one workflow at a time, in this
   order: WI approval → email drafting → contact bot. Keep the group
   announcement queue (`1GQeceKJidmcUyHj`) on Telegram until last; the team
   group is a separate audience from you.

---

## Gateway action contract

| Action | Payload | Returns |
|---|---|---|
| `today.counts` | — | `{unread, pending_reviews}` |
| `today.feed` | — | `{items:[…]}` |
| `wi.reviews.pending` | — | `{rows:[…]}` |
| `wi.review.approve` | `{review_id}` | `{ok}` |
| `wi.review.reject` | `{review_id}` | `{ok}` |
| `wi.review.edit` | `{review_id, field, value}` | `{ok}` |
| `wi.mandates.list` | `{limit}` | `{rows:[…]}` |
| `wi.mandate.fill` | `{id, field, value}` | `{ok}` |
| `wi.mandate.accept` | `{id}` | `{ok}` |
| `contacts.search` | `{q, filter}` | `{rows:[…]}` |
| `crm.email.draft` | `{to, brief}` | `{draft_id, to_addr, subject, body}` |
| `crm.email.send` | `{draft_id, body}` | `{ok}` |
| `assistant.ask` | `{question}` | `{answer, sources:[…]}` |
| `docs.list` | — | `{rows:[…]}` |
| `li.search` | `{q}` | `{rows:[…]}` |
| `search.suggest` | `{q, limit?}` | `{suggestions:[{name, kind, count}]}` |
| `search.company` | `{name}` | `{mandates:[…], contacts:[…], documents:[…], network:[…]}` |
| `zoom.create` / `zoom.upcoming` | `{contact,start,minutes}` | `{join_url,…}` |

`search.suggest` / `search.company` are thin wrappers over two database
functions, `console_search_suggest($1, $2)` and `console_search_company($1)`
(schema-13). The console calls the same functions directly through
`/rest/v1/rpc/…` and uses the gateway only when it has no Supabase session.
The typed text is a bound parameter on both paths, never SQL text. Node setup:
[docs/gateway-search-actions.md](docs/gateway-search-actions.md).

### Matching an iConnections export (schema-15)

Opportunities → **Match an iConnections export**. Read-only against
Opportunities: it compares, it does not import. (**Import an investor list**
is the one that writes.) Database only, no gateway action:

1. The browser reads the .xlsx itself (`iconnections.js`, no library, loaded on
   demand). It skips a cover sheet, finds the header row, maps the columns
   (allocator name required; website, AUM, type and country if present) and
   lets you change the mapping. A legacy .xls, an encrypted file or an unknown
   cell type stops the import with the reason and the cell, never a partial read.
2. Rows go to `console_iconnections_match` 250 at a time. A run is keyed on the
   file's SHA-256, so the same file again reuses its run (`import_no` + 1)
   instead of adding rows. Staged in `iconnections_import_runs` / `_rows`.
3. Matching, in order: exact normalised name → alias (`investor_aliases`, or a
   bracketed acronym) → trigram score. Thresholds are in `iconn_thresholds()`:
   0.75 and up is a match, 0.45 to 0.75 is Needs review, below is No match.
4. `console_iconnections_run` returns one entry per firm. A contacts export
   (Name + Firm, one row per person) is folded to one row per firm with a
   contact count: in the browser on exact text, then on the normalised name.
   People's names go with their firm's row and are stored with the run
   (`iconnections_import_rows.people`, schema-18), nowhere else.
   A duplicate is several opportunity rows behind one firm, or several firms
   landing on one opportunity. A conflict is a disagreement on AUM (more than
   2× apart), type group, country, or a website whose contacts work elsewhere.
   Columns the file does not have are not compared, so they never create or
   remove a match or a conflict.
5. The results are a table: Firm (contacts) · Intelligence profile (the Search
   view of the firm) · Opportunity (name and status) · Match rank (score and
   method, sortable). A row is red when every opportunity behind the match is
   rejected: `new_qualification = 'rejected'`, or `qualification` where
   `new_qualification` is empty, the same test as the Rejected tab. Amber is
   Needs review, grey is No match. The last column is the **Taranis fit**
   (schema-16): `coalesce(new_fit_score, fit_score)` of the same opportunity
   row the Opportunity column shows, with `fit_reason` (the AI's intake note)
   on hover. A firm in review shows its top candidate's fit, marked as not
   confirmed, and sorts below every confirmed match. How the name matched
   stays under the opportunity, worded as the iConnections side
   ("iConnections match: exact 100%"), apart from the Taranis status.
   One representative row per firm (`iconnRep`): the row the matcher chose
   behind the match (most in play, newest first). The Opportunity status,
   the fit and the verdict chips all read that row, as loaded with
   `MANDATE_LIST_COLS`, else as staged; a run staged before schema-16 has
   no stored fit, and the same row fills it.
   Chips: Everything; **Taranis verdict** of that row for matched firms, one
   chip per verdict present (Matched, Uncertain, Low fit, Needs data,
   Rejected); then the name-match state, **iConnections — matched / review /
   no match**; Duplicates; Conflicts.
   Where that opportunity's verdict is `needs_data`, the cell shows the same
   "NEEDS DATA · x/3" meter as its Opportunities card instead of a number:
   x = `critOf()`, how many of the three criteria (buys hedge funds,
   long/short or quant, technology focus) the record shows. Those rows sort
   after the scored ones. Clicking the cell shows the stored score
   (re-score and intake score), the status, the three criteria and the AI
   note. The rows are read client-side with `MANDATE_LIST_COLS`, so no
   extra backend field is needed. Earlier matches are listed at the top of
   the page, and hidden when there are none.
   Right of Firm, **Investors** lists the people from the file's name column
   (Name / Contact / Full name, or First + Last) for that firm, deduped, the
   first four then "+N more". The browser reads them from the file
   (`peopleByRow`) and sends each firm's names with its row; schema-18
   stores them on the staged row and `console_iconnections_run` returns them
   per firm, each name once, in sheet order, so a run reopened from Earlier
   matches shows them too. They live only in the iConnections staging
   tables (not Opportunities or contacts) and are replaced when the file is
   matched again. With no name column, or for a run staged before
   schema-18, the column is hidden.
   A **Company profile** box at the top opens
   the same Search view for any company typed, in the file or not, with Back
   returning to the results. Nothing on this page links to With Intelligence.

**Earlier matches** lists one row per file name: runs are keyed on the
file's SHA-256, so a re-saved copy is another run, and the list shows the
newest and counts the rest. **Remove** (schema-17) stamps `hidden_at` on
that name's runs in `iconnections_import_runs`, by id, through the update
console users already have on it. Nothing is deleted and nothing outside
that staging table changes; matching the file again clears the stamp on its
run. Before schema-17 the list still collapses, without Remove.

`investor_aliases` can be edited from the Supabase table editor by console
users, or from a Needs-review row (**Same firm — remember**).
`tests/fixtures/iconnections-sample.xlsx` is a sample export with one row for
each case.

`wi.mandate.fill` must keep the allow-list from `Parse WI Fill` — the current
node builds SQL by string concatenation, which is safe only because that list
exists. Behind a web form it needs parameterised queries instead.
