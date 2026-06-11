-- Fix: analytics_quiz_funnel(p_days=0) retornava 0 eventos
-- p_days=0 agora significa "hoje desde meia-noite São Paulo (UTC-3)"
-- Sem horário de verão no Brasil → UTC-3 fixo = T03:00:00Z

CREATE OR REPLACE FUNCTION public.analytics_quiz_funnel(p_days integer DEFAULT 30)
RETURNS TABLE (
  stage text,
  label text,
  reached bigint,
  drop_pct numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH cutoff(ts) AS (
    SELECT CASE WHEN p_days = 0
      THEN (date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo'))
           AT TIME ZONE 'America/Sao_Paulo'
      ELSE now() - make_interval(days => p_days)
    END
  ),
  raw_funnel AS (
    -- Arrival
    SELECT 'arrival' AS stage, 'Chegaram' AS label, 1 AS sort_order,
      count(DISTINCT session_id) AS reached
    FROM quiz_funnel_events e
    WHERE e.stage = 'arrival'
      AND e.created_at >= (SELECT ts FROM cutoff)

    UNION ALL

    -- Questions Q1-Q7
    SELECT
      'q_' || e.question_key,
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
        WHEN 'situacao' THEN 2
        WHEN 'risco' THEN 3
        WHEN 'sintoma' THEN 4
        WHEN 'comportamento' THEN 5
        WHEN 'frase' THEN 6
        WHEN 'espiritual' THEN 7
        WHEN 'desejo' THEN 8
      END,
      count(DISTINCT session_id)
    FROM quiz_funnel_events e
    WHERE e.stage = 'question'
      AND e.question_key IS NOT NULL
      AND e.created_at >= (SELECT ts FROM cutoff)
    GROUP BY e.question_key

    UNION ALL

    -- Contact (email captured in quiz)
    SELECT 'contact', 'Email capturado', 9,
      count(DISTINCT session_id)
    FROM quiz_funnel_events e
    WHERE e.stage = 'contact'
      AND e.created_at >= (SELECT ts FROM cutoff)

    UNION ALL

    -- CTA clicked
    SELECT 'cta', 'Clicou comprar', 10,
      count(DISTINCT session_id)
    FROM quiz_funnel_events e
    WHERE e.stage = 'cta'
      AND e.created_at >= (SELECT ts FROM cutoff)
  ),
  ordered AS (
    SELECT *,
      lag(reached) OVER (ORDER BY sort_order) AS prev_reached
    FROM raw_funnel
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

-- Manter grants existentes (service_role only)
REVOKE EXECUTE ON FUNCTION public.analytics_quiz_funnel(integer) FROM public;
REVOKE EXECUTE ON FUNCTION public.analytics_quiz_funnel(integer) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.analytics_quiz_funnel(integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.analytics_quiz_funnel(integer) TO service_role;

-- ROLLBACK:
-- Reaplicar 20260611_analytics_quiz_funnel.sql (versão original sem cutoff CTE)
