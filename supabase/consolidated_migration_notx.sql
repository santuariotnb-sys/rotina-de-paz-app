-- ============================================================
-- CONSOLIDATED MIGRATION — Rotina de Paz App
-- Generated: 2026-05-28
-- Safe to run against a DB where leads, quiz_responses,
-- admin_users already exist.
-- ============================================================

-- BEGIN;

-- ============================================================
-- MIGRATION 1: profiles, quiz_responses, functions, triggers
-- ============================================================

-- PROFILES
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  name TEXT,
  archetype TEXT,
  desire TEXT,
  situation TEXT,
  lead_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users read own profile" ON public.profiles;
CREATE POLICY "users read own profile" ON public.profiles
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "users insert own profile" ON public.profiles;
CREATE POLICY "users insert own profile" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "users update own profile" ON public.profiles;
CREATE POLICY "users update own profile" ON public.profiles
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);

-- QUIZ RESPONSES (already exists — use IF NOT EXISTS)
CREATE TABLE IF NOT EXISTS public.quiz_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  archetype TEXT,
  desire TEXT,
  situation TEXT,
  answers JSONB,
  lead_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.quiz_responses TO authenticated;
GRANT ALL ON public.quiz_responses TO service_role;

ALTER TABLE public.quiz_responses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users read own responses" ON public.quiz_responses;
CREATE POLICY "users read own responses" ON public.quiz_responses
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "users insert own responses" ON public.quiz_responses;
CREATE POLICY "users insert own responses" ON public.quiz_responses
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_quiz_responses_user ON public.quiz_responses(user_id, created_at DESC);

-- updated_at trigger function
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS profiles_set_updated_at ON public.profiles;
CREATE TRIGGER profiles_set_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email, name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1))
  )
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- MIGRATION 2: revoke execute on functions
-- ============================================================

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;

-- ============================================================
-- MIGRATION 3: admin foundation + audit log
-- ============================================================

-- ADMIN USERS (already exists — use IF NOT EXISTS)
CREATE TABLE IF NOT EXISTS public.admin_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.admin_users TO authenticated;
GRANT ALL ON public.admin_users TO service_role;

ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

-- security-definer helper to avoid recursive RLS
CREATE OR REPLACE FUNCTION public.is_admin(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_users WHERE user_id = _user_id
  );
$$;

DROP POLICY IF EXISTS "admins read admin_users" ON public.admin_users;
CREATE POLICY "admins read admin_users"
  ON public.admin_users
  FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()));

-- AUDIT LOG
CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID REFERENCES public.admin_users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  resource_type TEXT,
  resource_id TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.admin_audit_logs TO authenticated;
GRANT ALL ON public.admin_audit_logs TO service_role;

ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins read audit logs" ON public.admin_audit_logs;
CREATE POLICY "admins read audit logs"
  ON public.admin_audit_logs
  FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "admins insert audit logs" ON public.admin_audit_logs;
CREATE POLICY "admins insert audit logs"
  ON public.admin_audit_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_admin(auth.uid())
    AND admin_id IN (SELECT id FROM public.admin_users WHERE user_id = auth.uid())
  );

CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.admin_audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_admin_id ON public.admin_audit_logs (admin_id);

-- ============================================================
-- MIGRATION 4: revoke is_admin from public
-- ============================================================

