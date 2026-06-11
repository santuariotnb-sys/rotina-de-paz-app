import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { assertAdmin } from "./server-auth";

export type FunnelStep = {
  stage: string;
  label: string;
  reached: number;
  drop_pct: number;
};

export const getQuizFunnel = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ days: z.number().int().min(0).max(3650).default(30) }).parse(input))
  .handler(async ({ data, context }): Promise<FunnelStep[]> => {
    await assertAdmin(context.userId);

    // RPC not in generated types yet — cast to bypass
    const { data: rows, error } = await (supabaseAdmin.rpc as any)(
      "analytics_quiz_funnel",
      { p_days: data.days },
    );
    if (error) throw new Error(error.message);
    return (rows ?? []) as FunnelStep[];
  });
