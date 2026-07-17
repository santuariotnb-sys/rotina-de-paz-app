import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { assertAdmin } from "./server-auth";

export type MetaOverlayRow = {
  adName: string;
  spend: number;
  leads: number;
  sales: number;
  revenue: number;
  cpl: number | null;
  roas: number | null;
};

/**
 * Overlay Meta — cruza gasto/impressões da Meta (meta_ad_insights) com leads e
 * vendas reais do funil, por ad_id. Chama a RPC public.metrics_meta_overlay
 * (SECURITY DEFINER) via service_role, pois meta_ad_insights é RLS-gated.
 * Recebe { days } e calcula o `since` no mesmo padrão das outras telas.
 */
export const getMetaOverlay = createServerFn({ method: "GET" })
  .validator((d: { days: number }) => d)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }): Promise<MetaOverlayRow[]> => {
    await assertAdmin(context.userId);

    // Janela de tempo — mesma lógica de sinceISO/constants:
    // days === 0 → meia-noite BRT (UTC-3); senão, N dias atrás.
    let since: string;
    if (data.days === 0) {
      const todaySP = new Date().toLocaleDateString("sv", { timeZone: "America/Sao_Paulo" });
      since = todaySP + "T03:00:00.000Z";
    } else {
      since = new Date(Date.now() - data.days * 86400_000).toISOString();
    }

    const { data: rows, error } = await (supabaseAdmin as any).rpc("metrics_meta_overlay", {
      p_since: since,
    });
    if (error) throw new Error(error.message);

    return (rows ?? []).map((r: any) => ({
      adName: r.ad_name ?? "—",
      spend: Number(r.spend ?? 0),
      leads: Number(r.leads ?? 0),
      sales: Number(r.sales ?? 0),
      revenue: Number(r.revenue ?? 0),
      cpl: r.cpl == null ? null : Number(r.cpl),
      roas: r.roas == null ? null : Number(r.roas),
    }));
  });
