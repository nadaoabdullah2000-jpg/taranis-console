/* Run with: npm test
   schema.sql is the source of truth for DDL. Its section 5 must stay
   byte-identical to the migration that applies it, so the two can never
   describe different columns, indexes or search functions. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const START = '-- ---------------------------------------------------------------------\n-- 1. TECH INVESTOR';
const END = '-- ---------------------------------------------------------------------\n-- ROLLBACK';

test('schema.sql section 5 matches schema-13-enrich-and-search.sql', () => {
  const mig = read('schema-13-enrich-and-search.sql');
  const body = mig.slice(mig.indexOf(START), mig.indexOf(END)).trimEnd();
  const schema = read('schema.sql');
  assert.ok(mig.includes(START) && mig.includes(END), 'migration markers present');
  assert.ok(schema.includes(body), 'schema.sql section 5 differs from the migration');
});

test('search functions take the typed text only as an argument', () => {
  const mig = read('schema-13-enrich-and-search.sql');
  // No dynamic SQL: nothing is EXECUTEd or format()ed from the query text.
  assert.doesNotMatch(mig, /\bexecute\b\s+(format|'|\$)/i);
  assert.doesNotMatch(mig, /\bformat\s*\(/i);
  assert.match(mig, /language sql stable/);
});