REVOKE EXECUTE ON FUNCTION public.is_admin(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_admin(UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_admin(UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin(UUID) TO service_role;

-- ============================================================
-- MIGRATION 5: re-grant is_admin to authenticated + anon
-- ============================================================

GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO authenticated, anon;

-- ============================================================
-- MIGRATION 6: products, kirvano offers, entitlements, webhook_logs
-- ============================================================

-- ---------- products ----------
CREATE TABLE IF NOT EXISTS public.products (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  cover_url TEXT,
  price_cents INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'BRL',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','archived')),
  kind TEXT NOT NULL DEFAULT 'method' CHECK (kind IN ('method','course','ebook','bundle','other')),
  content_ref JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins manage products" ON public.products;
CREATE POLICY "admins manage products"
  ON public.products
  FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "authenticated read active products" ON public.products;
CREATE POLICY "authenticated read active products"
  ON public.products
  FOR SELECT
  TO authenticated
  USING (status = 'active' OR public.is_admin(auth.uid()));

DROP TRIGGER IF EXISTS set_products_updated_at ON public.products;
CREATE TRIGGER set_products_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------- product_kirvano_offers ----------
CREATE TABLE IF NOT EXISTS public.product_kirvano_offers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  kirvano_offer_id TEXT NOT NULL UNIQUE,
  label TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kirvano_offers_product ON public.product_kirvano_offers(product_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_kirvano_offers TO authenticated;
GRANT ALL ON public.product_kirvano_offers TO service_role;

ALTER TABLE public.product_kirvano_offers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins manage offers" ON public.product_kirvano_offers;
CREATE POLICY "admins manage offers"
  ON public.product_kirvano_offers
  FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- ---------- entitlements ----------
CREATE TABLE IF NOT EXISTS public.entitlements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  source TEXT NOT NULL DEFAULT 'kirvano' CHECK (source IN ('kirvano','manual','migration')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','refunded','canceled','pending')),
  kirvano_transaction_id TEXT,
  kirvano_offer_id TEXT,
  buyer_email TEXT,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_entitlements_user ON public.entitlements(user_id);
CREATE INDEX IF NOT EXISTS idx_entitlements_product ON public.entitlements(product_id);
CREATE INDEX IF NOT EXISTS idx_entitlements_email ON public.entitlements(buyer_email);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.entitlements TO authenticated;
GRANT ALL ON public.entitlements TO service_role;

ALTER TABLE public.entitlements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users read own entitlements" ON public.entitlements;
CREATE POLICY "users read own entitlements"
  ON public.entitlements
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "admins manage entitlements" ON public.entitlements;
CREATE POLICY "admins manage entitlements"
  ON public.entitlements
  FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

DROP TRIGGER IF EXISTS set_entitlements_updated_at ON public.entitlements;
CREATE TRIGGER set_entitlements_updated_at
  BEFORE UPDATE ON public.entitlements
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------- webhook_logs ----------
CREATE TABLE IF NOT EXISTS public.webhook_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  source TEXT NOT NULL DEFAULT 'kirvano',
  event_type TEXT,
  payload JSONB NOT NULL,
  signature TEXT,
  signature_valid BOOLEAN NOT NULL DEFAULT false,
  processed BOOLEAN NOT NULL DEFAULT false,
  processed_at TIMESTAMPTZ,
  error TEXT,
  request_ip TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_webhook_logs_source_created ON public.webhook_logs(source, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_processed ON public.webhook_logs(processed, created_at DESC);

GRANT SELECT, UPDATE ON public.webhook_logs TO authenticated;
GRANT ALL ON public.webhook_logs TO service_role;

ALTER TABLE public.webhook_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins read webhook logs" ON public.webhook_logs;
CREATE POLICY "admins read webhook logs"
  ON public.webhook_logs
  FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "admins update webhook logs" ON public.webhook_logs;
CREATE POLICY "admins update webhook logs"
  ON public.webhook_logs
  FOR UPDATE
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- ============================================================
-- MIGRATION 7: audio_tracks + method-audios storage bucket
-- ============================================================

CREATE TABLE IF NOT EXISTS public.audio_tracks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  day smallint NOT NULL CHECK (day BETWEEN 1 AND 31),
  kind text NOT NULL CHECK (kind IN ('despertar','aquietar','bonus')),
  title text NOT NULL,
  subtitle text,
  duration_seconds integer NOT NULL DEFAULT 0,
  audio_url text,
  transcript text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audio_tracks_product ON public.audio_tracks(product_id, day, kind);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.audio_tracks TO authenticated;
GRANT ALL ON public.audio_tracks TO service_role;

ALTER TABLE public.audio_tracks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins manage audio_tracks" ON public.audio_tracks;
CREATE POLICY "admins manage audio_tracks"
ON public.audio_tracks FOR ALL
TO authenticated
USING (is_admin(auth.uid()))
WITH CHECK (is_admin(auth.uid()));

DROP POLICY IF EXISTS "auth read audio_tracks of active products" ON public.audio_tracks;
CREATE POLICY "auth read audio_tracks of active products"
ON public.audio_tracks FOR SELECT
TO authenticated
USING (
  is_admin(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.id = audio_tracks.product_id AND p.status = 'active'
  )
);

DROP TRIGGER IF EXISTS trg_audio_tracks_updated_at ON public.audio_tracks;
CREATE TRIGGER trg_audio_tracks_updated_at
BEFORE UPDATE ON public.audio_tracks
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Storage bucket for audios
INSERT INTO storage.buckets (id, name, public)
VALUES ('method-audios', 'method-audios', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "public read method-audios" ON storage.objects;
CREATE POLICY "public read method-audios"
ON storage.objects FOR SELECT
USING (bucket_id = 'method-audios');

DROP POLICY IF EXISTS "admins upload method-audios" ON storage.objects;
CREATE POLICY "admins upload method-audios"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'method-audios' AND is_admin(auth.uid()));

DROP POLICY IF EXISTS "admins update method-audios" ON storage.objects;
CREATE POLICY "admins update method-audios"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'method-audios' AND is_admin(auth.uid()));

DROP POLICY IF EXISTS "admins delete method-audios" ON storage.objects;
CREATE POLICY "admins delete method-audios"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'method-audios' AND is_admin(auth.uid()));

-- ============================================================
-- MIGRATION 8: louvores, ebooks, courses, course_lessons + storage
-- ============================================================

-- ============ LOUVORES ============
CREATE TABLE IF NOT EXISTS public.louvores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  book text NOT NULL,
  chapter_index integer NOT NULL DEFAULT 0,
  title text NOT NULL,
  subtitle text,
  duration_seconds integer NOT NULL DEFAULT 0,
  audio_url text,
  is_bonus boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.louvores TO authenticated;
GRANT ALL ON public.louvores TO service_role;

ALTER TABLE public.louvores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins manage louvores" ON public.louvores;
CREATE POLICY "admins manage louvores"
  ON public.louvores FOR ALL TO authenticated
  USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));

DROP POLICY IF EXISTS "auth read louvores" ON public.louvores;
CREATE POLICY "auth read louvores"
  ON public.louvores FOR SELECT TO authenticated
  USING (true);

DROP TRIGGER IF EXISTS trg_louvores_updated_at ON public.louvores;
CREATE TRIGGER trg_louvores_updated_at
  BEFORE UPDATE ON public.louvores
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_louvores_book_sort ON public.louvores(book, sort_order, chapter_index);

-- ============ EBOOKS ============
CREATE TABLE IF NOT EXISTS public.ebooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  subtitle text,
  category text NOT NULL DEFAULT 'bonus' CHECK (category IN ('bonus','colecao','embreve')),
  price_cents integer NOT NULL DEFAULT 0,
  badge text,
  cover_url text,
  file_url text,
  sort_order integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','draft','archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ebooks TO authenticated;
GRANT ALL ON public.ebooks TO service_role;

ALTER TABLE public.ebooks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins manage ebooks" ON public.ebooks;
CREATE POLICY "admins manage ebooks"
  ON public.ebooks FOR ALL TO authenticated
  USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));

DROP POLICY IF EXISTS "auth read active ebooks" ON public.ebooks;
CREATE POLICY "auth read active ebooks"
  ON public.ebooks FOR SELECT TO authenticated
  USING (status = 'active' OR is_admin(auth.uid()));

DROP TRIGGER IF EXISTS trg_ebooks_updated_at ON public.ebooks;
CREATE TRIGGER trg_ebooks_updated_at
  BEFORE UPDATE ON public.ebooks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_ebooks_category_sort ON public.ebooks(category, sort_order);

-- ============ COURSES ============
CREATE TABLE IF NOT EXISTS public.courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  subtitle text,
  badge text,
  cover_url text,
  days smallint NOT NULL DEFAULT 0,
  modules smallint NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','draft','archived')),
  kind text NOT NULL DEFAULT 'devocional' CHECK (kind IN ('devocional','curso')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.courses TO authenticated;
GRANT ALL ON public.courses TO service_role;

ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins manage courses" ON public.courses;
CREATE POLICY "admins manage courses"
  ON public.courses FOR ALL TO authenticated
  USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));

