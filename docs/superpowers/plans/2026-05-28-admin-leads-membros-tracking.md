# Admin Leads, Membros & Tracking — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement 3 admin dashboard screens — Leads (analítico), Membros (operacional com drawer), Tracking (analítico+operacional) — replacing existing StubPage placeholders.

**Architecture:** Each screen is a single route file under `src/routes/admin.*.tsx`. Shared utilities (archetype colors, CSV export, period filter) are extracted to `src/lib/admin/constants.ts` and `src/lib/admin/csv.ts`. Charts use Recharts. All data fetched via Supabase PostgREST + TanStack Query. Follows existing patterns from `admin.vendas.tsx` and `admin.clientes.tsx`.

**Tech Stack:** React 18, TanStack Router, TanStack Query, Supabase, Tailwind CSS, Framer Motion, Recharts (new dep), Lucide Icons

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `src/lib/admin/constants.ts` | Archetype color map, period filter config, situation/desire label maps |
| Create | `src/lib/admin/csv.ts` | Generic CSV export utility |
| Modify | `src/routes/admin.leads.tsx` | Full Leads analytics page |
| Modify | `src/routes/admin.membros.tsx` | Full Membros operational page with drawer |
| Modify | `src/routes/admin.tracking.tsx` | Full Tracking analytics+operational page |

---

### Task 1: Install Recharts + Create shared constants

**Files:**
- Create: `src/lib/admin/constants.ts`
- Create: `src/lib/admin/csv.ts`

- [ ] **Step 1: Install recharts**

```bash
cd /Users/guilhermehenrique/rotina-de-paz-app && npm install recharts
```

Expected: `added X packages` — no errors.

- [ ] **Step 2: Create `src/lib/admin/constants.ts`**

```typescript
export const ARCHETYPE_COLORS: Record<string, string> = {
  vigilante: "#3B82F6",
  sobrecarga: "#F59E0B",
  culposa: "#8B5CF6",
  antecipatoria: "#EC4899",
};

export const ARCHETYPE_LABELS: Record<string, string> = {
  vigilante: "Vigilante",
  sobrecarga: "Sobrecarga",
  culposa: "Culposa",
  antecipatoria: "Antecipatória",
};

export const SITUATION_LABELS: Record<string, string> = {
  "casada-filhos-pequenos": "Casada, filhos pequenos",
  "casada-filhos-grandes": "Casada, filhos grandes",
  "casada-sem-filhos": "Casada, sem filhos",
  "mae-solo": "Mãe solo",
  solteira: "Solteira",
};

export const DESIRE_LABELS: Record<string, string> = {
  dormir: "Dormir em paz",
  descansar: "Descansar de verdade",
  orar: "Orar sem culpa",
  "parar-pior": "Parar de imaginar o pior",
};

export const PERIODS = [
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
  { label: "Tudo", days: 3650 },
] as const;

export type Period = (typeof PERIODS)[number];

export function sinceISO(period: Period): string {
  return new Date(Date.now() - period.days * 86400_000).toISOString();
}
```

- [ ] **Step 3: Create `src/lib/admin/csv.ts`**

