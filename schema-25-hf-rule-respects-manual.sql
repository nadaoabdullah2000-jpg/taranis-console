-- Schema 25 (11 Nov 2026): the hedge fund rule (trigger zz_hf_hard_rule, function hf_hard_rule) never
-- changes a verdict a person set.
-- Bug: when hedge fund investing was not confirmed, the rule turned any "matched" into "review, capped
-- at 74%", also when a person had just chosen "Matched" (row 3047 Seidor, 11 Nov 07:05 and 07:06, by
-- nada.osama@taranis.net), and prefixed "Hedge fund investing not confirmed." to fit_reason again on
-- every save. Now:
--  * verdict_source = 'manual' -> the rule leaves the verdict, score and approval alone (it still
--    fills hf_evidence for the row);
--  * the "not confirmed" note is added once, never repeated.
-- Then row 3047 gets back the verdict its person chose (matched, 0.75 as the console wrote it), with
-- the repeated note cleaned, logged in wi_fill_log; backup wi_mandates_backup_20261111_3047.
-- Undo: re-run the previous hf_hard_rule (kept below as a comment) and restore 3047 from the backup.

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
  -- A verdict a person set is theirs: the rule does not touch it (11 Nov 2026).
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
    if new.new_qualification = 'matched' then
      new.hf_held_verdict := 'matched'; new.hf_held_score := new.new_fit_score;
      new.new_qualification := 'uncertain'; new.qualification := 'uncertain';
      new.fit_reason := 'Hedge fund investing not confirmed. '
                        || regexp_replace(coalesce(new.fit_reason, ''), '^(Hedge fund investing not confirmed[.:] )+', '');
    end if;
    if new.new_fit_score > 0.74 then new.new_fit_score := 0.74; end if;
    new.approved_at := null; new.approved_by := null;
  end if;
  return new;
end $function$;

-- Row 3047: the person's choice back.
begin;
create table if not exists wi_mandates_backup_20261111_3047 as
  select id, qualification, new_qualification, new_fit_score, fit_reason, hf_held_verdict, hf_held_score,
         verdict_source, verdict_set_by, verdict_set_at from wi_mandates where id = 3047;
insert into wi_fill_log (mandate_id, investor_name, field, old_value, new_value, source)
select id, investor_name, 'Verdict', concat_ws(' ', new_qualification, new_fit_score::text), 'matched 0.75',
       'Fix 11 Nov 2026: the Matched chosen by nada.osama@taranis.net at 07:06 had been overridden by the hedge fund rule'
  from wi_mandates where id = 3047;
update wi_mandates
   set qualification = 'matched', new_qualification = 'matched', new_fit_score = 0.75,
       fit_reason = 'Hedge fund investing not confirmed. '
                    || regexp_replace(coalesce(fit_reason, ''), '^(Hedge fund investing not confirmed[.:] )+', ''),
       hf_held_verdict = null, hf_held_score = null,
       verdict_source = 'manual', verdict_set_by = 'nada.osama@taranis.net', verdict_set_at = now()
 where id = 3047;
commit;

-- UNDO for 3047:
--   update wi_mandates m set qualification = b.qualification, new_qualification = b.new_qualification,
--          new_fit_score = b.new_fit_score, fit_reason = b.fit_reason, hf_held_verdict = b.hf_held_verdict,
--          hf_held_score = b.hf_held_score, verdict_source = b.verdict_source, verdict_set_by = b.verdict_set_by,
--          verdict_set_at = now()
--     from wi_mandates_backup_20261111_3047 b where b.id = m.id;
-- Previous hf_hard_rule: identical except (1) no early return for verdict_source = 'manual' (only the
-- reject branch and the re-promote branch skipped manual rows), and (2) the note was prefixed on every save.
