-- Schema 22 (10 Nov 2026): the I-Connections view shows each firm's With Intelligence link and
-- stored profile, also for firms with no opportunity row (the profiles Grok saved were stored in
-- iconn_wi_profiles but nothing in the app read them).
-- console_iconn_wi_profiles(p_run_id): read-only, console users only. One entry per row of the
-- run: the firm's With Intelligence id, whether the link is certain, how it was made, the stored
-- profile (payload.norm) and, when Grok only proposed one, the candidate with its profile.
-- Undo: drop function public.console_iconn_wi_profiles(bigint);

create or replace function public.console_iconn_wi_profiles(p_run_id bigint)
returns jsonb
language plpgsql stable security definer
set search_path to 'public'
as $function$
begin
  if not is_console_user() then raise exception 'Console users only.' using errcode = 'insufficient_privilege'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'row_no', r.row_no, 'firm_key', f.firm_key,
             'wi_id', f.wi_investor_id, 'certain', f.link_certain, 'how', f.link_how,
             'profile', p.payload -> 'norm', 'profile_read_at', p.read_at,
             'candidate_wi_id', case when f.wi_investor_id is null then f.grok_candidate_wi_id end,
             'candidate', case when f.wi_investor_id is null then cp.payload -> 'norm' end))
      from iconnections_import_rows r
      join iconnections_import_runs u on u.id = r.run_id and u.import_no = r.import_no
      join grok.iconn_firms f on f.firm_key = coalesce(nullif(r.norm_name, ''), lower(r.name))
      left join iconn_wi_profiles p on p.wi_id = f.wi_investor_id and p.status = 'ok'
      left join iconn_wi_profiles cp on cp.wi_id = f.grok_candidate_wi_id and cp.status = 'ok'
     where r.run_id = p_run_id
       and (f.wi_investor_id is not null or f.grok_candidate_wi_id is not null)), '[]'::jsonb);
end $function$;

revoke all on function public.console_iconn_wi_profiles(bigint) from public;
grant execute on function public.console_iconn_wi_profiles(bigint) to authenticated;
