import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { assertAdmin } from "./server-auth";
import type { TopSegment, FunnelData, RevenueRow, QuizConversionRow, CohortRow } from "./analytics";

const daysSchema = z.object({
  days: z.number().int().min(0).max(3650).default(30),
  quizId: z.string().nullish(),
});

function effectiveDays(days: number): number {
  return days === 0 ? 1 : days;
}

export const getTopSegments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => daysSchema.parse(input))
  .handler(async ({ data, context }): Promise<TopSegment[]> => {
    await assertAdmin(context.userId);
    const { data: rows, error } = await (supabaseAdmin.rpc as any)("analytics_top_segments", {
      p_days: effectiveDays(data.days),
      p_min_leads: 20,
      p_quiz_id: data.quizId ?? null,
    });
    if (error) throw new Error(error.message);
    return (rows ?? []) as TopSegment[];
  });

export const getFunnel = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => daysSchema.parse(input))
  .handler(async ({ data, context }): Promise<FunnelData> => {
    await assertAdmin(context.userId);
    const { data: result, error } = await (supabaseAdmin.rpc as any)("analytics_funnel", {
      p_days: effectiveDays(data.days),
      p_quiz_id: data.quizId ?? null,
    });
    if (error) throw new Error(error.message);
    const row = Array.isArray(result) ? result[0] : result;
    return (row ?? {
      total_leads: 0,
      with_archetype: 0,
      with_whatsapp: 0,
      purchasers: 0,
      upsell_buyers: 0,
      downsell_buyers: 0,
      total_revenue: 0,
    }) as FunnelData;
  });

export const getRevenueBreakdown = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => daysSchema.parse(input))
  .handler(async ({ data, context }): Promise<RevenueRow[]> => {
    await assertAdmin(context.userId);
    const { data: rows, error } = await (supabaseAdmin.rpc as any)("analytics_revenue_breakdown", {
      p_days: effectiveDays(data.days),
      p_quiz_id: data.quizId ?? null,
    });
    if (error) throw new Error(error.message);
    return (rows ?? []) as RevenueRow[];
  });

export const getQuizConversion = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => daysSchema.parse(input))
  .handler(async ({ data, context }): Promise<QuizConversionRow[]> => {
    await assertAdmin(context.userId);
    const { data: rows, error } = await (supabaseAdmin.rpc as any)("analytics_quiz_conversion", {
      p_days: effectiveDays(data.days),
      p_quiz_id: data.quizId ?? null,
    });
    if (error) throw new Error(error.message);
    return (rows ?? []) as QuizConversionRow[];
  });

export const getCohortWeekly = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({ weeks: z.number().int().min(1).max(52).default(12), quizId: z.string().nullish() })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<CohortRow[]> => {
    await assertAdmin(context.userId);
    const { data: rows, error } = await (supabaseAdmin.rpc as any)("analytics_cohort_weekly", {
      p_weeks: data.weeks,
      p_quiz_id: data.quizId ?? null,
    });
    if (error) throw new Error(error.message);
    return (rows ?? []) as CohortRow[];
  });
