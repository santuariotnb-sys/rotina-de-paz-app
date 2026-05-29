# Design — Admin: Leads, Membros & Tracking

## Contexto

3 telas placeholder no admin dashboard do Rotina de Paz App precisam ser implementadas.
Stack: React 18 + TanStack Router + TanStack Query + Supabase + Tailwind + Framer Motion + Recharts (novo).
Padrões visuais: seguir `admin.vendas.tsx` e `admin.clientes.tsx` (GlassCard, KpiCard, drawers, filtros).

---

## 1. Admin Leads (Analítico)

**Rota:** `/admin/leads`
**Arquivo:** `src/routes/admin.leads.tsx`

### Layout

```
[Header: "Leads do Quiz" + PeriodFilter(7d/30d/90d/Tudo) + BotaoExportCSV]

[KpiCard: Total] [KpiCard: Hoje] [KpiCard: Risco] [KpiCard: Com Email]

[GlassCard: Donut Arquétipos]  [GlassCard: Barras leads/dia por arquétipo]

[GlassCard: Tabela de leads + busca por nome]
```

### KPIs

| Card | Query | Accent |
|------|-------|--------|
| Total de Leads | `count(leads)` no período | blue |
| Leads Hoje | `count(leads) WHERE created_at >= today` | green |
| Com Risco | `count(leads) WHERE risk_flag = true` no período | rose |
| Com Email | `count(leads) WHERE email IS NOT NULL` no período | amber |

### Gráficos

- **Donut** (Recharts `PieChart`): distribuição % por arquétipo no período. Cores fixas por arquétipo:
  - Vigilante: `#3B82F6` (blue)
  - Sobrecarga: `#F59E0B` (amber)
  - Culposa: `#8B5CF6` (purple)
  - Antecipatória: `#EC4899` (pink)
  - null/sem arquétipo: `#6B7280` (gray)

- **Barras empilhadas** (Recharts `BarChart`): leads por dia, cada segmento = arquétipo. Eixo X = data, Eixo Y = count. Mesmas cores.

### Tabela

| Coluna | Campo | Notas |
|--------|-------|-------|
| Nome | `name` | fallback "Anônimo" |
| Arquétipo | `archetype` | badge colorido |
| Situação | `situation` | texto traduzido |
| Desejo | `desire` | texto traduzido |
| Risco | `risk_flag` | badge vermelho se true |
| Data | `created_at` | formato dd/MM HH:mm |

- Busca local por `name` (case-insensitive)
- Ordenação: `created_at DESC`
- Sem drawer, sem click na linha

### Exportar CSV

- Botão no header exporta todos os leads do período filtrado
- Colunas: nome, email, arquétipo, situação, desejo, risco, utm_source, utm_campaign, data
- Nome do arquivo: `leads-{periodo}-{data}.csv`

### Query Principal

```typescript
supabase
  .from("leads")
  .select("id, name, email, archetype, scores, desire, situation, risk_flag, utm_source, utm_medium, utm_campaign, created_at")
  .gte("created_at", sinceISO) // baseado no filtro
  .order("created_at", { ascending: false })
  .limit(1000)
```

---

## 2. Admin Membros (Operacional)

**Rota:** `/admin/membros`
**Arquivo:** `src/routes/admin.membros.tsx`

### Layout

```
[Header: "Membros" + InputBusca]

[KpiCard: Total] [KpiCard: Com Acesso] [KpiCard: Sem Acesso]

[GlassCard: Tabela de membros + click → Drawer]

[Drawer lateral: detalhes + entitlements + ações]
```

### KPIs

| Card | Query | Accent |
|------|-------|--------|
| Total Membros | `count(profiles)` | blue |
| Com Acesso Ativo | `count(DISTINCT user_id) FROM entitlements WHERE status='active'` | green |
| Sem Acesso | Total - Com Acesso | amber |

### Tabela

| Coluna | Campo | Notas |
|--------|-------|-------|
| Nome | `profiles.name` | fallback email |
| Email | `profiles.email` | |
| Arquétipo | `profiles.archetype` | badge colorido |
| Acesso | derivado de entitlements | badge "Ativo" (green) ou "Nenhum" (gray) |
| Cadastro | `profiles.created_at` | formato dd/MM/yyyy |

- Busca local por nome e email
- Click na linha abre drawer
- Ordenação: `created_at DESC`

### Drawer

