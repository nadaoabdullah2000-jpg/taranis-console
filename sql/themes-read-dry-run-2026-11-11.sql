-- 11 Nov 2026: dry run of the themes-line fill from wi_themes_reads (With Intelligence intentions read by
-- WI 01d). Read-only. One line per target investor: the themes line found, which intentions carry it,
-- and what would be set. Rules (decided by the user):
--   Tech = Yes when the line names a technology theme (AI/ML, data, digital infrastructure, fintech /
--     financial technology, software, semiconductors, cybersecurity, blockchain, deep tech, technology)
--     and at least one intention carrying it is not private-markets only (PE, VC, buyout, growth,
--     secondaries, private credit/debt, real estate, infrastructure). Only PE/VC -> private_markets_only.
--   Space = Yes when the line names security & defence, aerospace & defence, or space.
--   Only where the investor's Tech / Space is blank or "not stated"; a person's choice is never changed.
with notes as (
  select r.wi_id, (n->>'date')::date d, i, n->>'note' note,
         (regexp_match(n->>'note', '((?:the investor''s |its )?(?:primary |key |main |core )?(?:investment )?themes?\s(?:over|for|in|include|includes|focus|focuses|are|is)[^.]*)', 'i'))[1] line
    from (select distinct on (wi_id) * from wi_themes_reads where status = 'ok' order by wi_id, read_at desc) r,
         jsonb_array_elements(r.notes) with ordinality x(n, i)
), tagged as (
  select *, note ~* '\m(hedge funds?|long/short|long-short|equity hedge|relative value|multi-?strateg\w*|global macro|macro|cta|event[- ]driven|market[- ]neutral|absolute return|listed|public equit\w*|liquid)\M' hf,
            note ~* '\m(private equity|venture|buyouts?|growth capital|growth strateg\w*|secondaries|co-investments?|direct lending|mezzanine|private (credit|debt)|real estate|infrastructure|core-plus|value-add|development|distressed|specialty finance|structured credit|asset-backed|opportunistic credit|special situations)\M' pm
    from notes where line is not null
), per as (
  select wi_id,
    (array_agg(line order by (hf or not pm) desc, d desc, i))[1] line,
    bool_or(hf or not pm) public_ok,
    count(*) n_lines,
    string_agg(distinct to_char(d, 'YYYY-MM-DD') || (case when hf then ' HF' when pm then ' PE/VC' else ' general' end), ', ') where_
  from tagged group by wi_id
), judged as (
  select p.*,
    line ~* '\m(artificial intelligence|ai|machine learning|data|digital infrastructure|fintech|financial technology|software|semiconductors?|cyber ?security|blockchain|deep tech|technology|tech)\M' tech_theme,
    line ~* '(security|aerospace)\s?(and|&)\s?defen[cs]e|\mdefen[cs]e\M(?!ive)|\mspace\M|\maerospace\M|\msatellites?\M' space_theme
  from per p
), cur as (
  select coalesce(nullif(m.evidence->>'wi_investor_id','')) wi_id, bool_or(m.is_tech_investor is not null) tech_set,
         bool_or(m.tech_signal like 'Set by a person%') tech_person, bool_or(m.is_space) space_yes, count(*) n_rows
    from wi_mandates m where coalesce(m.validation_status,'') <> 'merged' group by 1
)
select t.name, t.wi_id, rd.status read_status, rd.total intentions, j.line, j.where_,
  case when j.line is null then '-' when j.tech_theme and j.public_ok and not c.tech_set then 'Tech = Yes'
       when j.tech_theme and not j.public_ok and not c.tech_set then 'Tech: private_markets_only'
       when j.tech_theme and c.tech_set then 'Tech set already (kept)' else 'no tech theme' end tech_action,
  case when j.line is null then '-' when j.space_theme and not coalesce(c.space_yes, false) then 'Space = Yes'
       when j.space_theme then 'Space Yes already' else '-' end space_action,
  c.n_rows
from wi_themes_targets t
left join lateral (select * from wi_themes_reads r where r.wi_id = t.wi_id order by read_at desc limit 1) rd on true
left join judged j on j.wi_id = t.wi_id
left join cur c on c.wi_id = t.wi_id
where t.batch = :'batch' or :'batch' = 'all'
order by (j.line is null), t.name;
