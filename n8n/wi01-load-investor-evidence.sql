-- WI 01, new node "Load Investor Evidence" (Postgres, Execute Query, Always Output Data), placed between
-- "Key Fields Present?" (true branch, after "WI Profile Enrichment") and "Apply Taranis Hard Criteria" (DRAFT 13 Nov 2026,
-- wiring set 17 Nov 2026). Always exactly ONE row per alert (all nulls when nothing is stored), so every alert still
-- reaches the Apply node; the Postgres node replaces the item, so the Apply node reads the alert from
-- $('Key Fields Present?').item.json.
-- The investor's stored, checked evidence from its best existing row (Matched first, then Review, ...; newest
-- first), so a new alert for an already-enriched investor is scored on the same evidence as its card.
-- Query parameter $1 = the With Intelligence investor id WI 01b resolved ({{ $json._wi_investor_id || ($json.evidence || {}).wi_investor_id }}).
select l.*
  from (select 1) one
  left join lateral (
  select m.id as inherit_from_id,
         jsonb_strip_nulls(jsonb_build_object(
           'equity_long_short',       m.evidence->'equity_long_short',
           'equity_not_long_short',   m.evidence->'equity_not_long_short',
           'equity_review_only',      m.evidence->'equity_review_only',
           'newest_intention_criteria', m.evidence->'newest_intention_criteria',
           'no_matching_strategy',    m.evidence->'no_matching_strategy',
           'tech_hf_intention',       m.evidence->'tech_hf_intention',
           'tech_not_hf_intention',   m.evidence->'tech_not_hf_intention')) as inherit_evidence,
         case when m.tech_signal like 'Set by a person%' or m.tech_signal like 'With Intelligence profile (Grok): "%'
                   or m.tech_signal like 'With Intelligence profile (theme line): "%' then m.is_tech_investor end as inherit_is_tech,
         case when m.tech_signal like 'Set by a person%' or m.tech_signal like 'With Intelligence profile (Grok): "%'
                   or m.tech_signal like 'With Intelligence profile (theme line): "%' then m.tech_signal end as inherit_tech_signal,
         case when m.is_space then true end as inherit_is_space,
         case when m.is_space then m.space_signal end as inherit_space_signal,
         m.hf_evidence as inherit_hf_evidence
    from wi_mandates m
   where nullif($1, '') is not null
     and m.evidence->>'wi_investor_id' = $1
     and coalesce(m.validation_status, '') not in ('merged', 'pending')
   order by case m.new_qualification when 'matched' then 0 when 'uncertain' then 1 when 'low' then 2 when 'needs_data' then 3 else 4 end,
            m.updated_at desc nulls last
   limit 1
  ) l on true;
