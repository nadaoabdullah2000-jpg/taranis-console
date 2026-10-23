-- Schema 14: one card per WI alert in Search.
--
-- Replaces console_search_company (schema-13) so the mandates list collapses
-- copies of the same WI alert parsed from several same-day emails, and says how
-- many copies there were (source_count). Read-only change: no stored row is
-- written or merged; wi_mandates keeps every copy.
--
-- On 23 Oct 2026: 296 alerts stored more than once, 435 redundant rows,
-- 269 investors, up to 8 copies of one alert.
--
-- Mirrored in schema.sql, section 5. To undo, re-run the console_search_company
-- block from schema-13-enrich-and-search.sql (CREATE OR REPLACE back to it).

-- search.company: everything held on one company. Exact (case-insensitive)
-- matches first, then names that contain it (only for 4+ characters, so
-- "IT" does not pull in every name with "it" in it). Each row says which.
--
-- One WI alert often arrives in several same-day emails and is stored once per
-- email (ADIA 1508 / 1519 / 1537: same alert, different record_key and
-- source_email_date; dupe_of_id and content_hash are not set on them). The
-- mandates list shows each alert once: rows with the same
--   lower(coalesce(organization_name, investor_name)), intention_summary,
--   alert_type, alert_date and source_subject
-- collapse to the most recent copy by source_email_date (then the highest id,
-- so "Open" goes to a real row), with source_count saying how many copies
-- there were. Rows that differ on any of those stay separate. The tags take
-- the group's value (copies never disagree, but some carry NULL), and the
-- group is an exact match if any copy is. The network still reads every copy.
create or replace function public.console_search_company(p_name text)
returns jsonb
language sql stable
set search_path = public
as $$
  with p as (
    select btrim(coalesce(p_name, ''))         as n,
           lower(btrim(coalesce(p_name, '')))  as ln,
           replace(replace(replace(btrim(coalesce(p_name, '')), '\', '\\'), '%', '\%'), '_', '\_') as esc,
           length(btrim(coalesce(p_name, ''))) >= 4 as partial_ok
  ),
  mand_all as (
    select m.id, m.investor_name, m.organization_name, m.investor_country, m.investor_type,
           m.investor_tag, m.alert_date, m.new_qualification, m.new_fit_score,
           m.intention_summary, m.published_at, m.is_tech_investor, m.open_to_emerging_markets,
           m.linkedin_url, m.view_intention_url, m.view_investor_url, m.view_article_url,
           m.source_email_date,
           case when lower(btrim(coalesce(m.investor_name, ''))) = p.ln
                  or lower(btrim(coalesce(m.organization_name, ''))) = p.ln
                then 'exact' else 'partial' end as match,
           lower(coalesce(m.organization_name, m.investor_name)) as sig_name,
           coalesce(m.intention_summary, '')  as sig_summary,
           coalesce(m.alert_type, '')         as sig_type,
           coalesce(m.alert_date::text, '')   as sig_date,
           coalesce(m.source_subject, '')     as sig_subject
      from wi_mandates m, p
     where length(p.n) >= 2
       and coalesce(m.validation_status, '') <> 'pending'
       and (   lower(btrim(coalesce(m.investor_name, ''))) = p.ln
            or lower(btrim(coalesce(m.organization_name, ''))) = p.ln
            or (p.partial_ok and (m.investor_name ilike '%' || p.esc || '%'
                               or m.organization_name ilike '%' || p.esc || '%')))
  ),
  mand_ranked as (
    select a.*,
           row_number() over w_order                       as copy_rank,
           count(*) over w                                 as source_count,
           bool_or(a.is_tech_investor) over w              as group_tech,
           bool_or(a.open_to_emerging_markets) over w      as group_em,
           bool_or(a.match = 'exact') over w               as group_exact
      from mand_all a
    window w       as (partition by a.sig_name, a.sig_summary, a.sig_type, a.sig_date, a.sig_subject),
           w_order as (partition by a.sig_name, a.sig_summary, a.sig_type, a.sig_date, a.sig_subject
                       order by a.source_email_date desc nulls last, a.id desc)
  ),
  mand as (
    select r.id, r.investor_name, r.organization_name, r.investor_country, r.investor_type,
           r.investor_tag, r.alert_date, r.new_qualification, r.new_fit_score,
           r.intention_summary, r.published_at,
           r.group_tech as is_tech_investor, r.group_em as open_to_emerging_markets,
           r.linkedin_url, r.view_intention_url, r.view_investor_url, r.view_article_url,
           case when r.group_exact then 'exact' else 'partial' end as match,
           r.source_count
      from mand_ranked r
     where r.copy_rank = 1
     order by (case when r.group_exact then 0 else 1 end),
              r.alert_date desc nulls last, r.id desc
     limit 50
  ),
  cont as (
    select a.id, a.name, a.role, a.title, a.company, a.email, a.country, a.city,
           a.relationship, a.knows_us, a.last_contact_at, c.linkedin_url,
           case when lower(btrim(a.company)) = p.ln then 'exact' else 'partial' end as match
      from contacts_app a join contacts c on c.id = a.id, p
     where length(p.n) >= 2
       and (lower(btrim(coalesce(a.company, ''))) = p.ln
            or (p.partial_ok and a.company ilike '%' || p.esc || '%'))
     order by (case when lower(btrim(a.company)) = p.ln then 0 else 1 end),
              a.last_contact_at desc nulls last, a.name
     limit 50
  ),
  docs as (
    select d.id, d.doc_key, d.title, d.version_label, d.period_date, d.public_url, d.uploaded_at
      from document_latest d, p
     where p.partial_ok
       and (d.title ilike '%' || p.esc || '%' or d.notes ilike '%' || p.esc || '%'
            or d.file_name ilike '%' || p.esc || '%')
     order by d.uploaded_at desc
     limit 20
  ),
  people as (
    select lower(substring(c.linkedin_url from 'linkedin\.com/in/([^/?#[:space:]]+)')) as slug,
           c.name as known_as, c.linkedin_url as url, 'contact' as via
      from cont c where c.linkedin_url is not null
    union
    select lower(substring(m.linkedin_url from 'linkedin\.com/in/([^/?#[:space:]]+)')),
           m.investor_name, m.linkedin_url, 'mandate'
      from mand_all m where m.linkedin_url is not null
  ),
  net as (
    select coalesce(lm.full_name, pe.known_as) as full_name,
           coalesce(lm.profile_url, pe.url)    as profile_url,
           pe.via,
           coalesce(lm.mutual_to, '{}')        as mutual_to,
           coalesce(lm.mutual_count, 0)        as mutual_count
      from people pe
      left join linkedin_mutual lm on lower(lm.slug) = pe.slug
     where pe.slug is not null
     order by coalesce(lm.mutual_count, 0) desc, 1
     limit 50
  )
  select jsonb_build_object(
    'name',      (select n from p),
    'mandates',  coalesce((select jsonb_agg(to_jsonb(x)) from mand x), '[]'::jsonb),
    'contacts',  coalesce((select jsonb_agg(to_jsonb(x)) from cont x), '[]'::jsonb),
    'documents', coalesce((select jsonb_agg(to_jsonb(x)) from docs x), '[]'::jsonb),
    'network',   coalesce((select jsonb_agg(to_jsonb(x)) from net  x), '[]'::jsonb)
  )
$$;
