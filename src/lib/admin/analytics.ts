/**
 * Tipos de retorno das RPCs de analytics.
 * As funções que chamavam RPCs via anon client foram removidas (dead code
 * após REVOKE). As server functions em analytics.functions.ts são a fonte real.
 */

export type TopSegment = {
  archetype: string;
  situation: string;
  desire: string;
  total_leads: number;
  with_whatsapp: number;
  purchasers: number;
  conv_rate: number;
  revenue: number;
};

export type FunnelData = {
  total_leads: number;
  with_archetype: number;
  with_whatsapp: number;
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
