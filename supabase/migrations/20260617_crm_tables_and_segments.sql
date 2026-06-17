-- CRM: tabelas de opt-out, envios, e RPC de segmentos
-- ROLLBACK: DROP TABLE IF EXISTS crm_opt_outs, crm_sends CASCADE; DROP FUNCTION IF EXISTS crm_segments(int);

BEGIN;

-- ============================================================
-- 1. crm_opt_outs — opt-out UNIFICADO (email + whatsapp)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.crm_opt_outs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id     uuid REFERENCES public.leads(id),
  contact     text NOT NULL,           -- email ou whatsapp (formato E.164)
  channel     text NOT NULL CHECK (channel IN ('email', 'whatsapp')),
  reason      text,                    -- ex.: 'unsubscribe_link', 'manual', 'bounce'
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (contact, channel)
);

-- RLS: só service_role lê/escreve (server functions)
ALTER TABLE public.crm_opt_outs ENABLE ROW LEVEL SECURITY;
-- Sem policies = bloqueado pra anon/authenticated, service_role bypassa RLS

-- ============================================================
-- 2. crm_sends — log de envios (dedup por campanha×contato)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.crm_sends (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id      uuid REFERENCES public.leads(id),
  contact      text NOT NULL,
  channel      text NOT NULL CHECK (channel IN ('email', 'whatsapp')),
  campaign_id  text NOT NULL,          -- identificador da campanha (slug)
  template     text,                   -- nome do template usado
  status       text NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'delivered', 'failed', 'bounced')),
  metadata     jsonb DEFAULT '{}',
  sent_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (contact, campaign_id, channel)  -- dedup: 1 envio por campanha×contato×canal
);

ALTER TABLE public.crm_sends ENABLE ROW LEVEL SECURITY;

-- Índices para queries de segmento
CREATE INDEX IF NOT EXISTS idx_crm_sends_campaign ON public.crm_sends(campaign_id);
CREATE INDEX IF NOT EXISTS idx_crm_sends_contact ON public.crm_sends(contact, channel);
CREATE INDEX IF NOT EXISTS idx_crm_opt_outs_contact ON public.crm_opt_outs(contact, channel);

