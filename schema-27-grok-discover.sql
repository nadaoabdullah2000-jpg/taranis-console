-- Schema 27 (11 Nov 2026): Grok discovers new investors from a filtered With Intelligence search.
--  * grok.wi_discovered: staging for raw finds, one row per With Intelligence investor (wi_id unique).
--    Nothing here reaches Opportunities: moving a find into wi_mandates is a separate, reviewed step.
--  * grok_fn.discover(items, dry_run, by): upsert by wi_id. A new wi_id is inserted; a wi_id seen
--    again is updated: a value sent replaces the stored one, a value left out (or null) keeps it;
--    intentions and contacts are added to (no duplicates); raw_json is merged; the filter preset is
--    added to seen_presets. Dry run (the default) shows exactly what would happen and writes nothing.
--    Separate from save, which stays blanks-only on existing rows.
--  * grok_fn.discover_status(limit, offset): how many are staged, and which are new vs already in the
--    tool (With Intelligence id first, then name): in Opportunities, only in Rejected, or new.
-- Gateway (n8n MO9CD19ZeKB3YGfQ, node Parse Request; copy in n8n/grok-gateway-parse-request.js): actions
-- discover (write connection) and discover_status (read-only connection). Published as version 973df23d.
-- Status: APPLIED 11 Nov 2026 (requested by research@taranis.net); the table starts empty.
-- Undo: drop function grok_fn.discover(jsonb, boolean, text); drop function grok_fn.discover_status(integer, integer);
-- the table can stay (rename it to keep its data); republish gateway version f3808fd3.

create table if not exists grok.wi_discovered (
  wi_id              text primary key check (wi_id ~ '^-?\d{1,12}$'),
  name               text not null,
  summary            text,
  investor_type      text,
  country            text,
  region             text,
  intentions         jsonb not null default '[]'::jsonb,   -- [{date, type, text}]
  strategy_focus     text,
  asset_classes      jsonb not null default '[]'::jsonb,   -- ["Hedge Funds", ...]
  strategies         jsonb not null default '[]'::jsonb,
  industries         jsonb not null default '[]'::jsonb,
  approach           text,
  ticket_min_usd     numeric check (ticket_min_usd is null or ticket_min_usd >= 0),
  ticket_max_usd     numeric check (ticket_max_usd is null or ticket_max_usd >= 0),
  aum_usd            numeric check (aum_usd is null or aum_usd >= 0),
  aum_band           text,
  emerging_managers  boolean,
  emerging_evidence  text,
  tech_focus         boolean,
  tech_evidence      text,
  contacts           jsonb not null default '[]'::jsonb,   -- [{name, title, email}]
  profile_url        text,
  filter_preset      text,                                  -- the preset of the latest find
  seen_presets       text[] not null default '{}',
  raw_json           jsonb not null default '{}'::jsonb,
  times_seen         integer not null default 1,
  first_seen_at      timestamptz not null default now(),
  last_seen_at       timestamptz not null default now(),
  found_by           text,
  review_status      text not null default 'staged' check (review_status in ('staged', 'imported', 'skipped')),
  reviewed_at        timestamptz,
  reviewed_by        text
);
grant select on grok.wi_discovered to grok_reader;

