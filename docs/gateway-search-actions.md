# Gateway: `search.suggest` and `search.company`

Status: **not wired yet.** These are the nodes to add to the gateway workflow
(`7V1Wn00ubm0mWICa`) once schema-13 is applied. The console does not need them
to work: it calls the same database functions directly through PostgREST and
only falls back to these actions when it has no Supabase session.

Both actions follow the existing pattern: one new output on the `action`
switch, a Postgres node, and the shared respond node. The typed text reaches
the database only as a bound query parameter (`$1`, `$2`). No string
concatenation, no `{{ }}` inside the SQL.

## 1. Switch

Add two rules to the action switch, next to `li.search`:

| Rule | Value |
|---|---|
| `{{ $json.body.action }}` equals | `search.suggest` |
| `{{ $json.body.action }}` equals | `search.company` |

## 2. Postgres nodes (Execute Query)

**Search Suggest**

```sql
select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) as suggestions
from public.console_search_suggest($1, $2) s;
```

Options → Query Parameters (as one expression returning an array, because a
plain comma-separated list would split a name like "Smith, Jones & Co"):

```
{{ [ String($json.body.payload.q || '').slice(0, 100), Math.min(Math.max(Number($json.body.payload.limit) || 10, 1), 25) ] }}
```

**Search Company**

```sql
select public.console_search_company($1) as company;
```

Options → Query Parameters:

```
{{ [ String($json.body.payload.name || '').slice(0, 200) ] }}
```

Use the same Postgres credential as `li.search`. Both functions are
`SECURITY INVOKER`, so they read with that credential's rights. They are granted
to `taranis_bot`, `service_role` and `authenticated` only (not `anon`).

## 3. Respond

Return the shapes in the README contract:

- `search.suggest` → `{{ { suggestions: $json.suggestions } }}`
- `search.company` → `{{ $json.company }}`, i.e.
  `{name, mandates:[…], contacts:[…], documents:[…], network:[…]}`

## Check after wiring

```bash
curl -s "$GATEWAY_URL" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"action":"search.suggest","payload":{"q":"mirab"}}'
# → {"suggestions":[{"name":"Mirabaud","kind":"mandate","count":1}, …]}
```

A query containing `%`, `_`, `'` or `\` must come back as a normal search
(the functions escape LIKE wildcards themselves), never as an SQL error.
