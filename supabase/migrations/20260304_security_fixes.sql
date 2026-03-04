-- ============================================================
-- Orbita Capital — Supabase Security Fixes
-- Fixes linting warnings shown in Supabase Security Advisor
-- Run this in the Supabase SQL Editor
-- ============================================================

-- ── 1. Enable RLS on all public tables ──────────────────────

ALTER TABLE public.profiles        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.progress        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mentorships     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_config     ENABLE ROW LEVEL SECURITY;

-- ── 2. RLS Policies — profiles ───────────────────────────────

-- Users can read their own profile
CREATE POLICY "profiles_select_own"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

-- Users can update their own profile
CREATE POLICY "profiles_update_own"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Admins can read all profiles
CREATE POLICY "profiles_select_admin"
  ON public.profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.rol = 'admin'
    )
  );

-- Admins can update all profiles (for granting access)
CREATE POLICY "profiles_update_admin"
  ON public.profiles FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.rol = 'admin'
    )
  );

-- Service role can do anything (for webhooks / Netlify functions)
CREATE POLICY "profiles_service_role"
  ON public.profiles
  USING (auth.role() = 'service_role');

-- ── 3. RLS Policies — progress ───────────────────────────────

-- Users can read their own progress
CREATE POLICY "progress_select_own"
  ON public.progress FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own progress
CREATE POLICY "progress_insert_own"
  ON public.progress FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own progress
CREATE POLICY "progress_update_own"
  ON public.progress FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Admins can read all progress
CREATE POLICY "progress_select_admin"
  ON public.progress FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.rol = 'admin'
    )
  );

-- Service role full access
CREATE POLICY "progress_service_role"
  ON public.progress
  USING (auth.role() = 'service_role');

-- ── 4. RLS Policies — notifications ──────────────────────────

-- Users can read their own notifications
CREATE POLICY "notifications_select_own"
  ON public.notifications FOR SELECT
  USING (auth.uid() = user_id);

-- Users can update their own notifications (mark as read)
CREATE POLICY "notifications_update_own"
  ON public.notifications FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Admins can insert notifications for any user
CREATE POLICY "notifications_insert_admin"
  ON public.notifications FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.rol = 'admin'
    )
  );

-- Service role full access (Netlify functions create notifications on payment)
CREATE POLICY "notifications_service_role"
  ON public.notifications
  USING (auth.role() = 'service_role');

-- ── 5. RLS Policies — mentorships ────────────────────────────

-- All authenticated users can read visible mentorships
CREATE POLICY "mentorships_select_authenticated"
  ON public.mentorships FOR SELECT
  TO authenticated
  USING (visible = true);

-- Admins can do full CRUD on mentorships
CREATE POLICY "mentorships_all_admin"
  ON public.mentorships
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.rol = 'admin'
    )
  );

-- Service role full access
CREATE POLICY "mentorships_service_role"
  ON public.mentorships
  USING (auth.role() = 'service_role');

-- ── 6. RLS Policies — site_config ────────────────────────────

-- Anon and authenticated users can read site_config (needed for prices)
CREATE POLICY "site_config_select_public"
  ON public.site_config FOR SELECT
  TO anon, authenticated
  USING (true);

-- Only admins can update site_config
CREATE POLICY "site_config_update_admin"
  ON public.site_config FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.rol = 'admin'
    )
  );

-- Service role full access
CREATE POLICY "site_config_service_role"
  ON public.site_config
  USING (auth.role() = 'service_role');

-- ── 7. Fix functions with mutable search_path ────────────────
-- If you have SECURITY DEFINER functions, set search_path to prevent
-- search_path injection attacks. Replace 'your_function_name' with
-- the actual names shown in the Supabase Security Advisor.

-- Example fix (apply to each flagged function):
-- ALTER FUNCTION public.your_function_name() SET search_path = public, pg_temp;

-- Common Supabase auto-generated functions that may need this:
-- ALTER FUNCTION public.handle_new_user() SET search_path = public, pg_temp;

-- ── 8. Revoke public schema usage from anon/authenticated ────
-- Prevents direct table access bypassing RLS on future tables

-- OPTIONAL — only run if you want strict schema isolation:
-- REVOKE ALL ON SCHEMA public FROM anon;
-- REVOKE ALL ON SCHEMA public FROM authenticated;
-- GRANT USAGE ON SCHEMA public TO anon, authenticated;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
-- GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;

-- ── Notes ────────────────────────────────────────────────────
-- 1. Run this in Supabase SQL Editor → New Query
-- 2. After running, verify in: Authentication → Policies
-- 3. The service_role key (used in Netlify Functions) bypasses RLS by design
-- 4. The anon key (used client-side) is subject to all RLS policies above
-- ─────────────────────────────────────────────────────────────
