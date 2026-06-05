# Analytics Platform — Rotina de Paz

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar um sistema de analytics completo que permita identificar lead campeão, nicho vencedor, e dar visibilidade de receita/conversão — acessível pelo admin e pelo Claude Code via RPCs.

**Architecture:** 3 camadas — (1) tabela `purchases` para registrar vendas reais com tipo (principal/bump/upsell/downsell), (2) RPCs SQL no Supabase para consultas analíticas, (3) telas admin para visualização. O webhook Kirvano já existente alimenta as purchases. O Claude Code acessa dados via RPCs do Supabase.

**Tech Stack:** Supabase (PostgreSQL RPCs, migrations), React + TanStack Query + Recharts (admin), Supabase JS Client (RPCs)

---

## Problema Crítico Identificado: Schema Mismatch

O `admin.quiz.tsx` recém-criado espera `quiz_responses` com campos `question_key`, `answer_value`, `answer_text` — mas a tabela no banco do app tem schema antigo (`answers` jsonb, `archetype`, `user_id`). O Quiz-sacra insere com schema normalizado (1 row por pergunta) no **mesmo banco** (`cemjibbauvvyfaxilrvm`), mas em rows que podem não bater com o que o app espera.

**Decisão:** Verificar se o Quiz-sacra já criou a tabela com o schema normalizado (via `001_quiz_schema.sql`). Se sim, o `admin.quiz.tsx` funciona. Se não, aplicar a migration. Este é o **pré-requisito** de toda a plataforma.

---

## File Structure

### Novas (criar)

| Arquivo | Responsabilidade |
|---------|-----------------|
| `supabase/migrations/20260531_purchases_table.sql` | Tabela `purchases` + RLS |
| `supabase/migrations/20260531_analytics_rpcs.sql` | 5 RPCs SQL para analytics |
| `src/routes/admin.analytics.tsx` | Dashboard principal de analytics (lead campeão, nicho vencedor, funil, receita) |
| `src/lib/admin/analytics.ts` | Funções que chamam as RPCs via `supabase.rpc()` |

### Modificar

| Arquivo | O que muda |
|---------|-----------|
| `src/lib/admin/kirvano.server.ts` | Após criar entitlement, inserir em `purchases` com `product_type` |
| `src/components/admin/AdminSidebar.tsx` | Adicionar link `/admin/analytics` |
| `src/routes/admin.quiz.tsx` | Corrigir se schema mismatch confirmado |

---

## Task 1: Verificar e corrigir schema mismatch do quiz_responses

**Files:**
- Verificar: `supabase/migrations/` (todas)
- Possivelmente criar: `supabase/migrations/20260531_fix_quiz_responses.sql`
- Modificar: `src/routes/admin.quiz.tsx` (se necessário)

- [ ] **Step 1: Verificar schema real no banco**

```bash
cd ~/rotina-de-paz-app
# Conectar ao Supabase e ver schema da tabela
npx supabase db dump --schema public --table quiz_responses 2>/dev/null || \
  echo "Verificar manualmente: ir ao Supabase Dashboard > Table Editor > quiz_responses e anotar colunas"
```

Verificar se as colunas `question_key`, `answer_value`, `answer_text`, `lead_id` (uuid FK) existem.

- [ ] **Step 2: Se colunas NÃO existem — o Quiz-sacra pode ter criado via `001_quiz_schema.sql` no mesmo projeto Supabase. Verificar:**

```bash
# O Quiz-sacra aponta pro mesmo Supabase?
grep SUPABASE_URL ~/Quiz-sacra/.env 2>/dev/null
grep SUPABASE_URL ~/rotina-de-paz-app/.env 2>/dev/null
# Se os URLs batem, a migration do Quiz-sacra já rodou e as colunas existem.
```

- [ ] **Step 3: Se as colunas existem no banco, testar o admin.quiz.tsx**

Abrir `https://rotina-de-paz-app.vercel.app/admin/quiz` e verificar se mostra dados. Se sim, Task 1 está completa. Se não, verificar o console do browser para erros.

