-- RLS proposal, 25 Nov 2026. NOT APPLIED: for review. Apply only after approval, as a Supabase migration.
--
-- What the database shows today (checked 25 Nov):
--   * 88 tables in public (and grok.wi_discovered) have row level security off.
--   * anon can read none of them (no grant), but EVERY signed-in user (role authenticated) can read AND
--     write all 88 through the REST API. That is the exposure to close.
--   * The console reads none of them. n8n reaches them through its Postgres credentials, which connect as
--     table owners and are not limited by RLS (taranis_bot gets an explicit policy in case a workflow uses it).
--   * grok_checked already has RLS on.
--
-- Part 1 (recommended now): RLS on for every one of them. Reversible, changes no data.
-- Part 2 (recommended now): the 11 live helper tables get a policy for the automation role only.
-- Part 3 (needs your separate approval; CLAUDE.md rule 3: no drops to remove data): instead of dropping the
--   stale backups and snapshots, move them to a schema the API does not serve ("archive"). Nothing is deleted;
--   the November backups stay where the repair files' UNDO statements expect them.
-- Part 4 (NOT recommended; only if you decide the data can go): DROP statements, commented out.
--
-- DRY TEST 26 Nov 2026 (applied inside a transaction, then rolled back; RLS state afterwards checked unchanged):
--   console, signed in as a console user: wi_mandates 2832, iconnections_import_runs 2, _rows 388, iconn_approved_links 23,
--     iconn_wi_rejections 2, preqin_import_rows 0, screening_params 1: identical before/after. Helper tables and backups
--     (never read by app.js): readable before (378 / 82 rows), 0 rows / denied after: the exposure this closes.
--   Grok gateway (grok_fn.* run as grok_reader): todo, missing_summary, schema_info, ro_query identical; discover_status
--     and discover_known EMPTY under the original proposal, identical once grok_reader_read (below) is added.
--   n8n (connects as postgres, BYPASSRLS): wi_hf_targets 378, wi_hf_reads 381, hf_probe 34, group_message_queue 2,
--     grok.wi_discovered 105: identical. taranis_bot could not be assumed from the test session; nothing connects as it.
-- UNDO (Part 1-2): alter table <t> disable row level security; drop policy automation_full on <t>;
--                  drop policy grok_reader_read on grok.wi_discovered;
-- UNDO (Part 3):   alter table archive.<t> set schema public;

begin;

-- Part 1 + 2: live helper tables

alter table public.group_lock enable row level security;
create policy automation_full on public.group_lock to taranis_bot using (true) with check (true);
alter table public.group_message_queue enable row level security;
create policy automation_full on public.group_message_queue to taranis_bot using (true) with check (true);
alter table public.hf_audit_final enable row level security;
create policy automation_full on public.hf_audit_final to taranis_bot using (true) with check (true);
alter table public.hf_conf_nd enable row level security;
create policy automation_full on public.hf_conf_nd to taranis_bot using (true) with check (true);
alter table public.hf_name_search enable row level security;
create policy automation_full on public.hf_name_search to taranis_bot using (true) with check (true);
alter table public.hf_probe enable row level security;
create policy automation_full on public.hf_probe to taranis_bot using (true) with check (true);
alter table public.hf_rule_undo enable row level security;
create policy automation_full on public.hf_rule_undo to taranis_bot using (true) with check (true);
alter table public.hf_wi_cm enable row level security;
create policy automation_full on public.hf_wi_cm to taranis_bot using (true) with check (true);
alter table public.wi_hf_reads enable row level security;
create policy automation_full on public.wi_hf_reads to taranis_bot using (true) with check (true);
alter table public.wi_hf_targets enable row level security;
create policy automation_full on public.wi_hf_targets to taranis_bot using (true) with check (true);
alter table public.wi_nolink_groups enable row level security;
create policy automation_full on public.wi_nolink_groups to taranis_bot using (true) with check (true);
alter table grok.wi_discovered enable row level security;
create policy automation_full on grok.wi_discovered to taranis_bot using (true) with check (true);
-- 26 Nov 2026 dry test: Grok's discover_status / discover_known run as grok_reader (security definer) and read this
-- table; without this policy they return nothing. With it their output is identical to today's.
create policy grok_reader_read on grok.wi_discovered for select to grok_reader using (true);

