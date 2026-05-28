import { supabase } from "@/integrations/supabase/client";

export type OverviewKpis = {
  totalLeads: number;
  totalMembers: number;
  responsesToday: number;
  archetypeBreakdown: Record<string, number>;
};

export async function fetchOverviewKpis(): Promise<OverviewKpis> {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [leadsRes, membersRes, todayRes, archRes] = await Promise.all([
    supabase.from("quiz_responses").select("*", { count: "exact", head: true }),
    supabase.from("profiles").select("*", { count: "exact", head: true }),
    supabase
      .from("quiz_responses")
      .select("*", { count: "exact", head: true })
      .gte("created_at", todayStart.toISOString()),
    supabase.from("quiz_responses").select("archetype"),
  ]);

  const breakdown: Record<string, number> = {};
  (archRes.data ?? []).forEach((row) => {
    const a = (row.archetype as string | null) ?? "indefinido";
    breakdown[a] = (breakdown[a] ?? 0) + 1;
  });

  return {
    totalLeads: leadsRes.count ?? 0,
    totalMembers: membersRes.count ?? 0,
    responsesToday: todayRes.count ?? 0,
    archetypeBreakdown: breakdown,
  };
}