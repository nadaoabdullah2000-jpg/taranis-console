-- 17 Nov 2026, APPLIED (row 3306), approved by the user: add Quilter Investors (With Intelligence id 2147327285) from Grok's
-- staged discovery record (grok.wi_discovered). UK wealth manager, multi-manager arm of Quilter plc; Hedge
-- Funds among its asset classes; "Hedge Funds preferences: New Manager Yes". Its intentions (Apr 2023) are
-- kept as reference only (evidence.wi_intentions, not scored), so it enters as Needs data with no score.
-- Distinct from row 752 "Quilter" (removed 9 Nov 2026 because the firm was unclear); that row is untouched.
-- Not inserted twice: skipped if a live row already carries this With Intelligence id.
-- ONE transaction. Logged in wi_fill_log.
begin;
insert into wi_mandates (record_key, source_message_id, investor_name, investor_type, investor_country, asset_classes, strategies,
                         aum_usd, view_investor_url, evidence, open_to_emerging_managers, qualification, new_qualification,
                         new_fit_score, fit_reason, source_kind, alert_type, alert_date)
select 'disc-' || d.wi_id, 'discovery:' || d.wi_id, d.name, d.investor_type, 'GB', coalesce(d.asset_classes, '[]'::jsonb), '[]'::jsonb,
       d.aum_usd, d.profile_url,
       jsonb_strip_nulls(jsonb_build_object('wi_investor_id', d.wi_id, 'wi_summary', d.summary, 'wi_intentions', d.intentions,
         'emerging_evidence', d.emerging_evidence,
         'discovery', jsonb_build_object('found', '2026-11-11', 'preset', 'Grok daily discovery', 'added', '2026-11-17'))),
       true, 'uncertain', 'needs_data', null,
       'Found by the With Intelligence discovery search; added 17 Nov 2026: needs data (no strategy, Tech or Space stated).',
       'import', 'Discovery find', current_date
  from grok.wi_discovered d
 where d.wi_id = '2147327285'
   and not exists (select 1 from wi_mandates m where m.evidence->>'wi_investor_id' = d.wi_id and coalesce(m.validation_status,'') <> 'merged');
insert into wi_fill_log (mandate_id, investor_name, field, old_value, new_value, source, wi_investor_id)
select id, investor_name, 'inserted', null, 'Needs data (discovery: Quilter Investors)', 'Discovery insert Quilter Investors, 17 Nov 2026 (approved by the user)', '2147327285'
  from wi_mandates where record_key = 'disc-2147327285';
update grok.wi_discovered set review_status = 'imported', reviewed_at = now(), reviewed_by = 'research (approved 17 Nov 2026)'
 where wi_id = '2147327285';
commit;
select id, investor_name, new_qualification, investor_country, aum_usd from wi_mandates where record_key = 'disc-2147327285';
-- UNDO (no deletes): update wi_mandates set validation_status = 'merged', merged_into = null where record_key = 'disc-2147327285';
--   update grok.wi_discovered set review_status = 'staged', reviewed_at = null, reviewed_by = null where wi_id = '2147327285';