create or replace function grok_fn.discover(p_items jsonb, p_dry_run boolean default true, p_by text default 'Grok')
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$
declare it jsonb; out_items jsonb := '[]'; errs text[]; w text; nm text; url text; existed boolean; n_new int := 0; n_upd int := 0; n_err int := 0;
  arrs text[] := array['asset_classes', 'strategies', 'industries']; a text; nums text[] := array['ticket_min_usd', 'ticket_max_usd', 'aum_usd']; k text;
  ints jsonb; cons jsonb; c jsonb; i jsonb; changed text[];
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'Give items: a list of investor records.'; end if;
  if jsonb_array_length(p_items) > 50 then raise exception 'At most 50 items per call.'; end if;
  for it in select * from jsonb_array_elements(p_items) loop
    errs := '{}';
    begin
      if jsonb_typeof(it) <> 'object' then raise exception 'Each item must be an object.'; end if;
      w := btrim(coalesce(it ->> 'wi_id', substring(it ->> 'profile_url' from 'investors/(-?\d+)')));
      nm := nullif(btrim(it ->> 'name'), '');
      if w is null or w !~ '^-?\d{1,12}$' then errs := array_append(errs, 'wi_id: the With Intelligence investor id (digits), or a profile_url ending in /investors/<id>.'); end if;
      if nm is null then errs := array_append(errs, 'name is required.'); end if;
      url := nullif(btrim(it ->> 'profile_url'), '');
      if url is not null and w is not null and url !~ ('^https://platform\.withintelligence\.com/(explore/)?investors/' || w || '/?$') then
        errs := array_append(errs, ('profile_url must be the investor page of wi_id ' || w || ' (https://platform.withintelligence.com/explore/investors/' || w || ').')); end if;
      if url is not null and url ~ '/(managers|funds)/' then errs := array_append(errs, 'profile_url is a manager or fund page: only investor profiles are staged.'); end if;
      foreach a in array arrs loop
        if it ? a and jsonb_typeof(it -> a) not in ('array', 'null') then errs := array_append(errs, (a || ' must be a list of strings.')); end if;
      end loop;
      foreach k in array nums loop
        if it ? k and jsonb_typeof(it -> k) not in ('number', 'null') then errs := array_append(errs, (k || ' must be a number in US dollars (e.g. 25000000), not text.')); end if;
        if jsonb_typeof(it -> k) = 'number' and (it ->> k)::numeric < 0 then errs := array_append(errs, (k || ' cannot be negative.')); end if;
      end loop;
      if jsonb_typeof(it -> 'ticket_min_usd') = 'number' and jsonb_typeof(it -> 'ticket_max_usd') = 'number'
         and (it ->> 'ticket_min_usd')::numeric > (it ->> 'ticket_max_usd')::numeric then errs := array_append(errs, 'ticket_min_usd is larger than ticket_max_usd.'); end if;
      foreach k in array array['emerging_managers', 'tech_focus'] loop
        if it ? k and jsonb_typeof(it -> k) not in ('boolean', 'null') then errs := array_append(errs, (k || ' must be true, false or null (not stated).')); end if;
      end loop;
      if jsonb_typeof(it -> 'tech_focus') = 'boolean' and length(btrim(coalesce(it ->> 'tech_evidence', ''))) < 10 then errs := array_append(errs, 'tech_focus needs tech_evidence: the sentence from the profile.'); end if;
      if jsonb_typeof(it -> 'emerging_managers') = 'boolean' and length(btrim(coalesce(it ->> 'emerging_evidence', ''))) < 10 then errs := array_append(errs, 'emerging_managers needs emerging_evidence: the sentence from the profile.'); end if;
      if it ? 'intentions' and jsonb_typeof(it -> 'intentions') not in ('array', 'null') then errs := array_append(errs, 'intentions must be a list of {date, type, text}.'); end if;
      if it ? 'contacts' and jsonb_typeof(it -> 'contacts') not in ('array', 'null') then errs := array_append(errs, 'contacts must be a list of {name, title, email}.'); end if;
      if jsonb_typeof(it -> 'contacts') = 'array' then
        for c in select * from jsonb_array_elements(it -> 'contacts') loop
          if jsonb_typeof(c) <> 'object' or nullif(btrim(c ->> 'name'), '') is null then errs := array_append(errs, 'each contact needs a name.'); exit; end if;
          if nullif(btrim(c ->> 'email'), '') is not null and (c ->> 'email') !~* '^[^@\s]+@[^@\s]+\.[a-z]{2,}$' then errs := array_append(errs, ('contact email not valid: ' || (c ->> 'email'))); end if;
        end loop;
      end if;
      if jsonb_typeof(it -> 'intentions') = 'array' then
        for i in select * from jsonb_array_elements(it -> 'intentions') loop
          if jsonb_typeof(i) <> 'object' or nullif(btrim(i ->> 'text'), '') is null then errs := array_append(errs, 'each intention needs text.'); exit; end if;
          if nullif(btrim(i ->> 'date'), '') is not null and (i ->> 'date') !~ '^\d{4}-\d{2}-\d{2}$' then errs := array_append(errs, ('intention date must be YYYY-MM-DD: ' || (i ->> 'date'))); end if;
        end loop;
      end if;
      if it ? 'raw_json' and jsonb_typeof(it -> 'raw_json') not in ('object', 'null') then errs := array_append(errs, 'raw_json must be an object.'); end if;
      if cardinality(errs) > 0 then raise exception 'ITEM_ERRORS'; end if;

      -- clean lists: intentions {date, type, text}, contacts {name, title, email}
      select coalesce(jsonb_agg(distinct jsonb_strip_nulls(jsonb_build_object('date', nullif(btrim(x ->> 'date'), ''), 'type', nullif(btrim(x ->> 'type'), ''),
               'text', left(btrim(x ->> 'text'), 2000)))), '[]') into ints
        from jsonb_array_elements(case when jsonb_typeof(it -> 'intentions') = 'array' then it -> 'intentions' else '[]' end) x;
      select coalesce(jsonb_agg(distinct jsonb_strip_nulls(jsonb_build_object('name', btrim(x ->> 'name'), 'title', nullif(btrim(x ->> 'title'), ''),
               'email', nullif(lower(btrim(x ->> 'email')), '')))), '[]') into cons
        from jsonb_array_elements(case when jsonb_typeof(it -> 'contacts') = 'array' then it -> 'contacts' else '[]' end) x;
      url := coalesce(url, 'https://platform.withintelligence.com/explore/investors/' || w);

      select true into existed from grok.wi_discovered where wi_id = w;
      existed := coalesce(existed, false);
      if existed then
        select array_agg(k2) into changed from (
          select k2 from unnest(array['name','summary','investor_type','country','region','strategy_focus','approach','aum_band','emerging_evidence','tech_evidence',
                                      'asset_classes','strategies','industries','ticket_min_usd','ticket_max_usd','aum_usd','emerging_managers','tech_focus']) k2
           where it ? k2 and jsonb_typeof(it -> k2) <> 'null'
             and (it -> k2) is distinct from (select to_jsonb(d) -> k2 from grok.wi_discovered d where d.wi_id = w)) z;
      end if;

      insert into grok.wi_discovered as d (wi_id, name, summary, investor_type, country, region, intentions, strategy_focus, asset_classes, strategies,
             industries, approach, ticket_min_usd, ticket_max_usd, aum_usd, aum_band, emerging_managers, emerging_evidence, tech_focus, tech_evidence,
             contacts, profile_url, filter_preset, seen_presets, raw_json, found_by)
      values (w, nm, nullif(btrim(it ->> 'summary'), ''), nullif(btrim(it ->> 'investor_type'), ''), nullif(btrim(it ->> 'country'), ''),
             nullif(btrim(it ->> 'region'), ''), ints, nullif(btrim(it ->> 'strategy_focus'), ''),
             coalesce(case when jsonb_typeof(it -> 'asset_classes') = 'array' then it -> 'asset_classes' end, '[]'),
             coalesce(case when jsonb_typeof(it -> 'strategies') = 'array' then it -> 'strategies' end, '[]'),
             coalesce(case when jsonb_typeof(it -> 'industries') = 'array' then it -> 'industries' end, '[]'),
             nullif(btrim(it ->> 'approach'), ''), (it ->> 'ticket_min_usd')::numeric, (it ->> 'ticket_max_usd')::numeric, (it ->> 'aum_usd')::numeric,
             nullif(btrim(it ->> 'aum_band'), ''), (it ->> 'emerging_managers')::boolean, nullif(btrim(it ->> 'emerging_evidence'), ''),
             (it ->> 'tech_focus')::boolean, nullif(btrim(it ->> 'tech_evidence'), ''), cons, url, nullif(btrim(it ->> 'filter_preset'), ''),
             case when nullif(btrim(it ->> 'filter_preset'), '') is null then '{}'::text[] else array[btrim(it ->> 'filter_preset')] end,
             coalesce(case when jsonb_typeof(it -> 'raw_json') = 'object' then it -> 'raw_json' end, '{}'), p_by)
      on conflict (wi_id) do update set
        name = excluded.name,
        summary = coalesce(excluded.summary, d.summary), investor_type = coalesce(excluded.investor_type, d.investor_type),
        country = coalesce(excluded.country, d.country), region = coalesce(excluded.region, d.region),
        intentions = (select coalesce(jsonb_agg(distinct x), '[]') from jsonb_array_elements(d.intentions || excluded.intentions) x),
        strategy_focus = coalesce(excluded.strategy_focus, d.strategy_focus),
        asset_classes = case when jsonb_array_length(excluded.asset_classes) > 0 then excluded.asset_classes else d.asset_classes end,
        strategies = case when jsonb_array_length(excluded.strategies) > 0 then excluded.strategies else d.strategies end,
        industries = case when jsonb_array_length(excluded.industries) > 0 then excluded.industries else d.industries end,
        approach = coalesce(excluded.approach, d.approach),
        ticket_min_usd = coalesce(excluded.ticket_min_usd, d.ticket_min_usd), ticket_max_usd = coalesce(excluded.ticket_max_usd, d.ticket_max_usd),
        aum_usd = coalesce(excluded.aum_usd, d.aum_usd), aum_band = coalesce(excluded.aum_band, d.aum_band),
        emerging_managers = coalesce(excluded.emerging_managers, d.emerging_managers), emerging_evidence = coalesce(excluded.emerging_evidence, d.emerging_evidence),
        tech_focus = coalesce(excluded.tech_focus, d.tech_focus), tech_evidence = coalesce(excluded.tech_evidence, d.tech_evidence),
        contacts = (select coalesce(jsonb_agg(distinct x), '[]') from jsonb_array_elements(d.contacts || excluded.contacts) x),
        profile_url = excluded.profile_url,
        filter_preset = coalesce(excluded.filter_preset, d.filter_preset),
        seen_presets = (select array(select distinct unnest(d.seen_presets || excluded.seen_presets) order by 1)),
        raw_json = d.raw_json || excluded.raw_json,
        times_seen = d.times_seen + 1, last_seen_at = now(), found_by = excluded.found_by;

      if p_dry_run then raise exception 'DISCOVER_DRY_RUN'; end if;
      if existed then n_upd := n_upd + 1; else n_new := n_new + 1; end if;
      out_items := out_items || jsonb_build_object('wi_id', w, 'name', nm, 'status', case when existed then 'updated' else 'new' end,
                                                   'changed', to_jsonb(coalesce(changed, '{}'::text[])));
    exception when others then
      if sqlerrm = 'DISCOVER_DRY_RUN' then
        if existed then n_upd := n_upd + 1; else n_new := n_new + 1; end if;
        out_items := out_items || jsonb_build_object('wi_id', w, 'name', nm, 'status', case when existed then 'would_update' else 'would_add' end,
                                                     'changed', to_jsonb(coalesce(changed, '{}'::text[])));
      else
        n_err := n_err + 1;
        out_items := out_items || jsonb_build_object('wi_id', w, 'name', nm, 'status', 'error',
                       'errors', to_jsonb(case when sqlerrm = 'ITEM_ERRORS' then errs else array[sqlerrm] end));
      end if;
    end;
    existed := null; changed := null;
  end loop;
  return jsonb_build_object('dry_run', p_dry_run, 'new', n_new, 'updated', n_upd, 'errors', n_err, 'items', out_items,
    'note', case when p_dry_run then 'Dry run: nothing was written. Send the same call with dry_run false to stage these.'
                 else 'Staged in grok.wi_discovered. Nothing was added to Opportunities.' end);
