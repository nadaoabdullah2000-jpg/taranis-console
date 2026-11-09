-- NOTE (9 Nov 2026): applied as migrations schema_21a/b/c. The batch-lookup (grok_jobs,
-- job_*), token-alert (grok_alerts, token_alert) and fill/fill_undo pieces below were later
-- DROPPED by schema-21e (Grok became the data source); todo/save replace them. Read with
-- schema-21e-grok-todo-save.sql and schema-21f-grok-fixes.sql.
-- Schema 21 (9 Nov 2026): what the Grok data gateway (n8n "Grok Bot -> Data Gateway")
-- may read and write.
--
--  * API keys: only a SHA-256 hash is stored (grok_api_keys); grok_fn.check_key().
--  * Reading: the role grok_reader (no login) can read nothing but the slim views
--    in schema grok: no secrets, users, audit, LinkedIn or email tables, no raw
--    blobs (raw_block, source_links, evidence, embeddings). Grok's SQL runs inside
--    grok_fn.ro_query, a security-definer function owned by grok_reader: inside it
--    the role cannot be switched back (Postgres forbids SET ROLE in such a
--    function) and the transaction is read-only.
--  * Writing: only grok_fn.fill (allowed tables and columns, blanks only unless
--    overwrite, dry run first, every change in wi_fill_log with its source, undo by
--    run tag with grok_fn.fill_undo).
--  * Batch lookups: grok_jobs / grok_job_items, worked 12 at a time by the gateway's
--    schedule; profiles land in iconn_wi_profiles (iConnections) or
--    wi_profile_reads (allocators), never straight into wi_mandates.
--  * Token alerts: grok_alerts remembers which alert went out, so each is sent once.
-- Nothing here changes existing tables, rows or functions.

begin;

-- ------------------------------------------------------------------ keys
create table if not exists public.grok_api_keys (
  id           serial primary key,
  label        text not null,
  key_sha256   text not null unique,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at   timestamptz
);
alter table public.grok_api_keys enable row level security;   -- no policies: no app access

-- ------------------------------------------------------------------ role and schemas
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'grok_reader') then
    create role grok_reader nologin noinherit;
  end if;
end $$;
grant grok_reader to postgres with inherit false, set true;   -- lets postgres hand functions to it

create schema if not exists grok;      -- what Grok can read
create schema if not exists grok_fn;   -- the gateway's functions
revoke all on schema grok, grok_fn from public;
grant usage on schema grok to grok_reader;
grant usage on schema grok_fn to grok_reader;

-- ------------------------------------------------------------------ views (owner postgres)
create or replace view grok.wi_mandates as
select id, investor_name, organization_name, investor_type, investor_country, investor_city,
       aum_usd, aum_band, ticket_min_usd, ticket_max_usd, min_manager_aum_usd,
       asset_classes, strategies, open_to_emerging_managers,
       nullif(evidence ->> 'wi_investor_id', '') as wi_investor_id,
       view_investor_url, linkedin_url,
       coalesce(nullif(new_qualification, ''), qualification) as verdict, new_fit_score as fit_score,
       validation_status, hf_evidence, alert_date, left(intention_summary, 400) as intention_summary,
       wi_enriched_at, created_at, updated_at
  from public.wi_mandates
 where coalesce(validation_status, '') <> 'merged';

create or replace view grok.contacts as
select id, name, first_name, last_name, company, role, title, category, region, country, city,
       email, phone, linkedin_url, status, relationship, entity_class, dupe_of_id,
       last_contact, last_contact_at, created_at, updated_at
  from public.contacts;

create or replace view grok.iconn_firms as
with runs as (
  select id, import_no, last_matched_at from public.iconnections_import_runs where hidden_at is null
), t as (
  select r.run_id, r.row_no, r.name, r.contacts, r.bucket, r.match_method, r.matched_id, r.matched_name,
         u.last_matched_at, coalesce(nullif(r.norm_name, ''), lower(r.name)) as firm_key
    from public.iconnections_import_rows r join runs u on u.id = r.run_id and r.import_no = u.import_no
), latest as (
  select distinct on (firm_key) firm_key, run_id from t order by firm_key, last_matched_at desc nulls last, run_id desc
), f as (
  select t.firm_key, t.run_id,
         (array_agg(t.name order by t.contacts desc nulls last, t.row_no))[1] as firm_name,
         sum(t.contacts)::int as contacts, array_agg(t.row_no) as row_nos,
         (array_agg(t.bucket order by t.row_no))[1] as bucket,
         (array_agg(t.match_method order by t.row_no))[1] as match_method,
         (array_agg(t.matched_id order by t.row_no))[1] as matched_id,
         (array_agg(t.matched_name order by t.row_no))[1] as matched_name
    from t join latest l on l.firm_key = t.firm_key and l.run_id = t.run_id
   group by t.firm_key, t.run_id
)
select f.firm_key, f.firm_name, f.contacts, f.bucket, f.match_method, f.matched_id, f.matched_name,
       l.wi_investor_id, l.match_how as link_how, l.match_detail as link_detail, coalesce(l.certain, false) as link_certain,
       p.wi_id is not null as profile_stored, p.read_at as profile_read_at,
       w.status as wi_rejection_status,
       (select k.confidence from public.iconn_wi_lookup k where k.run_id = f.run_id and k.row_no = any(f.row_nos)
         order by (k.confidence = 'Exact') desc, (k.confidence = 'Likely') desc limit 1) as search_result,
       (select jsonb_agg(jsonb_build_object('wi_id', c ->> 'id', 'name', c ->> 'name', 'type', c ->> 'type', 'country', c ->> 'country'))
          from (select c from public.iconn_wi_lookup k, jsonb_array_elements(coalesce(k.candidates, '[]'::jsonb)) c
                 where k.run_id = f.run_id and k.row_no = any(f.row_nos) limit 3) z) as search_candidates
  from f
  left join public.iconn_wi_links l on l.firm_key = f.firm_key
  left join public.iconn_wi_profiles p on p.wi_id = l.wi_investor_id and p.status = 'ok'
  left join public.iconn_wi_rejections w on w.firm_key = f.firm_key;

