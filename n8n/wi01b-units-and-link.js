// WI 01b (9Zqd98cdXXPqI0oO), node "Units and profile link" — 12 Nov 2026 (approved by research@taranis.net).
// Change from the published version: the band-guarded millions fix for AUM is removed, because
// "Profile wins" now converts every With Intelligence amount to dollars itself (a second
// conversion here could only be wrong). The profile link and evidence.wi_investor_id are unchanged.
const out = [];
for (const it of $input.all()) {
  const m = Object.assign({}, it.json);
  if (m._wi_enriched && m._wi_investor_id) {
    m.view_investor_url = 'https://platform.withintelligence.com/explore/investors/' + m._wi_investor_id;
    let ev = null;
    try { ev = m.evidence ? (typeof m.evidence === 'string' ? JSON.parse(m.evidence) : m.evidence) : {}; } catch (e) { ev = null; }
    if (ev && typeof ev === 'object' && !Array.isArray(ev)) {
      ev.wi_investor_id = String(m._wi_investor_id);
      m.evidence = typeof m.evidence === 'object' && m.evidence !== null ? ev : JSON.stringify(ev);
    }
  }
  out.push({ json: m });
}
return out;
