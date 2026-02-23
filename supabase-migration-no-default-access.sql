-- ============================================================
-- MIGRATION: Remove default phase access
-- Run this in Supabase > SQL Editor
-- ============================================================

-- 1. Allow fase to be NULL (no access by default)
alter table public.profiles
  drop constraint if exists profiles_fase_check;

alter table public.profiles
  add constraint profiles_fase_check
  check (fase is null or fase in ('fase-1', 'fase-2', 'ambas'));

-- 2. Change default from 'fase-1' to NULL
alter table public.profiles
  alter column fase set default null;

-- 3. Remove auto-progress trigger (progress created only when admin assigns phase)
drop trigger if exists on_profile_created on public.profiles;
drop function if exists public.init_user_progress();

-- Done! New users will register with no phase and no course access.
-- Admin assigns phase from the admin panel after confirming payment.
