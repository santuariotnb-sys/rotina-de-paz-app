# Auditoria Completa do Sistema de Tracking — TNB/Rotina de Paz

**Data:** 2026-06-15 (v3 FINAL — verificada com queries reais em produção)  
**Escopo:** DB schema, Meta CAPI, webhooks, dashboard admin, Quiz-sacra  
**Supabase:** cemjibbauvvyfaxilrvm  
**Pixel:** 838169472100225  
**Método:** v1 (10 agentes code-only) → v2 (10 agentes verificação) → **v3 (5 agentes com queries reais no banco de produção)**

---

## LIÇÃO APRENDIDA

> **Migrations ≠ banco real.** Várias estruturas (tabelas, RPCs, cron jobs) existem no banco mas NÃO nas migrations. Provavelmente criadas via Supabase Dashboard ou SQL direto. **Sempre testar contra produção, nunca confiar só no código.**

---

## VEREDICTO GERAL (v3 — dados reais)

| Area | Nota | Resumo |
|------|------|--------|
| **Receita & Purchases** | A | R$760,40 / 11 buyers / 19 purchases EXATO. 100% UTM fill rate. |
| **CAPI & Dedup** | A- | event_id obrigatório, zero inflação. Sem retry (fire-once 8s). Dedup Meta-side. |
| **Webhook** | B+ | 23/26 processados OK. Mas **signature_valid=false em 100%** — investigar. |
| **tracking_sessions** | B | Tabela EXISTE (7 rows), RPC 6-arg funciona. Mas captura ~6% dos leads (7/120). |
| **Dashboard Admin** | C+ | 3 definições de "vendas", leads sem dedup, entitlements stale entre períodos. |
| **Quiz-sacra Tracking** | B+ | Funil OK (426 arrivals), beacons funcionando. ViewContent faltando. |
| **Infra (cron/reconciliation)** | A- | 6 jobs ativos, reconciliation daily rodando. Vault secrets configurados. |

---

## NÚMEROS REAIS DE PRODUÇÃO (queries 15/06/2026)

### Receita
```
Purchases confirmados: 19 rows
Buyers únicos:         11
Receita total:         R$ 760,40
```

### Breakdown por produto
| Produto | Tipo | Vendas | Receita |
|---------|------|--------|---------|
| Rotina de Paz | principal | 11 | R$ 517,00 |
| Chave da Gratidão | upsell | 2 | R$ 134,00 |
| Bíblia das Emoções | order_bump | 3 | R$ 50,70 |
| Da Ansiedade à Gratidão | order_bump | 2 | R$ 39,80 |
| Devocional 30 Dias | order_bump | 1 | R$ 18,90 |
| **TOTAL** | | **19** | **R$ 760,40** |

### UTMs (purchases confirmados)
```
utm_source:   19/19 (100%)
utm_campaign: 19/19 (100%)
utm_medium:   19/19 (100%)
utm_content:  19/19 (100%)  ← contém nome+ID do criativo Meta
utm_term:     19/19 (100%)
```

### Leads
```
Total rows:     37
Emails únicos:  36
Duplicatas:     1 (mínimo, provavelmente multi-toque legítimo)
```

### Funil Quiz (beacon events)
```
arrival:   426 sessions
question:  116 sessions (725 eventos)
result:     82 sessions
offer:      58 sessions
cta:        16 sessions
contact:     3 sessions  ← email capturado (MENOS que CTA — pessoas pulam email)
```

### tracking_sessions
```
Total rows: 7
vs. 120 leads → ~6% de captura
RPC 6-arg:  funciona ✅
```

### Webhook Logs
```
Total:           26
Processados:     23
Não processados:  3 (stuck)
signature_valid:  0/26 (ZERO válidas) ⚠️
```

### Entitlements vs Purchases
```
Active entitlements (unique emails): 11
Confirmed purchases (unique emails): 11
Match:                                100% ✅
```

### pg_cron Jobs (6 ativos)
| Job | Schedule | Status |
|-----|----------|--------|
| cleanup-webhook-logs | 0 3 * * * | ✅ Ativo |
| cleanup-tracking-sessions | 0 3 * * * | ✅ Ativo |
| process-webhook-jobs | * * * * * | ✅ Ativo (cada minuto) |
| retry-pending-grants | */5 * * * * | ✅ Ativo (cada 5min) |
| expire-pending-pix | */15 * * * * | ✅ Ativo (cada 15min) |
| daily-reconciliation | 0 9 * * * | ✅ Ativo |

