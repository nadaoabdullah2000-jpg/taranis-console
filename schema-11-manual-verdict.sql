-- Schema 11: a verdict a person chose stays chosen.
--
-- WI 01 v2 re-runs (Replay Stored Emails, a re-delivered digest), WI 01c, the
-- Telegram approval workflow and the console's "Fill a gap" all write
-- qualification / new_qualification. Without a guard a re-run puts the rule's
-- verdict back over a person's decision.
--
-- verdict_source = 'manual' marks a person's decision; verdict_set_by and
-- verdict_set_at say who and when. The trigger keeps the verdict of a manual
-- row unless the update is itself a new decision, i.e. it sets verdict_set_at
-- to a new value (the console and the Telegram "accept" both do). Every other
-- column still updates, so re-runs keep refreshing the facts.

alter table wi_mandates
  add column if not exists verdict_source text,
  add column if not exists verdict_set_by text,
  add column if not exists verdict_set_at timestamptz;

create or replace function wi_keep_manual_verdict() returns trigger
language plpgsql as $$
begin
  if old.verdict_source = 'manual'
     and new.verdict_set_at is not distinct from old.verdict_set_at then
    new.qualification     := old.qualification;
    new.new_qualification := old.new_qualification;
    new.new_fit_score     := old.new_fit_score;
    new.fit_score         := old.fit_score;
    new.fit_reason        := old.fit_reason;
    new.hard_fail_reasons := old.hard_fail_reasons;
    new.matched           := old.matched;
    new.verdict_source    := old.verdict_source;
    new.verdict_set_by    := old.verdict_set_by;
  end if;
  return new;
end $$;

drop trigger if exists wi_keep_manual_verdict on wi_mandates;
create trigger wi_keep_manual_verdict
  before update on wi_mandates
  for each row execute function wi_keep_manual_verdict();

-- The decisions already made by hand: every row whose stored reason was
-- written by a person (news headlines, managers, consultants, criteria
-- mismatches, review overrides), plus report rows a person ruled out.
update wi_mandates
   set verdict_source = 'manual',
       verdict_set_by = 'backfill: hand-written reason',
       verdict_set_at = coalesce(updated_at, now())
 where verdict_source is null
   and (fit_reason ~ '^(Not an allocator|Not a direct allocator|Not an investor mandate|Review: |Criteria mismatch)'
        or validation_status = 'not_an_allocator'
        or published_via = 'manual-override');
