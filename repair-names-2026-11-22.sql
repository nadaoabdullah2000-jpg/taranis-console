-- repair-names-2026-11-22.sql   DRY RUN, NOT APPLIED. Needs the user's approval.
-- 100 rows whose investor name is a headline fragment ("DL Family Office plots", "Firethorn Wealth looking at...")
-- get the name the new WI 01 rule reads (cut at the first lower-case headline verb). organization_name follows when it
-- held the same fragment. Not touched: 11 manual verdicts, 31 descriptions ("Former Morgan Stanley senior PM",
-- "New CIO", ...) that are not firm names and could fold different investors together. Only rows whose name is still
-- the planned old name are changed. Effect on Opportunities: 10 cards fold together (see the dry-run workbook).
BEGIN;
CREATE TEMP TABLE rn(id bigint PRIMARY KEY, old_name text, new_name text) ON COMMIT DROP;
INSERT INTO rn VALUES
 (1093, 'Invesco biz strategist readies global equity', 'Invesco biz strategist'),
 (1161, 'JNE Partners readies second credit opps', 'JNE Partners'),
 (1203, 'Gallagher UK lands Aegon investment pro', 'Gallagher UK'),
 (1212, 'Gallagher UK lands Aegon investment pro', 'Gallagher UK'),
 (1246, 'Gallagher UK lands Aegon investment pro', 'Gallagher UK'),
 (1299, 'JNE Partners readies second credit opps', 'JNE Partners'),
 (1434, 'Man Group recruits long', 'Man Group'),
 (1438, 'Man Group recruits long', 'Man Group'),
 (1469, 'Utah duo plots global equities HF', 'Utah duo'),
 (1641, 'Ziff Brothers alumâs Sunriver shuttering after', 'Ziff Brothers alumâs Sunriver'),
 (1686, 'FengHe sees $6bn asset surge amid', 'FengHe'),
 (1701, 'Clarim Holdings eyeing secondaries', 'Clarim Holdings'),
 (1719, 'Capital Group PM plots first fundraise', 'Capital Group PM'),
 (1736, 'RBC Brewin Dolphin favors core', 'RBC Brewin Dolphin'),
 (1753, 'Capital Group PM plots first fundraise', 'Capital Group PM'),
 (1761, 'RBC Brewin Dolphin favors core', 'RBC Brewin Dolphin'),
 (1774, 'RBC Brewin Dolphin favors core', 'RBC Brewin Dolphin'),
 (1794, 'Capital Group PM plots first fundraise', 'Capital Group PM'),
 (1872, 'New Holland plots commodities carve', 'New Holland'),
 (1884, 'New Holland plots commodities carve', 'New Holland'),
 (1888, 'New Holland plots commodities carve', 'New Holland'),
 (1955, 'Dubai MFO scouts buyout funds', 'Dubai MFO'),
 (1970, 'Dubai MFO scouts buyout funds', 'Dubai MFO'),
 (1979, 'Dubai MFO scouts buyout funds', 'Dubai MFO'),
 (2017, 'LMR recruits Hartree power duo in', 'LMR'),
 (2023, 'Julius Baer clients favor growth PE', 'Julius Baer clients'),
 (2030, 'Julius Baer clients favor growth PE', 'Julius Baer clients'),
 (2037, 'Julius Baer clients favor growth PE', 'Julius Baer clients'),
 (2060, 'RIA Dunbar Associates plots l/s equity', 'RIA Dunbar Associates'),
 (2063, 'Prop shop DRW closes l/s equity', 'Prop shop DRW'),
 (2108, 'RIA Dunbar Associates plots l/s equity', 'RIA Dunbar Associates'),
 (2111, 'Prop shop DRW closes l/s equity', 'Prop shop DRW'),
 (2150, 'Optiver duo''s startup AI HF plots', 'Optiver duo''s startup AI HF'),
 (2179, 'Optiver duo''s startup AI HF plots', 'Optiver duo''s startup AI HF'),
 (2194, 'Optiver duo''s startup AI HF plots', 'Optiver duo''s startup AI HF'),
 (2232, 'Balyasny recruits ex', 'Balyasny'),
 (2278, 'Mast Hill Fund duo plot HF', 'Mast Hill Fund duo'),
 (2279, 'Mast Hill Fund duo plot HF', 'Mast Hill Fund duo'),
 (2302, 'Rob Arnott’s Syzygy plots hedge fund', 'Rob Arnott’s Syzygy'),
 (2371, 'BFAM, banking vets prep multi-PM', 'BFAM'),
 (2372, 'IT veterans prep tech-focused systematic HF', 'IT veterans'),
 (2377, 'IT veterans prep tech-focused systematic HF', 'IT veterans'),
 (2407, 'IT veterans prep tech-focused systematic HF', 'IT veterans'),
 (2416, 'Peruvian MFO favors European value-', 'Peruvian MFO'),
 (2435, 'Peruvian MFO favors European value-', 'Peruvian MFO'),
 (2448, 'VanEck readies fundraising push for long', 'VanEck'),
 (2467, 'VanEck readies fundraising push for long', 'VanEck'),
 (2522, 'Surging Bergen Park sees gains ahead', 'Surging Bergen Park'),
 (2543, 'Israeli fund selector keen on PE', 'Israeli fund selector'),
 (2544, 'Israel’s Altshuler Shaham keen', 'Israel’s Altshuler Shaham'),
 (2549, 'Israeli fund selector keen on PE', 'Israeli fund selector'),
 (2550, 'Israel’s Altshuler Shaham keen', 'Israel’s Altshuler Shaham'),
 (2560, 'Fortune Financial Strategies PM plots commodities', 'Fortune Financial Strategies PM'),
 (2594, 'Israeli fund selector keen on PE', 'Israeli fund selector'),
 (2595, 'Israel’s Altshuler Shaham keen', 'Israel’s Altshuler Shaham'),
 (2603, 'Fortune Financial Strategies PM plots commodities', 'Fortune Financial Strategies PM'),
 (2619, 'Fortune Financial Strategies PM plots commodities', 'Fortune Financial Strategies PM'),
 (2652, 'Surging Bergen Park sees gains ahead', 'Surging Bergen Park'),
 (2668, 'BFAM, banking vets prep multi-PM', 'BFAM'),
 (2702, 'Compound Planning eyeing real estate strats', 'Compound Planning'),
 (2709, 'Compound Planning eyeing real estate strats', 'Compound Planning'),
 (2711, 'Compound Planning eyeing real estate strats', 'Compound Planning'),
 (2978, 'Cornerstone Alternatives keen on traditional infra', 'Cornerstone Alternatives'),
 (3017, 'Cornerstone Alternatives keen on traditional infra', 'Cornerstone Alternatives'),
 (3019, 'Banque Richelieu Monaco interested in US', 'Banque Richelieu Monaco'),
 (3032, 'Banque Richelieu Monaco interested in US', 'Banque Richelieu Monaco'),
 (3044, 'Banque Richelieu Monaco interested in US', 'Banque Richelieu Monaco'),
 (3071, 'Alpha Wave investment director plots l/s', 'Alpha Wave investment director'),
 (3073, 'Millennium recruits ex', 'Millennium'),
 (3074, 'Firethorn Wealth eyeing niche private credit', 'Firethorn Wealth'),
 (3076, 'Chequers interested in AI', 'Chequers'),
 (3077, 'Firethorn Wealth eyeing niche private credit', 'Firethorn Wealth'),
 (3256, 'MFO Farro Capital keen on logistics', 'MFO Farro Capital'),
 (3257, 'Farro Capital scouts mid', 'Farro Capital'),
 (3258, 'Chequers eyeing opportunistic credit', 'Chequers'),
 (3259, 'Firethorn Wealth looking at affordable housing', 'Firethorn Wealth'),
 (3273, 'Farro Capital scouts mid', 'Farro Capital'),
 (3274, 'Chequers eyeing opportunistic credit', 'Chequers'),
 (3275, 'Firethorn Wealth looking at affordable housing', 'Firethorn Wealth'),
 (3280, 'Chequers sees opportunities in secondaries', 'Chequers'),
 (3283, 'New MFO Opima plots concentrated equity', 'New MFO Opima'),
 (3298, 'Firethorn Wealth interested in energy', 'Firethorn Wealth'),
 (3302, 'Firethorn Wealth interested in energy', 'Firethorn Wealth'),
 (3330, 'New MFO Opima plots concentrated equity', 'New MFO Opima'),
 (3350, 'Farro Capital scouts mid', 'Farro Capital'),
 (3352, 'Firethorn Wealth looking at affordable housing', 'Firethorn Wealth'),
 (3395, 'Prosperity plots alternatives push after Focus', 'Prosperity'),
 (3400, 'Balyasny recruits DE Shaw multi', 'Balyasny'),
 (3410, 'Balyasny recruits DE Shaw multi', 'Balyasny'),
 (3417, 'Prosperity plots alternatives push after Focus', 'Prosperity'),
 (3422, 'Balyasny recruits DE Shaw multi', 'Balyasny'),
 (3428, 'DAI Advisors tilting towards infra', 'DAI Advisors'),
 (3435, 'Ballast Rock keen on PE aerospace', 'Ballast Rock'),
 (3437, 'DL Family Office plots', 'DL Family Office'),
 (3438, 'Firethorn Wealth looking at affordable housing', 'Firethorn Wealth'),
 (3452, 'Digital-asset firm M1, eyeing growth', 'Digital-asset firm M1'),
 (3455, 'DAI Advisors tilting towards infra', 'DAI Advisors'),
 (3460, 'Ballast Rock keen on PE aerospace', 'Ballast Rock'),
 (3462, 'DL Family Office plots', 'DL Family Office'),
 (3463, 'Firethorn Wealth looking at affordable housing', 'Firethorn Wealth');
