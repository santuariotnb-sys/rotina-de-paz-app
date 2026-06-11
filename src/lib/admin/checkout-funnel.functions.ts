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

const daysSchema = z.object({
  days: z.number().int().min(0).max(3650).default(30),
});

export const getCheckoutFunnel = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => daysSchema.parse(input))
  .handler(async ({ data, context }): Promise<FunnelStep[]> => {
    await assertAdmin(context.userId);

    const { data: rows, error } = await (supabaseAdmin.rpc as any)(
      "analytics_checkout_funnel",
      { p_days: data.days },
    );
    if (error) throw new Error(error.message);
    return (rows ?? []) as FunnelStep[];
  });

export const getFullFunnel = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => daysSchema.parse(input))
  .handler(async ({ data, context }): Promise<FunnelStep[]> => {
    await assertAdmin(context.userId);

    const { data: rows, error } = await (supabaseAdmin.rpc as any)(
      "analytics_full_funnel",
      { p_days: data.days },
    );
    if (error) throw new Error(error.message);
    return (rows ?? []) as FunnelStep[];
  });
