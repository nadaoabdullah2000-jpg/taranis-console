-- Schema 21f (9 Nov 2026): fixes applied after testing the Grok gateway
-- (migrations schema_21d, schema_21f, schema_21g, schema_21h).
--
-- 21d  grok.iconn_links: grok's own copy of public.iconn_wi_links (schema-20). That view is
--      security_invoker, so read through grok_reader it was refused ("permission denied for
--      table wi_mandates"). The copy runs with its owner's rights like the other grok views.
--      Keep the two link rules in step if one changes. grok.iconn_firms and grok.iconn_profiles
--      join grok.iconn_links instead of public.iconn_wi_links.
-- 21f  Speed: grok.iconn_firms recomputed the link view once per firm (>25 s); the links and
--      iconn_wi_lookup are now computed once (MATERIALIZED CTEs): 1.7 s for all 194 firms.
-- 21g  grok_fn.save: clearer labels for the id/link it derives ("wi_id (from wi_url)",
--      "wi_url (from wi_id)").
-- 21h  wi_fill_log.mandate_id may be empty: I-Connections firms without an allocator row
--      are logged with field 'iconnections.*' and the firm name.

alter table public.wi_fill_log alter column mandate_id drop not null;
comment on column public.wi_fill_log.mandate_id is 'The wi_mandates row changed. Empty for I-Connections firm entries (field iconnections.*) that have no allocator row.';

-- The view bodies are those in schema-21e with:
--   * every "left join public.iconn_wi_links l" / "from public.iconn_wi_links" replaced by grok.iconn_links;
--   * in grok.iconn_firms: "lk as materialized (select firm_key, wi_investor_id, match_how, match_detail, certain from grok.iconn_links)"
--     and "lu as materialized (select run_id, row_no, confidence, candidates, searched_at from public.iconn_wi_lookup)",
--     with the joins and lookups reading lk / lu;
--   * in grok.iconn_profiles: "lk as materialized (select wi_investor_id, array_agg(distinct firm_name) firms
--     from grok.iconn_links where wi_investor_id is not null group by 1)" left-joined on wi_id.
-- The exact applied text is in the database migration history (supabase_migrations).

-- UNDO: alter table public.wi_fill_log alter column mandate_id set not null;  (only if no empty rows exist)
