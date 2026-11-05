-- Check: With Intelligence profile links that are not on /explore/investors/<id>.
--
-- Run any time in the Supabase SQL editor (project asqrhnwicgbgwzttopla):
--     select * from wi_link_format_check;
-- No rows = every stored profile link is in the working form.
-- Each row is an allocator whose "Investor page" link points at
-- platform.withintelligence.com but not at /explore/investors/<id> (the only
-- investor-profile route the site has; /investors/<id> opens "not found").
-- Email tracking links (pardot / withintelligence-email) are not flagged:
-- they redirect to /explore/investors/<id> themselves. The summary query
-- below counts them separately.

create or replace view wi_link_format_check as
select m.id, m.investor_name,
       case when coalesce(m.validation_status, '') = 'pending' then 'To validate' else 'Opportunities / Rejected' end as list,
       m.view_investor_url as link,
       case when m.view_investor_url ~ '^https?://platform\.withintelligence\.com/investors/-?\d+'
              then 'Old form /investors/<id>: rewrite to /explore/investors/<id>'
            else 'Not an investor-profile link' end as problem
  from wi_mandates m
 where m.view_investor_url ~* '^https?://([a-z0-9-]+\.)*withintelligence\.com/'
   and m.view_investor_url !~* '^https?://([a-z0-9-]+\.)*withintelligence-email\.com/'
   and m.view_investor_url !~* '^https?://pardot\.withintelligence\.com/'
   and m.view_investor_url !~ '^https://platform\.withintelligence\.com/explore/investors/-?\d+$';

-- Summary of every stored link by kind:
--   select case when view_investor_url is null then 'no link'
--               when view_investor_url ~ '^https://platform\.withintelligence\.com/explore/investors/-?\d+$' then 'profile link, correct form'
--               when view_investor_url ~* 'pardot\.withintelligence\.com|withintelligence-email\.com' then 'email tracking link'
--               when view_investor_url ~* 'withintelligence\.com' then 'profile link, WRONG form'
--               else 'not a With Intelligence link' end as kind, count(*)
--     from wi_mandates group by 1 order by 2 desc;
