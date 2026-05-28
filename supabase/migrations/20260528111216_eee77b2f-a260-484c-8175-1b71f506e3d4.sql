-- =====================================================================
-- FASE 2 — Produtos, ofertas Kirvano, entitlements e webhook logs
-- =====================================================================

-- ---------- products ----------
CREATE TABLE public.products (
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

CREATE POLICY "admins manage products"
  ON public.products
  FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "authenticated read active products"
  ON public.products
  FOR SELECT
  TO authenticated
  USING (status = 'active' OR public.is_admin(auth.uid()));

CREATE TRIGGER set_products_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------- product_kirvano_offers ----------
CREATE TABLE public.product_kirvano_offers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  kirvano_offer_id TEXT NOT NULL UNIQUE,
  label TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_kirvano_offers_product ON public.product_kirvano_offers(product_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_kirvano_offers TO authenticated;
GRANT ALL ON public.product_kirvano_offers TO service_role;

ALTER TABLE public.product_kirvano_offers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins manage offers"
  ON public.product_kirvano_offers
  FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- ---------- entitlements ----------
CREATE TABLE public.entitlements (
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

CREATE INDEX idx_entitlements_user ON public.entitlements(user_id);
CREATE INDEX idx_entitlements_product ON public.entitlements(product_id);
CREATE INDEX idx_entitlements_email ON public.entitlements(buyer_email);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.entitlements TO authenticated;
GRANT ALL ON public.entitlements TO service_role;

ALTER TABLE public.entitlements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users read own entitlements"
  ON public.entitlements
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR public.is_admin(auth.uid()));

CREATE POLICY "admins manage entitlements"
  ON public.entitlements
  FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE TRIGGER set_entitlements_updated_at
  BEFORE UPDATE ON public.entitlements
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------- webhook_logs ----------
CREATE TABLE public.webhook_logs (
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

CREATE INDEX idx_webhook_logs_source_created ON public.webhook_logs(source, created_at DESC);
CREATE INDEX idx_webhook_logs_processed ON public.webhook_logs(processed, created_at DESC);

GRANT SELECT, UPDATE ON public.webhook_logs TO authenticated;
GRANT ALL ON public.webhook_logs TO service_role;

ALTER TABLE public.webhook_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins read webhook logs"
  ON public.webhook_logs
  FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE POLICY "admins update webhook logs"
  ON public.webhook_logs
  FOR UPDATE
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));