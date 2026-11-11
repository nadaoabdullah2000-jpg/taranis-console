-- 11 Nov 2026 (decided by research@taranis.net): the match rule. Matched requires long/short (or quant)
-- AND a Technology focus backed by a With Intelligence quote (Grok's profile quote or an "investment
-- themes" line) or a person's own Tech choice. Verdicts a person set are never touched (Seidor, Crewcial;
-- Andrew Carnegie stays Matched under the rule).
--  1. Leave Matched -> Review (waiting for decision) at 74% at most: 25 investors, 29 rows
--     (50 South, AARP, CalSTRS, Colorado FPPA, Fairfax Police, Georgia Tech Fdn, Iowa PERS, KGI Life, KTCU,
--      LSERS, MartinWright, MassPRIM, Morgan Stanley AIP, Nationwide, Oregon PERF, Philos, Pitcairn,
--      Rutgers, SCS, Sonamu, Stewardship, St. Thomas, Vicctus, Wealthspire, YMCA).
--  2. Enter Matched: NMPERA (2739, 0.95) and University of Chicago (1381, 1.00), the console rule's own
--     scores. Northwestern Medicine and Colorado Health Foundation stay in Review: their alerts are
--     hires (People), which the rule never makes an automatic match. FERI AG does not enter.
--  3. Back to Grok's focus list: FERI AG (Technology quote about venture capital only) and KGI Life
--     (Technology from alert text, "publicly traded companies within the AI ecosystem": Grok to confirm
--     it from the profile; then it can re-enter). Wealthspire stays out (its profile contradicts tech).
--  4. The 14 rows rescored this morning from the newest intention get evidence.newest_intention_criteria
--     = {"long_short": false}: the card shows long/short as not met instead of the tick from the
--     strategy-tag list.
--  5. Trigger zz_match_rule (schema-28): every later write follows the same rule (WI 01 included).
-- ONE transaction. Nothing deleted. Backup: wi_mandates_backup_20261111_matchrule. Logged in wi_fill_log.

begin;
create temp table mr_out (id bigint primary key) on commit drop;
insert into mr_out values (9),(32),(101),(122),(343),(359),(529),(768),(935),(1070),(1823),(1879),(1896),(2054),(2102),(2103),
  (2363),(2463),(2507),(2508),(2532),(2869),(2871),(2888),(2900),(2923),(2928),(2939),(2952);
create temp table mr_in (id bigint primary key, s numeric) on commit drop;
insert into mr_in values (2739, 0.95), (1381, 1.00);
create temp table mr_rescored (id bigint primary key) on commit drop;
insert into mr_rescored values (1621),(537),(1310),(938),(477),(464),(2325),(2329),(2364),(1324),(2288),(1355),(531),(358);

create table wi_mandates_backup_20261111_matchrule as
  select id, qualification, new_qualification, new_fit_score, fit_reason, hf_held_verdict, hf_held_score, approved_at, approved_by,
         is_tech_investor, tech_signal, focus_checks, evidence
    from wi_mandates
   where id in (select id from mr_out union select id from mr_in union select id from mr_rescored)
      or (evidence ->> 'wi_investor_id') in (select evidence ->> 'wi_investor_id' from wi_mandates where id in (36, 32));

-- 1. out of Matched
insert into wi_fill_log (mandate_id, investor_name, field, old_value, new_value, source)
select m.id, m.investor_name, 'Verdict', concat_ws(' ', m.new_qualification, m.new_fit_score::text), 'uncertain ' || least(coalesce(m.new_fit_score, 0.74), 0.74),
       'Match rule 11 Nov 2026 (decided by research@taranis.net): Matched needs long/short and a quoted Technology focus'
  from wi_mandates m join mr_out o using (id)
 where m.new_qualification = 'matched' and coalesce(m.verdict_source, '') <> 'manual';
update wi_mandates m set new_qualification = 'uncertain', qualification = 'uncertain',
       new_fit_score = least(coalesce(m.new_fit_score, 0.74), 0.74),
       fit_reason = 'Matched needs long/short and a quoted Technology focus (11 Nov 2026): waiting for a decision. ' || coalesce(m.fit_reason, '')
  from mr_out o where o.id = m.id and m.new_qualification = 'matched' and coalesce(m.verdict_source, '') <> 'manual';

