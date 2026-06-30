-- Sprint 0 #3 — Funis contavam eventos de teste como reais.
--
-- Causa-raiz: analytics_quiz_funnel e analytics_full_funnel liam quiz_funnel_events
-- direto, SEM filtrar is_test. Logo qualquer evento marcado is_test=true inflava o
-- funil. (quiz_funnel_events TEM coluna is_test; verificado ao vivo: 1969 reais / 0 teste
-- hoje, mas o histórico pode misturar.)
--
-- Correção mínima: adicionar `AND e.is_test = false` a TODA subquery sobre
-- quiz_funnel_events. Demais partes idênticas à definição viva (pg_get_functiondef).
--
-- GAP registrado (fora do Sprint 0): checkout.checkout_funnel_events NÃO tem coluna
-- is_test, então o ramo de checkout em analytics_full_funnel fica inalterado. Marcar
-- sessões de teste no checkout é pré-requisito para filtrá-lo (TODO p/ o dono).
--
-- Grants preservados: EXECUTE só p/ postgres + service_role (sem anon/authenticated),
-- conforme hardening de 2026-06-29. CREATE OR REPLACE mantém grants; reafirmados abaixo.

-- ============================================================================
-- 1) analytics_quiz_funnel — funil só do quiz
-- ============================================================================
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
    WHERE e.stage = 'arrival' AND e.is_test = false AND e.created_at >= (SELECT ts FROM cutoff)

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
      AND e.is_test = false
      AND e.created_at >= (SELECT ts FROM cutoff)
    GROUP BY e.question_key

    UNION ALL

    -- Fix A1: contact_gate vem ANTES do result no fluxo real do Quiz
    -- Fluxo: Q7 → contact (WhatsApp) → result → offer → CTA
    SELECT 'contact_gate', 'WhatsApp capturado', 9,
      count(DISTINCT session_id)
    FROM quiz_funnel_events e
    WHERE e.stage IN ('contact', 'contact_gate') AND e.is_test = false AND e.created_at >= (SELECT ts FROM cutoff)

    UNION ALL

    SELECT 'result', 'Viu resultado', 10,
      count(DISTINCT session_id)
    FROM quiz_funnel_events e
    WHERE e.stage = 'result' AND e.is_test = false AND e.created_at >= (SELECT ts FROM cutoff)

    UNION ALL

    SELECT 'offer', 'Viu oferta', 11,
      count(DISTINCT session_id)
    FROM quiz_funnel_events e
    WHERE e.stage = 'offer' AND e.is_test = false AND e.created_at >= (SELECT ts FROM cutoff)

    UNION ALL

    SELECT 'cta', 'Clicou comprar (IC)', 12,
      count(DISTINCT session_id)
    FROM quiz_funnel_events e
    WHERE e.stage = 'cta' AND e.is_test = false AND e.created_at >= (SELECT ts FROM cutoff)
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

REVOKE ALL ON FUNCTION public.analytics_quiz_funnel(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.analytics_quiz_funnel(integer) TO service_role;

-- ============================================================================
-- 2) analytics_full_funnel — quiz + checkout
--    Ramo quiz_funnel_events: filtra is_test. Ramo checkout: inalterado (sem coluna).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.analytics_full_funnel(p_days integer DEFAULT 30)
 RETURNS TABLE(stage text, label text, reached bigint, drop_pct numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'checkout'
AS $function$
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
    WHERE e.stage = 'arrival' AND e.is_test = false AND e.created_at >= (SELECT ts FROM cutoff)

    UNION ALL
    SELECT 'q_q1', 'Quiz · Q1', 2,
      count(DISTINCT session_id)
    FROM quiz_funnel_events e
    WHERE e.stage = 'question' AND e.question_key = 'situacao'
      AND e.is_test = false
      AND e.created_at >= (SELECT ts FROM cutoff)

    UNION ALL
    SELECT 'q_q7', 'Quiz · Q7', 3,
      count(DISTINCT session_id)
    FROM quiz_funnel_events e
    WHERE e.stage = 'question' AND e.question_key = 'desejo'
      AND e.is_test = false
      AND e.created_at >= (SELECT ts FROM cutoff)

    UNION ALL
    -- Fix A1: contact → IN ('contact','contact_gate') + label WhatsApp
    SELECT 'q_contact', 'Quiz · WhatsApp', 4,
      count(DISTINCT session_id)
    FROM quiz_funnel_events e
    WHERE e.stage IN ('contact', 'contact_gate')
      AND e.is_test = false
      AND e.created_at >= (SELECT ts FROM cutoff)

    UNION ALL
    SELECT 'q_cta', 'Quiz · CTA', 5,
      count(DISTINCT session_id)
    FROM quiz_funnel_events e
    WHERE e.stage = 'cta'
      AND e.is_test = false
      AND e.created_at >= (SELECT ts FROM cutoff)
  ),
  checkout_counts AS (
    -- TODO(dono): checkout.checkout_funnel_events não tem coluna is_test; este ramo
    -- não filtra teste. Marcar sessões de teste no checkout para fechar o gap.
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
$function$;

REVOKE ALL ON FUNCTION public.analytics_full_funnel(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.analytics_full_funnel(integer) TO service_role;
