import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { DollarSign, TrendingUp, Undo2, Zap, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { GlassCard } from "@/components/admin/GlassCard";

export const Route = createFileRoute("/admin/vendas")({
  component: AdminVendasPage,
});

type Ent = {
  id: string;
  user_id: string;
  product_id: string;
  source: string;
  status: string;
  buyer_email: string | null;
  granted_at: string;
  revoked_at: string | null;
  kirvano_transaction_id: string | null;
};
type Product = { id: string; name: string; price_cents: number; currency: string };

const PERIODS = [
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
  { label: "Tudo", days: 3650 },
] as const;

function brl(cents: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

const FUNIL_CARDS = [
  { key: "bump1", label: "Order Bump 1", product: "A cadastrar", price: "—" },
  { key: "bump2", label: "Order Bump 2", product: "A cadastrar", price: "—" },
  { key: "upsell", label: "Upsell", product: "Chave da Gratidão", price: "R$ 67" },
  { key: "downsell", label: "Downsell", product: "Chave da Gratidão", price: "R$ 37" },
] as const;

function AdminVendasPage() {
  const [period, setPeriod] = useState<(typeof PERIODS)[number]>(PERIODS[1]);

  const { data: products = [] } = useQuery({
    queryKey: ["adm-vendas-products"],
    queryFn: async (): Promise<Product[]> => {
      const { data, error } = await supabase.from("products").select("id, name, price_cents, currency");
      if (error) throw new Error(error.message);
      return (data ?? []) as Product[];
    },
  });

  const sinceISO = useMemo(() => new Date(Date.now() - period.days * 86400_000).toISOString(), [period]);

  const { data: ents = [], isLoading } = useQuery({
    queryKey: ["adm-vendas", period.label],
    queryFn: async (): Promise<Ent[]> => {
      const { data, error } = await supabase
        .from("entitlements")
        .select("id, user_id, product_id, source, status, buyer_email, granted_at, revoked_at, kirvano_transaction_id")
        .gte("granted_at", sinceISO)
        .order("granted_at", { ascending: false })
        .limit(500);
      if (error) throw new Error(error.message);
      return (data ?? []) as Ent[];
    },
  });

  const productById = useMemo(() => {
    const m: Record<string, Product> = {};
    for (const p of products) m[p.id] = p;
    return m;
  }, [products]);

  const kpis = useMemo(() => {
    let approved = 0;
    let revenue = 0;
    let refunded = 0;
    let kirvano = 0;
    for (const e of ents) {
      const price = productById[e.product_id]?.price_cents ?? 0;
      if (e.source === "kirvano") kirvano++;
      if (e.status === "active") {
        approved++;
        revenue += price;
      } else if (e.status === "refunded" || e.status === "revoked") {
        refunded++;
      }
    }
    return { approved, revenue, refunded, kirvano };
  }, [ents, productById]);

  const byProduct = useMemo(() => {
    const m: Record<string, { count: number; revenue: number }> = {};
    for (const e of ents) {
      if (e.status !== "active") continue;
      const price = productById[e.product_id]?.price_cents ?? 0;
      const row = (m[e.product_id] ??= { count: 0, revenue: 0 });
      row.count++;
      row.revenue += price;
    }
    return Object.entries(m).sort((a, b) => b[1].revenue - a[1].revenue);
  }, [ents, productById]);

  // Stats por slot do funil (match por nome do produto)
  const funnelStats = useMemo(() => {
    const empty = { count: 0, revenue: 0 };
    const result: Record<string, { count: number; revenue: number }> = {
      bump1: { ...empty },
      bump2: { ...empty },
      upsell: { ...empty },
      downsell: { ...empty },
    };
    for (const e of ents) {
      if (e.status !== "active") continue;
      const p = productById[e.product_id];
      if (!p) continue;
      const name = p.name.toLowerCase();
      const price = p.price_cents;
      // Upsell/Downsell: "chave da gratidão" — diferencia pelo preço
      if (name.includes("chave")) {
        if (price <= 4000) {
          result.downsell.count++;
          result.downsell.revenue += price;
        } else {
          result.upsell.count++;
          result.upsell.revenue += price;
        }
      }
      // Order bumps: cadastrar produtos e ajustar match aqui
      // bump1: if (name.includes("...")) { result.bump1.count++; result.bump1.revenue += price; }
      // bump2: if (name.includes("...")) { result.bump2.count++; result.bump2.revenue += price; }
    }
    return result;
  }, [ents, productById]);

  return (
    <div className="adm-fade-up space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--adm-text-muted)]">Fase 10</p>
          <h1 className="mt-1 text-2xl font-semibold text-[var(--adm-navy-deep)]">Vendas</h1>
          <p className="mt-1 text-[13px] text-[var(--adm-text-muted)]">Faturamento gerado pelos webhooks aprovados da Kirvano.</p>
        </div>
        <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5">
          {PERIODS.map((p) => (
            <button
              key={p.label}
              onClick={() => setPeriod(p)}
              className={`rounded-md px-3 py-1.5 text-[12px] font-semibold transition ${
                period.label === p.label ? "bg-[var(--adm-navy-deep)] text-white" : "text-[var(--adm-text-muted)] hover:bg-slate-50"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi icon={<DollarSign className="h-4 w-4" />} label="Receita aprovada" value={brl(kpis.revenue)} tone="emerald" />
        <Kpi icon={<TrendingUp className="h-4 w-4" />} label="Vendas aprovadas" value={String(kpis.approved)} tone="navy" />
        <Kpi icon={<Undo2 className="h-4 w-4" />} label="Estornos / cancelados" value={String(kpis.refunded)} tone="rose" />
        <Kpi icon={<Zap className="h-4 w-4" />} label="Eventos Kirvano" value={String(kpis.kirvano)} tone="amber" />
      </div>

      {/* Funil: Order Bump 1, Order Bump 2, Upsell, Downsell */}
      <div>
        <h2 className="mb-3 text-[15px] font-semibold text-[var(--adm-navy-deep)]">Funil de Ofertas</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FUNIL_CARDS.map((card) => {
            const stats = funnelStats[card.key];
            return (
              <GlassCard key={card.key} className="p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--adm-text-muted)]">{card.label}</p>
                <p className="mt-1 text-[13px] text-[var(--adm-navy-deep)]">{card.product}</p>
                <p className="mt-2 text-2xl font-semibold text-[var(--adm-navy-deep)]">{brl(stats.revenue)}</p>
                <p className="mt-0.5 text-[11px] text-[var(--adm-text-muted)]">
                  {stats.count} venda{stats.count !== 1 ? "s" : ""} · {card.price}
                </p>
              </GlassCard>
            );
          })}
        </div>
      </div>

      <GlassCard className="p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-[15px] font-semibold text-[var(--adm-navy-deep)]">Receita por produto</h2>
          <Link to="/admin/webhooks" className="inline-flex items-center gap-1 text-[12px] font-semibold text-[var(--adm-navy-deep)] hover:underline">
            Ver logs <ExternalLink className="h-3 w-3" />
          </Link>
        </div>
        {byProduct.length === 0 ? (
          <p className="mt-4 text-[13px] text-[var(--adm-text-muted)]">Nenhuma venda aprovada no período.</p>
        ) : (
          <ul className="mt-4 divide-y divide-slate-100">
            {byProduct.map(([pid, row]) => (
              <li key={pid} className="flex items-center justify-between py-2.5">
                <span className="text-[13px] text-[var(--adm-navy-deep)]">{productById[pid]?.name ?? pid}</span>
                <span className="text-[12px] text-[var(--adm-text-muted)]">
                  {row.count} venda{row.count > 1 ? "s" : ""} · <strong className="text-[var(--adm-navy-deep)]">{brl(row.revenue)}</strong>
                </span>
              </li>
            ))}
          </ul>
        )}
      </GlassCard>

      <GlassCard className="p-0">
        <header className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <h2 className="text-[15px] font-semibold text-[var(--adm-navy-deep)]">Vendas recentes</h2>
          <span className="text-[11px] text-[var(--adm-text-muted)]">{ents.length} registros</span>
        </header>
        {isLoading ? (
          <p className="px-5 py-10 text-center text-[13px] text-[var(--adm-text-muted)]">Carregando…</p>
        ) : ents.length === 0 ? (
          <p className="px-5 py-10 text-center text-[13px] text-[var(--adm-text-muted)]">Nenhuma venda registrada nesse período.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {ents.map((e) => {
              const product = productById[e.product_id];
              const price = product?.price_cents ?? 0;
              const isActive = e.status === "active";
              return (
                <li key={e.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold text-[var(--adm-navy-deep)]">
                      {product?.name ?? "—"} <span className="text-[var(--adm-text-muted)]">· {e.buyer_email ?? "sem e-mail"}</span>
                    </p>
                    <p className="mt-0.5 text-[11px] text-[var(--adm-text-muted)]">
                      {new Date(e.granted_at).toLocaleString("pt-BR")} · {e.source}
                      {e.kirvano_transaction_id ? ` · ${e.kirvano_transaction_id}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                      isActive ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
                    }`}>
                      {e.status}
                    </span>
                    <span className="font-mono text-[12px] text-[var(--adm-navy-deep)]">{brl(price)}</span>
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

function Kpi({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone: "emerald" | "navy" | "rose" | "amber" }) {
  const tones: Record<string, string> = {
    emerald: "bg-emerald-50 text-emerald-700",
    navy: "bg-slate-100 text-[var(--adm-navy-deep)]",
    rose: "bg-rose-50 text-rose-700",
    amber: "bg-amber-50 text-amber-700",
  };
  return (
    <GlassCard className="p-4">
      <div className="flex items-center gap-2">
        <span className={`inline-flex h-7 w-7 items-center justify-center rounded-md ${tones[tone]}`}>{icon}</span>
        <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--adm-text-muted)]">{label}</span>
      </div>
      <p className="mt-2 text-2xl font-semibold text-[var(--adm-navy-deep)]">{value}</p>
    </GlassCard>
  );
}