-- Part 1: backups and snapshots (77 tables): RLS on, no policy = no API access for anyone.
alter table public.report_leads_snap_20261008 enable row level security;
alter table public.wi_mandates_snap_20261007_hfn enable row level security;
alter table public.wi_mandates_snap_20261007_rule enable row level security;
alter table public.wi_mandates_snap_20261008_nonalloc enable row level security;
alter table public.wi_mandates_snap_20261008_report enable row level security;
alter table public.wi_mandates_snap_20261008_tech enable row level security;
alter table public.wi_mandates_snap_20261008_weak enable row level security;
alter table public.wi_mandates_snap_20261023_enrich enable row level security;
alter table public.wi_mandates_snap_20261023_loosen enable row level security;
alter table public.fn_backup_20261105 enable row level security;
alter table public.grok_checked_backup_20261110 enable row level security;
alter table public.grok_checked_backup_20261110_doubtful enable row level security;
alter table public.grok_checked_backup_20261110_notonwi enable row level security;
alter table public.grok_checked_backup_20261110_review enable row level security;
alter table public.grok_checked_backup_20261110_tswii enable row level security;
alter table public.grok_fn_backup_20261111 enable row level security;
alter table public.grok_fn_backup_20261111b enable row level security;
alter table public.grok_wi_discovered_backup_20261111_industries enable row level security;
alter table public.grok_wi_discovered_backup_20261112_region enable row level security;
alter table public.iconn_wi_lookup_backup_20261110_approved enable row level security;
alter table public.iconn_wi_lookup_backup_20261110_doubtful enable row level security;
alter table public.iconn_wi_lookup_backup_20261110_review enable row level security;
alter table public.iconnections_import_rows_backup_20261105 enable row level security;
alter table public.older_rule_backup_20261109 enable row level security;
alter table public.rescore_backup_20261109 enable row level security;
alter table public.rescore_backup_20261110 enable row level security;
alter table public.score_backup_20261106 enable row level security;
alter table public.snap_wi_mandates_20261012_names enable row level security;
alter table public.snap_wi_mandates_20261012_reasons enable row level security;
alter table public.snap_wi_mandates_20261012_restore enable row level security;
alter table public.snap_wi_mandates_20261012_wynnes enable row level security;
alter table public.weekly_snapshots_bak_20261008 enable row level security;
alter table public.wi_mandates_backup_20261105 enable row level security;
alter table public.wi_mandates_backup_20261105b enable row level security;
alter table public.wi_mandates_backup_20261109_news enable row level security;
alter table public.wi_mandates_backup_20261109_quilter enable row level security;
alter table public.wi_mandates_backup_20261109_rows enable row level security;
alter table public.wi_mandates_backup_20261110_restore enable row level security;
alter table public.wi_mandates_backup_20261110_review enable row level security;
alter table public.wi_mandates_backup_20261111_3047 enable row level security;
alter table public.wi_mandates_backup_20261111_3052 enable row level security;
alter table public.wi_mandates_backup_20261111_audit enable row level security;
alter table public.wi_mandates_backup_20261111_cais enable row level security;
alter table public.wi_mandates_backup_20261111_disc_fields enable row level security;
alter table public.wi_mandates_backup_20261111_disc_rescore enable row level security;
alter table public.wi_mandates_backup_20261111_equity_ls enable row level security;
alter table public.wi_mandates_backup_20261111_hfranch enable row level security;
alter table public.wi_mandates_backup_20261111_low_match enable row level security;
alter table public.wi_mandates_backup_20261111_lt enable row level security;
alter table public.wi_mandates_backup_20261111_matched_scores enable row level security;
alter table public.wi_mandates_backup_20261111_matchrule enable row level security;
alter table public.wi_mandates_backup_20261111_mgrnews enable row level security;
alter table public.wi_mandates_backup_20261111_seidor enable row level security;
alter table public.wi_mandates_backup_20261111_techrecheck enable row level security;
alter table public.wi_mandates_backup_20261111_techreset enable row level security;
alter table public.wi_mandates_backup_20261111_techreset2 enable row level security;
alter table public.wi_mandates_backup_20261111_themes enable row level security;
alter table public.wi_mandates_backup_20261111_themes2 enable row level security;
alter table public.wi_mandates_backup_20261111_themes_fill enable row level security;
alter table public.wi_mandates_backup_20261112_aum enable row level security;
alter table public.wi_mandates_backup_20261112_aum_b enable row level security;
alter table public.wi_mandates_backup_20261112_country enable row level security;
alter table public.wi_mandates_backup_20261112_kgi enable row level security;
alter table public.wi_mandates_backup_20261112_sweep enable row level security;
alter table public.wi_mandates_backup_20261112_tech_hf enable row level security;
alter table public.wi_mandates_backup_20261112_tier enable row level security;
alter table public.wi_mandates_backup_20261112_ubp_hf enable row level security;
alter table public.wi_mandates_backup_20261113_lstiers enable row level security;
alter table public.wi_mandates_backup_20261113_ndrescore enable row level security;
alter table public.wi_mandates_backup_20261113_recon enable row level security;
alter table public.wi_mandates_backup_20261117_kgi enable row level security;
alter table public.wi_mandates_backup_20261117_okabena enable row level security;
alter table public.wi_mandates_backup_20261117_pastls enable row level security;
alter table public.wi_mandates_backup_20261117_score enable row level security;
alter table public.wi_mandates_backup_20261118_dupes enable row level security;
alter table public.wi_mandates_backup_20261118_opps enable row level security;
alter table public.wi_mandates_backup_20261119_ls enable row level security;