-- 2. into Matched
insert into wi_fill_log (mandate_id, investor_name, field, old_value, new_value, source)
select m.id, m.investor_name, 'Verdict', concat_ws(' ', m.new_qualification, coalesce(m.new_fit_score::text, '-')), 'matched ' || i.s,
       'Match rule 11 Nov 2026 (decided by research@taranis.net): long/short and a quoted Technology focus'
  from wi_mandates m join mr_in i using (id) where coalesce(m.verdict_source, '') <> 'manual';
update wi_mandates m set new_qualification = 'matched', qualification = 'matched', new_fit_score = i.s,
       fit_reason = 'Long/short and a quoted Technology focus (match rule, 11 Nov 2026). ' || coalesce(m.fit_reason, ''),
       hf_held_verdict = null, hf_held_score = null
  from mr_in i where i.id = m.id and coalesce(m.verdict_source, '') <> 'manual';

-- 3. FERI AG and KGI Life back to Grok's focus list (Technology blank again)
insert into wi_fill_log (mandate_id, investor_name, field, old_value, new_value, source, wi_investor_id)
select m.id, m.investor_name, 'is_tech_investor', m.is_tech_investor::text || ' (' || left(m.tech_signal, 200) || ')', null,
       case when m.id = 36 or m.evidence ->> 'wi_investor_id' = (select evidence ->> 'wi_investor_id' from wi_mandates where id = 36)
            then 'Reset 11 Nov 2026 (decided by research@taranis.net): Technology quote is about venture capital only; Grok to re-check'
            else 'Reset 11 Nov 2026 (decided by research@taranis.net): Grok to confirm the public-markets AI quote from the profile' end,
       m.evidence ->> 'wi_investor_id'
  from wi_mandates m
 where coalesce(m.validation_status, '') <> 'merged' and m.is_tech_investor is not null and coalesce(m.tech_signal, '') not like 'Set by a person%'
   and (m.id in (36, 32) or (m.evidence ->> 'wi_investor_id') in (select evidence ->> 'wi_investor_id' from wi_mandates where id in (36, 32)));
update wi_mandates m set is_tech_investor = null, tech_signal = null, focus_checks = nullif(coalesce(m.focus_checks, '{}'::jsonb) - 'tech', '{}'::jsonb)
 where coalesce(m.validation_status, '') <> 'merged' and m.is_tech_investor is not null and coalesce(m.tech_signal, '') not like 'Set by a person%'
   and (m.id in (36, 32) or (m.evidence ->> 'wi_investor_id') in (select evidence ->> 'wi_investor_id' from wi_mandates where id in (36, 32)));

-- 4. the newest-intention marker for the card
update wi_mandates m set evidence = (case when jsonb_typeof(m.evidence) = 'object' then m.evidence else '{}'::jsonb end)
       || jsonb_build_object('newest_intention_criteria', jsonb_build_object('long_short', false, 'at', '2026-11-11'))
  from mr_rescored r where r.id = m.id;

-- 5. the guard (schema-28)
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
  if not quoted then
    new.new_qualification := 'uncertain'; new.qualification := 'uncertain';
    if new.new_fit_score > 0.74 then new.new_fit_score := 0.74; end if;
    new.fit_reason := 'Technology not backed by a With Intelligence quote: waiting for a decision, not a match. '
                      || regexp_replace(coalesce(new.fit_reason, ''), '^(Technology not backed by a With Intelligence quote[^.]*\. )+', '');
    new.approved_at := null; new.approved_by := null;
  end if;
  return new;
end $function$;
drop trigger if exists zz_match_rule on public.wi_mandates;
create trigger zz_match_rule before insert or update on public.wi_mandates for each row execute function public.match_rule();
commit;

-- UNDO (one block):
--   begin;
--   drop trigger if exists zz_match_rule on public.wi_mandates;
--   update wi_mandates m set qualification = b.qualification, new_qualification = b.new_qualification, new_fit_score = b.new_fit_score,
--          fit_reason = b.fit_reason, hf_held_verdict = b.hf_held_verdict, hf_held_score = b.hf_held_score,
--          approved_at = b.approved_at, approved_by = b.approved_by, is_tech_investor = b.is_tech_investor,
--          tech_signal = b.tech_signal, focus_checks = b.focus_checks, evidence = b.evidence
--     from wi_mandates_backup_20261111_matchrule b where b.id = m.id;
--   commit;
--   (Republish WI 01 version 7a60e603 to undo the workflow change.)
