-- Schema 21e (9 Nov 2026): Grok is the data source. n8n hands it a to-do list
-- (grok_fn.todo) and saves what it found (grok_fn.save). Replaces the batch-lookup,
-- token-alert and fill pieces of schema-21, which are dropped (new, unused, empty).
--
-- save never overwrites: it fills blanks only, on an allow-list of profile fields, logs
-- every change in wi_fill_log (source starting "Grok"), and refuses any row whose verdict,
-- qualification, score or approval would change (the hedge fund rule runs on every
-- update). dry_run does the real update inside a rolled-back sub-transaction, so it shows
-- exactly what would happen, triggers included.

begin;

-- ---------------------------------------------------------------- drop schema-21 extras
drop function if exists grok_fn.job_create(text, jsonb, integer, boolean, text);
drop function if exists grok_fn.job_next(integer);
drop function if exists grok_fn.job_save(bigint, text, text, text, jsonb, jsonb);
drop function if exists grok_fn.job_cancel(bigint);
drop function if exists grok_fn.job_status(bigint);
drop function if exists grok_fn.token_alert(text);
drop function if exists grok_fn.fill(text, bigint, jsonb, text, boolean, boolean, text);
drop function if exists grok_fn.fill_undo(text, boolean);
drop view if exists grok.batch_items;
drop view if exists grok.batch_jobs;
drop table if exists public.grok_job_items;
drop table if exists public.grok_jobs;
drop table if exists public.grok_alerts;

-- ---------------------------------------------------------------- views: extra columns (appended)
create or replace view grok.wi_mandates as
select id, investor_name, organization_name, investor_type, investor_country, investor_city,
       aum_usd, aum_band, ticket_min_usd, ticket_max_usd, min_manager_aum_usd,
       asset_classes, strategies, open_to_emerging_managers,
       nullif(evidence ->> 'wi_investor_id', '') as wi_investor_id,
       view_investor_url, linkedin_url,
       coalesce(nullif(new_qualification, ''), qualification) as verdict, new_fit_score as fit_score,
       validation_status, hf_evidence, alert_date, left(intention_summary, 400) as intention_summary,
       wi_enriched_at, created_at, updated_at,
       coalesce(jsonb_typeof(evidence) = 'object' and nullif(btrim(evidence ->> 'wi_summary'), '') is not null, false) as has_wi_summary
  from public.wi_mandates
 where coalesce(validation_status, '') <> 'merged';

create or replace view grok.iconn_firms as
with runs as (
  select id, import_no, last_matched_at from public.iconnections_import_runs where hidden_at is null
), t as (
  select r.run_id, r.row_no, r.name, r.contacts, r.bucket, r.match_method, r.matched_id, r.matched_name,
         r.country, r.domain, r.investor_type, r.aum_text,
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
         (array_agg(t.matched_name order by t.row_no))[1] as matched_name,
         (array_remove(array_agg(t.country order by t.row_no), null))[1] as country,
         (array_remove(array_agg(t.domain order by t.row_no), null))[1] as domain,
         (array_remove(array_agg(t.investor_type order by t.row_no), null))[1] as investor_type,
         (array_remove(array_agg(t.aum_text order by t.row_no), null))[1] as aum_text
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
                 where k.run_id = f.run_id and k.row_no = any(f.row_nos) and k.confidence in ('Exact', 'Likely') limit 3) z) as search_candidates,
       f.country, f.domain, f.investor_type, f.aum_text,
       (select k.candidates -> 0 ->> 'id' from public.iconn_wi_lookup k
         where k.run_id = f.run_id and k.row_no = any(f.row_nos) and k.confidence = 'Grok candidate'
         order by k.searched_at desc limit 1) as grok_candidate_wi_id
  from f
  left join grok.iconn_links l on l.firm_key = f.firm_key
  left join public.iconn_wi_profiles p on p.wi_id = l.wi_investor_id and p.status = 'ok'
  left join public.iconn_wi_rejections w on w.firm_key = f.firm_key;

grant select on all tables in schema grok to grok_reader;

