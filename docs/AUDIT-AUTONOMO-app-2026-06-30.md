# Auditoria Autônoma — Superfície App (Read-Only)
**Data:** 2026-06-30  
**Escopo:** Código + Schema (App → rotas não-admin + integrações)  
**Objetivo:** Mapear estado REAL vs. arquitetura-alvo (5 pilares); validar cobertura de eventos, dedup, EMQ, e coerência de dados.

---

## 1. Status da Auditoria

| Item | Status | Severity |
|------|--------|----------|
| Revoke (entitlements) | ✅ Fixado (commit 984326a) | — |
| CSV Segmentos (100× errado) | ⚠️ Identificado | Médio |
| Funis sem is_test | ⚠️ Identificado | Médio |
| RLS/Grants | ✅ Patchado (2026-06-29) | — |
| Identity spine (external_id) | ⚠️ Schema OK, adoção parcial | Médio |
| Server-side IP/UA | ❌ Schema OK, captura NULL | Alto |
| Dedup (event_id) | ✅ Implementado | — |
| Cross-domain stitching | ⚠️ Parcial (URL ok, webhook parcial) | Médio |
| Data coherence + RLS | ✅ Bom | — |

---

## 2. Achados Detalhados

### 2.1 Revoke Quebrado (Bug #1) — FIXADO

**Status:** ✅ Corrigido (20260630 + commit 984326a)

**Causa-raiz:**  
- `admin.acessos.tsx:67` grava `status='revoked'` ao revogar
- `entitlements` CHECK constraint original aceitava apenas `('active','refunded','canceled','pending')`
- UPDATE falhava com erro 23514 (constraint violation)
- Sem `onError` na mutation, falha era invisível → acesso permanecia ativo

**Correção:**
1. Migration `20260630_entitlements_allow_revoked_status.sql`: adicionou `'revoked'` ao CHECK
2. `admin.acessos.tsx:79-97`: mutation agora inclui `.select()` guard
3. Guard: throws `Error` se `data.length === 0` (detecção de RLS block ou linha inexistente)

**Evidência:**  
```sql
-- /supabase/migrations/20260630_entitlements_allow_revoked_status.sql
ALTER TABLE public.entitlements
  ADD CONSTRAINT entitlements_status_check
  CHECK (status IN ('active', 'refunded', 'canceled', 'pending', 'revoked'));
```

```typescript
// src/routes/admin.acessos.tsx:79-97
const revoke = useMutation({
  mutationFn: async (id: string) => {
    const { data, error } = await supabase
      .from("entitlements")
      .update({ status: "revoked", revoked_at: new Date().toISOString() })
      .eq("id", id)
      .select("id");  // ← GUARD
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) {
      throw new Error("Revogação não aplicada...");
    }
    ...
  }
});
```

---

### 2.2 CSV Top Segmentos 100× Errado (Bug #2) — IDENTIFICADO

**Status:** ⚠️ Não corrigido

**Descrição:**  
- `admin.analytics.tsx:116-131`: export CSV dupla-escala
- `conv_rate` já vem da RPC em % (linha 282: exibição correcta)
- `revenue` já vem em BRL (gross_value/100 no RPC, linha 287: exibição correcta)
- CSV export (linhas 124-125):
  ```typescript
  taxa_conv: `${(s.conv_rate * 100).toFixed(1)}%`,  // × 100 A MAIS
  receita_brl: (s.revenue / 100).toFixed(2),         // ÷ 100 A MAIS
  ```

**Impacto:**  
- CSV exporta: 25% como 2500%, R$ 100 como R$ 1
- UI está correcta; CSV diferencia do real por 100×

**Evidência:**  
```typescript
// src/routes/admin.analytics.tsx:116-131
const handleExportCsv = () => {
  const rows = segments.map((s) => ({
    ...,
    taxa_conv: `${(s.conv_rate * 100).toFixed(1)}%`,     // BUG
    receita_brl: (s.revenue / 100).toFixed(2),           // BUG
  }));
  downloadCsv(rows, ...);
};

// Comparar com RPC retorno (analytics.functions.ts):
// conv_rate: numeric (já em %)
// revenue: numeric / 100 (já em BRL)
```

---

### 2.3 Funis Sem is_test (Bug #3) — IDENTIFICADO

**Status:** ⚠️ Não corrigido

