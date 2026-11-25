You can now send whole files and lists to the Taranis web app. Use the new upload endpoint for files and lists. Keep using the existing gateway for single fixes.

ENDPOINT
POST https://quantcairo.app.n8n.cloud/webhook/grok-ingest
Header: x-api-key: <the same key you use for /webhook/grok-data>
Content-Type: application/json

BODY
{
  "source": "opportunities" | "iconnections" | "preqin",
  "file_base64": "<the whole .xlsx file, base64>",   // OR "rows": [ {...}, {...} ]  (never both)
  "file_name": "preqin-hedge-fund-investors-2026-11-25.xlsx",
  "dry_run": true,                                    // always true first
  "plan_id": "<only when dry_run is false>"
}

WHICH SOURCE
- preqin: investors you exported or read from Preqin. They are staged on the Preqin tab and linked to an existing Opportunity when the name or With Intelligence id matches.
- iconnections: allocators from iConnections. These are staged in the iConnections import the same way.
- opportunities: facts about investors that are ALREADY in Opportunities (for example from a With Intelligence profile). These only fill blanks on the matching Opportunity. An investor that is not in Opportunities is skipped. Send new With Intelligence investors with the gateway's "discover" action instead.

ROWS (Excel columns or JSON keys; one row per firm)
- Required: name (the firm's legal or common name, never a person's name).
- Useful: website, aum (for example "$1-5bn", "2.5bn", or a number in a column named "AUM (USD mn)"), investor_type, country (a name or ISO code), city, strategies, asset_classes, ticket_min_usd, ticket_max_usd, min_manager_aum_usd, summary, people (contact names separated by ";"), email, title, wi_url (https://platform.withintelligence.com/explore/investors/<id>), preqin_id.
- Money is in full US dollars. Never send 25 to mean 25 million: write 25000000, "25m", or use a unit in the header.
- open_to_emerging_managers or tech_focus (true/false) only with emerging_evidence or tech_evidence. The evidence must be a short quote from the profile that is about hedge funds or public markets. Otherwise leave them out.
- Leave a cell empty when you do not know the value. Never guess.
- At most 1000 rows per upload. The .xlsx is read from its first sheet.

THE TWO-STEP RULE (always)
1. Send with "dry_run": true. The reply has:
   - inserted / updated / skipped / conflicts, the counts of what WOULD happen;
   - details, the firm names and reasons;
   - columns_read and columns_not_used;
   - problems, the values left blank (for example "AUM 250 with no unit");
   - plan_id.
2. Show me the summary: the counts, every conflict, every problem, and the columns not used. Wait for my OK.
3. After my OK, send exactly the same file or rows again with "dry_run": false and the plan_id. If anything changed, the plan_id no longer fits and the write is refused. Run a new dry run.
4. Report what was written. The reply's "run" names the change set; "save_runs" are the Opportunities changes, which the gateway's save_undo can undo.

WHAT THE APP DOES FOR YOU (do not try to do it yourself)
- Fills blanks only. It never overwrites a value, a person's decision or a verdict. A fill that would change a verdict is returned as a conflict for me to review.
- Merges repeated firms in one upload (same website or same name).
- Matches firms to Opportunities by With Intelligence id, then by name. When several Opportunities could match, it returns a conflict with the candidates. It never guesses.
- Logs every value (wi_fill_log and ingest_log) and records where each field came from.
- Never creates an Opportunity from an upload.

IF SOMETHING GOES WRONG
- A 400 reply gives the reason. Fix it and run the dry run again. Do not retry the same request in a loop.
- A 401 reply means the key is wrong. Stop and tell me.
