-- Schema 23b (10 Nov 2026), with schema-23.
--  * console_iconn_wi_profiles(run) now returns every firm of the run: its With Intelligence link,
--    stored profile or Grok candidate as before, and in_list: the best row of the user's list with
--    the same With Intelligence id, whatever its status (rejected, excluded and merged included),
--    with its verdict, so the page shows "Rejected by you" instead of "no match". Only a certain
--    link that is not waiting for a person's review is used for this.
--  * todo('iconnections') items carry the firm's contacts (name, position) and websites (e-mail
--    domains), from grok.iconn_people.
-- Undo: re-run schema-22 (console_iconn_wi_profiles) and schema-22b (todo).

create or replace function public.console_iconn_wi_profiles(p_run_id bigint)
returns jsonb
language plpgsql stable security definer
set search_path to 'public'
as $function$
begin
  if not is_console_user() then raise exception 'Console users only.' using errcode = 'insufficient_privilege'; end if;
  return coalesce((
    with rw as (
      select m.id, m.investor_name, m.validation_status, m.merged_into, m.excluded_at, m.verdict_source, m.new_fit_score,
             coalesce(m.new_qualification, m.qualification) as v,
             coalesce(nullif(m.evidence ->> 'wi_investor_id', ''), substring(m.view_investor_url from 'investors/(-?[0-9]+)$')) as wi
        from wi_mandates m
    )
    select jsonb_agg(jsonb_build_object(
             'row_no', r.row_no, 'firm_key', f.firm_key,
             'wi_id', f.wi_investor_id, 'certain', f.link_certain, 'how', f.link_how,
             'profile', p.payload -> 'norm', 'profile_read_at', p.read_at,
             'candidate_wi_id', case when f.wi_investor_id is null then f.grok_candidate_wi_id end,
             'candidate', case when f.wi_investor_id is null then cp.payload -> 'norm' end,
             'in_list', il.j))
      from iconnections_import_rows r
      join iconnections_import_runs u on u.id = r.run_id and u.import_no = r.import_no
      join grok.iconn_firms f on f.firm_key = coalesce(nullif(r.norm_name, ''), lower(r.name))
      left join iconn_wi_profiles p on p.wi_id = f.wi_investor_id and p.status = 'ok'
      left join iconn_wi_profiles cp on cp.wi_id = f.grok_candidate_wi_id and cp.status = 'ok'
      left join lateral (
        select jsonb_build_object('id', b.id, 'name', b.investor_name, 'verdict', b.v, 'score', b.new_fit_score,
                 'by_you', b.verdict_source = 'manual', 'excluded', b.excluded_at is not null,
                 'merged_into', b.merged_into, 'rows', b.n, 'row_ids', b.ids) as j
          from (select x.*, count(*) over () as n, array_agg(x.id) over () as ids
                  from rw x where f.wi_investor_id is not null and x.wi = f.wi_investor_id
                   -- only a certain link that is not waiting for a person's review
                   and f.link_certain
                   and not exists (select 1 from grok_checked c where c.firm_key = f.firm_key and c.result = 'unsure' and c.reviewed_at is null)) b
         order by (coalesce(b.validation_status, '') = 'merged'), (b.excluded_at is not null),
                  array_position(array['matched', 'uncertain', 'low', 'needs_data', 'rejected'], b.v) nulls last,
                  b.new_fit_score desc nulls last, b.id
         limit 1) il on true
     where r.run_id = p_run_id), '[]'::jsonb);
end $function$;
revoke all on function public.console_iconn_wi_profiles(bigint) from public;
grant execute on function public.console_iconn_wi_profiles(bigint) to authenticated;

-- todo('iconnections'): contacts and websites on each item (text swap in the stored function).
grant create on schema grok_fn to grok_reader;
set role grok_reader;
do $do$
declare d text; n text;
begin
  d := pg_get_functiondef('grok_fn.todo(text,integer,integer)'::regprocedure);
  n := replace(d, $s$'profile_stored', profile_stored,$s$,
                  $s$'profile_stored', profile_stored,
                           'contacts', (select pe.contacts from iconn_people pe where pe.firm_key = z.firm_key),
                           'websites', (select to_jsonb(pe.websites) from iconn_people pe where pe.firm_key = z.firm_key),$s$);
  if n = d then raise exception 'todo definition not as expected'; end if;
  execute n;
end $do$;
reset role;
revoke create on schema grok_fn from grok_reader;
