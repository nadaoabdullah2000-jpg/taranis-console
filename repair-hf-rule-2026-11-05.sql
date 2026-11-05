-- Hedge fund hard rule, 5 Nov 2026. ONE transaction: run it whole or not at all.
-- (Draft: not applied until the audit report is reviewed.)
--
-- Rule: an allocator can only be matched or approved when it is CONFIRMED to
-- invest in hedge funds. Confirmed = its With Intelligence profile lists the
-- "Hedge Funds" asset class AND, within 24 months, at least one of: a hedge
-- fund intention / mandate / allocation on its With Intelligence intentions
-- page, its own alert about hedge funds, or a stated hedge fund allocation or
-- programme. "Alternative" alone never counts. No profile = unconfirmed.
--
-- Classes (wi_mandates.hf_evidence):
--   confirmed          may be matched / approved
--   unconfirmed        review: not matched, not approved, score capped at 74%
--   manager_allocates  runs its own funds but allocates to hedge funds: review
--                      until a person decides (QRT and similar)
--   no                 profile lists asset classes without Hedge Funds and no
--                      hedge fund intention / alert in 24 months: Rejected
--   not_allocator      a manager / investment firm: Rejected, labelled
--
-- Evidence per row is frozen in hf_audit_final (built from hf_wi_reads,
-- hf_wi_pages and hf_audit_v2 by the report query). Every change is logged in
-- wi_fill_log (source 'HF rule 5 Nov 2026') with old and new values; UNDO at
-- the end. Nothing is deleted.

begin;

-- 1. Columns
alter table wi_mandates add column if not exists hf_evidence text;
alter table wi_mandates add column if not exists hf_evidence_note text;
alter table wi_mandates add column if not exists hf_evidence_source text;   -- 'audit 5 Nov 2026' | 'person: <email>' | 'auto'
alter table wi_mandates add column if not exists hf_checked_at timestamptz;
alter table wi_mandates add column if not exists hf_held_verdict text;    -- the verdict the score gave, held back until confirmed
alter table wi_mandates add column if not exists hf_held_score numeric;

-- 2. Labels from the audit (all audited rows)
--    hf_audit_final(id, cls, evidence) is created by the report query.
with u as (
  update wi_mandates m set hf_evidence = f.cls, hf_evidence_note = f.evidence,
         hf_evidence_source = 'audit 5 Nov 2026', hf_checked_at = now()
    from hf_audit_final f where f.id = m.id
  returning m.id, m.investor_name, f.cls)
insert into wi_fill_log (mandate_id, investor_name, field, old_value, new_value, source)
select id, investor_name, 'Hedge fund evidence', null, cls, 'HF rule 5 Nov 2026' from u;

-- 3. Status moves (logged first, then applied)
create temp table hf_moves as
select m.id, m.investor_name, f.cls, f.evidence,
       m.qualification old_q, m.new_qualification old_nq, m.new_fit_score old_ns, m.fit_reason old_reason,
       m.approved_at old_approved_at, m.approved_by old_approved_by,
       case when f.cls in ('no', 'not_allocator') then 'rejected'
            when f.cls in ('unconfirmed', 'manager_allocates') and m.new_qualification = 'matched' then 'uncertain'
            else m.new_qualification end new_nq
  from wi_mandates m join hf_audit_final f on f.id = m.id
 where (f.cls in ('no', 'not_allocator') and coalesce(m.new_qualification, '') <> 'rejected')
    or (f.cls in ('unconfirmed', 'manager_allocates') and (m.new_qualification = 'matched' or m.approved_at is not null));

insert into wi_fill_log (mandate_id, investor_name, field, old_value, new_value, source)
select id, investor_name, 'Verdict (HF rule)', coalesce(old_nq, old_q) || ' ' || coalesce(old_ns::text, ''),
       new_nq || ' — ' || cls || ': ' || left(evidence, 300), 'HF rule 5 Nov 2026' from hf_moves
union all
select id, investor_name, 'Approval removed (HF rule)', old_approved_at::text || ' by ' || coalesce(old_approved_by, '?'), null, 'HF rule 5 Nov 2026'
  from hf_moves where old_approved_at is not null;

-- keep the full old values for UNDO
create table if not exists hf_rule_undo as select * from hf_moves where false;
insert into hf_rule_undo select * from hf_moves;

