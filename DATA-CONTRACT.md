# DATA CONTRACT — Constituição de Dados (FINAL)
> **Status:** FINAL (provado em 13/13 testes contra banco de produção)
> **Data:** 2026-06-16 | **Projeto:** cemjibbauvvyfaxilrvm
> **Regra:** Este documento é a fonte de verdade sobre como cada métrica é calculada.
> **Referenciado em:** CLAUDE.md (todo Claude lê primeiro)

---

## §1 PRINCÍPIOS

1. **Uma fonte por métrica.** Se duas telas dão números diferentes, uma está com bug.
2. **Zero query crua.** Nenhuma página admin faz `from("purchases")` ou `from("leads")` direto. Tudo lê das views canônicas.
3. **`is_test` por denylist de email.** Não por data. Emails de teste em `checkout_config.test_emails`.
4. **Linha de corte.** `checkout_config.production_start_at = 2026-06-08`. Antes = pré-produção.
5. **Join por `external_id ↔ src`.** Nunca por email. Email pode ser NULL (captura WhatsApp).
6. **Prova na fonte viva.** Banco e Meta Events Manager. Nunca código, migrations, ou "✅" no chat.

---

## §2 DEFINIÇÕES CANÔNICAS

### Receita
```
VIEW: vendas_reais
= purchases WHERE status = 'confirmed'
                AND is_test = false
                AND created_at >= checkout_config.production_start_at
FUNÇÃO: receita_real() → R$ (SUM(gross_value)/100)
```
**Provado:** R$666,40 de 5 fontes independentes (2026-06-16).
**PROIBIDO:** `entitlements × products.price_cents`, query crua de `purchases` sem filtro.

### Leads
```
VIEW: leads_reais
= leads WHERE is_test = false
            AND created_at >= checkout_config.production_start_at
```
**Provado:** 122 leads reais (não 889 quiz_responses).
**PROIBIDO:** `COUNT(quiz_responses)` (7x inflado — 1 row por pergunta).

### Conversão (lead → compra)
```
JOIN: leads_reais.external_id = vendas_reais.src
MÉTRICA: COUNT(DISTINCT l.id) FILTER (WHERE p.src IS NOT NULL) / COUNT(DISTINCT l.id)
```
**Provado:** 8 matches (2026-06-16). Persona × compra funciona.
**PROIBIDO:** `lower(l.email) = lower(p.buyer_email)` (email NULL pós-WhatsApp).
**PROIBIDO:** `entitlements` como proxy de conversão (inclui grants manuais).

### Arquétipo
```
FONTE: leads.archetype (ou leads_reais.archetype)
```
**PROIBIDO:** `quiz_responses.archetype` (NULL nos novos).

### is_test
```
REGRA: buyer_email IN (checkout_config.test_emails)
EMAILS: henrique.voinvicta@gmail.com, guilherme.claude@gmail.com
```
**NÃO é por data.** Data é o baseline (production_start_at), não teste.

---

## §3 VIEWS E FUNÇÕES CANÔNICAS (existem no banco)

| Objeto | Tipo | Filtros | Grants |
|--------|------|---------|--------|
| `vendas_reais` | VIEW | confirmed + !is_test + ≥ production_start | SELECT: authenticated |
| `leads_reais` | VIEW | !is_test + ≥ production_start | SELECT: authenticated |
| `receita_real()` | FUNCTION | SUM de vendas_reais | EXECUTE: authenticated |
| `checkout_config` | TABLE | RLS ON, SELECT-only para anon/authenticated | service_role escreve |

---

## §4 RPCs DE ANALYTICS (todas usam views canônicas)

| RPC | Join | Fonte |
|-----|------|-------|
| `analytics_funnel` | N/A (contagens independentes) | leads_reais + vendas_reais |
| `analytics_top_segments` | external_id = src | leads_reais + vendas_reais (subquery anti-fan-out) |
| `analytics_quiz_conversion` | external_id = src | quiz_responses JOIN leads_reais LEFT JOIN vendas_reais |
| `analytics_cohort_weekly` | external_id = src | leads_reais LEFT JOIN vendas_reais |
| `analytics_revenue_breakdown` | N/A | purchases (is_test=false + baseline) |
| `analytics_quiz_funnel` | N/A | quiz_funnel_events (12 stages) |

---

## §5 TRACKING / META

### external_id (qs_*)
```
GERAÇÃO: Quiz-sacra tracking.ts:14 — crypto.randomUUID() com prefixo "qs_"
PERSISTÊNCIA: localStorage (rdp_external_id)
FLUXO: quiz → persist_lead(p_external_id) → leads.external_id
        quiz → URL param "src" → Kirvano → webhook utm.src → purchases.src
```

