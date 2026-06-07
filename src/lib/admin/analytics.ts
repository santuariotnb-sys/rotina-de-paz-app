import { supabase } from "@/integrations/supabase/client";

export type TopSegment = {
  archetype: string;
  situation: string;
  desire: string;
  total_leads: number;
  with_email: number;
  purchasers: number;
  conv_rate: number;
  revenue: number;
};

export type FunnelData = {
  total_leads: number;
  with_archetype: number;
  with_email: number;
  purchasers: number;
  upsell_buyers: number;
  downsell_buyers: number;
  total_revenue: number;
};

export type RevenueRow = {
  product_name: string;
  product_type: string;
  sales: number;
  revenue: number;
  refunds: number;
};

export type QuizConversionRow = {
  question_key: string;
  answer_value: string;
  answer_text: string;
  total: number;
  converted: number;
  conv_rate: number;
};

export type CohortRow = {
  cohort_week: string;
  leads: number;
  buyers: number;
  revenue: number;
  conv_pct: number;
};

// RPCs recebem p_days inteiro; days=0 ("Hoje") usa 1 (últimas 24h) para não retornar vazio
function effectiveDays(days: number): number {
  return days === 0 ? 1 : days;
}

export async function fetchTopSegments(days = 30): Promise<TopSegment[]> {
  const { data, error } = await supabase.rpc("analytics_top_segments" as any, {
    p_days: effectiveDays(days),
    p_min_leads: 20,
  });
  if (error) throw error;
  return (data ?? []) as TopSegment[];
}

export async function fetchFunnel(days = 30): Promise<FunnelData> {
  const { data, error } = await supabase.rpc("analytics_funnel" as any, {
    p_days: effectiveDays(days),
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return (row ?? {
    total_leads: 0,
    with_archetype: 0,
    with_email: 0,
    purchasers: 0,
    upsell_buyers: 0,
    downsell_buyers: 0,
    total_revenue: 0,
  }) as FunnelData;
}

export async function fetchRevenueBreakdown(days = 30): Promise<RevenueRow[]> {
  const { data, error } = await supabase.rpc("analytics_revenue_breakdown" as any, {
    p_days: effectiveDays(days),
  });
  if (error) throw error;
  return (data ?? []) as RevenueRow[];
}

export async function fetchQuizConversion(days = 30): Promise<QuizConversionRow[]> {
  const { data, error } = await supabase.rpc("analytics_quiz_conversion" as any, {
    p_days: effectiveDays(days),
  });
  if (error) throw error;
  return (data ?? []) as QuizConversionRow[];
}

export async function fetchCohortWeekly(weeks = 12): Promise<CohortRow[]> {
  const { data, error } = await supabase.rpc("analytics_cohort_weekly" as any, { p_weeks: weeks });
  if (error) throw error;
  return (data ?? []) as CohortRow[];
}
