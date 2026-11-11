-- 11 Nov 2026 (decided by research@taranis.net), focus pass spot check:
--  * Reset to blank so Grok re-checks them (they return to todo('focus')):
--      Technology: MassPRIM (own use of AI), AlphaBee (wants a manager's "technological edge"),
--      East Rock (a generic industry tag list), CalSTRS (a market view of the "AI-driven economy");
--      Blue Pool, ASR, Arbion, Nuri, CY Capital (technology only for private markets, under the new rule).
--      Emerging managers: AlphaBee ("at least 10 years of experience" is about people, not emerging firms).
--    Only values Grok set (tech_signal 'With Intelligence profile (Grok): ...'); a person's choice is never
--    touched. Verdicts are not changed (no rescore until the focus pass is done).
--  * New rule for Technology (same as Emerging managers): Yes only when it is about the firm's hedge fund
--    or public-markets investing. A tech focus for private equity, private debt or infrastructure only is
--    left blank and recorded as private_markets_only. grok_fn.checked (record_focus) now accepts
--    private_markets_only for tech_focus; grok_fn.save refuses a tech_focus = true quote about private
--    markets only.
-- ONE transaction. Nothing deleted. Backup: wi_mandates_backup_20261111_techreset (+ grok_fn_backup_20261111b).
-- Logged in wi_fill_log.

begin;
create table wi_mandates_backup_20261111_techreset as
  select id, is_tech_investor, tech_signal, open_to_emerging_managers, evidence, focus_checks
    from wi_mandates where id in (2924, 2914, 726, 2911, 1352, 1713, 1806, 1823, 2936, 2387, 2399, 323, 343, 359, 448, 2874);
create table grok_fn_backup_20261111b as
  select p.proname::text as name, pg_get_userbyid(p.proowner)::text as owner, pg_get_functiondef(p.oid) as def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'grok_fn' and p.proname in ('record_focus', 'save');

insert into wi_fill_log (mandate_id, investor_name, field, old_value, new_value, source)
select id, investor_name, 'is_tech_investor', is_tech_investor::text || ' (' || left(tech_signal, 200) || ')', null,
       'Reset 11 Nov 2026 (decided by research@taranis.net): Grok to re-check Technology under the tightened rule'
  from wi_mandates
 where id in (2924, 2914, 726, 2911, 1352, 1713, 1806, 1823, 2936, 2387, 2399, 323, 343, 359, 448, 2874)
   and tech_signal like 'With Intelligence profile (Grok):%';
update wi_mandates set is_tech_investor = null, tech_signal = null
 where id in (2924, 2914, 726, 2911, 1352, 1713, 1806, 1823, 2936, 2387, 2399, 323, 343, 359, 448, 2874)
   and tech_signal like 'With Intelligence profile (Grok):%';

insert into wi_fill_log (mandate_id, investor_name, field, old_value, new_value, source)
select id, investor_name, 'open_to_emerging_managers', open_to_emerging_managers::text || ' (' || left(evidence ->> 'emerging_evidence', 200) || ')', null,
       'Reset 11 Nov 2026 (decided by research@taranis.net): Grok to re-check Emerging managers'
  from wi_mandates where id = 2924 and open_to_emerging_managers is not null;
update wi_mandates set open_to_emerging_managers = null, evidence = evidence - 'emerging_evidence'
 where id = 2924 and open_to_emerging_managers is not null;

-- checked: private_markets_only for Technology too
do $do$
declare d text; n text;
begin
  d := pg_get_functiondef('grok_fn.record_focus(text,text,jsonb,text)'::regprocedure);
  n := replace(d, $s$if res not in ('not_stated', 'private_markets_only') or (res = 'private_markets_only' and fld <> 'emerging') then$s$,
                  $s$if res not in ('not_stated', 'private_markets_only') then$s$);
  n := replace(n, $s$'result is not_stated (or private_markets_only, for open_to_emerging_managers only).'$s$,
                  $s$'result is not_stated or private_markets_only.'$s$);
  if n = d then raise exception 'record_focus text not as expected'; end if;
  execute n;
end $do$;

-- save: Technology = true only for hedge funds or public markets
do $do$
declare d text; n text;
begin
  d := pg_get_functiondef('grok_fn.save(text,jsonb,boolean,text)'::regprocedure);
  n := replace(d, $s$                       || ': a short quote from the With Intelligence profile (10 to 300 characters).');
          else$s$, $s$                       || ': a short quote from the With Intelligence profile (10 to 300 characters).');
          elsif k = 'tech_focus' and (fields -> k) = 'true'::jsonb
                and (v #>> '{}') ~* '(private equity|private debt|private credit|buyout|venture|infrastructure|real estate|direct lending|co-?invest)'
                and regexp_replace(v #>> '{}', 'private (equity|debt|credit)|venture capital|real estate (equity|debt)', '', 'gi')
                    !~* '(hedge|public|listed|liquid|absolute return|long.?short|equit|multi.?strateg|quant)' then
            -- 11 Nov 2026: a tech focus for private markets only does not count
            skipped := skipped || jsonb_build_object('field', k, 'reason',
                       'The quote is about private markets only: left blank. Send checked with fields [{field: "tech_focus", result: "private_markets_only", note}].');
          else$s$);
  if n = d then raise exception 'save text not as expected'; end if;
  execute n;
end $do$;
commit;

-- UNDO (one block):
--   begin;
--   update wi_mandates m set is_tech_investor = b.is_tech_investor, tech_signal = b.tech_signal,
--          open_to_emerging_managers = b.open_to_emerging_managers, evidence = b.evidence, focus_checks = b.focus_checks
--     from wi_mandates_backup_20261111_techreset b where b.id = m.id;
--   do $u$ declare r record; begin for r in select * from grok_fn_backup_20261111b loop execute r.def; end loop; end $u$;
--   commit;