- [ ] **Step 4: Se as colunas NÃO existem, criar migration**

```sql
-- supabase/migrations/20260531_fix_quiz_responses.sql
-- Adicionar colunas do schema normalizado à tabela existente
ALTER TABLE public.quiz_responses
  ADD COLUMN IF NOT EXISTS question_key text,
  ADD COLUMN IF NOT EXISTS answer_value text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS answer_text text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS time_to_answer integer;

-- Índice para queries por lead
CREATE INDEX IF NOT EXISTS idx_quiz_responses_lead_id
  ON public.quiz_responses (lead_id, created_at DESC);
```

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260531_fix_quiz_responses.sql
git commit -m "fix(db): add normalized quiz_responses columns if missing"
```

---

## Task 2: Criar tabela `purchases`

**Files:**
- Create: `supabase/migrations/20260531_purchases_table.sql`

- [ ] **Step 1: Criar migration**

```sql
-- Tabela de compras confirmadas (uma linha por transação)
CREATE TABLE IF NOT EXISTS public.purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  external_id text,
  transaction_id text UNIQUE,
  product_name text NOT NULL,
  product_type text NOT NULL CHECK (product_type IN ('principal', 'order_bump', 'upsell', 'downsell')),
  gross_value integer NOT NULL, -- centavos
  status text NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'refunded', 'chargeback')),
  kirvano_offer_id text,
  buyer_email text,
  utm_source text,
  utm_campaign text,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins manage purchases" ON public.purchases
  FOR ALL TO authenticated USING (public.is_admin(auth.uid()));

GRANT SELECT ON public.purchases TO authenticated;
GRANT ALL ON public.purchases TO service_role;

CREATE INDEX idx_purchases_lead ON public.purchases (lead_id);
CREATE INDEX idx_purchases_type ON public.purchases (product_type, created_at DESC);
CREATE INDEX idx_purchases_created ON public.purchases (created_at DESC);
CREATE INDEX idx_purchases_email ON public.purchases (lower(buyer_email));
```

- [ ] **Step 2: Aplicar no Supabase remoto**

```bash
# Via Supabase Dashboard > SQL Editor, colar e executar
# OU via psql se tiver acesso direto
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260531_purchases_table.sql
git commit -m "feat(db): add purchases table for granular sales tracking"
```

---

## Task 3: Alimentar `purchases` no webhook Kirvano

**Files:**
- Modify: `src/lib/admin/kirvano.server.ts`

- [ ] **Step 1: Ler o arquivo atual e localizar onde entitlements são criados**

O insert de purchases deve acontecer logo após o upsert de entitlements (linha ~190), dentro do bloco `if (isApproved)`.

- [ ] **Step 2: Adicionar insert em purchases após entitlements**

Após a linha `if (error) throw new Error('Falha ao gravar entitlements...')`, adicionar:

```typescript
// Registrar purchase para analytics
for (const product_id of productIds) {
  const product = (await supabaseAdmin
    .from("products")
    .select("name, price_cents, kind")
    .eq("id", product_id)
    .single()).data;

  if (product) {
    const offer = offers?.find((o) => o.product_id === product_id);
    const offerLabel = offer ? (
      await supabaseAdmin
        .from("product_kirvano_offers")
        .select("label")
        .eq("kirvano_offer_id", offer.kirvano_offer_id)
        .single()
    ).data?.label : null;

    const productType = inferProductType(offerLabel, product.name);

    await supabaseAdmin.from("purchases").upsert({
      transaction_id: txId,
      lead_id: null, // será preenchido se conseguirmos cruzar
      user_id: userId,
      product_name: product.name,
      product_type: productType,
      gross_value: product.price_cents,
      status: "confirmed",
      kirvano_offer_id: offerIds[0],
      buyer_email: email,
      metadata: { event: eventName, raw_offer_ids: offerIds },
    }, { onConflict: "transaction_id" });
  }
}
```

- [ ] **Step 3: Adicionar função inferProductType antes de processKirvanoPayload**

```typescript
function inferProductType(label: string | null, productName: string): string {
  if (!label) return "principal";
  const l = label.toLowerCase();
  if (l.includes("upsell") || l.includes("upgrade")) return "upsell";
  if (l.includes("downsell")) return "downsell";
  if (l.includes("bump")) return "order_bump";
  return "principal";
}
```

- [ ] **Step 4: No bloco de REVOKE, atualizar purchases**

Após o update de entitlements para refunded, adicionar:

```typescript
await supabaseAdmin
  .from("purchases")
  .update({ status: "refunded" })
  .eq("user_id", userId)
  .in("product_id", productIds); // Nota: usa transaction_id se disponível
