-- Schema 21g (9 Nov 2026): migrations schema_21i, schema_21j, schema_21k.
--
-- 21i  Numbers compared as numbers: save_undo saw 50000000.00 (stored) and 50000000 (logged)
--      as different and refused to undo; save reported "has a value" instead of "same value".
-- 21j  Tech and Space. save accepts tech_focus / space (true or false) only with
--      tech_evidence / space_evidence: a 10-300 character quote from the With Intelligence
--      profile. Written to is_tech_investor + tech_signal / is_space + space_signal
--      ('With Intelligence profile (Grok): "<quote>"'), only when both the flag and its signal
--      are empty, so a person's Tech choice ("Set by a person: ...") is never touched. Same
--      verdict guard. todo lists technology_focus / space as not stated where nothing is set.
--      grok.wi_mandates gains is_tech_investor, tech_signal_set, is_space, space_signal_set.
-- 21k  grok_login: a login for the gateway's read actions with statement_timeout 15s
--      (role settings apply at login; grok_reader is only switched to inside functions, so a
--      setting on it would never apply). No password in this file: set it in the SQL editor.

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'grok_login') then
    create role grok_login login noinherit nocreatedb nocreaterole;
  end if;
end $$;
alter role grok_login set statement_timeout = '15s';
alter role grok_login set idle_in_transaction_session_timeout = '30s';
alter role grok_login set lock_timeout = '5s';
alter role grok_login connection limit 5;
grant usage on schema grok_fn to grok_login;
grant execute on function grok_fn.check_key(text), grok_fn.ro_query(text, integer), grok_fn.schema_info(),
                          grok_fn.missing_summary(), grok_fn.todo(text, integer, integer) to grok_login;

-- The function edits of 21i/21j were applied as text patches to grok_fn.save, grok_fn.save_undo
-- and grok_fn.todo; their exact text is in the migration history (supabase_migrations).
-- UNDO 21k: drop role grok_login;  (after removing its n8n credential)
