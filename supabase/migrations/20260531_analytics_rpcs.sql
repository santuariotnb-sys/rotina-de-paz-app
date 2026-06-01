-- ============================================================
-- RPCs de Analytics — Rotina de Paz
-- 5 funções para consulta via admin dashboard e Claude Code
-- ============================================================

-- RPC 1: Nicho Vencedor (top segmentos por conversão)
CREATE OR REPLACE FUNCTION public.analytics_top_segments(
  p_days integer DEFAULT 30,
  p_min_leads integer DEFAULT 20
)
RETURNS TABLE (
  archetype text,
  situation text,
  desire text,
  total_leads bigint,
  with_email bigint,
  purchasers bigint,
  conv_rate numeric,
  revenue numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    l.archetype,
    l.situation,
    l.desire,
    COUNT(*)::bigint AS total_leads,
    COUNT(l.email)::bigint AS with_email,
    COUNT(DISTINCT p.buyer_email)::bigint AS purchasers,
    ROUND(COUNT(DISTINCT p.buyer_email)::numeric / NULLIF(COUNT(*), 0) * 100, 1) AS conv_rate,
    COALESCE(SUM(p.gross_value), 0)::numeric / 100 AS revenue
  FROM leads l
  LEFT JOIN purchases p
    ON lower(l.email) = lower(p.buyer_email)
    AND p.status = 'confirmed'
  WHERE l.archetype IS NOT NULL
    AND l.created_at >= now() - (p_days || ' days')::interval
  GROUP BY l.archetype, l.situation, l.desire
  HAVING COUNT(*) >= p_min_leads
  ORDER BY conv_rate DESC
  LIMIT 20;
$$;

-- RPC 2: Funil completo (taxas por etapa)
CREATE OR REPLACE FUNCTION public.analytics_funnel(p_days integer DEFAULT 30)
RETURNS TABLE (
  total_leads bigint,
  with_archetype bigint,
  with_email bigint,
  purchasers bigint,
  upsell_buyers bigint,
  downsell_buyers bigint,
  total_revenue numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH period_leads AS (
    SELECT * FROM leads WHERE created_at >= now() - (p_days || ' days')::interval
  ),
  period_purchases AS (
    SELECT * FROM purchases WHERE status = 'confirmed' AND created_at >= now() - (p_days || ' days')::interval
  )
  SELECT
    (SELECT COUNT(*) FROM period_leads)::bigint,
    (SELECT COUNT(*) FROM period_leads WHERE archetype IS NOT NULL)::bigint,
    (SELECT COUNT(*) FROM period_leads WHERE email IS NOT NULL)::bigint,
    (SELECT COUNT(DISTINCT buyer_email) FROM period_purchases WHERE product_type = 'principal')::bigint,
    (SELECT COUNT(DISTINCT buyer_email) FROM period_purchases WHERE product_type = 'upsell')::bigint,
    (SELECT COUNT(DISTINCT buyer_email) FROM period_purchases WHERE product_type = 'downsell')::bigint,
    (SELECT COALESCE(SUM(gross_value), 0)::numeric / 100 FROM period_purchases);
$$;

-- RPC 3: Receita por produto/tipo
CREATE OR REPLACE FUNCTION public.analytics_revenue_breakdown(p_days integer DEFAULT 30)
RETURNS TABLE (
  product_name text,
  product_type text,
  sales bigint,
  revenue numeric,
  refunds bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    product_name,
    product_type,
    COUNT(*) FILTER (WHERE status = 'confirmed')::bigint AS sales,
    COALESCE(SUM(gross_value) FILTER (WHERE status = 'confirmed'), 0)::numeric / 100 AS revenue,
    COUNT(*) FILTER (WHERE status = 'refunded')::bigint AS refunds
  FROM purchases
  WHERE created_at >= now() - (p_days || ' days')::interval
  GROUP BY product_name, product_type
  ORDER BY revenue DESC;
$$;

-- RPC 4: Respostas do quiz × conversão
CREATE OR REPLACE FUNCTION public.analytics_quiz_conversion(p_days integer DEFAULT 30)
RETURNS TABLE (
  question_key text,
  answer_value text,
  answer_text text,
  total bigint,
  converted bigint,
  conv_rate numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    qr.question_key,
    qr.answer_value,
    qr.answer_text,
    COUNT(*)::bigint AS total,
    COUNT(p.id)::bigint AS converted,
    ROUND(COUNT(p.id)::numeric / NULLIF(COUNT(*), 0) * 100, 1) AS conv_rate
  FROM quiz_responses qr
  JOIN leads l ON l.id = qr.lead_id
  LEFT JOIN purchases p
    ON lower(l.email) = lower(p.buyer_email)
    AND p.status = 'confirmed'
  WHERE l.created_at >= now() - (p_days || ' days')::interval
    AND qr.question_key IS NOT NULL
  GROUP BY qr.question_key, qr.answer_value, qr.answer_text
  ORDER BY qr.question_key, conv_rate DESC;
$$;

-- RPC 5: Cohort semanal
CREATE OR REPLACE FUNCTION public.analytics_cohort_weekly(p_weeks integer DEFAULT 12)
RETURNS TABLE (
  cohort_week date,
  leads bigint,
  buyers bigint,
  revenue numeric,
  conv_pct numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    date_trunc('week', l.created_at)::date AS cohort_week,
    COUNT(DISTINCT l.id)::bigint AS leads,
    COUNT(DISTINCT p.buyer_email)::bigint AS buyers,
    COALESCE(SUM(p.gross_value), 0)::numeric / 100 AS revenue,
    ROUND(COUNT(DISTINCT p.buyer_email)::numeric / NULLIF(COUNT(DISTINCT l.id), 0) * 100, 1) AS conv_pct
  FROM leads l
  LEFT JOIN purchases p
    ON lower(l.email) = lower(p.buyer_email)
    AND p.status = 'confirmed'
  WHERE l.archetype IS NOT NULL
    AND l.created_at >= now() - (p_weeks || ' weeks')::interval
  GROUP BY cohort_week
  ORDER BY cohort_week DESC;
$$;

-- Permissões
GRANT EXECUTE ON FUNCTION public.analytics_top_segments TO authenticated;
GRANT EXECUTE ON FUNCTION public.analytics_funnel TO authenticated;
GRANT EXECUTE ON FUNCTION public.analytics_revenue_breakdown TO authenticated;
GRANT EXECUTE ON FUNCTION public.analytics_quiz_conversion TO authenticated;
GRANT EXECUTE ON FUNCTION public.analytics_cohort_weekly TO authenticated;
