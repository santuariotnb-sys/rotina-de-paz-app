-- Tabela de compras confirmadas (uma linha por transacao)
CREATE TABLE IF NOT EXISTS public.purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  external_id text,
  transaction_id text UNIQUE,
  product_name text NOT NULL,
  product_type text NOT NULL CHECK (product_type IN ('principal', 'order_bump', 'upsell', 'downsell')),
  gross_value integer NOT NULL,
  status text NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'refunded', 'chargeback')),
  kirvano_offer_id text,
  buyer_email text,
  utm_source text,
  utm_campaign text,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins manage purchases" ON public.purchases
  FOR ALL TO authenticated USING (public.is_admin(auth.uid()));

GRANT SELECT ON public.purchases TO authenticated;
GRANT ALL ON public.purchases TO service_role;

CREATE INDEX idx_purchases_lead ON public.purchases (lead_id);
CREATE INDEX idx_purchases_type ON public.purchases (product_type, created_at DESC);
CREATE INDEX idx_purchases_created ON public.purchases (created_at DESC);
CREATE INDEX idx_purchases_email ON public.purchases (lower(buyer_email));
