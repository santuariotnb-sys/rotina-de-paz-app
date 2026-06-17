-- ============================================================
-- BLOCO 1: Fix contact_gate allowlist + email→WhatsApp em RPCs
-- Date: 2026-06-17
--
-- A1: track_quiz_step rejeitava 'contact_gate' (allowlist).
--     Quiz-sacra envia 'contact_gate', dados perdidos silenciosamente.
--     Fix: adicionar 'contact_gate' à allowlist (forward-only).
--     Leitura: analytics_quiz_funnel + analytics_full_funnel
--     agora filtram stage IN ('contact','contact_gate').
--
-- A2/Labels: RPCs que contavam email→agora contam whatsapp.
--     analytics_funnel: with_email → with_whatsapp
--     analytics_top_segments: COUNT(ld.email) → COUNT(ld.whatsapp)
--     analytics_full_funnel: 'Quiz · Email' → 'Quiz · WhatsApp'
--
-- ROLLBACK:
--   Reverter track_quiz_step allowlist removendo 'contact_gate'
--   DROP FUNCTION IF EXISTS public.analytics_quiz_funnel(integer);
--   DROP FUNCTION IF EXISTS public.analytics_full_funnel(integer);
--   DROP FUNCTION IF EXISTS public.analytics_funnel(integer);
--   DROP FUNCTION IF EXISTS public.analytics_top_segments(integer, integer);
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. Fix track_quiz_step: adicionar 'contact_gate' à allowlist
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.track_quiz_step(
  p_session_id text,
  p_stage text,
  p_question_key text DEFAULT NULL,
  p_version text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  -- Input validation
  IF p_session_id IS NULL OR length(p_session_id) > 100 THEN RETURN; END IF;
  IF p_stage NOT IN ('arrival', 'question', 'contact', 'contact_gate', 'result', 'offer', 'cta') THEN RETURN; END IF;
  IF p_question_key IS NOT NULL AND length(p_question_key) > 50 THEN RETURN; END IF;
  IF p_version IS NOT NULL AND length(p_version) > 30 THEN RETURN; END IF;

  -- Rate limit: max 200 events per session (anti-flood)
  IF (SELECT count(*) FROM quiz_funnel_events WHERE session_id = p_session_id) >= 200 THEN RETURN; END IF;

  INSERT INTO quiz_funnel_events (session_id, stage, question_key, quiz_version)
  VALUES (p_session_id, p_stage, p_question_key, p_version);
END;
$$;

-- ─────────────────────────────────────────────────────────────
-- 2. Fix analytics_quiz_funnel: contact → IN ('contact','contact_gate')
--    + label 'WhatsApp capturado' (já estava, manter)
--    + nota forward-only no label
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.analytics_quiz_funnel(p_days integer DEFAULT 30)
 RETURNS TABLE(stage text, label text, reached bigint, drop_pct numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH cutoff(ts) AS (
    SELECT CASE WHEN p_days = 0
      THEN (date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo'))
           AT TIME ZONE 'America/Sao_Paulo'
      ELSE now() - make_interval(days => p_days)
    END
  ),
  raw_funnel AS (
    SELECT 'arrival' AS stage, 'Chegaram' AS label, 1 AS sort_order,
      count(DISTINCT session_id) AS reached
    FROM quiz_funnel_events e
    WHERE e.stage = 'arrival' AND e.created_at >= (SELECT ts FROM cutoff)

    UNION ALL

    SELECT 'q_' || e.question_key,
      CASE e.question_key
        WHEN 'situacao' THEN 'Q1 · Situação'
        WHEN 'risco' THEN 'Q2 · Risco'
        WHEN 'sintoma' THEN 'Q3 · Sintoma'
        WHEN 'comportamento' THEN 'Q4 · Comportamento'
        WHEN 'frase' THEN 'Q5 · Frase'
        WHEN 'espiritual' THEN 'Q6 · Espiritual'
        WHEN 'desejo' THEN 'Q7 · Desejo'
      END,
      CASE e.question_key
        WHEN 'situacao' THEN 2 WHEN 'risco' THEN 3 WHEN 'sintoma' THEN 4
        WHEN 'comportamento' THEN 5 WHEN 'frase' THEN 6
        WHEN 'espiritual' THEN 7 WHEN 'desejo' THEN 8
      END,
      count(DISTINCT session_id)
    FROM quiz_funnel_events e
    WHERE e.stage = 'question' AND e.question_key IS NOT NULL
      AND e.created_at >= (SELECT ts FROM cutoff)
    GROUP BY e.question_key

    UNION ALL

    -- Fix A1: contact_gate vem ANTES do result no fluxo real do Quiz
    -- Fluxo: Q7 → contact (WhatsApp) → result → offer → CTA
    SELECT 'contact_gate', 'WhatsApp capturado', 9,
      count(DISTINCT session_id)
    FROM quiz_funnel_events e
    WHERE e.stage IN ('contact', 'contact_gate') AND e.created_at >= (SELECT ts FROM cutoff)

    UNION ALL

    SELECT 'result', 'Viu resultado', 10,
      count(DISTINCT session_id)
    FROM quiz_funnel_events e
    WHERE e.stage = 'result' AND e.created_at >= (SELECT ts FROM cutoff)

    UNION ALL

    SELECT 'offer', 'Viu oferta', 11,
      count(DISTINCT session_id)
    FROM quiz_funnel_events e
    WHERE e.stage = 'offer' AND e.created_at >= (SELECT ts FROM cutoff)

    UNION ALL

    SELECT 'cta', 'Clicou comprar (IC)', 12,
      count(DISTINCT session_id)
    FROM quiz_funnel_events e
    WHERE e.stage = 'cta' AND e.created_at >= (SELECT ts FROM cutoff)
  ),
  ordered AS (
    SELECT *, lag(reached) OVER (ORDER BY sort_order) AS prev_reached
    FROM raw_funnel
  )
  SELECT o.stage, o.label, o.reached,
    CASE
      WHEN o.prev_reached IS NULL OR o.prev_reached = 0 THEN 0
      ELSE round((1 - o.reached::numeric / o.prev_reached) * 100, 1)
    END AS drop_pct
  FROM ordered o
  ORDER BY o.sort_order;
$function$;

-- ─────────────────────────────────────────────────────────────
-- 3. Fix analytics_full_funnel: contact→contact_gate + label WhatsApp
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.analytics_full_funnel(p_days integer DEFAULT 30)
RETURNS TABLE (
  stage     text,
  label     text,
  reached   bigint,
  drop_pct  numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, checkout
AS $$
  WITH cutoff(ts) AS (
    SELECT CASE WHEN p_days = 0
      THEN (date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo'))
           AT TIME ZONE 'America/Sao_Paulo'
      ELSE now() - make_interval(days => p_days)
    END
  ),
  quiz_counts AS (
    SELECT 'q_arrival' AS stage, 'Quiz · Chegaram' AS label, 1 AS sort_order,
      count(DISTINCT session_id) AS reached
    FROM quiz_funnel_events e
    WHERE e.stage = 'arrival' AND e.created_at >= (SELECT ts FROM cutoff)

    UNION ALL
    SELECT 'q_q1', 'Quiz · Q1', 2,
      count(DISTINCT session_id)
    FROM quiz_funnel_events e
    WHERE e.stage = 'question' AND e.question_key = 'situacao'
      AND e.created_at >= (SELECT ts FROM cutoff)

    UNION ALL
    SELECT 'q_q7', 'Quiz · Q7', 3,
      count(DISTINCT session_id)
    FROM quiz_funnel_events e
    WHERE e.stage = 'question' AND e.question_key = 'desejo'
      AND e.created_at >= (SELECT ts FROM cutoff)

    UNION ALL
    -- Fix A1: contact → IN ('contact','contact_gate') + label WhatsApp
    SELECT 'q_contact', 'Quiz · WhatsApp', 4,
      count(DISTINCT session_id)
    FROM quiz_funnel_events e
    WHERE e.stage IN ('contact', 'contact_gate')
      AND e.created_at >= (SELECT ts FROM cutoff)

    UNION ALL
    SELECT 'q_cta', 'Quiz · CTA', 5,
      count(DISTINCT session_id)
    FROM quiz_funnel_events e
    WHERE e.stage = 'cta'
      AND e.created_at >= (SELECT ts FROM cutoff)
  ),
  checkout_counts AS (
    SELECT 'c_view' AS stage, 'Checkout · Chegaram' AS label, 6 AS sort_order,
      count(DISTINCT e.session_id) AS reached
    FROM checkout.checkout_funnel_events e
    WHERE e.stage = 'view' AND e.created_at >= (SELECT ts FROM cutoff)

    UNION ALL
    SELECT 'c_identity', 'Checkout · Dados', 7,
      count(DISTINCT e.session_id)
    FROM checkout.checkout_funnel_events e
    WHERE e.stage = 'identity' AND e.created_at >= (SELECT ts FROM cutoff)

    UNION ALL
    SELECT 'c_submit', 'Checkout · Pagar', 8,
      count(DISTINCT e.session_id)
    FROM checkout.checkout_funnel_events e
    WHERE e.stage = 'submit' AND e.created_at >= (SELECT ts FROM cutoff)

    UNION ALL
    SELECT 'c_purchase', 'Checkout · Compra', 9,
      count(DISTINCT e.session_id)
    FROM checkout.checkout_funnel_events e
    WHERE e.stage = 'purchase' AND e.created_at >= (SELECT ts FROM cutoff)
  ),
  combined AS (
    SELECT * FROM quiz_counts
    UNION ALL
    SELECT * FROM checkout_counts
  ),
  ordered AS (
    SELECT *,
      lag(reached) OVER (ORDER BY sort_order) AS prev_reached
    FROM combined
  )
  SELECT
    o.stage,
    o.label,
    o.reached,
    CASE
      WHEN o.prev_reached IS NULL OR o.prev_reached = 0 THEN 0
      ELSE round((1 - o.reached::numeric / o.prev_reached) * 100, 1)
    END AS drop_pct
  FROM ordered o
  ORDER BY o.sort_order;
$$;

-- ─────────────────────────────────────────────────────────────
-- 4. Fix analytics_funnel: with_email → with_whatsapp
--    DROP needed: return type changed (with_email → with_whatsapp)
-- ─────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.analytics_funnel(integer);
CREATE OR REPLACE FUNCTION public.analytics_funnel(p_days integer DEFAULT 30)
RETURNS TABLE (
  total_leads bigint,
  with_archetype bigint,
  with_whatsapp bigint,
  purchasers bigint,
  upsell_buyers bigint,
  downsell_buyers bigint,
  total_revenue numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH period_leads AS (
    SELECT * FROM leads_reais WHERE created_at >= now() - (p_days || ' days')::interval
  ),
  period_purchases AS (
    SELECT * FROM vendas_reais WHERE created_at >= now() - (p_days || ' days')::interval
  )
  SELECT
    (SELECT COUNT(*) FROM period_leads)::bigint,
    (SELECT COUNT(*) FROM period_leads WHERE archetype IS NOT NULL)::bigint,
    (SELECT COUNT(*) FROM period_leads WHERE whatsapp IS NOT NULL)::bigint,
    (SELECT COUNT(DISTINCT buyer_email) FROM period_purchases WHERE product_type = 'principal')::bigint,
    (SELECT COUNT(DISTINCT buyer_email) FROM period_purchases WHERE product_type = 'upsell')::bigint,
    (SELECT COUNT(DISTINCT buyer_email) FROM period_purchases WHERE product_type = 'downsell')::bigint,
    (SELECT COALESCE(SUM(gross_value), 0)::numeric / 100 FROM period_purchases);
$$;

-- ─────────────────────────────────────────────────────────────
-- 5. Fix analytics_top_segments: COUNT(email) → COUNT(whatsapp)
--    DROP needed: return type changed (with_email → with_whatsapp)
-- ─────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.analytics_top_segments(integer, integer);
CREATE OR REPLACE FUNCTION public.analytics_top_segments(
  p_days integer DEFAULT 30,
  p_min_leads integer DEFAULT 20
)
RETURNS TABLE (
  archetype text,
  situation text,
  desire text,
  total_leads bigint,
  with_whatsapp bigint,
  purchasers bigint,
  conv_rate numeric,
  revenue numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH lead_data AS (
    SELECT l.id, l.archetype, l.situation, l.desire, l.whatsapp, l.external_id
    FROM leads_reais l
    WHERE l.archetype IS NOT NULL
      AND l.created_at >= now() - (p_days || ' days')::interval
  ),
  purchase_agg AS (
    SELECT p.src, SUM(p.gross_value) AS total_value
    FROM vendas_reais p
    WHERE p.src IS NOT NULL
    GROUP BY p.src
  )
  SELECT
    ld.archetype,
    ld.situation,
    ld.desire,
    COUNT(*)::bigint AS total_leads,
    COUNT(ld.whatsapp)::bigint AS with_whatsapp,
    COUNT(pa.src)::bigint AS purchasers,
    ROUND(COUNT(pa.src)::numeric / NULLIF(COUNT(*), 0) * 100, 1) AS conv_rate,
    COALESCE(SUM(pa.total_value), 0)::numeric / 100 AS revenue
  FROM lead_data ld
  LEFT JOIN purchase_agg pa ON ld.external_id = pa.src
  GROUP BY ld.archetype, ld.situation, ld.desire
  HAVING COUNT(*) >= p_min_leads
  ORDER BY conv_rate DESC
  LIMIT 20;
$$;

-- ─────────────────────────────────────────────────────────────
-- Grants: re-apply after DROP+CREATE (DROP removes grants)
-- ─────────────────────────────────────────────────────────────

-- analytics_funnel + analytics_top_segments: authenticated (server fn via supabaseAdmin)
REVOKE EXECUTE ON FUNCTION public.analytics_funnel(integer) FROM public;
REVOKE EXECUTE ON FUNCTION public.analytics_funnel(integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.analytics_funnel(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.analytics_funnel(integer) TO service_role;

REVOKE EXECUTE ON FUNCTION public.analytics_top_segments(integer, integer) FROM public;
REVOKE EXECUTE ON FUNCTION public.analytics_top_segments(integer, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.analytics_top_segments(integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.analytics_top_segments(integer, integer) TO service_role;
