-- ===========================================================================
-- PLU lookup table
-- Run this in the Supabase SQL editor (Dashboard → SQL → New query → Run).
-- Safe to run more than once.
-- ===========================================================================

create table if not exists public.plus (
  id          uuid primary key default gen_random_uuid(),
  plu         text not null,                       -- the produce/lookup code (e.g. "4011")
  name        text not null,                       -- "Bananas"
  price       numeric(10,2),                        -- optional per-lb / each price
  department  text,                                 -- optional grouping ("Produce")
  active      boolean not null default true,
  sort_order  integer not null default 100,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists plus_active_idx on public.plus (active);
create index if not exists plus_name_idx   on public.plus (lower(name));
create index if not exists plus_plu_idx    on public.plus (plu);

-- Row Level Security: read is public (the cashier tablet uses the anon key,
-- same as sale_items); writes require a logged-in admin.
alter table public.plus enable row level security;

drop policy if exists "plus_read" on public.plus;
create policy "plus_read"
  on public.plus for select
  using (true);

drop policy if exists "plus_write" on public.plus;
create policy "plus_write"
  on public.plus for all
  to authenticated
  using (true)
  with check (true);

-- A few starter produce codes (delete these if you don't want them).
insert into public.plus (plu, name, department, sort_order) values
  ('4011', 'Bananas',        'Produce', 1),
  ('4087', 'Roma Tomatoes',  'Produce', 2),
  ('4068', 'Green Onions',   'Produce', 3),
  ('4225', 'Avocado (Hass)', 'Produce', 4)
on conflict do nothing;
