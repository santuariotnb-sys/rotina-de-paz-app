import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  DollarSign,
  Download,
  TrendingUp,
  Undo2,
  Zap,
  ExternalLink,
  ShoppingBag,
  ArrowUpRight,
  ArrowDownRight,
  Package,
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
import { downloadCsv } from "@/lib/admin/csv";
import { PERIODS, type Period, sinceISO } from "@/lib/admin/constants";

export const Route = createFileRoute("/admin/vendas")({
  component: AdminVendasPage,
});

type Purchase = {
  id: string;
  transaction_id: string | null;
  product_name: string | null;
  product_type: string | null;
  gross_value: number | null;
  status: string;
  buyer_email: string | null;
  kirvano_offer_id: string | null;
  created_at: string;
};

function brl(cents: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    cents / 100,
  );
}

const TYPE_CONFIG: Record<string, { label: string; color: string; icon: typeof Package }> = {
  principal: { label: "Principal", color: "#3B82F6", icon: Package },
  order_bump: { label: "Order Bump", color: "#8B5CF6", icon: ShoppingBag },
  upsell: { label: "Upsell", color: "#10B981", icon: ArrowUpRight },
  downsell: { label: "Downsell", color: "#F59E0B", icon: ArrowDownRight },
};

const tooltipStyle = {
  background: "#1A1B1F",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 8,
  color: "#fff",
  fontSize: 12,
};

