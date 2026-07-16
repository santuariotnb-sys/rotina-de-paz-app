import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Users, CalendarCheck, AlertTriangle, MessageCircle, Download, Search } from "lucide-react";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { GlassCard } from "@/components/admin/GlassCard";
import { KpiCard } from "@/components/admin/KpiCard";
import {
  ARCHETYPE_COLORS,
  ARCHETYPE_LABELS,
  SITUATION_LABELS,
  DESIRE_LABELS,
  PERIODS,
  type Period,
  sinceISO,
} from "@/lib/admin/constants";
import { downloadCsv } from "@/lib/admin/csv";
import { useAdminQuiz } from "@/lib/admin/quiz-context";
import { dedupeBySession, countSessionsSince, type Lead } from "@/lib/admin/dedupeLeads";

export const Route = createFileRoute("/admin/leads")({
  component: AdminLeadsPage,
});

function AdminLeadsPage() {
  const [period, setPeriod] = useState<Period>(PERIODS[1]);
  const [search, setSearch] = useState("");
  const { quizId } = useAdminQuiz();

  const since = useMemo(() => sinceISO(period), [period]);

  const { data: rawLeads = [], isLoading } = useQuery({
    queryKey: ["adm-leads", period.label, quizId],
    queryFn: async (): Promise<Lead[]> => {
      const sb = supabase as any;
      let query = sb
        .from("leads_reais")
        .select(
          "id, name, email, whatsapp, archetype, desire, situation, risk_flag, utm_source, utm_campaign, external_id, created_at",
        )
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(1000);
      if (quizId) query = query.eq("quiz_id", quizId);
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return (data ?? []) as Lead[];
    },
  });

  // 1 lead por sessão (external_id) — KPIs, gráficos e tabela usam este `leads`.
  const leads = useMemo(() => dedupeBySession(rawLeads), [rawLeads]);

  const todayStart = useMemo(() => sinceISO(PERIODS[0]), []);

  const kpis = useMemo(() => {
    let risk = 0;
    let withWhatsapp = 0;
    for (const l of leads) {
      if (l.risk_flag) risk++;
      if (l.whatsapp) withWhatsapp++;
    }
    // "hoje" = sessões com atividade hoje, a partir das linhas CRUAS (não do
    // dedup): não infla (1× por external_id) e não some sessão cuja linha mais
    // completa seja de outro dia.
    return {
      total: leads.length,
      today: countSessionsSince(rawLeads, todayStart),
      risk,
      withWhatsapp,
    };
  }, [leads, rawLeads, todayStart]);

  const donutData = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const l of leads) {
      const key = l.archetype ?? "sem_arquetipo";
      counts[key] = (counts[key] ?? 0) + 1;
    }
    return Object.entries(counts).map(([name, value]) => ({
      name: ARCHETYPE_LABELS[name] ?? "Sem arquétipo",
      value,
      color: ARCHETYPE_COLORS[name] ?? "#6B7280",
    }));
  }, [leads]);

  const barData = useMemo(() => {
    const byDay: Record<string, Record<string, number>> = {};
    for (const l of leads) {
      const day = l.created_at.slice(0, 10);
      if (!byDay[day]) byDay[day] = {};
      const arch = l.archetype ?? "sem_arquetipo";
      byDay[day][arch] = (byDay[day][arch] ?? 0) + 1;
    }
    return Object.entries(byDay)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day, counts]) => ({
        day: day.slice(5),
        ...counts,
      }));
  }, [leads]);

  const allArchetypes = useMemo(() => {
    const set = new Set<string>();
    for (const l of leads) set.add(l.archetype ?? "sem_arquetipo");
    return Array.from(set);
  }, [leads]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return leads;
    return leads.filter((l) => (l.name ?? "").toLowerCase().includes(q));
  }, [leads, search]);

  function handleExport() {
    const rows = leads.map((l) => ({
      nome: l.name ?? "",
      email: l.email ?? "",
      arquetipo: l.archetype ?? "",
      situacao: l.situation ?? "",
      desejo: l.desire ?? "",
      risco: l.risk_flag ? "Sim" : "Não",
      utm_source: l.utm_source ?? "",
      utm_campaign: l.utm_campaign ?? "",
      data: new Date(l.created_at).toLocaleString("pt-BR"),
    }));
    downloadCsv(rows, `leads-${period.label}-${new Date().toISOString().slice(0, 10)}.csv`);
  }

  return (
    <div className="adm-fade-up space-y-6">
      {/* Header */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/55">
            Fase 4
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-white">Leads do Quiz</h1>
          <p className="mt-1 text-[13px] text-white/55">
            Análise e distribuição dos leads capturados pelo Quiz Sacra.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleExport}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-[12px] font-medium text-white/70 hover:bg-white/10"
          >
            <Download className="h-3.5 w-3.5" /> CSV
          </button>
          <div className="inline-flex rounded-lg border border-white/10 bg-white/5 p-0.5">
            {PERIODS.map((p) => (
              <button
                key={p.label}
                onClick={() => setPeriod(p)}
                className={`rounded-md px-3 py-1.5 text-[12px] font-semibold transition ${
                  period.label === p.label
                    ? "bg-white/15 text-white"
                    : "text-white/50 hover:text-white/70"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Total de leads"
          value={kpis.total}
          icon={<Users className="h-4 w-4" />}
          accent="blue"
          loading={isLoading}
        />
        <KpiCard
          label="Leads hoje"
          value={kpis.today}
          icon={<CalendarCheck className="h-4 w-4" />}
          accent="green"
          loading={isLoading}
        />
        <KpiCard
          label="Com risco"
          value={kpis.risk}
          icon={<AlertTriangle className="h-4 w-4" />}
          accent="rose"
          loading={isLoading}
        />
        <KpiCard
          label="Com WhatsApp"
          value={kpis.withWhatsapp}
          icon={<MessageCircle className="h-4 w-4" />}
          accent="amber"
          loading={isLoading}
        />
      </div>

      {/* Charts */}
      <div className="grid gap-4 lg:grid-cols-2">
        <GlassCard className="p-5">
          <h2 className="mb-4 text-[15px] font-semibold text-white">Distribuição por Arquétipo</h2>
          {donutData.length === 0 ? (
            <p className="py-10 text-center text-[13px] text-white/40">Sem dados no período.</p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={donutData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  dataKey="value"
                  paddingAngle={3}
                  stroke="none"
                >
                  {donutData.map((d, i) => (
                    <Cell key={i} fill={d.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: "#1A1B1F",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: 8,
                    color: "#fff",
                    fontSize: 12,
                  }}
                />
                <Legend
                  verticalAlign="bottom"
                  formatter={(value: string) => (
                    <span className="text-[12px] text-white/70">{value}</span>
                  )}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </GlassCard>

        <GlassCard className="p-5">
          <h2 className="mb-4 text-[15px] font-semibold text-white">Leads por Dia</h2>
          {barData.length === 0 ? (
            <p className="py-10 text-center text-[13px] text-white/40">Sem dados no período.</p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={barData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis
                  dataKey="day"
                  tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={{
                    background: "#1A1B1F",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: 8,
                    color: "#fff",
                    fontSize: 12,
                  }}
                />
                {allArchetypes.map((arch) => (
                  <Bar
                    key={arch}
                    dataKey={arch}
                    stackId="a"
                    fill={ARCHETYPE_COLORS[arch] ?? "#6B7280"}
                    name={ARCHETYPE_LABELS[arch] ?? "Sem arquétipo"}
                    radius={[0, 0, 0, 0]}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          )}
        </GlassCard>
      </div>

      {/* Table */}
      <GlassCard className="overflow-hidden p-0">
        <header className="flex items-center justify-between border-b border-white/5 px-5 py-3">
          <h2 className="text-[15px] font-semibold text-white">Todos os leads</h2>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/40" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nome…"
              className="adm-input w-56 py-1.5 pl-8 text-[12px]"
            />
          </div>
        </header>
        {isLoading ? (
          <p className="px-5 py-10 text-center text-[13px] text-white/40">Carregando…</p>
        ) : filtered.length === 0 ? (
          <p className="px-5 py-10 text-center text-[13px] text-white/40">
            {search ? "Nenhum lead encontrado." : "Nenhum lead no período."}
          </p>
        ) : (
          <div className="max-h-[480px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-[#1A1B1F]/95 text-left text-[11px] uppercase tracking-wider text-white/40">
                <tr>
                  <th className="px-4 py-3">Nome</th>
                  <th className="px-4 py-3">Arquétipo</th>
                  <th className="px-4 py-3">Situação</th>
                  <th className="px-4 py-3">Desejo</th>
                  <th className="px-4 py-3">Risco</th>
                  <th className="px-4 py-3">Data</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filtered.map((l) => (
                  <tr key={l.id} className="text-white/70">
                    <td className="px-4 py-3 text-[13px] font-medium text-white">
                      {l.name ?? "Anônimo"}
                    </td>
                    <td className="px-4 py-3">
                      {l.archetype ? (
                        <span
                          className="rounded-md px-2 py-0.5 text-[11px] font-medium"
                          style={{
                            backgroundColor: `${ARCHETYPE_COLORS[l.archetype]}20`,
                            color: ARCHETYPE_COLORS[l.archetype],
                          }}
                        >
                          {ARCHETYPE_LABELS[l.archetype] ?? l.archetype}
                        </span>
                      ) : (
                        <span className="text-[11px] text-white/30">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[12px]">
                      {SITUATION_LABELS[l.situation ?? ""] ?? l.situation ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-[12px]">
                      {DESIRE_LABELS[l.desire ?? ""] ?? l.desire ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      {l.risk_flag ? (
                        <span className="rounded-md bg-rose-500/15 px-2 py-0.5 text-[11px] font-medium text-rose-300">
                          Risco
                        </span>
                      ) : (
                        <span className="text-[11px] text-white/30">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[12px] text-white/50">
                      {new Date(l.created_at).toLocaleString("pt-BR", {
                        day: "2-digit",
                        month: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </GlassCard>
    </div>
  );
}