-- Belt and braces: signed-in API users never needed these.
revoke all on public.report_leads_snap_20261008, public.wi_mandates_snap_20261007_hfn, public.wi_mandates_snap_20261007_rule, public.wi_mandates_snap_20261008_nonalloc, public.wi_mandates_snap_20261008_report, public.wi_mandates_snap_20261008_tech, public.wi_mandates_snap_20261008_weak, public.wi_mandates_snap_20261023_enrich, public.wi_mandates_snap_20261023_loosen, public.fn_backup_20261105, public.grok_checked_backup_20261110, public.grok_checked_backup_20261110_doubtful, public.grok_checked_backup_20261110_notonwi, public.grok_checked_backup_20261110_review, public.grok_checked_backup_20261110_tswii, public.grok_fn_backup_20261111, public.grok_fn_backup_20261111b, public.grok_wi_discovered_backup_20261111_industries, public.grok_wi_discovered_backup_20261112_region, public.iconn_wi_lookup_backup_20261110_approved, public.iconn_wi_lookup_backup_20261110_doubtful, public.iconn_wi_lookup_backup_20261110_review, public.iconnections_import_rows_backup_20261105, public.older_rule_backup_20261109, public.rescore_backup_20261109, public.rescore_backup_20261110, public.score_backup_20261106, public.snap_wi_mandates_20261012_names, public.snap_wi_mandates_20261012_reasons, public.snap_wi_mandates_20261012_restore, public.snap_wi_mandates_20261012_wynnes, public.weekly_snapshots_bak_20261008, public.wi_mandates_backup_20261105, public.wi_mandates_backup_20261105b, public.wi_mandates_backup_20261109_news, public.wi_mandates_backup_20261109_quilter, public.wi_mandates_backup_20261109_rows, public.wi_mandates_backup_20261110_restore, public.wi_mandates_backup_20261110_review, public.wi_mandates_backup_20261111_3047, public.wi_mandates_backup_20261111_3052, public.wi_mandates_backup_20261111_audit, public.wi_mandates_backup_20261111_cais, public.wi_mandates_backup_20261111_disc_fields, public.wi_mandates_backup_20261111_disc_rescore, public.wi_mandates_backup_20261111_equity_ls, public.wi_mandates_backup_20261111_hfranch, public.wi_mandates_backup_20261111_low_match, public.wi_mandates_backup_20261111_lt, public.wi_mandates_backup_20261111_matched_scores, public.wi_mandates_backup_20261111_matchrule, public.wi_mandates_backup_20261111_mgrnews, public.wi_mandates_backup_20261111_seidor, public.wi_mandates_backup_20261111_techrecheck, public.wi_mandates_backup_20261111_techreset, public.wi_mandates_backup_20261111_techreset2, public.wi_mandates_backup_20261111_themes, public.wi_mandates_backup_20261111_themes2, public.wi_mandates_backup_20261111_themes_fill, public.wi_mandates_backup_20261112_aum, public.wi_mandates_backup_20261112_aum_b, public.wi_mandates_backup_20261112_country, public.wi_mandates_backup_20261112_kgi, public.wi_mandates_backup_20261112_sweep, public.wi_mandates_backup_20261112_tech_hf, public.wi_mandates_backup_20261112_tier, public.wi_mandates_backup_20261112_ubp_hf, public.wi_mandates_backup_20261113_lstiers, public.wi_mandates_backup_20261113_ndrescore, public.wi_mandates_backup_20261113_recon, public.wi_mandates_backup_20261117_kgi, public.wi_mandates_backup_20261117_okabena, public.wi_mandates_backup_20261117_pastls, public.wi_mandates_backup_20261117_score, public.wi_mandates_backup_20261118_dupes, public.wi_mandates_backup_20261118_opps, public.wi_mandates_backup_20261119_ls from anon, authenticated;

commit;

