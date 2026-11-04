-- Repair 4 Nov 2026 (night): With Intelligence profile links in the wrong form.
--
-- With Intelligence's site has the route /explore/investors/[id] (read from its
-- Next.js build manifest) and no /investors/[id] route, so links written as
-- https://platform.withintelligence.com/investors/<id> open "not found".
-- Reported by the user on Qube Research & Technologies (QRT). All such links
-- (written today by the profile reader, and older direct links) are rewritten
-- to /explore/investors/<id>; each change logged in wi_fill_log.

with u as (
  update wi_mandates m
     set view_investor_url = regexp_replace(m.view_investor_url,
           '^https://platform\.withintelligence\.com/investors/(-?\d+).*$',
           'https://platform.withintelligence.com/explore/investors/\1')
   where m.view_investor_url ~ '^https://platform\.withintelligence\.com/investors/-?\d+'
  returning m.id, m.investor_name, m.view_investor_url)
insert into wi_fill_log (mandate_id, investor_name, field, old_value, new_value, source)
select id, investor_name, 'Link fixed: Investor page (format)',
       replace(view_investor_url, '/explore/investors/', '/investors/'), view_investor_url,
       'Link format 4 Nov 2026: /investors/<id> does not exist on With Intelligence; /explore/investors/<id> does'
  from u;

-- UNDO
--   update wi_mandates m set view_investor_url = l.old_value from wi_fill_log l
--    where l.mandate_id = m.id and l.field = 'Link fixed: Investor page (format)';
