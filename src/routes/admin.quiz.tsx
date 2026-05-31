import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, PieChart as PieIcon, TrendingUp, Users } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { GlassCard } from "@/components/admin/GlassCard";
import { KpiCard } from "@/components/admin/KpiCard";
import {
  ARCHETYPE_COLORS,
  ARCHETYPE_LABELS,
  PERIODS,
  type Period,
  sinceISO,
} from "@/lib/admin/constants";

export const Route = createFileRoute("/admin/quiz")({
  component: AdminQuizPage,
});

const QUESTION_LABELS: Record<string, string> = {
  situacao: "Situação de vida",
  risco: "Como tem se sentido",
  sintoma: "Sintoma físico",
  comportamento: "Comportamento ansioso",
  frase: "Frase que aperta",
  espiritual: "Vida com Deus",
  desejo: "O que mudaria",
};

const QUESTION_ORDER = ["situacao", "risco", "sintoma", "comportamento", "frase", "espiritual", "desejo"];

const BAR_COLORS = ["#3B82F6", "#F59E0B", "#8B5CF6", "#EC4899", "#10B981", "#EF4444"];

type QuizResponse = {
  id: string;
  lead_id: string;
  question_key: string;
  answer_value: string;
  answer_text: string;
  created_at: string;
};

type Lead = {
  id: string;
  archetype: string | null;
  created_at: string;
};