```typescript
export function downloadCsv(
  rows: Record<string, string | number | boolean | null | undefined>[],
  filename: string,
) {
  if (rows.length === 0) return;
  const keys = Object.keys(rows[0]);
  const header = keys.join(",");
  const body = rows
    .map((r) =>
      keys
        .map((k) => {
          const v = r[k];
          if (v == null) return "";
          const s = String(v);
          return s.includes(",") || s.includes('"') || s.includes("\n")
            ? `"${s.replace(/"/g, '""')}"`
            : s;
        })
        .join(","),
    )
    .join("\n");
  const blob = new Blob([`\uFEFF${header}\n${body}`], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
```

- [ ] **Step 4: Verify build compiles**

```bash
cd /Users/guilhermehenrique/rotina-de-paz-app && npx tsc --noEmit 2>&1 | tail -5
```

Expected: no errors related to new files.

- [ ] **Step 5: Commit**

```bash
cd /Users/guilhermehenrique/rotina-de-paz-app
git add src/lib/admin/constants.ts src/lib/admin/csv.ts package.json package-lock.json
git commit -m "feat(admin): add shared constants (archetype colors, periods) and CSV export utility"
```

---

### Task 2: Implement Admin Leads page

**Files:**
- Modify: `src/routes/admin.leads.tsx`

- [ ] **Step 1: Replace `admin.leads.tsx` with full implementation**

Replace the entire file content with:

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Users,
  CalendarCheck,
  AlertTriangle,
  Mail,
  Download,
  Search,
} from "lucide-react";
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

export const Route = createFileRoute("/admin/leads")({
  component: AdminLeadsPage,
});

type Lead = {
  id: string;
  name: string | null;
  email: string | null;
  archetype: string | null;
  desire: string | null;
  situation: string | null;
  risk_flag: boolean;
  utm_source: string | null;
  utm_campaign: string | null;
  created_at: string;
};

function AdminLeadsPage() {
  const [period, setPeriod] = useState<Period>(PERIODS[1]);
  const [search, setSearch] = useState("");

  const since = useMemo(() => sinceISO(period), [period]);

  const { data: leads = [], isLoading } = useQuery({
    queryKey: ["adm-leads", period.label],
    queryFn: async (): Promise<Lead[]> => {
      const { data, error } = await supabase
        .from("leads")
        .select(
          "id, name, email, archetype, desire, situation, risk_flag, utm_source, utm_campaign, created_at",
        )
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw new Error(error.message);
      return (data ?? []) as Lead[];
    },
  });

  const todayStart = useMemo(
    () => new Date(new Date().setHours(0, 0, 0, 0)).toISOString(),
    [],
  );

  const kpis = useMemo(() => {
    let today = 0;
    let risk = 0;
    let withEmail = 0;
    for (const l of leads) {
      if (l.created_at >= todayStart) today++;
      if (l.risk_flag) risk++;
      if (l.email) withEmail++;
    }
    return { total: leads.length, today, risk, withEmail };
  }, [leads, todayStart]);

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
    const byDay: Record<
      string,
      Record<string, number>
    > = {};
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
          <h1 className="mt-1 text-2xl font-semibold text-white">
            Leads do Quiz
          </h1>
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
          label="Com email"
          value={kpis.withEmail}
          icon={<Mail className="h-4 w-4" />}
          accent="amber"
          loading={isLoading}
        />
      </div>

      {/* Charts */}
      <div className="grid gap-4 lg:grid-cols-2">
        <GlassCard className="p-5">
          <h2 className="mb-4 text-[15px] font-semibold text-white">
            Distribuição por Arquétipo
          </h2>
          {donutData.length === 0 ? (
            <p className="py-10 text-center text-[13px] text-white/40">
              Sem dados no período.
            </p>
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
          <h2 className="mb-4 text-[15px] font-semibold text-white">
            Leads por Dia
          </h2>
          {barData.length === 0 ? (
            <p className="py-10 text-center text-[13px] text-white/40">
              Sem dados no período.
            </p>
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
          <h2 className="text-[15px] font-semibold text-white">
            Todos os leads
          </h2>
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
          <p className="px-5 py-10 text-center text-[13px] text-white/40">
            Carregando…
          </p>
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
```

- [ ] **Step 2: Verify build compiles**

```bash
cd /Users/guilhermehenrique/rotina-de-paz-app && npx tsc --noEmit 2>&1 | tail -10
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/guilhermehenrique/rotina-de-paz-app
git add src/routes/admin.leads.tsx
git commit -m "feat(admin): implement Leads analytics page with KPIs, donut chart, bar chart, table and CSV export"
```

---

### Task 3: Implement Admin Membros page

**Files:**
- Modify: `src/routes/admin.membros.tsx`

- [ ] **Step 1: Replace `admin.membros.tsx` with full implementation**

Replace the entire file content with:

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Users,
  ShieldCheck,
  UserX,
  Search,
  Mail,
  Calendar,
  Package,
  Plus,
  KeyRound,
  AlertCircle,
  X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { GlassCard } from "@/components/admin/GlassCard";
import { KpiCard } from "@/components/admin/KpiCard";
import { ARCHETYPE_COLORS, ARCHETYPE_LABELS } from "@/lib/admin/constants";
import { logAdminAction } from "@/lib/admin/audit";

export const Route = createFileRoute("/admin/membros")({
  component: AdminMembrosPage,
});

type Profile = {
  user_id: string;
  email: string | null;
  name: string | null;
  archetype: string | null;
  desire: string | null;
  situation: string | null;
  created_at: string;
};

type Entitlement = {
  id: string;
  user_id: string;
  product_id: string;
  source: string;
  status: string;
  buyer_email: string | null;
  granted_at: string;
  revoked_at: string | null;
};

type Product = { id: string; name: string; slug: string };

function AdminMembrosPage() {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Profile | null>(null);

  const { data: profiles = [], isLoading } = useQuery({
    queryKey: ["adm-membros-profiles"],
    queryFn: async (): Promise<Profile[]> => {
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, email, name, archetype, desire, situation, created_at")
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as Profile[];
    },
  });

  const { data: entitlements = [] } = useQuery({
    queryKey: ["adm-membros-entitlements"],
    queryFn: async (): Promise<Entitlement[]> => {
      const { data, error } = await supabase
        .from("entitlements")
        .select(
          "id, user_id, product_id, source, status, buyer_email, granted_at, revoked_at",
        )
        .order("granted_at", { ascending: false })
        .limit(2000);
      if (error) throw new Error(error.message);
      return (data ?? []) as Entitlement[];
    },
  });

  const { data: products = [] } = useQuery({
    queryKey: ["adm-products-mini"],
    queryFn: async (): Promise<Product[]> => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, slug")
        .order("name");
      if (error) throw new Error(error.message);
      return (data ?? []) as Product[];
    },
  });

  const productById = useMemo(() => {
    const m: Record<string, Product> = {};
    for (const p of products) m[p.id] = p;
    return m;
  }, [products]);

  const entitlementsByUser = useMemo(() => {
    const m: Record<string, Entitlement[]> = {};
    for (const e of entitlements) {
      if (!m[e.user_id]) m[e.user_id] = [];
      m[e.user_id].push(e);
    }
    return m;
  }, [entitlements]);

  const kpis = useMemo(() => {
    const total = profiles.length;
    const withAccess = profiles.filter((p) => {
      const ents = entitlementsByUser[p.user_id] ?? [];
      return ents.some((e) => e.status === "active");
    }).length;
    return { total, withAccess, noAccess: total - withAccess };
  }, [profiles, entitlementsByUser]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return profiles;
    return profiles.filter(
      (p) =>
        (p.name ?? "").toLowerCase().includes(q) ||
        (p.email ?? "").toLowerCase().includes(q),
    );
  }, [profiles, search]);

  return (
    <div className="adm-fade-up space-y-6">
      {/* Header */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/55">
            Fase 5
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-white">Membros</h1>
          <p className="mt-1 text-[13px] text-white/55">
            Compradores ativos, entitlements e ações.
          </p>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome ou email…"
            className="adm-input w-72 pl-9 text-sm"
          />
        </div>
      </header>

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-3">
        <KpiCard
          label="Total membros"
          value={kpis.total}
          icon={<Users className="h-4 w-4" />}
          accent="blue"
          loading={isLoading}
        />
        <KpiCard
          label="Com acesso ativo"
          value={kpis.withAccess}
          icon={<ShieldCheck className="h-4 w-4" />}
          accent="green"
          loading={isLoading}
        />
        <KpiCard
          label="Sem acesso"
          value={kpis.noAccess}
          icon={<UserX className="h-4 w-4" />}
          accent="amber"
          loading={isLoading}
        />
      </div>

      {/* Table */}
      <GlassCard className="overflow-hidden p-0">
        <header className="flex items-center justify-between border-b border-white/5 px-5 py-3">
          <h2 className="text-[15px] font-semibold text-white">
            Todos os membros
          </h2>
          <span className="text-[11px] text-white/40">
            {filtered.length} de {profiles.length}
          </span>
        </header>
        {isLoading ? (
          <p className="px-5 py-10 text-center text-[13px] text-white/40">
            Carregando…
          </p>
        ) : filtered.length === 0 ? (
          <p className="px-5 py-10 text-center text-[13px] text-white/40">
            {search
              ? "Nenhum membro encontrado."
              : "Nenhum membro cadastrado."}
          </p>
        ) : (
          <div className="max-h-[520px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-[#1A1B1F]/95 text-left text-[11px] uppercase tracking-wider text-white/40">
                <tr>
                  <th className="px-4 py-3">Membro</th>
                  <th className="px-4 py-3">Arquétipo</th>
                  <th className="px-4 py-3">Acesso</th>
                  <th className="px-4 py-3">Cadastro</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filtered.map((p) => {
                  const ents = entitlementsByUser[p.user_id] ?? [];
                  const active = ents.filter((e) => e.status === "active");
                  return (
                    <tr
                      key={p.user_id}
                      onClick={() => setSelected(p)}
                      className="cursor-pointer text-white/80 transition hover:bg-white/[0.04]"
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium text-white">
                          {p.name ?? "—"}
                        </div>
                        <div className="text-xs text-white/50">
                          {p.email ?? "—"}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {p.archetype ? (
                          <span
                            className="rounded-md px-2 py-0.5 text-[11px] font-medium"
                            style={{
                              backgroundColor: `${ARCHETYPE_COLORS[p.archetype]}20`,
                              color: ARCHETYPE_COLORS[p.archetype],
                            }}
                          >
                            {ARCHETYPE_LABELS[p.archetype] ?? p.archetype}
                          </span>
                        ) : (
                          <span className="text-[11px] text-white/30">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {active.length > 0 ? (
                          <span className="rounded-md bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-300">
                            {active.length} ativo{active.length > 1 ? "s" : ""}
                          </span>
                        ) : (
                          <span className="text-[11px] text-white/30">
                            Nenhum
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-[12px] text-white/50">
                        {new Date(p.created_at).toLocaleDateString("pt-BR")}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </GlassCard>

      {/* Drawer */}
      {selected && (
        <MembroDrawer
          profile={selected}
          entitlements={entitlementsByUser[selected.user_id] ?? []}
          productById={productById}
          products={products}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

/* ── Drawer ─────────────────────────────────────────── */

function MembroDrawer({
  profile,
  entitlements,
  productById,
  products,
  onClose,
}: {
  profile: Profile;
  entitlements: Entitlement[];
  productById: Record<string, Product>;
  products: Product[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [productId, setProductId] = useState(products[0]?.id ?? "");
  const [err, setErr] = useState<string | null>(null);
  const [grantOpen, setGrantOpen] = useState(false);

  const grant = useMutation({
    mutationFn: async () => {
      if (!profile.email) throw new Error("Membro sem email cadastrado.");
      if (!productId) throw new Error("Selecione um produto.");
      const { data, error } = await supabase.rpc("grant_entitlement_manual", {
        _email: profile.email,
        _product_id: productId,
      });
      if (error) {
        if (error.message.includes("user_not_found"))
          throw new Error("Membro não encontrado.");
        throw new Error(error.message);
      }
      await logAdminAction("entitlement.grant", {
        resourceType: "entitlement",
        resourceId: data as string,
        metadata: {
          email: profile.email,
          productId,
          from: "membros-drawer",
        },
      });
    },
    onSuccess: () => {
      setGrantOpen(false);
      setErr(null);
      qc.invalidateQueries({ queryKey: ["adm-membros-entitlements"] });
    },
    onError: (e: Error) => setErr(e.message),
  });

  const revoke = useMutation({
    mutationFn: async (entId: string) => {
      const { error } = await supabase
        .from("entitlements")
        .update({ status: "revoked", revoked_at: new Date().toISOString() })
        .eq("id", entId);
      if (error) throw new Error(error.message);
      await logAdminAction("entitlement.revoke", {
        resourceType: "entitlement",
        resourceId: entId,
        metadata: { email: profile.email, from: "membros-drawer" },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["adm-membros-entitlements"] });
    },
  });

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="adm-glass-dark relative h-full w-full max-w-lg overflow-y-auto p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-lg p-1.5 text-white/50 hover:bg-white/5 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Info */}
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-white">
            {profile.name ?? "Sem nome"}
          </h2>
          <div className="mt-1.5 flex items-center gap-3 text-xs text-white/60">
            <span className="inline-flex items-center gap-1.5">
              <Mail className="h-3.5 w-3.5" /> {profile.email ?? "—"}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5" />{" "}
              {new Date(profile.created_at).toLocaleDateString("pt-BR")}
            </span>
          </div>
          {profile.archetype && (
            <span
              className="mt-3 inline-block rounded-md px-2 py-0.5 text-xs font-medium"
              style={{
                backgroundColor: `${ARCHETYPE_COLORS[profile.archetype]}20`,
                color: ARCHETYPE_COLORS[profile.archetype],
              }}
            >
              {ARCHETYPE_LABELS[profile.archetype] ?? profile.archetype}
            </span>
          )}
        </div>

        {/* Entitlements */}
        <section className="mb-6">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">Acessos</h3>
            <button
              onClick={() => setGrantOpen((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-[#3B5BFD] to-[#7C3AED] px-3 py-1.5 text-xs font-medium text-white"
            >
              <Plus className="h-3.5 w-3.5" /> Conceder
            </button>
          </div>

          {grantOpen && (
            <div className="mb-4 space-y-3 rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <label className="block text-xs">
                <span className="mb-1 flex items-center gap-1.5 text-white/60">
                  <Package className="h-3.5 w-3.5" /> Produto
                </span>
                <select
                  value={productId}
                  onChange={(e) => setProductId(e.target.value)}
                  className="adm-input w-full"
                >
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              {err && (
                <div className="flex items-center gap-2 rounded-lg bg-rose-500/10 p-2.5 text-xs text-rose-200">
                  <AlertCircle className="h-4 w-4" /> {err}
                </div>
              )}
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => {
                    setGrantOpen(false);
                    setErr(null);
                  }}
                  className="rounded-lg px-3 py-1.5 text-xs text-white/70 hover:bg-white/5"
                >
                  Cancelar
                </button>
                <button
                  disabled={grant.isPending}
                  onClick={() => grant.mutate()}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-[#3B5BFD] to-[#7C3AED] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
                >
                  <KeyRound className="h-3.5 w-3.5" />{" "}
                  {grant.isPending ? "Concedendo…" : "Confirmar"}
                </button>
              </div>
            </div>
          )}

          {entitlements.length === 0 ? (
            <p className="rounded-xl border border-white/5 bg-white/[0.02] p-4 text-center text-xs text-white/40">
              Nenhum acesso registrado.
            </p>
          ) : (
            <ul className="space-y-2">
              {entitlements.map((e) => {
                const prod = productById[e.product_id];
                const isActive = e.status === "active";
                return (
                  <li
                    key={e.id}
                    className="flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.02] p-3"
                  >
                    <div>
                      <p className="text-sm font-medium text-white">
                        {prod?.name ?? "Produto removido"}
                      </p>
                      <p className="mt-0.5 text-[11px] text-white/40">
                        {e.source} ·{" "}
                        {new Date(e.granted_at).toLocaleDateString("pt-BR")}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={
                          isActive
                            ? "rounded-md bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-300"
                            : "rounded-md bg-white/5 px-2 py-0.5 text-[11px] text-white/50"
                        }
                      >
                        {e.status}
                      </span>
                      {isActive && (
                        <button
                          onClick={() => revoke.mutate(e.id)}
                          disabled={revoke.isPending}
                          className="rounded-md px-2 py-0.5 text-[11px] text-rose-400 hover:bg-rose-500/10 disabled:opacity-40"
                        >
                          Revogar
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify build compiles**

```bash
cd /Users/guilhermehenrique/rotina-de-paz-app && npx tsc --noEmit 2>&1 | tail -10
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/guilhermehenrique/rotina-de-paz-app
git add src/routes/admin.membros.tsx
git commit -m "feat(admin): implement Membros page with KPIs, member table, drawer with grant/revoke"
```

---

### Task 4: Implement Admin Tracking page

**Files:**
- Modify: `src/routes/admin.tracking.tsx`

- [ ] **Step 1: Replace `admin.tracking.tsx` with full implementation**

Replace the entire file content with:

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
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

type EntitlementMini = {
  buyer_email: string | null;
};

function AdminTrackingPage() {
  const [period, setPeriod] = useState<Period>(PERIODS[1]);
  const [search, setSearch] = useState("");

  const since = useMemo(() => sinceISO(period), [period]);

  const { data: leads = [], isLoading } = useQuery({
    queryKey: ["adm-tracking-leads", period.label],
    queryFn: async (): Promise<Lead[]> => {
      const { data, error } = await supabase
        .from("leads")
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

  const { data: buyerEmails = [] } = useQuery({
    queryKey: ["adm-tracking-buyers"],
    queryFn: async (): Promise<EntitlementMini[]> => {
      const { data, error } = await supabase
        .from("entitlements")
        .select("buyer_email")
        .eq("status", "active");
      if (error) throw new Error(error.message);
      return (data ?? []) as EntitlementMini[];
    },
  });

  const buyerSet = useMemo(() => {
    const s = new Set<string>();
    for (const e of buyerEmails) {
      if (e.buyer_email) s.add(e.buyer_email.toLowerCase());
    }
    return s;
  }, [buyerEmails]);

  function didConvert(lead: Lead): boolean {
    return !!lead.email && buyerSet.has(lead.email.toLowerCase());
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
  }, [leads, buyerSet]);

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
```

- [ ] **Step 2: Verify build compiles**

```bash
cd /Users/guilhermehenrique/rotina-de-paz-app && npx tsc --noEmit 2>&1 | tail -10
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/guilhermehenrique/rotina-de-paz-app
git add src/routes/admin.tracking.tsx
git commit -m "feat(admin): implement Tracking page with UTM KPIs, source/campaign charts, table and CSV export"
```

---

### Task 5: Final build verification

- [ ] **Step 1: Run full build**

```bash
cd /Users/guilhermehenrique/rotina-de-paz-app && npm run build 2>&1 | tail -20
```

Expected: successful build with no errors.

- [ ] **Step 2: Verify route tree was auto-generated correctly**

```bash
cd /Users/guilhermehenrique/rotina-de-paz-app && grep -c "admin" src/routeTree.gen.ts
```

Expected: existing routes still present, no missing imports.