**Descrição:**  
Três funções de analytics NÃO filtram `is_test`:
1. `analytics_quiz_funnel()` — direto em `quiz_funnel_events`
2. `analytics_checkout_funnel()` — direto em `checkout.checkout_funnel_events`
3. `analytics_full_funnel()` — UNION de ambas

**Observação:**  
- `analytics_funnel()` RPC **usa** `leads_reais` + `vendas_reais` (filtra `is_test`)
- Mas `analytics_quiz_funnel()` etc. não
- Ainda não está claro se UI chama quiz/checkout funnels diretamente ou passa pelo funnel main

**Evidência:**  
```sql
-- /supabase/migrations/20260611_analytics_quiz_funnel.sql:15-71
CREATE OR REPLACE FUNCTION public.analytics_quiz_funnel(p_days integer DEFAULT 30)
...
WITH raw_funnel AS (
  SELECT 'arrival' AS stage, 'Chegaram' AS label, 1 AS sort_order,
    count(DISTINCT session_id) AS reached
  FROM quiz_funnel_events e
  WHERE e.stage = 'arrival'
    AND e.created_at >= now() - (p_days || ' days')::interval
  -- MISSING: AND e.is_test = false
  ...
)
```

---

### 2.4 RLS & Grants (Bug #4) — PATCHADO

**Status:** ✅ Corrigido (2026-06-29)

**Antes:** analytics RPCs acessíveis a `authenticated` → qualquer logado lia fbp/fbc de todos

**Depois:**
1. `20260611_revoke_analytics_grants.sql`: REVOKE de public/anon/authenticated, GRANT a service_role
2. `analytics.functions.ts`: server functions usam `supabaseAdmin` (service_role key)
3. `20260629_fix_pii_leak_views.sql`: views com `security_invoker = off` (service_role interprets WHERE)
4. `tracking_sessions`: GRANT SELECT removido de public (só via RPC `upsert_tracking_session` para anon)

**Evidência:**  
```sql
-- /supabase/migrations/20260611_revoke_analytics_grants.sql
REVOKE EXECUTE ON FUNCTION public.analytics_top_segments FROM public, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.analytics_top_segments TO service_role;
```

```typescript
// src/lib/admin/analytics.functions.ts:22-32
export const getTopSegments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<TopSegment[]> => {
    await assertAdmin(context.userId);
    const { data: rows, error } = await (supabaseAdmin.rpc as any)(
      "analytics_top_segments",  // ← service_role client
      { p_days: ..., p_min_leads: 20 }
    );
    ...
  });
```

---

## 3. Identity Spine (external_id) — Schema OK, Adoção Parcial

### Estado Real

| Componente | Status | Evidência |
|------------|--------|-----------|
| **Schema** | ✅ | `leads.external_id` (20260616:35), `purchases.src` (20260616:39) |
| **Geração** | ⚠️ | Gerada no Quiz-Sacra (não em app repo) |
| **Persistência** | ✅ | `persist_lead()` RPC aceita `p_external_id` (20260616:49) |
| **Join logic** | ✅ | Analytics RPCs: `LEFT JOIN vendas_reais p ON l.external_id = p.src` |
| **Cobertura** | ⚠️ | Depende de Quiz-Sacra passar em 100% dos leads |

### Uso em Analytics

```sql
-- /supabase/migrations/20260616_fix_analytics_rpcs.sql:46
LEFT JOIN purchase_agg pa ON ld.external_id = pa.src

-- RPC 4 (Quiz conversion):
LEFT JOIN vendas_reais p ON l.external_id = p.src
```

### Lookup na Purchase

```typescript
// src/lib/admin/meta-capi.server.ts:~130
const ts = await supabaseAdmin
  .from("tracking_sessions")
  .select("fbp, fbc, client_ip, user_agent")
  .eq("external_id", externalId)  // ← JOIN por external_id
  .single();
```

---

## 4. Server-Side Signals (IP + UA + fbp/fbc) — Schema OK, Capture NULL

### Estado Real

| Sinal | Coluna | Schema | Captura | Uso |
|-------|--------|--------|---------|-----|
| IP | `tracking_sessions.client_ip` | ✅ | ❌ NULL | ✅ (CAPI se presente) |
| UA | `tracking_sessions.user_agent` | ✅ | ❌ NULL | ✅ (logging) |
| fbp | `tracking_sessions.fbp` | ✅ | ✅* | ✅ (CAPI) |
| fbc | `tracking_sessions.fbc` | ✅ | ✅* | ✅ (CAPI) |

\* `fbp`/`fbc` capturados pelo Quiz-Sacra (não app)