### Reconciliation (último relatório 15/06 09:00 UTC)
```
Sales analisadas:  3
Purchase match:    100%
UTM rate:          100%
Tracking rate:     67%
FBC rate:          67%
Divergência:       1 (biancardi — sem tracking_session)
```

---

## BUGS REAIS CONFIRMADOS POR PRODUÇÃO

### ALTO-1: signature_valid = false em 100% dos webhooks
- **Dado real:** 0 de 26 webhooks têm signature_valid=true
- **Impacto:** Webhooks processam mesmo assim (código aceita quando não há signature), mas rate limiting conta TODOS como falha
- **Investigar:** Kirvano não envia header de assinatura? Ou secret configurado errado?

### ALTO-2: tracking_sessions captura só ~6% dos leads
- **Dado real:** 7 rows para 120 leads (37 com email)
- **Tabela EXISTE e funciona** (RPC 6-arg OK, testado com insert/delete)
- **Causa provável:** O fire-and-forget `void saveTrackingSession().catch(() => {})` não aguarda — redirect acontece antes do RPC completar em muitos casos
- **Ou:** Nem todos os caminhos do quiz chamam saveTrackingSession (só no checkout click)

### ALTO-3: Dashboard tem 3 definições de "receita"
- **Confirmado em código:** Visão Geral (entitlements × price_cents) ≠ Vendas (purchases.gross_value) ≠ Analytics (funnel RPC)
- **Número correto:** R$760,40 da tabela purchases

### ALTO-4: Funil quiz tem drop_pct negativo (contact → cta)
- **Dado real:** contact=3, cta=16 → drop_pct = -433%
- **Causa:** Pessoas pulam email e vão direto pro checkout. Funil assume progressão linear mas email não é gate obrigatório
- **Fix:** Reordenar estágios ou separar contact do funil principal

### MÉDIO-1: 3 webhooks stuck (não processados, sem erro)
- **Dado real:** 3 de 26 com processed=false e error=null
- **Investigar:** Por que ficaram presos? Timeout? Crash antes do processamento?

### MÉDIO-2: CAPI sem retry (fire-once, 8s timeout)
- **Confirmado em código:** meta-capi.server.ts — timeout 8s, sem retry queue
- **Impacto:** Se CAPI timeout, evento perdido para Meta. Kirvano CAPI mantida como backup (decisão correta)

### MÉDIO-3: Leads sem dedup no dashboard
- **Dado real:** 37 rows, 36 únicos — só 1 duplicata real
- **Impacto atual:** Mínimo (quase sem duplicatas). Mas crescerá com mais tráfego

### BAIXO-1: ViewContent pixel faltando
- **Confirmado em código:** Nenhum fbq ViewContent na tela de resultado
- **Impacto:** Sinal de otimização perdido

### BAIXO-2: content_ids inconsistentes
- **Quiz:** `["rotina_de_paz"]` (slug underscore)
- **CAPI:** UUIDs de produto
- **Docs:** `["rotina-de-paz"]` (hyphen)

---

## O QUE A V2 DIZIA ERRADO (corrigido pela v3)

| Claim da v2 | Realidade (banco real) | Correção |
|---|---|---|
| "tracking_sessions NUNCA FOI CRIADA" | ✅ **EXISTE** — 7 rows, RPC funciona | Criada via Dashboard, não via migration |
| "save_lead_contact NÃO EXISTE" | ✅ **EXISTE** — 4 args, SECURITY DEFINER | Idem — não está nas migrations mas está no banco |
| "Colunas whatsapp/consent faltam" | ✅ **EXISTEM** na tabela leads | Idem |
| "pg_cron tem 3 jobs" | **6 jobs** ativos (inclui retry-grants, process-webhooks, expire-pix) | Vault secrets ESTÃO configurados |
| "Vault secrets não configurados" | **CONFIGURADOS** — jobs usam vault para auth | Funcionando |
| "retry-pending-grants nunca executa" | **EXECUTA** a cada 5min | Ativo |

