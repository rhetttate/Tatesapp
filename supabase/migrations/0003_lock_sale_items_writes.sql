-- ===========================================================================
-- Lock down sale_items writes
--
-- WHY: older policies let ANYONE holding the public anon key (it ships inside
-- the website) insert, edit or delete sale items without logging in.
--
-- This drops only those open write policies. Reads are untouched, so the
-- cashier / SCO tablets (anon key, not logged in) still see the sale items:
--   "sale items read", "anon sale_items read", "sale_items_read_all" stay.
-- Admin writes keep working through "sale_items_admin_all" (is_admin()),
-- added in 0002_admin_access.sql.
--
-- Safe to run more than once.
-- ===========================================================================

drop policy if exists "sale items insert" on public.sale_items;
drop policy if exists "sale items update" on public.sale_items;
drop policy if exists "sale items delete" on public.sale_items;
drop policy if exists "anon sale_items insert" on public.sale_items;
drop policy if exists "anon sale_items update" on public.sale_items;
drop policy if exists "anon sale_items delete" on public.sale_items;
