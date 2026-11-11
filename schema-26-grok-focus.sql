-- Schema 26 (11 Nov 2026): a focused pass on two fields, Technology focus and Emerging managers.
--  * wi_mandates.focus_checks (jsonb): {"tech": {result, note, at, by}, "emerging": {...}} when Grok
--    looked and With Intelligence does not state the field (result not_stated), or states emerging
--    managers for private markets only (result private_markets_only). The app shows "Not stated
--    (checked)". I-Connections profiles keep the same under payload.norm.focus_checks.
--  * grok_fn.record_focus(scope, id, fields, by), called by checked: records it, only while the field
--    is still blank, for every row of the investor; logged in wi_fill_log (field focus.tech / focus.emerging).
--  * checked: items may carry fields: [{field: tech_focus | open_to_emerging_managers, result, note}].
--  * save: open_to_emerging_managers needs emerging_evidence (a quote); a quote about private equity or
--    private debt only is refused (left blank, to be recorded as private_markets_only). Fill blanks only,
--    never a person's decision, as before.
--  * todo('focus'): every investor (mandates) and every I-Connections firm not in the list (certain link,
--    stored profile) where either field is blank and not yet checked for this pass; the 30-day skip
--    does not apply. Items: kind, id, investor_name, wi_id, wi_url, missing.
-- Status: APPLIED 11 Nov 2026 with the approval of research@taranis.net; gateway todo accepts "focus" (n8n version f3808fd3; undo: republish a6fbe075). Dry run 11 Nov 2026 (inside a rolled-back transaction): 318 items on the focus
-- list (296 investors, 22 I-Connections firms); tech_focus missing 303, open_to_emerging_managers
-- missing 188, both 173; 19 without a With Intelligence link. Tested in the same way: checked records
-- not_stated / private_markets_only and refuses other fields; save refuses an emerging-managers value
-- without a quote or with a private-equity-only quote, and saves one whose quote names hedge funds.
-- Needs with it: the Grok gateway (n8n MO9CD19ZeKB3YGfQ, node Parse Request) accepting todo scope
-- "focus" (one line; save and checked stay mandates / iconnections).
-- Backup: the three functions as they were, in public.grok_fn_backup_20261111 (name, owner, definition).
-- UNDO (one block; the column and the views can stay, the app only reads them):
--   begin;
--   do $u$ declare r record; begin
--     for r in select * from public.grok_fn_backup_20261111 loop
--       if r.owner = 'grok_reader' then execute 'grant create on schema grok_fn to grok_reader'; execute 'set role grok_reader'; end if;
--       execute r.def;
--       if r.owner = 'grok_reader' then execute 'reset role'; execute 'revoke create on schema grok_fn from grok_reader'; end if;
--     end loop; end $u$;
--   drop function if exists grok_fn.record_focus(text, text, jsonb, text);
--   commit;
--   (Recorded checks stay in wi_mandates.focus_checks / iconn_wi_profiles; each one is in wi_fill_log,
--   field focus.tech / focus.emerging / iconnections.focus.*.)

create table if not exists public.grok_fn_backup_20261111 as
  select p.proname::text as name, pg_get_userbyid(p.proowner)::text as owner, pg_get_functiondef(p.oid) as def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'grok_fn' and p.proname in ('checked', 'save', 'todo');

alter table public.wi_mandates add column if not exists focus_checks jsonb;

-- grok.wi_mandates: the same columns, plus focus_checks at the end
create or replace view grok.wi_mandates as
 SELECT id, investor_name, organization_name, investor_type, investor_country, investor_city, aum_usd, aum_band,
    ticket_min_usd, ticket_max_usd, min_manager_aum_usd, asset_classes, strategies, open_to_emerging_managers,
    NULLIF((evidence ->> 'wi_investor_id'::text), ''::text) AS wi_investor_id, view_investor_url, linkedin_url,
    COALESCE(NULLIF(new_qualification, ''::text), qualification) AS verdict, new_fit_score AS fit_score,
    validation_status, hf_evidence, alert_date, "left"(intention_summary, 400) AS intention_summary,
    wi_enriched_at, created_at, updated_at,
    COALESCE(((jsonb_typeof(evidence) = 'object'::text) AND (NULLIF(btrim((evidence ->> 'wi_summary'::text)), ''::text) IS NOT NULL)), false) AS has_wi_summary,
    is_tech_investor, (NULLIF(btrim(tech_signal), ''::text) IS NOT NULL) AS tech_signal_set,
    is_space, (NULLIF(btrim(space_signal), ''::text) IS NOT NULL) AS space_signal_set,
    focus_checks
   FROM wi_mandates
  WHERE (COALESCE(validation_status, ''::text) <> 'merged'::text);