```

Atenção: `purchases` não tem `product_id` — tem `product_name`. Ajustar para usar `transaction_id` ou `buyer_email + product_name`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/admin/kirvano.server.ts
git commit -m "feat: record purchases on webhook for granular sales analytics"
```

---

## Task 4: Criar RPCs SQL para analytics

**Files:**
- Create: `supabase/migrations/20260531_analytics_rpcs.sql`

- [ ] **Step 1: Criar migration com 5 RPCs**

```sql
-- ============================================================
-- RPC 1: Nicho Vencedor (top segmentos por conversão)
-- ============================================================
CREATE OR REPLACE FUNCTION public.analytics_top_segments(
  p_days integer DEFAULT 30,
  p_min_leads integer DEFAULT 5
)
RETURNS TABLE (
  archetype text,
  situation text,
  desire text,
  total_leads bigint,
  with_email bigint,
  purchasers bigint,
  conv_rate numeric,
  revenue numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    l.archetype,
    l.situation,
    l.desire,
    COUNT(*)::bigint AS total_leads,
    COUNT(l.email)::bigint AS with_email,
    COUNT(DISTINCT p.buyer_email)::bigint AS purchasers,
    ROUND(COUNT(DISTINCT p.buyer_email)::numeric / NULLIF(COUNT(*), 0) * 100, 1) AS conv_rate,
    COALESCE(SUM(p.gross_value), 0)::numeric / 100 AS revenue
  FROM leads l
  LEFT JOIN purchases p
    ON lower(l.email) = lower(p.buyer_email)
    AND p.status = 'confirmed'
  WHERE l.archetype IS NOT NULL
    AND l.created_at >= now() - (p_days || ' days')::interval
  GROUP BY l.archetype, l.situation, l.desire
  HAVING COUNT(*) >= p_min_leads
  ORDER BY conv_rate DESC
  LIMIT 20;
$$;

-- ============================================================
-- RPC 2: Funil completo (taxas por etapa)
-- ============================================================
CREATE OR REPLACE FUNCTION public.analytics_funnel(p_days integer DEFAULT 30)
RETURNS TABLE (
  total_leads bigint,
  with_archetype bigint,
  with_email bigint,
  purchasers bigint,
  upsell_buyers bigint,
  downsell_buyers bigint,
  total_revenue numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH period_leads AS (
    SELECT * FROM leads WHERE created_at >= now() - (p_days || ' days')::interval
  ),
  period_purchases AS (
    SELECT * FROM purchases WHERE status = 'confirmed' AND created_at >= now() - (p_days || ' days')::interval
  )
  SELECT
    (SELECT COUNT(*) FROM period_leads)::bigint,
    (SELECT COUNT(*) FROM period_leads WHERE archetype IS NOT NULL)::bigint,
    (SELECT COUNT(*) FROM period_leads WHERE email IS NOT NULL)::bigint,
    (SELECT COUNT(DISTINCT buyer_email) FROM period_purchases WHERE product_type = 'principal')::bigint,
    (SELECT COUNT(DISTINCT buyer_email) FROM period_purchases WHERE product_type = 'upsell')::bigint,
    (SELECT COUNT(DISTINCT buyer_email) FROM period_purchases WHERE product_type = 'downsell')::bigint,
    (SELECT COALESCE(SUM(gross_value), 0)::numeric / 100 FROM period_purchases);
$$;

-- ============================================================
-- RPC 3: Receita por produto/tipo com período
-- ============================================================
CREATE OR REPLACE FUNCTION public.analytics_revenue_breakdown(p_days integer DEFAULT 30)
RETURNS TABLE (
  product_name text,
  product_type text,
  sales bigint,
  revenue numeric,
  refunds bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    product_name,
    product_type,
    COUNT(*) FILTER (WHERE status = 'confirmed')::bigint AS sales,
    COALESCE(SUM(gross_value) FILTER (WHERE status = 'confirmed'), 0)::numeric / 100 AS revenue,
    COUNT(*) FILTER (WHERE status = 'refunded')::bigint AS refunds
  FROM purchases
  WHERE created_at >= now() - (p_days || ' days')::interval
  GROUP BY product_name, product_type
  ORDER BY revenue DESC;
$$;

-- ============================================================
-- RPC 4: Respostas do quiz × conversão
-- ============================================================
CREATE OR REPLACE FUNCTION public.analytics_quiz_conversion(p_days integer DEFAULT 30)
RETURNS TABLE (
  question_key text,
  answer_value text,
  answer_text text,
  total bigint,
  converted bigint,
  conv_rate numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    qr.question_key,
    qr.answer_value,
    qr.answer_text,
    COUNT(*)::bigint AS total,
    COUNT(p.id)::bigint AS converted,
    ROUND(COUNT(p.id)::numeric / NULLIF(COUNT(*), 0) * 100, 1) AS conv_rate
  FROM quiz_responses qr
  JOIN leads l ON l.id = qr.lead_id
  LEFT JOIN purchases p
    ON lower(l.email) = lower(p.buyer_email)
    AND p.status = 'confirmed'
  WHERE l.created_at >= now() - (p_days || ' days')::interval
  GROUP BY qr.question_key, qr.answer_value, qr.answer_text
  ORDER BY qr.question_key, conv_rate DESC;
$$;

-- ============================================================
-- RPC 5: Cohort semanal (leads × conversão × receita)
-- ============================================================
CREATE OR REPLACE FUNCTION public.analytics_cohort_weekly(p_weeks integer DEFAULT 12)
RETURNS TABLE (
  cohort_week date,
  leads bigint,
  buyers bigint,
  revenue numeric,
  conv_pct numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    date_trunc('week', l.created_at)::date AS cohort_week,
    COUNT(DISTINCT l.id)::bigint AS leads,
    COUNT(DISTINCT p.buyer_email)::bigint AS buyers,
    COALESCE(SUM(p.gross_value), 0)::numeric / 100 AS revenue,
    ROUND(COUNT(DISTINCT p.buyer_email)::numeric / NULLIF(COUNT(DISTINCT l.id), 0) * 100, 1) AS conv_pct
  FROM leads l
  LEFT JOIN purchases p
    ON lower(l.email) = lower(p.buyer_email)
    AND p.status = 'confirmed'
  WHERE l.archetype IS NOT NULL
    AND l.created_at >= now() - (p_weeks || ' weeks')::interval
  GROUP BY cohort_week
  ORDER BY cohort_week DESC;
$$;

-- Permissões
GRANT EXECUTE ON FUNCTION public.analytics_top_segments TO authenticated;
GRANT EXECUTE ON FUNCTION public.analytics_funnel TO authenticated;
GRANT EXECUTE ON FUNCTION public.analytics_revenue_breakdown TO authenticated;
GRANT EXECUTE ON FUNCTION public.analytics_quiz_conversion TO authenticated;
GRANT EXECUTE ON FUNCTION public.analytics_cohort_weekly TO authenticated;
```

