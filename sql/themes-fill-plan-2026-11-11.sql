-- 11 Nov 2026: build the row-level plan for the combined fill (themes read + stored security & defence
-- lines). Writes only the plan table public.wi_fill_plan_20261111; wi_mandates is not touched here.
-- Built once (no drop, no delete). The apply file (repair-themes-space-fill-2026-11-11.sql) reads this plan in one transaction.
create table public.wi_fill_plan_20261111 as
with notes as (                                   -- A. the live read (wi_themes_reads)
  select r.wi_id, (n->>'date')::date d, i, n->>'note' note,
         (regexp_match(n->>'note', '((?:the investor''s |its )?(?:primary |key |main |core )?(?:investment )?themes?\s(?:over|for|in|include|includes|focus|focuses|are|is)[^.]*)', 'i'))[1] line
    from (select distinct on (wi_id) * from wi_themes_reads where status = 'ok' order by wi_id, read_at desc) r,
         jsonb_array_elements(r.notes) with ordinality x(n, i)
), tagged as (
  select *, note ~* '\m(hedge funds?|long/short|long-short|equity hedge|relative value|multi-?strateg\w*|global macro|macro|cta|event[- ]driven|market[- ]neutral|absolute return|listed|public equit\w*|liquid)\M' hf,
            note ~* '\m(private equity|venture|buyouts?|growth capital|growth strateg\w*|secondaries|co-investments?|direct lending|mezzanine|private (credit|debt)|real estate|infrastructure|core-plus|value-add|development|distressed|specialty finance|structured credit|asset-backed|opportunistic credit|special situations)\M' pm
    from notes where line is not null
), per as (
  select wi_id, (array_agg(line order by (hf or not pm) desc, d desc, i))[1] line, bool_or(hf or not pm) public_ok,
         string_agg(distinct to_char(d, 'YYYY-MM-DD') || (case when hf then ' HF' when pm then ' PE/VC' else ' general' end), ', ') where_
    from tagged group by wi_id
), live as (
  select wi_id, line, where_, 'live read' src,
         line ~* '\m(artificial intelligence|ai|machine learning|data|digital infrastructure|fintech|financial technology|software|semiconductors?|cyber ?security|blockchain|deep tech|technology|tech)\M' tech_theme,
         public_ok,
         line ~* '(security|aerospace)\s?(and|&)\s?defen[cs]e|\mdefen[cs]e\M(?!ive)|\mspace\M|\maerospace\M|\msatellites?\M' space_theme
    from per
), rows as (                                       -- B. stored lines (the 31-investor Space dry run)
  select m.id, nullif(m.evidence->>'wi_investor_id','') wi,
         coalesce(nullif(m.evidence->>'wi_investor_id',''), 'name:' || wi_name_key(coalesce(nullif(btrim(m.investor_name),''), m.organization_name))) k
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
), slines as (
  select distinct t.k, btrim(regexp_replace(mm[1], '\s+', ' ', 'g')) line
    from texts t, lateral regexp_matches(coalesce(t.txt, ''),
      '((?:the investor''s |its )?(?:primary |key |main |core |investment )*themes?\s(?:over|for|include|focus|are)[^.|"]*(?:security|aerospace)\s?(?:and|&)\s?defen[cs]e[^.|"]*)', 'gi') mm
   where coalesce(t.txt, '') !~* 'conglomerate'
), stored as (
  select distinct on (k) k, line from slines
   where k <> '9564'                                  -- Andrew Carnegie: the user's own, not touched
     and k not in (select wi_id from live where line is not null)   -- the live read wins
   order by k, length(line) desc
), plan_inv as (
  select wi_id k, line, where_, src, tech_theme, public_ok, space_theme from live where line is not null
  union all
  select k, line, null, 'stored line', false, true, true from stored
)
select * from (
select m.id, coalesce(nullif(m.investor_name,''), m.organization_name) investor, p.k wi_key, p.src, p.line, p.where_,
       m.is_tech_investor old_tech, m.tech_signal old_tech_signal, m.focus_checks old_focus_checks,
       m.is_space old_space, m.space_signal old_space_signal, m.verdict_source,
       coalesce(nullif(m.new_qualification,''), m.qualification) old_q, m.new_fit_score old_s,
       case when p.tech_theme and p.public_ok and m.is_tech_investor is null then 'tech_yes'
            when p.tech_theme and not p.public_ok and m.is_tech_investor is null then 'tech_private_only' end tech_action,
       case when p.space_theme and m.is_space is not true and coalesce(m.space_signal, '') not like 'Set by a person%' then 'space_yes' end space_action,
       null::text new_q, null::numeric new_s
  from plan_inv p join rows r on r.k = p.k join wi_mandates m on m.id = r.id
) x where tech_action is not null or space_action is not null;
alter table public.wi_fill_plan_20261111 enable row level security;
