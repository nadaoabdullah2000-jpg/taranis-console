-- Schema 24 (10 Nov 2026): a match a person approved can't be undone by a re-import.
--  * public.iconn_approved_links (firm_key, wi_investor_id, row_id, why, approved_by, approved_at,
--    revoked_at): keyed by the firm, not by a file's row number, so it holds for every import of
--    the file and for a new export too. Revoke by setting revoked_at (never deleted).
--  * public.iconn_wi_links and its copy grok.iconn_links read it first: an approved link wins over
--    the name match, the search and Grok, and is always certain.
--  * Restored as approved: the 13 matches the user approved on 4 Nov that the 10 Nov re-import
--    dropped (NewAlpha back to 2147330483; the search's other profile, lookup 220, rejected), and
--    the links the user decided on 10 Nov (TIFF, Stifel, Carnegie Corporation of New York, Kin Group
--    USA, Norges Bank Investment Management, Lanx Management / Gentrust).
-- Backup: iconn_wi_lookup_backup_20261110_approved (lookup 220). Logged in wi_fill_log.
-- Undo: update iconn_approved_links set revoked_at = now(); re-run schema-20's iconn_wi_links and
--       schema-21's grok.iconn_links (or the swap below in reverse); restore lookup 220 from the backup.

begin;

create table if not exists public.iconn_approved_links (
  firm_key       text primary key,
  wi_investor_id text not null,
  row_id         bigint,                 -- the Opportunities row it was approved against, when there is one
  why            text not null,
  approved_by    text not null,
  approved_at    timestamptz not null default now(),
  revoked_at     timestamptz
);
alter table public.iconn_approved_links enable row level security;
drop policy if exists iconn_approved_read on public.iconn_approved_links;
create policy iconn_approved_read on public.iconn_approved_links for select using (is_console_user());
grant select on public.iconn_approved_links to authenticated;

-- both link views: an approved link first
do $do$
declare v text; n text; vname text;
begin
  foreach vname in array array['public.iconn_wi_links', 'grok.iconn_links'] loop
    v := pg_get_viewdef(vname::regclass);
    n := v;
    n := replace(n, $s$            ( SELECT ((k.candidates -> 0) ->> 'id'::text)
                   FROM iconn_wi_lookup k
                  WHERE ((k.run_id = l.run_id) AND (k.row_no = ANY (r.row_nos)) AND (k.confidence = 'Exact'::text) AND (jsonb_array_length(k.candidates) = 1))
                 LIMIT 1) AS exact_wi,$s$,
                    $s$            ( SELECT a.wi_investor_id
                   FROM iconn_approved_links a
                  WHERE ((a.firm_key = l.firm_key) AND (a.revoked_at IS NULL))) AS appr_wi,
            ( SELECT ((k.candidates -> 0) ->> 'id'::text)
                   FROM iconn_wi_lookup k
                  WHERE ((k.run_id = l.run_id) AND (k.row_no = ANY (r.row_nos)) AND (k.confidence = 'Exact'::text) AND (jsonb_array_length(k.candidates) = 1))
                 LIMIT 1) AS exact_wi,$s$);
    n := replace(n, 'COALESCE(m_wi, exact_wi, likely_wi)', 'COALESCE(appr_wi, m_wi, exact_wi, likely_wi)');
    n := replace(n, $s$            WHEN (m_wi IS NOT NULL) THEN$s$,
                    $s$            WHEN (appr_wi IS NOT NULL) THEN 'Approved by a person'::text
            WHEN (m_wi IS NOT NULL) THEN$s$);
    n := replace(n, '    ((m_wi IS NOT NULL) OR (exact_wi IS NOT NULL)', '    ((appr_wi IS NOT NULL) OR (m_wi IS NOT NULL) OR (exact_wi IS NOT NULL)');
    n := replace(n, '  WHERE ((m_wi IS NOT NULL) OR', '  WHERE ((appr_wi IS NOT NULL) OR (m_wi IS NOT NULL) OR');
    if (length(n) - length(v)) < 250 or position('appr_wi IS NOT NULL) THEN' in n) = 0 then
      raise exception 'view % text not as expected', vname;
    end if;
    execute 'create or replace view ' || vname || ' as ' || n;
  end loop;
end $do$;
alter view public.iconn_wi_links set (security_invoker = true);

-- the approvals
create table iconn_wi_lookup_backup_20261110_approved as select * from iconn_wi_lookup where id = 220;
update iconn_wi_lookup set confidence = 'Rejected candidate' where id = 220 and confidence = 'Likely';

insert into iconn_approved_links (firm_key, wi_investor_id, row_id, why, approved_by) values
  ('abs investment management', '2147318706', 2921, 'Approved 4 Nov 2026 (recommended option)', 'research@taranis.net'),
  ('alliancebernstein', '2147328176', 2919, 'Approved 4 Nov 2026 (recommended option)', 'research@taranis.net'),
  ('constanter', '2147329091', 2876, 'Approved 4 Nov 2026 (recommended option)', 'research@taranis.net'),
  ('inlihtan capital', '2147347534', 2909, 'Approved 4 Nov 2026 (recommended option)', 'research@taranis.net'),
  ('j safra sarasin', '2147331345', 2930, 'Approved 4 Nov 2026 (recommended option)', 'research@taranis.net'),
  ('lanx management gentrust', '2147326252', 2920, 'Approved 4 Nov 2026; kept 10 Nov 2026', 'research@taranis.net'),
  ('mt vernon investments', '2147347005', 2917, 'Approved 4 Nov 2026 (recommended option)', 'research@taranis.net'),
  ('mubadala', '2147317593', 2868, 'Approved 4 Nov 2026 (recommended option)', 'research@taranis.net'),
  ('new alpha', '2147330483', 2891, 'Approved 4 Nov 2026 (recommended option); restored 10 Nov 2026', 'research@taranis.net'),
  ('norges bank investment management', '3858', 2897, 'Approved 4 Nov 2026; kept 10 Nov 2026', 'research@taranis.net'),
  ('okabena', '2147325250', 2956, 'Approved 4 Nov 2026 (recommended option)', 'research@taranis.net'),
  ('pathstone', '2147319116', 2951, 'Approved 4 Nov 2026 (recommended option)', 'research@taranis.net'),
  ('princeton investment', '8643', 2885, 'Approved 4 Nov 2026 (recommended option)', 'research@taranis.net'),
  ('investment fund for foundations', '2147325028', null, 'Grok candidate confirmed 10 Nov 2026', 'research@taranis.net'),
  ('stifel', '2147326049', 1257, 'From the list, approved 10 Nov 2026 (rows 1257, 1728, 1737, 1767, 1776)', 'research@taranis.net'),
  ('carnegie of new york', '9564', 1358, 'Link confirmed 10 Nov 2026 (formerly Carnegie Corporation of New York)', 'research@taranis.net'),
  ('kin group usa', '2147330888', null, 'Link kept 10 Nov 2026', 'research@taranis.net')
on conflict (firm_key) do nothing;

insert into wi_fill_log (mandate_id, investor_name, field, old_value, new_value, wi_investor_id, source)
select a.row_id, a.firm_key, 'iconnections.approved_link', null, a.wi_investor_id, a.wi_investor_id,
       'Approved link 10 Nov 2026 (research@taranis.net): ' || a.why
  from iconn_approved_links a where a.approved_at > now() - interval '1 minute';

commit;
