-- 11 Nov 2026 (DRAFT until research@taranis.net approves the dry run): ONE transaction for
--   A. Technology / Space from the investment-themes lines read live from With Intelligence
--      (WI 01d themes read, wi_themes_reads): Tech = Yes when the line names a technology theme and
--      appears on at least one intention that is not private equity / venture only; private-only ->
--      a "private_markets_only" Tech check (Tech stays blank); Space = Yes when the line names
--      security & defence or space.
--   B. Space = Yes from the stored security & defence lines (the 31-investor dry run; GTF now has its
--      full line from the live read; Andrew Carnegie is left alone).
--   C. Verdict moves the console's rescore makes once A and B are in (incl. the approved step B:
--      WV University Foundation 450, NC State 1207 (the user's Tech = No stays), Bank of Singapore 468).
-- Plan: public.wi_fill_plan_20261111 (sql/themes-fill-plan-2026-11-11.sql), new_q / new_s filled from
-- the rescore dry run. Only blanks, "not stated" checks and the automatic "no space" are filled; a
-- value a person set (Tech or verdict) is never changed. Nothing deleted.
-- Backup: wi_mandates_backup_20261111_themes_fill. Logged in wi_fill_log.

begin;
create table wi_mandates_backup_20261111_themes_fill as
  select m.id, m.is_tech_investor, m.tech_signal, m.focus_checks, m.is_space, m.space_signal,
         m.qualification, m.new_qualification, m.new_fit_score, m.fit_reason, m.approved_at, m.approved_by
    from wi_mandates m where m.id in (select id from wi_fill_plan_20261111);

-- A/B. Technology
insert into wi_fill_log (mandate_id, investor_name, field, old_value, new_value, source, wi_investor_id)
select p.id, p.investor, 'is_tech_investor', 'null' || coalesce(' (check: ' || (p.old_focus_checks->'tech'->>'result') || ')', ''),
       'true (With Intelligence profile (theme line): "' || p.line || '")',
       'Themes read 11 Nov 2026 (approved by research@taranis.net)', p.wi_key
  from wi_fill_plan_20261111 p where p.tech_action = 'tech_yes';
update wi_mandates m set is_tech_investor = true,
       tech_signal = 'With Intelligence profile (theme line): "' || p.line || '"',
       focus_checks = nullif(coalesce(m.focus_checks, '{}'::jsonb) - 'tech', '{}'::jsonb)
  from wi_fill_plan_20261111 p
 where p.id = m.id and p.tech_action = 'tech_yes' and m.is_tech_investor is null;

insert into wi_fill_log (mandate_id, investor_name, field, old_value, new_value, source, wi_investor_id)
select p.id, p.investor, 'focus.tech', coalesce(p.old_focus_checks->'tech'->>'result', 'none'),
       'private_markets_only: themes line only on private equity / venture intentions: "' || left(p.line, 220) || '"',
       'Themes read 11 Nov 2026 (approved by research@taranis.net)', p.wi_key
  from wi_fill_plan_20261111 p where p.tech_action = 'tech_private_only';
update wi_mandates m set focus_checks = coalesce(m.focus_checks, '{}'::jsonb) || jsonb_build_object('tech', jsonb_build_object(
         'result', 'private_markets_only', 'note', left('Themes line only on private equity / venture intentions: "' || p.line || '"', 300),
         'at', now(), 'by', 'themes read'))
  from wi_fill_plan_20261111 p
 where p.id = m.id and p.tech_action = 'tech_private_only' and m.is_tech_investor is null;

-- A/B. Space
insert into wi_fill_log (mandate_id, investor_name, field, old_value, new_value, source, wi_investor_id)
select p.id, p.investor, 'is_space', coalesce(p.old_space::text, 'null') || coalesce(' (' || left(p.old_space_signal, 150) || ')', ''),
       'true (With Intelligence profile (theme line): "' || p.line || '")',
       'Security & Defence theme counts as Space, 11 Nov 2026 (approved by research@taranis.net)', p.wi_key
  from wi_fill_plan_20261111 p where p.space_action = 'space_yes';
update wi_mandates m set is_space = true, space_signal = 'With Intelligence profile (theme line): "' || p.line || '"'
  from wi_fill_plan_20261111 p
 where p.id = m.id and p.space_action = 'space_yes' and coalesce(m.space_signal, '') not like 'Set by a person%';

-- C. Verdicts (the console's rescore; a person's verdict is never changed)
insert into wi_fill_log (mandate_id, investor_name, field, old_value, new_value, source, wi_investor_id)
select p.id, p.investor, 'verdict', p.old_q || ' ' || coalesce(p.old_s::text, '-'), p.new_q || ' ' || coalesce(p.new_s::text, '-'),
       'Rescore after the themes fill, 11 Nov 2026 (approved by research@taranis.net)', p.wi_key
  from wi_fill_plan_20261111 p where p.new_q is not null and coalesce(p.verdict_source, '') <> 'manual';
update wi_mandates m set new_qualification = p.new_q, qualification = case when p.new_q in ('matched','rejected') then p.new_q else 'uncertain' end,
       new_fit_score = p.new_s,
       fit_reason = 'Rescored 11 Nov 2026 after the themes-line fill (' || p.old_q || ' -> ' || p.new_q || '). ' || coalesce(m.fit_reason, '')
  from wi_fill_plan_20261111 p
 where p.id = m.id and p.new_q is not null and coalesce(m.verdict_source, '') <> 'manual';
commit;

-- UNDO:
--   update wi_mandates m set is_tech_investor = b.is_tech_investor, tech_signal = b.tech_signal, focus_checks = b.focus_checks,
--          is_space = b.is_space, space_signal = b.space_signal, qualification = b.qualification,
--          new_qualification = b.new_qualification, new_fit_score = b.new_fit_score, fit_reason = b.fit_reason,
--          approved_at = b.approved_at, approved_by = b.approved_by
--     from wi_mandates_backup_20261111_themes_fill b where b.id = m.id;