update wi_mandates m set
  new_qualification = v.new_nq,
  qualification     = case when v.new_nq in ('matched', 'rejected') then v.new_nq else 'uncertain' end,
  new_fit_score     = case when v.new_nq = 'rejected' then 0 else least(coalesce(m.new_fit_score, 0.74), 0.74) end,
  fit_reason        = case v.cls
                        when 'no' then 'Does not invest in hedge funds: ' || left(v.evidence, 300)
                        when 'not_allocator' then 'Not an allocator (runs its own funds): ' || left(v.evidence, 300)
                        when 'manager_allocates' then 'Manager that allocates to hedge funds, awaiting a decision: ' || left(v.evidence, 300)
                        else 'Hedge fund investing not confirmed: ' || left(v.evidence, 300) end,
  approved_at = null, approved_by = null,
  hf_held_verdict = case when v.old_nq = 'matched' and v.new_nq = 'uncertain' then 'matched' end,
  hf_held_score   = case when v.old_nq = 'matched' and v.new_nq = 'uncertain' then v.old_ns end
  from hf_moves v where v.id = m.id;

-- 4. The guard: no writer can set matched or approved without confirmed evidence.
--    Runs after mandate_guard_trg and wi_keep_manual_verdict (alphabetical).
create or replace function hf_hard_rule() returns trigger language plpgsql as $$
begin
  if new.hf_evidence is null then
    new.hf_evidence := case when coalesce(new.investor_type, '') ~* '^(startup )?hedge fund( manager)?$|^hedge funds?$'
                            then 'not_allocator' else 'unconfirmed' end;
    new.hf_evidence_source := 'auto';
    new.hf_evidence_note := coalesce(new.hf_evidence_note, 'Not yet checked against With Intelligence');
  end if;
  -- confirmed now, and a matched verdict was held back earlier: give it back
  if new.hf_evidence = 'confirmed' and new.hf_held_verdict = 'matched'
     and coalesce(new.new_qualification, '') <> 'rejected' and coalesce(new.verdict_source, '') <> 'manual' then
    new.new_qualification := 'matched'; new.qualification := 'matched';
    new.new_fit_score := coalesce(new.hf_held_score, new.new_fit_score);
    new.fit_reason := regexp_replace(coalesce(new.fit_reason, ''), '^Hedge fund investing not confirmed\. ', '');
    new.hf_held_verdict := null; new.hf_held_score := null;
  end if;
  if new.hf_evidence in ('no', 'not_allocator') then
    new.new_qualification := 'rejected'; new.qualification := 'rejected'; new.new_fit_score := 0;
    new.approved_at := null; new.approved_by := null;
  elsif new.hf_evidence <> 'confirmed' then
    if new.new_qualification = 'matched' then
      new.hf_held_verdict := 'matched'; new.hf_held_score := new.new_fit_score;
      new.new_qualification := 'uncertain'; new.qualification := 'uncertain';
      new.fit_reason := 'Hedge fund investing not confirmed. ' || coalesce(new.fit_reason, '');
    end if;
    if new.new_fit_score > 0.74 then new.new_fit_score := 0.74; end if;
    new.approved_at := null; new.approved_by := null;
  end if;
  return new;
end $$;
drop trigger if exists zz_hf_hard_rule on wi_mandates;
create trigger zz_hf_hard_rule before insert or update on wi_mandates
  for each row execute function hf_hard_rule();

-- 5. I-Connections rows show their allocator's current verdict
update iconnections_import_rows r set matched_status = m.new_qualification, matched_fit = coalesce(m.new_fit_score, 0),
       matched_fit_reason = m.fit_reason
  from wi_mandates m where m.id = r.matched_id and r.matched_status is distinct from m.new_qualification;

-- 6. Saved check: anything matched or approved without confirmed evidence.
create or replace view hf_rule_check as
select m.id, m.investor_name, m.new_qualification, m.new_fit_score, m.approved_at, m.hf_evidence, m.hf_evidence_note
  from wi_mandates m
 where coalesce(m.validation_status, '') <> 'pending'
   and (m.new_qualification = 'matched' or m.approved_at is not null)
   and coalesce(m.hf_evidence, '') <> 'confirmed';

commit;

-- UNDO (run as one block)
--   begin;
--   drop trigger if exists zz_hf_hard_rule on wi_mandates;
--   update wi_mandates m set qualification = u.old_q, new_qualification = u.old_nq, new_fit_score = u.old_ns,
--          fit_reason = u.old_reason, approved_at = u.old_approved_at, approved_by = u.old_approved_by
--     from hf_rule_undo u where u.id = m.id;
--   update wi_mandates set hf_evidence = null, hf_evidence_note = null, hf_evidence_source = null, hf_checked_at = null;
--   commit;
