-- repair-haven-names-2026-11-26.sql (rewritten 26 Nov after the evidence check; option A/B draft replaced)
--
-- EVIDENCE (wi_raw_emails 598 and 639, audit_log, wi_fill_log; queries in the session notes):
--   Both rows are the With Intelligence "Profile alert: A new Investor profile has been added - Haven Wealth Advisors"
--   (10 Nov). The wrong-investor data came from a "View investor" link taken from the NEIGHBOURING item:
--   3069 (email 598, 10 Nov): intake name "Haven Wealth Advisors"; 11 Nov 09:00:37 an unlogged update (audit_log only,
--        AUM in millions, i.e. the old pre-fix WI 01c) renamed it "JP Morgan Private Bank" and wrote AUM 1,559,000,
--        "> $50bn", New York, US, Private Bank. Its view_investor_url is the "Digital editions" weekly-digest item's
--        link (the item behind the JP Morgan Private Bank rows), not Haven's.
--   3383 (email 639, 17 Nov): evidence.name_from_alert "Haven Wealth Advisors"; its link was the "CalSTRS CIO flags AI
--        risk" news item's View investor link; intake inherited hf_evidence "confirmed" from CalSTRS row 1823;
--        19 Nov 05:47 WI 01c (fixed) followed the link to profile 2570 and wrote CalSTRS's name, AUM 421.54bn,
--        West Sacramento, US, Public D.B., wi_summary, wi_investor_id 2570.
--   Haven's own View investor link (target "...01t3YXFmt7vfdAWkeGIanSw") is in both emails; the real Haven row 3597
--   carries the same target.
-- REPAIR: name back to Haven, clear the wrong-investor values (they were blank before), link = Haven's own link from
-- the row's own email, hf_evidence back to the default 'unconfirmed' (3383's "confirmed" was CalSTRS's), organization_name unchanged. 3597 untouched. Verdicts are not set here (none is manual).
-- Not done here: 3069, 3383 and 3597 are three copies of the one 10 Nov Haven alert (merge = duplicates repair).
--
-- UNDO:
--   update wi_mandates m set investor_name = b.investor_name, aum_usd = b.aum_usd, aum_band = b.aum_band,
--          investor_country = b.investor_country, investor_city = b.investor_city, investor_type = b.investor_type,
--          view_investor_url = b.view_investor_url, hf_evidence = b.hf_evidence, evidence = b.evidence
--     from wi_mandates_backup_20261126_haven b where b.id = m.id;

begin;
create table wi_mandates_backup_20261126_haven as select * from wi_mandates where id in (3069, 3383);

with fix(id, field, new_value) as (values
  (3069, 'investor_name', 'Haven Wealth Advisors'), (3069, 'aum_usd', null), (3069, 'aum_band', null),
  (3069, 'investor_country', null), (3069, 'investor_city', null), (3069, 'investor_type', null),
  (3069, 'view_investor_url', 'https://email.withintelligence-email.com/ls/click?upn=u001.bhoYR7SFslumMr0KYqWPqXRgKmh9cwPG9jnjrf45il-2F8AC9OoGEQAPkzvU8QZDnqpanzlsRzyJsCdN3sl7lw01t3YXFmt7vfdAWkeGIanSw-3D8jq0_n5qpys8ICsg5sUr9Nels1SvlLGZmANZI3LfcvWAgUoVJmTwh67oZwyh2xzEwJ5s8s3nzrOkF1tvPd6PHo07bkBQGu4e1vWmW3z2AO2tHNS2UPMNBDujcMtjtDrWU-2Fe7A6u6-2Fwagdfa6jxTKA23aJSZMKd4FKpN36MdonoDP5WlFTimqWzq6Aim7clIb2Ihd9CsuR0ir7aR-2F-2Bcv3Lb3LvoK5R6hoyU-2B2f7sQe44-2FHnGIjgDaeYdlMuOTuD6mw8Ed6B77RBYZ2vW-2ByjdA450RMp1GvOti7Au9v5u9Sx83lpePRFIGzMgTL-2FZfSu72q1Sd8Z81L48xI66-2FIt3fS1sU1HJAy9Vyf3PEM6HrKp8KmKV-2FR8xla2loHJ2gQYXStPo40'),
  (3383, 'investor_name', 'Haven Wealth Advisors'), (3383, 'aum_usd', null), (3383, 'aum_band', null),
  (3383, 'investor_country', null), (3383, 'investor_city', null), (3383, 'investor_type', null),
  (3383, 'hf_evidence', 'unconfirmed'), (3383, 'evidence.wi_investor_id', null), (3383, 'evidence.wi_summary', null),
  (3383, 'view_investor_url', 'https://email.withintelligence-email.com/ls/click?upn=u001.bhoYR7SFslumMr0KYqWPqXRgKmh9cwPG9jnjrf45il-2F8AC9OoGEQAPkzvU8QZDnqpanzlsRzyJsCdN3sl7lw01t3YXFmt7vfdAWkeGIanSw-3DxzpV_ivxOTKY-2BJrXRDZBhvPxfMCr0y3K3ExY9XrEvUm2YTmmUv7OX-2Fw6oj89dnH4hgVlsz54lqh3QHZzPOwoPcOCydxTK0RmqnkvMDMsZSk98WdosSMgeJB1fcSkcXnnCvRDi8ynUYQyWeP7XUwlMIegCOltf-2F2krHfVBW6XqXoOvksSXB9VngyeU-2BNg32ba9RvZaITd17yBGT-2BGH8Yz-2FX4ms2ZUTl4p-2BQGqFi1sM0ketSfiKQYSZUEyS4-2FJyICFufIMULYp7pyW5e80qJAlOzloqOTqIMDUoqqTjaMObGwlhOp-2B9ynxac4Sp8qOzzmwbwLT5XT6TWuY-2F9IVocq5peQ2-2Bxd937wJkLGx-2BLPj2I93bj8ipshQ6wN1jE0AtQZ8KILhM'))
