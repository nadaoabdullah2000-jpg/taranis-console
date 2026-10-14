# WI 01 v2 parser: code, rollback point and tests

This folder saves the code of two Code nodes in the n8n workflow
**WI 01 v2 — Intake, Split, Extract, Qualify** (`PXfQqCr3fR7H9YQr`):
**Deterministic Extraction** and **Normalize + Record Key**. Together they find
each block's investor name.

n8n is the source of truth: these files are copies. Nothing here deploys
anything.

| Path | What it is |
|---|---|
| `nodes/active-e8e08232/` | The published code, version `e8e08232-a13f-4b96-8aea-ae344d3316e2` (published 12 Oct 2026). Exported 14 Oct 2026; matches the live nodes byte for byte. |
| `nodes/previous-e6d4c5a5/` | The code before the 12 Oct header fix (version `e6d4c5a5-6fc7-4afc-b53f-ffabc844716a`). **This is the rollback point.** |
| `proposed/deterministic-extraction.news-headline-fix.js` | The 13 Oct news-headline fix. **Not deployed.** It is one line different from the active file. |
| `test/run.js` | Runs the node code outside n8n on fixture blocks. |
| `test/synthetic.fixtures.js` | Made-up blocks (news, an announcement, a people move). |
| `test/*.scrubbed.fixtures.js` | Scrubbed stand-ins for the real-email fixtures, safe to publish. Same markup and parser paths; names and prose made up. |
| `test/compare-scrubbed.js` | Proves each scrubbed case takes the same parser path as its real original (needs `fixtures/`). |
| `fixtures/` | Blocks taken from real WI emails (12–13 Oct). Git-ignored; never committed. See below. |

## Running the tests

```
node test/run.js active     # the published code
node test/run.js proposed   # the news-headline fix
node test/run.js previous   # the code before 12 Oct
node test/run.js active scrubbed   # only the committed fixtures (also: real, all)
node test/compare-scrubbed.js      # scrubbed vs real, path by path
```

Each fixture lists the `investor_name` every version must give (`expect`). The
runner exits non-zero if one differs.

## Rolling back

To return WI 01 v2 to the code before the 12 Oct fix:

1. Set each node's code to the matching file in `nodes/previous-e6d4c5a5/`.
2. Publish the workflow.

n8n's version history also holds `e6d4c5a5` and can restore it whole. Its other
nodes are identical to `e8e08232`, which changed only these two nodes.

## Real-email fixtures and their scrubbed copies

The 12–13 Oct fixtures are snippets of paid With Intelligence alert emails,
with real people's names in them. This repository is public, so they stay out
of it (`fixtures/` is in `.gitignore`).

The committed `test/*.scrubbed.fixtures.js` replace every firm, person and line
of article prose with made-up text of the same shape. Everything the parser
reads is kept: the HTML and its inline styles, the dot-spacer table and the
gap it makes between the "Investor" label and the name (672 characters in the
NYU case), the Investor/Investors/Managers sub-labels, category titles, dates,
headline punctuation and whether a known verb is present, asset-class and
region lines, button labels, and the mis-encoded quotes (`â`). One vendor
phrase is kept word for word, because Deterministic Extraction matches it
exactly: "A new Investor profile has been added to With Intelligence".

`test/compare-scrubbed.js` runs each real case and its scrubbed copy through
the active, proposed and previous code. For each one it checks that the name
comes from the same place (header span, stated subject, headline cut, model or
none), along with parse drift, category, item type, date, asset class, region,
links, and the header gap. On 14 Oct 2026 it found no differences across 54
case/version pairs.

To run against the real originals, put the two files back in `fixtures/`.
