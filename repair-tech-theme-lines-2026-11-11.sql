-- 11 Nov 2026 (decided by research@taranis.net): Technology focus = Yes from a With Intelligence
-- "investment themes" line. Scanned: the With Intelligence text stored for every investor (profile
-- summary, With Intelligence intentions, the intention text alerts carry, and the profile quotes Grok
-- saved, including those reset this morning). A line counts when it is the investor's own themes line
-- ("The investor's primary investment themes over the next 12-18 months ...", "Key investment themes
-- include ...") and names at least one technology theme (AI, data, digital infrastructure, fintech,
-- software, semiconductors, cybersecurity, blockchain, deep tech ...). Lines limited to private equity
-- or venture would be recorded private_markets_only (none found among blank rows). A line that only
-- warns about AI themes does not count.
-- Writes, per row of the investor (not merged):
--   * Technology blank          -> is_tech_investor = true, tech_signal = 'With Intelligence profile (theme line): "<line>"'
--   * Technology = Yes from older alert-text notes -> same evidence, the theme line
--   * a Grok quote already      -> unchanged;  a person's Tech choice -> never touched (flagged)
--   * Technology = No from earlier enrichment -> unchanged (flagged)
--   * a Grok "not stated" check on a row now set to Yes is removed (logged)
-- Verdicts are not changed. ONE transaction. Nothing deleted. Backup: wi_mandates_backup_20261111_themes.

begin;
create temp table theme_plan on commit drop as
with rows as (
  select m.id, coalesce(nullif(m.investor_name,''), m.organization_name) nm, nullif(m.evidence->>'wi_investor_id','') wi,
         coalesce(nullif(m.evidence->>'wi_investor_id',''), 'name:' || wi_name_key(coalesce(nullif(btrim(m.investor_name),''), m.organization_name))) k,
         coalesce(nullif(m.new_qualification,''), m.qualification) q, m.verdict_source vs, m.is_tech_investor tech, m.tech_signal sig, m.focus_checks fc
    from wi_mandates m where coalesce(m.validation_status,'') <> 'merged'
), texts as (
  select r.k, t.txt from rows r join wi_mandates m on m.id = r.id,
    lateral (values (m.evidence->>'wi_summary'), (m.intention_summary), (m.requirements_raw), (m.appetite_raw), (m.tech_signal)) t(txt)
  union all
  select r.k, coalesce(l.old_value, l.new_value) from wi_fill_log l join rows r on r.id = l.mandate_id::bigint
   where l.field in ('is_tech_investor','tech_signal')
  union all
  select r.k, x->>'note' from (select distinct k, wi from rows where wi is not null) r join hf_wi_reads h on h.wi_id = r.wi,
    lateral jsonb_array_elements(case when jsonb_typeof(h.intentions) = 'object' then coalesce(h.intentions->'latest3','[]') || coalesce(h.intentions->'hf','[]') else '[]' end) x
  union all
  select r.k, regexp_replace(p.payload#>>'{raw,summary}', '<[^>]+>', ' ', 'g') from (select distinct k, wi from rows where wi is not null) r
    join wi_profile_reads p on p.wi_investor_id = r.wi and p.status = 'ok'
), lines as (
  select distinct t.k, btrim(regexp_replace(mm[1], '\s+', ' ', 'g')) line
    from texts t, lateral regexp_matches(coalesce(t.txt, ''),
      '((?:private equity intention tags|(?:the investor''s |its )?(?:primary |key |main |core )?investment themes?)\s[^.|"]{5,400})', 'gi') mm
   where mm[1] ~* '\m(artificial intelligence|ai|machine learning|data cent(er|re)s?|big data|data infrastructure|digital infrastructure|financial technology|fintech|software|semiconductors?|cyber ?security|blockchain|deep tech|technology|robotics|quantum|cloud computing)\M'
     and mm[1] !~* '(caution|cautious|wary|concern|less so|avoid)'
), pick as (
  select k, (array_agg(line order by (line ~* 'private equity|venture|buyout|private markets?|private credit|private debt'), length(line) desc))[1] line,
         bool_and(line ~* 'private equity|venture|buyout|private markets?|private credit|private debt') pmo
    from lines group by k
)
select r.id, r.nm, r.wi, r.tech, r.sig, r.fc, p.line, p.pmo
  from rows r join pick p using (k)
 where coalesce(r.sig, '') not like 'Set by a person%'
   and not p.pmo
   and r.tech is distinct from false
   and not (r.tech is true and coalesce(r.sig, '') like 'With Intelligence profile (Grok): "%');

create table wi_mandates_backup_20261111_themes as
  select id, is_tech_investor, tech_signal, focus_checks from wi_mandates where id in (select id from theme_plan);

insert into wi_fill_log (mandate_id, investor_name, field, old_value, new_value, source, wi_investor_id)
select id, nm, 'is_tech_investor', coalesce(tech::text, 'blank') || coalesce(' (' || left(sig, 150) || ')', ''),
       'true (With Intelligence profile (theme line): "' || left(line, 300) || '")',
       'Theme line 11 Nov 2026 (decided by research@taranis.net)', wi
  from theme_plan;
update wi_mandates m set is_tech_investor = true,
       tech_signal = 'With Intelligence profile (theme line): "' || left(p.line, 600) || '"',
       focus_checks = nullif(coalesce(m.focus_checks, '{}'::jsonb) - 'tech', '{}'::jsonb)
  from theme_plan p where p.id = m.id;
commit;

-- UNDO:
--   update wi_mandates m set is_tech_investor = b.is_tech_investor, tech_signal = b.tech_signal, focus_checks = b.focus_checks
--     from wi_mandates_backup_20261111_themes b where b.id = m.id;