-- ---------------------------------------------------------------- todo (owner grok_reader)
-- What Grok should look up. mandates: one item per investor (its open rows grouped by
-- With Intelligence id, else by name), only investors with a gap. iconnections: firms in
-- the active import with no stored profile, not hidden, not waiting on a Grok candidate.
create or replace function grok_fn.todo(p_scope text, p_limit integer default 20, p_offset integer default 0) returns jsonb
language plpgsql stable security definer set search_path = grok, public, pg_temp as $$
declare lim integer := greatest(1, least(coalesce(p_limit, 20), 100)); off integer := greatest(0, coalesce(p_offset, 0)); res jsonb;
begin
  if p_scope = 'mandates' then
    with o as (
      select m.*, public.wi_name_key(coalesce(nullif(btrim(m.investor_name), ''), m.organization_name)) as nk
        from wi_mandates m
       where m.verdict is distinct from 'rejected' and coalesce(m.validation_status, '') <> 'not_an_allocator'
    ), nw as (   -- the one With Intelligence id a name carries, if exactly one
      select nk, case when count(distinct wi_investor_id) = 1 then max(wi_investor_id) end as wi from o group by nk
    ), g0 as (
      select o.*, coalesce(o.wi_investor_id, nw.wi, 'name:' || o.nk) as gk from o join nw using (nk)
    ), g as (
      select gk, max(id) as id, array_agg(id order by id desc) as row_ids,
             (array_agg(coalesce(nullif(btrim(investor_name), ''), organization_name) order by id desc))[1] as investor_name,
             (array_remove(array_agg(investor_country order by id desc), null))[1] as country,
             (array_remove(array_agg(wi_investor_id order by id desc), null))[1] as wi_id,
             (array_remove(array_agg(case when view_investor_url ~ '^https://platform\.withintelligence\.com/(explore/)?investors/-?\d+$' then view_investor_url end order by id desc), null))[1] as wi_url,
             bool_or(validation_status = 'pending') as to_validate,
             bool_or(nullif(btrim(investor_type), '') is null) as m_type,
             bool_or(nullif(btrim(investor_country), '') is null) as m_country,
             bool_or(nullif(btrim(investor_city), '') is null) as m_city,
             bool_or(aum_usd is null) as m_aum,
             bool_or(nullif(btrim(aum_band), '') is null) as m_band,
             bool_or(asset_classes is null or asset_classes::text in ('[]', '{}', 'null', '""')) as m_assets,
             bool_or(strategies is null or strategies::text in ('[]', '{}', 'null', '""')) as m_strats,
             bool_or(ticket_min_usd is null and ticket_max_usd is null) as m_ticket,
             bool_or(min_manager_aum_usd is null) as m_minaum,
             bool_or(open_to_emerging_managers is null) as m_em,
             bool_or(wi_investor_id is null) as m_wiid,
             bool_or(view_investor_url is null or view_investor_url !~ '^https://platform\.withintelligence\.com/(explore/)?investors/-?\d+$') as m_wiurl,
             bool_or(not has_wi_summary) as m_summary
        from g0 group by gk
    ), items as (
      select g.*,
             array_remove(array[
               case when m_type then 'investor_type' end, case when m_country then 'country' end,
               case when m_city then 'city' end, case when m_aum then 'aum_usd' end, case when m_band then 'aum_band' end,
               case when m_assets then 'asset_classes' end, case when m_strats then 'strategies' end,
               case when m_ticket then 'ticket_min_usd' end, case when m_ticket then 'ticket_max_usd' end,
               case when m_minaum then 'min_manager_aum_usd' end, case when m_em then 'open_to_emerging_managers' end,
               case when m_wiid then 'wi_id' end, case when m_wiurl then 'wi_url' end, case when m_summary then 'summary' end], null) as missing,
             array_remove(array[case when m_strats then 'long_short_or_quant (needs strategies)' end,
                                case when m_em then 'emerging_managers' end], null) as not_stated,
             (m_type::int + m_country::int + m_aum::int + m_assets::int + m_strats::int + m_ticket::int + m_em::int + m_wiid::int) as core_gaps
        from g
    ), gaps as (select * from items where cardinality(missing) > 0)
    select jsonb_build_object(
      'scope', 'mandates',
      'totals', (select jsonb_build_object('investors_with_gaps', count(*), 'rows_with_gaps', sum(cardinality(row_ids)),
                    'by_field', jsonb_build_object(
                      'investor_type', count(*) filter (where m_type), 'country', count(*) filter (where m_country),
                      'city', count(*) filter (where m_city), 'aum_usd', count(*) filter (where m_aum), 'aum_band', count(*) filter (where m_band),
                      'asset_classes', count(*) filter (where m_assets), 'strategies', count(*) filter (where m_strats),
                      'ticket', count(*) filter (where m_ticket), 'min_manager_aum_usd', count(*) filter (where m_minaum),
                      'open_to_emerging_managers', count(*) filter (where m_em), 'wi_id', count(*) filter (where m_wiid),
                      'summary', count(*) filter (where m_summary)),
                    'not_stated_in_app', jsonb_build_object('long_short_or_quant', count(*) filter (where m_strats),
                                                            'emerging_managers', count(*) filter (where m_em))) from gaps),
      'offset', off, 'limit', lim,
      'items', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'row_ids', row_ids, 'investor_name', investor_name, 'country', country,
                           'wi_id', wi_id, 'wi_url', coalesce(wi_url, case when wi_id is not null then 'https://platform.withintelligence.com/explore/investors/' || wi_id end),
                           'missing', missing, 'not_stated', not_stated, 'to_validate', to_validate) order by core_gaps desc, gk)
                         from (select * from gaps order by core_gaps desc, gk limit lim offset off) z), '[]'::jsonb),
      'next_offset', case when off + lim < (select count(*) from gaps) then off + lim end)
    into res;
    return res;
  elsif p_scope = 'iconnections' then
    with gaps as (
      select * from iconn_firms
       where not profile_stored and coalesce(wi_rejection_status, '') <> 'hidden' and grok_candidate_wi_id is null)
    select jsonb_build_object(
      'scope', 'iconnections',
      'totals', (select jsonb_build_object('firms_without_profile', count(*), 'with_wi_link', count(*) filter (where wi_investor_id is not null),
                   'without_wi_link', count(*) filter (where wi_investor_id is null),
                   'waiting_for_review', (select count(*) from iconn_firms where grok_candidate_wi_id is not null and not profile_stored),
                   'firms_in_import', (select count(*) from iconn_firms)) from gaps),
      'offset', off, 'limit', lim,
      'items', coalesce((select jsonb_agg(jsonb_build_object('id', firm_key, 'investor_name', firm_name, 'country', country,
                           'type_in_iconnections', investor_type, 'website', domain, 'aum_in_iconnections', aum_text,
                           'wi_id', wi_investor_id, 'wi_url', case when wi_investor_id is not null then 'https://platform.withintelligence.com/explore/investors/' || wi_investor_id end,
                           'link_certain', case when wi_investor_id is not null then link_certain end,
                           'earlier_search_candidates', search_candidates,
                           'missing', case when wi_investor_id is null then jsonb_build_array('wi_link', 'profile') else jsonb_build_array('profile') end)
                           order by (wi_investor_id is null), firm_name)
                         from (select * from gaps order by (wi_investor_id is null), firm_name limit lim offset off) z), '[]'::jsonb),
      'next_offset', case when off + lim < (select count(*) from gaps) then off + lim end)
    into res;
    return res;
  end if;
  raise exception 'scope is mandates or iconnections.';