-- ============================================================
-- 3. RPC: crm_segments — retorna contagens dos segmentos aprovados
--    Exclusão multi-sinal: src↔external_id + email↔buyer_email + whatsapp↔phone
-- ============================================================
CREATE OR REPLACE FUNCTION public.crm_segments(p_days int DEFAULT 90)
RETURNS TABLE (
  segment_key   text,
  segment_label text,
  total         bigint,
  com_whatsapp  bigint,
  com_email     bigint,
  alcancavel    bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH buyer_phones AS (
    SELECT DISTINCT payload->'customer'->>'phone_number' as phone
    FROM public.webhook_logs
    WHERE source = 'kirvano'
      AND event_type = 'SALE_APPROVED'
      AND processed = true
      AND payload->'customer'->>'phone_number' IS NOT NULL
  ),
  non_buyers AS (
    SELECT l.*
    FROM public.leads l
    WHERE l.is_test = false
      AND l.created_at >= now() - (p_days || ' days')::interval
      AND NOT EXISTS (
        SELECT 1 FROM public.purchases p
        WHERE p.is_test = false AND p.status = 'confirmed'
          AND p.src IS NOT NULL
          AND replace(p.src, 'qs_', '') = l.external_id
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.purchases p
        WHERE p.is_test = false AND p.status = 'confirmed'
          AND l.email IS NOT NULL AND p.buyer_email = l.email
      )
      AND NOT EXISTS (
        SELECT 1 FROM buyer_phones bp
        WHERE l.whatsapp IS NOT NULL AND bp.phone = l.whatsapp
      )
  )
  -- Lead sem compra (total)
  SELECT
    'lead_sem_compra'::text,
    'Lead sem compra'::text,
    count(*)::bigint,
    count(n.whatsapp)::bigint,
    count(n.email)::bigint,
    count(CASE WHEN n.whatsapp IS NOT NULL OR n.email IS NOT NULL THEN 1 END)::bigint
  FROM non_buyers n

  UNION ALL

  -- Por arquétipo
  SELECT
    ('arquetipo_' || n.archetype)::text,
    ('Arquétipo: ' || initcap(n.archetype))::text,
    count(*)::bigint,
    count(n.whatsapp)::bigint,
    count(n.email)::bigint,
    count(CASE WHEN n.whatsapp IS NOT NULL OR n.email IS NOT NULL THEN 1 END)::bigint
  FROM non_buyers n
  WHERE n.archetype IS NOT NULL
  GROUP BY n.archetype

  UNION ALL

  -- Comprou sem upsell (join por buyer_email — external_id é NULL nas purchases)
  SELECT
    'comprou_sem_upsell'::text,
    'Comprou sem upsell'::text,
    count(DISTINCT p.buyer_email)::bigint,
    0::bigint,  -- purchases não têm whatsapp direto
    count(DISTINCT p.buyer_email)::bigint,
    count(DISTINCT p.buyer_email)::bigint
  FROM public.purchases p
  WHERE p.is_test = false
    AND p.status = 'confirmed'
    AND p.product_type = 'principal'
    AND NOT EXISTS (
      SELECT 1 FROM public.purchases u
      WHERE u.buyer_email = p.buyer_email
        AND u.product_type IN ('upsell', 'downsell', 'order_bump')
        AND u.is_test = false
        AND u.status = 'confirmed'
    );
END;
$$;

-- Grant APENAS service_role (nunca authenticated)
REVOKE ALL ON FUNCTION public.crm_segments(int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.crm_segments(int) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.crm_segments(int) TO service_role;

-- ============================================================
-- 4. RPC: crm_segment_contacts — retorna contatos de um segmento
-- ============================================================
CREATE OR REPLACE FUNCTION public.crm_segment_contacts(
  p_segment_key text,
  p_channel text DEFAULT 'email'
)
RETURNS TABLE (
  lead_id     uuid,
  name        text,
  contact     text,
  archetype   text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_segment_key = 'comprou_sem_upsell' THEN
    -- Contatos de compradores sem upsell
    RETURN QUERY
    SELECT
      NULL::uuid as lead_id,
      NULL::text as name,
      p.buyer_email as contact,
      NULL::text as archetype
    FROM public.purchases p
    WHERE p.is_test = false
      AND p.status = 'confirmed'
      AND p.product_type = 'principal'
      AND NOT EXISTS (
        SELECT 1 FROM public.purchases u
        WHERE u.buyer_email = p.buyer_email
          AND u.product_type IN ('upsell', 'downsell', 'order_bump')
          AND u.is_test = false
          AND u.status = 'confirmed'
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.crm_opt_outs o
        WHERE o.contact = p.buyer_email AND o.channel = 'email'
      );
    RETURN;
  END IF;

  -- Segmentos de leads
  RETURN QUERY
  WITH buyer_phones AS (
    SELECT DISTINCT payload->'customer'->>'phone_number' as phone
    FROM public.webhook_logs
    WHERE source = 'kirvano'
      AND event_type = 'SALE_APPROVED'
      AND processed = true
      AND payload->'customer'->>'phone_number' IS NOT NULL
  ),
  non_buyers AS (
    SELECT l.*
    FROM public.leads l
    WHERE l.is_test = false
      AND NOT EXISTS (
        SELECT 1 FROM public.purchases p2
        WHERE p2.is_test = false AND p2.status = 'confirmed'
          AND p2.src IS NOT NULL
          AND replace(p2.src, 'qs_', '') = l.external_id
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.purchases p2
        WHERE p2.is_test = false AND p2.status = 'confirmed'
          AND l.email IS NOT NULL AND p2.buyer_email = l.email
      )
      AND NOT EXISTS (
        SELECT 1 FROM buyer_phones bp
        WHERE l.whatsapp IS NOT NULL AND bp.phone = l.whatsapp
      )
  )
  SELECT
    n.id as lead_id,
    n.name,
    CASE WHEN p_channel = 'whatsapp' THEN n.whatsapp ELSE n.email END as contact,
    n.archetype
  FROM non_buyers n
  WHERE
    CASE
      WHEN p_segment_key = 'lead_sem_compra' THEN true
      WHEN p_segment_key LIKE 'arquetipo_%' THEN n.archetype = replace(p_segment_key, 'arquetipo_', '')
      ELSE false
    END
    AND CASE
      WHEN p_channel = 'whatsapp' THEN n.whatsapp IS NOT NULL AND n.consent_timestamp IS NOT NULL
      ELSE n.email IS NOT NULL
    END
    -- Excluir opt-outs
    AND NOT EXISTS (
      SELECT 1 FROM public.crm_opt_outs o
      WHERE o.contact = CASE WHEN p_channel = 'whatsapp' THEN n.whatsapp ELSE n.email END
        AND o.channel = p_channel
    );
END;
$$;

REVOKE ALL ON FUNCTION public.crm_segment_contacts(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.crm_segment_contacts(text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.crm_segment_contacts(text, text) TO service_role;

COMMIT;