```
[Info: nome, email, arquétipo, situação, desejo]

[Seção: Acessos]
  Tabela: Produto | Status (badge) | Source | Data
  Ações por linha: Revogar (se active)

[Seção: Conceder Acesso]
  Select produto + botão "Conceder"
  Usa RPC grant_entitlement_manual (mesmo padrão de admin.clientes)
```

### Queries

```typescript
// Membros
supabase.from("profiles").select("user_id, email, name, archetype, desire, situation, created_at").order("created_at", { ascending: false })

// Entitlements (todos, para join local)
supabase.from("entitlements").select("id, user_id, product_id, source, status, buyer_email, granted_at, revoked_at, kirvano_transaction_id").limit(2000)

// Produtos (para nomes)
supabase.from("products").select("id, name, slug")
```

---

## 3. Admin Tracking (Analítico + Operacional)

**Rota:** `/admin/tracking`
**Arquivo:** `src/routes/admin.tracking.tsx`

### Layout

```
[Header: "Tracking" + PeriodFilter(7d/30d/90d/Tudo) + BotaoExportCSV]

[KpiCard: Com UTM] [KpiCard: Facebook] [KpiCard: Google] [KpiCard: Conversão]

[GlassCard: Barras utm_source]  [GlassCard: Barras utm_campaign]

[GlassCard: Tabela de leads com UTMs + busca]
```

### KPIs

| Card | Query | Accent |
|------|-------|--------|
| Leads com UTM | `count(leads) WHERE utm_source IS NOT NULL` no período | blue |
| Facebook | `count(leads) WHERE utm_source ILIKE '%facebook%' OR utm_source ILIKE '%fb%' OR fbclid IS NOT NULL` | green |
| Google | `count(leads) WHERE utm_source ILIKE '%google%' OR gclid IS NOT NULL` | amber |
| Taxa de Conversão | leads com entitlement / total leads no período (%) | rose |

### Gráficos

- **Barras horizontais** (Recharts `BarChart` layout=vertical): top 10 `utm_source` por volume no período
- **Barras horizontais**: top 10 `utm_campaign` por volume no período

### Tabela

| Coluna | Campo | Notas |
|--------|-------|-------|
| Nome | `name` | fallback "Anônimo" |
| UTM Source | `utm_source` | fallback "—" |
| UTM Campaign | `utm_campaign` | fallback "—" |
| UTM Medium | `utm_medium` | fallback "—" |
| Arquétipo | `archetype` | badge colorido |
| Converteu | join com entitlements | badge "Sim" (green) / "Não" (gray) |
| Data | `created_at` | formato dd/MM HH:mm |

- Busca local por nome, utm_source, utm_campaign
- Ordenação: `created_at DESC`

### Exportar CSV

- Mesma lógica de Leads
- Colunas: nome, email, utm_source, utm_medium, utm_campaign, utm_content, utm_term, arquétipo, converteu, data
- Nome do arquivo: `tracking-{periodo}-{data}.csv`

### Queries

```typescript
// Leads com UTMs
supabase
  .from("leads")
  .select("id, name, email, archetype, utm_source, utm_medium, utm_campaign, utm_content, utm_term, created_at")
  .gte("created_at", sinceISO)
  .order("created_at", { ascending: false })
  .limit(1000)

// Entitlements (para calcular conversão)
supabase
  .from("entitlements")
  .select("id, user_id, buyer_email, status")
  .eq("status", "active")
```

Conversão calculada por match de `leads.email` com `entitlements.buyer_email`.

---

## Dependências Novas

- **Recharts** — instalar via `npm install recharts`
- Nenhuma outra dependência nova necessária

## Padrões a Seguir

- Componentes: `GlassCard`, `KpiCard` de `src/components/admin/`
- Queries: `useQuery` do TanStack React Query
- Auditoria: `logAdminAction()` para ações de concessão/revogação em Membros
- Animações: Framer Motion `motion.div` com `adm-fade-up`
- Filtro de período: replicar o padrão de `admin.vendas.tsx` (state local com useMemo)
- Cores de arquétipo: constantes compartilhadas (extrair para `src/lib/admin/constants.ts`)

## Fora do Escopo

- CAPI / Pixel do Facebook (implementação futura)
- Tracking de eventos in-app (page views, clicks)
- Drawer na tela de Leads (foco analítico)
- Gráficos na tela de Membros (foco operacional)
