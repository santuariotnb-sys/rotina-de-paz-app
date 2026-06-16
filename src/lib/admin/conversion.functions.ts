import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { assertAdmin } from "./server-auth";

/**
 * Returns the set of lead IDs that converted (have a matching vendas_reais row).
 * Join: leads_reais.external_id = vendas_reais.src
 */
export const getConvertedLeadIds = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<string[]> => {
    await assertAdmin(context.userId);

    const sb = supabaseAdmin as any;
    // Get all vendas_reais.src values (these are the external_ids of leads that bought)
    const { data: vendas, error: vErr } = await sb
      .from("vendas_reais")
      .select("src");
    if (vErr) throw new Error(vErr.message);

    const srcs = new Set(
      (vendas ?? [])
        .map((v: any) => v.src)
        .filter((s: any) => s != null && s !== ""),
    );
    if (srcs.size === 0) return [];

    // Get lead IDs whose external_id matches a vendas_reais.src
    const { data: leads, error: lErr } = await sb
      .from("leads_reais")
      .select("id, external_id")
      .not("external_id", "is", null);
    if (lErr) throw new Error(lErr.message);

    return (leads ?? [])
      .filter((l: any) => srcs.has(l.external_id))
      .map((l: any) => l.id as string);
  });