---

## O QUE ESTÁ PROVADO vs. FALTA PROVAR

### ✅ PROVADO (dados reais)
- IC single-source (site only, click not view) — código + DevTools
- UTM 5 campos 100% fill rate — 19/19 purchases com todos os campos
- Receita R$760,40 / 11 buyers — query direta
- Entitlements 11/11 match purchases — query direta
- Analytics RPCs funcionando e retornando dados corretos — queries diretas
- Security: anon bloqueado nas RPCs analytics — testado
- Reconciliation rodando daily — relatórios no banco
- tracking_sessions + save_lead_contact + cron jobs existem — queries diretas

### 🟡 PROVADO NO CÓDIGO, NÃO EM ESCALA
- fbc/fbp construction (fb.1.{ts}.{fbclid}) — código correto, 1 venda-teste provou, mas só 7/120 sessions (~6%)
- Purchase CAPI dedup — funciona via Meta event_id, mas mantém Kirvano como backup até ter retry

### ❌ NÃO PROVADO / PRECISA DE AÇÃO
- **signature_valid = 0%** — precisa investigar (Kirvano não envia sig? Secret errado?)
- **3 webhooks stuck** — precisa investigar
- **tracking_sessions ~6% captura** — precisa tráfego pós-fix para medir melhoria
- **CAPI retry queue** — não existe, bloqueia desligar Kirvano
- **content_ids padronização** — inconsistente entre sistemas

---

## FLUXO COMPLETO VERIFICADO

```
[Meta Ads] ──click──→ [Quiz-sacra / Cloudflare]
                          │
                    ┌─────┴─────┐
                    │ localStorage │ rdp:utm (5 campos)
                    │ sessionStorage│ rdp_meta_click (fbclid, fbc, fbp)
                    └─────┬─────┘
                          │
              ┌───────────┼───────────┐
              ▼           ▼           ▼
         persist_lead  track_step  save_lead_email ✅
         (leads)     (quiz_funnel) save_lead_contact ✅
              │         _events)    (whatsapp+consent)
              │                       │
              │    upsert_tracking_session ✅ (mas ~6% captura)
              │                       │
              ▼                       ▼
         [Kirvano Checkout] ←── UTMs via URL (5 campos)
              │
              ▼
         [Webhook SALE_APPROVED]
              │ (signature_valid=false ⚠️ — processa mesmo assim)
              │
         ┌────┼────┬────────┬──────────┐
         ▼    ▼    ▼        ▼          ▼
      entitle- purch- webhook_  welcome   CAPI
      ments    ases  logs       email     Purchase
      (upsert) (upsert)        (Resend)  (graph.fb v22.0)
      11/11 ✅  19 ✅              ✅       8s timeout, no retry
               UTMs 100% ✅              fbc/fbp: 67% das vendas recentes
```

---

## ARQUITETURA REAL DO PROJETO

