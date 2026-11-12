-- 12 Nov 2026, APPLIED (approved by research@taranis.net; 21 rows, 21 log entries): store, per investor, the
-- hedge fund intention on its With Intelligence profile that names a tech theme, so
-- "best match first" ranks it in Tech tier 1 (above a general themes line such as AARP's).
--
-- Source: the profile intentions already read and stored on 11 Nov 2026 (wi_full_reads,
-- wi_themes_reads). An intention counts when it is about hedge fund strategies (hedge fund,
-- long/short, event driven, macro, digital assets, multi-strategy, relative value, market
-- neutral, equity strategy, absolute return, CTA, systematic, quant), is not a private-markets
-- intention (buyout, venture, growth capital, private equity, real estate, private credit,
-- direct lending, co-invest, closed-end, value add, core/blend, natural resources,
-- secondaries), and has a sentence naming a tech theme (AI, machine learning, technology,
-- digital infrastructure, blockchain, cybersecurity, fintech, software, deep tech) that is not
-- turned away ("less so", "avoid", "exclude", "does not", "will not"...). Newest such intention.
--
-- Writes ONE evidence key, tech_hf_intention, on Matched and Review rows of those investors.
-- No verdict, score, Tech flag or tech_signal changes. The key is not scored (EVIDENCE_NOT_SCORED).
-- ONE transaction. Backup: wi_mandates_backup_20261112_tech_hf. Logged in wi_fill_log.
begin;
create temp table hf_src on commit drop as
with inv as (
  select distinct evidence->>'wi_investor_id' wi from wi_mandates
   where new_qualification in ('matched', 'uncertain') and coalesce(validation_status, '') not in ('pending', 'merged')
     and evidence ? 'wi_investor_id'),
notes as (
  select r.wi_id, e->>'note' note, left(e->>'date', 10) d from wi_full_reads r,
         jsonb_array_elements(case when jsonb_typeof(r.notes) = 'array' then r.notes else '[]' end) e
   where r.wi_id in (select wi from inv)
  union
  select r.wi_id, e->>'note', left(e->>'date', 10) from wi_themes_reads r,
         jsonb_array_elements(case when jsonb_typeof(r.notes) = 'array' then r.notes else '[]' end) e
   where r.wi_id in (select wi from inv)),
hit as (
  select wi_id, d,
         substring(note from '(?i)([^.]*(artificial intelligence|\mAI\M|machine learning|technolog[a-z]*|digital infrastructure|blockchain|cybersecurity|fintech|software|deep tech)[^.]*)') sent
    from notes
   where note ~* '(hedge fund|long[/ -]short|event[- ]driven|\mmacro\M|digital assets|multi[- ]strateg|relative value|market[- ]neutral|equity strateg|absolute return|\mcta\M|systematic|quant)'
     and note !~* '(buyout|venture|growth capital|private equity|real estate|private credit|direct lending|co-invest|closed-end|value add|core/blend|opportunistic, value|natural resources|secondaries)'
     and note ~* '(artificial intelligence|\mAI\M|machine learning|technolog|digital infrastructure|blockchain|cybersecurity|fintech|software|deep tech)')
select distinct on (wi_id) wi_id, '"' || trim(sent) || '" (hedge fund intention, ' || d || ')' as q
  from hit where sent !~* '(less so|not interested|avoid|exclud|no appetite|does not|doesn''t|will not)'
 order by wi_id, d desc;

create table wi_mandates_backup_20261112_tech_hf as
  select m.id, m.evidence from wi_mandates m join hf_src h on h.wi_id = m.evidence->>'wi_investor_id'
   where m.new_qualification in ('matched', 'uncertain') and coalesce(m.validation_status, '') not in ('pending', 'merged');

insert into wi_fill_log (mandate_id, investor_name, field, old_value, new_value, source, wi_investor_id)
select m.id, m.investor_name, 'tech_hf_intention', m.evidence->>'tech_hf_intention', h.q,
       'Tech evidence tier for best match first, 12 Nov 2026 (approved by research@taranis.net)', h.wi_id
  from wi_mandates m join hf_src h on h.wi_id = m.evidence->>'wi_investor_id'
 where m.id in (select id from wi_mandates_backup_20261112_tech_hf);

update wi_mandates m
   set evidence = (case when jsonb_typeof(m.evidence) = 'object' then m.evidence else '{}'::jsonb end)
                  || jsonb_build_object('tech_hf_intention', h.q)
  from hf_src h
 where h.wi_id = m.evidence->>'wi_investor_id'
   and m.id in (select id from wi_mandates_backup_20261112_tech_hf);
commit;
-- UNDO: update wi_mandates m set evidence = b.evidence
--   from wi_mandates_backup_20261112_tech_hf b where b.id = m.id;