create or replace view grok.iconn_profiles as
select p.wi_id, p.read_at,
       p.payload #>> '{norm,name}' as name, p.payload #>> '{norm,type}' as type,
       p.payload #>> '{norm,country}' as country, p.payload #>> '{norm,country_name}' as country_name,
       p.payload #>> '{norm,city}' as city, (p.payload #>> '{norm,aum_usd}')::numeric as aum_usd,
       p.payload #>> '{norm,aum_band}' as aum_band, p.payload #> '{norm,asset_classes}' as asset_classes,
       p.payload #> '{norm,strategies}' as strategies,
       (p.payload #>> '{norm,ticket_min_usd}')::numeric as ticket_min_usd, (p.payload #>> '{norm,ticket_max_usd}')::numeric as ticket_max_usd,
       (p.payload #>> '{norm,min_manager_aum_usd}')::numeric as min_manager_aum_usd,
       (p.payload #>> '{norm,emerging}')::boolean as emerging, p.payload #>> '{norm,emerging_why}' as emerging_why,
       p.payload #>> '{norm,link}' as link,
       left(btrim(regexp_replace(regexp_replace(coalesce(p.payload #>> '{raw,summary}', ''), '<[^>]+>', ' ', 'g'), '\s+', ' ', 'g')), 600) as summary,
       (select array_agg(distinct l.firm_name) from public.iconn_wi_links l where l.wi_investor_id = p.wi_id) as iconn_firms
  from public.iconn_wi_profiles p where p.status = 'ok';

create or replace view grok.wi_profile_reads as
select r.id, r.mandate_id, r.mandate_ids, r.company_key, r.wi_investor_id, r.status, r.method, r.read_at,
       r.payload #>> '{norm,name}' as name, r.payload #>> '{norm,type}' as type, r.payload #>> '{norm,country}' as country,
       r.payload #>> '{norm,city}' as city, (r.payload #>> '{norm,aum_usd}')::numeric as aum_usd, r.payload #>> '{norm,aum_band}' as aum_band,
       r.payload #> '{norm,asset_classes}' as asset_classes, r.payload #> '{norm,strategies}' as strategies,
       (r.payload #>> '{norm,ticket_min_usd}')::numeric as ticket_min_usd, (r.payload #>> '{norm,ticket_max_usd}')::numeric as ticket_max_usd,
       (r.payload #>> '{norm,min_manager_aum_usd}')::numeric as min_manager_aum_usd,
       (r.payload #>> '{norm,emerging}')::boolean as emerging, r.payload #>> '{norm,emerging_why}' as emerging_why,
       r.payload #>> '{norm,link}' as link, r.payload -> 'candidates' as candidates
  from public.wi_profile_reads r;

create or replace view grok.wi_fill_log as
select id, mandate_id, investor_name, field, left(old_value, 300) as old_value, left(new_value, 300) as new_value,
       source, wi_investor_id, filled_at
  from public.wi_fill_log;

-- ------------------------------------------------------------------ batch jobs
create table if not exists public.grok_jobs (
  id           bigserial primary key,
  kind         text not null,
  status       text not null default 'queued' check (status in ('queued', 'running', 'paused_auth', 'done', 'cancelled')),
  requested_by text,
  note         text,
  total        integer not null default 0,
  created_at   timestamptz not null default now(),
  finished_at  timestamptz
);
create table if not exists public.grok_job_items (
  id          bigserial primary key,
  job_id      bigint not null references public.grok_jobs(id),
  target      text not null,              -- iconn_firm, mandate_company, wi_id, name
  target_key  text not null,              -- firm_key, company_key, wi id or the name
  name        text,
  wi_id       text,
  extra       jsonb,                      -- e.g. mandate_ids
  status      text not null default 'pending'
              check (status in ('pending', 'working', 'ok', 'not_found', 'check_match', 'no_profile', 'error', 'cancelled')),
  attempts    integer not null default 0,
  result      jsonb,
  claimed_at  timestamptz,
  done_at     timestamptz
);
create index if not exists grok_job_items_pending on public.grok_job_items (job_id, id) where status in ('pending', 'working');
alter table public.grok_jobs enable row level security;
alter table public.grok_job_items enable row level security;

create or replace view grok.batch_jobs as
select j.id, j.kind, j.status, j.total, j.created_at, j.finished_at, j.note,
       (select jsonb_object_agg(status, n) from (select status, count(*) n from public.grok_job_items i where i.job_id = j.id group by status) z) as items
  from public.grok_jobs j;
create or replace view grok.batch_items as
select id, job_id, target, target_key, name, wi_id, status, attempts, left(result::text, 1500) as result, done_at
  from public.grok_job_items;

create table if not exists public.grok_alerts (
  key     text primary key,
  sent_at timestamptz not null default now(),
  detail  text
);
alter table public.grok_alerts enable row level security;

grant select on all tables in schema grok to grok_reader;

-- ------------------------------------------------------------------ key check
create or replace function grok_fn.check_key(p_key text) returns boolean
language sql volatile security definer set search_path = public, pg_temp as $$
  with hit as (
    update grok_api_keys set last_used_at = now()
     where revoked_at is null and key_sha256 = encode(sha256(convert_to(coalesce(p_key, ''), 'UTF8')), 'hex')
    returning 1)
  select exists (select 1 from hit)
$$;

-- ------------------------------------------------------------------ reading (owner grok_reader)
-- One read-only query over the grok views. The text is run as a subquery, so it is
-- one statement; the transaction is set read-only first.
create or replace function grok_fn.ro_query(p_sql text, p_limit integer default 200) returns jsonb
language plpgsql volatile security definer set search_path = grok, pg_temp as $$
declare res jsonb; lim integer := greatest(1, least(coalesce(p_limit, 200), 1000));
begin
  perform set_config('transaction_read_only', 'on', true);
  if p_sql is null or btrim(p_sql) = '' then raise exception 'Give sql: one SELECT over the views listed by schema.'; end if;
  if btrim(p_sql) !~* '^(select|with)\s' then raise exception 'Only a SELECT or WITH query.'; end if;
  if position(';' in rtrim(btrim(p_sql), ';')) > 0 then raise exception 'One statement only.'; end if;
  execute format('select coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) from (select * from (%s) grok_q limit %s) t',
                 rtrim(btrim(p_sql), ';'), lim) into res;
  if octet_length(res::text) > 400000 then
    raise exception 'Result too large (% KB). Select fewer columns or rows.', octet_length(res::text) / 1024;
  end if;
  return jsonb_build_object('rows', res, 'count', jsonb_array_length(res), 'limit', lim);
end $$;

-- The tables and columns Grok can read.
create or replace function grok_fn.schema_info() returns jsonb
language sql stable security definer set search_path = grok, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object('table', table_name, 'columns', cols) order by table_name), '[]'::jsonb)
    from (select table_name, jsonb_agg(column_name || ' ' || data_type order by ordinal_position) cols
            from information_schema.columns where table_schema = 'grok' group by table_name) z
$$;

-- Gaps per table and column. Allocators: open rows (not rejected); contacts: not duplicates.
create or replace function grok_fn.missing_summary() returns jsonb
language sql stable security definer set search_path = grok, pg_temp as $$
  with b as (select * from wi_mandates where verdict is distinct from 'rejected'),
       c as (select * from contacts where dupe_of_id is null)
  select jsonb_build_object(
    'wi_mandates', (select jsonb_build_object('scope', 'open rows (not rejected, not merged)', 'rows', count(*), 'missing', jsonb_build_object(
        'investor_type', count(*) filter (where nullif(btrim(investor_type), '') is null),
        'investor_country', count(*) filter (where nullif(btrim(investor_country), '') is null),
        'investor_city', count(*) filter (where nullif(btrim(investor_city), '') is null),
        'aum_usd', count(*) filter (where aum_usd is null),
        'aum_band', count(*) filter (where nullif(btrim(aum_band), '') is null),
        'ticket (min and max)', count(*) filter (where ticket_min_usd is null and ticket_max_usd is null),
        'min_manager_aum_usd', count(*) filter (where min_manager_aum_usd is null),
        'asset_classes', count(*) filter (where asset_classes is null or asset_classes::text in ('[]', '{}', 'null', '""')),
        'strategies', count(*) filter (where strategies is null or strategies::text in ('[]', '{}', 'null', '""')),
        'open_to_emerging_managers', count(*) filter (where open_to_emerging_managers is null),
        'wi_investor_id', count(*) filter (where wi_investor_id is null),
        'view_investor_url', count(*) filter (where nullif(btrim(view_investor_url), '') is null),
        'linkedin_url', count(*) filter (where nullif(btrim(linkedin_url), '') is null)),
      'investors', count(distinct lower(btrim(coalesce(investor_name, organization_name))))) from b),
    'contacts', (select jsonb_build_object('scope', 'contacts that are not duplicates', 'rows', count(*), 'missing', jsonb_build_object(
        'email', count(*) filter (where nullif(btrim(email), '') is null),
        'company', count(*) filter (where nullif(btrim(company), '') is null),
        'title', count(*) filter (where nullif(btrim(title), '') is null and nullif(btrim(role), '') is null),
        'country', count(*) filter (where nullif(btrim(country), '') is null),
        'city', count(*) filter (where nullif(btrim(city), '') is null),
        'phone', count(*) filter (where nullif(btrim(phone), '') is null),
        'linkedin_url', count(*) filter (where nullif(btrim(linkedin_url), '') is null))) from c),
    'iconnections', (select jsonb_build_object('scope', 'firms in the active I-Connections import', 'firms', count(*),
        'no_wi_link', count(*) filter (where wi_investor_id is null),
        'wi_id_but_no_profile', count(*) filter (where wi_investor_id is not null and not profile_stored),
        'profile_stored', count(*) filter (where profile_stored),
        'hidden_rejected_in_wi', count(*) filter (where wi_rejection_status = 'hidden')) from iconn_firms),
    'next', 'Use missing with table and columns to list the rows; iconn_status for the I-Connections firms.')
$$;

-- The rows behind a gap: key columns plus the asked columns, only rows with a gap.
create or replace function grok_fn.missing(p_table text, p_columns text[], p_open_only boolean default true,
                                           p_limit integer default 50, p_offset integer default 0) returns jsonb
language plpgsql stable security definer set search_path = grok, pg_temp as $$
declare
  keys text[]; cols text[]; c text; dt text; cond text := ''; sel text; res jsonb; total bigint; scope text := 'true';
  lim integer := greatest(1, least(coalesce(p_limit, 50), 500)); off integer := greatest(0, coalesce(p_offset, 0));
begin
  keys := case p_table when 'wi_mandates' then array['id', 'investor_name', 'wi_investor_id']
                       when 'contacts' then array['id', 'name', 'company']
                       when 'iconn_firms' then array['firm_key', 'firm_name', 'wi_investor_id']
                       else null end;
  if keys is null then raise exception 'table is wi_mandates, contacts or iconn_firms.'; end if;
  cols := coalesce(p_columns, '{}');
  if cardinality(cols) = 0 then
    cols := case p_table when 'wi_mandates' then array['investor_type', 'investor_country', 'aum_usd', 'ticket_min_usd', 'asset_classes', 'strategies', 'open_to_emerging_managers']
                         when 'contacts' then array['email', 'company', 'country', 'title']
                         else array['wi_investor_id', 'profile_stored'] end;
  end if;
  foreach c in array cols loop
    select data_type into dt from information_schema.columns where table_schema = 'grok' and table_name = p_table and column_name = c;
    if dt is null then raise exception 'Unknown column % in %.', c, p_table; end if;
    cond := cond || case when cond = '' then '' else ' or ' end
            || case when c = 'profile_stored' then 'not profile_stored'
                    when dt = 'boolean' then format('%I is null', c)
                    else format('(%1$I is null or btrim(%1$I::text) in (%2$L, %3$L, %4$L, %5$L))', c, '', '[]', '{}', 'null') end;
  end loop;
  if p_open_only and p_table = 'wi_mandates' then scope := 'verdict is distinct from ''rejected'''; end if;
  if p_table = 'contacts' then scope := 'dupe_of_id is null'; end if;
  if p_table = 'iconn_firms' then scope := 'coalesce(wi_rejection_status, '''') <> ''hidden'''; end if;
  sel := (select string_agg(format('%I', x), ', ' order by o)
            from (select x, min(o) o from unnest(keys || cols) with ordinality u(x, o) group by x) z);
  execute format('select count(*) from %I where (%s) and (%s)', p_table, scope, cond) into total;
  execute format('select coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) from (select %s from %I where (%s) and (%s) order by 1 limit %s offset %s) t',
                 sel, p_table, scope, cond, lim, off) into res;
  return jsonb_build_object('table', p_table, 'columns', cols, 'total_with_gaps', total, 'offset', off, 'count', jsonb_array_length(res), 'rows', res);
end $$;

-- I-Connections firms: link to With Intelligence, stored profile, what is missing.
create or replace function grok_fn.iconn_status(p_filter text default 'all', p_limit integer default 100, p_offset integer default 0) returns jsonb
language plpgsql stable security definer set search_path = grok, pg_temp as $$
declare res jsonb; cond text;
  lim integer := greatest(1, least(coalesce(p_limit, 100), 500)); off integer := greatest(0, coalesce(p_offset, 0));
begin
  cond := case coalesce(p_filter, 'all')
    when 'all' then 'true'
    when 'no_link' then 'wi_investor_id is null'
    when 'no_profile' then 'wi_investor_id is not null and not profile_stored'
    when 'missing' then 'not profile_stored'
    when 'linked' then 'wi_investor_id is not null'
    when 'profile_stored' then 'profile_stored'
    when 'hidden' then 'wi_rejection_status = ''hidden'''
    when 'to_check' then 'wi_rejection_status = ''to_review'''
    else null end;
  if cond is null then raise exception 'filter is all, missing, no_link, no_profile, linked, profile_stored, hidden or to_check.'; end if;
  execute format('select coalesce(jsonb_agg(to_jsonb(t) order by t.firm_name), ''[]''::jsonb) from (select firm_key, firm_name, contacts, bucket, match_method, matched_id, matched_name, wi_investor_id, link_how, link_certain, profile_stored, profile_read_at, wi_rejection_status, search_result, search_candidates from iconn_firms where %s order by firm_name limit %s offset %s) t', cond, lim, off) into res;
  return jsonb_build_object('filter', coalesce(p_filter, 'all'),
    'counts', (select jsonb_build_object('firms', count(*), 'linked', count(*) filter (where wi_investor_id is not null),
                 'profile_stored', count(*) filter (where profile_stored),
                 'no_profile', count(*) filter (where wi_investor_id is not null and not profile_stored),
                 'no_link', count(*) filter (where wi_investor_id is null)) from iconn_firms),
    'offset', off, 'count', jsonb_array_length(res), 'firms', res);
end $$;

create or replace function grok_fn.iconn_profiles(p_wi_ids text[] default null, p_firm text default null,
                                                  p_limit integer default 50, p_offset integer default 0) returns jsonb
language sql stable security definer set search_path = grok, pg_temp as $$
  with x as (
    select * from iconn_profiles
     where (p_wi_ids is null or cardinality(p_wi_ids) = 0 or wi_id = any(p_wi_ids))
       and (p_firm is null or btrim(p_firm) = '' or name ilike '%' || p_firm || '%'
            or exists (select 1 from unnest(iconn_firms) f where f ilike '%' || p_firm || '%'))
     order by name limit greatest(1, least(coalesce(p_limit, 50), 200)) offset greatest(0, coalesce(p_offset, 0)))
  select jsonb_build_object('total', (select count(*) from iconn_profiles), 'count', (select count(*) from x),
                            'profiles', coalesce((select jsonb_agg(to_jsonb(x)) from x), '[]'::jsonb))
$$;

create or replace function grok_fn.job_status(p_job bigint) returns jsonb
language sql stable security definer set search_path = grok, pg_temp as $$
  select case when not exists (select 1 from batch_jobs where id = p_job) then jsonb_build_object('error', 'No such job.') else
  jsonb_build_object(
    'job', (select to_jsonb(j) from batch_jobs j where id = p_job),
    'to_choose', coalesce((select jsonb_agg(jsonb_build_object('item', id, 'name', name, 'candidates', result::jsonb -> 'candidates'))
                             from (select * from batch_items where job_id = p_job and status = 'check_match' order by id limit 25) z), '[]'::jsonb),
    'not_found', coalesce((select jsonb_agg(name) from (select name from batch_items where job_id = p_job and status = 'not_found' order by id limit 50) z), '[]'::jsonb),
    'errors', coalesce((select jsonb_agg(jsonb_build_object('item', id, 'name', name, 'result', result))
                          from (select * from batch_items where job_id = p_job and status in ('error', 'no_profile') order by id limit 20) z), '[]'::jsonb),
    'saved_to', case (select kind from batch_jobs where id = p_job) when 'mandates_missing' then 'wi_profile_reads' else 'iconn_profiles' end)
  end
$$;

-- ------------------------------------------------------------------ fill (owner postgres)
-- Fill blanks on one row, logged in wi_fill_log. Dry run unless p_dry_run = false.
create or replace function grok_fn.fill(p_table text, p_id bigint, p_fields jsonb, p_source text,
                                        p_overwrite boolean default false, p_dry_run boolean default true,
                                        p_by text default 'Grok') returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  allowed text[]; k text; v jsonb; typ text; cur text; newtxt text; res jsonb := '[]'::jsonb; st text; why text;
  rowname text; wi text; tag text; n_done int := 0; ev jsonb; exists_row boolean;
begin
  if p_table = 'wi_mandates' then
    allowed := array['investor_type', 'investor_country', 'investor_city', 'aum_usd', 'aum_band', 'ticket_min_usd', 'ticket_max_usd',
                     'min_manager_aum_usd', 'asset_classes', 'strategies', 'open_to_emerging_managers', 'view_investor_url',
                     'linkedin_url', 'wi_investor_id'];
  elsif p_table = 'contacts' then
    allowed := array['company', 'role', 'title', 'country', 'city', 'region', 'email', 'phone', 'linkedin_url'];
  else raise exception 'fill works on wi_mandates or contacts.'; end if;
  if p_fields is null or jsonb_typeof(p_fields) <> 'object' or p_fields = '{}'::jsonb then raise exception 'Give fields: {column: value}.'; end if;
  if coalesce(btrim(p_source), '') = '' then raise exception 'Give source: where the value comes from (a With Intelligence profile link, a website...).'; end if;

  if p_table = 'wi_mandates' then
    select true, coalesce(investor_name, organization_name), nullif(evidence ->> 'wi_investor_id', ''), evidence into exists_row, rowname, wi, ev
      from wi_mandates where id = p_id and coalesce(validation_status, '') <> 'merged';
  else
    select true, name into exists_row, rowname from contacts where id = p_id;
  end if;
  if not coalesce(exists_row, false) then raise exception 'No % row with id %.', p_table, p_id; end if;
  tag := 'grok-' || to_char(clock_timestamp(), 'YYYYMMDD-HH24MISS') || '-' || substr(md5(random()::text), 1, 4);

  for k, v in select * from jsonb_each(p_fields) loop
    st := null; why := null;
    if not (k = any(allowed)) then
      res := res || jsonb_build_object('field', k, 'status', 'not_allowed', 'why', 'Allowed: ' || array_to_string(allowed, ', '));
      continue;
    end if;
    -- current value and type
    if k = 'wi_investor_id' then
      typ := 'text'; cur := wi;
    else
      select format_type(a.atttypid, a.atttypmod) into typ from pg_attribute a
       where a.attrelid = ('public.' || p_table)::regclass and a.attname = k and not a.attisdropped;
      execute format('select %I::text from public.%I where id = $1', k, p_table) into cur using p_id;
    end if;
    -- the new value as text for its type, checked
    newtxt := case when jsonb_typeof(v) = 'string' then v #>> '{}' when jsonb_typeof(v) = 'null' then null else v::text end;
    if newtxt is null or btrim(newtxt) = '' then why := 'Empty value: nothing to fill.';
    elsif typ = 'jsonb' then
      if jsonb_typeof(v) <> 'array' or jsonb_array_length(v) = 0
         or exists (select 1 from jsonb_array_elements(v) e where jsonb_typeof(e) <> 'string' or btrim(e #>> '{}') = '') then
        why := 'Must be a non-empty list of names, e.g. ["Hedge Funds","Private Equity"].';
      else newtxt := v::text; end if;
    elsif typ = 'numeric' then
      if newtxt !~ '^\d+(\.\d+)?$' then why := 'Must be a number in US dollars.';
      elsif k in ('aum_usd', 'ticket_min_usd', 'ticket_max_usd', 'min_manager_aum_usd') and newtxt::numeric < 100000 then
        why := 'Looks like millions: send US dollars (e.g. 2500000000 for $2.5bn).';
      end if;
    elsif typ = 'boolean' then
      if lower(newtxt) not in ('true', 'false') then why := 'Must be true or false.'; else newtxt := lower(newtxt); end if;
    else
      newtxt := btrim(newtxt);
      if length(newtxt) > 320 then why := 'Too long.';
      elsif k = 'investor_country' and newtxt !~ '^[A-Z]{2}$' then why := 'Two-letter country code, e.g. US, GB, CH.';
      elsif k = 'view_investor_url' and newtxt !~ '^https://platform\.withintelligence\.com/(explore/)?investors/-?\d+$' then
        why := 'Must be a With Intelligence profile link: https://platform.withintelligence.com/explore/investors/<id>.';
      elsif k = 'linkedin_url' and newtxt !~* '^https?://([a-z]+\.)?linkedin\.com/' then why := 'Must be a LinkedIn link.';
      elsif k = 'email' and newtxt !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then why := 'Not an email address.';
      elsif k = 'wi_investor_id' and newtxt !~ '^-?\d+$' then why := 'With Intelligence ids are numbers.';
      end if;
    end if;
    if why is not null then
      res := res || jsonb_build_object('field', k, 'status', 'invalid', 'why', why, 'value', v);
      continue;
    end if;
    if cur is not null and btrim(cur) not in ('', '[]', '{}', 'null') then
      if cur = newtxt then
        res := res || jsonb_build_object('field', k, 'status', 'same_value', 'current', cur); continue;
      elsif not p_overwrite then
        res := res || jsonb_build_object('field', k, 'status', 'skipped_has_value', 'current', cur, 'proposed', newtxt); continue;
      end if;
    end if;
    if p_dry_run then
      res := res || jsonb_build_object('field', k, 'status', 'would_fill', 'current', cur, 'new', newtxt); continue;
    end if;
    -- write and log
    if k = 'wi_investor_id' then
      if ev is not null and jsonb_typeof(ev) <> 'object' then
        res := res || jsonb_build_object('field', k, 'status', 'invalid', 'why', 'The row''s evidence is not an object; not touched.'); continue;
      end if;
      update wi_mandates set evidence = coalesce(evidence, '{}'::jsonb) || jsonb_build_object('wi_investor_id', newtxt) where id = p_id;
      wi := newtxt;
    else
      execute format('update public.%I set %I = %L::%s where id = $1', p_table, k, newtxt, typ) using p_id;
    end if;
    insert into wi_fill_log (mandate_id, investor_name, field, old_value, new_value, source, wi_investor_id)
    values (case when p_table = 'wi_mandates' then p_id end, rowname,
            case when p_table = 'wi_mandates' then k else 'contacts.' || k || ' #' || p_id end,
            cur, newtxt, 'Grok fill ' || tag || ' (' || coalesce(p_by, 'Grok') || '): ' || left(p_source, 400), wi);
    n_done := n_done + 1;
    res := res || jsonb_build_object('field', k, 'status', 'filled', 'old', cur, 'new', newtxt);
  end loop;
  return jsonb_build_object('table', p_table, 'id', p_id, 'name', rowname, 'dry_run', p_dry_run,
                            'run', case when n_done > 0 then tag end, 'filled', n_done, 'fields', res,
                            'next', case when p_dry_run then 'Nothing was written. Send the same call with dry_run false to write the would_fill fields.'
                                         when n_done > 0 then 'Logged in wi_fill_log. To reverse: fill_undo with run ' || tag || '.' end);
end $$;

-- Undo one fill run: puts the old values back where the value is still the one Grok wrote.
create or replace function grok_fn.fill_undo(p_run text, p_dry_run boolean default true) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare r record; tbl text; rid bigint; col text; typ text; cur text; res jsonb := '[]'::jsonb; n int := 0;
begin
  if coalesce(p_run, '') !~ '^grok-\d{8}-\d{6}-[0-9a-f]{4}$' then raise exception 'Give run: the run tag fill returned.'; end if;
  for r in select * from wi_fill_log where source like 'Grok fill ' || p_run || ' %' order by id desc loop
    if r.field like 'contacts.%' then
      tbl := 'contacts'; col := split_part(substr(r.field, 10), ' #', 1); rid := split_part(r.field, ' #', 2)::bigint;
    else tbl := 'wi_mandates'; col := r.field; rid := r.mandate_id; end if;
    if col = 'wi_investor_id' then
      select evidence ->> 'wi_investor_id' into cur from wi_mandates where id = rid; typ := 'text';
    else
      select format_type(a.atttypid, a.atttypmod) into typ from pg_attribute a where a.attrelid = ('public.' || tbl)::regclass and a.attname = col;
      execute format('select %I::text from public.%I where id = $1', col, tbl) into cur using rid;
    end if;
    if cur is distinct from r.new_value then
      res := res || jsonb_build_object('table', tbl, 'id', rid, 'field', col, 'status', 'changed_since', 'current', cur); continue;
    end if;
    if not p_dry_run then
      if col = 'wi_investor_id' then
        update wi_mandates set evidence = case when r.old_value is null then evidence - 'wi_investor_id'
                                               else evidence || jsonb_build_object('wi_investor_id', r.old_value) end where id = rid;
      else
        execute format('update public.%I set %I = %L::%s where id = $1', tbl, col, r.old_value, typ) using rid;
      end if;
      insert into wi_fill_log (mandate_id, investor_name, field, old_value, new_value, source, wi_investor_id)
      values (r.mandate_id, r.investor_name, r.field, r.new_value, r.old_value, 'Grok undo ' || p_run, r.wi_investor_id);
      n := n + 1;
    end if;
    res := res || jsonb_build_object('table', tbl, 'id', rid, 'field', col, 'status', case when p_dry_run then 'would_restore' else 'restored' end,
                                     'back_to', r.old_value);
  end loop;
  return jsonb_build_object('run', p_run, 'dry_run', p_dry_run, 'restored', n, 'fields', res);
end $$;

-- ------------------------------------------------------------------ batch jobs (owner postgres)
create or replace function grok_fn.job_create(p_kind text, p_items jsonb default null, p_limit integer default 100,
                                              p_force boolean default false, p_by text default 'Grok') returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare jid bigint; n int; lim int := greatest(1, least(coalesce(p_limit, 100), 500));
begin
  if p_kind not in ('iconn_missing', 'mandates_missing', 'wi_ids', 'names') then
    raise exception 'kind is iconn_missing, mandates_missing, wi_ids or names.';
  end if;
  if p_kind in ('wi_ids', 'names') and (p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0) then
    raise exception 'Give items: a list of With Intelligence ids or names.';
  end if;
  insert into grok_jobs (kind, requested_by, note) values (p_kind, p_by, null) returning id into jid;

  if p_kind = 'iconn_missing' then
    insert into grok_job_items (job_id, target, target_key, name, wi_id)
    select jid, 'iconn_firm', f.firm_key, f.firm_name, f.wi_investor_id
      from grok.iconn_firms f
     where not f.profile_stored and coalesce(f.wi_rejection_status, '') <> 'hidden'
       and not exists (select 1 from grok_job_items i join grok_jobs j on j.id = i.job_id
                        where i.target = 'iconn_firm' and i.target_key = f.firm_key and i.status in ('pending', 'working')
                          and j.status in ('queued', 'running', 'paused_auth'))
       and (p_force or not exists (select 1 from grok_job_items i where i.target = 'iconn_firm' and i.target_key = f.firm_key
                                     and i.status in ('not_found', 'check_match') and i.done_at > now() - interval '30 days'))
     order by (f.wi_investor_id is null), f.firm_name
     limit lim;
  elsif p_kind = 'mandates_missing' then
    insert into grok_job_items (job_id, target, target_key, name, wi_id, extra)
    select jid, 'mandate_company', c.k, c.nm, c.wi, jsonb_build_object('mandate_ids', c.ids)
      from (select lower(btrim(coalesce(nullif(btrim(m.investor_name), ''), m.organization_name))) k,
                   (array_agg(coalesce(nullif(btrim(m.investor_name), ''), m.organization_name) order by m.id desc))[1] nm,
                   (array_remove(array_agg(m.wi_investor_id order by m.id desc), null))[1] wi,
                   array_agg(m.id order by m.id desc) ids
              from grok.wi_mandates m
             where m.verdict is distinct from 'rejected'
               and (nullif(btrim(m.investor_type), '') is null or nullif(btrim(m.investor_country), '') is null or m.aum_usd is null
                    or (m.ticket_min_usd is null and m.ticket_max_usd is null) or m.strategies is null or m.strategies::text in ('[]', '{}')
                    or m.open_to_emerging_managers is null or m.wi_investor_id is null)
             group by 1) c
     where coalesce(c.k, '') <> ''
       and (p_force or not exists (select 1 from wi_profile_reads r where r.company_key = c.k and r.read_at > now() - interval '30 days'))
       and not exists (select 1 from grok_job_items i join grok_jobs j on j.id = i.job_id
                        where i.target = 'mandate_company' and i.target_key = c.k and i.status in ('pending', 'working')
                          and j.status in ('queued', 'running', 'paused_auth'))
     order by (c.wi is null), c.k
     limit lim;
  elsif p_kind = 'wi_ids' then
    insert into grok_job_items (job_id, target, target_key, name, wi_id)
    select jid, 'wi_id', x, null, x
      from (select distinct btrim(e #>> '{}') x from jsonb_array_elements(p_items) e) z
     where x ~ '^-?\d+$'
       and (p_force or not exists (select 1 from iconn_wi_profiles p where p.wi_id = x and p.read_at > now() - interval '30 days'))
     limit lim;
  else
    insert into grok_job_items (job_id, target, target_key, name)
    select jid, 'name', x, x from (select distinct btrim(e #>> '{}') x from jsonb_array_elements(p_items) e) z
     where length(x) between 2 and 200 limit lim;
  end if;
  get diagnostics n = row_count;
  update grok_jobs set total = n, status = case when n = 0 then 'done' else 'queued' end,
         finished_at = case when n = 0 then now() end where id = jid;
  return jsonb_build_object('job_id', jid, 'kind', p_kind, 'items', n,
    'by_id', (select count(*) from grok_job_items where job_id = jid and wi_id is not null),
    'by_name', (select count(*) from grok_job_items where job_id = jid and wi_id is null),
    'pace', '12 lookups every 2 minutes; about ' || greatest(1, ceil(n / 12.0) * 2)::int || ' minutes',
    'next', case when n = 0 then 'Nothing to look up.' else 'Check progress with wi_batch_status and job_id ' || jid || '.' end);
end $$;

-- The worker: claim up to p_n items (oldest job first). Nothing when the token is out of date.
create or replace function grok_fn.job_next(p_n integer default 12) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare left_s numeric; res jsonb;
begin
  select extract(epoch from (expires_at - now())) into left_s from wi_auth_token where id = 1;
  if left_s is null or left_s <= 60 then
    update grok_jobs set status = 'paused_auth' where status in ('queued', 'running');
    return jsonb_build_object('token_ok', false, 'items', '[]'::jsonb);
  end if;
  -- give back items a stopped run left behind
  update grok_job_items set status = 'pending' where status = 'working' and claimed_at < now() - interval '10 minutes' and attempts < 3;
  update grok_job_items set status = 'error', result = jsonb_build_object('error', 'Gave up after 3 tries.'), done_at = now()
   where status = 'working' and claimed_at < now() - interval '10 minutes' and attempts >= 3;
  update grok_jobs set status = 'running' where status = 'paused_auth';
  with pick as (
    select i.id from grok_job_items i join grok_jobs j on j.id = i.job_id
     where i.status = 'pending' and j.status in ('queued', 'running')
     order by j.id, i.id limit greatest(1, least(coalesce(p_n, 12), 25)) for update of i skip locked
  ), upd as (
    update grok_job_items i set status = 'working', attempts = attempts + 1, claimed_at = now()
      from pick where i.id = pick.id returning i.*
  )
  select coalesce(jsonb_agg(jsonb_build_object('item_id', id, 'job_id', job_id, 'target', target, 'name', name, 'wi_id', wi_id)), '[]'::jsonb)
    into res from upd;
  update grok_jobs j set status = 'running' where j.status = 'queued' and exists (select 1 from grok_job_items i where i.job_id = j.id and i.status = 'working');
  return jsonb_build_object('token_ok', true, 'items', res);
end $$;

-- The worker: store one result.
create or replace function grok_fn.job_save(p_item bigint, p_status text, p_wi_id text, p_method text,
                                            p_payload jsonb, p_result jsonb) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare it record;
begin
  select * into it from grok_job_items where id = p_item;
  if not found then return jsonb_build_object('error', 'no item'); end if;
  if p_status = 'auth_error' then
    update grok_job_items set status = 'pending', attempts = greatest(0, attempts - 1) where id = p_item;
    update grok_jobs set status = 'paused_auth' where id = it.job_id and status in ('queued', 'running');
    return jsonb_build_object('item', p_item, 'status', 'paused_auth');
  end if;
  if p_status not in ('ok', 'not_found', 'check_match', 'no_profile', 'error') then p_status := 'error'; end if;
  update grok_job_items set status = p_status, wi_id = coalesce(p_wi_id, wi_id), result = p_result, done_at = now() where id = p_item;
  if it.target = 'mandate_company' then
    insert into wi_profile_reads (mandate_id, mandate_ids, company_key, wi_investor_id, status, method, payload)
    select (it.extra -> 'mandate_ids' ->> 0)::bigint,
           array(select jsonb_array_elements_text(it.extra -> 'mandate_ids'))::bigint[],
           it.target_key, p_wi_id, p_status, 'grok_batch:' || coalesce(p_method, ''),
           case when p_status = 'ok' then p_payload else p_result end;
  elsif p_status = 'ok' and p_payload is not null and p_wi_id is not null then
    insert into iconn_wi_profiles (wi_id, status, payload, read_at) values (p_wi_id, 'ok', p_payload, now())
    on conflict (wi_id) do update set status = 'ok', payload = excluded.payload, read_at = now();
  end if;
  update grok_jobs j set status = 'done', finished_at = now()
   where j.id = it.job_id and j.status in ('queued', 'running')
     and not exists (select 1 from grok_job_items i where i.job_id = j.id and i.status in ('pending', 'working'));
  return jsonb_build_object('item', p_item, 'status', p_status);
end $$;

create or replace function grok_fn.job_cancel(p_job bigint) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare n int;
begin
  update grok_job_items set status = 'cancelled', done_at = now() where job_id = p_job and status in ('pending', 'working');
  get diagnostics n = row_count;
  update grok_jobs set status = 'cancelled', finished_at = now() where id = p_job and status not in ('done', 'cancelled');
  return jsonb_build_object('job_id', p_job, 'cancelled_items', n);
end $$;

-- ------------------------------------------------------------------ token alerts (owner postgres)
-- p_probe: what a live test call to With Intelligence said ('ok', 'auth_error', 'skipped').
-- Returns the alert to send, at most once per token (grok_alerts), and files it in the app.
create or replace function grok_fn.token_alert(p_probe text default 'skipped') returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare exp timestamptz; upd timestamptz; hrs numeric; k text; title text; body text; paused int;
begin
  select expires_at, updated_at into exp, upd from wi_auth_token where id = 1;
  hrs := round(extract(epoch from (exp - now())) / 3600.0, 1);
  select count(*) into paused from grok_jobs where status = 'paused_auth';
  if exp is null then
    k := 'missing'; title := 'With Intelligence token missing';
    body := 'No With Intelligence session token is stored. Lookups and batch jobs are stopped until you paste a fresh one into wi_auth_token.';
  elsif hrs <= 0 then
    k := 'expired:' || exp; title := 'With Intelligence token expired';
    body := 'The With Intelligence token expired at ' || to_char(exp at time zone 'UTC', 'DD Mon HH24:MI') || ' UTC. Lookups and batch jobs are paused until you renew it.';
  elsif p_probe = 'auth_error' then
    k := 'rejected:' || coalesce(upd::text, exp::text); title := 'With Intelligence token rejected';
    body := 'With Intelligence refused the saved token before its expiry time (' || hrs || ' h left on paper). Sign in again and renew it.';
  elsif hrs <= 3 then
    k := 'expiring:' || exp; title := 'With Intelligence token expires soon';
    body := 'The With Intelligence token expires in ' || hrs || ' h (' || to_char(exp at time zone 'UTC', 'DD Mon HH24:MI') || ' UTC). Renew it to keep lookups running.';
  else
    return jsonb_build_object('send', false, 'hours_left', hrs, 'probe', p_probe);
  end if;
  if paused > 0 then body := body || ' ' || paused || ' batch job(s) waiting.'; end if;
  body := body || E'\nHow: sign in to With Intelligence, DevTools > Network > a graphql request > copy the Bearer value, then update wi_auth_token (access_token, expires_at).';
  insert into grok_alerts (key, detail) values (k, title) on conflict (key) do nothing;
  if not found then return jsonb_build_object('send', false, 'already_sent', k, 'hours_left', hrs); end if;
  insert into app_notifications (kind, source, title, subtitle, fields, audience)
  values ('alert', 'With Intelligence', title, left(body, 300), jsonb_build_object('hours_left', hrs, 'probe', p_probe), null);
  return jsonb_build_object('send', true, 'key', k, 'text', title || E'\n' || body, 'hours_left', hrs);
end $$;

-- ------------------------------------------------------------------ ownership and grants
grant create on schema grok_fn to grok_reader;
alter function grok_fn.ro_query(text, integer) owner to grok_reader;
alter function grok_fn.schema_info() owner to grok_reader;
alter function grok_fn.missing_summary() owner to grok_reader;
alter function grok_fn.missing(text, text[], boolean, integer, integer) owner to grok_reader;
alter function grok_fn.iconn_status(text, integer, integer) owner to grok_reader;
alter function grok_fn.iconn_profiles(text[], text, integer, integer) owner to grok_reader;
alter function grok_fn.job_status(bigint) owner to grok_reader;
revoke create on schema grok_fn from grok_reader;

revoke all on all functions in schema grok_fn from public;
grant execute on all functions in schema grok_fn to postgres;

commit;

-- UNDO (everything above is new; nothing existing was changed):
--   begin;
--   drop schema grok_fn cascade; drop schema grok cascade;
--   drop table public.grok_job_items, public.grok_jobs, public.grok_alerts, public.grok_api_keys;
--   revoke grok_reader from postgres; drop role grok_reader;
--   commit;
-- (Profiles a batch saved stay in iconn_wi_profiles / wi_profile_reads: those are reads, not changes.)
