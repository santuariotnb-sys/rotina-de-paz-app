import { supabase } from "@/integrations/supabase/client";

export type OverviewKpis = {
  totalLeads: number;
  totalMembers: number;
  responsesToday: number;
  archetypeBreakdown: Record<string, number>;
  totalRevenue: number;
  totalPurchases: number;
};

export async function fetchOverviewKpis(): Promise<OverviewKpis> {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  // purchases não está nos tipos gerados (criada via Dashboard) — cast necessário
  const sb = supabase as any;
  const [leadsRes, membersRes, todayLeadsRes, archRes, revenueRes, purchasesRes] = await Promise.all([
    // Leads REAIS (não quiz_responses que infla ~7x)
    supabase.from("leads").select("*", { count: "exact", head: true }),
    supabase.from("profiles").select("*", { count: "exact", head: true }),
    // Leads de HOJE (não respostas do quiz)
    supabase
      .from("leads")
      .select("*", { count: "exact", head: true })
      .gte("created_at", todayStart.toISOString()),
    // Arquétipo de LEADS (não quiz_responses onde é NULL nos novos)
    supabase.from("leads").select("archetype").not("archetype", "is", null),
    // Receita de PURCHASES (não entitlements × price_cents)
    sb.from("purchases").select("gross_value").eq("status", "confirmed"),
    // Contagem de purchases
    sb.from("purchases").select("*", { count: "exact", head: true }).eq("status", "confirmed"),
  ]);

  const breakdown: Record<string, number> = {};
  (archRes.data ?? []).forEach((row) => {
    const a = (row.archetype as string | null) ?? "indefinido";
    breakdown[a] = (breakdown[a] ?? 0) + 1;
  });

  const totalRevenue =
    (revenueRes.data ?? []).reduce(
      (sum: number, row: { gross_value: number }) => sum + (row.gross_value ?? 0),
      0,
    ) / 100;

  return {
    totalLeads: leadsRes.count ?? 0,
    totalMembers: membersRes.count ?? 0,
    responsesToday: todayLeadsRes.count ?? 0,
    archetypeBreakdown: breakdown,
    totalRevenue,
    totalPurchases: purchasesRes.count ?? 0,
  };
}