function AdminQuizPage() {
  const [period, setPeriod] = useState<Period>(PERIODS[1]);
  const [selectedQ, setSelectedQ] = useState<string>("sintoma");
  const since = useMemo(() => sinceISO(period), [period]);

  const { data: responses = [], isLoading: loadingR } = useQuery({
    queryKey: ["adm-quiz-responses", period.label],
    queryFn: async (): Promise<QuizResponse[]> => {
      const { data, error } = await supabase
        .from("quiz_responses")
        .select("*")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(5000);
      if (error) throw error;
      return (data ?? []) as unknown as QuizResponse[];
    },
  });

  const { data: leads = [], isLoading: loadingL } = useQuery({
    queryKey: ["adm-quiz-leads", period.label],
    queryFn: async (): Promise<Lead[]> => {
      const { data, error } = await supabase
        .from("leads")
        .select("id, archetype, created_at")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(2000);
      if (error) throw error;
      return (data ?? []) as Lead[];
    },
  });

  const { data: entitlements = [] } = useQuery({
    queryKey: ["adm-quiz-entitlements"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("entitlements")
        .select("buyer_email, status")
        .eq("status", "active");
      if (error) throw error;
      return (data ?? []) as { buyer_email: string | null; status: string }[];
    },
  });

  const isLoading = loadingR || loadingL;

  // KPIs
  const kpis = useMemo(() => {
    const uniqueLeads = new Set(responses.map((r) => r.lead_id));
    const completedLeads = new Set<string>();
    const leadQCount: Record<string, number> = {};
    for (const r of responses) {
      leadQCount[r.lead_id] = (leadQCount[r.lead_id] ?? 0) + 1;
    }
    for (const [lid, count] of Object.entries(leadQCount)) {
      if (count >= 7) completedLeads.add(lid);
    }
    return {
      totalResponses: responses.length,
      uniqueLeads: uniqueLeads.size,
      completedQuizzes: completedLeads.size,
      completionRate: uniqueLeads.size > 0
        ? Math.round((completedLeads.size / uniqueLeads.size) * 100)
        : 0,
    };
  }, [responses]);

  // Distribuição por pergunta selecionada
  const questionDist = useMemo(() => {
    const filtered = responses.filter((r) => r.question_key === selectedQ);
    const counts: Record<string, { text: string; count: number }> = {};
    for (const r of filtered) {
      if (!counts[r.answer_value]) {
        counts[r.answer_value] = { text: r.answer_text || r.answer_value, count: 0 };
      }
      counts[r.answer_value].count++;
    }
    const total = filtered.length || 1;
    return Object.entries(counts)
      .map(([value, { text, count }]) => ({
        value,
        text: text.length > 50 ? text.slice(0, 47) + "…" : text,
        fullText: text,
        count,
        pct: Math.round((count / total) * 100),
      }))
      .sort((a, b) => b.count - a.count);
  }, [responses, selectedQ]);

  // Conversão por arquétipo
  const conversionByArchetype = useMemo(() => {
    const buyerEmails = new Set(
      entitlements.filter((e) => e.buyer_email).map((e) => e.buyer_email!.toLowerCase()),
    );
    const archCounts: Record<string, { total: number; converted: number }> = {};
    for (const l of leads) {
      const arch = l.archetype ?? "sem_arquetipo";
      if (!archCounts[arch]) archCounts[arch] = { total: 0, converted: 0 };
      archCounts[arch].total++;
    }
    // Cruzar leads com email → entitlements (precisa buscar email dos leads)
    // Simplificação: usa contagem de leads por arquétipo + total convertidos global
    const totalLeads = leads.length || 1;
    const totalConverted = buyerEmails.size;
    const globalRate = totalConverted / totalLeads;

    return Object.entries(archCounts).map(([arch, { total }]) => ({
      name: ARCHETYPE_LABELS[arch] ?? arch,
      leads: total,
      pct: Math.round((total / (leads.length || 1)) * 100),
      color: ARCHETYPE_COLORS[arch] ?? "#6B7280",
    }));
  }, [leads, entitlements]);

  // Donut arquétipos
  const donutData = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const l of leads) {
      const key = l.archetype ?? "sem_arquetipo";
      counts[key] = (counts[key] ?? 0) + 1;
    }
    return Object.entries(counts).map(([name, value]) => ({
      name: ARCHETYPE_LABELS[name] ?? name,
      value,
      color: ARCHETYPE_COLORS[name] ?? "#6B7280",
    }));
  }, [leads]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Analytics do Quiz</h1>
          <p className="mt-1 text-sm text-[#8A90A2]">
            Respostas, arquétipos e comportamento do público
          </p>
        </div>
        <div className="flex gap-1 rounded-xl bg-[#1A1F2E] p-1">
          {PERIODS.map((p) => (
            <button
              key={p.label}
              onClick={() => setPeriod(p)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                period.label === p.label
                  ? "bg-gradient-to-r from-[#3B5BFD] to-[#7C3AED] text-white"
                  : "text-[#8A90A2] hover:text-white"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <p className="text-center text-[#8A90A2]">Carregando…</p>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <KpiCard label="Respostas" value={kpis.totalResponses} icon={<BarChart3 className="h-4 w-4" />} loading={isLoading} />
            <KpiCard label="Leads únicos" value={kpis.uniqueLeads} icon={<Users className="h-4 w-4" />} loading={isLoading} />
            <KpiCard label="Quiz completo" value={kpis.completedQuizzes} icon={<TrendingUp className="h-4 w-4" />} loading={isLoading} />
            <KpiCard label="Taxa conclusão" value={`${kpis.completionRate}%`} icon={<PieIcon className="h-4 w-4" />} loading={isLoading} />
          </div>

          {/* Distribuição de arquétipos */}
          <GlassCard>
            <h2 className="mb-4 text-lg font-semibold text-white">Distribuição de Arquétipos</h2>
            <div className="flex flex-col items-center gap-6 md:flex-row">
              <div className="h-64 w-full max-w-xs">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={donutData}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={95}
                      dataKey="value"
                      stroke="none"
                    >
                      {donutData.map((d, i) => (
                        <Cell key={i} fill={d.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ background: "#1A1F2E", border: "1px solid #2A2F3E", borderRadius: 8 }}
                      itemStyle={{ color: "#fff" }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex-1 space-y-2">
                {donutData.map((d) => (
                  <div key={d.name} className="flex items-center gap-3">
                    <span className="h-3 w-3 rounded-full" style={{ background: d.color }} />
                    <span className="flex-1 text-sm text-[#C8CDD8]">{d.name}</span>
                    <span className="text-sm font-semibold text-white">{d.value}</span>
                    <span className="text-xs text-[#8A90A2]">
                      ({Math.round((d.value / (leads.length || 1)) * 100)}%)
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </GlassCard>

          {/* Respostas por pergunta */}
          <GlassCard>
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-lg font-semibold text-white">Respostas por Pergunta</h2>
              <select
                value={selectedQ}
                onChange={(e) => setSelectedQ(e.target.value)}
                className="rounded-lg border border-[#2A2F3E] bg-[#1A1F2E] px-3 py-1.5 text-sm text-white"
              >
                {QUESTION_ORDER.map((key) => (
                  <option key={key} value={key}>
                    {QUESTION_LABELS[key] ?? key}
                  </option>
                ))}
              </select>
            </div>

            {questionDist.length === 0 ? (
              <p className="text-center text-sm text-[#8A90A2]">Sem dados para esta pergunta</p>
            ) : (
              <div className="space-y-3">
                {questionDist.map((d, i) => (
                  <div key={d.value} className="group">
                    <div className="mb-1 flex items-baseline justify-between gap-2">
                      <p className="flex-1 text-sm text-[#C8CDD8] group-hover:text-white" title={d.fullText}>
                        {d.text}
                      </p>
                      <span className="whitespace-nowrap text-sm font-semibold text-white">
                        {d.count} <span className="text-xs text-[#8A90A2]">({d.pct}%)</span>
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-[#1A1F2E]">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${d.pct}%`,
                          background: BAR_COLORS[i % BAR_COLORS.length],
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </GlassCard>

          {/* Leads por arquétipo (tabela) */}
          <GlassCard>
            <h2 className="mb-4 text-lg font-semibold text-white">Leads por Arquétipo</h2>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={conversionByArchetype} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#2A2F3E" />
                  <XAxis type="number" tick={{ fill: "#8A90A2", fontSize: 12 }} />
                  <YAxis
                    dataKey="name"
                    type="category"
                    width={100}
                    tick={{ fill: "#C8CDD8", fontSize: 12 }}
                  />
                  <Tooltip
                    contentStyle={{ background: "#1A1F2E", border: "1px solid #2A2F3E", borderRadius: 8 }}
                    itemStyle={{ color: "#fff" }}
                  />
                  <Bar dataKey="leads" radius={[0, 6, 6, 0]}>
                    {conversionByArchetype.map((d, i) => (
                      <Cell key={i} fill={d.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </GlassCard>
        </>
      )}
    </div>
  );
}