- [ ] **Step 2: Aplicar no Supabase remoto**

```bash
# Via Supabase Dashboard > SQL Editor
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260531_analytics_rpcs.sql
git commit -m "feat(db): add 5 analytics RPCs (segments, funnel, revenue, quiz-conversion, cohort)"
```

---

## Task 5: Criar `src/lib/admin/analytics.ts`

**Files:**
- Create: `src/lib/admin/analytics.ts`

- [ ] **Step 1: Criar módulo de funções RPC**

```typescript
import { supabase } from "@/integrations/supabase/client";

export type TopSegment = {
  archetype: string;
  situation: string;
  desire: string;
  total_leads: number;
  with_email: number;
  purchasers: number;
  conv_rate: number;
  revenue: number;
};

export type FunnelData = {
  total_leads: number;
  with_archetype: number;
  with_email: number;
  purchasers: number;
  upsell_buyers: number;
  downsell_buyers: number;
  total_revenue: number;
};

export type RevenueRow = {
  product_name: string;
  product_type: string;
  sales: number;
  revenue: number;
  refunds: number;
};

export type QuizConversionRow = {
  question_key: string;
  answer_value: string;
  answer_text: string;
  total: number;
  converted: number;
  conv_rate: number;
};

export type CohortRow = {
  cohort_week: string;
  leads: number;
  buyers: number;
  revenue: number;
  conv_pct: number;
};

export async function fetchTopSegments(days = 30): Promise<TopSegment[]> {
  const { data, error } = await supabase.rpc("analytics_top_segments", {
    p_days: days,
    p_min_leads: 5,
  });
  if (error) throw error;
  return (data ?? []) as TopSegment[];
}

export async function fetchFunnel(days = 30): Promise<FunnelData> {
  const { data, error } = await supabase.rpc("analytics_funnel", { p_days: days });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return (row ?? {
    total_leads: 0, with_archetype: 0, with_email: 0,
    purchasers: 0, upsell_buyers: 0, downsell_buyers: 0, total_revenue: 0,
  }) as FunnelData;
}

export async function fetchRevenueBreakdown(days = 30): Promise<RevenueRow[]> {
  const { data, error } = await supabase.rpc("analytics_revenue_breakdown", { p_days: days });
  if (error) throw error;
  return (data ?? []) as RevenueRow[];
}

export async function fetchQuizConversion(days = 30): Promise<QuizConversionRow[]> {
  const { data, error } = await supabase.rpc("analytics_quiz_conversion", { p_days: days });
  if (error) throw error;
  return (data ?? []) as QuizConversionRow[];
}

export async function fetchCohortWeekly(weeks = 12): Promise<CohortRow[]> {
  const { data, error } = await supabase.rpc("analytics_cohort_weekly", { p_weeks: weeks });
  if (error) throw error;
  return (data ?? []) as CohortRow[];
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/admin/analytics.ts
git commit -m "feat: add analytics RPC client functions"
```

