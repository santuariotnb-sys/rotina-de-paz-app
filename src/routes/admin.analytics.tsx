import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { TrendingUp, Users, DollarSign, BarChart3, Download, Target } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { GlassCard } from "@/components/admin/GlassCard";
import { KpiCard } from "@/components/admin/KpiCard";
import { downloadCsv } from "@/lib/admin/csv";
import {
  ARCHETYPE_LABELS,
  ARCHETYPE_COLORS,
  SITUATION_LABELS,
  DESIRE_LABELS,
  PERIODS,
  type Period,
} from "@/lib/admin/constants";
import type { TopSegment, QuizConversionRow } from "@/lib/admin/analytics";
import {
  getTopSegments,
  getFunnel,
  getRevenueBreakdown,
  getQuizConversion,
  getCohortWeekly,
} from "@/lib/admin/analytics.functions";
import { useAdminQuiz } from "@/lib/admin/quiz-context";

export const Route = createFileRoute("/admin/analytics")({
  component: AdminAnalyticsPage,
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

const TYPE_LABELS: Record<string, string> = {
  principal: "Principal",
  order_bump: "Order Bump",
  upsell: "Upsell",
  downsell: "Downsell",
};

const TYPE_COLORS: Record<string, string> = {
  principal: "#10B981",
  order_bump: "#8B5CF6",
  upsell: "#3B82F6",
  downsell: "#F59E0B",
};

function brl(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function AdminAnalyticsPage() {
  const [period, setPeriod] = useState<Period>(PERIODS[1]);
  const days = period.days;
  const { quizId } = useAdminQuiz();

  const { data: funnel, isLoading: loadingF } = useQuery({
    queryKey: ["analytics-funnel", days, quizId],
    queryFn: () => getFunnel({ data: { days, quizId } }),
  });

  const { data: segments = [], isLoading: loadingS } = useQuery({
    queryKey: ["analytics-segments", days, quizId],
    queryFn: () => getTopSegments({ data: { days, quizId } }),
  });

  const { data: revenue = [], isLoading: loadingR } = useQuery({
    queryKey: ["analytics-revenue", days, quizId],
    queryFn: () => getRevenueBreakdown({ data: { days, quizId } }),
  });

  const { data: quizConv = [], isLoading: loadingQ } = useQuery({
    queryKey: ["analytics-quiz-conv", days, quizId],
    queryFn: () => getQuizConversion({ data: { days, quizId } }),
  });

  const { data: cohort = [] } = useQuery({
    queryKey: ["analytics-cohort", quizId],
    queryFn: () => getCohortWeekly({ data: { weeks: 12, quizId } }),
  });

  const isLoading = loadingF || loadingS || loadingR || loadingQ;

  const funnelSteps = useMemo(() => {
    if (!funnel) return [];
    return [
      { label: "Leads", value: funnel.total_leads, color: "#6B7280" },
      { label: "Quiz completo", value: funnel.with_archetype, color: "#8B5CF6" },
      { label: "Com WhatsApp", value: funnel.with_whatsapp, color: "#3B82F6" },
      { label: "Compraram", value: funnel.purchasers, color: "#10B981" },
      { label: "Upsell", value: funnel.upsell_buyers, color: "#F59E0B" },
      { label: "Downsell", value: funnel.downsell_buyers, color: "#EF4444" },
    ];
  }, [funnel]);

  const [selectedQ, setSelectedQ] = useState("sintoma");
  const filteredQuiz = useMemo(
    () => quizConv.filter((r) => r.question_key === selectedQ),
    [quizConv, selectedQ],
  );

  const handleExportCsv = () => {
    const rows = segments.map((s) => ({
      arquetipo: ARCHETYPE_LABELS[s.archetype] ?? s.archetype,
      situacao: SITUATION_LABELS[s.situation] ?? s.situation,
      desejo: DESIRE_LABELS[s.desire] ?? s.desire,
      leads: s.total_leads,
      com_whatsapp: s.with_whatsapp,
      compradores: s.purchasers,
      taxa_conv: `${Number(s.conv_rate).toFixed(1)}%`,
      receita_brl: Number(s.revenue).toFixed(2),
    }));
    downloadCsv(
      rows,
      `analytics-segmentos-${period.label}-${new Date().toISOString().slice(0, 10)}.csv`,
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Analytics Avançado</h1>
          <p className="mt-1 text-sm text-[#8A90A2]">
            Lead campeão, nicho vencedor, funil e receita
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleExportCsv}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-[12px] font-medium text-white/70 hover:bg-white/10"
          >
            <Download className="h-3.5 w-3.5" /> CSV
          </button>
          <div className="flex flex-wrap gap-1 rounded-xl bg-[#1A1F2E] p-1">
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
      </div>

      {isLoading ? (
        <p className="text-center text-[#8A90A2]">Carregando…</p>
      ) : (
        <>
          {/* KPIs do funil */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <KpiCard
              label="Leads"
              value={funnel?.total_leads ?? 0}
              icon={<Users className="h-4 w-4" />}
              loading={loadingF}
            />
            <KpiCard
              label="Compradores"
              value={funnel?.purchasers ?? 0}
              icon={<TrendingUp className="h-4 w-4" />}
              loading={loadingF}
            />
            <KpiCard
              label="Receita total"
              value={brl(funnel?.total_revenue ?? 0)}
              icon={<DollarSign className="h-4 w-4" />}
              loading={loadingF}
            />
            <KpiCard
              label="Taxa conversão"
              value={
                funnel && funnel.total_leads > 0
                  ? `${Math.round((funnel.purchasers / funnel.total_leads) * 1000) / 10}%`
                  : "—"
              }
              icon={<Target className="h-4 w-4" />}
              loading={loadingF}
            />
          </div>

          {/* Funil visual */}
          <GlassCard>
            <h2 className="mb-4 text-lg font-semibold text-white">Funil de Conversão</h2>
            {funnelSteps.length === 0 ? (
              <p className="text-sm text-[#8A90A2]">Sem dados</p>
            ) : (
              <div className="space-y-3">
                {funnelSteps.map((step) => {
                  const maxVal = funnelSteps[0]?.value || 1;
                  const pct = maxVal > 0 ? (step.value / maxVal) * 100 : 0;
                  return (
                    <div key={step.label}>
                      <div className="mb-1 flex items-baseline justify-between">
                        <span className="text-sm text-[#C8CDD8]">{step.label}</span>
                        <span className="text-sm font-semibold text-white">
                          {step.value}{" "}
                          <span className="text-xs text-[#8A90A2]">({Math.round(pct)}%)</span>
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-[#1A1F2E]">
                        <div
                          className="h-full rounded-full transition-all duration-700"
                          style={{ width: `${pct}%`, backgroundColor: step.color }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </GlassCard>

          {/* Top Segmentos (Correção 3: mostra n / total_leads) */}
          <GlassCard>
            <h2 className="mb-4 text-lg font-semibold text-white">
              Nicho Vencedor — Top Segmentos
            </h2>
            {segments.length === 0 ? (
              <p className="text-sm text-[#8A90A2]">
                Sem dados suficientes (mínimo 20 leads por segmento)
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#2A2F3E] text-left text-xs text-[#8A90A2]">
                      <th className="px-3 py-2">Arquétipo</th>
                      <th className="px-3 py-2">Situação</th>
                      <th className="px-3 py-2">Desejo</th>
                      <th className="px-3 py-2 text-right">n (leads)</th>
                      <th className="px-3 py-2 text-right">Conversão</th>
                      <th className="px-3 py-2 text-right">Receita</th>
                    </tr>
                  </thead>
                  <tbody>
                    {segments.map((s, i) => (
                      <tr key={i} className="border-b border-[#2A2F3E]/50 hover:bg-[#1A1F2E]">
                        <td className="px-3 py-2">
                          <span className="inline-flex items-center gap-2 text-[#C8CDD8]">
                            <span
                              className="h-2.5 w-2.5 rounded-full"
                              style={{ background: ARCHETYPE_COLORS[s.archetype] ?? "#6B7280" }}
                            />
                            {ARCHETYPE_LABELS[s.archetype] ?? s.archetype}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-[#C8CDD8]">
                          {SITUATION_LABELS[s.situation] ?? s.situation}
                        </td>
                        <td className="px-3 py-2 text-[#C8CDD8]">
                          {DESIRE_LABELS[s.desire] ?? s.desire}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-[#8A90A2]">
                          {s.total_leads}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <span
                            className={`font-semibold ${s.conv_rate > 0 ? "text-emerald-400" : "text-[#8A90A2]"}`}
                          >
                            {s.conv_rate}%
                          </span>
                          <span className="ml-1 text-xs text-[#8A90A2]">({s.purchasers})</span>
                        </td>
                        <td className="px-3 py-2 text-right font-semibold text-white">
                          {brl(s.revenue)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </GlassCard>

          {/* Receita por produto */}
          <GlassCard>
            <h2 className="mb-4 text-lg font-semibold text-white">Receita por Produto</h2>
            {revenue.length === 0 ? (
              <p className="text-sm text-[#8A90A2]">Nenhuma venda no período</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {revenue.map((r) => (
                  <div
                    key={`${r.product_name}-${r.product_type}`}
                    className="rounded-xl border border-[#2A2F3E] bg-[#1A1F2E] p-4"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ background: TYPE_COLORS[r.product_type] ?? "#6B7280" }}
                      />
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-[#8A90A2]">
                        {TYPE_LABELS[r.product_type] ?? r.product_type}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-[#C8CDD8]">{r.product_name}</p>
                    <p className="mt-2 text-xl font-semibold text-white">{brl(r.revenue)}</p>
                    <p className="mt-0.5 text-[11px] text-[#8A90A2]">
                      {r.sales} venda{r.sales !== 1 ? "s" : ""}
                      {r.refunds > 0
                        ? ` · ${r.refunds} reembolso${r.refunds !== 1 ? "s" : ""}`
                        : ""}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </GlassCard>

          {/* Quiz × Conversão */}
          <GlassCard>
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-lg font-semibold text-white">Quiz × Conversão</h2>
              <select
                value={selectedQ}
                onChange={(e) => setSelectedQ(e.target.value)}
                className="rounded-lg border border-[#2A2F3E] bg-[#1A1F2E] px-3 py-1.5 text-sm text-white"
              >
                {Object.entries(QUESTION_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            {filteredQuiz.length === 0 ? (
              <p className="text-sm text-[#8A90A2]">Sem dados para esta pergunta</p>
            ) : (
              <div className="space-y-3">
                {filteredQuiz.map((d) => {
                  const text =
                    d.answer_text.length > 55 ? d.answer_text.slice(0, 52) + "…" : d.answer_text;
                  return (
                    <div key={d.answer_value} className="group">
                      <div className="mb-1 flex items-baseline justify-between gap-2">
                        <p
                          className="flex-1 text-sm text-[#C8CDD8] group-hover:text-white"
                          title={d.answer_text}
                        >
                          {text}
                        </p>
                        <span className="whitespace-nowrap text-sm">
                          <span className="font-semibold text-white">{d.total}</span>
                          {d.converted > 0 && (
                            <span className="ml-2 text-emerald-400">
                              {d.conv_rate}% conv ({d.converted})
                            </span>
                          )}
                        </span>
                      </div>
                      <div className="flex h-2 gap-px overflow-hidden rounded-full">
                        <div
                          className="rounded-l-full bg-[#3B82F6]"
                          style={{ width: `${100 - (d.conv_rate ?? 0)}%` }}
                        />
                        <div
                          className="rounded-r-full bg-emerald-500"
                          style={{ width: `${d.conv_rate ?? 0}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </GlassCard>

          {/* Cohort semanal */}
          <GlassCard>
            <div className="mb-4 flex items-baseline justify-between gap-2">
              <h2 className="text-lg font-semibold text-white">Cohort Semanal</h2>
              <span className="text-[11px] font-medium text-[#8A90A2]">
                Últimas 12 semanas (fixo)
              </span>
            </div>
            {cohort.length === 0 ? (
              <p className="text-sm text-[#8A90A2]">Sem dados</p>
            ) : (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={[...cohort].reverse()}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#2A2F3E" />
                    <XAxis
                      dataKey="cohort_week"
                      tick={{ fill: "#8A90A2", fontSize: 11 }}
                      tickFormatter={(v) => v?.slice(5) ?? ""}
                    />
                    <YAxis tick={{ fill: "#8A90A2", fontSize: 11 }} />
                    <Tooltip
                      contentStyle={{
                        background: "#1A1F2E",
                        border: "1px solid #2A2F3E",
                        borderRadius: 8,
                      }}
                      itemStyle={{ color: "#fff" }}
                      formatter={(v: number, name: string) => (name === "revenue" ? brl(v) : v)}
                    />
                    <Bar dataKey="leads" fill="#6B7280" radius={[4, 4, 0, 0]} name="Leads" />
                    <Bar dataKey="buyers" fill="#10B981" radius={[4, 4, 0, 0]} name="Compradores" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </GlassCard>
        </>
      )}
    </div>
  );
}