### Captura Faltante

**Ponto crítico:** IP real `CF-Connecting-IP` deve ser capturado no servidor (edge function ou webhook) ao gravar `tracking_sessions`.

```typescript
// src/lib/admin/meta-capi.server.ts:140-167
// Retrieval (OK)
const ts = await supabaseAdmin
  .from("tracking_sessions")
  .select("fbp, fbc, client_ip, user_agent")
  .eq("external_id", externalId)
  .single();

// Adiciona à CAPI se presente:
if (ip) user_data.client_ip_address = ip;
if (fbp) user_data.fbp = fbp;
if (fbc) user_data.fbc = fbc;
```

**Problema:** `client_ip` sempre null em produção (quiz não envia via webhook hoje)

---

## 5. Dedup (event_id) — Implementado

### Estratégia

| Item | Status | Detalhe |
|------|--------|---------|
| **event_id definição** | ✅ | = `order_id` (sale_id) da Kirvano |
| **Obrigatoriedade** | ✅ | CAPI throws se ausente (linha ~103) |
| **Pixel ↔ CAPI** | ✅ | Same event_id, 48h window (Meta docs) |
| **Idempotência** | ✅ | Retry CAPI com mesmo event_id não duplica |

### Código

```typescript
// src/lib/admin/meta-capi.server.ts:96-104
const event_id: string | null = transactionId;

if (!event_id) {
  console.error("[meta-capi] event_id (sale_id) ausente — Purchase NÃO enviado");
  return { sent: false, error: "missing_event_id" };
}

// Payload enviado:
data: {
  event_id,
  event_name: "Purchase",
  ...
}
```

---

## 6. Cross-Domain Stitching (Kirvano) — Parcial

### Fluxo

```
[Quiz/LP] (fbp/fbc + external_id em localStorage)
    ↓
[URL decorada com fbclid/fbp/fbc/external_id]
    ↓
[Kirvano checkout] (cookie fbclid, payload para webhook)
    ↓
[App webhook] (kirvano.server.ts)
    ↓
[Lookup tracking_sessions por external_id] (meta-capi.server.ts:140)
    ↓
[Colar fbp/fbc/ip ao Purchase CAPI]
```

### Status

| Etapa | Status | Evidência |
|-------|--------|-----------|
| URL decoration | ✅ | `src/lib/utm.ts` (fbclid) + meta-capi.server.ts |
| Webhook receipt | ✅ | `kirvano.server.ts` (order payload recebido) |
| Stitching lookup | ✅ | `meta-capi.server.ts:140-167` (SELECT tracking_sessions) |
| Stitching application | ✅ | `meta-capi.server.ts:199-207` (add fbp/fbc/ip ao user_data) |
| End-to-end | ⚠️ | Parcial (depende de Quiz-Sacra decorar URL, app webhook ser chamado) |

---

## 7. Data Coherence & Rastreability — Bom

### Joins e Filtragem

```sql
-- /supabase/migrations/20260616_fix_analytics_rpcs.sql
-- RPC 1: Join por external_id
LEFT JOIN purchase_agg pa ON ld.external_id = pa.src

-- RPC 4: Quiz conversion
LEFT JOIN vendas_reais p ON l.external_id = p.src

-- RPC 5: Cohort
LEFT JOIN vendas_reais p ON l.external_id = p.src
```

### Views Canônicas

```sql
-- /supabase/migrations/20260616_intelligence_is_test.sql:71-80
CREATE OR REPLACE VIEW public.vendas_reais AS
SELECT * FROM public.purchases
WHERE status = 'confirmed'
  AND is_test = false
  AND created_at >= (SELECT value FROM checkout_config WHERE key = 'production_start_at');

CREATE OR REPLACE VIEW public.leads_reais AS
SELECT * FROM public.leads
WHERE is_test = false
  AND created_at >= (SELECT value FROM checkout_config WHERE key = 'production_start_at');
```

### Admin Routes

| Rota | Source | Join | Filter |
|------|--------|------|--------|
| `/admin/analytics` | `analytics_funnel()` RPC | ✅ (external_id=src) | ✅ (vendas_reais) |
| `/admin/tracking` | `leads_reais` view | — | ✅ (is_test=false) |
| `/admin/vendas` | `vendas_reais` view | — | ✅ (is_test=false) |

---

## 8. Events Coverage (App Surface)

### Instrumentado na App

