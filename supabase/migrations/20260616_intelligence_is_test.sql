-- ============================================================
-- BLOCO 1: Inteligência no Sistema
-- is_test, checkout_config, views canônicas, src em purchases
-- ============================================================

-- 1. is_test em tabelas-chave
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;
ALTER TABLE public.purchases ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;
ALTER TABLE public.quiz_funnel_events ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;

-- 2. checkout_config (linha de corte e configs globais)
CREATE TABLE IF NOT EXISTS public.checkout_config (
  key text PRIMARY KEY,
  value text NOT NULL,
  description text,
  updated_at timestamptz DEFAULT now()
);
INSERT INTO public.checkout_config (key, value, description)
VALUES ('production_start_at', '2026-06-14T00:00:00Z', 'Linha de corte: dados antes disso são legado/teste')
ON CONFLICT (key) DO NOTHING;

-- 3. Backfill: marcar dados antes da linha de corte como teste
UPDATE public.leads SET is_test = true WHERE created_at < '2026-06-14T00:00:00Z';
UPDATE public.purchases SET is_test = true WHERE created_at < '2026-06-14T00:00:00Z';
UPDATE public.quiz_funnel_events SET is_test = true WHERE created_at < '2026-06-14T00:00:00Z';

-- 4. src (external_id / qs_*) em purchases — chave de join lead↔compra
ALTER TABLE public.purchases ADD COLUMN IF NOT EXISTS src text;
COMMENT ON COLUMN public.purchases.src IS 'external_id (qs_*) do quiz tracking session — chave de join lead↔purchase para atribuição';

-- 5. Views canônicas — fonte única de verdade
CREATE OR REPLACE VIEW public.vendas_reais AS
SELECT * FROM public.purchases
WHERE status = 'confirmed'
  AND is_test = false
  AND created_at >= (SELECT value::timestamptz FROM public.checkout_config WHERE key = 'production_start_at');

CREATE OR REPLACE VIEW public.leads_reais AS
SELECT * FROM public.leads
WHERE is_test = false
  AND created_at >= (SELECT value::timestamptz FROM public.checkout_config WHERE key = 'production_start_at');

-- 6. Função canônica de receita
CREATE OR REPLACE FUNCTION public.receita_real() RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(SUM(gross_value), 0)::numeric / 100 FROM vendas_reais;
$$;

-- 7. Documentação no banco (auto-documentado)
COMMENT ON COLUMN public.leads.is_test IS 'true = evento de teste/dev, nunca conta em métricas';
COMMENT ON COLUMN public.purchases.is_test IS 'true = compra de teste/dev, nunca conta em métricas';
COMMENT ON COLUMN public.quiz_funnel_events.is_test IS 'true = evento de teste/dev, nunca conta em métricas';
COMMENT ON TABLE public.checkout_config IS 'Configurações globais do checkout (linha de corte, flags)';
COMMENT ON VIEW public.vendas_reais IS 'Fonte canônica de vendas: confirmed + !is_test + pós-produção';
COMMENT ON VIEW public.leads_reais IS 'Fonte canônica de leads: !is_test + pós-produção';
COMMENT ON FUNCTION public.receita_real IS 'Receita total canônica em R$ (soma de vendas_reais.gross_value/100)';

-- 8. Grants
GRANT SELECT ON public.vendas_reais TO authenticated;
GRANT SELECT ON public.leads_reais TO authenticated;
GRANT SELECT ON public.checkout_config TO authenticated;
GRANT EXECUTE ON FUNCTION public.receita_real TO authenticated;
