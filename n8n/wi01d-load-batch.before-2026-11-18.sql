-- WI 01d (umIcE6l9pLFuC5JH), node "Load Batch", as it stood before 18 Nov 2026 (version 3fd528b4).
WITH r AS (
  SELECT id, lower(btrim(coalesce(nullif(btrim(investor_name),''), organization_name))) AS k,
         coalesce(nullif(btrim(investor_name),''), organization_name) AS nm, view_investor_url AS u
    FROM wi_mandates WHERE coalesce(validation_status,'') <> 'pending'),
c AS (
  SELECT k AS company_key, (array_agg(nm ORDER BY id DESC))[1] AS name, array_agg(id ORDER BY id DESC) AS ids,
         (array_remove(array_agg(u ORDER BY id DESC), NULL))[1:2] AS urls
    FROM r WHERE coalesce(k,'') <> '' GROUP BY k)
SELECT company_key, name, ids, coalesce(urls, '{}') AS urls FROM c
 WHERE company_key NOT IN (SELECT company_key FROM wi_profile_reads WHERE read_at >= '2026-11-04 11:00+00' AND company_key IS NOT NULL)
 ORDER BY (cardinality(coalesce(urls,'{}')) > 0) DESC, company_key
 LIMIT 12;

-- Node "Load iConn Batch", before 18 Nov 2026:
-- SELECT t.wi_id, t.name FROM wi_hf_targets t
--  WHERE t.why = '17 Nov long-list check'
--    AND NOT EXISTS (SELECT 1 FROM wi_hf_reads r WHERE r.wi_id = t.wi_id AND r.read_at > '2026-11-17 08:00+00' AND r.status IN ('ok','no_profile','partial'))
--    AND (SELECT count(*) FROM wi_hf_reads r WHERE r.wi_id = t.wi_id AND r.status = 'error' AND r.read_at > '2026-11-17 08:00+00') < 2
--    AND NOT EXISTS (SELECT 1 FROM wi_hf_reads r WHERE r.status IN ('auth_error','blocked') AND r.read_at > now() - interval '6 hours')
--  ORDER BY t.wi_id LIMIT 1;
