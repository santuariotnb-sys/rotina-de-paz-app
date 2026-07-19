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
  Instagram,
  Users,
  Target,
  BarChart3,
  MessageCircle,
  CheckCircle2,
  Clock3,
  XCircle,
} from "lucide-react";
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
import { downloadCsv } from "@/lib/admin/csv";
import { getConvertedLeadIds } from "@/lib/admin/conversion.functions";
import { getMetaOverlay, type MetaOverlayRow } from "@/lib/admin/meta-overlay.functions";
import {
  getWhatsAppQueueStats,
  type WhatsAppQueueStats,
} from "@/lib/admin/whatsapp-queue.functions";
import { useAdminQuiz } from "@/lib/admin/quiz-context";

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

// ── Helpers ─────────────────────────────────────────

/** Normalize utm_source to a canonical platform name */
function normalizePlatform(source: string | null): string {
  if (!source) return "Direto";
  const s = source.toLowerCase().trim();
  if (s === "fb" || s === "facebook" || s.includes("facebook")) return "Meta Ads";
  if (s === "ig" || s === "instagram" || s.includes("instagram")) return "Meta Ads";
  if (s.includes("google") || s.includes("gclid")) return "Google";
  if (s.includes("tiktok")) return "TikTok";
  return source;
}

/** Extract clean campaign name from utm_medium (removes Meta IDs) */
function cleanCampaignName(medium: string | null): string {
  if (!medium) return "—";
  // Remove Meta ad IDs (|120251...)
  const clean = medium.replace(/\|?\d{15,}/g, "").trim();
  // Remove trailing separators
  return clean.replace(/[_|]+$/, "").trim() || medium;
}

/** Extract clean ad creative name from utm_content */
function cleanAdName(content: string | null): string {
  if (!content) return "—";
  return (
    content
      .replace(/\|?\d{15,}/g, "")
      .replace(/[_|]+$/, "")
      .trim() || content
  );
}

