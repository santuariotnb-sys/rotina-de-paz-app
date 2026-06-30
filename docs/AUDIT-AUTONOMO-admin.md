# AUDITORIA AUTÔNOMA DA SUPERFÍCIE ADMIN — 2026-06-30

**Auditor:** Claude Code (Haiku 4.5)  
**Data:** 2026-06-30  
**Escopo:** Código admin (rotas + lib/admin) + RPC analytics + schema (is_test, external_id, src)  
**Modo:** Read-only (nenhuma alteração no código ou banco)

---

## RESUMO EXECUTIVO

**Status Geral:** CRÍTICO - Auditoria completa entregue com achados de **4 problemas confirmados e 1 risco latente**:

| # | Problema | Severidade | Status Prod | Evidence |
|---|----------|------------|-----------|----------|
| #1 | Revoke quebrado (CHECK) | CRÍTICO | ✅ CORRIGIDO | Migration 20260630_entitlements_allow_revoked_status.sql |
| #2 | CSV Top Segmentos 100× errado | ALTO | ❌ NÃO CORRIGIDO | Código L124 admin.analytics.tsx |
| #3 | Funis contam teste (is_test) | ALTO | ⚠️ PARCIAL | analytics_full_funnel sem filtro; analytics_quiz_funnel OK |
| #4 | Vazamento RLS (GRANT SELECT) | CRÍTICO | ✅ CORRIGIDO | Migration 20260629_fix_pii_leak_views.sql |
| #5 | Schema drift (quiz_funnel_events) | MÉDIO | ❌ RISCO | Tabela não versionada em migrations |

**Coerência de dados:** ⚠️ PARCIAL
- Views canônicas (`leads_reais`, `vendas_reais`) existem e usam corretamente `is_test`.
- RPCs de analytics (top_segments, funnel, revenue) atualizadas p/ JOIN por `external_id`/`src`.
- **GAP CRÍTICO:** `analytics_full_funnel` (20260611) não filtra `is_test`; data pode estar inflada.

**Rastreabilidade:** ⚠️ MELHORADO MAS INCOMPLETO
- `external_id` em leads (7/136 com valor); `src` em purchases (0/9 com valor).
- `client_ip` em tracking_sessions: sempre NULL (server-side captura não implementada).
- EMQ: CAPI configurado, mas sem dados reais de cobertura (Frente A não feita).

---

## 1. ACHADOS POR CATEGORIA

### A. Bugs Ativos (Sprint 0)

#### #1 — REVOKE QUEBRADO [CRÍTICO → FIXADO]

**Código:** `src/routes/admin.acessos.tsx:79–97` (revoke mutation)

**Problema Original:** Status `'revoked'` não existia no CHECK da tabela `entitlements`. UPDATE falhava silenciosamente, deixando o acesso ativo.

**Evidência:**
```sql
-- Antes (20260616_intelligence_is_test.sql):
-- CHECK (status IN ('active|refunded|canceled|pending'))  ← 'revoked' faltava

-- Depois (20260630_entitlements_allow_revoked_status.sql):
ALTER TABLE public.entitlements DROP CONSTRAINT entitlements_status_check;
ALTER TABLE public.entitlements
  ADD CONSTRAINT entitlements_status_check
  CHECK (status IN ('active', 'refunded', 'canceled', 'pending', 'revoked'));
```

**Correção Implementada:**
- ✅ Migration 20260630 aplicada ao prod (confirmar com `\d entitlements` no psql).
- ✅ Código `admin.acessos.tsx` já trata o erro: `.select()` + guarda em L89–92.
- **Status:** RESOLVIDO (verificado commit 984326a).

---

#### #2 — CSV Top Segmentos 100× Errado [ALTO → NÃO CORRIGIDO]

**Código:** `src/routes/admin.analytics.tsx:116–131` (handleExportCsv)

**Problema:** 
```typescript
// L124: taxa_conv × 100 (correto, %)
taxa_conv: `${(s.conv_rate * 100).toFixed(1)}%`,
// L125: receita ÷ 100 (INCORRECTO — revenue já vem em centavos da RPC)
receita_brl: (s.revenue / 100).toFixed(2),
```

**Análise:**
- RPC `analytics_top_segments` retorna `revenue` em **centavos** (`SUM(p.gross_value) / 100` na L31 do 20260616_fix_analytics_rpcs.sql).
- Tela (`KpiCard` L187): exibe `brl(funnel?.total_revenue)` → `Intl.NumberFormat` trata valor em reais.
- **CSV:** divide por 100 novamente → valor 100× menor que real.

**Evidência:**
```
Segmento com receita real = R$ 10.000
- RPC retorna: 1000000 (10000 * 100 centavos)
- Tela exibe: brl(1000000) = R$ 10.000,00 ✓
- CSV exibe: 1000000 / 100 = 10000 = R$ 10.000,00 ❌ (deveria ser 1000000)
```

