// "Grok Ingest -> Web App" / Parse Request (Code node, run once for all items), 25 Nov 2026.
// The API key (header x-api-key) is checked by the webhook's Header Auth before this runs.
// Body: { source: opportunities | iconnections | preqin,
//         file_base64?: base64 .xlsx, file_name?, sheet_name?,  rows?: [ {...}, ... ],
//         dry_run?: true (default) | false,  plan_id?: from the dry run (required when dry_run is false) }
const raw = $input.first().json || {};
const b = (raw.body && typeof raw.body === 'object' && !Array.isArray(raw.body)) ? raw.body : {};
const fail = (reason) => [{ json: { route: 'error', code: 400, body: { status: 'error', reason } } }];
const source = String(b.source || '').toLowerCase().trim();
if (!['opportunities', 'iconnections', 'preqin'].includes(source)) return fail('Give source: opportunities, iconnections or preqin.');
const dry = !(b.dry_run === false || String(b.dry_run).toLowerCase() === 'false');
const plan = b.plan_id ? String(b.plan_id).trim() : null;
if (!dry && !/^[0-9a-f]{32}$/.test(plan || '')) return fail('dry_run false needs plan_id: send the same file or rows as a dry run first and use the plan_id it returned.');
const common = { source, dry_run: dry, plan_id: plan, by: 'Grok', file_name: b.file_name ? String(b.file_name).slice(0, 200) : null,
                 sheet_name: b.sheet_name ? String(b.sheet_name).slice(0, 100) : null };
const b64 = typeof b.file_base64 === 'string' ? b.file_base64.replace(/^data:[^,]*,/, '').replace(/\s+/g, '') : '';
if (b64) {
  if (b.rows) return fail('Send file_base64 or rows, not both.');
  const buf = Buffer.from(b64, 'base64');
  if (buf.length < 100 || buf.slice(0, 2).toString('latin1') !== 'PK') return fail('file_base64 is not an .xlsx file (it must be the base64 of the whole file).');
  if (buf.length > 15 * 1024 * 1024) return fail('The file is larger than 15 MB.');
  const bin = await this.helpers.prepareBinaryData(buf, common.file_name || 'upload.xlsx',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  return [{ json: { ...common, has_file: true }, binary: { data: bin } }];
}
if (!Array.isArray(b.rows) || !b.rows.length) return fail('Give file_base64 (an .xlsx) or rows (a JSON list of objects, one per firm).');
if (b.rows.length > 1000) return fail('At most 1000 rows per upload.');
return [{ json: { ...common, has_file: false, rows: b.rows } }];
