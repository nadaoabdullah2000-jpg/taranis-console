-- Hedge fund rule + data fixes + duplicate merge, 5 Nov 2026.
-- ONE transaction: it runs whole or not at all. Nothing is deleted.
--
-- RULE. An allocator can only be Matched or Approved when it is CONFIRMED to
-- invest in hedge funds. Evidence comes from each investor's full 24-month
-- With Intelligence history (hf_wi_cm, read 5 Nov with working paging) and is
-- frozen per row in hf_audit_final:
--   confirmed  = a hedge fund commitment / allocation / RFP / search in the last
--                24 months (With Intelligence asset class "Hedge Funds", or a
--                named hedge fund manager or vehicle), or a plan that names
--                hedge funds or a hedge fund strategy (decisions 2b, 2c);
--                or profile lists Hedge Funds AND (a hedge fund intention, the
--                investor's own alert about hedge funds, or a stated programme)
--   unconfirmed       review: not matched, not approved, score capped at 74%
--   manager_allocates investment manager kept for review (QRT, Fulcrum,
--                     SteelPeak, Stable; decision 2a)
--   no                profile lists asset classes without Hedge Funds and no
--                     hedge fund evidence: Rejected
--   not_allocator     not an investor (Gantry Search, Mercer): Rejected
-- "Alternative" alone never counts. Funds of hedge funds / OCIOs (Aurum, ABS,
-- Antarctica, HighVista, Accumulus, ITERAM, Pluscios, Xponance, CMT) are
-- allocators under the normal rule. Verdicts a person set (verdict_source =
-- 'manual') are never moved to Rejected. Texas TRS row 533 stays approved.
--
-- Every change is logged in wi_fill_log (source 'HF rule 5 Nov 2026' or
-- 'Data fix 5 Nov 2026' or 'Merge 5 Nov 2026'). Full copies of both tables
-- before the change: wi_mandates_backup_20261105 and
-- iconnections_import_rows_backup_20261105. ROLLBACK at the end of the file.

begin;

-- ---------------------------------------------------------------------------
-- 0. Backups (whole tables) and the evidence snapshot
-- ---------------------------------------------------------------------------
create table wi_mandates_backup_20261105 as select * from wi_mandates;
create table iconnections_import_rows_backup_20261105 as select * from iconnections_import_rows;
create table fn_backup_20261105 as
  select p.oid::regprocedure::text as fn, pg_get_functiondef(p.oid) as def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname in ('console_search_suggest', 'console_search_company', 'iconn_match_rows', 'wi_fill_from_reads');

create table hf_audit_final as select id, cls4 as cls, ev4 as evidence from hf_audit_v4;
alter table hf_audit_final add primary key (id);

-- ---------------------------------------------------------------------------
-- 1. Columns and the 'merged' status
-- ---------------------------------------------------------------------------
alter table wi_mandates add column if not exists hf_evidence text;
alter table wi_mandates add column if not exists hf_evidence_note text;
alter table wi_mandates add column if not exists hf_evidence_source text;   -- 'audit 5 Nov 2026' | 'person: <email>' | 'auto' | 'inherited'
alter table wi_mandates add column if not exists hf_checked_at timestamptz;
alter table wi_mandates add column if not exists hf_held_verdict text;      -- matched verdict held back until confirmed
alter table wi_mandates add column if not exists hf_held_score numeric;
alter table wi_mandates add column if not exists merged_into bigint;
alter table wi_mandates drop constraint wi_mandates_validation_status_check;
alter table wi_mandates add constraint wi_mandates_validation_status_check
  check (validation_status = any (array['pending', 'confirmed', 'not_an_allocator', 'merged']));

-- ---------------------------------------------------------------------------
-- 2. Data fixes: headline fragments, wrong row, types, countries
-- ---------------------------------------------------------------------------
create temp table fx (id bigint primary key, name text, wi_id text, typ text, ctry text, kind text, note text);
insert into fx values
  -- real investor named by the alert, linked to its With Intelligence profile
  (53,   'Prairie Wealth Advisors', '2147354958', 'Wealth Manager', 'US', 'link', 'Headline "CIO" was the firm''s CIO; alert is from Prairie Wealth Advisors'),
  (148,  'Kern County (CA) Employees Retirement Association (KCERA)', '3124', 'Public D.B.', 'US', 'link', 'Headline "Kern County": the county pension (KCERA)'),
  (256,  'Wealthspire Advisors', '2147325856', 'Wealth Manager', 'US', 'link', 'Wealthspire: the wealth manager profile (Wealthspire Advisors)'),
  (492,  'Colorado Public Employees Retirement Association (PERA)', '1541', 'Public D.B.', 'US', 'link', 'Row carried Colorado PERA''s alert under Texas TRS; reassigned to Colorado PERA'),
  (2117, 'Diversified LLC', '2147354626', 'Wealth Manager', 'US', 'link', 'Headline "Diversified" = the $3.8bn Wilmington wealth manager, Diversified LLC on With Intelligence'),
  (2124, 'Diversified LLC', '2147354626', 'Wealth Manager', 'US', 'link', 'Headline "Diversified" = Diversified LLC on With Intelligence'),
  (2156, 'Diversified LLC', '2147354626', 'Wealth Manager', 'US', 'link', 'Headline "Diversified" = Diversified LLC on With Intelligence'),
  (2186, 'Diversified LLC', '2147354626', 'Wealth Manager', 'US', 'link', 'Headline "Diversified" = Diversified LLC on With Intelligence'),
  (2313, 'Stable Asset Management (SAM)', '2147328180', 'Manager of Managers', 'US', 'link', 'Headline "Stable bolsters top seeding role" = Stable Asset Management'),
  (2673, 'Stable Asset Management (SAM)', '2147328180', 'Manager of Managers', 'US', 'link', 'Headline "Stable bolsters top seeding role" = Stable Asset Management'),
  (2684, 'Stable Asset Management (SAM)', '2147328180', 'Manager of Managers', 'US', 'link', 'Headline "Stable bolsters top seeding role" = Stable Asset Management'),
  (2325, 'Albacore doo', '2147353790', 'Multi-Family Office', 'SI', 'link', 'Headline "Slovenian multi-family office" = Albacore doo (Slovenian MFO looking at FoHFs); inferred, check'),
  (2329, 'Albacore doo', '2147353790', 'Multi-Family Office', 'SI', 'link', 'Headline "Slovenian multi-family office" = Albacore doo (Slovenian MFO looking at FoHFs); inferred, check'),
  (2532, 'Vicctus Multi Family Office', '2147355543', 'Multi-Family Office', 'PE', 'link', 'Vicctus MFO linked to its With Intelligence profile'),
  (2533, 'Arizona Public Safety Personnel Retirement System (PSPRS)', '-1783152060', 'Public D.B.', 'US', 'link', 'Headline "Arizona Public" = Arizona PSPRS'),
  (2632, 'Arizona Public Safety Personnel Retirement System (PSPRS)', '-1783152060', 'Public D.B.', 'US', 'link', 'Headline "Arizona Public" = Arizona PSPRS'),
  (2657, 'Arizona Public Safety Personnel Retirement System (PSPRS)', '-1783152060', 'Public D.B.', 'US', 'link', 'Headline "Arizona Public" = Arizona PSPRS'),
  -- the alert does not name the investor
  (484,  'Unidentified: Ohio pension (alt risk managers a top priority)', null, 'Public D.B.', 'US', 'unidentified', 'Alert says only "Ohio"; could be OP&F, STRS Ohio or OPERS'),
  (149,  'Unidentified: British Virgin Islands wealth manager', null, 'Wealth Manager', 'VG', 'unidentified', 'Alert does not name the wealth manager'),
  (2175, 'Unidentified: firm simplifying HF subscriptions', null, null, 'US', 'unidentified', 'Headline "Firm aims to simplify HF subscriptions" names no firm'),
  (2185, 'Unidentified: firm simplifying HF subscriptions', null, null, 'US', 'unidentified', 'Headline "Firm aims to simplify HF subscriptions" names no firm'),
  (2314, 'Unidentified: HF backers', null, null, null, 'unidentified', 'Headline "HF backers" names no investor'),
  (2674, 'Unidentified: HF backers', null, null, null, 'unidentified', 'Headline "HF backers" names no investor'),
  (2685, 'Unidentified: HF backers', null, null, null, 'unidentified', 'Headline "HF backers" names no investor'),
  (2534, 'Unidentified: Peruvian MFO (infrastructure)', null, 'Multi-Family Office', 'PE', 'unidentified', 'Alert names no MFO (possibly Vicctus, same alert, not stated)'),
  (2633, 'Unidentified: Peruvian MFO (infrastructure)', null, 'Multi-Family Office', 'PE', 'unidentified', 'Alert names no MFO (possibly Vicctus, same alert, not stated)'),
  (2536, 'Unidentified: Peruvian MFO (mezzanine debt)', null, 'Multi-Family Office', 'PE', 'unidentified', 'Alert names no MFO (possibly Vicctus, same alert, not stated)'),
  (2634, 'Unidentified: Peruvian MFO (mezzanine debt)', null, 'Multi-Family Office', 'PE', 'unidentified', 'Alert names no MFO (possibly Vicctus, same alert, not stated)'),
  (2773, 'Unidentified: Peruvian MFO (hedge funds)', null, 'Multi-Family Office', 'PE', 'unidentified', 'Alert names no MFO'),
  -- not investors / type only
  (2174, null, null, null, null, 'not_allocator', 'Executive-search firm, not an allocator'),
  (2184, null, null, null, null, 'not_allocator', 'Executive-search firm, not an allocator'),
  (1264, null, null, null, null, 'not_allocator', 'Investment consultant, not an allocator'),
  (399,  null, null, 'Corporate D.B.', null, 'type', 'GE Pension Trust: corporate pension'),
  (416,  null, null, 'Wealth Manager', null, 'type', 'NewEdge: RIA');

-- log every changed field
insert into wi_fill_log (mandate_id, investor_name, field, old_value, new_value, source, wi_investor_id)
select m.id, coalesce(f.name, m.investor_name), v.field, v.o, v.nv, 'Data fix 5 Nov 2026: ' || f.note, f.wi_id
  from fx f join wi_mandates m on m.id = f.id,
  lateral (values
    ('Corrected: Name', m.investor_name, f.name),
    ('Link fixed: Investor page', m.view_investor_url, case when f.wi_id is not null then 'https://platform.withintelligence.com/explore/investors/' || f.wi_id end),
    ('Corrected: Investor type', m.investor_type, f.typ),
    ('Corrected: Country', m.investor_country, f.ctry)) v(field, o, nv)
 where v.nv is not null and v.o is distinct from v.nv;

update wi_mandates m set
  investor_name     = coalesce(f.name, m.investor_name),
  organization_name = case when f.kind = 'link' and m.id <> 492 then f.name else m.organization_name end,
  view_investor_url = case when f.wi_id is not null then 'https://platform.withintelligence.com/explore/investors/' || f.wi_id
                           when f.kind = 'unidentified' then null else m.view_investor_url end,
  investor_type     = coalesce(f.typ, case when f.kind = 'not_allocator' then m.investor_type end, m.investor_type),
  investor_country  = coalesce(f.ctry, m.investor_country),
  evidence          = case when f.wi_id is null then m.evidence
                           else (case when jsonb_typeof(m.evidence) = 'object' then m.evidence else '{}'::jsonb end) || jsonb_build_object('wi_investor_id', f.wi_id) end,
  wi_match_status   = case f.kind when 'link' then 'Fixed' when 'unidentified' then 'Unidentified' else m.wi_match_status end,
  wi_match_note     = case when f.kind in ('link', 'unidentified') then f.note else m.wi_match_note end,
  wi_match_checked_at = now()
  from fx f where f.id = m.id;

-- organisation names that are headline fragments on the Diversified LLC rows
with u as (
  update wi_mandates set organization_name = 'Diversified LLC'
   where id in (2125, 2157, 2187) and organization_name is distinct from 'Diversified LLC'
  returning id, investor_name)
insert into wi_fill_log (mandate_id, investor_name, field, old_value, new_value, source)
select u.id, u.investor_name, 'Corrected: Organisation', b.organization_name, 'Diversified LLC', 'Data fix 5 Nov 2026: headline fragment'
  from u join wi_mandates_backup_20261105 b on b.id = u.id;

-- investor types written as With Intelligence writes them (unambiguous labels, every row)
create temp table tmap (old text primary key, new text);
insert into tmap values ('MFO', 'Multi-Family Office'), ('multi-family office', 'Multi-Family Office'),
  ('family office', 'Single-Family Office'), ('single-family office', 'Single-Family Office'),
  ('wealth manager', 'Wealth Manager'), ('wealth management', 'Wealth Manager'), ('RIA', 'Wealth Manager'),
  ('fund_of_funds', 'Fund of Funds'), ('null', null);
with u as (
  update wi_mandates m set investor_type = t.new from tmap t
   where m.investor_type = t.old and coalesce(m.validation_status, '') <> 'pending'
  returning m.id, m.investor_name, t.old, t.new)
insert into wi_fill_log (mandate_id, investor_name, field, old_value, new_value, source)
select id, investor_name, 'Corrected: Investor type', old, new, 'Data fix 5 Nov 2026: With Intelligence label' from u;

-- ---------------------------------------------------------------------------
-- 3. Hedge fund labels for the fixed rows (overrides on the frozen audit)
-- ---------------------------------------------------------------------------
update hf_audit_final set cls = 'confirmed', evidence = 'Confirmed by your decision (5 Nov). ' || evidence
 where id in (select id from wi_mandates where investor_name ~ 'University of Southern California');
update hf_audit_final set evidence = evidence || ' | Note: reduced allocation'
 where id in (select id from wi_mandates where investor_name ~ 'Retiree Health Care Trust Fund \(RHCTF\)');
-- rows now linked to an investor that is already audited take that investor's class
update hf_audit_final f set cls = s.cls, evidence = 'Linked 5 Nov to ' || fx.name || '. ' || s.evidence
  from fx, lateral (select a.cls, a.evidence from hf_audit_final a join hf_audit_v2 h on h.id = a.id
                     where h.wi_id = fx.wi_id and a.id not in (select id from fx)
                     order by (a.cls = 'confirmed') desc, a.id limit 1) s
 where fx.id = f.id and fx.kind = 'link';
-- newly read investors (no other audited row)
update hf_audit_final set cls = 'confirmed', evidence = 'Prairie Wealth Advisors: hedge fund mandate on With Intelligence; CIO building a long/short, market-neutral, merger-arbitrage line-up (5 Aug 2026)' where id = 53;
update hf_audit_final set cls = 'confirmed', evidence = 'Vicctus Multi Family Office: profile lists Hedge Funds; hedge fund mandate on With Intelligence; "considering increasing its use of hedge funds" (3 Nov 2026)' where id = 2532;
update hf_audit_final set cls = 'unconfirmed', evidence = 'Colorado PERA: profile lists Hedge Funds; no hedge fund commitment, search or plan in 24 months (50 of 95 records read)' where id = 492;
update hf_audit_final set cls = 'manager_allocates', evidence = 'Stable Asset Management: Manager of Managers that seeds hedge fund managers; kept for review like other managers (decision 2a)' where id in (2313, 2673, 2684);
update hf_audit_final f set cls = 'unconfirmed', evidence = 'Unidentified: ' || fx.note from fx where fx.id = f.id and fx.kind = 'unidentified';
update hf_audit_final f set cls = 'not_allocator', evidence = fx.note from fx where fx.id = f.id and fx.kind = 'not_allocator';
insert into hf_audit_final (id, cls, evidence)
select fx.id, 'not_allocator', fx.note from fx where fx.kind = 'not_allocator' on conflict (id) do nothing;

-- write the labels (all audited rows)
with u as (
  update wi_mandates m set hf_evidence = f.cls, hf_evidence_note = f.evidence,
         hf_evidence_source = 'audit 5 Nov 2026', hf_checked_at = now()
    from hf_audit_final f where f.id = m.id
  returning m.id, m.investor_name, f.cls)
insert into wi_fill_log (mandate_id, investor_name, field, old_value, new_value, source)
select id, investor_name, 'Hedge fund evidence', null, cls, 'HF rule 5 Nov 2026' from u;
update wi_mandates set hf_evidence_source = 'person: kept approved until reviewed (instruction 5 Nov 2026)' where id = 533;

-- ---------------------------------------------------------------------------
-- 4. Duplicates: one row per investor per alert, all evidence kept
-- ---------------------------------------------------------------------------
create temp table dup as
with g as (
  select id, source_message_id, lower(btrim(investor_name)) k,
         row_number() over (partition by source_message_id, lower(btrim(investor_name))
           order by (approved_at is not null) desc, (verdict_source = 'manual') desc,
                    (coalesce(new_qualification, qualification) = 'matched') desc,
                    new_fit_score desc nulls last, id) rn,
         count(*) over (partition by source_message_id, lower(btrim(investor_name))) n
    from wi_mandates
   where coalesce(validation_status, '') <> 'pending' and source_message_id is not null and coalesce(btrim(investor_name), '') <> '')
select d.id, k.id as keeper
  from g d join g k on k.source_message_id = d.source_message_id and k.k = d.k and k.rn = 1
 where d.n > 1 and d.rn > 1;

-- keeper carries every merged row's text and links
update wi_mandates k set
  evidence = (case when jsonb_typeof(k.evidence) = 'object' then k.evidence else '{}'::jsonb end)
             || jsonb_build_object('merged_rows', x.rows),
  intention_summary = concat_ws(' • ', k.intention_summary, nullif(x.extra, ''))
  from (select d.keeper,
               jsonb_agg(jsonb_build_object('id', m.id, 'summary', m.intention_summary, 'tag', m.investor_tag,
                   'intention_url', m.view_intention_url, 'article_url', m.view_article_url,
                   'verdict', coalesce(m.new_qualification, m.qualification), 'score', m.new_fit_score,
                   'approved_at', m.approved_at, 'approved_by', m.approved_by) order by m.id) as rows,
               (select string_agg(distinct s, ' • ') from wi_mandates m2 join dup d2 on d2.id = m2.id,
                  lateral (select btrim(m2.intention_summary) s) z
                 where d2.keeper = d.keeper and s <> '' and s is distinct from (select btrim(intention_summary) from wi_mandates where id = d.keeper)) as extra
          from dup d join wi_mandates m on m.id = d.id group by d.keeper) x
 where x.keeper = k.id;

insert into wi_fill_log (mandate_id, investor_name, field, old_value, new_value, source)
select m.id, m.investor_name, 'Merged into row', coalesce(m.validation_status, ''), d.keeper::text, 'Merge 5 Nov 2026: same investor, same alert'
  from dup d join wi_mandates m on m.id = d.id;

update wi_mandates m set validation_status = 'merged', merged_into = d.keeper,
       hf_evidence = coalesce(k.hf_evidence, m.hf_evidence), hf_evidence_note = coalesce(k.hf_evidence_note, m.hf_evidence_note)
  from dup d join wi_mandates k on k.id = d.keeper where d.id = m.id;

-- I-Connections rows that pointed at a merged row now point at its keeper
update iconnections_import_rows r set matched_id = d.keeper from dup d where r.matched_id = d.id;

-- lists and search skip merged rows like pending ones
do $$
declare r record; d text;
begin
  for r in select fn, def from fn_backup_20261105 loop
    d := replace(replace(r.def, '<> ''pending''', 'not in (''pending'', ''merged'')'), '!= ''pending''', 'not in (''pending'', ''merged'')');
    if d <> r.def then execute d; end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 5. Status moves (logged first, then applied). Skips: merged rows, row 533,
--    and Rejected for verdicts a person set.
-- ---------------------------------------------------------------------------
create temp table hf_moves as
select m.id, m.investor_name, m.hf_evidence as cls, m.hf_evidence_note as evidence,
       m.qualification old_q, m.new_qualification old_nq, m.new_fit_score old_ns, m.fit_reason old_reason,
       m.approved_at old_approved_at, m.approved_by old_approved_by,
       case when m.hf_evidence in ('no', 'not_allocator') then 'rejected' else 'uncertain' end new_nq
  from wi_mandates m
 where m.hf_evidence_source = 'audit 5 Nov 2026' and coalesce(m.validation_status, '') <> 'merged' and m.id <> 533
   and ( (m.hf_evidence in ('no', 'not_allocator') and coalesce(m.new_qualification, '') <> 'rejected' and coalesce(m.verdict_source, '') <> 'manual')
      or (m.hf_evidence in ('unconfirmed', 'manager_allocates') and (m.new_qualification = 'matched' or m.approved_at is not null))
      or (m.wi_match_status = 'Unidentified' and coalesce(m.new_qualification, '') not in ('rejected', 'uncertain')) );

insert into wi_fill_log (mandate_id, investor_name, field, old_value, new_value, source)
select id, investor_name, 'Verdict (HF rule)', coalesce(old_nq, old_q) || ' ' || coalesce(old_ns::text, ''),
       new_nq || ' — ' || cls || ': ' || left(evidence, 300), 'HF rule 5 Nov 2026' from hf_moves
union all
select id, investor_name, 'Approval removed (HF rule)', old_approved_at::text || ' by ' || coalesce(old_approved_by, '?'), null, 'HF rule 5 Nov 2026'
  from hf_moves where old_approved_at is not null;

create table hf_rule_undo as select * from hf_moves;

update wi_mandates m set
  new_qualification = v.new_nq,
  qualification     = v.new_nq,
  new_fit_score     = case when v.new_nq = 'rejected' then 0 else least(coalesce(m.new_fit_score, 0.74), 0.74) end,
  fit_reason        = case v.cls
                        when 'no' then 'Does not invest in hedge funds: '
                        when 'not_allocator' then 'Not an allocator: '
                        when 'manager_allocates' then 'Investment manager, kept for review: '
                        else 'Hedge fund investing not confirmed: ' end || left(v.evidence, 300),
  approved_at = null, approved_by = null,
  verdict_set_at = now(),   -- lets the manual-verdict guard accept this one change
  hf_held_verdict = case when v.old_nq = 'matched' and v.new_nq = 'uncertain' then 'matched' end,
  hf_held_score   = case when v.old_nq = 'matched' and v.new_nq = 'uncertain' then v.old_ns end
  from hf_moves v where v.id = m.id;

-- ---------------------------------------------------------------------------
-- 6. The guard: no writer can set Matched or Approved without confirmed evidence.
--    Runs after mandate_guard_trg and wi_keep_manual_verdict (alphabetical).
-- ---------------------------------------------------------------------------
create or replace function hf_hard_rule() returns trigger language plpgsql as $$
declare inherited record;
begin
  if coalesce(new.validation_status, '') = 'merged' then return new; end if;
  if new.hf_evidence is null then
    -- same With Intelligence investor already labelled: inherit its label
    select hf_evidence, hf_evidence_note into inherited from wi_mandates
     where new.evidence ->> 'wi_investor_id' is not null and evidence ->> 'wi_investor_id' = new.evidence ->> 'wi_investor_id'
       and hf_evidence is not null and id is distinct from new.id
     order by (hf_evidence = 'confirmed') desc, hf_checked_at desc nulls last limit 1;
    if found then
      new.hf_evidence := inherited.hf_evidence; new.hf_evidence_note := inherited.hf_evidence_note;
      new.hf_evidence_source := 'inherited'; new.hf_checked_at := now();
    else
      new.hf_evidence := case when coalesce(new.investor_type, '') ~* '^(startup )?hedge fund( manager)?$|^hedge funds?$'
                              then 'not_allocator' else 'unconfirmed' end;
      new.hf_evidence_source := 'auto';
      new.hf_evidence_note := coalesce(new.hf_evidence_note, 'Not yet checked against With Intelligence');
    end if;
  end if;
  -- confirmed now, and a matched verdict was held back earlier: give it back
  if new.hf_evidence = 'confirmed' and new.hf_held_verdict = 'matched'
     and coalesce(new.new_qualification, '') <> 'rejected' and coalesce(new.verdict_source, '') <> 'manual' then
    new.new_qualification := 'matched'; new.qualification := 'matched';
    new.new_fit_score := coalesce(new.hf_held_score, new.new_fit_score);
    new.fit_reason := regexp_replace(coalesce(new.fit_reason, ''), '^Hedge fund investing not confirmed[.:] ', '');
    new.hf_held_verdict := null; new.hf_held_score := null;
  end if;
  if new.hf_evidence in ('no', 'not_allocator') and coalesce(new.verdict_source, '') <> 'manual' then
    new.new_qualification := 'rejected'; new.qualification := 'rejected'; new.new_fit_score := 0;
    new.approved_at := null; new.approved_by := null;
  elsif new.hf_evidence <> 'confirmed' and coalesce(new.hf_evidence_source, '') not like 'person:%' then
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

-- ---------------------------------------------------------------------------
-- 7. I-Connections rows show their allocator's current verdict and name
-- ---------------------------------------------------------------------------
update iconnections_import_rows r set matched_status = m.new_qualification, matched_fit = coalesce(m.new_fit_score, 0),
       matched_fit_reason = m.fit_reason, matched_name = m.investor_name
  from wi_mandates m
 where m.id = r.matched_id
   and (r.matched_status is distinct from m.new_qualification or r.matched_name is distinct from m.investor_name);

-- ---------------------------------------------------------------------------
-- 8. Saved check: anything Matched or Approved without confirmed evidence
-- ---------------------------------------------------------------------------
create or replace view hf_rule_check as
select m.id, m.investor_name, m.new_qualification, m.new_fit_score, m.approved_at, m.hf_evidence, m.hf_evidence_source, m.hf_evidence_note
  from wi_mandates m
 where coalesce(m.validation_status, '') not in ('pending', 'merged')
   and (m.new_qualification = 'matched' or m.approved_at is not null)
   and coalesce(m.hf_evidence, '') <> 'confirmed'
   and coalesce(m.hf_evidence_source, '') not like 'person:%';

commit;

-- ===========================================================================
-- ROLLBACK (run as one block in the Supabase SQL editor). Puts every row and
-- the four search functions back exactly as they were before this file.
--
--   begin;
--   drop trigger if exists zz_hf_hard_rule on wi_mandates;
--   alter table wi_mandates disable trigger user;
--   update wi_mandates m set
--     investor_name = b.investor_name, organization_name = b.organization_name, investor_type = b.investor_type,
--     investor_country = b.investor_country, view_investor_url = b.view_investor_url, evidence = b.evidence,
--     intention_summary = b.intention_summary, qualification = b.qualification, new_qualification = b.new_qualification,
--     new_fit_score = b.new_fit_score, fit_reason = b.fit_reason, approved_at = b.approved_at, approved_by = b.approved_by,
--     verdict_set_at = b.verdict_set_at, validation_status = b.validation_status, wi_match_status = b.wi_match_status,
--     wi_match_note = b.wi_match_note, wi_match_checked_at = b.wi_match_checked_at,
--     hf_evidence = null, hf_evidence_note = null, hf_evidence_source = null, hf_checked_at = null,
--     hf_held_verdict = null, hf_held_score = null, merged_into = null
--     from wi_mandates_backup_20261105 b where b.id = m.id;
--   alter table wi_mandates enable trigger user;
--   update iconnections_import_rows r set matched_id = b.matched_id, matched_status = b.matched_status,
--     matched_fit = b.matched_fit, matched_fit_reason = b.matched_fit_reason, matched_name = b.matched_name
--     from iconnections_import_rows_backup_20261105 b where b.run_id = r.run_id and b.row_no = r.row_no;
--   do $$ declare r record; begin for r in select def from fn_backup_20261105 loop execute r.def; end loop; end $$;
--   alter table wi_mandates drop constraint wi_mandates_validation_status_check;
--   alter table wi_mandates add constraint wi_mandates_validation_status_check
--     check (validation_status = any (array['pending', 'confirmed', 'not_an_allocator']));
--   commit;
-- (The new columns and the backup tables can stay; they are inert.)
-- ===========================================================================
