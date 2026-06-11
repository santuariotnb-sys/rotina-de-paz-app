-- ═══════════════════════════════════════════════════════════════
-- Analytics: checkout funnel + full funnel (quiz → compra)
-- Fonte: checkout.checkout_funnel_events + quiz_funnel_events
-- STABLE, SECURITY DEFINER, service_role only
--
-- ROLLBACK:
--   DROP FUNCTION IF EXISTS public.analytics_checkout_funnel(integer);
--   DROP FUNCTION IF EXISTS public.analytics_full_funnel(integer);
-- ═══════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────
-- 1. Checkout funnel: view → form_start → identity → method →
--    payment_info → submit → purchase
--    (decline é KPI à parte, não no funil principal)
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.analytics_checkout_funnel(p_days integer DEFAULT 30)
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
  stages(stage, label, sort_order) AS (
    VALUES
      ('view',         'Chegaram no checkout', 1),
      ('form_start',   'Começaram a preencher', 2),
      ('identity',     'Dados pessoais',       3),
      ('method',       'Escolheram pagamento',  4),
      ('payment_info', 'Info de pagamento',     5),
      ('submit',       'Clicaram pagar',        6),
      ('purchase',     'Pagaram',               7)
  ),
  raw_counts AS (
    SELECT e.stage, count(DISTINCT e.session_id) AS reached
    FROM checkout.checkout_funnel_events e
    WHERE e.created_at >= (SELECT ts FROM cutoff)
      AND e.stage IN ('view','form_start','identity','method','payment_info','submit','purchase')
    GROUP BY e.stage
  ),
  merged AS (
    SELECT s.stage, s.label, s.sort_order,
           coalesce(r.reached, 0) AS reached
    FROM stages s
    LEFT JOIN raw_counts r ON r.stage = s.stage
  ),
  ordered AS (
    SELECT *,
      lag(reached) OVER (ORDER BY sort_order) AS prev_reached
    FROM merged
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

REVOKE EXECUTE ON FUNCTION public.analytics_checkout_funnel(integer) FROM public;
REVOKE EXECUTE ON FUNCTION public.analytics_checkout_funnel(integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.analytics_checkout_funnel(integer) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.analytics_checkout_funnel(integer) TO service_role;

-- ─────────────────────────────────────────────────────────────
-- 2. Full funnel: quiz arrival → Q1..Q7 → CTA → checkout view
--    → form → payment → purchase
--    Join por session_id (coorte única, só sessões instrumentadas)
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
  -- Quiz stages from quiz_funnel_events
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
    SELECT 'q_contact', 'Quiz · Email', 4,
      count(DISTINCT session_id)
    FROM quiz_funnel_events e
    WHERE e.stage = 'contact'
      AND e.created_at >= (SELECT ts FROM cutoff)

    UNION ALL
    SELECT 'q_cta', 'Quiz · CTA', 5,
      count(DISTINCT session_id)
    FROM quiz_funnel_events e
    WHERE e.stage = 'cta'
      AND e.created_at >= (SELECT ts FROM cutoff)
  ),
  -- Checkout stages from checkout_funnel_events
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

REVOKE EXECUTE ON FUNCTION public.analytics_full_funnel(integer) FROM public;
REVOKE EXECUTE ON FUNCTION public.analytics_full_funnel(integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.analytics_full_funnel(integer) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.analytics_full_funnel(integer) TO service_role;
