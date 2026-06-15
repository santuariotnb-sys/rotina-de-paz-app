-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: UTM completa (3 colunas novas) + drop overload duplicada
-- Data: 2026-06-14
-- ═══════════════════════════════════════════════════════════════════════════

-- §1  Adicionar utm_medium, utm_content, utm_term em purchases (aditivo, nullable)
ALTER TABLE public.purchases
  ADD COLUMN IF NOT EXISTS utm_medium  text,
  ADD COLUMN IF NOT EXISTS utm_content text,
  ADD COLUMN IF NOT EXISTS utm_term    text;

-- §2  Drop da overload antiga de upsert_tracking_session (5 args, sem p_client_ip).
--     A versão com p_client_ip (6 args) é a única usada pelo Quiz-sacra.
--     Confirmado: nenhum chamador usa a assinatura de 5 args.
DROP FUNCTION IF EXISTS public.upsert_tracking_session(text, text, text, text, text);

-- §3  Garantir GRANT da versão que ficou (6 args)
REVOKE ALL ON FUNCTION public.upsert_tracking_session(text, text, text, text, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.upsert_tracking_session(text, text, text, text, text, text) TO anon, authenticated;

-- §4  Backfill UTM completa a partir de webhook_logs existentes
UPDATE public.purchases p
SET
  utm_source   = COALESCE(p.utm_source,   (wl.payload->'utm'->>'utm_source')),
  utm_campaign = COALESCE(p.utm_campaign,  (wl.payload->'utm'->>'utm_campaign')),
  utm_medium   = COALESCE(p.utm_medium,    (wl.payload->'utm'->>'utm_medium')),
  utm_content  = COALESCE(p.utm_content,   (wl.payload->'utm'->>'utm_content')),
  utm_term     = COALESCE(p.utm_term,      (wl.payload->'utm'->>'utm_term'))
FROM public.webhook_logs wl
WHERE wl.payload->>'sale_id' IS NOT NULL
  AND p.transaction_id LIKE (wl.payload->>'sale_id') || '_%'
  AND (p.utm_medium IS NULL OR p.utm_content IS NULL OR p.utm_term IS NULL);
