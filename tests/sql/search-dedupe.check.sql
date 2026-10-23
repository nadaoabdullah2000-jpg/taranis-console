-- Live check for schema-14 (read-only). Run in the SQL editor or via the
-- Supabase tool; it raises if Search would show an alert more than once.
--   ADIA 1508 / 1519 / 1537 are one WI alert from three same-day emails:
--   searching ADIA must return one card for it, source_count 3, keeping 1537
--   (the latest email). Copies of any alert never come back twice.
do $check$
declare c jsonb; n int; sc int; kept bigint; dups int;
begin
  c := public.console_search_company('Abu Dhabi Investment Authority (ADIA)');
  select count(*) into n from jsonb_array_elements(c->'mandates') x
   where x->>'intention_summary' = 'Hike from 5-10% to 7-12%';
  select (x->>'source_count')::int, (x->>'id')::bigint into sc, kept
    from jsonb_array_elements(c->'mandates') x
   where x->>'intention_summary' = 'Hike from 5-10% to 7-12%';
  if n <> 1 or sc <> 3 or kept <> 1537 then
    raise exception 'ADIA: % card(s), source_count %, kept id % (want 1, 3, 1537)', n, sc, kept;
  end if;
  if jsonb_array_length(c->'mandates') <> 1 then
    raise exception 'ADIA: % mandates returned, want 1', jsonb_array_length(c->'mandates');
  end if;
  -- No two returned cards share a signature, for a sample of busy names.
  select count(*) into dups from (
    select n.nm, x->>'organization_name', x->>'investor_name', x->>'intention_summary', x->>'alert_date', count(*)
      from unnest(array['Abu Dhabi Investment Authority (ADIA)','Carnegie Mellon University (CMU)',
                        'True North Capital Corp','Capital Y SA','ProVise Management Group']) n(nm),
           jsonb_array_elements(public.console_search_company(n.nm)->'mandates') x
     group by 1,2,3,4,5 having count(*) > 1) d;
  if dups > 0 then raise exception '% duplicate cards remain', dups; end if;
end
$check$;
