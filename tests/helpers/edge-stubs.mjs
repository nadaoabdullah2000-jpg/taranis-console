/* Stand-ins for what the create-meeting Edge Function reaches outside itself,
   so tests/fireflies.test.mjs can run the real handler (index.ts) under Node.
   Everything it would send — to Zoom, Google, the database and the mail
   server — is recorded on globalThis.__edge for the tests to inspect. */

export function createClient() {
  const S = globalThis.__edge;
  return {
    auth: { getUser: async () => ({ data: { user: { email: S.user } }, error: null }) },
    from(table) {
      const q = { op: 'select', filters: [], payload: null };
      const rows = () => (S.db[table] ||= []);
      const match = () => rows().filter((r) => q.filters.every(([k, v]) => String(r[k]) === String(v)));
      const run = () => {
        if (q.op === 'insert') {
          const row = { id: 'row-' + (rows().length + 1), ...q.payload };
          rows().push(row);
          S.writes.push({ table, op: 'insert', row: { ...q.payload } });
          return { data: row, error: null };
        }
        if (q.op === 'update') {
          for (const r of match()) Object.assign(r, q.payload);
          S.writes.push({ table, op: 'update', filters: q.filters, patch: { ...q.payload } });
          return { data: null, error: null };
        }
        return { data: match()[0] ?? null, error: null };
      };
      const b = {
        select() { return b; },
        eq(k, v) { q.filters.push([k, v]); return b; },
        insert(p) { q.op = 'insert'; q.payload = p; return b; },
        update(p) { q.op = 'update'; q.payload = p; return b; },
        maybeSingle: async () => run(),
        then(res, rej) { return Promise.resolve(run()).then(res, rej); }
      };
      return b;
    }
  };
}

export class SMTPClient {
  async send(msg) { globalThis.__edge.mail.push(msg); }
  async close() {}
}