CREATE TABLE wi_mandates_backup_20261122_names AS
  SELECT m.id, m.investor_name, m.organization_name FROM wi_mandates m JOIN rn USING (id);
CREATE TEMP TABLE go ON COMMIT DROP AS
  SELECT rn.*, (m.organization_name IS NOT DISTINCT FROM m.investor_name) AS org_too
    FROM rn JOIN wi_mandates m USING (id)
   WHERE m.investor_name = rn.old_name AND m.verdict_source IS DISTINCT FROM 'manual' AND m.id <> 1358;
INSERT INTO wi_fill_log (mandate_id, investor_name, field, old_value, new_value, source, wi_investor_id)
SELECT m.id, go.new_name, f.field, f.old, go.new_name,
       'Headline fragment renamed by the 20 Nov name rule; repair-names-2026-11-22, approved by the user', m.evidence->>'wi_investor_id'
  FROM wi_mandates m JOIN go USING (id)
 CROSS JOIN LATERAL (VALUES ('investor_name', m.investor_name, true), ('organization_name', m.organization_name, go.org_too)) f(field, old, doit)
 WHERE f.doit;
UPDATE wi_mandates m SET investor_name = go.new_name,
       organization_name = CASE WHEN go.org_too THEN go.new_name ELSE m.organization_name END, updated_at = now()
  FROM go WHERE go.id = m.id;
COMMIT;
-- UNDO:
-- BEGIN;
-- INSERT INTO wi_fill_log (mandate_id, investor_name, field, old_value, new_value, source, wi_investor_id)
--   SELECT mandate_id, investor_name, field, new_value, old_value, 'Undo of repair-names-2026-11-22', wi_investor_id
--     FROM wi_fill_log WHERE source LIKE '%repair-names-2026-11-22%' AND source NOT LIKE 'Undo%';
-- UPDATE wi_mandates m SET investor_name = b.investor_name, organization_name = b.organization_name, updated_at = now()
--   FROM wi_mandates_backup_20261122_names b WHERE m.id = b.id;
-- COMMIT;
