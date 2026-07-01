-- ===========================================================================
-- Admin access (fixes "only 1 member shows" + makes the admin gate real)
--
-- WHY: the admin screens are only protected by a client-side email list. The
-- database itself still applies Row Level Security, which by default lets a
-- signed-in member read only THEIR OWN row — that's why the Members page shows
-- just you even though there are many members in Supabase.
--
-- This adds a server-side notion of "admin" (by email on the login JWT) and
-- grants admin full access to the management tables. It is ADDITIVE: it does
-- not remove your existing member-facing policies.
--
-- ⚠️ Edit the email list in is_admin() below to match every admin account.
-- Run this in the Supabase SQL editor. Safe to run more than once.
-- ===========================================================================

create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select coalesce(lower(auth.jwt() ->> 'email'), '') in (
    'rhetttate19@icloud.com'
  );
$$;

-- Helper to (re)create an "admins can do everything" policy on a table.
do $$
declare
  t text;
  admin_tables text[] := array[
    'members',
    'purchases',
    'redemptions',
    'redemption_requests',
    'coupon_redemptions',
    'coupons',
    'deals',
    'sale_items',
    'plus',
    'app_settings'
  ];
begin
  foreach t in array admin_tables loop
    -- Skip tables that don't exist yet (e.g. plus before its migration runs).
    if to_regclass('public.' || t) is null then
      continue;
    end if;

    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists %I on public.%I;', t || '_admin_all', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin());',
      t || '_admin_all', t
    );
  end loop;
end $$;
