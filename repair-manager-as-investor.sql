-- =====================================================================
-- Taranis CRM — repair: manager written where the investor belongs
--
-- "Bridgewater Associates" appearing as the investor on a Teacher
-- Retirement System of Texas record is one instance of a general
-- problem: every one of these alerts names TWO firms, the allocator and
-- the manager receiving the money, and nothing in the text marks which
-- is which. When the extractor picks the wrong one the record is
-- inverted — the card is titled with a fund nobody is going to raise
-- from, and the actual investor is demoted to a subtitle.
--
-- Read section 1 before running section 2.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. SEE WHAT WOULD CHANGE
--
-- Run this first. Every row it returns is one where the two name
-- columns disagree AND the investor name is a firm that raises money
-- rather than allocates it.
--
-- The list is deliberately short and explicit. A pattern like
-- '%capital%' would catch half the allocators in the table — plenty of
-- family offices are called something Capital — so this names firms,
-- and each entry is a decision somebody made rather than a guess.
-- ---------------------------------------------------------------------
with managers(name) as (values
  ('bridgewater'), ('citadel'), ('millennium'), ('point72'), ('two sigma'),
  ('renaissance technologies'), ('de shaw'), ('d. e. shaw'), ('aqr'),
  ('man group'), ('brevan howard'), ('elliott management'), ('baupost'),
  ('pershing square'), ('third point'), ('tiger global'), ('coatue'),
  ('marshall wace'), ('capula'), ('winton'), ('bluecrest'), ('balyasny'),
  ('exodus point'), ('schonfeld'), ('kkr'), ('blackstone'), ('apollo global'),
  ('carlyle'), ('tpg'), ('ares management'), ('plettenberg')
)
select m.id,
       m.investor_name      as shown_as_the_investor,
       m.organization_name  as probably_the_real_investor,
       m.investor_country,
       m.investor_city,
       m.qualification,
       m.approved_at
  from wi_mandates m
  join managers g
    on lower(m.investor_name) like '%' || g.name || '%'
 where coalesce(m.organization_name, '') <> ''
   and lower(m.organization_name) <> lower(m.investor_name)
 order by m.id desc;


-- ---------------------------------------------------------------------
-- 2. SWAP THEM BACK
--
-- Only run this once the list above looks right to you.
--
-- The manager's name is not thrown away — it goes into evidence under
-- other_firm_named, which is where WI 01 already records the second firm
-- when it spots one. A record you cannot audit is worse than a record
-- with a wrong name in it, because at least the wrong name is visible.
--
-- Approved rows are left alone. Somebody looked at those and said yes;
-- changing the name on a decision after the fact is not a repair.
-- ---------------------------------------------------------------------
-- with managers(name) as (values
--   ('bridgewater'), ('citadel'), ('millennium'), ('point72'), ('two sigma'),
--   ('renaissance technologies'), ('de shaw'), ('d. e. shaw'), ('aqr'),
--   ('man group'), ('brevan howard'), ('elliott management'), ('baupost'),
--   ('pershing square'), ('third point'), ('tiger global'), ('coatue'),
--   ('marshall wace'), ('capula'), ('winton'), ('bluecrest'), ('balyasny'),
--   ('exodus point'), ('schonfeld'), ('kkr'), ('blackstone'), ('apollo global'),
--   ('carlyle'), ('tpg'), ('ares management'), ('plettenberg')
-- )
-- update wi_mandates m
--    set investor_name = m.organization_name,
--        evidence = coalesce(m.evidence, '{}'::jsonb)
--                   || jsonb_build_object('other_firm_named', m.investor_name,
--                                         'repaired_at', now()::text),
--        updated_at = now()
--   from managers g
--  where lower(m.investor_name) like '%' || g.name || '%'
--    and coalesce(m.organization_name, '') <> ''
--    and lower(m.organization_name) <> lower(m.investor_name)
--    and m.approved_at is null;


-- ---------------------------------------------------------------------
-- 3. THE ONES WHERE BOTH COLUMNS HOLD THE MANAGER
--
-- Section 2 can only fix a record whose organisation_name still holds
-- the allocator. Where the extractor put the manager in BOTH columns
-- there is nothing to swap back, and the investor's name is simply not
-- in the row any more.
--
-- Those cannot be repaired by SQL. This finds them so you can decide
-- whether to reject them or reopen the source alert:
-- ---------------------------------------------------------------------
-- with managers(name) as (values ('bridgewater'), ('citadel'), ('kkr'),
--   ('blackstone'), ('carlyle'), ('capula'), ('plettenberg'))
-- select m.id, m.investor_name, m.intention_summary, m.view_article_url
--   from wi_mandates m
--   join managers g on lower(m.investor_name) like '%' || g.name || '%'
--  where lower(coalesce(m.organization_name, '')) = lower(m.investor_name)
--  order by m.id desc;