DROP POLICY IF EXISTS "auth read active courses" ON public.courses;
CREATE POLICY "auth read active courses"
  ON public.courses FOR SELECT TO authenticated
  USING (status = 'active' OR is_admin(auth.uid()));

DROP TRIGGER IF EXISTS trg_courses_updated_at ON public.courses;
CREATE TRIGGER trg_courses_updated_at
  BEFORE UPDATE ON public.courses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ COURSE LESSONS ============
CREATE TABLE IF NOT EXISTS public.course_lessons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  module_index smallint NOT NULL DEFAULT 1,
  lesson_index smallint NOT NULL DEFAULT 1,
  title text NOT NULL,
  description text,
  video_url text,
  duration_seconds integer NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.course_lessons TO authenticated;
GRANT ALL ON public.course_lessons TO service_role;

ALTER TABLE public.course_lessons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins manage course_lessons" ON public.course_lessons;
CREATE POLICY "admins manage course_lessons"
  ON public.course_lessons FOR ALL TO authenticated
  USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));

DROP POLICY IF EXISTS "auth read lessons of active courses" ON public.course_lessons;
CREATE POLICY "auth read lessons of active courses"
  ON public.course_lessons FOR SELECT TO authenticated
  USING (
    is_admin(auth.uid()) OR EXISTS (
      SELECT 1 FROM public.courses c
      WHERE c.id = course_lessons.course_id AND c.status = 'active'
    )
  );

