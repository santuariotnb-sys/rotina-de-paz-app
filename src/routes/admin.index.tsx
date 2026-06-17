import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Users, Gem, Activity, Sparkles, DollarSign, Download, TrendingUp } from "lucide-react";
import { KpiCard } from "@/components/admin/KpiCard";
import { GlassCard } from "@/components/admin/GlassCard";
import { downloadCsv } from "@/lib/admin/csv";
import { getOverviewKpis } from "@/lib/admin/overview.functions";

export const Route = createFileRoute("/admin/")({
  component: AdminOverview,
});

const ARCH_LABELS: Record<string, { name: string; color: string }> = {
  vigilante: { name: "Vigilante", color: "#3B5BFD" },
  sobrecarga: { name: "Sobrecarga", color: "#7C3AED" },
  culposa: { name: "Culposa", color: "#EC4899" },
  antecipatoria: { name: "Antecipatória", color: "#F59E0B" },
  indefinido: { name: "Indefinido", color: "#94A3B8" },
};

function AdminOverview() {
  const fetchKpis = useServerFn(getOverviewKpis);
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "overview"],
    queryFn: () => fetchKpis(),
  });

  const brl = (cents: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
      cents ?? 0,
    );

  const breakdown = data?.archetypeBreakdown ?? {};
  const totalArch = Object.values(breakdown).reduce((a, b) => a + b, 0) || 1;

  return (
    <div className="adm-fade-up space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p
            className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[#8B7355]"
            style={{ fontFamily: '"Cormorant Garamond", serif' }}
          >
            Primordia · Visão Geral
          </p>
          <h1
            className="mt-1 text-3xl font-semibold text-[#1A1D26]"
            style={{ fontFamily: '"Cormorant Garamond", serif', letterSpacing: "0.01em" }}
          >
            Painel de comando
          </h1>
          <p className="mt-2 text-[13px] text-[#4B5060]">
            Operação completa da Primordia — conteúdo, vendas e inteligência sobre leads.
          </p>
        </div>
        <button
          onClick={() => {
            const rows = Object.entries(breakdown).map(([key, count]) => ({
              arquetipo: ARCH_LABELS[key]?.name ?? key,
              quantidade: count,
              percentual: `${((count / totalArch) * 100).toFixed(1)}%`,
            }));
            downloadCsv(rows, `overview-arquetipos-${new Date().toISOString().slice(0, 10)}.csv`);
          }}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-medium text-[#6B7280] hover:bg-slate-50"
        >
          <Download className="h-3.5 w-3.5" /> CSV
        </button>
      </header>

      <section className="grid gap-4 sm:grid-cols-2">
        <KpiCard
          label="Vendas de hoje"
          value={brl(data?.revenueToday ?? 0)}
          loading={isLoading}
          icon={<DollarSign className="h-5 w-5" />}
          accent="amber"
          hint={`${data?.purchasesToday ?? 0} vendas confirmadas hoje`}
        />
        <KpiCard
          label="Vendas totais"
          value={brl(data?.totalRevenue ?? 0)}
          loading={isLoading}
          icon={<TrendingUp className="h-5 w-5" />}
          accent="green"
          hint={`${data?.totalPurchases ?? 0} vendas confirmadas total`}
        />
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Leads do quiz"
          value={data?.totalLeads ?? 0}
          loading={isLoading}
          icon={<Users className="h-5 w-5" />}
          accent="blue"
          hint="Leads únicos capturados no quiz"
        />
        <KpiCard
          label="Membros"
          value={data?.totalMembers ?? 0}
          loading={isLoading}
          icon={<Gem className="h-5 w-5" />}
          accent="green"
          hint="Contas criadas no app"
        />
        <KpiCard
          label="Leads hoje"
          value={data?.leadsToday ?? 0}
          loading={isLoading}
          icon={<Activity className="h-5 w-5" />}
          accent="amber"
          hint="Leads novos desde 00:00"
        />
        <KpiCard
          label="Arquétipos detectados"
          value={Object.keys(breakdown).length}
          loading={isLoading}
          icon={<Sparkles className="h-5 w-5" />}
          accent="rose"
          hint="Distribuição abaixo"
        />
      </section>

      <section className="grid gap-5 lg:grid-cols-3">
        <GlassCard className="lg:col-span-2">
          <h2
            className="text-[16px] font-semibold text-[#1A1D26]"
            style={{ fontFamily: '"Cormorant Garamond", serif' }}
          >
            Distribuição de arquétipos
          </h2>
          <p className="mt-0.5 text-[12px] text-[#6B7280]">
            Como as respondentes do quiz se distribuem.
          </p>
          <div className="mt-5 space-y-3">
            {Object.entries(breakdown).length === 0 && (
              <p className="text-[13px] text-[#6B7280]">Sem respostas registradas ainda.</p>
            )}
            {Object.entries(breakdown)
              .sort(([, a], [, b]) => b - a)
              .map(([key, count]) => {
                const info = ARCH_LABELS[key] ?? { name: key, color: "#94A3B8" };
                const pct = (count / totalArch) * 100;
                return (
                  <div key={key}>
                    <div className="flex items-center justify-between text-[12px]">
                      <span className="font-medium text-[#1A1D26]">{info.name}</span>
                      <span className="tabular-nums text-[#6B7280]">
                        {count} · {pct.toFixed(1)}%
                      </span>
                    </div>
                    <div className="mt-1 h-2 overflow-hidden rounded-full bg-white/55">
                      <div
                        className="h-full rounded-full transition-[width] duration-700"
                        style={{ width: `${pct}%`, background: info.color }}
                      />
                    </div>
                  </div>
                );
              })}
          </div>
        </GlassCard>

        <GlassCard>
          <h2
            className="text-[16px] font-semibold text-[#1A1D26]"
            style={{ fontFamily: '"Cormorant Garamond", serif' }}
          >
            Próximos passos
          </h2>
          <ul className="mt-4 space-y-3 text-[13px] text-[#2A2F3A]">
            <li className="flex gap-2">
              <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[#6B8E6F]" />
              <span>
                <strong>Fase 1 concluída.</strong> Autenticação admin, layout e visão geral
                operacionais.
              </span>
            </li>
            <li className="flex gap-2">
              <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[#8B7355]" />
              <span>
                <strong>Fase 2.</strong> Módulo Produtos &amp; Kirvano — wizard, webhook HMAC,
                liberação automática.
              </span>
            </li>
            <li className="flex gap-2">
              <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[#D8B4A0]" />
              <span>
                <strong>Fases 3–6.</strong> Conteúdo, leads, membros, vendas, tracking e
                configurações.
              </span>
            </li>
          </ul>
        </GlassCard>
      </section>
    </div>
  );
}
