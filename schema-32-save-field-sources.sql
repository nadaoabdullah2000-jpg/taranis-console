-- schema-32 (26 Nov 2026): grok_fn.save stamps field_sources on every Opportunities field it fills, so the live
-- /grok-data gateway records provenance the same way the upload path (grok_fn.ingest) does.
-- STATUS: BUILT AND TESTED IN A ROLLED-BACK TRANSACTION. NOT APPLIED. grok_fn.save runs many times a day:
-- apply only on the user's go.
--
-- What changes: one block, inserted just before save's single "update wi_mandates" for a row. It adds
--   field_sources = field_sources || {<field>: {by, via: "grok gateway save", run, source, at}}
-- for exactly the fields that save logs to wi_fill_log for that row. Nothing else in save changes: the same
-- blanks-only checks, the same verdict guard (the stamp is part of the same UPDATE, before the guard compares
-- the verdict), the same wi_fill_log lines, the same dry run. The iConnections scope is untouched.
-- Expected definition md5 before: f103d49ed6dfb493c7e0e88c663fa24d (checked 26 Nov 2026).
--
-- UNDO: run the block at the bottom (removes exactly the inserted text).

do $$
declare
  d text := pg_get_functiondef('grok_fn.save(text,jsonb,boolean,text)'::regprocedure);
  anchor text := E'          if cardinality(sets) > 0 then\n            select concat_ws(';
  stamp text := E'          -- field_sources (26 Nov 2026): every field this save fills is stamped with where it came from.\n'
    || E'          if cardinality(sets) >= 1 and jsonb_array_length(logs) >= 1 then\n'
    || E'            sets := sets || format(''field_sources = (case when jsonb_typeof(field_sources) = ''''object'''' then field_sources else ''''{}''''::jsonb end) || %L::jsonb'',\n'
    || E'              (select jsonb_object_agg(l ->> ''field'', jsonb_build_object(''by'', p_by, ''via'', ''grok gateway save'', ''run'', tag, ''source'', src, ''at'', now()))\n'
    || E'                 from jsonb_array_elements(logs) l)::text);\n'
    || E'          end if;\n';
begin
  if md5(d) <> 'f103d49ed6dfb493c7e0e88c663fa24d' then raise exception 'grok_fn.save changed since 26 Nov: re-check before applying.'; end if;
  if (length(d) - length(replace(d, anchor, ''))) / length(anchor) <> 1 then raise exception 'anchor not unique'; end if;
  execute replace(d, anchor, stamp || anchor);
end $$;

-- UNDO:
-- do $$
-- declare d text := pg_get_functiondef('grok_fn.save(text,jsonb,boolean,text)'::regprocedure);
--   s int := position('          -- field_sources (26 Nov 2026)' in d);
--   e int := position(E'          if cardinality(sets) > 0 then\n            select concat_ws(' in d);
-- begin
--   if s = 0 or e <= s then raise exception 'stamp block not found'; end if;
--   execute substr(d, 1, s - 1) || substr(d, e);
-- end $$;
