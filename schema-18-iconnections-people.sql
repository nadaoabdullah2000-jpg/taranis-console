-- Schema 18: the people at each firm, stored with the iConnections run.
--
-- Until now the Investors column was built in the browser from the file,
-- and person names were never sent, so a run reopened from Earlier matches
-- had no Investors. From this schema on, the console sends each firm's
-- names with its row and they are stored on the staged row
-- (iconnections_import_rows.people), so a stored run shows them too.
-- They live only in the iConnections staging tables, readable by console
-- users (console_read, schema-15); they are not written to Opportunities,
-- contacts or anywhere else, and they go when a run is matched again.
--
-- console_iconnections_match stores them; console_iconnections_run returns
-- them per firm, each name once, in sheet order. Both are schema-16's text
-- with only that added: same signatures, so CREATE OR REPLACE keeps their
-- grants. iconn_match_rows (the matching) is not touched. Runs staged
-- before this have no names until matched again. Safe to run twice.
-- Mirrored in schema.sql, section 9. Needs schema-16.

-- ---------------------------------------------------------------------
-- 1. STAGED PEOPLE
-- ---------------------------------------------------------------------
alter table public.iconnections_import_rows
  add column if not exists people text[];   -- the names the file lists at this firm, in sheet order

-- ---------------------------------------------------------------------
-- 2. STORE AND RETURN THEM
-- ---------------------------------------------------------------------
create or replace function public.console_iconnections_match(
  p_file_sha256 text, p_file_name text, p_sheet text, p_columns jsonb, p_first boolean, p_rows jsonb)
returns jsonb
language plpgsql volatile
set search_path = public
as $$
declare
  v_run    bigint;
  v_import int;
  v_n      int;
begin
  if coalesce(p_file_sha256, '') !~ '^[0-9a-f]{64}$' then
    raise exception 'The file fingerprint must be 64 hex characters (SHA-256).' using errcode = '22023';
  end if;
  if jsonb_typeof(p_rows) is distinct from 'array' then
    raise exception 'Rows must be a JSON array.' using errcode = '22023';
  end if;
  v_n := jsonb_array_length(p_rows);
  if v_n > 1000 then
    raise exception 'Send at most 1,000 rows per call (this one had %).', v_n using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_to_recordset(p_rows) as x(row_no int, name text)
              where x.row_no is null or x.row_no < 1 or btrim(coalesce(x.name, '')) = '') then
    raise exception 'Every row needs a row number and an allocator name.' using errcode = '22023';
  end if;
  if (select count(distinct x.row_no) from jsonb_to_recordset(p_rows) as x(row_no int)) <> v_n then
    raise exception 'A row number appears twice in this chunk.' using errcode = '22023';
  end if;

  insert into iconnections_import_runs as r (file_sha256, file_name, sheet_name, columns, thresholds)
  values (p_file_sha256, left(p_file_name, 300), left(p_sheet, 100), coalesce(p_columns, '{}'::jsonb), iconn_thresholds())
  on conflict (file_sha256) do update
     set file_name       = excluded.file_name,
         sheet_name      = excluded.sheet_name,
         columns         = excluded.columns,
         thresholds      = excluded.thresholds,
         import_no       = r.import_no + case when p_first then 1 else 0 end,
         last_matched_at = now(),
         matched_by      = auth.jwt() ->> 'email'
  returning r.id, r.import_no into v_run, v_import;

  insert into iconnections_import_rows as t
         (run_id, row_no, import_no, contacts, row_nos, raw, name, domain, aum_text, aum_low, aum_high, investor_type, country,
          norm_name, bucket, match_method, confidence, matched_id, matched_name, matched_status, opp_ids, opp_rejected,
          matched_fit, matched_fit_reason, candidates, conflicts, domain_check, matched_at, people)
  select v_run, x.row_no, v_import, greatest(coalesce(x.contacts, 1), 1), coalesce(x.row_nos, array[x.row_no]),
         coalesce(x.raw, '{}'::jsonb), btrim(x.name),
         nullif(lower(btrim(x.domain)), ''), left(x.aum_text, 200), x.aum_low, x.aum_high,
         left(x.investor_type, 200), nullif(upper(btrim(x.country)), ''),
         m.norm_name, m.bucket, m.match_method, m.confidence, m.matched_id, m.matched_name, m.matched_status,
         m.opp_ids, m.opp_rejected, m.matched_fit, m.matched_fit_reason, m.candidates, m.conflicts, m.domain_check, now(),
         -- The people the file lists at this firm: trimmed, blanks dropped,
         -- 300 characters and 500 names at most.
         (select array_agg(left(btrim(p.v), 300) order by p.i)
            from unnest(x.people) with ordinality as p(v, i)
           where btrim(coalesce(p.v, '')) <> '' and p.i <= 500)
    from jsonb_to_recordset(p_rows) as x(row_no int, contacts int, row_nos int[], raw jsonb, name text, domain text,
                                         aum_text text, aum_low numeric, aum_high numeric, investor_type text, country text,
                                         people text[])
    join iconn_match_rows(p_rows) m on m.row_no = x.row_no
  on conflict (run_id, row_no) do update
     set import_no = excluded.import_no, contacts = excluded.contacts, row_nos = excluded.row_nos,
         raw = excluded.raw, name = excluded.name, domain = excluded.domain,
         aum_text = excluded.aum_text, aum_low = excluded.aum_low, aum_high = excluded.aum_high,
         investor_type = excluded.investor_type, country = excluded.country, norm_name = excluded.norm_name,
         bucket = excluded.bucket, match_method = excluded.match_method, confidence = excluded.confidence,
         matched_id = excluded.matched_id, matched_name = excluded.matched_name,
         matched_status = excluded.matched_status, opp_ids = excluded.opp_ids, opp_rejected = excluded.opp_rejected,
         matched_fit = excluded.matched_fit, matched_fit_reason = excluded.matched_fit_reason,
         candidates = excluded.candidates, conflicts = excluded.conflicts,
         domain_check = excluded.domain_check, matched_at = excluded.matched_at, people = excluded.people;

  update iconnections_import_runs r
     set row_count = (select count(*) from iconnections_import_rows t where t.run_id = r.id and t.import_no = r.import_no)
   where r.id = v_run;

  return jsonb_build_object('run_id', v_run, 'import_no', v_import, 'rows', v_n);
