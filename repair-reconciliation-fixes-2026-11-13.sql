-- 13 Nov 2026 (approved by research@taranis.net): the remaining Grok-reconciliation fixes.
-- 1. UBP (3223): open_to_emerging_managers false -> true. Grok read "Emerging Managers: Yes"; the discovery
--    loader took "Does not consider first-time funds" as a refusal of emerging managers (loader fixed in
--    scripts/discovery-field-fill.mjs, 13 Nov).
-- 2. Reitan Kapital (3178): its ticket is blank and marked "not stated (checked)", but Grok sent 10.81m-54.06m USD,
--    which looks converted from NOK. ONLY if its stored intentions state the ticket in NOK, the mark becomes
--    "stated in another currency" (focus_checks.ticket.result = 'stated_other_currency'); the ticket stays blank.
-- 3. MacArthur (3210): Grok's May 2026 themes quote kept on the row as evidence only
--    (evidence.tech_quote_older, not scored by the console); Tech stays as it is because the newest themes
--    line (Nov 2026) names only healthcare.
-- ONE transaction. Backup: wi_mandates_backup_20261113_recon. Logged in wi_fill_log.
begin;
create table wi_mandates_backup_20261113_recon as
  select id, open_to_emerging_managers, focus_checks, evidence from wi_mandates where id in (3223, 3178, 3210);

-- 1. UBP
insert into wi_fill_log (mandate_id, investor_name, field, old_value, new_value, source, wi_investor_id)
select id, investor_name, 'open_to_emerging_managers', open_to_emerging_managers::text, 'true',
       'Reconciliation fix: Grok read "Emerging Managers: Yes"; "does not consider first-time funds" is not a refusal of emerging managers (13 Nov 2026, approved by research@taranis.net)',
       evidence->>'wi_investor_id'
  from wi_mandates where id = 3223 and open_to_emerging_managers is distinct from true;
update wi_mandates
   set open_to_emerging_managers = true,
       evidence = coalesce(evidence, '{}'::jsonb) || jsonb_build_object('emerging_evidence',
         'Grok (With Intelligence profile): "Emerging Managers: Yes". "Does not consider first-time funds" turns away first funds, not emerging managers.')
 where id = 3223 and open_to_emerging_managers is distinct from true;

-- 2. Reitan, only when a stored intention states the ticket in NOK
create temp table reitan_nok on commit drop as
select left(e->>'note', 300) note
  from (select notes from wi_full_reads where wi_id = '2147346086' union all
        select notes from wi_themes_reads where wi_id = '2147346086' union all
        select notes from wi_hf_reads where wi_id = '2147346086' and status = 'ok') r,
       jsonb_array_elements(case when jsonb_typeof(r.notes) = 'array' then r.notes else '[]' end) e
 where e->>'note' ~* '\mNOK\M|norwegian kron' and e->>'note' ~* '(ticket|commit|invest)'
 limit 1;
insert into wi_fill_log (mandate_id, investor_name, field, old_value, new_value, source, wi_investor_id)
select m.id, m.investor_name, 'focus_checks.ticket', m.focus_checks->'ticket'->>'result', 'stated_other_currency: ' || n.note,
       'Reconciliation fix: Reitan ticket stated in NOK (13 Nov 2026, approved by research@taranis.net)', m.evidence->>'wi_investor_id'
  from wi_mandates m, reitan_nok n where m.id = 3178;
update wi_mandates m
   set focus_checks = coalesce(m.focus_checks, '{}'::jsonb) || jsonb_build_object('ticket', jsonb_build_object(
         'result', 'stated_other_currency', 'note', 'Stated in NOK: "' || n.note || '"', 'at', '2026-11-13', 'by', 'research@taranis.net'))
  from reitan_nok n where m.id = 3178;

-- 3. MacArthur
insert into wi_fill_log (mandate_id, investor_name, field, old_value, new_value, source, wi_investor_id)
select id, investor_name, 'tech_quote_older', evidence->>'tech_quote_older',
       '"The investor''s investment themes over the next 12-18 months include energy transition, artificial intelligence, digital infrastructure, blockchain, healthcare and longevity, security and defense, financial technology, and sustainability" (With Intelligence, May 2026; superseded by the Nov 2026 themes line, healthcare only)',
       'Reconciliation fix: Grok''s May quote kept as evidence only, Tech unchanged (13 Nov 2026, approved by research@taranis.net)', evidence->>'wi_investor_id'
  from wi_mandates where id = 3210;
update wi_mandates
   set evidence = coalesce(evidence, '{}'::jsonb) || jsonb_build_object('tech_quote_older',
         '"The investor''s investment themes over the next 12-18 months include energy transition, artificial intelligence, digital infrastructure, blockchain, healthcare and longevity, security and defense, financial technology, and sustainability" (With Intelligence, May 2026; superseded by the Nov 2026 themes line, healthcare only)')
 where id = 3210;
commit;
select id, open_to_emerging_managers, focus_checks->'ticket' ticket_mark, evidence ? 'tech_quote_older' older_quote, is_tech_investor
  from wi_mandates where id in (3223, 3178, 3210) order by id;
-- UNDO: update wi_mandates m set open_to_emerging_managers = b.open_to_emerging_managers, focus_checks = b.focus_checks,
--   evidence = b.evidence from wi_mandates_backup_20261113_recon b where b.id = m.id;