create or replace view grok.iconn_focus as
  select wi_id, payload #> '{norm,tech_focus}' as tech_focus, payload #> '{norm,emerging}' as emerging,
         payload #> '{norm,focus_checks}' as focus_checks
    from public.iconn_wi_profiles where status = 'ok';
grant select on grok.iconn_focus, grok.wi_mandates to grok_reader;

create or replace function grok_fn.record_focus(p_scope text, p_ref text, p_fields jsonb, p_by text)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$
declare f jsonb; fld text; res text; note text; out jsonb := '[]'; r record; rec_wi text; nk text; n int; wi text; obj jsonb;
begin
  if p_fields is null or jsonb_typeof(p_fields) <> 'array' then return '[]'::jsonb; end if;
  for f in select * from jsonb_array_elements(p_fields) loop
    fld := lower(btrim(coalesce(f ->> 'field', '')));
    fld := case fld when 'tech_focus' then 'tech' when 'technology' then 'tech' when 'is_tech_investor' then 'tech'
                    when 'open_to_emerging_managers' then 'emerging' when 'emerging_managers' then 'emerging' else fld end;
    res := lower(btrim(coalesce(f ->> 'result', '')));
    note := left(nullif(btrim(f ->> 'note'), ''), 300);
    if fld not in ('tech', 'emerging') then
      out := out || jsonb_build_object('field', f ->> 'field', 'status', 'error', 'error', 'field is tech_focus or open_to_emerging_managers.'); continue;
    end if;
    if res not in ('not_stated', 'private_markets_only') or (res = 'private_markets_only' and fld <> 'emerging') then
      out := out || jsonb_build_object('field', f ->> 'field', 'status', 'error',
                                       'error', 'result is not_stated (or private_markets_only, for open_to_emerging_managers only).'); continue;
    end if;
    if note is null or length(note) < 5 then
      out := out || jsonb_build_object('field', f ->> 'field', 'status', 'error',
                                       'error', 'note: say where you looked (e.g. "profile summary, investment preferences, mandates").'); continue;
    end if;
    obj := jsonb_build_object(fld, jsonb_build_object('result', res, 'note', note, 'at', now(), 'by', p_by));
    if p_scope = 'mandates' then
      select * into r from wi_mandates where id = p_ref::bigint;
      if not found then out := out || jsonb_build_object('field', f ->> 'field', 'status', 'error', 'error', 'No row ' || p_ref); continue; end if;
      rec_wi := case when jsonb_typeof(r.evidence) = 'object' then nullif(r.evidence ->> 'wi_investor_id', '') end;
      nk := wi_name_key(coalesce(nullif(btrim(r.investor_name), ''), r.organization_name));
      with u as (
        update wi_mandates m set focus_checks = coalesce(m.focus_checks, '{}'::jsonb) || obj
         where coalesce(m.validation_status, '') <> 'merged'
           and (m.id = r.id
                or (rec_wi is not null and jsonb_typeof(m.evidence) = 'object' and m.evidence ->> 'wi_investor_id' = rec_wi)
                or ((m.evidence is null or jsonb_typeof(m.evidence) <> 'object' or nullif(m.evidence ->> 'wi_investor_id', '') is null)
                    and wi_name_key(coalesce(nullif(btrim(m.investor_name), ''), m.organization_name)) = nk))
           and case fld when 'tech' then m.is_tech_investor is null and nullif(btrim(m.tech_signal), '') is null
                        else m.open_to_emerging_managers is null end
        returning m.id, coalesce(m.investor_name, m.organization_name) nm
      ), l as (
        insert into wi_fill_log (mandate_id, investor_name, field, old_value, new_value, source, wi_investor_id)
        select u.id, u.nm, 'focus.' || fld, null, res || ': ' || note, 'Grok focus check · ' || coalesce(p_by, 'Grok'), rec_wi from u
        returning 1
      ) select count(*) into n from l;
      out := out || jsonb_build_object('field', f ->> 'field', 'status', 'recorded', 'result', res, 'rows', n);
    else
      select wi_investor_id into wi from grok.iconn_firms where firm_key = p_ref and link_certain;
      if wi is null then
        out := out || jsonb_build_object('field', f ->> 'field', 'status', 'error', 'error', 'The firm has no certain With Intelligence link.'); continue;
      end if;
      update iconn_wi_profiles
         set payload = jsonb_set(payload, '{norm,focus_checks}', coalesce(payload #> '{norm,focus_checks}', '{}'::jsonb) || obj, true)
       where wi_id = wi and status = 'ok'
         and case fld when 'tech' then jsonb_typeof(payload #> '{norm,tech_focus}') is distinct from 'boolean'
                      else jsonb_typeof(payload #> '{norm,emerging}') is distinct from 'boolean' end;
      get diagnostics n = row_count;
      if n > 0 then
        insert into wi_fill_log (mandate_id, investor_name, field, old_value, new_value, source, wi_investor_id)
        select null, p_ref, 'iconnections.focus.' || fld, null, res || ': ' || note, 'Grok focus check · ' || coalesce(p_by, 'Grok'), wi;
      end if;
      out := out || jsonb_build_object('field', f ->> 'field', 'status', case when n > 0 then 'recorded' else 'not recorded: the profile has a value already' end, 'result', res);
    end if;
  end loop;
  return out;
end $function$;
revoke all on function grok_fn.record_focus(text, text, jsonb, text) from public;

-- checked: per-field results
do $do$
declare d text; n text;
begin
  d := pg_get_functiondef('grok_fn.checked(text,jsonb,text)'::regprocedure);
  n := replace(d, 'out_items jsonb := ''[]''; firm record;', 'out_items jsonb := ''[]''; firm record; fx jsonb;');
  n := replace(n, $s$        out_items := out_items || jsonb_build_object('id', it -> 'id', 'status', 'checked', 'result', res, 'rows', n);$s$,
                  $s$        fx := grok_fn.record_focus('mandates', it ->> 'id', it -> 'fields', p_by);
        out_items := out_items || jsonb_build_object('id', it -> 'id', 'status', 'checked', 'result', res, 'rows', n, 'fields', fx);$s$);
  n := replace(n, $s$        out_items := out_items || jsonb_build_object('id', it -> 'id', 'status', 'checked', 'result', res);$s$,
                  $s$        fx := grok_fn.record_focus('iconnections', it ->> 'id', it -> 'fields', p_by);
        out_items := out_items || jsonb_build_object('id', it -> 'id', 'status', 'checked', 'result', res, 'fields', fx);$s$);
  if (length(n) - length(d)) < 190 then raise exception 'checked text not as expected'; end if;
  execute n;
end $do$;

-- save: emerging managers needs a quote that applies to hedge funds or public markets
do $do$
declare d text; n text;
begin
  d := pg_get_functiondef('grok_fn.save(text,jsonb,boolean,text)'::regprocedure);
  n := replace(d, $s$      for k, v in select * from jsonb_each(fields) loop$s$,
$s$      -- Emerging managers (11 Nov 2026): true or false only with a quote from the profile that applies to
      -- hedge funds or public markets; private equity or private debt only is not saved.
      if fields ? 'open_to_emerging_managers' or fields ? 'emerging' then
        v := fields -> 'emerging_evidence';
        if v is null or jsonb_typeof(v) <> 'string' or length(btrim(v #>> '{}')) < 10 then
          skipped := skipped || jsonb_build_object('field', 'open_to_emerging_managers', 'reason',
                     'Needs emerging_evidence: a short quote from the With Intelligence profile (10 to 300 characters) that applies to hedge funds or public markets.');
          fields := fields - 'open_to_emerging_managers' - 'emerging';
        elsif (v #>> '{}') ~* '(private equity|private debt|private credit|buyout|venture|real estate|infrastructure|direct lending)'
              and regexp_replace(v #>> '{}', 'private (equity|debt|credit)|real estate (equity|debt)', '', 'gi')
                  !~* '(hedge|public|listed|liquid|absolute return|long.?short|equit|fixed income|credit|multi.?strateg|all asset classes|across asset classes)' then
          skipped := skipped || jsonb_build_object('field', 'open_to_emerging_managers', 'reason',
                     'The quote is about private markets only: left blank. Send checked with fields [{field: "open_to_emerging_managers", result: "private_markets_only", note}].');
          fields := fields - 'open_to_emerging_managers' - 'emerging';
        else
          good := good || jsonb_build_object('evidence.emerging_evidence', jsonb_build_object('typ', 'text', 'val', left(btrim(v #>> '{}'), 300), 'from', 'emerging_evidence'));
        end if;
        fields := fields - 'emerging_evidence';
      elsif fields ? 'emerging_evidence' then
        skipped := skipped || jsonb_build_object('field', 'emerging_evidence', 'reason', 'Evidence sent without open_to_emerging_managers.');
        fields := fields - 'emerging_evidence';
      end if;
      for k, v in select * from jsonb_each(fields) loop$s$);
  n := replace(n, $s$            if f.target = 'name' then continue; end if;$s$,
                  $s$            if f.target = 'name' then continue; end if;
            if f.target = 'evidence.emerging_evidence' and rr.open_to_emerging_managers is not null then continue; end if;$s$);
  n := replace(n, $s$'emerging_why', null,$s$, $s$'emerging_why', good #>> '{evidence.emerging_evidence,val}',$s$);
  if (length(n) - length(d)) < 1500 then raise exception 'save text not as expected'; end if;
  execute n;
end $do$;

-- todo('focus')
grant create on schema grok_fn to grok_reader;
set role grok_reader;
do $do$
declare d text; n text;
begin
  d := pg_get_functiondef('grok_fn.todo(text,integer,integer)'::regprocedure);
  if position('''focus''' in d) > 0 then return; end if;
  n := replace(d, $s$  raise exception 'scope is mandates or iconnections.';$s$,
$s$  if p_scope = 'focus' then
    with o as (
      select m.*, public.wi_name_key(coalesce(nullif(btrim(m.investor_name), ''), m.organization_name)) as nk
        from wi_mandates m
       where m.verdict is distinct from 'rejected' and coalesce(m.validation_status, '') <> 'not_an_allocator'
    ), nw as (
      select nk, case when count(distinct wi_investor_id) = 1 then max(wi_investor_id) end as wi from o group by nk
    ), g0 as (
      select o.*, coalesce(o.wi_investor_id, nw.wi, 'name:' || o.nk) as gk from o join nw using (nk)
    ), g as (
      select gk, max(id) as id, array_agg(id order by id desc) as row_ids,
             (array_agg(coalesce(nullif(btrim(investor_name), ''), organization_name) order by id desc))[1] as investor_name,
             (array_remove(array_agg(wi_investor_id order by id desc), null))[1] as wi_id,
             (array_remove(array_agg(case when view_investor_url ~ '^https://platform\.withintelligence\.com/(explore/)?investors/-?\d+$' then view_investor_url end order by id desc), null))[1] as wi_url,
             bool_and(is_tech_investor is null and not tech_signal_set and not coalesce(focus_checks ? 'tech', false)) as m_tech,
             bool_and(open_to_emerging_managers is null and not coalesce(focus_checks ? 'emerging', false)) as m_em
        from g0 group by gk
    ), mi as (
      select 'mandates'::text as kind, id::text as item_id, investor_name, wi_id,
             coalesce(wi_url, case when wi_id is not null then 'https://platform.withintelligence.com/explore/investors/' || wi_id end) as wi_url,
             array_remove(array[case when m_tech then 'tech_focus' end, case when m_em then 'open_to_emerging_managers' end], null) as missing
        from g where m_tech or m_em
    ), fi as (
      select 'iconnections'::text, f.firm_key, f.firm_name, f.wi_investor_id,
             'https://platform.withintelligence.com/explore/investors/' || f.wi_investor_id,
             array_remove(array[
               case when jsonb_typeof(p.tech_focus) is distinct from 'boolean' and not coalesce(p.focus_checks ? 'tech', false) then 'tech_focus' end,
               case when jsonb_typeof(p.emerging) is distinct from 'boolean' and not coalesce(p.focus_checks ? 'emerging', false) then 'open_to_emerging_managers' end], null)
        from iconn_firms f join iconn_focus p on p.wi_id = f.wi_investor_id
       where f.link_certain and coalesce(f.wi_rejection_status, '') <> 'hidden'
         and not (f.bucket = 'matched' and f.matched_id is not null)
         and not exists (select 1 from wi_mandates m2 where m2.wi_investor_id = f.wi_investor_id)
    ), allx as (select * from (select * from mi union all select * from fi) u where cardinality(u.missing) > 0)
    select jsonb_build_object(
      'scope', 'focus',
      'totals', (select jsonb_build_object('left_to_check', count(*),
                   'mandates', count(*) filter (where kind = 'mandates'), 'iconnections', count(*) filter (where kind = 'iconnections'),
                   'missing_tech_focus', count(*) filter (where 'tech_focus' = any (missing)),
                   'missing_open_to_emerging_managers', count(*) filter (where 'open_to_emerging_managers' = any (missing)),
                   'without_wi_link', count(*) filter (where wi_id is null)) from allx),
      'offset', off, 'limit', lim,
      'items', coalesce((select jsonb_agg(jsonb_build_object('kind', kind, 'id', item_id, 'investor_name', investor_name,
                           'wi_id', wi_id, 'wi_url', wi_url, 'missing', missing) order by kind desc, investor_name, item_id)
                         from (select * from allx order by kind desc, investor_name, item_id limit lim offset off) z), '[]'::jsonb),
      'next', 'For each item: save (scope = kind) what the profile states, with a quote; for a field the profile does not state, send checked (scope = kind, result done) with fields [{field, result: not_stated or private_markets_only, note: where you looked}]. Items drop out once both fields are filled or checked. Always ask todo focus with offset 0.')
    into res;
    return res;
  end if;
  raise exception 'scope is mandates, iconnections or focus.';$s$);
  if n = d then raise exception 'todo definition not as expected'; end if;
  execute n;
end $do$;
reset role;
revoke create on schema grok_fn from grok_reader;