insert into wi_fill_log (mandate_id, investor_name, field, old_value, new_value, source)
select f.id, 'Haven Wealth Advisors', f.field,
       case f.field when 'investor_name' then b.investor_name when 'aum_usd' then b.aum_usd::text when 'aum_band' then b.aum_band
         when 'investor_country' then b.investor_country when 'investor_city' then b.investor_city when 'investor_type' then b.investor_type
         when 'view_investor_url' then b.view_investor_url when 'hf_evidence' then b.hf_evidence
         when 'evidence.wi_investor_id' then b.evidence ->> 'wi_investor_id' when 'evidence.wi_summary' then left(b.evidence ->> 'wi_summary', 300) end,
       f.new_value,
       'repair-haven-names-2026-11-26: source alert is Haven Wealth Advisors; value came from a neighbouring item''s link (approved by the user 26 Nov 2026)'
  from fix f join wi_mandates_backup_20261126_haven b on b.id = f.id;

update wi_mandates m set investor_name = 'Haven Wealth Advisors', aum_usd = null, aum_band = null, investor_country = null,
       investor_city = null, investor_type = null,
       view_investor_url = 'https://email.withintelligence-email.com/ls/click?upn=u001.bhoYR7SFslumMr0KYqWPqXRgKmh9cwPG9jnjrf45il-2F8AC9OoGEQAPkzvU8QZDnqpanzlsRzyJsCdN3sl7lw01t3YXFmt7vfdAWkeGIanSw-3D8jq0_n5qpys8ICsg5sUr9Nels1SvlLGZmANZI3LfcvWAgUoVJmTwh67oZwyh2xzEwJ5s8s3nzrOkF1tvPd6PHo07bkBQGu4e1vWmW3z2AO2tHNS2UPMNBDujcMtjtDrWU-2Fe7A6u6-2Fwagdfa6jxTKA23aJSZMKd4FKpN36MdonoDP5WlFTimqWzq6Aim7clIb2Ihd9CsuR0ir7aR-2F-2Bcv3Lb3LvoK5R6hoyU-2B2f7sQe44-2FHnGIjgDaeYdlMuOTuD6mw8Ed6B77RBYZ2vW-2ByjdA450RMp1GvOti7Au9v5u9Sx83lpePRFIGzMgTL-2FZfSu72q1Sd8Z81L48xI66-2FIt3fS1sU1HJAy9Vyf3PEM6HrKp8KmKV-2FR8xla2loHJ2gQYXStPo40'
 where m.id = 3069 and m.investor_name = 'JP Morgan Private Bank' and coalesce(m.verdict_source, '') <> 'manual';

update wi_mandates m set investor_name = 'Haven Wealth Advisors', aum_usd = null, aum_band = null, investor_country = null,
       investor_city = null, investor_type = null, hf_evidence = 'unconfirmed',
       evidence = evidence - 'wi_investor_id' - 'wi_summary',
       view_investor_url = 'https://email.withintelligence-email.com/ls/click?upn=u001.bhoYR7SFslumMr0KYqWPqXRgKmh9cwPG9jnjrf45il-2F8AC9OoGEQAPkzvU8QZDnqpanzlsRzyJsCdN3sl7lw01t3YXFmt7vfdAWkeGIanSw-3DxzpV_ivxOTKY-2BJrXRDZBhvPxfMCr0y3K3ExY9XrEvUm2YTmmUv7OX-2Fw6oj89dnH4hgVlsz54lqh3QHZzPOwoPcOCydxTK0RmqnkvMDMsZSk98WdosSMgeJB1fcSkcXnnCvRDi8ynUYQyWeP7XUwlMIegCOltf-2F2krHfVBW6XqXoOvksSXB9VngyeU-2BNg32ba9RvZaITd17yBGT-2BGH8Yz-2FX4ms2ZUTl4p-2BQGqFi1sM0ketSfiKQYSZUEyS4-2FJyICFufIMULYp7pyW5e80qJAlOzloqOTqIMDUoqqTjaMObGwlhOp-2B9ynxac4Sp8qOzzmwbwLT5XT6TWuY-2F9IVocq5peQ2-2Bxd937wJkLGx-2BLPj2I93bj8ipshQ6wN1jE0AtQZ8KILhM'
 where m.id = 3383 and m.investor_name like 'California State Teachers%' and coalesce(m.verdict_source, '') <> 'manual';
commit;
