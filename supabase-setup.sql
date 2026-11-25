-- Ludo Whiteboard: run this once in the Supabase SQL Editor.
-- It adds two tables, both prefixed wb_, and does not touch any existing table.

-- 1. Who counts as staff. Coaches listed here can change the shared playbook.
create table if not exists public.wb_staff (
  email text primary key
);

-- 2. Everything the whiteboard shares: one row per play, per overlay, and one for the
--    shared alignments and overlay sets.
create table if not exists public.wb_items (
  kind       text    not null check (kind in ('play', 'overlay', 'library')),
  id         text    not null,
  data       jsonb,                           -- the play or overlay itself
  name       text    not null default '',
  team       boolean not null default false,  -- "Show this play to players"
  deleted    boolean not null default false,  -- a deleted item stays as a marker so every iPad removes it
  updated    bigint  not null,                -- when it was last saved, in milliseconds
  updated_by text,
  primary key (kind, id)
);

alter table public.wb_staff enable row level security;
alter table public.wb_items enable row level security;

-- Is the signed-in person on the staff list? (wb_staff itself is not readable by anyone.)
create or replace function public.wb_is_staff()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.wb_staff
    where lower(email) = lower(auth.jwt() ->> 'email')
  );
$$;
revoke all on function public.wb_is_staff() from public;
grant execute on function public.wb_is_staff() to authenticated;

-- Staff can read and change everything.
drop policy if exists "wb staff all" on public.wb_items;
create policy "wb staff all" on public.wb_items
  for all to authenticated
  using (public.wb_is_staff())
  with check (public.wb_is_staff());

-- Any other signed-in account (players) can only read overlays and the plays marked for players.
drop policy if exists "wb players read" on public.wb_items;
create policy "wb players read" on public.wb_items
  for select to authenticated
  using (not deleted and (kind = 'overlay' or (kind = 'play' and team)));

-- 3. List your coaches. Replace these with the real addresses, then run it.
-- insert into public.wb_staff (email) values
--   ('coach.one@ves.org'),
--   ('coach.two@ves.org')
-- on conflict do nothing;
