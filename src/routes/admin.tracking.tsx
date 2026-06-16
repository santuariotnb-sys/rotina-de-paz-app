import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Radio,
  Facebook,
  Globe,
  TrendingUp,
  Download,
  Search,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
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
import { downloadCsv } from "@/lib/admin/csv";
import { getConvertedLeadIds } from "@/lib/admin/conversion.functions";

export const Route = createFileRoute("/admin/tracking")({
  component: AdminTrackingPage,
});

type Lead = {
  id: string;
  name: string | null;
  email: string | null;
  archetype: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
  created_at: string;
};

function AdminTrackingPage() {
  const [period, setPeriod] = useState<Period>(PERIODS[1]);
  const [search, setSearch] = useState("");

  const since = useMemo(() => sinceISO(period), [period]);

  const { data: leads = [], isLoading } = useQuery({
    queryKey: ["adm-tracking-leads", period.label],
    queryFn: async (): Promise<Lead[]> => {
      const sb = supabase as any;
      const { data, error } = await sb
        .from("leads_reais")
        .select(
          "id, name, email, archetype, utm_source, utm_medium, utm_campaign, utm_content, utm_term, created_at",
        )
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw new Error(error.message);
      return (data ?? []) as Lead[];
    },
  });

  // Conversão via vendas_reais ↔ leads_reais.external_id (server function)
  const fetchConvertedIds = useServerFn(getConvertedLeadIds);
  const { data: convertedLeadIds = [] } = useQuery({
    queryKey: ["adm-tracking-converted-leads"],
    queryFn: () => fetchConvertedIds(),
  });

  const convertedSet = useMemo(() => new Set(convertedLeadIds), [convertedLeadIds]);

  function didConvert(lead: Lead): boolean {
    return convertedSet.has(lead.id);
  }

  const kpis = useMemo(() => {
    let withUtm = 0;
    let fb = 0;
    let google = 0;
    let converted = 0;
    for (const l of leads) {
      if (l.utm_source) {
        withUtm++;
        const src = l.utm_source.toLowerCase();
        if (src.includes("facebook") || src.includes("fb") || src.includes("ig") || src.includes("instagram")) fb++;
        if (src.includes("google") || src.includes("gclid")) google++;
      }
      if (didConvert(l)) converted++;
    }
    const rate = leads.length > 0 ? ((converted / leads.length) * 100).toFixed(1) : "0";
    return { withUtm, fb, google, rate: `${rate}%` };
  }, [leads, convertedSet]);

  const sourceChart = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const l of leads) {
      if (!l.utm_source) continue;
      counts[l.utm_source] = (counts[l.utm_source] ?? 0) + 1;
    }
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, value]) => ({ name, value }));
  }, [leads]);

  const campaignChart = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const l of leads) {
      if (!l.utm_campaign) continue;
      counts[l.utm_campaign] = (counts[l.utm_campaign] ?? 0) + 1;
    }
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, value]) => ({ name, value }));
  }, [leads]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return leads;
    return leads.filter(
      (l) =>
        (l.name ?? "").toLowerCase().includes(q) ||
        (l.utm_source ?? "").toLowerCase().includes(q) ||
        (l.utm_campaign ?? "").toLowerCase().includes(q),
    );
  }, [leads, search]);

  function handleExport() {
    const rows = leads.map((l) => ({
      nome: l.name ?? "",
      email: l.email ?? "",
      utm_source: l.utm_source ?? "",
      utm_medium: l.utm_medium ?? "",
      utm_campaign: l.utm_campaign ?? "",
      utm_content: l.utm_content ?? "",
      utm_term: l.utm_term ?? "",
      arquetipo: l.archetype ?? "",
      converteu: didConvert(l) ? "Sim" : "Não",
      data: new Date(l.created_at).toLocaleString("pt-BR"),
    }));
    downloadCsv(
      rows,
      `tracking-${period.label}-${new Date().toISOString().slice(0, 10)}.csv`,
    );
  }

  const tooltipStyle = {
    background: "#1A1B1F",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 8,
    color: "#fff",
    fontSize: 12,
  };

  return (
    <div className="adm-fade-up space-y-6">
      {/* Header */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/55">
            Fase 5
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-white">Tracking</h1>
          <p className="mt-1 text-[13px] text-white/55">
            UTMs, fontes de tráfego e conversão.
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
          label="Leads com UTM"
          value={kpis.withUtm}
          icon={<Radio className="h-4 w-4" />}
          accent="blue"
          loading={isLoading}
        />
        <KpiCard
          label="Facebook / IG"
          value={kpis.fb}
          icon={<Facebook className="h-4 w-4" />}
          accent="green"
          loading={isLoading}
        />
        <KpiCard
          label="Google"
          value={kpis.google}
          icon={<Globe className="h-4 w-4" />}
          accent="amber"
          loading={isLoading}
        />
        <KpiCard
          label="Conversão"
          value={kpis.rate}
          icon={<TrendingUp className="h-4 w-4" />}
          accent="rose"
          loading={isLoading}
        />
      </div>

      {/* Charts */}
      <div className="grid gap-4 lg:grid-cols-2">
        <GlassCard className="p-5">
          <h2 className="mb-4 text-[15px] font-semibold text-white">
            Top Sources
          </h2>
          {sourceChart.length === 0 ? (
            <p className="py-10 text-center text-[13px] text-white/40">
              Sem dados de UTM no período.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart
                data={sourceChart}
                layout="vertical"
                margin={{ left: 10, right: 20 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgba(255,255,255,0.06)"
                  horizontal={false}
                />
                <XAxis
                  type="number"
                  tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  allowDecimals={false}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={{ fill: "rgba(255,255,255,0.6)", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={120}
                />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar
                  dataKey="value"
                  fill="#3B82F6"
                  radius={[0, 4, 4, 0]}
                  name="Leads"
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </GlassCard>

        <GlassCard className="p-5">
          <h2 className="mb-4 text-[15px] font-semibold text-white">
            Top Campaigns
          </h2>
          {campaignChart.length === 0 ? (
            <p className="py-10 text-center text-[13px] text-white/40">
              Sem dados de campanha no período.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart
                data={campaignChart}
                layout="vertical"
                margin={{ left: 10, right: 20 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgba(255,255,255,0.06)"
                  horizontal={false}
                />
                <XAxis
                  type="number"
                  tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  allowDecimals={false}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={{ fill: "rgba(255,255,255,0.6)", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={120}
                />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar
                  dataKey="value"
                  fill="#8B5CF6"
                  radius={[0, 4, 4, 0]}
                  name="Leads"
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </GlassCard>
      </div>

      {/* Table */}
      <GlassCard className="overflow-hidden p-0">
        <header className="flex items-center justify-between border-b border-white/5 px-5 py-3">
          <h2 className="text-[15px] font-semibold text-white">
            Leads com UTM
          </h2>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/40" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar nome, source, campaign…"
              className="adm-input w-64 py-1.5 pl-8 text-[12px]"
            />
          </div>
        </header>
        {isLoading ? (
          <p className="px-5 py-10 text-center text-[13px] text-white/40">
            Carregando…
          </p>
        ) : filtered.length === 0 ? (
          <p className="px-5 py-10 text-center text-[13px] text-white/40">
            {search
              ? "Nenhum lead encontrado."
              : "Nenhum lead no período."}
          </p>
        ) : (
          <div className="max-h-[480px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-[#1A1B1F]/95 text-left text-[11px] uppercase tracking-wider text-white/40">
                <tr>
                  <th className="px-4 py-3">Nome</th>
                  <th className="px-4 py-3">Source</th>
                  <th className="px-4 py-3">Campaign</th>
                  <th className="px-4 py-3">Medium</th>
                  <th className="px-4 py-3">Arquétipo</th>
                  <th className="px-4 py-3">Converteu</th>
                  <th className="px-4 py-3">Data</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filtered.map((l) => (
                  <tr key={l.id} className="text-white/70">
                    <td className="px-4 py-3 text-[13px] font-medium text-white">
                      {l.name ?? "Anônimo"}
                    </td>
                    <td className="px-4 py-3 text-[12px]">
                      {l.utm_source ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-[12px]">
                      {l.utm_campaign ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-[12px]">
                      {l.utm_medium ?? "—"}
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
                    <td className="px-4 py-3">
                      {didConvert(l) ? (
                        <span className="rounded-md bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-300">
                          Sim
                        </span>
                      ) : (
                        <span className="text-[11px] text-white/30">Não</span>
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
