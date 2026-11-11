# Grok prompt: discover new investors (11 Nov 2026)

Same gateway as before (same webhook URL, same `x-api-key` header). Two new actions.
Nothing Grok sends here reaches Opportunities: finds are staged in `grok.wi_discovered` and the
user reviews them separately.

---

## Discovering new investors from a filtered With Intelligence search

Run the user's saved With Intelligence search (the filter preset). For each **investor** profile in
the results (not a manager, fund or consultant page), read the profile and send it with `discover`.

### 0. Scheduled runs: start from the baseline in the database
Before a scheduled run (e.g. the daily 8:00 run), ask which investors are staged already:
```json
{ "action": "discover_known", "preset": "HF L/S, tech, US+UK", "limit": 1000, "offset": 0 }
```
It returns `total`, `wi_ids` (sorted) and `items` (wi_id, name, presets, first_seen, last_seen,
review_status). Leave out `preset` to get every staged investor. Page with `offset` when `total` is
larger than `limit` (up to 5000 per call). Send `discover` only for search results whose wi_id is not
in this list. Resending one is harmless: it updates the record and never duplicates it. Do not keep
your own list between runs: this is the list.

The first full pass (11 Nov 2026) has no baseline: send every investor the preset returns.

### Recapture of the first pass (11 Nov 2026): industries, themes, intentions
The first pass stored With Intelligence industries for only 4 of the 99 investors and no themes line,
so Technology cannot be judged. For each of the 99 (get them with `discover_known`), open the profile
again and send `discover` (dry run first, then `"dry_run": false`) with the same `wi_id` and `name` and:
- `industries`: every industry or sector the profile lists (e.g. ["Technology", "Software & Computer
  Services", "Artificial Intelligence"]);
- `investment_themes`: the profile's themes line exactly as written (e.g. "The investor's primary
  investment themes over the next 12-18 months focus on artificial intelligence, digital
  infrastructure, and financial technology."); leave it out if the profile has none;
- `intentions`: every intention, search or mandate on the profile, newest first, `{date, type, text}`;
- `tech_focus` / `tech_evidence` under the Technology rule of the focus pass: a themes line naming a
  technology theme counts; the firm's own use of AI, a manager's "tech edge", an industry tag list
  alone, or tech only in private equity / venture do not.
Fields you leave out keep what is stored; intentions are added, never duplicated. `discover_status`
shows `missing_industries`, `missing_investment_themes` and `missing_intentions` going down.

### 1. Send a batch (up to 50 investors per call), dry run first
```json
{
  "action": "discover",
  "dry_run": true,
  "items": [
    {
      "wi_id": "2147330065",
      "name": "Example Family Office",
      "profile_url": "https://platform.withintelligence.com/explore/investors/2147330065",
      "filter_preset": "HF L/S, tech, US+UK",
      "summary": "Single-family office based in London ... (the profile summary, as written)",
      "investor_type": "Single-Family Office",
      "country": "GB",
      "region": "Europe",
      "aum_usd": 2500000000,
      "aum_band": "$1bn - $5bn",
      "ticket_min_usd": 5000000,
      "ticket_max_usd": 25000000,
      "asset_classes": ["Hedge Funds", "Equity", "Private Equity"],
      "strategies": ["Long/Short Equity", "Equity Market Neutral"],
      "strategy_focus": "Equity long/short, fundamental",
      "industries": ["Technology", "Healthcare"],
      "investment_themes": "The investor's primary investment themes over the next 12-18 months focus on artificial intelligence and financial technology.",
      "approach": "Invests directly with managers; uses Cambridge Associates as consultant",
      "emerging_managers": true,
      "emerging_evidence": "Considers emerging managers and first-time funds for its hedge fund portfolio.",
      "tech_focus": true,
      "tech_evidence": "Favours technology and software-focused long/short managers.",
      "intentions": [
        { "date": "2026-10-28", "type": "Intention", "text": "Plans to add two equity long/short managers over the next 12 months." },
        { "date": "2026-09-02", "type": "Search", "text": "Searching for a global macro manager." }
      ],
      "contacts": [
        { "name": "Jane Doe", "title": "Chief Investment Officer", "email": "jane.doe@example.com" },
        { "name": "John Roe", "title": "Investment Analyst", "email": null }
      ],
      "raw_json": { "anything_else": "fields the profile shows that have no column above" }
    }
  ]
}
```

Read the reply. Each item comes back `would_add` (new), `would_update` (seen before, with
`changed` listing the fields that differ) or `error` (with the reasons). Fix the errors, then send
the same call with `"dry_run": false`. The reply then says `new` or `updated`.

### Field rules
- **Required:** `wi_id` (digits, the number in the profile link) and `name`. Instead of `wi_id` you
  can send `profile_url` ending in `/investors/<id>`. Never a manager, fund or consultant page.
- **Money** (`aum_usd`, `ticket_min_usd`, `ticket_max_usd`): a number in US dollars, not text
  ("$2.5bn" → `2500000000`). Convert other currencies at the rate the profile shows, else leave it
  out and put the original in `raw_json`.
- **Lists** (`asset_classes`, `strategies`, `industries`): lists of the names With Intelligence uses.
- **`emerging_managers` / `tech_focus`:** `true`, `false` or leave out (not stated). A `true` or
  `false` needs the quote in `emerging_evidence` / `tech_evidence`. Emerging managers counts only
  for hedge funds or public markets: if the profile mentions them for private equity or private
  debt only, leave `emerging_managers` out and put the quote in `raw_json.emerging_private_only`.
- **`intentions`:** every intention or search on the profile, newest first: `date` as YYYY-MM-DD,
  `type` (Intention, Search, Mandate...), `text` as written.
- **`contacts`:** name (required), title, e-mail as shown on the profile. Leave out an e-mail you
  don't see; never guess one.
- **`filter_preset`:** the name of the saved search you ran, the same on every item from it.
- **`raw_json`:** anything else useful (attributes, consultant, notes), as an object.
- Leave out what the profile doesn't show. Never guess.

### Seen again
Sending a `wi_id` that is already staged updates it. A field you send replaces the stored value; a
field you leave out keeps it. Intentions and contacts are added, without duplicates. The preset is
added to the list of presets that found it.

### 2. Check progress
```json
{ "action": "discover_status", "limit": 50, "offset": 0 }
```
It returns `totals`:
- `staged`;
- `new`: not in the user's tool at all;
- `in_opportunities`: already there, matched by With Intelligence id first, then by name;
- `only_in_rejected`;
- `seen_more_than_once`.

It also returns `by_preset` and the list of new finds. Report these numbers at the end.

### Never
- Never use `save` for these: `save` only fills blanks on investors the user already has.
- Never send a manager, fund or consultant profile as an investor.
- Never read or print the With Intelligence access token.