function AdminVendasPage() {
  const [period, setPeriod] = useState<Period>(PERIODS[1]);
  const since = useMemo(() => sinceISO(period), [period]);

  const { data: purchases = [], isLoading } = useQuery({
    queryKey: ["adm-vendas-purchases", period.label],
    queryFn: async (): Promise<Purchase[]> => {
      const sb = supabase as any;
      const { data, error } = await sb
        .from("vendas_reais")
        .select(
          "id, transaction_id, product_name, product_type, gross_value, status, buyer_email, kirvano_offer_id, created_at",
        )
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw new Error(error.message);
      return (data ?? []) as Purchase[];
    },
  });

  // ── KPIs ──────────────────────────────────────────
  const kpis = useMemo(() => {
    let approved = 0;
    let revenue = 0;
    let refunded = 0;
    for (const p of purchases) {
      if (p.status === "confirmed") {
        approved++;
        revenue += p.gross_value ?? 0;
      } else if (p.status === "refunded" || p.status === "chargeback") {
        refunded++;
      }
    }
    const aov = approved > 0 ? revenue / approved : 0;
    return { approved, revenue, refunded, total: purchases.length, aov };
  }, [purchases]);

  // ── Funil por tipo ────────────────────────────────
  const funnelStats = useMemo(() => {
    const result: Record<string, { count: number; revenue: number }> = {};
    for (const key of Object.keys(TYPE_CONFIG)) {
      result[key] = { count: 0, revenue: 0 };
    }
    for (const p of purchases) {
      if (p.status !== "confirmed") continue;
      const type = p.product_type ?? "principal";
      if (result[type]) {
        result[type].count++;
        result[type].revenue += p.gross_value ?? 0;
      }
    }
    return result;
  }, [purchases]);

  // ── Receita por produto (chart) ───────────────────
  const byProduct = useMemo(() => {
    const m: Record<string, { count: number; revenue: number }> = {};
    for (const p of purchases) {
      if (p.status !== "confirmed") continue;
      const name = p.product_name ?? "Sem nome";
      const row = (m[name] ??= { count: 0, revenue: 0 });
      row.count++;
      row.revenue += p.gross_value ?? 0;
    }
    return Object.entries(m)
      .sort((a, b) => b[1].revenue - a[1].revenue)
      .map(([name, row]) => ({
        name,
        receita: row.revenue / 100,
        vendas: row.count,
      }));
  }, [purchases]);

  // ── Export ────────────────────────────────────────
  function handleExport() {
    const rows = purchases.map((p) => ({
      produto: p.product_name ?? "",
      tipo: p.product_type ?? "principal",
      valor: brl(p.gross_value ?? 0),
      status: p.status,
      email: p.buyer_email ?? "",
      data: new Date(p.created_at).toLocaleString("pt-BR"),
      transacao: p.transaction_id ?? "",
    }));
    downloadCsv(rows, `vendas-${period.label}-${new Date().toISOString().slice(0, 10)}.csv`);
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
            Primordia · Vendas
          </p>
          <h1
            className="mt-1 text-3xl font-semibold text-[#1A1D26]"
            style={{ fontFamily: '"Cormorant Garamond", serif', letterSpacing: "0.01em" }}
          >
            Faturamento
          </h1>
          <p className="mt-2 text-[13px] text-[#4B5060]">
            Vendas aprovadas pela Kirvano — receita, funil de ofertas e ticket médio.
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
          icon={<DollarSign className="h-5 w-5" />}
          label="Receita aprovada"
          value={brl(kpis.revenue)}
          loading={isLoading}
          accent="green"
          hint={`${kpis.approved} vendas confirmadas`}
        />
        <KpiCard
          icon={<TrendingUp className="h-5 w-5" />}
          label="Ticket médio"
          value={brl(kpis.aov)}
          loading={isLoading}
          accent="blue"
          hint="AOV por venda aprovada"
        />
        <KpiCard
          icon={<Undo2 className="h-5 w-5" />}
          label="Estornos"
          value={kpis.refunded}
          loading={isLoading}
          accent="rose"
          hint={kpis.refunded === 0 ? "Zero estornos" : undefined}
        />
        <KpiCard
          icon={<Zap className="h-5 w-5" />}
          label="Total no período"
          value={kpis.total}
          loading={isLoading}
          accent="amber"
          hint={`${kpis.approved} aprovadas`}
        />
      </section>

      {/* Funil de ofertas */}
      <GlassCard>
        <h2 className="mb-4 text-[15px] font-semibold text-white">
          Funil de ofertas
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {(["principal", "order_bump", "upsell", "downsell"] as const).map((key) => {
            const config = TYPE_CONFIG[key];
            const stats = funnelStats[key];
            const Icon = config.icon;
            const pctRevenue =
              kpis.revenue > 0
                ? ((stats.revenue / kpis.revenue) * 100).toFixed(0)
                : "0";
            return (
              <div
                key={key}
                className="rounded-xl bg-white/[0.04] p-4 ring-1 ring-white/[0.06]"
              >
                <div className="flex items-center gap-2">
                  <div
                    className="grid h-7 w-7 place-items-center rounded-lg"
                    style={{ backgroundColor: `${config.color}20` }}
                  >
                    <Icon className="h-3.5 w-3.5" style={{ color: config.color }} />
                  </div>
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-white/50">
                    {config.label}
                  </span>
                </div>
                <p
                  className="mt-3 text-2xl font-semibold text-white tabular-nums"
                  style={{ fontFamily: '"Cormorant Garamond", serif' }}
                >
                  {brl(stats.revenue)}
                </p>
                <div className="mt-1.5 flex items-center gap-2 text-[11px] text-white/40">
                  <span>
                    {stats.count} venda{stats.count !== 1 ? "s" : ""}
                  </span>
                  <span>·</span>
                  <span>{pctRevenue}% da receita</span>
                </div>
                {/* Mini bar */}
                <div className="mt-2 h-1 w-full rounded-full bg-white/[0.06]">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${pctRevenue}%`,
                      backgroundColor: config.color,
                      opacity: 0.6,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </GlassCard>

      {/* Receita por produto */}
      <div className="grid gap-4 lg:grid-cols-2">
        <GlassCard className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-[15px] font-semibold text-white">
              Receita por produto
            </h2>
            <Link
              to="/admin/webhooks"
              className="inline-flex items-center gap-1 text-[11px] font-medium text-white/40 hover:text-white/60"
            >
              Ver logs <ExternalLink className="h-3 w-3" />
            </Link>
          </div>
          {byProduct.length === 0 ? (
            <p className="py-10 text-center text-[13px] text-white/40">
              Nenhuma venda aprovada no período.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart
                data={byProduct}
                layout="vertical"
                margin={{ left: 0, right: 20 }}
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
                  tickFormatter={(v) => `R$${v}`}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={{ fill: "rgba(255,255,255,0.6)", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={140}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(value: number) => [`R$ ${value.toFixed(2)}`, "Receita"]}
                />
                <Bar dataKey="receita" fill="#10B981" radius={[0, 4, 4, 0]} name="Receita" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </GlassCard>

        {/* Lista de produtos */}
        <GlassCard className="p-5">
          <h2 className="mb-4 text-[15px] font-semibold text-white">
            Detalhamento
          </h2>
          {byProduct.length === 0 ? (
            <p className="py-10 text-center text-[13px] text-white/40">
              Sem dados no período.
            </p>
          ) : (
            <div className="space-y-1">
              {byProduct.map((row) => (
                <div
                  key={row.name}
                  className="flex items-center justify-between rounded-lg px-3 py-2.5 hover:bg-white/[0.04]"
                >
                  <span className="text-[13px] font-medium text-white/80">
                    {row.name}
                  </span>
                  <div className="flex items-center gap-3 text-[12px]">
                    <span className="text-white/40">
                      {row.vendas} venda{row.vendas > 1 ? "s" : ""}
                    </span>
                    <span className="tabular-nums font-semibold text-white">
                      R$ {row.receita.toFixed(2)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </GlassCard>
      </div>

      {/* Vendas recentes */}
      <GlassCard className="overflow-hidden p-0">
        <header className="flex items-center justify-between border-b border-white/[0.06] px-5 py-3">
          <h2 className="text-[15px] font-semibold text-white">
            Vendas recentes
          </h2>
          <span className="text-[11px] text-white/40">
            {purchases.length} registros
          </span>
        </header>
        {isLoading ? (
          <div className="space-y-3 px-5 py-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center justify-between">
                <div className="space-y-2">
                  <div className="h-3 w-40 animate-pulse rounded bg-white/10" />
                  <div className="h-2 w-24 animate-pulse rounded bg-white/5" />
                </div>
                <div className="h-4 w-16 animate-pulse rounded bg-white/10" />
              </div>
            ))}
          </div>
        ) : purchases.length === 0 ? (
          <p className="px-5 py-10 text-center text-[13px] text-white/40">
            Nenhuma venda registrada nesse período.
          </p>
        ) : (
          <div className="max-h-[480px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-[#1A1B1F]/95 text-left text-[10px] uppercase tracking-wider text-white/40">
                <tr>
                  <th className="px-5 py-3">Produto</th>
                  <th className="px-4 py-3">Tipo</th>
                  <th className="px-4 py-3">Comprador</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Valor</th>
                  <th className="px-4 py-3 text-right">Data</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {purchases.map((p) => {
                  const isConfirmed = p.status === "confirmed";
                  const typeConfig = TYPE_CONFIG[p.product_type ?? "principal"];
                  return (
                    <tr key={p.id} className="text-white/70">
                      <td className="px-5 py-3">
                        <span className="text-[13px] font-medium text-white">
                          {p.product_name ?? "—"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className="rounded-md px-2 py-0.5 text-[10px] font-semibold"
                          style={{
                            backgroundColor: `${typeConfig?.color ?? "#6B7280"}20`,
                            color: typeConfig?.color ?? "#6B7280",
                          }}
                        >
                          {typeConfig?.label ?? p.product_type ?? "—"}
                        </span>
                      </td>
                      <td className="max-w-[160px] truncate px-4 py-3 text-[12px] text-white/50">
                        {p.buyer_email ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                            isConfirmed
                              ? "bg-emerald-500/15 text-emerald-400"
                              : "bg-red-500/15 text-red-400"
                          }`}
                        >
                          {isConfirmed ? "Aprovada" : p.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-[13px] font-semibold text-white">
                        {brl(p.gross_value ?? 0)}
                      </td>
                      <td className="px-4 py-3 text-right text-[12px] text-white/40">
                        {new Date(p.created_at).toLocaleString("pt-BR", {
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
    </div>
  );
}
