-- Follow-ups to the 5 Nov hedge fund change. ONE transaction. Nothing is deleted.
--  1. Investor links: every "View investor" that is still an email tracking link
--     becomes the With Intelligence profile link it opens (checked on 4 Nov in
--     wi_link_checks; for two new rows, the id WI 01b stored).
--  2. AUM stored in millions instead of dollars (WI 01b units bug, fixed at the
--     source the same day): x 1,000,000 where the AUM range is $100m or more.
--  3. Philos & Partners: $7,000bn -> $3.75bn, the midpoint of With Intelligence's
--     $2.5bn - $5bn range (With Intelligence gives no exact figure), marked estimated.
--  4. Hedge fund evidence text: the most informative commitment or search, not the
--     newest record ("No additional updates ..." notices are skipped).
-- The hedge fund guard trigger is paused inside the transaction so these edits do
-- not relabel rows that were not audited. Every change is logged in wi_fill_log
-- (source 'Follow-up 5 Nov 2026'). Backup: wi_mandates_backup_20261105b.

begin;

create table wi_mandates_backup_20261105b as
  select id, view_investor_url, evidence, aum_usd, hf_evidence_note from wi_mandates;

alter table wi_mandates disable trigger zz_hf_hard_rule;

-- 1. links
create temp table lk as
select m.id, m.investor_name, m.view_investor_url old_url,
       'https://platform.withintelligence.com/explore/investors/' || coalesce(c.wi_id, m.evidence ->> 'wi_investor_id') new_url,
       coalesce(c.wi_id, m.evidence ->> 'wi_investor_id') wi_id
  from wi_mandates m left join wi_link_checks c on c.mandate_id = m.id and c.status = 'ok'
 where nullif(btrim(m.view_investor_url), '') is not null
   and m.view_investor_url !~ '^https://platform\.withintelligence\.com/explore/investors/-?\d+$'
   and coalesce(c.wi_id, m.evidence ->> 'wi_investor_id') ~ '^-?\d+$';

insert into wi_fill_log (mandate_id, investor_name, field, old_value, new_value, source, wi_investor_id)
select id, investor_name, 'Link fixed: Investor page', old_url, new_url, 'Follow-up 5 Nov 2026: tracking link replaced by the profile it opens', wi_id from lk;

update wi_mandates m set view_investor_url = lk.new_url,
       evidence = (case when jsonb_typeof(m.evidence) = 'object' then m.evidence else '{}'::jsonb end) || jsonb_build_object('wi_investor_id', lk.wi_id)
  from lk where lk.id = m.id;

-- 2. AUM in millions
create temp table au as
select id, investor_name, aum_usd old_aum, aum_usd * 1000000 new_aum
  from wi_mandates
 where aum_usd > 0 and aum_usd < 10000000
   and (aum_band ~* 'bn' or aum_band ~* '\$\s*\d{3,}\s*m' or aum_band ~ '^\s*>');
insert into wi_fill_log (mandate_id, investor_name, field, old_value, new_value, source)
select id, investor_name, 'Corrected: AUM (USD)', old_aum::text, new_aum::text, 'Follow-up 5 Nov 2026: With Intelligence AUM is in millions; stored in dollars' from au;
update wi_mandates m set aum_usd = au.new_aum from au where au.id = m.id;

-- 3. Philos & Partners
insert into wi_fill_log (mandate_id, investor_name, field, old_value, new_value, source)
select id, investor_name, 'Corrected: AUM (USD)', aum_usd::text, '3750000000', 'Follow-up 5 Nov 2026: estimated, midpoint of With Intelligence range $2.5bn - $5bn (no exact figure on With Intelligence)'
  from wi_mandates where id = 935 and aum_usd = 7000000000000;
update wi_mandates set aum_usd = 3750000000,
       evidence = (case when jsonb_typeof(evidence) = 'object' then evidence else '{}'::jsonb end)
                  || jsonb_build_object('aum_estimated', 'Midpoint of With Intelligence range $2.5bn - $5bn; With Intelligence gives no exact AUM')
 where id = 935 and aum_usd = 7000000000000;

-- 4. evidence text: most informative hedge fund commitment / search per investor
create temp table best as
select distinct on (v.wi_id) v.wi_id,
       'HF commitment/allocation/search: ' || (e ->> 'date') || ' ' || coalesce(e ->> 'sub', e ->> 'st', '')
       || coalesce(' [' || nullif(e ->> 'ac', '') || ']', '') || ': '
       || case when coalesce(e ->> 'note', '') ~* '^\s*(no additional updates|we have inferred)|inferred that all search activity'
               then 'hedge fund mandate on With Intelligence, search concluded'
               else left(e ->> 'note', 220) end
       || case when jsonb_array_length(v.cm_hf) > 1 then ' (+' || (jsonb_array_length(v.cm_hf) - 1) || ' more)' else '' end as txt
  from hf_audit_v4 v, jsonb_array_elements(v.cm_hf) e
 where v.cm_hf is not null and v.wi_id is not null
 order by v.wi_id,
   (coalesce(e ->> 'note', '') ~* '^\s*(no additional updates|we have inferred)|inferred that all search activity') asc,
   case when coalesce(e ->> 'sub', '') in ('Awarded Mandate', 'Asset Reweighting') and e ->> 'note' ~* 'commit|allocat|invest|approv|hired|award' then 1
        when coalesce(e ->> 'sub', '') ~* 'search' or e ->> 'note' ~* '\mRFP|search' then 2 else 3 end,
   e ->> 'date' desc,
   coalesce((regexp_match(e ->> 'note', '[$€£]\s?([0-9]+(?:\.[0-9]+)?)\s?(bn|billion)', 'i'))[1]::numeric * 1000,
            (regexp_match(e ->> 'note', '[$€£]\s?([0-9]+(?:\.[0-9]+)?)\s?m', 'i'))[1]::numeric, 0) desc;

create temp table ev as
select * from (
  select m.id, m.investor_name, m.hf_evidence_note old_note,
         regexp_replace(m.hf_evidence_note, 'HF commitment/allocation/search: .*?(?= \| |$)', replace(b.txt, '\', '\\')) new_note
    from wi_mandates m
    join best b on b.wi_id = coalesce(m.evidence ->> 'wi_investor_id', (select h.wi_id from hf_audit_v2 h where h.id = m.id))
   where m.hf_evidence_note like '%HF commitment/allocation/search: %'
     and coalesce(m.validation_status, '') <> 'merged') z
 where new_note is distinct from old_note;
insert into wi_fill_log (mandate_id, investor_name, field, old_value, new_value, source)
select id, investor_name, 'Hedge fund evidence text', left(old_note, 500), left(new_note, 500), 'Follow-up 5 Nov 2026: most informative record' from ev;
update wi_mandates m set hf_evidence_note = ev.new_note from ev where ev.id = m.id;

alter table wi_mandates enable trigger zz_hf_hard_rule;

commit;

-- ROLLBACK (one block):
--   begin;
--   alter table wi_mandates disable trigger zz_hf_hard_rule;
--   update wi_mandates m set view_investor_url = b.view_investor_url, evidence = b.evidence, aum_usd = b.aum_usd,
--          hf_evidence_note = b.hf_evidence_note
--     from wi_mandates_backup_20261105b b where b.id = m.id;
--   alter table wi_mandates enable trigger zz_hf_hard_rule;
--   commit;
