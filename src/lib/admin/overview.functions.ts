import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { assertAdmin } from "./server-auth";

export type OverviewKpis = {
  totalLeads: number;
  totalMembers: number;
  leadsToday: number;
  archetypeBreakdown: Record<string, number>;
  totalRevenue: number;
  totalPurchases: number;
  revenueToday: number;
  purchasesToday: number;
};

export const getOverviewKpis = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<OverviewKpis> => {
    await assertAdmin(context.userId);
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayISO = todayStart.toISOString();

    // Views canônicas — fonte única de verdade (já filtram is_test e production_start_at)
    const sb = supabaseAdmin as any;
    const [leadsRes, membersRes, todayLeadsRes, archRes, revenueRes, todayRevenueRes] = await Promise.all([
      sb.from("leads_reais").select("*", { count: "exact", head: true }),
      supabaseAdmin.from("profiles").select("*", { count: "exact", head: true }),
      sb.from("leads_reais").select("*", { count: "exact", head: true }).gte("created_at", todayISO),
      sb.from("leads_reais").select("archetype").not("archetype", "is", null),
      sb.from("vendas_reais").select("gross_value"),
      sb.from("vendas_reais").select("gross_value").gte("created_at", todayISO),
    ]);

    const breakdown: Record<string, number> = {};
    (archRes.data ?? []).forEach((row: any) => {
      const a = row.archetype ?? "indefinido";
      breakdown[a] = (breakdown[a] ?? 0) + 1;
    });

    const totalRevenue = (revenueRes.data ?? []).reduce((s: number, r: any) => s + (r.gross_value ?? 0), 0) / 100;
    const revenueToday = (todayRevenueRes.data ?? []).reduce((s: number, r: any) => s + (r.gross_value ?? 0), 0) / 100;

    return {
      totalLeads: leadsRes.count ?? 0,
      totalMembers: membersRes.count ?? 0,
      leadsToday: todayLeadsRes.count ?? 0,
      archetypeBreakdown: breakdown,
      totalRevenue,
      totalPurchases: (revenueRes.data ?? []).length,
      revenueToday,
      purchasesToday: (todayRevenueRes.data ?? []).length,
    };
  });