---

## Task 6: Criar dashboard `/admin/analytics`

**Files:**
- Create: `src/routes/admin.analytics.tsx`
- Modify: `src/components/admin/AdminSidebar.tsx`

- [ ] **Step 1: Criar a rota admin.analytics.tsx**

Dashboard com 5 seções usando as RPCs:

1. **Funil** — barra horizontal mostrando leads → archetype → email → purchase → upsell
2. **Top Segmentos** — tabela dos 10 melhores segmentos (archetype × situation × desire) por conversão
3. **Receita por Produto** — cards com produto, tipo, vendas, receita, reembolsos
4. **Quiz × Conversão** — para cada pergunta, qual resposta tem maior taxa de conversão
5. **Cohort Semanal** — BarChart de leads vs buyers por semana

Seguir o padrão visual do admin existente (GlassCard, dark theme, PERIODS selector).

O componente deve:
- Usar `useQuery` com as funções de `analytics.ts`
- Aceitar filtro de período (7d, 30d, 90d, Tudo)
- Ter loading states consistentes com o resto do admin

Código completo: será ~250 linhas seguindo os padrões de `admin.leads.tsx` e `admin.quiz.tsx`. Usar Recharts para gráficos, GlassCard para seções.

- [ ] **Step 2: Adicionar link na sidebar**

