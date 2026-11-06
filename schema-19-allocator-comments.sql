-- Schema 19 (6 Nov 2026): notes and comments on allocators.
--
-- Comments live in their own table, linked to the allocator, never as a field
-- on the wi_mandates row: WI 01, re-scoring, repairs and every other workflow
-- write wi_mandates and never touch this table.
--
-- One allocator, one thread: a comment carries the allocator's With
-- Intelligence id when it has one (wi_investor_id) and its name key
-- (allocator_key = the console's investorKey: lower-case name, no dots or
-- commas, single spaces). The console shows a comment on every card, on every
-- tab, whose allocator has the same With Intelligence id or the same name key.
--
-- Only people write comments: the guard trigger refuses any insert, edit or
-- delete that does not come from a signed-in console user (a JWT with an
-- email), so no workflow can change one, even with a role that bypasses RLS.
-- A person edits and deletes only their own. Delete is a soft delete
-- (deleted_at): the comment disappears from the console and stays on record.

create table if not exists public.allocator_comments (
  id             bigserial primary key,
  allocator_key  text not null,
  wi_investor_id text,
  investor_name  text not null,
  mandate_id     bigint references public.wi_mandates(id) on delete set null,
  body           text not null check (length(btrim(body)) between 1 and 5000),
  author_email   text not null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz,
  deleted_at     timestamptz
);
create index if not exists allocator_comments_key_idx on public.allocator_comments (allocator_key) where deleted_at is null;
create index if not exists allocator_comments_wi_idx  on public.allocator_comments (wi_investor_id) where deleted_at is null and wi_investor_id is not null;

comment on table public.allocator_comments is
  'Notes and comments people write on an allocator in the console. Never written by automation (guard trigger allocator_comments_guard).';

-- Only a person, and only their own comment; the text, the deleted mark and
-- the edit time are all that can change.
create or replace function public.allocator_comments_guard() returns trigger
language plpgsql as $$
declare who text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  if who = '' then
    raise exception 'Comments are written only by people in the console.' using errcode = 'insufficient_privilege';
  end if;
  if tg_op = 'INSERT' then
    new.author_email := who;
    new.created_at := now();
    new.updated_at := null;
    new.deleted_at := null;
    return new;
  end if;
  if lower(old.author_email) <> who then
    raise exception 'Only the person who wrote a comment can change it.' using errcode = 'insufficient_privilege';
  end if;
  if tg_op = 'DELETE' then
    raise exception 'Comments are not deleted: they are marked deleted (deleted_at).' using errcode = 'insufficient_privilege';
  end if;
  new.id := old.id; new.allocator_key := old.allocator_key; new.wi_investor_id := old.wi_investor_id;
  new.investor_name := old.investor_name; new.mandate_id := old.mandate_id;
  new.author_email := old.author_email; new.created_at := old.created_at;
  if new.body is distinct from old.body then new.updated_at := now(); else new.updated_at := old.updated_at; end if;
  return new;
end $$;
drop trigger if exists allocator_comments_guard on public.allocator_comments;
create trigger allocator_comments_guard before insert or update or delete on public.allocator_comments
  for each row execute function public.allocator_comments_guard();

alter table public.allocator_comments enable row level security;
drop policy if exists comments_read   on public.allocator_comments;
drop policy if exists comments_write  on public.allocator_comments;
drop policy if exists comments_edit   on public.allocator_comments;
create policy comments_read  on public.allocator_comments for select using (is_console_user());
create policy comments_write on public.allocator_comments for insert
  with check (is_console_user());
create policy comments_edit  on public.allocator_comments for update
  using (is_console_user() and lower(author_email) = lower(coalesce(auth.jwt() ->> 'email', '')))
  with check (is_console_user() and lower(author_email) = lower(coalesce(auth.jwt() ->> 'email', '')));
-- No delete policy and no automation policy: nothing removes a comment.

grant select, insert, update on public.allocator_comments to authenticated;
grant usage, select on sequence public.allocator_comments_id_seq to authenticated;
