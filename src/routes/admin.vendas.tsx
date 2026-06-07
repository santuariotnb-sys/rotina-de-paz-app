import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { DollarSign, Download, TrendingUp, Undo2, Zap, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { GlassCard } from "@/components/admin/GlassCard";
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
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

const FUNIL_CARDS = [
  { key: "order_bump", label: "Order Bumps", icon: "bump" },
  { key: "upsell", label: "Upsell", icon: "up" },
  { key: "downsell", label: "Downsell", icon: "down" },
  { key: "principal", label: "Principal", icon: "main" },
] as const;

function AdminVendasPage() {
  const [period, setPeriod] = useState<Period>(PERIODS[1]);
  const since = useMemo(() => sinceISO(period), [period]);

  const { data: purchases = [], isLoading } = useQuery({
    queryKey: ["adm-vendas-purchases", period.label],
    queryFn: async (): Promise<Purchase[]> => {
      const { data, error } = await supabase
        .from("purchases")
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

  const kpis = useMemo(() => {
    let approved = 0;
    let revenue = 0;
    let refunded = 0;
    const total = purchases.length;
    for (const p of purchases) {
      if (p.status === "confirmed") {
        approved++;
        revenue += p.gross_value ?? 0;
      } else if (p.status === "refunded" || p.status === "chargeback") {
        refunded++;
      }
    }
    return { approved, revenue, refunded, total };
  }, [purchases]);

  const byProduct = useMemo(() => {
    const m: Record<string, { count: number; revenue: number }> = {};
    for (const p of purchases) {
      if (p.status !== "confirmed") continue;
      const name = p.product_name ?? "Sem nome";
      const row = (m[name] ??= { count: 0, revenue: 0 });
      row.count++;
      row.revenue += p.gross_value ?? 0;
    }
    return Object.entries(m).sort((a, b) => b[1].revenue - a[1].revenue);
  }, [purchases]);

  const funnelStats = useMemo(() => {
    const result: Record<string, { count: number; revenue: number }> = {
      order_bump: { count: 0, revenue: 0 },
      upsell: { count: 0, revenue: 0 },
      downsell: { count: 0, revenue: 0 },
      principal: { count: 0, revenue: 0 },
    };
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

  return (
    <div className="adm-fade-up space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--adm-text-muted)]">
            Fase 10
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-[var(--adm-navy-deep)]">Vendas</h1>
          <p className="mt-1 text-[13px] text-[var(--adm-text-muted)]">
            Faturamento gerado pelos webhooks aprovados da Kirvano.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              const rows = purchases.map((p) => ({
                produto: p.product_name ?? "",
                tipo: p.product_type ?? "principal",
                valor: brl(p.gross_value ?? 0),
                status: p.status,
                email: p.buyer_email ?? "",
                data: new Date(p.created_at).toLocaleString("pt-BR"),
                transacao: p.transaction_id ?? "",
              }));
              downloadCsv(
                rows,
                `vendas-${period.label}-${new Date().toISOString().slice(0, 10)}.csv`,
              );
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-medium text-[var(--adm-text-muted)] hover:bg-slate-50"
          >
            <Download className="h-3.5 w-3.5" /> CSV
          </button>
          <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5">
            {PERIODS.map((p) => (
              <button
                key={p.label}
                onClick={() => setPeriod(p)}
                className={`rounded-md px-3 py-1.5 text-[12px] font-semibold transition ${
                  period.label === p.label
                    ? "bg-[var(--adm-navy-deep)] text-white"
                    : "text-[var(--adm-text-muted)] hover:bg-slate-50"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          icon={<DollarSign className="h-4 w-4" />}
          label="Receita aprovada"
          value={brl(kpis.revenue)}
          tone="emerald"
        />
        <Kpi
          icon={<TrendingUp className="h-4 w-4" />}
          label="Vendas aprovadas"
          value={String(kpis.approved)}
          tone="navy"
        />
        <Kpi
          icon={<Undo2 className="h-4 w-4" />}
          label="Estornos / chargebacks"
          value={String(kpis.refunded)}
          tone="rose"
        />
        <Kpi
          icon={<Zap className="h-4 w-4" />}
          label="Total no período"
          value={String(kpis.total)}
          tone="amber"
        />
      </div>

      {/* Funil por tipo de oferta */}
      <div>
        <h2 className="mb-3 text-[15px] font-semibold text-[var(--adm-navy-deep)]">
          Funil de Ofertas
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FUNIL_CARDS.map((card) => {
            const stats = funnelStats[card.key];
            return (
              <GlassCard key={card.key} className="p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--adm-text-muted)]">
                  {card.label}
                </p>
                <p className="mt-2 text-2xl font-semibold text-[var(--adm-navy-deep)]">
                  {brl(stats.revenue)}
                </p>
                <p className="mt-0.5 text-[11px] text-[var(--adm-text-muted)]">
                  {stats.count} venda{stats.count !== 1 ? "s" : ""}
                </p>
              </GlassCard>
            );
          })}
        </div>
      </div>

      <GlassCard className="p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-[15px] font-semibold text-[var(--adm-navy-deep)]">
            Receita por produto
          </h2>
          <Link
            to="/admin/webhooks"
            className="inline-flex items-center gap-1 text-[12px] font-semibold text-[var(--adm-navy-deep)] hover:underline"
          >
            Ver logs <ExternalLink className="h-3 w-3" />
          </Link>
        </div>
        {byProduct.length === 0 ? (
          <p className="mt-4 text-[13px] text-[var(--adm-text-muted)]">
            Nenhuma venda aprovada no período.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-slate-100">
            {byProduct.map(([name, row]) => (
              <li key={name} className="flex items-center justify-between py-2.5">
                <span className="text-[13px] text-[var(--adm-navy-deep)]">{name}</span>
                <span className="text-[12px] text-[var(--adm-text-muted)]">
                  {row.count} venda{row.count > 1 ? "s" : ""} ·{" "}
                  <strong className="text-[var(--adm-navy-deep)]">{brl(row.revenue)}</strong>
                </span>
              </li>
            ))}
          </ul>
        )}
      </GlassCard>

      <GlassCard className="p-0">
        <header className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <h2 className="text-[15px] font-semibold text-[var(--adm-navy-deep)]">Vendas recentes</h2>
          <span className="text-[11px] text-[var(--adm-text-muted)]">
            {purchases.length} registros
          </span>
        </header>
        {isLoading ? (
          <p className="px-5 py-10 text-center text-[13px] text-[var(--adm-text-muted)]">
            Carregando…
          </p>
        ) : purchases.length === 0 ? (
          <p className="px-5 py-10 text-center text-[13px] text-[var(--adm-text-muted)]">
            Nenhuma venda registrada nesse período.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {purchases.map((p) => {
              const isConfirmed = p.status === "confirmed";
              return (
                <li
                  key={p.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold text-[var(--adm-navy-deep)]">
                      {p.product_name ?? "—"}{" "}
                      <span className="text-[var(--adm-text-muted)]">
                        · {p.buyer_email ?? "sem e-mail"}
                      </span>
                    </p>
                    <p className="mt-0.5 text-[11px] text-[var(--adm-text-muted)]">
                      {new Date(p.created_at).toLocaleString("pt-BR")} ·{" "}
                      {p.product_type ?? "principal"}
                      {p.transaction_id ? ` · ${p.transaction_id}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                        isConfirmed
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-rose-100 text-rose-700"
                      }`}
                    >
                      {p.status}
                    </span>
                    <span className="font-mono text-[12px] text-[var(--adm-navy-deep)]">
                      {brl(p.gross_value ?? 0)}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </GlassCard>
    </div>
  );
}

function Kpi({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: "emerald" | "navy" | "rose" | "amber";
}) {
  const tones: Record<string, string> = {
    emerald: "bg-emerald-50 text-emerald-700",
    navy: "bg-slate-100 text-[var(--adm-navy-deep)]",
    rose: "bg-rose-50 text-rose-700",
    amber: "bg-amber-50 text-amber-700",
  };
  return (
    <GlassCard className="p-4">
      <div className="flex items-center gap-2">
        <span
          className={`inline-flex h-7 w-7 items-center justify-center rounded-md ${tones[tone]}`}
        >
          {icon}
        </span>
        <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--adm-text-muted)]">
          {label}
        </span>
      </div>
      <p className="mt-2 text-2xl font-semibold text-[var(--adm-navy-deep)]">{value}</p>
    </GlassCard>
  );
}