end
$$;


create or replace function public.console_iconnections_run(p_run_id bigint)
returns jsonb
language sql stable
set search_path = public
as $$
  with run as (
    select * from iconnections_import_runs where id = p_run_id
  ),
  t as (
    select r.*, coalesce(nullif(r.norm_name, ''), lower(r.name)) as firm_key
      from iconnections_import_rows r join run on run.id = r.run_id and r.import_no = run.import_no
  ),
  firm as (
    select t.firm_key,
           (array_agg(t.name order by t.contacts desc, t.row_no))[1] as name,
           array_agg(distinct t.name) as spellings,
           sum(t.contacts)::int as contacts,
           (select array_agg(x order by x)
              from (select distinct unnest(coalesce(t2.row_nos, array[t2.row_no])) as x
                      from t t2 where t2.firm_key = t.firm_key) z) as row_nos,
           (array_agg(to_jsonb(t) order by t.row_no))[1] as lead,
           -- Everyone the file lists at the firm, each name once (ignoring
           -- case and spacing), in sheet order.
           (select array_agg(z.v order by z.o)
              from (select distinct on (lower(regexp_replace(btrim(p.v), '\s+', ' ', 'g'))) p.v, t4.row_no * 1000 + p.i as o
                      from t t4 cross join lateral unnest(t4.people) with ordinality as p(v, i)
                     where t4.firm_key = t.firm_key and btrim(coalesce(p.v, '')) <> ''
                     order by lower(regexp_replace(btrim(p.v), '\s+', ' ', 'g')), t4.row_no * 1000 + p.i) z) as people,
           (select jsonb_agg(distinct c)
              from t t3 cross join lateral jsonb_array_elements(coalesce(t3.conflicts, '[]'::jsonb)) c
             where t3.firm_key = t.firm_key) as conflicts
      from t
     group by t.firm_key
  ),
  f as (
    select firm.name, firm.spellings, firm.contacts, firm.row_nos, firm.conflicts, firm.people,
           lead ->> 'bucket' as bucket, lead ->> 'match_method' as match_method,
           (lead ->> 'confidence')::numeric as confidence,
           (lead ->> 'matched_id')::bigint as matched_id, lead ->> 'matched_name' as matched_name,
           lead ->> 'matched_status' as matched_status, nullif(lead -> 'opp_ids', 'null'::jsonb) as opp_ids,
           (lead ->> 'matched_fit')::numeric as matched_fit, lead ->> 'matched_fit_reason' as matched_fit_reason,
           coalesce((lead ->> 'opp_rejected')::int, 0) as opp_rejected,
           nullif(lead -> 'candidates', 'null'::jsonb) as candidates, lead ->> 'domain_check' as domain_check
      from firm
  ),
  r as (
    select f.*,
           f.bucket = 'matched' and f.opp_rejected > 0
             and f.opp_rejected = jsonb_array_length(coalesce(f.opp_ids, '[]'::jsonb)) as rejected,
           case when f.matched_id is not null
                then array_remove(array_agg(f.name) over (partition by f.matched_id), f.name) end as same_opportunity
      from f
  )
  select case when not exists (select 1 from run) then null else jsonb_build_object(
    'run', (select jsonb_build_object('id', id, 'file_name', file_name, 'sheet_name', sheet_name,
                                      'columns', columns, 'thresholds', thresholds, 'import_no', import_no,
                                      'row_count', row_count, 'created_at', created_at,
                                      'last_matched_at', last_matched_at) from run),
    'counts', (select jsonb_build_object(
                 'firms',      count(*),
                 'contacts',   coalesce(sum(contacts), 0),
                 'matched',    count(*) filter (where bucket = 'matched'),
                 'rejected',   count(*) filter (where rejected),
                 'review',     count(*) filter (where bucket = 'review'),
                 'none',       count(*) filter (where bucket = 'none'),
                 'duplicates', count(*) filter (where jsonb_array_length(coalesce(opp_ids, '[]'::jsonb)) > 1
                                                   or cardinality(same_opportunity) > 0),
                 'conflicts',  count(*) filter (where conflicts is not null)) from r),
    'firms', coalesce((select jsonb_agg(jsonb_build_object(
                 'name', name, 'spellings', spellings, 'contacts', contacts, 'row_nos', row_nos, 'people', people,
                 'bucket', bucket, 'match_method', match_method, 'confidence', confidence,
                 'matched_id', matched_id, 'matched_name', matched_name, 'matched_status', matched_status,
                 'matched_fit', matched_fit, 'matched_fit_reason', matched_fit_reason,
                 'rejected', rejected, 'opp_ids', opp_ids, 'opp_rejected', opp_rejected,
                 'same_opportunity', same_opportunity, 'candidates', candidates, 'conflicts', conflicts,
                 'domain_check', domain_check)
               order by confidence desc nulls last, name) from r), '[]'::jsonb)
  ) end
$$;

-- ---------------------------------------------------------------------
-- ROLLBACK (back to schema-16; nothing else changes)
--   re-run schema-16 from "create or replace function
--   public.console_iconnections_match" to its grants, then
--   alter table public.iconnections_import_rows drop column if exists people;
-- ---------------------------------------------------------------------
