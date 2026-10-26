/* Run with: npm test
   schema.sql is the source of truth for DDL. Its section 5 must equal the
   migrations that built it: schema-13's body, with console_search_company as
   schema-14 replaced it. So the two can never describe different columns,
   indexes or search functions. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const START = '-- ---------------------------------------------------------------------\n-- 1. TECH INVESTOR';
const END = '-- ---------------------------------------------------------------------\n-- ROLLBACK';
const FN = '-- search.company: everything held on one company.';
const fnBlock = (src) => {
  const a = src.indexOf(FN);
  const b = src.indexOf('$$;', src.indexOf('create or replace function public.console_search_company', a)) + 3;
  assert.ok(a >= 0 && b > a, 'console_search_company block found');
  return src.slice(a, b);
};

test('schema.sql section 5 = schema-13 with schema-14\'s console_search_company', () => {
  const m13 = read('schema-13-enrich-and-search.sql');
  const m14 = read('schema-14-search-dedupe.sql');
  const body13 = m13.slice(m13.indexOf(START), m13.indexOf(END)).trimEnd();
  const expected = body13.replace(fnBlock(m13), () => fnBlock(m14));   // a function: '$$' in a replacement string means '$'
  assert.notEqual(expected, body13, 'schema-14 changes the function');
  assert.ok(read('schema.sql').includes(expected), 'schema.sql section 5 differs from the migrations');
});

test('search functions take the typed text only as an argument', () => {
  for (const f of ['schema-13-enrich-and-search.sql', 'schema-14-search-dedupe.sql']) {
    const sql = read(f);
    // No dynamic SQL: nothing is EXECUTEd or format()ed from the query text.
    assert.doesNotMatch(sql, /\bexecute\b\s+(format|'|\$)/i, f);
    assert.doesNotMatch(sql, /\bformat\s*\(/i, f);
    assert.match(sql, /language sql stable/, f);
  }
});

test('schema-14 collapses copies on exactly the agreed signature', () => {
  const fn = fnBlock(read('schema-14-search-dedupe.sql'));
  // The five signature fields, case-insensitive name, NULL-safe.
  for (const part of [
    'lower(coalesce(m.organization_name, m.investor_name))',
    "coalesce(m.intention_summary, '')", "coalesce(m.alert_type, '')",
    "coalesce(m.alert_date::text, '')", "coalesce(m.source_subject, '')"]) {
    assert.ok(fn.includes(part), 'signature includes ' + part);
  }
  // One row per signature: newest email first, highest id on a tie.
  assert.match(fn, /partition by a\.sig_name, a\.sig_summary, a\.sig_type, a\.sig_date, a\.sig_subject\s+order by a\.source_email_date desc nulls last, a\.id desc/);
  assert.match(fn, /where r\.copy_rank = 1/);
  assert.match(fn, /count\(\*\) over w\s+as source_count/);
  assert.match(fn, /r\.source_count/);
});

test('schema.sql section 6 = schema-15 (iConnections matching)', () => {
  const m15 = read('schema-15-iconnections-import.sql');
  const a = m15.indexOf('-- ---------------------------------------------------------------------\n-- 1. ALIASES');
  const b = m15.indexOf(END);
  assert.ok(a > 0 && b > a, 'schema-15 sections found');
  assert.ok(read('schema.sql').includes(m15.slice(a, b).trimEnd()), 'schema.sql section 6 differs from schema-15');
});

test('schema-15 reads Opportunities and never writes to them', () => {
  const sql = read('schema-15-iconnections-import.sql').replace(/--.*$/gm, '');
  assert.doesNotMatch(sql, /\b(insert\s+into|update|delete\s+from|alter\s+table|create\s+(unique\s+)?index[^;]*\bon)\s+(public\.)?wi_mandates\b/i);
  assert.doesNotMatch(sql, /\bexecute\b\s+(format|'|\$)/i, 'no dynamic SQL');
  assert.doesNotMatch(sql, /\bformat\s*\(/i);
  // The review line must stay at or above the trigram prefilter, or the
  // index would hide candidates that score between the two.
  const review = Number(/"review":\s*([0-9.]+)/.exec(sql)[1]);
  const prefilter = Number(/set_limit\(([0-9.]+)\)/.exec(sql)[1]);
  assert.ok(review >= prefilter, 'review ' + review + ' >= prefilter ' + prefilter);
  assert.ok(Number(/"auto":\s*([0-9.]+)/.exec(sql)[1]) > review);
});

test('schema-15 sets no extension parameter at function level (Supabase roles cannot: 42501)', () => {
  const sql = read('schema-15-iconnections-import.sql').replace(/--.*$/gm, '');
  assert.doesNotMatch(sql, /^\s*set\s+pg_trgm\./im, 'use perform set_limit() in the body instead');
  assert.match(sql, /perform set_limit\(0\.3\);/);
});

test('schema.sql section 7 = schema-16 (Taranis fit in the iConnections results)', () => {
  const m16 = read('schema-16-iconnections-fit.sql');
  const a = m16.indexOf('-- ---------------------------------------------------------------------\n-- 1. STAGED FIT');
  const b = m16.indexOf(END);
  assert.ok(a > 0 && b > a, 'schema-16 sections found');
  assert.ok(read('schema.sql').includes(m16.slice(a, b).trimEnd()), 'schema.sql section 7 differs from schema-16');
});

test('schema-16 adds the fit and changes nothing in the matching', () => {
  const fns = (src) => ['iconn_match_rows(p_rows jsonb)', 'console_iconnections_match(', 'console_iconnections_run(p_run_id bigint)']
    .map((n) => { const i = src.indexOf('create or replace function public.' + n);
                  return src.slice(i, src.indexOf('$$;\n', src.indexOf('as $$', i)) + 4); });
  // Strip every line schema-16 is allowed to add or touch; what is left must be schema-15's text.
  const strip = (t) => t.split('\n').filter((l) => !/fit|-- each represented by its newest row/.test(l)).join('\n')
    .replace(/opp_rejected int,\n/g, 'opp_rejected int)\n').replace(/= 'rejected'\),\n/g, "= 'rejected')\n")
    .replace(/, 'status', c\.verdict,\n/g, ", 'status', c.verdict)\n").replace(/opp_rejected int\)\n\s*\)/g, 'opp_rejected int)');
  const f15 = fns(read('schema-15-iconnections-import.sql')).map(strip);
  const f16 = fns(read('schema-16-iconnections-fit.sql')).map(strip);
  for (const marker of ['t_auto', 't_review', 't_close', 'set_limit(0.3)', "when 'matched' then 5", 'too_close', "then 'review'"]) {
    assert.equal(f16[0].includes(marker), f15[0].includes(marker), marker);
  }
  const sql = read('schema-16-iconnections-fit.sql');
  assert.match(sql, /coalesce\(m\.new_fit_score, m\.fit_score\) as fit/);
  assert.match(sql, /rep\.fit,\s*\n\s*rep\.fit_reason/, 'the fit comes from the representative row');
  assert.doesNotMatch(sql.replace(/--.*$/gm, ''), /^\s*set\s+pg_trgm\./im);
  assert.doesNotMatch(sql.replace(/--.*$/gm, ''), /\b(insert\s+into|update|delete\s+from|alter\s+table)\s+(public\.)?wi_mandates\b/i);
});
