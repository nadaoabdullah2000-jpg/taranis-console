-- =====================================================================
-- Taranis CRM — migration 7
--
-- Stops the same mandate existing twice, and repairs the manager-as-
-- investor inversion in the stored data.
--
-- WHY THE DUPLICATES HAPPEN
--
-- WI 01 dedupes on the email's Message-ID. Two forwards of the same
-- With Intelligence digest are two different Message-IDs carrying
-- identical content, so both are stored, both are split, and every
-- mandate inside is written twice — then scored twice, by two separate
-- model calls that need not agree. BuySide Partners came out at 1.00
-- from one copy and 0.85 from the other.
--
-- The Message-ID is the wrong thing to dedupe on. What makes a mandate
-- the same mandate is the investor, the alert date and its position in
-- the digest — none of which changes when an email is forwarded.
--
-- Run the sections in order. Section 1 only looks.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. WHAT IS DUPLICATED
-- ---------------------------------------------------------------------
select lower(investor_name)                       as investor,
       coalesce(alert_date, date '1970-01-01')    as alert_date,
       block_index,
       count(*)                                   as copies,
       array_agg(id order by id)                  as ids,
       array_agg(fit_score order by id)           as scores
  from wi_mandates
 where investor_name is not null
 group by 1, 2, 3, coalesce(source_kind, 'email')
having count(*) > 1
 order by copies desc, investor;


-- ---------------------------------------------------------------------
-- 2. REPAIR THE INVERTED NAMES FIRST
--
-- Before deduplicating, because the swap changes investor_name and
-- therefore changes which rows count as duplicates of each other.
--
-- The manager is kept in evidence rather than discarded — a record you
-- cannot audit is worse than one with a wrong name in it, because at
-- least the wrong name is visible. Approved rows are untouched: somebody
-- looked at those and said yes.
-- ---------------------------------------------------------------------
with managers(name) as (values
  ('bridgewater'), ('citadel'), ('millennium management'), ('point72'),
  ('two sigma'), ('renaissance technologies'), ('de shaw'), ('d. e. shaw'),
  ('aqr capital'), ('man group'), ('brevan howard'), ('elliott management'),
  ('baupost'), ('pershing square'), ('third point'), ('tiger global'),
  ('coatue'), ('marshall wace'), ('capula'), ('winton'), ('bluecrest'),
  ('balyasny'), ('exodus point'), ('schonfeld'), ('kkr'), ('blackstone'),
  ('apollo global'), ('carlyle'), ('ares management'), ('plettenberg'),
  ('hippocampus'), ('walleye capital'), ('fasanara capital')
)
update wi_mandates m
   set investor_name = m.organization_name,
       evidence = coalesce(m.evidence, '{}'::jsonb)
                  || jsonb_build_object('other_firm_named', m.investor_name,
                                        'repaired_at', now()::text),
       updated_at = now()
  from managers g
 where lower(m.investor_name) like '%' || g.name || '%'
   and coalesce(m.organization_name, '') <> ''
   and lower(m.organization_name) <> lower(m.investor_name)
   and m.approved_at is null;


-- ---------------------------------------------------------------------
-- 3. KEEP ONE COPY OF EACH
--
-- Approved wins over unapproved, then the lowest id wins. Never the
-- highest score: picking the copy that scored best would be choosing
-- the flattering answer rather than the first one, and the scores only
-- differ because the same text was read twice.
-- ---------------------------------------------------------------------
with ranked as (
  select id,
         row_number() over (
           partition by coalesce(source_kind, 'email'),
                        lower(investor_name),
                        coalesce(alert_date, date '1970-01-01'),
                        block_index
           order by (approved_at is not null) desc, id asc
         ) as rn
    from wi_mandates
   where investor_name is not null
)
delete from wi_mandates m
 using ranked r
 where m.id = r.id
   and r.rn > 1;


-- ---------------------------------------------------------------------
-- 4. STOP IT HAPPENING AGAIN
--
-- source_kind is in the key so a report signal and an email mandate
-- about the same investor on the same day stay separate records —
-- they come from different sources and are read differently.
--
-- alert_date is coalesced because NULLs are distinct from each other in
-- a unique index, so two undated copies of the same mandate would slip
-- through a plain multi-column index.
-- ---------------------------------------------------------------------
create unique index if not exists wi_mandates_natural_key
  on wi_mandates (coalesce(source_kind, 'email'),
                  lower(investor_name),
                  coalesce(alert_date, date '1970-01-01'),
                  block_index);


-- ---------------------------------------------------------------------
-- 5. CLEAR THE ORPHANED NOTIFICATIONS
--
-- Section 3 deleted the duplicate mandates but not the Today notices
-- that pointed at them. Those are the repeated cards on screen.
-- ---------------------------------------------------------------------
delete from app_notifications a
 where a.mandate_id is not null
   and not exists (select 1 from wi_mandates m where m.id = a.mandate_id);


-- ---------------------------------------------------------------------
-- 6. CHECK
-- ---------------------------------------------------------------------
-- Section 1 again should return nothing at all.
--
-- select count(*) as notices_left,
--        count(*) filter (where read_at is null) as still_unread
--   from app_notifications;
