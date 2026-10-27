"""Builds a self-contained copy of the dashboard (dashboard_standalone.html).
It inlines d3, every dataset CSV and the dashboard page, and supplies a small
stand-in for the dashboard runtime (dash.data / onData / calc / colors) plus the
theme tokens the page uses, so the file opens in any browser without network.

usage: build_standalone_dashboard.py <d3.min.js> <page.html> <out.html>"""
import csv, json, os, sys

D3, PAGE, OUT = sys.argv[1:4]
HERE = os.path.dirname(os.path.abspath(__file__))
INTL = os.path.join(HERE, "..", "tms-linkedin-competitive-2026-10", "data")
SWISS = os.path.join(HERE, "data")

DATASETS = {
    "cadence": (INTL, "cadence.csv"), "competitors": (INTL, "competitors.csv"),
    "product_pages": (INTL, "product_pages.csv"), "linkedin_compare": (INTL, "linkedin_compare.csv"),
    "monchau_monthly": (INTL, "monchau_monthly.csv"), "monchau_format": (INTL, "monchau_format.csv"),
    "monchau_mix": (INTL, "monchau_mix.csv"), "monchau_topics": (INTL, "monchau_topics.csv"),
    "monchau_reactions": (INTL, "monchau_reactions.csv"), "voices": (INTL, "voices.csv"),
    "plan": (INTL, "plan.csv"), "posts_raw": (INTL, "posts_raw.csv"),
    "swiss_cadence": (SWISS, "swiss_cadence.csv"), "swiss_linkedin": (SWISS, "swiss_linkedin.csv"),
    "swiss_formats": (SWISS, "swiss_formats.csv"), "swiss_topics": (SWISS, "swiss_topics.csv"),
    "swiss_pages": (SWISS, "swiss_pages.csv"), "swiss_positioning": (SWISS, "swiss_positioning.csv"),
    "swiss_peers": (SWISS, "swiss_peers.csv"), "swiss_plan": (SWISS, "swiss_plan.csv"),
    "swiss_posts_raw": (SWISS, "swiss_posts_raw.csv"),
}

data = {}
for ds, (folder, name) in DATASETS.items():
    with open(os.path.join(folder, name), newline="", encoding="utf-8") as f:
        r = csv.DictReader(f)
        data[ds] = {"columns": r.fieldnames, "rows": list(r)}

d3 = open(D3, encoding="utf-8").read()
page = open(PAGE, encoding="utf-8").read()

TOKENS = """
:root{color-scheme:light;
--color-fg:#1d1c1a;--color-fg-muted:#6b6a64;--color-bg:#faf9f6;--color-panel:#ffffff;--color-border-line:#e4e2dc;
--color-ok:#1e7a3c;--color-warn:#a26100;--color-bad:#c0392b;
--cds-chart-grid:#ecebe6;--cds-chart-axis:#c9c7bf;--cds-chart-muted:#c4c2ba;--cds-chart-reference:#8a887f;
--cds-surface-popover:#ffffff;--cds-border:#dddbd4;--cds-shadow-popover:0 4px 14px rgba(0,0,0,.10);--cds-text-secondary:#6b6a64;
--cds-radius:10px;--cds-pad-xs:4px;--cds-pad-sm:8px;--cds-pad-md:12px;--cds-pad-lg:16px;
--cds-gap-xs:4px;--cds-gap-sm:8px;--cds-gap-md:14px;--cds-gap-lg:20px;--cds-gap-xl:32px;
--cds-font-size-caption:12px;--cds-font-size-body:14px;--cds-font-size-heading:16px;--cds-font-size-title:28px;
--cds-font-weight-medium:600;--cds-dur-slow:.3s;--cds-ease-out:cubic-bezier(.2,.7,.2,1);
--font-anthropic-sans:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
--font-anthropic-serif:ui-serif,Georgia,"Times New Roman",serif}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){color-scheme:dark;
--color-fg:#f0efec;--color-fg-muted:#a9a79f;--color-bg:#161615;--color-panel:#1f1f1d;--color-border-line:#34332f;
--cds-chart-grid:#2c2b28;--cds-chart-axis:#4a4944;--cds-chart-muted:#55534d;--cds-surface-popover:#262624;--cds-border:#3a3935;--cds-text-secondary:#a9a79f}}
:root[data-theme="dark"]{color-scheme:dark;
--color-fg:#f0efec;--color-fg-muted:#a9a79f;--color-bg:#161615;--color-panel:#1f1f1d;--color-border-line:#34332f;
--cds-chart-grid:#2c2b28;--cds-chart-axis:#4a4944;--cds-chart-muted:#55534d;--cds-surface-popover:#262624;--cds-border:#3a3935;--cds-text-secondary:#a9a79f}
body{margin:0;background:var(--color-bg);color:var(--color-fg);font-family:var(--font-anthropic-sans);font-size:14px}
#dash-root{max-width:1280px;margin-inline:auto;padding-block:24px;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px))}
.dash-skeleton{color:transparent;background:var(--color-border-line);border-radius:4px}
.tx-footnote{margin-top:24px;font-size:12px;color:var(--color-fg-muted)}
"""

SHIM = """
(function(){
  const RAW = window.__DASH_DATA__;
  const calcs = {}; const listeners = [];
  const dark = matchMedia('(prefers-color-scheme: dark)').matches;
  const colors = dark ? ['#3987e5','#d95926','#199e70','#c98500','#d55181','#008300','#9085e9','#e66767']
                      : ['#2a78d6','#eb6834','#1baf7a','#eda100','#e87ba4','#008300','#6250d6','#e34948'];
  function data(id){
    if (RAW[id]) return {status:'ok', data:RAW[id].rows, columns:RAW[id].columns, meta:[], refreshing:false};
    if (calcs[id]) { try { return {status:'ok', data: calcs[id].fn(...calcs[id].inputs.map(i => data(i).data)), meta:[]}; }
                     catch(e){ return {status:'error', data:[], message:String(e)}; } }
    return {status:'missing', data:[]};
  }
  window.dash = {
    data, colors,
    calc(id, spec){ calcs[id] = spec; },
    loader(){}, refresh(){}, setLink(){},
    params(){ return {}; }, setParams(){}, resetParams(){},
    onData(fn){ listeners.push(fn); fn(); }
  };
  let t; addEventListener('resize', () => { clearTimeout(t); t = setTimeout(() => listeners.forEach(f => f()), 150); });
})();
"""

html = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>TMS LinkedIn Competitive Review</title>
<style>{TOKENS}</style>
<script>{d3}</script>
<script>window.__DASH_DATA__ = {json.dumps(data, ensure_ascii=False).replace("</", "<\\/")};</script>
<script>{SHIM}</script>
</head><body><div id="dash-root">
{page}
<p class="tx-footnote">Standalone snapshot of the dashboard built 27 Oct 2026 from the CSVs in reports/. Live version: https://claude.ai/artifact/MVynfezk3JvMcLygRpKf54</p>
</div></body></html>"""

with open(OUT, "w", encoding="utf-8") as f:
    f.write(html)
print(OUT, len(html), "bytes")
