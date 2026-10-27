"""Inlines d3 and every data/*.csv into dashboard_template.html -> dashboard.html (self-contained).
usage: build_dashboard.py <d3.min.js>"""
import csv, glob, json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
data = {}
for p in sorted(glob.glob(os.path.join(HERE, "data", "*.csv"))):
    with open(p, newline="", encoding="utf-8") as f:
        data[os.path.splitext(os.path.basename(p))[0]] = list(csv.DictReader(f))
tpl = open(os.path.join(HERE, "dashboard_template.html"), encoding="utf-8").read()
d3 = open(sys.argv[1], encoding="utf-8").read()
out = tpl.replace("/*__D3__*/", d3.replace("</script", "<\\/script")).replace("/*__DATA__*/", json.dumps(data, ensure_ascii=False).replace("</", "<\\/"))
open(os.path.join(HERE, "dashboard.html"), "w", encoding="utf-8").write(out)
print("dashboard.html", len(out), "bytes;", len(data), "datasets")
