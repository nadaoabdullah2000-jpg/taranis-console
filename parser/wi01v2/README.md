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
| `fixtures/` | Blocks taken from real WI emails (12–13 Oct). Kept out of this public repo; see below. |

## Running the tests

```
node test/run.js active     # the published code
node test/run.js proposed   # the news-headline fix
node test/run.js previous   # the code before 12 Oct
```

Each fixture lists the `investor_name` every version must give (`expect`). The
runner exits non-zero if one differs.

## Rolling back

To return WI 01 v2 to the code before the 12 Oct fix:

1. Set each node's code to the matching file in `nodes/previous-e6d4c5a5/`.
2. Publish the workflow.

n8n's version history also holds `e6d4c5a5` and can restore it whole. Its other
nodes are identical to `e8e08232`, which changed only these two nodes.

## Why the real-email fixtures are not here

The 12–13 Oct fixtures are snippets of paid With Intelligence alert emails,
with real people's names in them. This repository is public, so they are kept
out of it until that is decided.

`test/run.js` runs whatever fixture files exist. The real-email sets load
automatically when they are placed in `fixtures/`.