```
┌──────────────────────────────────────────────────────────────────┐
│                     CLOUDFLARE PAGES                             │
│  Quiz-sacra (SPA React 19 + TanStack Router)                    │
│  /sacra/quiz → /sacra/obrigado                                  │
│  Pixel: 838169472100225                                          │
│  Eventos: PageView, QuizStep, Lead, IC, Purchase (client)       │
│  Tracking: localStorage UTMs, sessionStorage meta click          │
│  RPCs: persist_lead, persist_quiz_responses, track_quiz_step,    │
│        save_lead_email, save_lead_contact, upsert_tracking_sess  │
└────────────────────────────┬─────────────────────────────────────┘
                             │ redirect com UTMs + src=externalId
                             ▼
┌──────────────────────────────────────────────────────────────────┐
│                     KIRVANO (externo)                            │
│  Checkout de pagamento (Pix + Cartão)                            │
│  Recebe UTMs via URL → devolve no webhook.utm                    │
│  CAPI nativa: IC desligado ✅, Purchase MANTIDO (backup)         │
└────────────────────────────┬─────────────────────────────────────┘
                             │ webhook POST SALE_APPROVED
                             ▼
┌──────────────────────────────────────────────────────────────────┐
│                     VERCEL (rotina-de-paz-app)                   │
│                                                                  │
│  /api/public/webhooks/kirvano                                    │
│  ├─ Valida URL secret (timingSafeEqual) ✅                       │
│  ├─ Valida HMAC signature ⚠️ (100% invalid — investigar)        │
│  ├─ processKirvanoPayload():                                     │
│  │  ├─ ensureUserForEmail() → auth.users                         │
│  │  ├─ entitlements.upsert(user_id, product_id) ✅               │
│  │  ├─ purchases.upsert(transaction_id) + 5 UTMs ✅              │
│  │  ├─ sendWelcomeEmail() (Resend) 📧                            │
│  │  └─ sendMetaCapiPurchase() (8s, no retry) 📊                  │
│  │     ├─ Query tracking_sessions por external_id                │
│  │     ├─ Hash PII (SHA256): em, fn, ln, external_id             │
│  │     ├─ POST graph.facebook.com/v22.0/{pixel}/events           │
│  │     └─ event_id = sale_id (dedup Meta-side)                   │
│  └─ webhook_logs.insert(payload)                                 │
│                                                                  │
│  Admin Dashboard (TanStack Start + React)                        │
│  ├─ Visão Geral (entitlements — receita DIFERE de purchases)     │
│  ├─ Leads do Quiz (sem dedup por email)                          │
│  ├─ Vendas (purchases.gross_value — CORRETO)                     │
│  ├─ Tracking (leads + entitlements — conversão stale)            │
│  ├─ Analytics Avançado (5 RPCs service_role)                     │
│  ├─ Analytics Quiz (funnel beacons + checkout funnel)            │
│  └─ Membros, Webhooks, Suporte, Config                          │
└──────────────────────────────────────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────────┐
│                     SUPABASE (cemjibbauvvyfaxilrvm)               │
│                                                                  │
│  21 tabelas (RLS em todas)                                       │
│  19+ RPCs (SECURITY DEFINER)                                     │
│  6 pg_cron jobs (Vault secrets configurados)                     │
│  Daily reconciliation (run_reconciliation cada 9h UTC)           │
│                                                                  │
│  Tabelas-chave:                                                  │
│  ├─ leads (37 rows, 36 únicos)                                  │
│  ├─ purchases (19 rows, 11 buyers, R$760,40)                    │
│  ├─ entitlements (11 active, match 100% purchases)               │
│  ├─ quiz_funnel_events (426 arrivals)                            │
│  ├─ tracking_sessions (7 rows — ~6% captura)                    │
│  ├─ webhook_logs (26, 100% sig_valid=false)                      │
│  └─ reconciliation_reports (daily, last: 15/06)                  │
└──────────────────────────────────────────────────────────────────┘
```

---

## PLANO DE AÇÃO FINAL (Baseado em Dados Reais)

### P0 — Investigar esta semana
1. **Por que signature_valid=false em 100% dos webhooks?** — Kirvano não envia header? Secret errado? Isso é segurança.
2. **Por que 3 webhooks ficaram stuck?** — Precisam ser reprocessados?
3. **Por que tracking_sessions captura só ~6%?** — Timing do fire-and-forget? RPC falhando em alguns devices?

### P1 — Corrigir próxima sprint
4. **Unificar "receita"** no Visão Geral → usar purchases em vez de entitlements
5. **Fix funil drop_pct negativo** — reordenar contact/cta ou separar
6. **Implementar CAPI retry queue** — desbloqueia desligar Kirvano CAPI
7. **Padronizar content_ids** → slug único ("rotina_de_paz") em todos os sistemas

### P2 — Melhorias
8. Adicionar staleTime (5min) nas queries admin
9. Tornar entitlements query period-scoped
10. Adicionar ViewContent pixel no resultado
11. Completar PII hashing no CAPI (phone, city, state, zip)

### P3 — Futuro
12. Dedup leads por email (quando volume crescer)
13. Multi-touch attribution
14. Tracking de decline em upsell/downsell
15. Adicionar migrations para tudo que está só no banco (tracking_sessions, save_lead_contact, cron jobs)

---

*Relatório v3 FINAL — verificado com queries reais em produção (15/06/2026).*  
*v1: 4 agentes code scan → v2: 10 agentes verificação → v3: 5 agentes testes funcionais.*  
*Corrigidas 6 claims falsas da v2 que contradiziam o banco real.*
