-- Schema 28 (DRAFT, NOT APPLIED; 11 Nov 2026): Matched requires long/short (or quant) AND technology,
-- and the technology must be backed by a With Intelligence quote (saved by Grok from the profile,
-- tech_signal 'With Intelligence profile (Grok): "..."', or an "investment themes" line,
-- 'With Intelligence profile (theme line): "..."') or a person's own Tech choice ('Set by a
-- person ...'), on the row or on another row of the same investor (same With Intelligence id).
-- A technology tick from the alert text alone does not make a match.
--
-- Trigger zz_match_rule (runs after zz_hf_hard_rule, by name): a row the rule (not a person) marks
-- 'matched' without quoted technology becomes 'uncertain' (Waiting for decision) at 0.74 at most,
-- with a note. It covers WI 01's new alerts (which cannot see a profile quote when they arrive) and
-- any other writer. A verdict a person set (verdict_source = 'manual') is never touched.
-- Long/short itself is judged by the rule that set the verdict (the console's rescore / WI 01).
--
-- To be applied only after the dry run is approved, together with the data change.
-- Undo: drop trigger zz_match_rule on public.wi_mandates; drop function public.match_rule();

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

-- create trigger zz_match_rule before insert or update on public.wi_mandates
--   for each row execute function public.match_rule();
