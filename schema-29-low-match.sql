-- Schema 29 (DRAFT, NOT APPLIED; 11 Nov 2026): the "low match" tier replaces the 74% cap for
-- technology from the alert text only. A non-manual 'matched' row without quoted technology (no
-- With Intelligence profile quote, no theme line, no person's choice, on the row or another row of
-- the same investor) stays 'matched' but is capped at 0.89, below every quoted match (0.90 and up),
-- with a note. It covers WI 01's new alerts and every other writer, as schema-28 did.
-- Long/short + technology itself is judged by the rule that set the verdict (console rescore / WI 01).
-- A verdict a person set (verdict_source = 'manual') is never touched.
-- Undo: re-run the match_rule() body from schema-28-match-needs-ls-and-quoted-tech.sql.

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
  -- the note is kept only while the match is a low match
  new.fit_reason := regexp_replace(coalesce(new.fit_reason, ''), '^(Low match: [^.]*\. )+', '');
  new.fit_reason := regexp_replace(new.fit_reason, '^(Technology not backed by a With Intelligence quote[^.]*\. )+', '');
  if not quoted then
    if new.new_fit_score > 0.89 then new.new_fit_score := 0.89; end if;
    new.fit_reason := 'Low match: technology from the alert text only, no With Intelligence profile quote. ' || new.fit_reason;
  end if;
  return new;
end $function$;
