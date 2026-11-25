// "Grok Ingest -> Web App" / Package (Code node), 25 Nov 2026: the database answer -> the reply.
const req = $('Normalize Rows').first().json;
const row = ($input.first() || { json: {} }).json || {};
const r = row.r || {};
const short = (a) => (Array.isArray(a) ? a.slice(0, 200) : []);
return [{ json: { code: 200, body: {
  status: 'ok', source: r.source, dry_run: r.dry_run, plan_id: r.plan_id, run: r.run || null,
  inserted: (r.summary || {}).inserted || 0, updated: (r.summary || {}).updated || 0,
  skipped: (r.summary || {}).skipped || 0, conflicts: (r.summary || {}).conflicts || 0,
  details: { inserted: short(r.inserted), updated: short(r.updated), skipped: short(r.skipped), conflicts: short(r.conflicts) },
  columns_read: req.columns, columns_not_used: req.unmapped, problems: (req.problems || []).slice(0, 200),
  save_runs: r.save_runs || [], note: r.note
} } }];
