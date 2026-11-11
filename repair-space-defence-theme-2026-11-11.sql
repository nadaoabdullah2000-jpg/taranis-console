-- SUPERSEDED (11 Nov 2026): merged into repair-themes-space-fill-2026-11-11.sql (one transaction). Do not run.
-- 11 Nov 2026 (DRAFT, NOT APPLIED; dry run for research@taranis.net): Space = Yes from a With
-- Intelligence "investment themes" line that names security & defence (the user's rule: Security &
-- Defence counts as Space). Technology is not touched: security & defence is not a technology theme.
--
-- Scanned: the same With Intelligence text as the theme-line Tech repair (profile summary, intentions,
-- alert intention text, Grok's saved quotes), with a wider line pattern: "... themes over / for /
-- include / focus ..." also without the word "investment" (HRK Group's line was missed this morning).
-- A company description ("aerospace and defense conglomerate", RTX) is not a theme and is left out.
--
-- Writes, per row of the investor (not merged): is_space = true,
--   space_signal = 'With Intelligence profile (theme line): "<line>"'.
-- Dry run: 31 investors, 40 rows, none already Space = Yes: the 29 with a stored themes line (30 less
-- Andrew Carnegie), HRK Group, and Georgia Tech Foundation (its line is not stored in the database; the
-- evidence is the line as the user quoted it from the profile). 2 rows carry the user's own verdict
-- (Bank of Singapore 127, TRS 533): only their Space field is set, the verdict is untouched.
-- Left out on purpose: Andrew Carnegie (1358, the user's own, not to be touched); Institute for
-- Advanced Study (398: only an alert-text fragment "Focus on ... security and defense", not a
-- profile themes line); RTX (company description).
-- Verdicts are NOT changed here (step B, separate, only with the user's OK).
-- ONE transaction. Nothing deleted. Backup: wi_mandates_backup_20261111_space_def. Logged in wi_fill_log.

begin;
create temp table space_plan on commit drop as
with rows as (
  select m.id, nullif(m.evidence->>'wi_investor_id','') wi,
         coalesce(nullif(m.evidence->>'wi_investor_id',''), 'name:' || wi_name_key(coalesce(nullif(btrim(m.investor_name),''), m.organization_name))) k
    from wi_mandates m where coalesce(m.validation_status,'') <> 'merged'
), texts as (
  select r.k, t.txt from rows r join wi_mandates m on m.id = r.id,
    lateral (values (m.evidence->>'wi_summary'), (m.intention_summary), (m.requirements_raw), (m.appetite_raw), (m.tech_signal)) t(txt)
  union all
  select r.k, coalesce(l.old_value, l.new_value) from wi_fill_log l join rows r on r.id = l.mandate_id::bigint
   where l.field in ('is_tech_investor','tech_signal')
  union all
  select r.k, x->>'note' from (select distinct k, wi from rows where wi is not null) r join hf_wi_reads h on h.wi_id = r.wi,
    lateral jsonb_array_elements(case when jsonb_typeof(h.intentions) = 'object' then coalesce(h.intentions->'latest3','[]') || coalesce(h.intentions->'hf','[]') else '[]' end) x
  union all
  select r.k, regexp_replace(p.payload#>>'{raw,summary}', '<[^>]+>', ' ', 'g') from (select distinct k, wi from rows where wi is not null) r
    join wi_profile_reads p on p.wi_investor_id = r.wi and p.status = 'ok'
), lines as (
  select distinct t.k, btrim(regexp_replace(mm[1], '\s+', ' ', 'g')) line
    from texts t, lateral regexp_matches(coalesce(t.txt, ''),
      '((?:the investor''s |its )?(?:primary |key |main |core |investment )*themes?\s(?:over|for|include|focus|are)[^.|"]*(?:security|aerospace)\s?(?:and|&)\s?defen[cs]e[^.|"]*)', 'gi') mm
   where coalesce(t.txt, '') !~* 'conglomerate'
), best as (
  select distinct on (k) k, line from lines order by k, length(line) desc
), keyed as (
  select k, line from best where k <> '9564'                       -- Andrew Carnegie: the user's own
  union all
  select '1700', 'primary investment themes… focus on healthcare and longevity, and security and defense'   -- GTF, quoted by the user
)
select r.id, kk.line from keyed kk join rows r on r.k = kk.k;

create table wi_mandates_backup_20261111_space_def as
  select id, is_space, space_signal from wi_mandates where id in (select id from space_plan);

insert into wi_fill_log (mandate_id, investor_name, field, old_value, new_value, source, wi_investor_id)
select m.id, m.investor_name, 'is_space', coalesce(m.is_space::text, 'null') || coalesce(' (' || left(m.space_signal, 150) || ')', ''),
       'true (With Intelligence profile (theme line): "' || p.line || '")',
       'Security & Defence theme counts as Space, 11 Nov 2026 (decided by research@taranis.net)', m.evidence ->> 'wi_investor_id'
  from wi_mandates m join space_plan p on p.id = m.id;

update wi_mandates m set is_space = true,
       space_signal = 'With Intelligence profile (theme line): "' || p.line || '"'
  from space_plan p where p.id = m.id;
commit;

-- STEP B (only with the user's OK): the app's rescore moves 3 rows from Needs data to Waiting for
-- decision once Space = Yes (space without long/short is a review, never a match):
--   450 West Virginia University Foundation  needs_data -> uncertain 0.50
--   1207 North Carolina State University      needs_data -> uncertain 0.60 (the user's Tech = No stays)
--   468 Bank of Singapore                     needs_data -> uncertain 0.55 (row 127, the user's own, untouched)

-- UNDO:
--   update wi_mandates m set is_space = b.is_space, space_signal = b.space_signal
--     from wi_mandates_backup_20261111_space_def b where b.id = m.id;
