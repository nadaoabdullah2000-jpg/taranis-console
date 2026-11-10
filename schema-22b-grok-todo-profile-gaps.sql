-- Schema 22b (10 Nov 2026): grok_fn.todo('iconnections') also lists firms whose stored With
-- Intelligence profile lacks core fields (type, country, AUM, asset classes, strategies, ticket,
-- emerging managers), after the firms with no profile. Grok's save already only fills empty
-- profile fields ("iconnections.profile (blanks)"). The 30-day skip and the unsure list apply
-- the same way. Totals add left_without_profile, left_profile_incomplete, profiles_incomplete.
-- The mandates branch is unchanged. Applied by swapping the iconnections branch of the stored
-- function text, as its owner grok_reader.
-- Undo: re-run the previous definition from schema-21h (migration schema_21l).

grant create on schema grok_fn to grok_reader;
set role grok_reader;
do $do$
declare d text; a int; b int; nb text := $q$
  elsif p_scope = 'iconnections' then
    with prof as (
      select f.firm_key,
             array_remove(array[
               case when nullif(btrim(p.type), '') is null then 'investor_type' end,
               case when nullif(btrim(p.country), '') is null then 'country' end,
               case when p.aum_usd is null then 'aum_usd' end,
               case when coalesce(jsonb_array_length(case when jsonb_typeof(p.asset_classes) = 'array' then p.asset_classes end), 0) = 0 then 'asset_classes' end,
               case when coalesce(jsonb_array_length(case when jsonb_typeof(p.strategies) = 'array' then p.strategies end), 0) = 0 then 'strategies' end,
               case when p.ticket_min_usd is null and p.ticket_max_usd is null then 'ticket_min_usd' end,
               case when p.ticket_min_usd is null and p.ticket_max_usd is null then 'ticket_max_usd' end,
               case when p.emerging is null then 'open_to_emerging_managers' end,
               case when p.min_manager_aum_usd is null then 'min_manager_aum_usd' end], null) as prof_missing
        from iconn_firms f join iconn_profiles p on p.wi_id = f.wi_investor_id
    ), base as (
      select f.*, pr.prof_missing,
             (pr.prof_missing is not null and pr.prof_missing && array['investor_type', 'country', 'aum_usd', 'asset_classes', 'strategies',
                                                                       'ticket_min_usd', 'open_to_emerging_managers']) as gap_profile,
             exists (select 1 from checked c where c.firm_key = f.firm_key and c.result in ('done', 'no_profile') and c.checked_at > now() - interval '30 days') as is_checked,
             exists (select 1 from checked c where c.firm_key = f.firm_key and c.result = 'unsure' and c.reviewed_at is null) as is_unsure
        from iconn_firms f left join prof pr on pr.firm_key = f.firm_key
       where coalesce(f.wi_rejection_status, '') <> 'hidden'
    ), work as (
      -- no profile yet (and no candidate waiting), or a stored profile with core fields missing (10 Nov 2026)
      select * from base where (not profile_stored and grok_candidate_wi_id is null) or (profile_stored and gap_profile)
    ), gaps as (select * from work where not is_checked and not is_unsure)
    select jsonb_build_object(
      'scope', 'iconnections',
      'totals', (select jsonb_build_object('left_to_check', (select count(*) from gaps),
                   'left_without_profile', (select count(*) from gaps where not profile_stored),
                   'left_profile_incomplete', (select count(*) from gaps where profile_stored),
                   'checked_last_30_days', count(*) filter (where is_checked),
                   'unsure_waiting_for_review', count(*) filter (where is_unsure and not is_checked),
                   'firms_without_profile', count(*) filter (where not profile_stored),
                   'profiles_incomplete', count(*) filter (where profile_stored),
                   'with_wi_link', count(*) filter (where wi_investor_id is not null),
                   'without_wi_link', count(*) filter (where wi_investor_id is null),
                   'candidates_waiting_for_review', (select count(*) from iconn_firms where grok_candidate_wi_id is not null and wi_investor_id is null),
                   'firms_in_import', (select count(*) from iconn_firms)) from work),
      'offset', off, 'limit', lim,
      'items', coalesce((select jsonb_agg(jsonb_build_object('id', firm_key, 'investor_name', firm_name, 'country', country,
                           'type_in_iconnections', investor_type, 'website', domain, 'aum_in_iconnections', aum_text,
                           'wi_id', wi_investor_id, 'wi_url', case when wi_investor_id is not null then 'https://platform.withintelligence.com/explore/investors/' || wi_investor_id end,
                           'link_certain', case when wi_investor_id is not null then link_certain end,
                           'earlier_search_candidates', case when not profile_stored then search_candidates end,
                           'profile_stored', profile_stored,
                           'missing', case when profile_stored then to_jsonb(prof_missing)
                                           when wi_investor_id is null then jsonb_build_array('wi_link', 'profile') else jsonb_build_array('profile') end)
                           order by profile_stored, (wi_investor_id is null), firm_name)
                         from (select * from gaps order by profile_stored, (wi_investor_id is null), firm_name limit lim offset off) z), '[]'::jsonb),
      'next', 'After each firm, send checked (done, no_profile or unsure). For a firm with a stored profile, save only fills its empty fields. Always ask todo with offset 0: checked firms drop out.')
    into res;
    return res;
  end if;
$q$;
begin
  d := pg_get_functiondef('grok_fn.todo(text,integer,integer)'::regprocedure);
  a := position('  elsif p_scope = ''iconnections'' then' in d);
  b := position('  raise exception ''scope is mandates or iconnections.'';' in d);
  if a = 0 or b = 0 or b < a then raise exception 'todo definition not as expected'; end if;
  execute left(d, a - 1) || nb || substr(d, b);
end $do$;
reset role;
revoke create on schema grok_fn from grok_reader;
