-- Live check for schema-15. Run in the SQL editor (or execute_sql) after the
-- migration. Read-only: iconn_match_rows only builds temporary tables, and
-- nothing is staged. Raises on the first thing that is wrong; silence = pass.
do $$
declare
  r record;
  pending_ids bigint[];
  pending_name text;
begin
  if exists (select 1 from investor_aliases where alias <> lower(btrim(replace(replace(alias, '.', ''), ',', '')))) then
    raise exception 'an alias is stored in a form expand_investor() cannot find';
  end if;
  if expand_investor('massprim') <> 'Massachusetts Pension Reserves Investment Management Board' then
    raise exception 'massprim does not expand';
  end if;
  if expand_investor('ADIA') <> 'Abu Dhabi Investment Authority' then
    raise exception 'expand_investor(ADIA) changed';
  end if;
  if (select count(*) from investor_aliases where alias in ('cmu', 'nyu', 'mit')) <> 3 then
    raise exception 'CMU / NYU / MIT seeds missing';
  end if;

  -- An alias reaches the opportunity behind it (ADIA: the three alert rows).
  select * into r from iconn_match_rows('[{"row_no": 1, "name": "ADIA"}]');
  if r.bucket <> 'matched' or r.match_method <> 'alias' or not (1537 = any(r.opp_ids)) then
    raise exception 'ADIA: expected an alias match including 1537, got % % %', r.bucket, r.match_method, r.opp_ids;
  end if;

  -- A stored name, with a legal suffix added, is an exact match.
  select * into r from iconn_match_rows(jsonb_build_array(jsonb_build_object('row_no', 1,
           'name', (select investor_name from wi_mandates where id = 1537) || ' LLC')));
  if r.bucket <> 'matched' or r.match_method <> 'exact' or r.confidence <> 1 then
    raise exception 'suffix variant: expected exact, got % %', r.bucket, r.match_method;
  end if;

  -- Nothing like it: no match, and no candidates.
  select * into r from iconn_match_rows('[{"row_no": 1, "name": "Zzqx Qwvb Nonexistent Allocator"}]');
  if r.bucket <> 'none' or r.matched_id is not null then
    raise exception 'nonsense name matched: % %', r.bucket, r.matched_name;
  end if;

  -- Rows waiting in To validate are never matched.
  select array_agg(id), min(investor_name) into pending_ids, pending_name
    from wi_mandates where validation_status = 'pending' and btrim(coalesce(investor_name, '')) <> '';
  if pending_name is not null then
    select * into r from iconn_match_rows(jsonb_build_array(jsonb_build_object('row_no', 1, 'name', pending_name)));
    if r.opp_ids && pending_ids or r.matched_id = any(pending_ids) then
      raise exception 'a pending row was matched (%)', pending_name;
    end if;
  end if;
end $$;