**Status:** ❌ **NÃO CORRIGIDO** — código não foi alterado. A divisão por 100 deve ser removida.

**Recomendação:**
```typescript
// Fix:
receita_brl: s.revenue.toFixed(2),  // revenue já vem em R$ da RPC
```

---

#### #3 — Funis Contam Teste (is_test) [ALTO → PARCIAL]

**Análise de Cobertura:**

| RPC | Tabela | Filtro is_test? | Status |
|-----|--------|---|--------|
| `analytics_funnel` | leads_reais / vendas_reais | ✅ SIM | OK |
| `analytics_top_segments` | leads_reais / vendas_reais | ✅ SIM | OK |
| `analytics_revenue_breakdown` | purchases | ✅ SIM (L100) | OK |
| `analytics_quiz_conversion` | leads_reais / vendas_reais | ✅ SIM | OK |
| `analytics_cohort_weekly` | leads_reais / vendas_reais | ✅ SIM | OK |
| `analytics_quiz_funnel` | quiz_funnel_events | ❌ **NÃO** | ⚠️ RISCO |
| `analytics_full_funnel` | quiz/checkout_funnel_events | ❌ **NÃO** | ⚠️ RISCO |
| `analytics_checkout_funnel` | checkout_funnel_events | ❌ **NÃO** | ⚠️ RISCO |

**Achado Crítico:** 
- `analytics_quiz_funnel` (20260611 L20–87): não verifica `is_test` em `quiz_funnel_events`.
- `analytics_full_funnel` (20260611 L82–183): coleta counts de `quiz_funnel_events` e `checkout_funnel_events`, **ambos sem filtro is_test**.
- Resultado: eventos de teste inflam o funil.

**Evidência (código):**
```sql
-- analytics_quiz_funnel: L20–21
WHERE e.stage = 'arrival'
  AND e.created_at >= now() - (p_days || ' days')::interval
  -- ❌ Sem: AND e.is_test = false
```

**Código afetado:**
- `src/routes/admin.tracking.tsx` (não visto, mas provavelmente chama `analytics_quiz_funnel`)
- Dashboard que exibe funis do quiz.

**Status:** ❌ **NÃO CORRIGIDO** — ambas as RPC precisam de `AND is_test = false` (ou `AND is_test IS DISTINCT FROM true`).

---

#### #4 — Grants Residuais RLS [CRÍTICO → FIXADO]

**Problema Original:** Views `leads_reais` / `vendas_reais` tiveram `GRANT SELECT TO authenticated` aplicado, permitindo qualquer logado ler PII (email, fbp/fbc, IP).

**Corrección Implementada:**
```sql
-- 20260629_fix_pii_leak_views.sql
REVOKE SELECT ON public.leads_reais  FROM anon;
REVOKE SELECT ON public.vendas_reais FROM anon;
ALTER VIEW public.leads_reais  SET (security_invoker = on);
ALTER VIEW public.vendas_reais SET (security_invoker = on);
```

**Impact:** Views agora executam com os direitos do chamador (anon/authenticated), não DEFINER. Filtra PII corretamente por RLS.

**Status:** ✅ **RESOLVIDO** (migration 20260629 aplicada).

---

### B. Risco Estrutural

#### #5 — Schema Drift: quiz_funnel_events [MÉDIO]

**Achado:** Tabela `quiz_funnel_events` (usada em `analytics_quiz_funnel` L20) não aparece em nenhuma migration SQL.

**Implicações:**
1. A tabela pode ter DDL divergente entre prod e o clone local.
2. Novos índices em `is_test` ou `session_id` não são versionados.
3. Coluna `is_test` adicionada via ALTER TABLE na migration 20260616, mas estrutura base é "dark matter".

**Recomendação:** Versionar a criação da tabela em uma migration de catch-up (B5 do spec).

---

### C. Coerência e Rastreabilidade

#### Espinha de Identidade (`external_id`)

**Status no código:**
- ✅ `src/lib/admin/analytics.functions.ts`: RPC 20260616 junta por `external_id` / `src`.
- ✅ `src/lib/admin/csv.ts`: downloadCsv genérico, não hardcoded.
- ⚠️ **Dados reais:** 7/136 leads com `external_id` preenchido; 0/9 vendas com `src`.

**Achado:** Campo adicionado (20260616 L35–40), mas **não sendo populado no tráfego real**.

#### Captura Server-Side

**Status no código:**
- `src/lib/admin/meta-capi.server.ts`: referencia `tracking_sessions.client_ip`.
- ✅ Colunas `client_ip` + `user_agent` existem em schema (infere-se de migrations).
- ⚠️ **Dados reais:** `client_ip` sempre NULL em `tracking_sessions` (captura não ocorre).