Em `AdminSidebar.tsx`, após o link de "Analytics Quiz":

```typescript
{ to: "/admin/analytics", icon: TrendingUp, label: "Analytics Avançado" },
```

Adicionar `TrendingUp` nos imports de lucide-react (se não existir).

- [ ] **Step 3: Regenerar routeTree**

```bash
npx @tanstack/router-cli generate
```

- [ ] **Step 4: Validar**

```bash
npx tsc --noEmit
npm run build
```

- [ ] **Step 5: Commit**

```bash
git add src/routes/admin.analytics.tsx src/components/admin/AdminSidebar.tsx src/routeTree.gen.ts
git commit -m "feat: add advanced analytics dashboard (funnel, segments, quiz-conversion, cohort)"
```

---

## Task 7: Acesso do Claude Code via RPCs

**Files:**
- Nenhum arquivo novo — as RPCs já estão disponíveis

- [ ] **Step 1: Documentar como o Claude acessa**

O Claude Code pode chamar as RPCs diretamente via Supabase JS:

```javascript
// Em qualquer sessão futura, o Claude pode rodar:
const { data } = await supabase.rpc("analytics_top_segments", { p_days: 30, p_min_leads: 5 });
// Retorna: [{archetype, situation, desire, total_leads, purchasers, conv_rate, revenue}, ...]
```

Ou via SQL direto no Supabase Dashboard.

- [ ] **Step 2: Criar instrução no Guia.md**

Adicionar seção no Guia.md:

```markdown
### Analytics via Claude Code (RPCs)

O Claude pode acessar analytics em qualquer sessão via `supabase.rpc()`:

| RPC | Parâmetros | Retorna |
|-----|-----------|---------|
| `analytics_top_segments` | `p_days`, `p_min_leads` | Top segmentos por conversão (archetype × situation × desire) |
| `analytics_funnel` | `p_days` | Funil: leads → email → purchase → upsell |
| `analytics_revenue_breakdown` | `p_days` | Receita por produto e tipo |
| `analytics_quiz_conversion` | `p_days` | Respostas do quiz × taxa de conversão |
| `analytics_cohort_weekly` | `p_weeks` | Cohort semanal (leads, buyers, revenue) |

Para rodar: conectar ao Supabase via `supabase.rpc("nome", { params })` ou SQL no Dashboard.
```

- [ ] **Step 3: Commit**

```bash
git add Guia.md  # (no Quiz-sacra)
git commit -m "docs: add Claude Code analytics RPC reference to Guia.md"
```

---

## Ordem de Execução

```
Task 1: Verificar schema quiz_responses (pré-requisito)
  ↓
Task 2: Criar tabela purchases (migration SQL)
  ↓
Task 3: Alimentar purchases no webhook (código server)
  ↓
Task 4: Criar 5 RPCs analytics (migration SQL)
  ↓
Task 5: Client analytics.ts (funções RPC)
  ↓
Task 6: Dashboard /admin/analytics (UI)
  ↓
Task 7: Documentação para Claude Code
```

Tasks 2 e 4 são SQL puro (podem ser aplicadas em paralelo no Supabase).
Tasks 5 e 6 dependem de 4 (RPCs precisam existir).
Task 3 pode ser feita em paralelo com 4-6 (webhook independe do dashboard).

## Resumo

| Task | Tipo | Esforço | Risco |
|------|------|---------|-------|
| 1. Schema quiz_responses | Verificação/migration | 30min | Baixo |
| 2. Tabela purchases | Migration SQL | 30min | Baixo |
| 3. Webhook → purchases | Código server | 1h | Médio (toca webhook crítico) |
| 4. RPCs analytics | Migration SQL | 1h | Baixo |
| 5. Client analytics.ts | Código client | 30min | Baixo |
| 6. Dashboard analytics | UI React | 2-3h | Baixo |
| 7. Documentação Claude | Docs | 15min | Zero |
| **Total** | | **~6h** | |
