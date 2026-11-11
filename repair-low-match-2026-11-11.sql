-- 11 Nov 2026, APPLIED (approved by research@taranis.net): the "low match" tier.
--   1. schema-29: the guard keeps an alert-text-only Tech match as Matched, capped at 0.89 with a
--      "Low match" note (instead of Waiting for decision at 0.74). Covers WI 01's new alerts.
--   2. Institute for Advanced Study (398): the live profile read (11 Nov) found the themes line on its
--      newest hedge-fund intention (Apr 2026: macro, multi-strategy and equity hedge funds): "The
--      investor's primary investment themes over the next 12-18 months focus on artificial intelligence,
--      healthcare and longevity, and security and defense" -> Tech quoted, Space = Yes, a full match (100%).
--   3. KGI Life Insurance (32): long/short + Tech from the alert text, no profile quote (its 20 newest of
--      75 intentions have no themes line) -> Matched, low match, 89%.
--   Wealthspire (9) stays out (the user's decision; its only themes mention is private real estate).
-- A person's verdict is never touched. ONE transaction. Backup: wi_mandates_backup_20261111_low_match.

begin;
create table wi_mandates_backup_20261111_low_match as
  select id, qualification, new_qualification, new_fit_score, fit_reason, is_tech_investor, tech_signal, is_space, space_signal, evidence
    from wi_mandates where id in (32, 398);

-- 1. the guard (schema-29-low-match.sql)
create or replace function public.match_rule()
returns trigger language plpgsql as $function$
declare wi text; quoted boolean;
begin
  if coalesce(new.validation_status, '') = 'merged' or coalesce(new.verdict_source, '') = 'manual'
     or new.new_qualification is distinct from 'matched' then
    return new;
  end if;
  wi := case when jsonb_typeof(new.evidence) = 'object' then nullif(new.evidence ->> 'wi_investor_id', '') end;
  quoted := (new.is_tech_investor is true and (new.tech_signal like 'With Intelligence profile (Grok): "%' or new.tech_signal like 'With Intelligence profile (theme line): "%' or new.tech_signal like 'Set by a person%'))
         or (wi is not null and exists (
               select 1 from wi_mandates w
                where w.id is distinct from new.id and coalesce(w.validation_status, '') <> 'merged'
                  and jsonb_typeof(w.evidence) = 'object' and w.evidence ->> 'wi_investor_id' = wi
                  and w.is_tech_investor is true
                  and (w.tech_signal like 'With Intelligence profile (Grok): "%' or w.tech_signal like 'With Intelligence profile (theme line): "%' or w.tech_signal like 'Set by a person%')));
  new.fit_reason := regexp_replace(coalesce(new.fit_reason, ''), '^(Low match: [^.]*\. )+', '');
  new.fit_reason := regexp_replace(new.fit_reason, '^(Technology not backed by a With Intelligence quote[^.]*\. )+', '');
  if not quoted then
    if new.new_fit_score > 0.89 then new.new_fit_score := 0.89; end if;
    new.fit_reason := 'Low match: technology from the alert text only, no With Intelligence profile quote. ' || new.fit_reason;
  end if;
  return new;
end $function$;

-- 2. Institute for Advanced Study: quoted Tech + Space from the live read, full match
insert into wi_fill_log (mandate_id, investor_name, field, old_value, new_value, source, wi_investor_id)
select id, investor_name, f, o, n, 'Low-match check 11 Nov 2026 (approved by research@taranis.net)', evidence ->> 'wi_investor_id'
  from wi_mandates m, lateral (values
    ('is_tech_investor', coalesce(m.is_tech_investor::text, 'null') || ' (' || left(coalesce(m.tech_signal, ''), 120) || ')',
     'true (With Intelligence profile (theme line): "The investor''s primary investment themes over the next 12-18 months focus on artificial intelligence, healthcare and longevity, and security and defense")'),
    ('is_space', coalesce(m.is_space::text, 'null'), 'true (same themes line)'),
    ('Verdict', concat_ws(' ', m.new_qualification, m.new_fit_score::text), 'matched 1.0')) v(f, o, n)
 where m.id = 398 and coalesce(m.verdict_source, '') <> 'manual';
update wi_mandates set is_tech_investor = true,
       tech_signal = 'With Intelligence profile (theme line): "The investor''s primary investment themes over the next 12-18 months focus on artificial intelligence, healthcare and longevity, and security and defense"',
       is_space = true,
       space_signal = 'With Intelligence profile (theme line): "The investor''s primary investment themes over the next 12-18 months focus on artificial intelligence, healthcare and longevity, and security and defense"',
       evidence = (case when jsonb_typeof(evidence) = 'object' then evidence else '{}'::jsonb end)
                  || jsonb_build_object('wi_themes_line', 'The investor''s primary investment themes over the next 12-18 months focus on artificial intelligence, healthcare and longevity, and security and defense (hedge-fund intention, 2026-04-01)'),
       new_qualification = 'matched', qualification = 'matched', new_fit_score = 1.0,
       fit_reason = 'Long/short and a quoted Technology focus (profile themes line, 11 Nov 2026). '
                    || regexp_replace(coalesce(fit_reason, ''), '^Matched needs long/short and a quoted Technology focus \(11 Nov 2026\): waiting for a decision\. ', '')
 where id = 398 and coalesce(verdict_source, '') <> 'manual';

-- 3. KGI Life: low match (the guard caps it at 0.89 and adds the note)
insert into wi_fill_log (mandate_id, investor_name, field, old_value, new_value, source, wi_investor_id)
select id, investor_name, 'Verdict', concat_ws(' ', new_qualification, new_fit_score::text), 'matched 0.89 (low match)',
       'Low-match check 11 Nov 2026 (approved by research@taranis.net)', evidence ->> 'wi_investor_id'
  from wi_mandates where id = 32 and coalesce(verdict_source, '') <> 'manual';
update wi_mandates set new_qualification = 'matched', qualification = 'matched', new_fit_score = 0.89,
       fit_reason = regexp_replace(coalesce(fit_reason, ''), '^Matched needs long/short and a quoted Technology focus \(11 Nov 2026\): waiting for a decision\. ', '')
 where id = 32 and coalesce(verdict_source, '') <> 'manual';
commit;

-- UNDO: update wi_mandates m set qualification = b.qualification, new_qualification = b.new_qualification,
--   new_fit_score = b.new_fit_score, fit_reason = b.fit_reason, is_tech_investor = b.is_tech_investor, tech_signal = b.tech_signal,
--   is_space = b.is_space, space_signal = b.space_signal, evidence = b.evidence
--   from wi_mandates_backup_20261111_low_match b where b.id = m.id;
-- and re-run the match_rule() body from schema-28-match-needs-ls-and-quoted-tech.sql.
