/* Run with: npm test
   Grok gateway "Parse Request" routing (n8n/grok-gateway-parse-request.js). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const code = readFileSync(new URL('../n8n/grok-gateway-parse-request.js', import.meta.url), 'utf8');
const run = (body) => new Function('$input', code)({ first: () => ({ json: { body } }) })[0].json;

test('discover goes to the write connection, dry run by default', () => {
  const r = run({ action: 'discover', items: [{ wi_id: '1', name: 'A' }] });
  assert.equal(r.route, 'dbw');
  assert.match(r.sql, /grok_fn\.discover\(\$2::jsonb, \$3::boolean, \$4\)/);
  assert.equal(r.params[2], 'true');
  assert.equal(run({ action: 'discover', items: [{ wi_id: '1', name: 'A' }], dry_run: false }).params[2], 'false');
  assert.equal(run({ action: 'discover', items: [] }).route, 'error');
  assert.equal(run({ action: 'discover', items: Array(51).fill({}) }).route, 'error');
});

test('discover_status is read-only; save stays as it was', () => {
  const r = run({ action: 'discover_status', limit: 500 });
  assert.equal(r.route, 'db');
  assert.deepEqual(JSON.parse(JSON.stringify(r.params)), ['grok', '200', '0']);
  assert.equal(run({ action: 'save', scope: 'discover', items: [{}] }).route, 'error');
  assert.equal(run({ action: 'todo', scope: 'focus' }).params[1], 'focus');
});