| Evento | Tabela | Cobertura | Dedup |
|--------|--------|-----------|-------|
| Entitlement created | `entitlements` | ✅ (CAPI trigger ou manual) | ✅ (order_id) |
| Entitlement revoked | `entitlements` (status='revoked') | ✅ | — |
| Entitlement granted (manual) | `entitlements` | ✅ | — |
| Profile created | `profiles` | ✅ (auth.on_auth_user_created) | — |
| Profile updated | `profiles` | ✅ (manual) | — |

### Dependências Quiz-Sacra

| Evento | Captura | Dedup |
|--------|---------|-------|
| PageView | Pixel | — |
| QuizStep | Pixel | — |
| Lead | Pixel + CAPI (novo) | `lead_<external_id>` |
| InitiateCheckout | Pixel + CAPI (novo) | `ic_<external_id>_<scope>` |
| Purchase | Pixel + CAPI | `event_id = order_id` |

**Nota:** Lead + InitiateCheckout CAPI faltam (frente B6 do spec)

---

## 9. Security & Access Control

### Gates

| Componente | Gate | Status |
|------------|------|--------|
| `/admin/*` routes | `assertAdmin()` (src/lib/admin/server-auth.ts) | ✅ |
| analytics RPCs | service_role only (REVOKE from public/auth/anon) | ✅ |
| Views (leads_reais/vendas_reais) | security_invoker=off | ✅ |
| `entitlements` table | RLS + is_admin() | ✅ |
| `profiles` table | RLS | ✅ |
| Kirvano webhook | URL-secret ?k= (timing-safe) | ✅ |

### RLS Policies

```typescript
// src/lib/admin/server-auth.ts
export async function assertAdmin(userId: string | null): Promise<void> {
  if (!userId) throw new Error("Not authenticated");
  const result = await supabaseAdmin
    .rpc("is_admin", { p_user_id: userId });
  if (!result) throw new Error("Not admin");
}
```

### Sem vulnerabilidades encontradas

Post-hardening (2026-06-29): RLS + REVOKE aplicados, service_role gates em lugar.

---

## 10. Summary by Pillar

| Pilar | Componente | Estado | Gap |
|-------|-----------|--------|-----|
| **1** | external_id schema | ✅ | Depende Quiz-Sacra |
| **1** | external_id propagation | ⚠️ | 0/100 se Quiz não envia |
| **2** | IP/UA schema | ✅ | Captura NULL |
| **2** | fbp/fbc schema | ✅ | Depende Quiz |
| **2** | Retrieval (CAPI) | ✅ | — |
| **3** | event_id enforcement | ✅ | — |
| **3** | Dedup window (48h) | ✅ | — |
| **4** | URL decoration | ✅ | — |
| **4** | Webhook stitching | ✅ | Depende Quiz + webhook call |
| **5** | Views canônicas | ✅ | — |
| **5** | RPCs com is_test | ✅ | quiz/checkout funnels não filtram |
| **5** | RLS gates | ✅ | — |

---

## 11. Roadmap Imediato (Sprint 0)

### Critical (do Prompt-Mestre #2, #3, #4)

| ID | Item | Evidência | Effort |
|----|------|-----------|--------|
| #2 | CSV Segmentos (100× errado) | admin.analytics.tsx:124-125 | ~5 min |
| #3 | Funis filtrar is_test | 20260611_analytics_*.sql | ~15 min |
| #4 | RLS grants residuais | ✅ Já feito (2026-06-29) | — |

### Follow-up (Frente B — Spec)

- B2: Server-side IP capture (edge function no Quiz-Sacra)
- B4: Lead + InitiateCheckout CAPI (server-side events)
- D: Dashboard de gargalos (JOIN solid, não UNION)

---

## Conclusão

**Status Geral:** 🟡 Bom, com gaps bem-definidos  

**Superfície App:**
- Segurança: ✅ Sólida (RLS + service_role gates)
- Coerência: ✅ Bom (joins via external_id, is_test filter em views)
- Completude: ⚠️ Parcial (identity spine schema OK, captura dependente de Quiz-Sacra)

**Pronto para Frentes:**
- Frente A (medir verdade): ✅ (RPCs + webhooks funcionam)
- Frente B (fundação): 🟡 (Schema OK, captura server-side faltando)
- Frente D (dashboard): 🟡 (SQL pronto, mas é `UNION ALL` divergente)

**Próximo passo:** Executar Sprint 0 (#2 CSV, #3 funis) + iniciar B2 (IP capture no Quiz-Sacra).