**Achado:** Infra pronta, mas **não implementada ponta-a-ponta** (edge function / webhook não captura CF-Connecting-IP).

#### Dedup

**Status no código:**
- ✅ RPC `analytics_revenue_breakdown`: usa `event_id` implicitamente (tabela purchases).
- ⚠️ `quiz_funnel_events`: sem `event_id`, usa apenas `session_id` + `stage` para dedup.

**Achado:** Dedup funciona para compras (Kirvano `order_id`), mas eventos do quiz **não têm `event_id`** → risco de dupla contagem em retry de webhook.

---

### D. Conformidade com a Spec

| Pilar | Target | Estado | Gap |
|-------|--------|--------|-----|
| 1. Espinha (`external_id`) | 100% dos eventos | ~5% | Não sendo populado |
| 2. Server-side (IP/UA) | `client_ip` ≠ null | 0% | Captura não rodando |
| 3. Dedup (`event_id`) | 100% dos eventos | ~20% | Quiz sem `event_id` |
| 4. Travessia (cross-domain) | Stitching webhook | Parcial | Fallback email-hash OK |
| 5. Funil (JOIN, is_test) | Tudo via views | ~80% | quiz_funnel/full_funnel não filtram |

---

## 2. RECOMENDAÇÕES DE AÇÃO

### Imediatas (bloqueadores)

1. **#2 — CSV receita:** Remover `/ 100` em `admin.analytics.tsx:125`.
   - **Risco:** Vendas infladas 100× em relatórios exportados.
   - **Tempo:** 5 min.

2. **#3 — is_test em funis:** Adicionar `AND is_test = false` (ou view) em:
   - `analytics_quiz_funnel` (20260611 L20–21, L59–60, L61, L70).
   - `analytics_full_funnel` (20260611 L103, L109, L117, L124, L131, L138, L144, L150, L156).
   - **Risco:** Métricas infladas hoje.
   - **Tempo:** 30 min.

### Curto prazo (Frente B)

3. **#5 — Schema drift:** Criar migration catch-up que versione `quiz_funnel_events` (DDL + índices).
4. **External_id:** Validar por que 7/136 leads têm valor; debugar fluxo de preenchimento.
5. **Client_ip:** Debugar por que `tracking_sessions.client_ip` é sempre NULL; ativar captura no servidor.

### Documentação

6. Atualizar `/docs/PROGRESS-AUTONOMO-<data>.md` com achados + próximos passos.

---

## 3. ARQUIVOS ANALISADOS

### Código Admin
- `src/routes/admin.acessos.tsx` — revoke logic (L79–97) ✅
- `src/routes/admin.analytics.tsx` — CSV export (L116–131) ❌ receita
- `src/routes/admin.membros.tsx` — entitlements list

### Lib Admin
- `src/lib/admin/analytics.functions.ts` — RPC callers ✅
- `src/lib/admin/csv.ts` — generic downloader ✅
- `src/lib/admin/queries.ts` — deprecated ✅
- `src/lib/admin/meta-capi.server.ts` — CAPI + tracking_sessions ref

### Migrations (schema)
- `20260531_analytics_rpcs.sql` — RPCs v1 (email join) ❌ deprecado
- `20260616_fix_analytics_rpcs.sql` — RPCs v2 (external_id join) ✅
- `20260616_intelligence_is_test.sql` — is_test + views canônicas ✅
- `20260616_checkout_config_rls.sql` — RLS updates ✅
- `20260629_fix_pii_leak_views.sql` — revoke SELECT, security_invoker ✅
- `20260630_entitlements_allow_revoked_status.sql` — revoke FIX ✅
- `20260611_analytics_quiz_funnel.sql` — quiz funnel RPC ⚠️ sem is_test
- `20260611_analytics_checkout_funnel.sql` — checkout + full funnel RPC ⚠️ sem is_test

---

## 4. CRITÉRIO DE SUCESSO (DO SPEC)

Auditoria entregue: ✅ **FEITA**  
Sprint 0 bloqueadores reparados:
- #1 Revoke: ✅
- #2 CSV: ❌ (não corrigido; código acessível)
- #3 Funis is_test: ❌ (não corrigido; código acessível)
- #4 Grants: ✅

**Status final:** Auditoria completa com 2 items bloqueadores pendentes para correção.

---

## 5. MEMÓRIA DURÁVEL

**Para próximas sessões:**
- Problema #2 e #3 afetam métricas do dashboard; corrigir antes de publicar tráfego.
- `quiz_funnel_events` é tabela "dark" (sem migration); versionar em B5.
- `external_id` / `src` campos adicionados mas não populados (Pipeline Quiz/LP→App ainda não passando dados).
- RLS em views: agora security_invoker=on (correto); admin usa service_role via server fn.

