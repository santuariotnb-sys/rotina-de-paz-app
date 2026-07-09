import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { assertAdmin } from "./server-auth";

/**
 * Returns the set of lead IDs that converted (have a matching vendas_reais row).
 * Join: leads_reais.external_id = vendas_reais.src
 * Optional quizId filters the leads side by quiz_id (só quando presente).
 */
export const getConvertedLeadIds = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ quizId: z.string().nullish() }).parse(input ?? {}))
  .handler(async ({ data, context }): Promise<string[]> => {
    await assertAdmin(context.userId);
    const quizId = data?.quizId ?? null;

    const sb = supabaseAdmin as any;
    // Get all vendas_reais.src values (these are the external_ids of leads that bought)
    const { data: vendas, error: vErr } = await sb.from("vendas_reais").select("src");
    if (vErr) throw new Error(vErr.message);

    const srcs = new Set(
      (vendas ?? []).map((v: any) => v.src).filter((s: any) => s != null && s !== ""),
    );
    if (srcs.size === 0) return [];

    // Get lead IDs whose external_id matches a vendas_reais.src
    let leadsQuery = sb
      .from("leads_reais")
      .select("id, external_id")
      .not("external_id", "is", null);
    if (quizId) leadsQuery = leadsQuery.eq("quiz_id", quizId);
    const { data: leads, error: lErr } = await leadsQuery;
    if (lErr) throw new Error(lErr.message);

    return (leads ?? [])
      .filter((l: any) => srcs.has(l.external_id))
      .map((l: any) => l.id as string);
  });