DROP TRIGGER IF EXISTS trg_course_lessons_updated_at ON public.course_lessons;
CREATE TRIGGER trg_course_lessons_updated_at
  BEFORE UPDATE ON public.course_lessons
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_course_lessons_course ON public.course_lessons(course_id, module_index, lesson_index);

-- ============ STORAGE BUCKETS ============
INSERT INTO storage.buckets (id, name, public) VALUES
  ('louvores-audios', 'louvores-audios', true),
  ('ebooks-files',    'ebooks-files',    true),
  ('course-videos',   'course-videos',   true)
ON CONFLICT (id) DO NOTHING;

-- Public read
DROP POLICY IF EXISTS "public read louvores-audios" ON storage.objects;
CREATE POLICY "public read louvores-audios"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'louvores-audios');

DROP POLICY IF EXISTS "public read ebooks-files" ON storage.objects;
CREATE POLICY "public read ebooks-files"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'ebooks-files');

DROP POLICY IF EXISTS "public read course-videos" ON storage.objects;
CREATE POLICY "public read course-videos"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'course-videos');

-- Admin write/update/delete
DROP POLICY IF EXISTS "admins write louvores-audios" ON storage.objects;
CREATE POLICY "admins write louvores-audios"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'louvores-audios' AND is_admin(auth.uid()));
DROP POLICY IF EXISTS "admins update louvores-audios" ON storage.objects;
CREATE POLICY "admins update louvores-audios"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'louvores-audios' AND is_admin(auth.uid()));
DROP POLICY IF EXISTS "admins delete louvores-audios" ON storage.objects;
CREATE POLICY "admins delete louvores-audios"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'louvores-audios' AND is_admin(auth.uid()));

DROP POLICY IF EXISTS "admins write ebooks-files" ON storage.objects;
CREATE POLICY "admins write ebooks-files"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'ebooks-files' AND is_admin(auth.uid()));
DROP POLICY IF EXISTS "admins update ebooks-files" ON storage.objects;
CREATE POLICY "admins update ebooks-files"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'ebooks-files' AND is_admin(auth.uid()));
DROP POLICY IF EXISTS "admins delete ebooks-files" ON storage.objects;
CREATE POLICY "admins delete ebooks-files"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'ebooks-files' AND is_admin(auth.uid()));