### fbc (Facebook Click ID)
```
REGRA: Se cookies.fbclid já começa com "fb." → usar AS IS
        Se é fbclid raw → empacotar: fb.1.{timestamp}.{fbclid}
        NUNCA re-empacotar (fix double-wrap em meta-capi.server.ts:129-133)
```

### Purchase (CAPI)
```
EMISSOR ÚNICO: nossa CAPI (meta-capi.server.ts)
event_id: sale_id (transactionId do Kirvano) — dedup garantido
value: payload.total_price (real por venda)
content_ids: ["rotina-de-paz"]
Retry: 1 tentativa rápida + cron async (capi-retry.ts, a cada hora)
capi_status: gravado por webhook_log.id (sem race condition)
```

### ph (Phone Hash)
```
NORMALIZAÇÃO: strip non-digits, remove leading 0, prefixar 55 se BR (10-11 dígitos)
HASH: SHA-256
ENVIAR EM: Lead (pixel AM) + Purchase (CAPI)
```

### Domain Guard
```
PRODUÇÃO: sacra.rotinadepaz.com.br, rotinadepaz.com.br
PROTEGIDO: pixel init+PageView, IC, saveTrackingSession, Lead, QuizStep
```

### Dedup
```
ESTADO ATUAL: Kirvano pixel+CAPI ainda ativo → dedup "não atende"
PLANO: após CAPI provada enviando → desligar Kirvano → dedup "atende"
```

---

## §6 ADMIN — FONTE ÚNICA POR TELA

| Tela | Server fn / Query | Fonte |
|------|-------------------|-------|
| Visão Geral | `getOverviewKpis()` | vendas_reais + leads_reais (supabaseAdmin) |
| Analytics Avançado | `getFunnel/getTopSegments/...` | RPCs via supabaseAdmin |
| Vendas | `from("vendas_reais")` | VIEW direta |
| Leads | `from("leads_reais")` | VIEW direta |
| Quiz | `getConvertedLeadIds()` + leads_reais | external_id ↔ src (não email) |
| Tracking | `getConvertedLeadIds()` + leads_reais | idem |
| Quiz Funnel | `getQuizFunnel()` | RPC analytics_quiz_funnel |

---

## §7 RECONCILIAÇÃO

| Job | Schedule | O que faz |
|-----|----------|-----------|
| daily-reconciliation | 09:00 UTC | `run_reconciliation(24)` |
| cleanup-webhook-logs | 03:00 UTC | DELETE > 90 dias |
| cleanup-tracking-sessions | 03:00 UTC | DELETE > 30 dias |
| capi-retry | a cada hora | Reprocessa capi_status='failed' (max 10/run, max 5 tentativas) |

---

## §8 ESTADO PROVADO (2026-06-16)

| Métrica | Valor | Teste |
|---------|-------|-------|
| Receita real | R$666,40 (5 fontes) | PASS |
| Receita com teste | R$760,40 | PASS |
| Compradores reais | 9 | PASS |
| Leads reais | 122 | PASS |
| is_test | 2 emails, R$94 | PASS |
| purchases.src fill | 19/19 (100%) | PASS |
| leads.external_id | 5/128 (buyers parcial) | WARN — leads novos populam |
| Join matches | 8 | PASS |
| Quiz funnel | 12 stages completos | PASS |
| Entitlements | Zero órfãos | PASS |
| RLS checkout_config | ON, SELECT-only | PASS |
| Domain guards | 4/4 fbq() calls | PASS |
| Queries cruas admin | 0 | PASS |

---

## §9 PENDENTE (precisa de deploy + venda real)

| Item | Prova necessária |
|------|-----------------|
| CAPI enviando | 1 venda real → capi_status='sent' |
| Desligar Kirvano CAPI+pixel | Após CAPI provada → Events Manager dedup "atende" |
| fbc alerta | Events Manager → "fbclid modificado" some |
| 2º pixel 3207... | Investigar no Meta Business Manager |
| 3 SALE_REFUNDED falhados | Verificar se clientes estornados ainda têm acesso |

---

## §10 REGRAS PARA FUTURAS SESSÕES

1. **Ler este documento PRIMEIRO** antes de mexer em qualquer métrica.
2. **Nunca adicionar query crua** de purchases/leads em páginas admin. Usar views.
3. **Nunca juntar lead↔compra por email.** Usar external_id ↔ src.
4. **Testar contra banco real**, nunca contra código/migrations.
5. **is_test por email denylist**, não por data.
6. **Domain guard em todo disparo de pixel** — checar hostname antes de fbq().