/** Format a number as Brazilian Real */
function fmtBRL(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const PLATFORM_COLORS: Record<string, string> = {
  "Meta Ads": "#1877F2",
  Google: "#34A853",
  TikTok: "#FF0050",
  Direto: "#6B7280",
};

const WA_STATUS_LABELS: Record<string, string> = {
  sent: "Enviado",
  pending: "Pendente",
  failed: "Falhou",
  skipped: "Descartado",
};

const WA_STATUS_STYLES: Record<string, string> = {
  sent: "bg-emerald-500/15 text-emerald-300",
  pending: "bg-amber-500/15 text-amber-300",
  failed: "bg-rose-500/15 text-rose-300",
  skipped: "bg-white/10 text-white/50",
};

const tooltipStyle = {
  background: "#1A1B1F",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 8,
  color: "#fff",
  fontSize: 12,
};

// ── Component ───────────────────────────────────────

function AdminTrackingPage() {
  const [period, setPeriod] = useState<Period>(PERIODS[1]);
  const [search, setSearch] = useState("");
  const { quizId } = useAdminQuiz();

  const since = useMemo(() => sinceISO(period), [period]);

  const { data: leads = [], isLoading } = useQuery({
    queryKey: ["adm-tracking-leads", period.label, quizId],
    queryFn: async (): Promise<Lead[]> => {
      const sb = supabase as any;
      let query = sb
        .from("leads_reais")
        .select(
          "id, name, email, archetype, utm_source, utm_medium, utm_campaign, utm_content, utm_term, created_at",
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

  const fetchConvertedIds = useServerFn(getConvertedLeadIds);
  const { data: convertedLeadIds = [] } = useQuery({
    queryKey: ["adm-tracking-converted-leads", quizId],
    queryFn: () => fetchConvertedIds({ data: { quizId } }),
  });

  const convertedSet = useMemo(() => new Set(convertedLeadIds), [convertedLeadIds]);
  function didConvert(lead: Lead): boolean {
    return convertedSet.has(lead.id);
  }

  // ── Overlay Meta (gasto × retorno por criativo) ───
  const fetchMetaOverlay = useServerFn(getMetaOverlay);
  const { data: metaOverlay = [], isLoading: metaLoading } = useQuery({
    queryKey: ["adm-tracking-meta-overlay", period.days],
    queryFn: (): Promise<MetaOverlayRow[]> => fetchMetaOverlay({ data: { days: period.days } }),
  });

  // ── WhatsApp — fila de envios (whatsapp_sends) ────
  const fetchWaStats = useServerFn(getWhatsAppQueueStats);
  const { data: waStats, isLoading: waLoading } = useQuery({
    queryKey: ["adm-whatsapp-queue", quizId],
    queryFn: (): Promise<WhatsAppQueueStats> => fetchWaStats({ data: { quizId } }),
  });

  // ── KPIs ──────────────────────────────────────────
  const kpis = useMemo(() => {
    let withUtm = 0;
    let meta = 0;
    let google = 0;
    let direto = 0;
    let converted = 0;
    for (const l of leads) {
      const platform = normalizePlatform(l.utm_source);
      if (l.utm_source) withUtm++;
      else direto++;
      if (platform === "Meta Ads") meta++;
      if (platform === "Google") google++;
      if (didConvert(l)) converted++;
    }
    const rate = leads.length > 0 ? ((converted / leads.length) * 100).toFixed(1) : "0";
    return { total: leads.length, withUtm, meta, google, direto, converted, rate: `${rate}%` };
  }, [leads, convertedSet]);

  // ── Platform breakdown (pie) ──────────────────────
  const platformData = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const l of leads) {
      const p = normalizePlatform(l.utm_source);
      counts[p] = (counts[p] ?? 0) + 1;
    }
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([name, value]) => ({
        name,
        value,
        color: PLATFORM_COLORS[name] ?? "#6B7280",
      }));
  }, [leads]);

  // ── Campaign chart (cleaned names from utm_medium) ─
  const campaignChart = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const l of leads) {
      if (!l.utm_medium && !l.utm_campaign) continue;
      const name = cleanCampaignName(l.utm_medium) || l.utm_campaign || "—";
      counts[name] = (counts[name] ?? 0) + 1;
    }
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([name, value]) => ({ name, value }));
  }, [leads]);

  // ── Ad creative chart (from utm_content) ──────────
  const adChart = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const l of leads) {
      if (!l.utm_content) continue;
      const name = cleanAdName(l.utm_content);
      counts[name] = (counts[name] ?? 0) + 1;
    }
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([name, value]) => ({ name, value }));
  }, [leads]);

  // ── Archetype × Platform matrix ───────────────────
  const archetypeByPlatform = useMemo(() => {
    const matrix: Record<string, Record<string, number>> = {};
    for (const l of leads) {
      const arch = l.archetype ?? "indefinido";
      const platform = normalizePlatform(l.utm_source);
      if (!matrix[arch]) matrix[arch] = {};
      matrix[arch][platform] = (matrix[arch][platform] ?? 0) + 1;
    }
    return matrix;
  }, [leads]);

  const platforms = useMemo(
    () => [...new Set(leads.map((l) => normalizePlatform(l.utm_source)))].sort(),
    [leads],
  );

  // ── Filtered table ────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return leads;
    return leads.filter(
      (l) =>
        (l.name ?? "").toLowerCase().includes(q) ||
        (l.utm_source ?? "").toLowerCase().includes(q) ||
        (l.utm_campaign ?? "").toLowerCase().includes(q) ||
        (l.utm_medium ?? "").toLowerCase().includes(q) ||
        (l.utm_content ?? "").toLowerCase().includes(q),
    );
  }, [leads, search]);

  function handleExport() {
    const rows = leads.map((l) => ({
      nome: l.name ?? "",
      email: l.email ?? "",
      plataforma: normalizePlatform(l.utm_source),
      utm_source: l.utm_source ?? "",
      utm_medium: l.utm_medium ?? "",
      campanha: cleanCampaignName(l.utm_medium),
      criativo: cleanAdName(l.utm_content),
      utm_campaign: l.utm_campaign ?? "",
      utm_content: l.utm_content ?? "",
      utm_term: l.utm_term ?? "",
      arquetipo: l.archetype ?? "",
      converteu: didConvert(l) ? "Sim" : "Não",
      data: new Date(l.created_at).toLocaleString("pt-BR"),
    }));
    downloadCsv(rows, `tracking-${period.label}-${new Date().toISOString().slice(0, 10)}.csv`);
  }

  return (
    <div className="adm-fade-up space-y-6">
      {/* Header */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p
            className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[#8B7355]"
            style={{ fontFamily: '"Cormorant Garamond", serif' }}
          >
            Primordia · Tracking
          </p>
          <h1
            className="mt-1 text-3xl font-semibold text-[#1A1D26]"
            style={{ fontFamily: '"Cormorant Garamond", serif', letterSpacing: "0.01em" }}
          >
            Fontes de tráfego
          </h1>
          <p className="mt-2 text-[13px] text-[#4B5060]">
            UTMs, plataformas, campanhas e criativos — por lead.
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
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Total de leads"
          value={kpis.total}
          icon={<Users className="h-5 w-5" />}
          accent="blue"
          loading={isLoading}
          hint={`${kpis.withUtm} com UTM · ${kpis.direto} direto`}
        />
        <KpiCard
          label="Meta Ads"
          value={kpis.meta}
          icon={<Facebook className="h-5 w-5" />}
          accent="blue"
          loading={isLoading}
          hint="Facebook + Instagram"
        />
        <KpiCard
          label="Google"
          value={kpis.google}
          icon={<Globe className="h-5 w-5" />}
          accent="green"
          loading={isLoading}
        />
        <KpiCard
          label="Conversão"
          value={kpis.rate}
          icon={<TrendingUp className="h-5 w-5" />}
          accent="amber"
          loading={isLoading}
          hint={`${kpis.converted} de ${kpis.total} leads`}
        />
      </section>

      {/* Row 1: Platform pie + Campaign bar */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Platform breakdown */}
        <GlassCard className="p-5">
          <div className="mb-4 flex items-center gap-2">
            <Radio className="h-4 w-4 text-white/50" />
            <h2 className="text-[15px] font-semibold text-white">Por plataforma</h2>
          </div>
          {platformData.length === 0 ? (
            <p className="py-10 text-center text-[13px] text-white/40">Sem dados no período.</p>
          ) : (
            <div className="flex items-center gap-6">
              <ResponsiveContainer width={160} height={160}>
                <PieChart>
                  <Pie
                    data={platformData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={72}
                    strokeWidth={0}
                  >
                    {platformData.map((d, i) => (
                      <Cell key={i} fill={d.color} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 space-y-2">
                {platformData.map((d) => (
                  <div key={d.name} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: d.color }}
                      />
                      <span className="text-[13px] text-white/80">{d.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="tabular-nums text-[13px] font-semibold text-white">
                        {d.value}
                      </span>
                      <span className="w-10 text-right tabular-nums text-[11px] text-white/40">
                        {leads.length > 0
                          ? `${((d.value / leads.length) * 100).toFixed(0)}%`
                          : "0%"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </GlassCard>

        {/* Top campaigns */}
        <GlassCard className="p-5">
          <div className="mb-4 flex items-center gap-2">
            <Target className="h-4 w-4 text-white/50" />
            <h2 className="text-[15px] font-semibold text-white">Top campanhas</h2>
          </div>
          {campaignChart.length === 0 ? (
            <p className="py-10 text-center text-[13px] text-white/40">
              Sem dados de campanha no período.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={campaignChart} layout="vertical" margin={{ left: 0, right: 20 }}>
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
                  tick={{ fill: "rgba(255,255,255,0.6)", fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  width={140}
                />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="value" fill="#8B5CF6" radius={[0, 4, 4, 0]} name="Leads" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </GlassCard>
      </div>

      {/* Row 2: Ad creatives + Archetype × Platform */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Top ad creatives */}
        <GlassCard className="p-5">
          <div className="mb-4 flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-white/50" />
            <h2 className="text-[15px] font-semibold text-white">Top criativos</h2>
          </div>
          {adChart.length === 0 ? (
            <p className="py-10 text-center text-[13px] text-white/40">
              Sem dados de criativos no período.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={adChart} layout="vertical" margin={{ left: 0, right: 20 }}>
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
                  tick={{ fill: "rgba(255,255,255,0.6)", fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  width={140}
                />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="value" fill="#F59E0B" radius={[0, 4, 4, 0]} name="Leads" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </GlassCard>

        {/* Archetype × Platform matrix */}
        <GlassCard className="p-5">
          <div className="mb-4 flex items-center gap-2">
            <Users className="h-4 w-4 text-white/50" />
            <h2 className="text-[15px] font-semibold text-white">Arquétipo × Plataforma</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wider text-white/40">
                  <th className="pb-2 pr-4">Arquétipo</th>
                  {platforms.map((p) => (
                    <th key={p} className="pb-2 px-2 text-center">
                      {p}
                    </th>
                  ))}
                  <th className="pb-2 pl-2 text-center">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {Object.entries(archetypeByPlatform)
                  .sort((a, b) => {
                    const totalA = Object.values(a[1]).reduce((s, v) => s + v, 0);
                    const totalB = Object.values(b[1]).reduce((s, v) => s + v, 0);
                    return totalB - totalA;
                  })
                  .map(([arch, counts]) => {
                    const total = Object.values(counts).reduce((s, v) => s + v, 0);
                    return (
                      <tr key={arch}>
                        <td className="py-2 pr-4">
                          <span
                            className="rounded-md px-2 py-0.5 text-[11px] font-medium"
                            style={{
                              backgroundColor: `${ARCHETYPE_COLORS[arch] ?? "#6B7280"}20`,
                              color: ARCHETYPE_COLORS[arch] ?? "#6B7280",
                            }}
                          >
                            {ARCHETYPE_LABELS[arch] ?? arch}
                          </span>
                        </td>
                        {platforms.map((p) => (
                          <td
                            key={p}
                            className="px-2 py-2 text-center tabular-nums text-[12px] text-white/60"
                          >
                            {counts[p] ?? 0}
                          </td>
                        ))}
                        <td className="pl-2 py-2 text-center tabular-nums text-[12px] font-semibold text-white/80">
                          {total}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </GlassCard>
      </div>

      {/* Overlay Meta — Gasto × Retorno por criativo */}
      <GlassCard className="overflow-hidden p-0">
        <header className="flex items-center gap-2 border-b border-white/5 px-5 py-3">
          <Facebook className="h-4 w-4 text-[#1877F2]" />
          <h2 className="text-[15px] font-semibold text-white">
            Overlay Meta — Gasto × Retorno por criativo
          </h2>
        </header>
        {metaLoading ? (
          <p className="px-5 py-10 text-center text-[13px] text-white/40">Carregando…</p>
        ) : metaOverlay.length === 0 ? (
          <p className="px-5 py-10 text-center text-[13px] text-white/40">
            Sem dados de gasto Meta no período.
          </p>
        ) : (
          <div className="max-h-[480px] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-[#1A1B1F]/95 text-left text-[10px] uppercase tracking-wider text-white/40">
                <tr>
                  <th className="px-4 py-3">Criativo</th>
                  <th className="px-4 py-3 text-right">Gasto</th>
                  <th className="px-4 py-3 text-right">Leads</th>
                  <th className="px-4 py-3 text-right">CPL</th>
                  <th className="px-4 py-3 text-right">Vendas</th>
                  <th className="px-4 py-3 text-right">Receita</th>
                  <th className="px-4 py-3 text-right">ROAS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {metaOverlay.map((r, i) => (
                  <tr key={i} className="text-white/70">
                    <td className="max-w-[220px] truncate px-4 py-3 text-[13px] font-medium text-white">
                      {r.adName}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-[12px]">
                      {fmtBRL(r.spend)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-[12px]">{r.leads}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-[12px]">
                      {r.cpl == null ? "—" : fmtBRL(r.cpl)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-[12px]">{r.sales}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-[12px] text-emerald-300">
                      {r.revenue > 0 ? fmtBRL(r.revenue) : "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {r.roas == null ? (
                        <span className="text-[11px] text-white/30">—</span>
                      ) : (
                        <span
                          className={`rounded-md px-2 py-0.5 text-[12px] font-semibold tabular-nums ${
                            r.roas >= 1
                              ? "bg-emerald-500/15 text-emerald-300"
                              : "bg-rose-500/15 text-rose-300"
                          }`}
                        >
                          {r.roas.toFixed(2)}×
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </GlassCard>

      {/* Leads table */}
      <GlassCard className="overflow-hidden p-0">
        <header className="flex items-center justify-between border-b border-white/5 px-5 py-3">
          <h2 className="text-[15px] font-semibold text-white">Leads ({filtered.length})</h2>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/40" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar nome, source, campanha, criativo…"
              className="adm-input w-72 py-1.5 pl-8 text-[12px]"
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
              <thead className="sticky top-0 bg-[#1A1B1F]/95 text-left text-[10px] uppercase tracking-wider text-white/40">
                <tr>
                  <th className="px-4 py-3">Nome</th>
                  <th className="px-4 py-3">Plataforma</th>
                  <th className="px-4 py-3">Campanha</th>
                  <th className="px-4 py-3">Criativo</th>
                  <th className="px-4 py-3">Arquétipo</th>
                  <th className="px-4 py-3">Conv.</th>
                  <th className="px-4 py-3">Data</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filtered.map((l) => {
                  const platform = normalizePlatform(l.utm_source);
                  const platformColor = PLATFORM_COLORS[platform] ?? "#6B7280";
                  return (
                    <tr key={l.id} className="text-white/70">
                      <td className="px-4 py-3 text-[13px] font-medium text-white">
                        {l.name ?? "Anônimo"}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className="rounded-md px-2 py-0.5 text-[11px] font-medium"
                          style={{
                            backgroundColor: `${platformColor}20`,
                            color: platformColor,
                          }}
                        >
                          {platform}
                        </span>
                      </td>
                      <td className="max-w-[180px] truncate px-4 py-3 text-[12px]">
                        {cleanCampaignName(l.utm_medium) || l.utm_campaign || "—"}
                      </td>
                      <td className="max-w-[160px] truncate px-4 py-3 text-[12px]">
                        {cleanAdName(l.utm_content)}
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
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </GlassCard>

      {/* WhatsApp — fila de envios (whatsapp_sends) */}
      <GlassCard>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <MessageCircle className="h-5 w-5" />
            WhatsApp — Fila de Envios
          </h2>
          <span className="text-xs text-zinc-400">Últimos 10 envios</span>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-6 sm:grid-cols-4">
          <KpiCard
            label="Enviados"
            value={waStats?.totalSent ?? 0}
            icon={<CheckCircle2 className="h-4 w-4" />}
            accent="green"
            loading={waLoading}
          />
          <KpiCard
            label="Pendentes"
            value={waStats?.totalPending ?? 0}
            icon={<Clock3 className="h-4 w-4" />}
            accent="amber"
            loading={waLoading}
          />
          <KpiCard
            label="Falhas"
            value={waStats?.totalFailed ?? 0}
            icon={<XCircle className="h-4 w-4" />}
            accent="rose"
            loading={waLoading}
          />
          <KpiCard
            label="Descartados"
            value={waStats?.totalSkipped ?? 0}
            icon={<MessageCircle className="h-4 w-4" />}
            loading={waLoading}
          />
        </div>

        {waLoading ? (
          <p className="py-6 text-center text-[13px] text-white/40">Carregando…</p>
        ) : (waStats?.recent.length ?? 0) === 0 ? (
          <p className="py-6 text-center text-[13px] text-white/40">
            Nenhum envio registrado ainda.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-[10px] uppercase tracking-wider text-white/40">
                <tr>
                  <th className="px-3 py-2">Data</th>
                  <th className="px-3 py-2">Telefone</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Quiz</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {(waStats?.recent ?? []).map((r) => (
                  <tr key={r.id} className="text-white/70">
                    <td className="px-3 py-2 text-[12px] text-white/50">
                      {new Date(r.createdAt).toLocaleString("pt-BR", {
                        day: "2-digit",
                        month: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="px-3 py-2 font-mono text-[12px] text-white/70">
                      {r.phoneMasked}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${
                          WA_STATUS_STYLES[r.status] ?? "bg-white/10 text-white/50"
                        }`}
                      >
                        {WA_STATUS_LABELS[r.status] ?? r.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-[12px] text-white/50">{r.quizId ?? "—"}</td>
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
