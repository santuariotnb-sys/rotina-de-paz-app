-- ═══════════════════════════════════════════════════════════════════
-- FIX: persist_lead perdia TODO lead vindo de anúncio
-- ═══════════════════════════════════════════════════════════════════
-- O quiz envia p_fbclid (Meta) e p_gclid (Google) sempre que a URL tem
-- fbclid/gclid — o que acontece em 100% do tráfego pago. A função não
-- tinha esses parâmetros → PostgREST respondia PGRST202 (assinatura não
-- encontrada) → o erro era engolido no front → o lead NÃO era gravado.
-- Aqui adicionamos as colunas e os parâmetros correspondentes.

-- 1. Colunas de click-id na tabela leads
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS fbclid text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS gclid  text;

-- 2. Recria persist_lead com p_fbclid / p_gclid.
--    DROP da assinatura antiga (11 args) antes do CREATE para não criar
--    um overload ambíguo (duas persist_lead → PGRST203 em chamadas sem clickid).
DROP FUNCTION IF EXISTS public.persist_lead(
  text, text, jsonb, text, text, boolean, text, text, text, text, text
);

CREATE OR REPLACE FUNCTION public.persist_lead(
  p_name text DEFAULT NULL,
  p_archetype text DEFAULT NULL,
  p_scores jsonb DEFAULT NULL,
  p_desire text DEFAULT NULL,
  p_situation text DEFAULT NULL,
  p_risk_flag boolean DEFAULT false,
  p_utm_source text DEFAULT NULL,
  p_utm_medium text DEFAULT NULL,
  p_utm_campaign text DEFAULT NULL,
  p_utm_content text DEFAULT NULL,
  p_utm_term text DEFAULT NULL,
  p_fbclid text DEFAULT NULL,
  p_gclid text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO leads (
    name, archetype, scores, desire, situation, risk_flag,
    utm_source, utm_medium, utm_campaign, utm_content, utm_term,
    fbclid, gclid
  ) VALUES (
    p_name, p_archetype, p_scores, p_desire, p_situation, p_risk_flag,
    p_utm_source, p_utm_medium, p_utm_campaign, p_utm_content, p_utm_term,
    p_fbclid, p_gclid
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- 3. Mesmos grants da original (anon grava via RPC, sem INSERT direto na tabela)
GRANT EXECUTE ON FUNCTION public.persist_lead(
  text, text, jsonb, text, text, boolean, text, text, text, text, text, text, text
) TO anon, authenticated;
