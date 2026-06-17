import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BarChart3, Download, PieChart as PieIcon, TrendingUp, Users } from "lucide-react";
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
import { downloadCsv } from "@/lib/admin/csv";
import {
  ARCHETYPE_COLORS,
  ARCHETYPE_LABELS,
  PERIODS,
  type Period,
  sinceISO,
} from "@/lib/admin/constants";
import { getQuizFunnel } from "@/lib/admin/quiz-funnel.functions";
import {
  getCheckoutFunnel,
  getFullFunnel,
} from "@/lib/admin/checkout-funnel.functions";
import { getConvertedLeadIds } from "@/lib/admin/conversion.functions";

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

const QUESTION_ORDER = [
  "situacao",
  "risco",
  "sintoma",
  "comportamento",
  "frase",
  "espiritual",
  "desejo",
];

const BAR_COLORS = ["#3B82F6", "#F59E0B", "#8B5CF6", "#EC4899", "#10B981", "#EF4444"];

type QuizResponse = {
  id: string;
  lead_id: string;
  question_key: string;
  answer_value: string;
  answer_text: string;
  time_to_answer: number | null;
  created_at: string;
};

type Lead = {
  id: string;
  archetype: string | null;
  email: string | null;
  whatsapp: string | null;
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
      const sb = supabase as any;
      const { data, error } = await sb
        .from("leads_reais")
        .select("id, archetype, email, whatsapp, created_at")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(2000);
      if (error) throw error;
      return (data ?? []) as Lead[];
    },
  });

  const fetchConvertedIds = useServerFn(getConvertedLeadIds);
  const { data: convertedLeadIds = [] } = useQuery({
    queryKey: ["adm-quiz-converted-leads"],
    queryFn: () => fetchConvertedIds(),
  });

  const fetchFunnel = useServerFn(getQuizFunnel);
  const { data: funnelSteps = [], isLoading: loadingFunnel } = useQuery({
    queryKey: ["adm-quiz-funnel", period.label],
    queryFn: () => fetchFunnel({ data: { days: period.days ?? 9999 } }),
  });

  const fetchCheckoutFunnel = useServerFn(getCheckoutFunnel);
  const { data: checkoutSteps = [] } = useQuery({
    queryKey: ["adm-checkout-funnel", period.label],
    queryFn: () => fetchCheckoutFunnel({ data: { days: period.days ?? 9999 } }),
  });

  const fetchFullFunnel = useServerFn(getFullFunnel);
  const { data: fullFunnelSteps = [] } = useQuery({
    queryKey: ["adm-full-funnel", period.label],
    queryFn: () => fetchFullFunnel({ data: { days: period.days ?? 9999 } }),
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
      completionRate:
        uniqueLeads.size > 0 ? Math.round((completedLeads.size / uniqueLeads.size) * 100) : 0,
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

  // Conversão por arquétipo (via vendas_reais ↔ leads_reais.external_id)
  const convertedSet = useMemo(() => new Set(convertedLeadIds), [convertedLeadIds]);

  const conversionByArchetype = useMemo(() => {
    const archCounts: Record<string, { total: number; converted: number }> = {};
    for (const l of leads) {
      const arch = l.archetype ?? "sem_arquetipo";
      if (!archCounts[arch]) archCounts[arch] = { total: 0, converted: 0 };
      archCounts[arch].total++;
      if (convertedSet.has(l.id)) archCounts[arch].converted++;
    }

    return Object.entries(archCounts).map(([arch, { total }]) => ({
      name: ARCHETYPE_LABELS[arch] ?? arch,
      leads: total,
      pct: Math.round((total / (leads.length || 1)) * 100),
      color: ARCHETYPE_COLORS[arch] ?? "#6B7280",
    }));
  }, [leads, convertedSet]);

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

  // Forward-only cutoff: contact_gate data starts from this date
  // (track_quiz_step allowlist was fixed on 2026-06-17)
  const CONTACT_GATE_SINCE = "17/jun/2026";

  // Distribuição de respostas por pergunta (para funil de perguntas)
  const questionReach = useMemo(() => {
    const QUESTION_ORDER = [
      "situacao",
      "risco",
      "sintoma",
      "comportamento",
      "frase",
      "espiritual",
      "desejo",
    ];
    return QUESTION_ORDER.map((key, idx) => {
      const respondents = new Set(
        responses.filter((r) => r.question_key === key).map((r) => r.lead_id),
      ).size;
      return {
        key,
        label: QUESTION_LABELS[key] ?? key,
        respondents,
        pct: kpis.uniqueLeads > 0 ? Math.round((respondents / kpis.uniqueLeads) * 100) : 0,
        order: idx + 1,
      };
    });
  }, [responses, kpis.uniqueLeads]);

  // Funnel KPIs — beacon-only cohort (always decreasing)
  const funnelKpis = useMemo(() => {
    if (funnelSteps.length === 0) return null;
    const arrival = funnelSteps.find((s) => s.stage === "arrival");
    const lastQ = funnelSteps.find((s) => s.stage === "q_desejo");
    const contact = funnelSteps.find((s) => s.stage === "contact_gate");

    // Leak point: biggest drop — ignore steps where the PREVIOUS step had < 2
    // reached (artifact of newly-instrumented stages with no data yet)
    const leakPoint =
      funnelSteps
        .filter((s, i) => {
          if (s.drop_pct <= 0) return false;
          const prev = i > 0 ? funnelSteps[i - 1] : null;
          return prev != null && prev.reached >= 2;
        })
        .sort((a, b) => b.drop_pct - a.drop_pct)[0] ?? null;

    return {
      arrivals: arrival?.reached ?? 0,
      completedQuiz: lastQ?.reached ?? 0,
      completionRate:
        arrival && lastQ && arrival.reached > 0
          ? Math.round((lastQ.reached / arrival.reached) * 100)
          : 0,
      whatsappCapturedBeacon: contact?.reached ?? 0,
      leakPoint,
    };
  }, [funnelSteps]);

  // Checkout funnel KPIs
  const checkoutKpis = useMemo(() => {
    if (checkoutSteps.length === 0) return null;
    const view = checkoutSteps.find((s) => s.stage === "view");
    const purchase = checkoutSteps.find((s) => s.stage === "purchase");
    const decline = checkoutSteps.find((s) => s.stage === "decline");

    const leakPoint =
      checkoutSteps
        .filter((s, i) => {
          if (s.drop_pct <= 0) return false;
          const prev = i > 0 ? checkoutSteps[i - 1] : null;
          return prev != null && prev.reached >= 2;
        })
        .sort((a, b) => b.drop_pct - a.drop_pct)[0] ?? null;

    return {
      views: view?.reached ?? 0,
      purchases: purchase?.reached ?? 0,
      conversionRate:
        view && purchase && view.reached > 0
          ? Math.round((purchase.reached / view.reached) * 100)
          : 0,
      declines: decline?.reached ?? 0,
      leakPoint,
    };
  }, [checkoutSteps]);

  const handleExportCsv = () => {
    const rows = leads.map((l) => ({
      id: l.id,
      arquetipo: ARCHETYPE_LABELS[l.archetype ?? ""] ?? l.archetype ?? "",
      criado_em: new Date(l.created_at).toLocaleString("pt-BR"),
    }));
    downloadCsv(rows, `quiz-leads-${period.label}-${new Date().toISOString().slice(0, 10)}.csv`);
  };

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
                className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
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
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="rounded-xl border border-white/5 bg-[#1A1F2E] p-4">
              <div className="h-3 w-20 animate-pulse rounded bg-white/10" />
              <div className="mt-3 h-6 w-12 animate-pulse rounded bg-white/10" />
            </div>
          ))}
        </div>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <KpiCard
              label="Respostas"
              value={kpis.totalResponses}
              icon={<BarChart3 className="h-4 w-4" />}
              loading={isLoading}
            />
            <KpiCard
              label="Leads únicos"
              value={kpis.uniqueLeads}
              icon={<Users className="h-4 w-4" />}
              loading={isLoading}
            />
            <KpiCard
              label="Quiz completo"
              value={kpis.completedQuizzes}
              icon={<TrendingUp className="h-4 w-4" />}
              loading={isLoading}
            />
            <KpiCard
              label="Taxa conclusão"
              value={`${kpis.completionRate}%`}
              icon={<PieIcon className="h-4 w-4" />}
              loading={isLoading}
            />
          </div>

          {/* Funil do Quiz — Página a Página (beacon-based, DISTINCT session_id) */}
          <GlassCard>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Funil do Quiz — Página a Página
              </h2>
              <span className="text-xs text-zinc-400">
                Beacons desde 11/jun · DISTINCT por sessão
              </span>
            </div>

            {funnelSteps.length > 0 ? (
              <>
                {/* KPI row */}
                <div className="grid grid-cols-2 gap-3 mb-6 sm:grid-cols-4">
                  <KpiCard
                    label="Chegaram"
                    value={funnelKpis?.arrivals ?? 0}
                    icon={<Users className="h-4 w-4" />}
                  />
                  <KpiCard
                    label="Completaram quiz"
                    value={funnelKpis?.completedQuiz ?? 0}
                    hint={funnelKpis?.completionRate ? `${funnelKpis.completionRate}% dos que chegaram` : undefined}
                    icon={<TrendingUp className="h-4 w-4" />}
                  />
                  <KpiCard
                    label="Deram WhatsApp"
                    value={funnelKpis?.whatsappCapturedBeacon ?? 0}
                    hint={`Populando desde ${CONTACT_GATE_SINCE}`}
                    icon={<Users className="h-4 w-4" />}
                  />
                  {funnelKpis?.leakPoint && (
                    <KpiCard
                      label="Maior queda"
                      value={`−${funnelKpis.leakPoint.drop_pct}%`}
                      hint={funnelKpis.leakPoint.label}
                      accent="rose"
                      icon={<BarChart3 className="h-4 w-4" />}
                    />
                  )}
                </div>

                {/* Funnel table — 1 number per step, clear drop */}
                <div className="space-y-1">
                  {funnelSteps.map((step, i) => {
                    const prevReached = i > 0 ? funnelSteps[i - 1].reached : 0;
                    const topReached = funnelSteps[0]?.reached ?? 1;
                    const pctOfTop = topReached > 0 ? Math.round((step.reached / topReached) * 100) : 0;
                    const isContactGate = step.stage === "contact_gate";
                    // Forward-only: contact_gate has sparse historical data, flag it
                    const isForwardOnly = isContactGate && step.reached < (prevReached * 0.1);

                    return (
                      <div
                        key={step.stage}
                        className={`flex items-center gap-3 rounded-lg px-3 py-2 ${
                          isForwardOnly ? "bg-amber-500/5 border border-amber-500/20" : "bg-white/[0.02]"
                        }`}
                      >
                        {/* Bar width proportional to top */}
                        <div className="w-28 sm:w-40 truncate text-[12px] text-white">
                          {step.label}
                          {isForwardOnly && (
                            <span className="ml-1.5 text-[10px] text-amber-400">(novo)</span>
                          )}
                        </div>
                        <div className="flex-1">
                          <div className="h-2 rounded-full bg-[#1A1F2E]">
                            <div
                              className={`h-2 rounded-full transition-all duration-500 ${
                                isForwardOnly
                                  ? "bg-amber-500/50"
                                  : step.drop_pct > 30
                                    ? "bg-red-500"
                                    : step.drop_pct > 15
                                      ? "bg-yellow-500"
                                      : "bg-blue-500"
                              }`}
                              style={{ width: `${Math.max(pctOfTop, 1)}%` }}
                            />
                          </div>
                        </div>
                        <span className="w-12 text-right text-[12px] font-mono font-semibold text-white">
                          {step.reached}
                        </span>
                        <span className="w-12 text-right text-[11px] font-mono text-zinc-500">
                          {pctOfTop}%
                        </span>
                        {i > 0 && !isForwardOnly && step.drop_pct > 0 && (
                          <span
                            className={`w-14 text-right text-[11px] font-mono ${
                              step.drop_pct > 30 ? "text-red-400" : step.drop_pct > 15 ? "text-yellow-400" : "text-zinc-500"
                            }`}
                          >
                            −{step.drop_pct}%
                          </span>
                        )}
                        {(i === 0 || isForwardOnly || step.drop_pct <= 0) && (
                          <span className="w-14" />
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Forward-only explanation */}
                {funnelSteps.some((s) => s.stage === "contact_gate" && s.reached < 10) && (
                  <p className="mt-3 text-[11px] text-amber-400/70">
                    A etapa "WhatsApp capturado" está populando desde {CONTACT_GATE_SINCE} (dados anteriores foram perdidos por um bug na ingestão, já corrigido). Os números consolidam conforme novos visitantes passam pelo quiz.
                  </p>
                )}
              </>
            ) : (
              <p className="text-zinc-500 text-sm">
                Sem dados de funil ainda. Os beacons começaram a coletar em 11/06/2026.
              </p>
            )}
          </GlassCard>

          {/* Alcance por Pergunta */}
          <GlassCard>
            <h2 className="mb-4 text-lg font-semibold text-white flex items-center gap-2">
              Respostas por Pergunta
              <span className="text-xs font-normal text-zinc-500">
                (dados pós-quiz — todos planos por construção)
              </span>
            </h2>
            <p className="mb-3 text-[12px] text-[#8A90A2]">
              % de leads que respondeu cada etapa (com persistência em lote, 100% indica que todos
              completaram)
            </p>
            <div className="space-y-2">
              {questionReach.map((q) => (
                <div key={q.key} className="flex items-center gap-3">
                  <span className="w-6 text-[11px] font-mono text-[#8A90A2]">{q.order}.</span>
                  <span className="w-24 truncate text-[12px] text-white sm:w-40">{q.label}</span>
                  <div className="flex-1">
                    <div className="h-2 rounded-full bg-[#1A1F2E]">
                      <div
                        className="h-2 rounded-full bg-gradient-to-r from-[#3B5BFD] to-[#7C3AED]"
                        style={{ width: `${q.pct}%` }}
                      />
                    </div>
                  </div>
                  <span className="w-16 text-right text-[11px] font-mono text-[#8A90A2]">
                    {q.respondents} ({q.pct}%)
                  </span>
                </div>
              ))}
            </div>
          </GlassCard>

          {/* Distribuição de arquétipos */}
          <GlassCard>
            <h2 className="mb-4 text-lg font-semibold text-white">Distribuição de Arquétipos</h2>
            <p className="mb-3 text-[11px] text-amber-400/70">
              Arquétipo × venda não disponível — apenas 3.7% dos leads têm external_id para atribuição. Consolida conforme o volume cresce.
            </p>
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
                      contentStyle={{
                        background: "#1A1F2E",
                        border: "1px solid #2A2F3E",
                        borderRadius: 8,
                      }}
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
                      <p
                        className="flex-1 text-sm text-[#C8CDD8] group-hover:text-white"
                        title={d.fullText}
                      >
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
                    contentStyle={{
                      background: "#1A1F2E",
                      border: "1px solid #2A2F3E",
                      borderRadius: 8,
                    }}
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

          {/* ═══════════════════════════════════════════════════ */}
          {/* Funil do Checkout                                  */}
          {/* ═══════════════════════════════════════════════════ */}
          <GlassCard>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Funil do Checkout
              </h2>
              <span className="text-xs text-zinc-400">
                Dados desde o deploy do canário
              </span>
            </div>

            {checkoutSteps.length > 0 && checkoutSteps.some((s) => s.reached > 0) ? (
              <>
                <div className="grid grid-cols-2 gap-3 mb-6 sm:grid-cols-4">
                  <KpiCard
                    label="Chegaram"
                    value={checkoutKpis?.views ?? 0}
                    icon={<Users className="h-4 w-4" />}
                  />
                  <KpiCard
                    label="Compraram"
                    value={checkoutKpis?.purchases ?? 0}
                    icon={<TrendingUp className="h-4 w-4" />}
                    accent="green"
                  />
                  <KpiCard
                    label="Conversão"
                    value={`${checkoutKpis?.conversionRate ?? 0}%`}
                    icon={<BarChart3 className="h-4 w-4" />}
                  />
                  {checkoutKpis?.leakPoint && (
                    <KpiCard
                      label="Maior queda"
                      value={`−${checkoutKpis.leakPoint.drop_pct}%`}
                      hint={checkoutKpis.leakPoint.label}
                      accent="rose"
                      icon={<BarChart3 className="h-4 w-4" />}
                    />
                  )}
                </div>

                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={checkoutSteps} layout="vertical" margin={{ left: 140 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                    <XAxis type="number" stroke="#888" />
                    <YAxis
                      type="category"
                      dataKey="label"
                      stroke="#888"
                      width={130}
                      tick={{ fontSize: 12 }}
                    />
                    <Tooltip
                      contentStyle={{ background: "#1a1a2e", border: "1px solid #333" }}
                      formatter={(value: number, name: string) => {
                        if (name === "reached") return [value, "Alcançaram"];
                        return [value, name];
                      }}
                    />
                    <Bar dataKey="reached" fill="#10B981" radius={[0, 4, 4, 0]}>
                      {checkoutSteps.map((entry) => (
                        <Cell
                          key={entry.stage}
                          fill={
                            entry.drop_pct > 30
                              ? "#EF4444"
                              : entry.drop_pct > 15
                                ? "#F59E0B"
                                : "#10B981"
                          }
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>

                <div className="mt-3 space-y-1">
                  {checkoutSteps
                    .filter((s) => s.drop_pct > 0)
                    .map((s) => (
                      <div key={s.stage} className="flex items-center gap-2 text-xs">
                        <span
                          className={`font-mono ${s.drop_pct > 30 ? "text-red-400" : s.drop_pct > 15 ? "text-yellow-400" : "text-zinc-400"}`}
                        >
                          −{s.drop_pct}%
                        </span>
                        <span className="text-zinc-500">{s.label}</span>
                      </div>
                    ))}
                </div>
              </>
            ) : (
              <p className="text-zinc-500 text-sm">
                Sem dados de checkout ainda. Os beacons coletam após o canário.
              </p>
            )}
          </GlassCard>

          {/* ═══════════════════════════════════════════════════ */}
          {/* Funil Completo (Quiz → Compra)                    */}
          {/* ═══════════════════════════════════════════════════ */}
          <GlassCard>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Funil Completo (Quiz → Compra)
              </h2>
              <span className="text-xs text-zinc-400">
                Ponta a ponta por session_id
              </span>
            </div>

            {fullFunnelSteps.length > 0 && fullFunnelSteps.some((s) => s.reached > 0) ? (
              <>
                <ResponsiveContainer width="100%" height={360}>
                  <BarChart data={fullFunnelSteps} layout="vertical" margin={{ left: 140 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                    <XAxis type="number" stroke="#888" />
                    <YAxis
                      type="category"
                      dataKey="label"
                      stroke="#888"
                      width={130}
                      tick={{ fontSize: 12 }}
                    />
                    <Tooltip
                      contentStyle={{ background: "#1a1a2e", border: "1px solid #333" }}
                      formatter={(value: number, name: string) => {
                        if (name === "reached") return [value, "Alcançaram"];
                        return [value, name];
                      }}
                    />
                    <Bar dataKey="reached" fill="#8B5CF6" radius={[0, 4, 4, 0]}>
                      {fullFunnelSteps.map((entry) => (
                        <Cell
                          key={entry.stage}
                          fill={
                            entry.stage.startsWith("c_")
                              ? entry.drop_pct > 30 ? "#EF4444" : entry.drop_pct > 15 ? "#F59E0B" : "#10B981"
                              : entry.drop_pct > 30 ? "#EF4444" : entry.drop_pct > 15 ? "#F59E0B" : "#3B82F6"
                          }
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>

                <div className="mt-3 space-y-1">
                  {fullFunnelSteps
                    .filter((s) => s.drop_pct > 0)
                    .map((s) => (
                      <div key={s.stage} className="flex items-center gap-2 text-xs">
                        <span
                          className={`font-mono ${s.drop_pct > 30 ? "text-red-400" : s.drop_pct > 15 ? "text-yellow-400" : "text-zinc-400"}`}
                        >
                          −{s.drop_pct}%
                        </span>
                        <span className="text-zinc-500">{s.label}</span>
                      </div>
                    ))}
                </div>
              </>
            ) : (
              <p className="text-zinc-500 text-sm">
                Sem dados ponta a ponta. Requer quiz + checkout instrumentados com session_id compartilhado.
              </p>
            )}
          </GlassCard>
        </>
      )}
    </div>
  );
}
