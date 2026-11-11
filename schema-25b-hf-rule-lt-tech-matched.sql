-- Schema 25b (11 Nov 2026), NOT YET APPLIED — waiting for research@taranis.net's approval.
-- Rule change: long/short or quant AND technology = Matched even when hedge fund investing is not
-- confirmed on With Intelligence. The Taranis score gives long/short + tech 0.90 to 1.00 and nothing
-- else reaches 0.90 (long/short alone or with space caps at 0.80; tech without long/short at 0.70), so
-- the database rule reads "matched at 0.90 or more" as long/short + tech. Everything else stays as it
-- is: a would-be match below 0.90 without confirmation is a review capped at 0.74. A verdict a person
-- set is never touched (schema-25). WI 01 needs no change: it writes new alerts through this rule.
-- Then the 2 rows the rule (app.js rescore(), dry run 11 Nov) moves from review to matched:
--   3037 Seidor founding family's new CIO  review 0.74 -> matched 0.90 (long/short + tech)
--   2868 Mubadala Investment Company       review 0.74 -> matched 0.90 (long/short + tech)
-- (3047 Seidor is already matched by a person; 1698 and 367 are rejected by a person: untouched.)
-- Backup: wi_mandates_backup_20261111_lt. Logged in wi_fill_log.

-- The change in hf_hard_rule, in the "not confirmed" branch:
--   before: if new.new_qualification = 'matched' then <demote to review> end if;
--           if new.new_fit_score > 0.74 then new.new_fit_score := 0.74; end if;
--           new.approved_at := null; new.approved_by := null;
--   after:  if new.new_qualification = 'matched' and coalesce(new.new_fit_score, 0) >= 0.90 then
--             <keep matched; the note "Hedge fund investing not confirmed" is added once>
--           else <as before> end if;

create or replace function public.hf_hard_rule()
returns trigger language plpgsql as $function$
declare inherited record;
begin
  if coalesce(new.validation_status, '') = 'merged' then return new; end if;
  if new.hf_evidence is null then
    select hf_evidence, hf_evidence_note into inherited from wi_mandates
     where new.evidence ->> 'wi_investor_id' is not null and evidence ->> 'wi_investor_id' = new.evidence ->> 'wi_investor_id'
       and hf_evidence is not null and id is distinct from new.id
     order by (hf_evidence = 'confirmed') desc, hf_checked_at desc nulls last limit 1;
    if found then
      new.hf_evidence := inherited.hf_evidence; new.hf_evidence_note := inherited.hf_evidence_note;
      new.hf_evidence_source := 'inherited'; new.hf_checked_at := now();
    else
      new.hf_evidence := case when coalesce(new.investor_type, '') ~* '^(startup )?hedge fund( manager)?$|^hedge funds?$'
                              then 'not_allocator' else 'unconfirmed' end;
      new.hf_evidence_source := 'auto';
      new.hf_evidence_note := coalesce(new.hf_evidence_note, 'Not yet checked against With Intelligence');
    end if;
  end if;
  if coalesce(new.verdict_source, '') = 'manual' then return new; end if;
  if new.hf_evidence = 'confirmed' and new.hf_held_verdict = 'matched'
     and coalesce(new.new_qualification, '') <> 'rejected' then
    new.new_qualification := 'matched'; new.qualification := 'matched';
    new.new_fit_score := coalesce(new.hf_held_score, new.new_fit_score);
    new.fit_reason := regexp_replace(coalesce(new.fit_reason, ''), '^(Hedge fund investing not confirmed[.:] )+', '');
    new.hf_held_verdict := null; new.hf_held_score := null;
  end if;
  if new.hf_evidence in ('no', 'not_allocator') then
    new.new_qualification := 'rejected'; new.qualification := 'rejected'; new.new_fit_score := 0;
    new.approved_at := null; new.approved_by := null;
  elsif new.hf_evidence <> 'confirmed' and coalesce(new.hf_evidence_source, '') not like 'person:%' then
    if new.new_qualification = 'matched' and coalesce(new.new_fit_score, 0) >= 0.90 then
      -- long/short + technology: a match, with the note (11 Nov 2026)
      new.fit_reason := 'Hedge fund investing not confirmed. '
                        || regexp_replace(coalesce(new.fit_reason, ''), '^(Hedge fund investing not confirmed[.:] )+', '');
      new.hf_held_verdict := null; new.hf_held_score := null;
    else
      if new.new_qualification = 'matched' then
        new.hf_held_verdict := 'matched'; new.hf_held_score := new.new_fit_score;
        new.new_qualification := 'uncertain'; new.qualification := 'uncertain';
        new.fit_reason := 'Hedge fund investing not confirmed. '
                          || regexp_replace(coalesce(new.fit_reason, ''), '^(Hedge fund investing not confirmed[.:] )+', '');
      end if;
      if new.new_fit_score > 0.74 then new.new_fit_score := 0.74; end if;
      new.approved_at := null; new.approved_by := null;
    end if;
  end if;
  return new;
end $function$;

begin;
create table wi_mandates_backup_20261111_lt as
  select id, qualification, new_qualification, new_fit_score, fit_reason, hf_held_verdict, hf_held_score
    from wi_mandates where id in (3037, 2868);
insert into wi_fill_log (mandate_id, investor_name, field, old_value, new_value, source)
select id, investor_name, 'Verdict', concat_ws(' ', new_qualification, new_fit_score::text), 'matched 0.9',
       'Rule 11 Nov 2026 (approved by research@taranis.net): long/short + technology is a match even when hedge fund investing is not confirmed'
  from wi_mandates where id in (3037, 2868) and coalesce(verdict_source, '') <> 'manual' and new_qualification = 'uncertain';
update wi_mandates set qualification = 'matched', new_qualification = 'matched', new_fit_score = 0.9
 where id in (3037, 2868) and coalesce(verdict_source, '') <> 'manual' and new_qualification = 'uncertain';
commit;

-- UNDO: re-run schema-25's hf_hard_rule, then
--   update wi_mandates m set qualification = b.qualification, new_qualification = b.new_qualification,
--          new_fit_score = b.new_fit_score, fit_reason = b.fit_reason, hf_held_verdict = b.hf_held_verdict,
--          hf_held_score = b.hf_held_score
--     from wi_mandates_backup_20261111_lt b where b.id = m.id;
