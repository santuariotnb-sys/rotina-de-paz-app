-- BLOCO 4 — DEFESA: checkout_config RLS + revoke writes on views
-- Applied to production: 2026-06-16

-- 1. Enable RLS on checkout_config (only service_role can write)
ALTER TABLE public.checkout_config ENABLE ROW LEVEL SECURITY;

-- 2. Allow everyone to read (needed by views and app logic)
CREATE POLICY "checkout_config_read" ON public.checkout_config
  FOR SELECT USING (true);

-- 3. Revoke write grants from anon/authenticated on checkout_config + views
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.checkout_config FROM anon, authenticated;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.vendas_reais FROM anon, authenticated;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.leads_reais FROM anon, authenticated;