DROP POLICY IF EXISTS "admins write course-videos" ON storage.objects;
CREATE POLICY "admins write course-videos"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'course-videos' AND is_admin(auth.uid()));
DROP POLICY IF EXISTS "admins update course-videos" ON storage.objects;
CREATE POLICY "admins update course-videos"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'course-videos' AND is_admin(auth.uid()));
DROP POLICY IF EXISTS "admins delete course-videos" ON storage.objects;
CREATE POLICY "admins delete course-videos"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'course-videos' AND is_admin(auth.uid()));

-- ============================================================
-- MIGRATION 9: required_product_id, has_entitlement, grant_entitlement_manual
-- ============================================================

-- Required product gating on content tables
ALTER TABLE public.ebooks  ADD COLUMN IF NOT EXISTS required_product_id uuid;
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS required_product_id uuid;

CREATE INDEX IF NOT EXISTS idx_ebooks_required_product  ON public.ebooks(required_product_id);
CREATE INDEX IF NOT EXISTS idx_courses_required_product ON public.courses(required_product_id);
CREATE INDEX IF NOT EXISTS idx_entitlements_user_status ON public.entitlements(user_id, status);

-- Security-definer: check active entitlement for current user (admins bypass)
CREATE OR REPLACE FUNCTION public.has_entitlement(_product_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    _product_id IS NULL
    OR public.is_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.entitlements e
      WHERE e.user_id = auth.uid()
        AND e.product_id = _product_id
        AND e.status = 'active'
    );
$$;

