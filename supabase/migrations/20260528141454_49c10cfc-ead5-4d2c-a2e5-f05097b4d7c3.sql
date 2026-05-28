
-- ============================================================
-- A. LEADS + QUIZ PÚBLICO
-- ============================================================

-- 1. Tabela leads
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

CREATE POLICY "anon insert leads"
  ON public.leads FOR INSERT TO anon
  WITH CHECK (true);

CREATE POLICY "auth insert leads"
  ON public.leads FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "admins read leads"
  ON public.leads FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE POLICY "admins update leads"
  ON public.leads FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "admins delete leads"
  ON public.leads FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_leads_created ON public.leads (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_archetype ON public.leads (archetype);
CREATE INDEX IF NOT EXISTS idx_leads_email ON public.leads (lower(email));
CREATE INDEX IF NOT EXISTS idx_leads_utm_source ON public.leads (utm_source);

-- 2. quiz_responses: permitir anônimo + alinhar uso real
ALTER TABLE public.quiz_responses ALTER COLUMN user_id DROP NOT NULL;

GRANT INSERT ON public.quiz_responses TO anon;

CREATE POLICY "anon insert quiz_responses"
  ON public.quiz_responses FOR INSERT TO anon
  WITH CHECK (user_id IS NULL);

CREATE POLICY "admins read quiz_responses"
  ON public.quiz_responses FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));

-- ============================================================
-- B. INTEGRIDADE: FKs, triggers, índice único
-- ============================================================

-- FKs (com IF NOT EXISTS via DO block para idempotência)
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

-- Índice único case-insensitive em profiles.email
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_email_unique
  ON public.profiles (lower(email)) WHERE email IS NOT NULL;

-- ============================================================
-- Segurança: revogar EXECUTE público das funções SECURITY DEFINER
-- ============================================================
REVOKE EXECUTE ON FUNCTION public.is_admin(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.has_entitlement(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.has_entitlement(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.grant_entitlement_manual(text, uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_entitlement_manual(text, uuid) TO authenticated;
