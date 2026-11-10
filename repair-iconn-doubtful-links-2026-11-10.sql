-- 10 Nov 2026 (decided by research@taranis.net): the 18 links Grok flagged as opening another entity.
-- ONE transaction. Nothing deleted. Backups: iconn_wi_lookup_backup_20261110_doubtful,
-- grok_checked_backup_20261110_doubtful. Logged in wi_fill_log.
--  * Kept: Norges Bank Investment Management -> Government Pension Fund Global (3858),
--    Lanx Management / Gentrust -> GenTrust LLC (2147326252), Kin Group USA -> Kin Group Pty (2147330888,
--    now certain). Their unsure entries are marked reviewed; Grok may now read these profiles.
--  * Unlinked (the search entry that made the link is marked 'Rejected candidate'): Borealis, Brandywine,
--    Cleveland Clinic, Ellen and Ian Graham, First Pacific Advisors, Granville, HP Management, Morris Family
--    Office, Persistent, Reflexive, Soundlink, Temasek, Topwater, Whitman, XO Capital. Back on Grok's list.
--  * Hints for Grok: new table iconn_grok_hints (firm_key, hint), shown on each todo item as "hint".

begin;

create table if not exists public.iconn_grok_hints (
  firm_key text primary key,
  hint     text not null,
  set_by   text not null,
  set_at   timestamptz not null default now()
);
alter table public.iconn_grok_hints enable row level security;   -- no policies: only definer functions read it
create or replace view grok.iconn_hints as select firm_key, hint from public.iconn_grok_hints;
grant select on grok.iconn_hints to grok_reader;

create table iconn_wi_lookup_backup_20261110_doubtful as
  select * from iconn_wi_lookup where id in (80, 142, 17, 215, 219, 87, 141, 83, 74, 124, 89, 49, 108, 133, 9, 248);
create table grok_checked_backup_20261110_doubtful as
  select * from grok_checked where id in (946, 948, 950, 964, 970, 974, 977, 985, 986, 994, 1000, 1006, 1013, 1023, 1027, 1030, 1037, 1041);

-- unlink 15
insert into wi_fill_log (mandate_id, investor_name, field, old_value, new_value, wi_investor_id, source)
select null, l.firm, 'iconnections.link', c ->> 'id', 'unlinked', c ->> 'id',
       'Review 10 Nov 2026 (decided by research@taranis.net): the link opens another entity'
  from iconn_wi_lookup l, jsonb_array_elements(l.candidates) with ordinality c(c, i)
 where l.id in (80, 142, 17, 215, 219, 87, 141, 83, 74, 124, 89, 49, 108, 133, 9) and c.i = 1;
update iconn_wi_lookup set confidence = 'Rejected candidate'
 where id in (80, 142, 17, 215, 219, 87, 141, 83, 74, 124, 89, 49, 108, 133, 9) and confidence in ('Likely', 'Exact');

-- keep Kin Group USA -> Kin Group Pty, now certain
update iconn_wi_lookup set confidence = 'Exact' where id = 248 and confidence = 'Likely';
insert into wi_fill_log (mandate_id, investor_name, field, old_value, new_value, wi_investor_id, source) values
  (null, 'Kin Group USA', 'iconnections.link', 'likely', '2147330888 (certain)', '2147330888',
   'Review 10 Nov 2026 (decided by research@taranis.net): link to Kin Group Pty kept');

-- unsure list: all 18 reviewed
update grok_checked set reviewed_at = now(), reviewed_by = 'research@taranis.net'
 where id in (946, 948, 950, 964, 970, 974, 977, 985, 986, 994, 1000, 1006, 1013, 1023, 1027, 1030, 1037, 1041)
   and reviewed_at is null;

-- hints for Grok
insert into iconn_grok_hints (firm_key, hint, set_by) values
  ('temasek', 'Search "Temasek Holdings" (not Temasek Trust).', 'research@taranis.net'),
  ('cleveland clinic', 'Look for the Cleveland Clinic foundation or endowment, not the Cleveland Clinic Foundation Retirement Plan.', 'research@taranis.net'),
  ('first pacific advisors', 'Look for the firm as an investor, not a fund it manages (not FPA Multi-Advisor Fund). If it only exists as a manager or fund, mark no_profile.', 'research@taranis.net'),
  ('granville capital', 'Look for the firm as an investor, not a fund it manages (not Granville Equity Partners). If it only exists as a manager or fund, mark no_profile.', 'research@taranis.net'),
  ('topwater capital', 'Look for the firm as an investor, not a fund it manages (not Topwater Mayfly Fund). If it only exists as a manager or fund, mark no_profile.', 'research@taranis.net'),
  ('persistent asset management', 'Look for the firm as an investor, not a fund it manages (not Persistent Edge China Partners). If it only exists as a manager or fund, mark no_profile.', 'research@taranis.net'),
  ('soundlink partners', 'Look for the firm as an investor, not a fund it manages (not Soundlink Investment Partners). If it only exists as a manager or fund, mark no_profile.', 'research@taranis.net'),
  ('borealis strategic capital partners', 'Look for the firm as an investor, not a fund it manages (not Borealis Strategic Co-Investment Fund). If it only exists as a manager or fund, mark no_profile.', 'research@taranis.net'),
  ('norges bank investment management', 'Link confirmed: the Government Pension Fund Global profile (3858) is the right one. Read it.', 'research@taranis.net'),
  ('lanx management gentrust', 'Link confirmed: the GenTrust LLC profile (2147326252) is the right one. Read it.', 'research@taranis.net'),
  ('kin group usa', 'Link confirmed: the Kin Group Pty profile (2147330888) is the right one. Read it.', 'research@taranis.net')
on conflict (firm_key) do update set hint = excluded.hint, set_by = excluded.set_by, set_at = now();

commit;

-- todo('iconnections'): each item carries its hint (text swap in the stored function, as its owner).
grant create on schema grok_fn to grok_reader;
set role grok_reader;
do $do$
declare d text; n text;
begin
  d := pg_get_functiondef('grok_fn.todo(text,integer,integer)'::regprocedure);
  if position('''hint''' in d) > 0 then return; end if;
  n := replace(d, $s$'profile_stored', profile_stored,$s$,
                  $s$'profile_stored', profile_stored,
                           'hint', (select h.hint from iconn_hints h where h.firm_key = z.firm_key),$s$);
  if n = d then raise exception 'todo definition not as expected'; end if;
  execute n;
end $do$;
reset role;
revoke create on schema grok_fn from grok_reader;

-- UNDO (one block):
--   begin;
--   update iconn_wi_lookup l set confidence = b.confidence from iconn_wi_lookup_backup_20261110_doubtful b where b.id = l.id;
--   update grok_checked c set reviewed_at = b.reviewed_at, reviewed_by = b.reviewed_by from grok_checked_backup_20261110_doubtful b where b.id = c.id;
--   update iconn_grok_hints set hint = '(withdrawn) ' || hint where set_at::date = '2026-11-10';
--   commit;
