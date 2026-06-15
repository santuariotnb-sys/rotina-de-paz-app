-- Fix analytics_quiz_funnel: adicionar stages result + offer, corrigir label contact
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

    SELECT 'result', 'Viu resultado', 9,
      count(DISTINCT session_id)
    FROM quiz_funnel_events e
    WHERE e.stage = 'result' AND e.created_at >= (SELECT ts FROM cutoff)

    UNION ALL

    SELECT 'offer', 'Viu oferta', 10,
      count(DISTINCT session_id)
    FROM quiz_funnel_events e
    WHERE e.stage = 'offer' AND e.created_at >= (SELECT ts FROM cutoff)

    UNION ALL

    SELECT 'contact', 'WhatsApp capturado', 11,
      count(DISTINCT session_id)
    FROM quiz_funnel_events e
    WHERE e.stage = 'contact' AND e.created_at >= (SELECT ts FROM cutoff)

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
