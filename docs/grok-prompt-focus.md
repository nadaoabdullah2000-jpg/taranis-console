# Grok prompt: Technology focus and Emerging managers (11 Nov 2026)

A one-off pass on two fields only. Add this section to Grok's prompt for the pass. It does not
change the mandates or I-Connections sections.

---

## Focus pass: Technology focus and Emerging managers

Ask `todo` with scope `focus` and offset 0 (`{"action": "todo", "scope": "focus", "limit": 20, "offset": 0}`).
Each item is one investor from the user's list (`kind: "mandates"`) or one I-Connections firm with a
sure With Intelligence link (`kind: "iconnections"`) where at least one of the two fields is blank.
Investors you checked before are included: this pass ignores the 30-day skip.

Each item gives you `kind`, `id`, `investor_name`, `wi_id`, `wi_url` and `missing` (which of
`tech_focus` and `open_to_emerging_managers` to look for). Look only for the fields in `missing`.

### Where to look
Open `wi_url` and read the profile summary, the investment preferences and attributes, the asset
classes and strategies, and the investor's mandates and searches. If the item has no `wi_url`,
search With Intelligence by name. Use a profile only when you are sure it is this investor (same
rules as the I-Connections section). Otherwise record both fields as not stated, with the note
"No With Intelligence profile found (searched: …)".

### Technology focus (`tech_focus`) (tightened 11 Nov 2026, from batch 10 on)
- Counts only for **hedge funds or public markets**: the firm's hedge fund, long/short, listed
  equity or other public-markets investing, or its whole portfolio with no restriction to private
  markets. Same rule as Emerging managers.
- `true`: the profile says the investor targets technology there: tech, software, TMT, internet,
  fintech, semiconductors, AI as an investment theme, or technology-focused managers or funds.
- `false`: only when the profile says it avoids or excludes technology.
- Either value needs `tech_evidence`: the sentence from the profile, quoted (10 to 300 characters).
- **Does not count as a technology focus** (leave blank, record `not_stated`):
  - the firm's own use of technology or AI to run its portfolio or operations ("AI-enabled
    investment strategies", "uses AI in its investment process");
  - wanting tech-savvy managers or a manager's "technological / informational edge";
  - a generic list of industries or tags (With Intelligence's industry menu) where technology is one
    item among many; an "investment themes" sentence is not a generic list (see above);
  - a market view ("the AI-driven economy") that is not a stated allocation;
  - the name of a plan or company ("Virginia Tech Foundation", "… Technologies"); biotech or
    healthcare alone.
- **An "investment themes" line counts** (decided 11 Nov 2026): when the profile says "The investor's
  primary investment themes over the next 12-18 months focus on artificial intelligence, … financial
  technology, …" (or "Key investment themes include …") and at least one theme is technology (AI,
  data, digital infrastructure, fintech, software, semiconductors, cybersecurity, blockchain, deep
  tech), save `tech_focus: true` with that whole line as `tech_evidence`, unless the line is limited
  to the private equity or venture book (then `private_markets_only`).
  - **Where it is** (11 Nov 2026): usually at the end of the investor's **intentions** on With
    Intelligence ("Planning to make new commitments ... The investor's primary investment themes over
    the next 12-18 months focus on ..."), not in the profile summary. Read the intentions, newest
    first. The same line is often repeated on several intentions (one per asset class): it counts when
    at least one of those intentions is not private equity / venture / private credit / real estate /
    infrastructure only.
  - The singular form counts too: "The investor's investment theme over the next 12-18 months
    includes artificial intelligence."
  - Technology themes: AI / machine learning, data, digital infrastructure, fintech / financial
    technology, software, semiconductors, cybersecurity, blockchain, deep tech. Healthcare and
    longevity, energy transition, sustainability, security and defence are not technology.
  - **Security and defence (or space) in the line means Space = Yes**, not Technology: put the whole
    line in your `checked` note for the Technology field ("themes line: security and defence, not
    technology") so the user can set Space from it.
- Technology mentioned **only** for private equity, private debt, venture or infrastructure →
  do not save; record `private_markets_only` with a note saying where (e.g. "Tech sector bias in
  its private equity programme only").
- Nothing about technology → do not save; record it as `not_stated` (below).

### Emerging managers (`open_to_emerging_managers`)
- Counts only for **hedge funds or public markets**: hedge funds, long/short, absolute return,
  listed equities, fixed income or credit, or the whole portfolio with no restriction to private
  markets.
- `true`: the profile says the investor backs emerging, new, first-time or early-stage managers there.
- `false`: the profile says it does not back emerging or new managers there.
- Either value needs `emerging_evidence`: the sentence from the profile, quoted (10 to 300
  characters). A quote that mentions emerging managers only for private equity, private debt or
  credit, venture capital, buyouts, real estate or infrastructure is refused.
- Emerging managers mentioned **only** for private markets → do not save; record
  `private_markets_only` with a note saying where (e.g. "Emerging managers: private equity
  first-time funds only").
- Nothing about emerging managers → record `not_stated`.

### What to send
1. A field the profile states → `save` with `scope` = the item's `kind`, `dry_run: true` first, then
   the same call with `dry_run: false`.
   - mandates: `{"action": "save", "scope": "mandates", "dry_run": true, "items": [{"id": "<id>", "wi_id": "<wi_id>", "fields": {"tech_focus": true, "tech_evidence": "…", "open_to_emerging_managers": true, "emerging_evidence": "…"}}]}`
   - iconnections: the same, with `"scope": "iconnections"`, `"certain": true` and the item's `wi_id`.
2. Then **always** `checked` with `scope` = the item's `kind`, `result: "done"`, and one entry in
   `fields` for every field in `missing` that you did not save:
   `{"action": "checked", "scope": "mandates", "items": [{"id": "<id>", "result": "done", "note": "focus pass", "fields": [{"field": "tech_focus", "result": "not_stated", "note": "profile summary, preferences, mandates"}, {"field": "open_to_emerging_managers", "result": "private_markets_only", "note": "first-time funds in private equity only"}]}]}`
   - `result` is `not_stated` or `private_markets_only` (both fields).
   - `note` says where you looked (at least 5 characters, at most 300).
   - No sure profile found → `"result": "no_profile"` and both fields `not_stated`, with the note
     "No With Intelligence profile found (searched: …)".
3. Ask `todo` focus again with offset 0. An item drops out once both of its fields are filled or
   recorded. Stop when `left_to_check` is 0.

### Never
- Never change a field that already has a value: `save` fills blanks only and says "has a value
  already".
- Never touch the user's own decisions: a Technology choice set by a person is never changed.
- Never guess. No quote means no value.
- Never read or print the With Intelligence access token.

At the end, report: items done, fields saved (true / false for each field), fields recorded as not
stated, fields recorded as private markets only, and anything `save` or `checked` refused.