-- Admin helper: manually grant entitlement to a user by email
CREATE OR REPLACE FUNCTION public.grant_entitlement_manual(_email text, _product_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_ent_id  uuid;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT user_id INTO v_user_id FROM public.profiles WHERE lower(email) = lower(_email) LIMIT 1;
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'user_not_found:%', _email;
  END IF;

  INSERT INTO public.entitlements (user_id, product_id, source, status, buyer_email, granted_at, metadata)
  VALUES (v_user_id, _product_id, 'manual', 'active', _email, now(), jsonb_build_object('granted_by', auth.uid()))
  RETURNING id INTO v_ent_id;

  RETURN v_ent_id;
END;
$$;

REVOKE ALL ON FUNCTION public.grant_entitlement_manual(text, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.grant_entitlement_manual(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_entitlement(uuid) TO authenticated;

-- ============================================================
-- MIGRATION 10: checkout_url, is_free_preview, refined audio policy
-- ============================================================

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS checkout_url text;
ALTER TABLE public.audio_tracks ADD COLUMN IF NOT EXISTS is_free_preview boolean NOT NULL DEFAULT false;

-- Refine read policy on audio_tracks: free preview OR entitlement OR admin
DROP POLICY IF EXISTS "auth read audio_tracks of active products" ON public.audio_tracks;
DROP POLICY IF EXISTS "auth read audio_tracks gated" ON public.audio_tracks;
CREATE POLICY "auth read audio_tracks gated"
ON public.audio_tracks
FOR SELECT
TO authenticated
USING (
  is_admin(auth.uid())
  OR is_free_preview = true
  OR EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.id = audio_tracks.product_id
      AND p.status = 'active'
      AND public.has_entitlement(p.id)
  )
);

-- ============================================================
-- MIGRATION 11: leads (public quiz), quiz_responses updates,
--               FK integrity, triggers, security revokes
-- ============================================================

-- A. LEADS + QUIZ PUBLICO

-- 1. Tabela leads (already exists — use IF NOT EXISTS)
CREATE TABLE IF NOT EXISTS public.leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text,
  email text,
  archetype text,
  scores jsonb NOT NULL DEFAULT '{}'::jsonb,
  desire text,
  situation text,
  risk_flag boolean NOT NULL DEFAULT false,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  referrer text,
  ip text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT INSERT ON public.leads TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.leads TO authenticated;
GRANT ALL ON public.leads TO service_role;

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon insert leads" ON public.leads;
CREATE POLICY "anon insert leads"
  ON public.leads FOR INSERT TO anon
  WITH CHECK (true);

DROP POLICY IF EXISTS "auth insert leads" ON public.leads;
CREATE POLICY "auth insert leads"
  ON public.leads FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "admins read leads" ON public.leads;
CREATE POLICY "admins read leads"
  ON public.leads FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "admins update leads" ON public.leads;
CREATE POLICY "admins update leads"
  ON public.leads FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "admins delete leads" ON public.leads;
CREATE POLICY "admins delete leads"
  ON public.leads FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_leads_created ON public.leads (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_archetype ON public.leads (archetype);
CREATE INDEX IF NOT EXISTS idx_leads_email ON public.leads (lower(email));
CREATE INDEX IF NOT EXISTS idx_leads_utm_source ON public.leads (utm_source);

-- 2. quiz_responses: permitir anonimo + alinhar uso real
ALTER TABLE public.quiz_responses ALTER COLUMN user_id DROP NOT NULL;

GRANT INSERT ON public.quiz_responses TO anon;

DROP POLICY IF EXISTS "anon insert quiz_responses" ON public.quiz_responses;
CREATE POLICY "anon insert quiz_responses"
  ON public.quiz_responses FOR INSERT TO anon
  WITH CHECK (user_id IS NULL);

DROP POLICY IF EXISTS "admins read quiz_responses" ON public.quiz_responses;
CREATE POLICY "admins read quiz_responses"
  ON public.quiz_responses FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));

-- ============================================================
-- B. INTEGRIDADE: FKs, triggers, indice unico
-- ============================================================

-- FKs (with DO blocks for idempotency)
DO $$ BEGIN
  ALTER TABLE public.entitlements
    ADD CONSTRAINT entitlements_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.entitlements
    ADD CONSTRAINT entitlements_product_id_fkey
    FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.product_kirvano_offers
    ADD CONSTRAINT product_kirvano_offers_product_id_fkey
    FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.audio_tracks
    ADD CONSTRAINT audio_tracks_product_id_fkey
    FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.course_lessons
    ADD CONSTRAINT course_lessons_course_id_fkey
    FOREIGN KEY (course_id) REFERENCES public.courses(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.courses
    ADD CONSTRAINT courses_required_product_id_fkey
    FOREIGN KEY (required_product_id) REFERENCES public.products(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.ebooks
    ADD CONSTRAINT ebooks_required_product_id_fkey
    FOREIGN KEY (required_product_id) REFERENCES public.products(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.admin_users
    ADD CONSTRAINT admin_users_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.admin_audit_logs
    ADD CONSTRAINT admin_audit_logs_admin_id_fkey
    FOREIGN KEY (admin_id) REFERENCES public.admin_users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Triggers updated_at
DROP TRIGGER IF EXISTS trg_entitlements_updated ON public.entitlements;
CREATE TRIGGER trg_entitlements_updated BEFORE UPDATE ON public.entitlements
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_products_updated ON public.products;
CREATE TRIGGER trg_products_updated BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_courses_updated ON public.courses;
CREATE TRIGGER trg_courses_updated BEFORE UPDATE ON public.courses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_course_lessons_updated ON public.course_lessons;
CREATE TRIGGER trg_course_lessons_updated BEFORE UPDATE ON public.course_lessons
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_audio_tracks_updated ON public.audio_tracks;
CREATE TRIGGER trg_audio_tracks_updated BEFORE UPDATE ON public.audio_tracks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_ebooks_updated ON public.ebooks;
CREATE TRIGGER trg_ebooks_updated BEFORE UPDATE ON public.ebooks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_louvores_updated ON public.louvores;
CREATE TRIGGER trg_louvores_updated BEFORE UPDATE ON public.louvores
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_profiles_updated ON public.profiles;
CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_leads_updated ON public.leads;
CREATE TRIGGER trg_leads_updated BEFORE UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Indice unico case-insensitive em profiles.email
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_email_unique
  ON public.profiles (lower(email)) WHERE email IS NOT NULL;

-- ============================================================
-- FINAL SECURITY: revoke EXECUTE on SECURITY DEFINER functions
-- ============================================================
REVOKE EXECUTE ON FUNCTION public.is_admin(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.has_entitlement(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.has_entitlement(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.grant_entitlement_manual(text, uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_entitlement_manual(text, uuid) TO authenticated;

-- COMMIT;