-- Part 3 (separate approval): move snapshots and backups older than 11 Nov (35 tables) out of the API's reach.
-- The 42 backups from 11-19 Nov stay in public (RLS on) because recent repairs' UNDO statements name them.
-- create schema if not exists archive;
-- revoke all on schema archive from anon, authenticated;
-- alter table public.report_leads_snap_20261008 set schema archive;
-- alter table public.wi_mandates_snap_20261007_hfn set schema archive;
-- alter table public.wi_mandates_snap_20261007_rule set schema archive;
-- alter table public.wi_mandates_snap_20261008_nonalloc set schema archive;
-- alter table public.wi_mandates_snap_20261008_report set schema archive;
-- alter table public.wi_mandates_snap_20261008_tech set schema archive;
-- alter table public.wi_mandates_snap_20261008_weak set schema archive;
-- alter table public.wi_mandates_snap_20261023_enrich set schema archive;
-- alter table public.wi_mandates_snap_20261023_loosen set schema archive;
-- alter table public.fn_backup_20261105 set schema archive;
-- alter table public.grok_checked_backup_20261110 set schema archive;
-- alter table public.grok_checked_backup_20261110_doubtful set schema archive;
-- alter table public.grok_checked_backup_20261110_notonwi set schema archive;
-- alter table public.grok_checked_backup_20261110_review set schema archive;
-- alter table public.grok_checked_backup_20261110_tswii set schema archive;
-- alter table public.iconn_wi_lookup_backup_20261110_approved set schema archive;
-- alter table public.iconn_wi_lookup_backup_20261110_doubtful set schema archive;
-- alter table public.iconn_wi_lookup_backup_20261110_review set schema archive;
-- alter table public.iconnections_import_rows_backup_20261105 set schema archive;
-- alter table public.older_rule_backup_20261109 set schema archive;
-- alter table public.rescore_backup_20261109 set schema archive;
-- alter table public.rescore_backup_20261110 set schema archive;
-- alter table public.score_backup_20261106 set schema archive;
-- alter table public.snap_wi_mandates_20261012_names set schema archive;
-- alter table public.snap_wi_mandates_20261012_reasons set schema archive;
-- alter table public.snap_wi_mandates_20261012_restore set schema archive;
-- alter table public.snap_wi_mandates_20261012_wynnes set schema archive;
-- alter table public.weekly_snapshots_bak_20261008 set schema archive;
-- alter table public.wi_mandates_backup_20261105 set schema archive;
-- alter table public.wi_mandates_backup_20261105b set schema archive;
-- alter table public.wi_mandates_backup_20261109_news set schema archive;
-- alter table public.wi_mandates_backup_20261109_quilter set schema archive;
-- alter table public.wi_mandates_backup_20261109_rows set schema archive;
-- alter table public.wi_mandates_backup_20261110_restore set schema archive;
-- alter table public.wi_mandates_backup_20261110_review set schema archive;

-- Part 4 (not recommended): permanent removal. Each line deletes a backup for good.
-- drop table public.report_leads_snap_20261008;
-- drop table public.wi_mandates_snap_20261007_hfn;
-- drop table public.wi_mandates_snap_20261007_rule;
-- drop table public.wi_mandates_snap_20261008_nonalloc;
-- drop table public.wi_mandates_snap_20261008_report;
-- drop table public.wi_mandates_snap_20261008_tech;
-- drop table public.wi_mandates_snap_20261008_weak;
-- drop table public.wi_mandates_snap_20261023_enrich;
-- drop table public.wi_mandates_snap_20261023_loosen;
-- drop table public.fn_backup_20261105;
-- drop table public.grok_checked_backup_20261110;
-- drop table public.grok_checked_backup_20261110_doubtful;
-- drop table public.grok_checked_backup_20261110_notonwi;
-- drop table public.grok_checked_backup_20261110_review;
-- drop table public.grok_checked_backup_20261110_tswii;
-- drop table public.iconn_wi_lookup_backup_20261110_approved;
-- drop table public.iconn_wi_lookup_backup_20261110_doubtful;
-- drop table public.iconn_wi_lookup_backup_20261110_review;
-- drop table public.iconnections_import_rows_backup_20261105;
-- drop table public.older_rule_backup_20261109;
-- drop table public.rescore_backup_20261109;
-- drop table public.rescore_backup_20261110;
-- drop table public.score_backup_20261106;
-- drop table public.snap_wi_mandates_20261012_names;
-- drop table public.snap_wi_mandates_20261012_reasons;
-- drop table public.snap_wi_mandates_20261012_restore;
-- drop table public.snap_wi_mandates_20261012_wynnes;
-- drop table public.weekly_snapshots_bak_20261008;
-- drop table public.wi_mandates_backup_20261105;
-- drop table public.wi_mandates_backup_20261105b;
-- drop table public.wi_mandates_backup_20261109_news;
-- drop table public.wi_mandates_backup_20261109_quilter;
-- drop table public.wi_mandates_backup_20261109_rows;
-- drop table public.wi_mandates_backup_20261110_restore;
-- drop table public.wi_mandates_backup_20261110_review;