end $function$;
revoke all on function grok_fn.discover(jsonb, boolean, text) from public;

-- discover_status: read-only, owned by grok_reader like todo
grant create on schema grok_fn to grok_reader;
set role grok_reader;
create or replace function grok_fn.discover_status(p_limit integer default 50, p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path to 'grok', 'public', 'pg_temp' as $function$
declare lim integer := greatest(1, least(coalesce(p_limit, 50), 200)); off integer := greatest(0, coalesce(p_offset, 0)); res jsonb;
begin
  with known as (
    select wi_investor_id, public.wi_name_key(coalesce(nullif(btrim(investor_name), ''), organization_name)) nk,
           verdict is distinct from 'rejected' and coalesce(validation_status, '') <> 'not_an_allocator' as is_open
      from wi_mandates
  ), d as (
    select x.*,
      case when exists (select 1 from known k where k.wi_investor_id = x.wi_id and k.is_open) then 'in_opportunities'
           when exists (select 1 from known k where k.wi_investor_id = x.wi_id) then 'in_rejected'
           when exists (select 1 from known k where k.wi_investor_id is null and k.nk = public.wi_name_key(x.name) and k.is_open) then 'in_opportunities_by_name'
           when exists (select 1 from known k where k.wi_investor_id is null and k.nk = public.wi_name_key(x.name)) then 'in_rejected_by_name'
           else 'new' end as match
      from wi_discovered x
  )
  select jsonb_build_object(
    'totals', (select jsonb_build_object('staged', count(*),
                 'new', count(*) filter (where match = 'new'),
                 'in_opportunities', count(*) filter (where match in ('in_opportunities', 'in_opportunities_by_name')),
                 'in_opportunities_by_name_only', count(*) filter (where match = 'in_opportunities_by_name'),
                 'only_in_rejected', count(*) filter (where match in ('in_rejected', 'in_rejected_by_name')),
                 'awaiting_review', count(*) filter (where review_status = 'staged'),
                 'seen_more_than_once', count(*) filter (where times_seen > 1)) from d),
    'by_preset', (select coalesce(jsonb_object_agg(p, n), '{}') from (select coalesce(filter_preset, '(none)') p, count(*) n from d group by 1) z),
    'offset', off, 'limit', lim,
    'new_items', coalesce((select jsonb_agg(jsonb_build_object('wi_id', wi_id, 'name', name, 'type', investor_type, 'country', country,
                     'preset', filter_preset, 'last_seen', last_seen_at::date) order by last_seen_at desc, name)
                   from (select * from d where match = 'new' order by last_seen_at desc, name limit lim offset off) z), '[]'))
  into res;
  return res;
end $function$;
reset role;
revoke create on schema grok_fn from grok_reader;