end $$;

-- ---------------------------------------------------------------- value checks
-- One field from Grok: where it goes, its type, the value as text, or why it is refused.
create or replace function grok_fn.check_field(p_scope text, p_key text, p_val jsonb,
                                               out target text, out typ text, out val text, out err text)
language plpgsql immutable as $$
declare s text; k text := lower(btrim(p_key));
begin
  k := case k when 'investor_country' then 'country' when 'investor_city' then 'city' when 'emerging' then 'open_to_emerging_managers'
              when 'profile_summary' then 'summary' when 'type' then 'investor_type' else k end;
  target := case k
    when 'investor_type' then 'investor_type' when 'country' then 'investor_country' when 'city' then 'investor_city'
    when 'aum_usd' then 'aum_usd' when 'aum_band' then 'aum_band' when 'asset_classes' then 'asset_classes'
    when 'strategies' then 'strategies' when 'ticket_min_usd' then 'ticket_min_usd' when 'ticket_max_usd' then 'ticket_max_usd'
    when 'open_to_emerging_managers' then 'open_to_emerging_managers' when 'min_manager_aum_usd' then 'min_manager_aum_usd'
    when 'summary' then 'evidence.wi_summary' when 'wi_id' then 'evidence.wi_investor_id' when 'wi_url' then 'view_investor_url'
    when 'name' then case when p_scope = 'iconnections' then 'name' end
    else null end;
  if target is null then
    err := 'Not allowed. Allowed: investor_type, country, city, aum_usd, aum_band, asset_classes, strategies, ticket_min_usd, ticket_max_usd, open_to_emerging_managers, min_manager_aum_usd, summary, wi_id, wi_url' || case when p_scope = 'iconnections' then ', name' else '' end || '.';
    return;
  end if;
  if p_val is null or jsonb_typeof(p_val) = 'null' then err := 'Empty: nothing to save.'; return; end if;
  if k in ('aum_usd', 'ticket_min_usd', 'ticket_max_usd', 'min_manager_aum_usd') then
    typ := 'numeric';
    if jsonb_typeof(p_val) <> 'number' then err := 'Must be a number (US dollars), not text.'; return; end if;
    if (p_val #>> '{}')::numeric < 100000 then err := 'Looks like millions: send full US dollars (e.g. 2500000000 for $2.5bn).'; return; end if;
    if (p_val #>> '{}')::numeric > 50000000000000 then err := 'Too large to be US dollars.'; return; end if;
    val := round((p_val #>> '{}')::numeric)::text;
  elsif k = 'open_to_emerging_managers' then
    typ := 'boolean';
    if jsonb_typeof(p_val) <> 'boolean' then err := 'Must be true or false (not text).'; return; end if;
    val := p_val #>> '{}';
  elsif k in ('asset_classes', 'strategies') then
    typ := 'jsonb';
    if jsonb_typeof(p_val) <> 'array' or jsonb_array_length(p_val) = 0
       or exists (select 1 from jsonb_array_elements(p_val) e where jsonb_typeof(e) <> 'string' or btrim(e #>> '{}') = '' or length(e #>> '{}') > 80)
       or jsonb_array_length(p_val) > 40 then
      err := 'Must be a list of names, e.g. ["Hedge Funds","Private Equity"].'; return;
    end if;
    val := (select jsonb_agg(x order by o)::text from (select btrim(e #>> '{}') x, min(o) o from jsonb_array_elements(p_val) with ordinality u(e, o) group by 1) z);
  else
    typ := 'text';
    if jsonb_typeof(p_val) not in ('string', 'number') then err := 'Must be text.'; return; end if;
    s := btrim(p_val #>> '{}');
    if s = '' then err := 'Empty: nothing to save.'; return; end if;
    if k = 'country' then
      s := upper(s); if s = 'UK' then s := 'GB'; end if;
      if s !~ '^[A-Z]{2}$' then err := 'Two-letter country code, e.g. US, GB, CH.'; return; end if;
    elsif k = 'wi_id' then
      if s !~ '^-?\d+$' then err := 'With Intelligence ids are numbers.'; return; end if;
    elsif k = 'wi_url' then
      if s !~ '^https://platform\.withintelligence\.com/(explore/)?investors/-?\d+/?$' then
        err := 'Must be a With Intelligence profile link: https://platform.withintelligence.com/explore/investors/<id>.'; return;
      end if;
      s := 'https://platform.withintelligence.com/explore/investors/' || substring(s from 'investors/(-?\d+)');
    elsif k = 'summary' then
      s := left(btrim(regexp_replace(regexp_replace(s, '<[^>]+>', ' ', 'g'), '\s+', ' ', 'g')), 4000);
    elsif length(s) > 200 then err := 'Too long (200 characters at most).'; return;
    end if;
    val := s;
  end if;
end $$;

-- ---------------------------------------------------------------- save (owner postgres)
create or replace function grok_fn.save(p_scope text, p_items jsonb, p_dry_run boolean default true, p_by text default 'Grok') returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  tag text := 'grok-' || to_char(clock_timestamp(), 'YYYYMMDD-HH24MISS') || '-' || substr(md5(random()::text), 1, 4);
  it jsonb; out_items jsonb := '[]'; item_res jsonb; rows_res jsonb; row_res jsonb; saved jsonb; skipped jsonb; errs jsonb;
  f record; ck record; r record; rr record; fields jsonb; k text; v jsonb;
  item_wi text; item_url text; rec_wi text; nk text; sets text[]; logs jsonb; cur text; ev_set jsonb;
  before_v text; after_v text; src text; n_saved int := 0; n_items_ok int := 0; firm record; prof jsonb; existing jsonb;
  certain boolean; link_status text; ev_ok boolean; good jsonb;
begin
  if p_scope not in ('mandates', 'iconnections') then raise exception 'scope is mandates or iconnections.'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'Give items: a list.'; end if;
  if jsonb_array_length(p_items) > 20 then raise exception 'At most 20 items per call.'; end if;

  for it in select * from jsonb_array_elements(p_items) loop
    errs := '[]'; rows_res := '[]'; skipped := '[]'; good := '{}';
    begin
      if jsonb_typeof(it) <> 'object' or (it ->> 'id') is null then raise exception 'Each item needs an id.'; end if;
      fields := coalesce(it -> 'fields', '{}'::jsonb);
      if jsonb_typeof(fields) <> 'object' then raise exception 'fields must be an object.'; end if;
      -- wi_id / wi_url may be given on the item or in fields
      if it ? 'wi_id' and not fields ? 'wi_id' then fields := fields || jsonb_build_object('wi_id', it -> 'wi_id'); end if;
      if it ? 'wi_url' and not fields ? 'wi_url' then fields := fields || jsonb_build_object('wi_url', it -> 'wi_url'); end if;
      -- check every field first
      for k, v in select * from jsonb_each(fields) loop
        select * into ck from grok_fn.check_field(p_scope, k, v);
        if ck.err is not null then skipped := skipped || jsonb_build_object('field', k, 'reason', ck.err);
        else good := good || jsonb_build_object(ck.target, jsonb_build_object('typ', ck.typ, 'val', ck.val, 'from', k)); end if;
      end loop;
      item_wi := good #>> '{evidence.wi_investor_id,val}';
      item_url := good #>> '{view_investor_url,val}';
      if item_url is not null and item_wi is not null and item_url !~ ('/investors/' || item_wi || '$') then
        raise exception 'wi_id % and wi_url point to different profiles.', item_wi;
      end if;
      if item_url is not null and item_wi is null then
        item_wi := substring(item_url from 'investors/(-?\d+)$');
        good := good || jsonb_build_object('evidence.wi_investor_id', jsonb_build_object('typ', 'text', 'val', item_wi, 'from', 'wi_url'));
      end if;
      if item_wi is not null and item_url is null then
        item_url := 'https://platform.withintelligence.com/explore/investors/' || item_wi;
        good := good || jsonb_build_object('view_investor_url', jsonb_build_object('typ', 'text', 'val', item_url, 'from', 'wi_id'));
      end if;
      if (good ? 'ticket_min_usd') and (good ? 'ticket_max_usd')
         and (good #>> '{ticket_min_usd,val}')::numeric > (good #>> '{ticket_max_usd,val}')::numeric then
        raise exception 'ticket_min_usd is larger than ticket_max_usd.';
      end if;
      src := 'Grok · ' || tag || coalesce(' · ' || item_url, '') || case when p_by is distinct from 'Grok' then ' · ' || p_by else '' end;

      if p_scope = 'mandates' then
        if (it ->> 'id') !~ '^\d+$' then raise exception 'id must be the wi_mandates row id from todo.'; end if;
        select * into r from wi_mandates where id = (it ->> 'id')::bigint;
        if not found then raise exception 'No wi_mandates row %.', it ->> 'id'; end if;
        if coalesce(r.validation_status, '') in ('merged', 'not_an_allocator') then raise exception 'Row % is %: not filled.', r.id, r.validation_status; end if;
        if coalesce(nullif(r.new_qualification, ''), r.qualification) = 'rejected' then raise exception 'Row % is rejected: not filled.', r.id; end if;
        rec_wi := case when jsonb_typeof(r.evidence) = 'object' then nullif(r.evidence ->> 'wi_investor_id', '') end;
        if rec_wi is not null and item_wi is not null and rec_wi <> item_wi then
          raise exception 'This investor is already linked to With Intelligence profile % on record, not %. Nothing saved; check the match.', rec_wi, item_wi;
        end if;
        nk := wi_name_key(coalesce(nullif(btrim(r.investor_name), ''), r.organization_name));
        -- the investor's open rows: same With Intelligence id, or same name and no id
        for rr in
          select * from wi_mandates m
           where coalesce(m.validation_status, '') not in ('merged', 'not_an_allocator')
             and coalesce(nullif(m.new_qualification, ''), m.qualification) is distinct from 'rejected'
             and ((coalesce(rec_wi, item_wi) is not null and jsonb_typeof(m.evidence) = 'object' and m.evidence ->> 'wi_investor_id' = coalesce(rec_wi, item_wi))
                  or ((m.evidence is null or jsonb_typeof(m.evidence) <> 'object' or nullif(m.evidence ->> 'wi_investor_id', '') is null)
                      and wi_name_key(coalesce(nullif(btrim(m.investor_name), ''), m.organization_name)) = nk))
           order by m.id
        loop
          sets := '{}'; logs := '[]'; saved := '[]'; row_res := '[]'; ev_set := '{}'::jsonb;
          ev_ok := rr.evidence is null or jsonb_typeof(rr.evidence) = 'object';
          for f in select key as target, value as spec from jsonb_each(good) loop
            if f.target like 'evidence.%' then
              if not ev_ok then row_res := row_res || jsonb_build_object('field', f.spec ->> 'from', 'reason', 'The row''s evidence is not an object; not touched.'); continue; end if;
              cur := nullif(btrim(rr.evidence ->> substr(f.target, 10)), '');
            elsif f.target = 'name' then continue;
            else
              execute format('select %I::text from wi_mandates where id = $1', f.target) into cur using rr.id;
            end if;
            if cur is not null and btrim(cur) not in ('', '[]', '{}', 'null', '""') then
              row_res := row_res || jsonb_build_object('field', f.spec ->> 'from', 'reason', case when cur = f.spec ->> 'val' then 'same value already' else 'has a value already' end, 'current', left(cur, 200));
              continue;
            end if;
            if f.target like 'evidence.%' then
              ev_set := ev_set || jsonb_build_object(substr(f.target, 10), f.spec ->> 'val');
            else
              sets := sets || format('%I = %L::%s', f.target, f.spec ->> 'val', f.spec ->> 'typ');
            end if;
            logs := logs || jsonb_build_object('field', case when f.target like 'evidence.%' then f.target else f.target end, 'old', cur, 'new', f.spec ->> 'val');
            saved := saved || jsonb_build_object('field', f.spec ->> 'from', 'value', left(f.spec ->> 'val', 300));
          end loop;
          if ev_set <> '{}'::jsonb then sets := sets || format('evidence = coalesce(evidence, %L::jsonb) || %L::jsonb', '{}', ev_set::text); end if;
          if cardinality(sets) > 0 then
            select concat_ws('|', new_qualification, qualification, new_fit_score, approved_at) into before_v from wi_mandates where id = rr.id;
            execute format('update wi_mandates set %s where id = $1', array_to_string(sets, ', ')) using rr.id;
            select concat_ws('|', new_qualification, qualification, new_fit_score, approved_at) into after_v from wi_mandates where id = rr.id;
            if before_v is distinct from after_v then
              raise exception 'VERDICT_GUARD row %: saving these fields would change its verdict through the hedge fund rule (% -> %). Nothing saved for this investor; flagged for review.', rr.id, before_v, after_v;
            end if;
            insert into wi_fill_log (mandate_id, investor_name, field, old_value, new_value, source, wi_investor_id)
            select rr.id, coalesce(rr.investor_name, rr.organization_name), l ->> 'field', l ->> 'old', l ->> 'new', src, coalesce(rec_wi, item_wi)
              from jsonb_array_elements(logs) l;
            n_saved := n_saved + jsonb_array_length(logs);
          end if;
          rows_res := rows_res || jsonb_build_object('row_id', rr.id, 'saved', saved, 'skipped', row_res);
        end loop;
        if jsonb_array_length(rows_res) = 0 then raise exception 'No open rows found for this investor.'; end if;

      else  -- iconnections
        select * into firm from grok.iconn_firms where firm_key = it ->> 'id';
        if not found then raise exception 'No firm % in the active I-Connections import.', it ->> 'id'; end if;
        if firm.wi_rejection_status = 'hidden' then raise exception 'Firm % is hidden (rejected via With Intelligence).', firm.firm_name; end if;
        if item_wi is null then raise exception 'Give wi_id or wi_url: the With Intelligence profile this firm is.'; end if;
        if firm.wi_investor_id is not null and firm.wi_investor_id <> item_wi then
          raise exception 'Firm % is linked to With Intelligence profile % already, not %. Nothing saved; check which is right.', firm.firm_name, firm.wi_investor_id, item_wi;
        end if;
        certain := coalesce((it ->> 'certain')::boolean, false);
        saved := '[]';
        -- the profile, in the same {raw, norm} shape the other workflows store
        prof := jsonb_build_object(
          'wi_id', item_wi, 'name', good #>> '{name,val}', 'type', good #>> '{investor_type,val}',
          'city', good #>> '{investor_city,val}', 'country', good #>> '{investor_country,val}', 'country_name', null,
          'aum_usd', (good #>> '{aum_usd,val}')::numeric, 'aum_band', good #>> '{aum_band,val}',
          'asset_classes', coalesce((good #>> '{asset_classes,val}')::jsonb, '[]'::jsonb),
          'strategies', coalesce((good #>> '{strategies,val}')::jsonb, '[]'::jsonb),
          'ticket_min_usd', (good #>> '{ticket_min_usd,val}')::numeric, 'ticket_max_usd', (good #>> '{ticket_max_usd,val}')::numeric,
          'min_manager_aum_usd', (good #>> '{min_manager_aum_usd,val}')::numeric,
          'emerging', (good #>> '{open_to_emerging_managers,val}')::boolean, 'emerging_why', null, 'attributes', '[]'::jsonb,
          'link', item_url);
        select payload -> 'norm' into existing from iconn_wi_profiles where wi_id = item_wi and status = 'ok';
        if existing is null then
          insert into iconn_wi_profiles (wi_id, status, payload, read_at)
          values (item_wi, 'ok', jsonb_build_object('norm', jsonb_strip_nulls(prof), 'raw', jsonb_build_object('source', 'grok', 'run', tag,
                  'summary', good #>> '{evidence.wi_summary,val}', 'fields', fields)), now())
          on conflict (wi_id) do update set status = 'ok', payload = excluded.payload, read_at = now();
          saved := saved || jsonb_build_object('field', 'profile', 'value', 'stored for ' || item_wi);
          insert into wi_fill_log (mandate_id, investor_name, field, old_value, new_value, source, wi_investor_id)
          values (firm.matched_id, firm.firm_name, 'iconnections.profile', null, left(jsonb_strip_nulls(prof)::text, 2000), src, item_wi);
          n_saved := n_saved + 1;
        else
          -- a stored profile is never replaced: only its empty fields are added
          select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) into prof from jsonb_each(jsonb_strip_nulls(prof))
           where not (existing ? key) or existing -> key in ('null'::jsonb, '[]'::jsonb, '""'::jsonb);
          if prof <> '{}'::jsonb then
            update iconn_wi_profiles set payload = jsonb_set(payload, '{norm}', coalesce(payload -> 'norm', '{}'::jsonb) || prof) where wi_id = item_wi;
            saved := saved || jsonb_build_object('field', 'profile', 'value', 'added ' || (select string_agg(key, ', ') from jsonb_object_keys(prof) key));
            insert into wi_fill_log (mandate_id, investor_name, field, old_value, new_value, source, wi_investor_id)
            values (firm.matched_id, firm.firm_name, 'iconnections.profile (blanks)', null, left(prof::text, 2000), src, item_wi);
            n_saved := n_saved + 1;
          else
            skipped := skipped || jsonb_build_object('field', 'profile', 'reason', 'A full profile is stored already.');
          end if;
        end if;
        -- the link
        if firm.wi_investor_id = item_wi then
          link_status := 'already linked';
        else
          insert into iconn_wi_lookup (run_id, row_no, firm, confidence, candidates, tried)
          select fr.run_id, fr.row_no, firm.firm_name, case when certain then 'Exact' else 'Grok candidate' end,
                 jsonb_build_array(jsonb_build_object('id', item_wi, 'name', good #>> '{name,val}', 'type', good #>> '{investor_type,val}',
                                                      'country', good #>> '{investor_country,val}', 'link', item_url, 'source', 'grok', 'run', tag)),
                 array['grok']
            from (select r2.run_id, r2.row_no from iconnections_import_rows r2 join iconnections_import_runs u on u.id = r2.run_id and u.import_no = r2.import_no and u.hidden_at is null
                   where coalesce(nullif(r2.norm_name, ''), lower(r2.name)) = firm.firm_key order by u.last_matched_at desc nulls last, r2.row_no limit 1) fr;
          link_status := case when certain then 'linked' else 'stored as a candidate for review (not linked)' end;
          insert into wi_fill_log (mandate_id, investor_name, field, old_value, new_value, source, wi_investor_id)
          values (firm.matched_id, firm.firm_name, case when certain then 'iconnections.link' else 'iconnections.candidate' end, null, item_wi, src, item_wi);
          n_saved := n_saved + 1;
        end if;
        saved := saved || jsonb_build_object('field', 'link', 'value', link_status);
        rows_res := jsonb_build_array(jsonb_build_object('firm', firm.firm_name, 'saved', saved));
      end if;

      if p_dry_run then raise exception 'GROK_DRY_RUN'; end if;
      n_items_ok := n_items_ok + 1;
      item_res := jsonb_build_object('id', it -> 'id', 'status', 'saved', 'result', rows_res, 'skipped_fields', skipped, 'errors', errs);
    exception when others then
      if sqlerrm = 'GROK_DRY_RUN' then
        n_items_ok := n_items_ok + 1;
        item_res := jsonb_build_object('id', it -> 'id', 'status', 'would_save', 'result', rows_res, 'skipped_fields', skipped, 'errors', errs);
      else
        item_res := jsonb_build_object('id', it -> 'id', 'status', 'error', 'error', regexp_replace(sqlerrm, '^VERDICT_GUARD ', ''), 'skipped_fields', skipped);
      end if;
    end;
    out_items := out_items || item_res;
  end loop;
  if p_dry_run then n_saved := 0; end if;
  return jsonb_build_object('scope', p_scope, 'dry_run', p_dry_run, 'run', case when not p_dry_run and n_saved > 0 then tag end,
    'items_ok', n_items_ok, 'items_failed', jsonb_array_length(p_items) - n_items_ok, 'changes_written', n_saved,
    'items', out_items,
    'note', case when p_dry_run then 'Dry run: nothing was written. "would_save" is exactly what a real save would do (triggers included).'
                 else 'Every change is in wi_fill_log with source starting "Grok · ' || tag || '". Undo: save_undo with this run.' end);
end $$;

-- Undo one save run (allocator fields only; I-Connections profiles and links are marked undone).
create or replace function grok_fn.save_undo(p_run text, p_dry_run boolean default true) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare l record; cur text; typ text; res jsonb := '[]'; n int := 0;
begin
  if coalesce(p_run, '') !~ '^grok-\d{8}-\d{6}-[0-9a-f]{4}$' then raise exception 'Give run: the run tag save returned.'; end if;
  for l in select * from wi_fill_log where source like 'Grok · ' || p_run || '%' order by id desc loop
    if l.field like 'iconnections.%' then
      if not p_dry_run then
        if l.field in ('iconnections.link', 'iconnections.candidate') then
          update iconn_wi_lookup set confidence = 'Undone' where tried = array['grok'] and candidates -> 0 ->> 'run' = p_run;
        elsif l.field = 'iconnections.profile' then
          update iconn_wi_profiles set status = 'undone' where wi_id = l.wi_investor_id and payload #>> '{raw,run}' = p_run;
        end if;
        n := n + 1;
      end if;
      res := res || jsonb_build_object('firm', l.investor_name, 'field', l.field, 'status', case when p_dry_run then 'would_undo' else 'undone' end);
      continue;
    end if;
    if l.field like 'evidence.%' then
      select evidence ->> substr(l.field, 10) into cur from wi_mandates where id = l.mandate_id;
    else
      select format_type(a.atttypid, a.atttypmod) into typ from pg_attribute a where a.attrelid = 'public.wi_mandates'::regclass and a.attname = l.field;
      execute format('select %I::text from wi_mandates where id = $1', l.field) into cur using l.mandate_id;
    end if;
    if cur is distinct from l.new_value then
      res := res || jsonb_build_object('row_id', l.mandate_id, 'field', l.field, 'status', 'changed since; left alone', 'current', left(cur, 200));
      continue;
    end if;
    if not p_dry_run then
      if l.field like 'evidence.%' then
        update wi_mandates set evidence = case when l.old_value is null then evidence - substr(l.field, 10)
                                               else evidence || jsonb_build_object(substr(l.field, 10), l.old_value) end where id = l.mandate_id;
      else
        execute format('update wi_mandates set %I = %L::%s where id = $1', l.field, l.old_value, typ) using l.mandate_id;
      end if;
      insert into wi_fill_log (mandate_id, investor_name, field, old_value, new_value, source, wi_investor_id)
      values (l.mandate_id, l.investor_name, l.field, l.new_value, l.old_value, 'Grok undo · ' || p_run, l.wi_investor_id);
      n := n + 1;
    end if;
    res := res || jsonb_build_object('row_id', l.mandate_id, 'field', l.field, 'status', case when p_dry_run then 'would_restore' else 'restored' end, 'back_to', l.old_value);
  end loop;
  return jsonb_build_object('run', p_run, 'dry_run', p_dry_run, 'undone', n, 'changes', res);
end $$;

grant create on schema grok_fn to grok_reader;
alter function grok_fn.todo(text, integer, integer) owner to grok_reader;
revoke create on schema grok_fn from grok_reader;
revoke all on all functions in schema grok_fn from public;
grant execute on all functions in schema grok_fn to postgres;

commit;

-- UNDO: drop function grok_fn.todo(text, integer, integer), grok_fn.save(text, jsonb, boolean, text),
--       grok_fn.save_undo(text, boolean), grok_fn.check_field(text, text, jsonb); (views: re-run schema-21 versions)
