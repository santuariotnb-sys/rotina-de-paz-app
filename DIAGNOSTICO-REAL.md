# DIAGNÓSTICO REAL — Auditoria Passada 1
> **Data:** 2026-06-15 | **Projeto:** cemjibbauvvyfaxilrvm | **Pixel:** 838169472100225  
> **Método:** 5 agentes paralelos, fontes vivas (banco via service_role, código dos 3 repos)  
> **Linha de corte produção:** 2026-06-14

---

## CONFIRMAÇÃO §2 — Tudo verificado contra fonte viva

| Claim | Resultado | Fonte |
|-------|-----------|-------|
| 19 purchases | ✅ count=19 | `purchases` via PostgREST |
| 11 compradores únicos | ✅ 11 emails, 11 user_ids | `purchases` DISTINCT |
| R$760,40 receita | ✅ SUM=76040 centavos | `purchases.gross_value` |
| 121 leads | ✅ count=121 | `leads` via PostgREST |
| tracking_sessions existe | ✅ 7 rows | PostgREST query |
| save_lead_contact RPC | ✅ callable por anon | RPC test |
| whatsapp/consent em leads | ✅ colunas existem | information_schema |
| webhook_logs + signature_valid | ✅ 26 rows, boolean col | PostgREST query |
| REVOKE anon writes | ✅ 42501 em todas tabelas | INSERT test via anon key |
| 6 cron jobs | ⚠️ **SÓ 3 encontrados** | cron.job (cleanup-webhook-logs, cleanup-tracking-sessions, daily-reconciliation) |
| ph no Purchase committed | ✅ código envia ph hasheado | meta-capi.server.ts:111-113 (sem normalização E.164 estrita) |

---

## TABELA-MESTRE DE DIVERGÊNCIAS

### 🔴 P0 — Engana decisão de dinheiro (ROAS, receita, persona, dedup, fbc)

| # | Métrica/Elo | Fonte | Provado contra | Bug | Causa raiz | Fix proposto |
|---|------------|-------|----------------|-----|-----------|-------------|
| P0-1 | **fbc double-wrap** | meta-capi.server.ts:119-121 | código + webhook_logs backup (cookies.fbclid já vem `fb.1.*`) | `cookies.fbclid` já em formato fbc é re-empacotado em `fb.1.{now}.fb.1.{old}.{id}` | Fallback cego: `fb.1.${Date.now()}.${cookieFbclid}` sem checar se já é fbc | Checar `cookieFbclid.startsWith('fb.1.')` antes de empacotar |
| P0-2 | **Purchase dedup QUEBRADA** | meta-capi.server.ts + Quiz-sacra/obrigado.tsx | código dos 2 repos | ≥2 emissores com event_ids diferentes (nossa CAPI = sale_id, Kirvano CAPI = ID interno) | Kirvano tem CAPI própria ligada; event_ids não casam | Desligar Kirvano CAPI no dashboard (só após retry nosso estar no ar) |
| P0-3 | **Persona × conversão cega** | 3 RPCs analytics (top_segments, quiz_conversion, cohort_weekly) | 20260531_analytics_rpcs.sql:34 | Join `lower(l.email)=lower(p.buyer_email)` falha com email NULL (captura agora é WhatsApp) | Troca de email → WhatsApp sem atualizar join key | Trocar join para `external_id`/`src` (qs_) |
| P0-4 | **src/external_id NÃO gravado em purchases** | kirvano.server.ts:296-311 | código | utm.src extraído mas não persistido na tabela purchases | Campo não existe em purchases | Adicionar coluna `src` em purchases, gravar no webhook |
| P0-5 | **3 definições de receita** | admin.index.tsx:34-57 vs admin.vendas.tsx:64 vs RPCs | código dos 3 locais | Visão Geral = `entitlements × products.price_cents` (ERRADO), Vendas = `purchases.gross_value` (CERTO), Analytics = RPC | Cada tela calcula diferente | Unificar via VIEW `vendas_reais` |
| P0-6 | **"840 leads" = quiz_responses (inflado ~7x)** | queries.ts:15 | código + banco (847 responses vs 121 leads) | Conta rows de quiz_responses (7 per lead) em vez de leads | `persist_quiz_responses` grava 1 row/pergunta | Trocar para `COUNT(*)` de `leads` |
| P0-7 | **analytics_quiz_conversion double-count** | 20260531_analytics_rpcs.sql:113 | código SQL | `COUNT(p.id)` conta purchases (multi-produto), não leads convertidos | JOIN lead↔purchase multiplica | `COUNT(DISTINCT l.id) FILTER (WHERE p.id IS NOT NULL)` |
| P0-8 | **analytics_top_segments fan-out** | 20260531_analytics_rpcs.sql:28-31 | código SQL | LEFT JOIN infla COUNT(*) e SUM(revenue) quando lead tem múltiplas purchases | Sem DISTINCT no aggregate | Usar subquery ou DISTINCT |
| P0-9 | **Poluição de teste no pixel** | meta-capi.server.ts:21 + index.html:9-18 | código | 273 eventos vs 19 reais; sem test_event_code fixo, sem domain guard | Dev/teste manda pro pixel real | Pixel de teste separado + domain guard + `is_test` no banco |

### 🟠 P1 — Dados incorretos mas não engana ROAS diretamente

| # | Métrica/Elo | Fonte | Bug | Causa raiz | Fix proposto |
|---|------------|-------|-----|-----------|-------------|
| P1-1 | **"Arquétipos 0"** na Visão Geral | queries.ts:21 | Lê `quiz_responses.archetype` (sempre NULL nos novos) | Arquétipo está em `leads.archetype` | Trocar query para `leads` |
| P1-2 | **Tracking conversion usa entitlements** | admin.tracking.tsx:78-86 | Grants manuais contam como conversão orgânica | Deveria usar `purchases` | Trocar para purchases |
| P1-3 | **Quiz journeyFunnel.converted = entitlements** | admin.quiz.tsx:232-240 | Mesmo que P1-2 + email=NULL | Entitlements ≠ conversão real | Trocar para purchases + join por src |
| P1-4 | **IC match 6.5/10** (só 25% com em/ph) | Quiz-sacra/tracking.ts:119-155 + QuizApp.tsx:478 | IC dispara antes do contact gate → sem user_data | Advanced Matching só ativa após contato | Mover IC para após contact gate ou passar dados salvos |
| P1-5 | **PII sem scrub em webhook_logs** | kirvano.ts:42-51 | Payload completo com CPF/phone/email armazenado raw | Sem sanitização | Scrub de PII antes de gravar |
| P1-6 | **Sem retry CAPI** | meta-capi.server.ts:163-176 | Single fetch com 8s timeout, sem dead-letter | Falha silenciosa | Implementar retry queue |
| P1-7 | **content_ids inconsistente** | tracking.ts:142 (`rotina_de_paz`) vs meta-capi.server.ts:143 (UUIDs) | Client = slug underscore, Server = UUID | Sem padrão definido | Unificar para slug padronizado |
| P1-8 | **contact_gate descartado** | QuizApp.tsx:344 | Envia `contact_gate` mas DB CHECK só aceita `contact` | Enum desatualizado na migration 002 | Adicionar `contact_gate` ao CHECK |
| P1-9 | **Sem side-effect dedup no webhook** | kirvano.server.ts:254-267 | Webhooks paralelos → emails e CAPI duplicados | DB protege dados mas não side-effects | Lock ou flag `capi_sent` |

### 🟡 P2 — Melhorias / riscos baixos

| # | Item | Detalhe | Fix |
|---|------|---------|-----|
| P2-1 | ViewContent não existe | Nenhum evento VC em nenhum repo | Implementar client + server |
| P2-2 | Localhost leak (6 eventos) | `index.html` carrega pixel sem domain guard | `if (hostname !== 'localhost')` |
| P2-3 | fn não enviado no Advanced Matching | QuizApp.tsx:478-482 tem `name` mas não passa como `fn` | Adicionar `fn` |
| P2-4 | fbc/fbp não no re-init | QuizApp.tsx:478-482 não passa fbc/fbp no `fbq('init')` | Adicionar |
| P2-5 | Double `fbq('init')` | index.html:17 + QuizApp.tsx:478 | Remover do index.html, manter dinâmico |
| P2-6 | `p_version` ignorado pela RPC | QuizApp.tsx:190 envia mas RPC não aceita | Adicionar param ou remover envio |
| P2-7 | external_id sem TTL no localStorage | tracking.ts | Adicionar expiração |
| P2-8 | ph sem normalização E.164 estrita | meta-capi.server.ts:111-113 | Normalizar com `+55` antes de hash |
| P2-9 | kirvano_offer_id só grava o primeiro | kirvano.server.ts:243 | Gravar array ou multiple rows |
| P2-10 | analytics.ts dead code | analytics.ts:1-100 usa anon (revogado) | Deletar arquivo |
| P2-11 | Admin pages usam anon client para reads | admin.vendas/tracking/leads/quiz | Migrar para server functions |

---

## DRIFT: BANCO vs MIGRATIONS

| Item | No banco | Nas migrations | Risco |
|------|----------|---------------|-------|
| tracking_sessions (7 rows) | ✅ | ❌ | ALTO — `db reset` perde |
| quiz_funnel_events (1663 rows) | ✅ | ❌ | ALTO |
| app_products (6 rows) | ✅ | ❌ | MÉDIO |
| offer_settings (4 rows) | ✅ | ❌ | MÉDIO |
| product_offers (7 rows) | ✅ | ❌ | MÉDIO |
| processed_events (0 rows) | ✅ | ❌ | BAIXO |
| risk_events (19 rows) | ✅ | ❌ | BAIXO |
| track_quiz_step (RPC) | ✅ | ❌ | ALTO |
| track_checkout_step (RPC) | ✅ | ❌ | ALTO |
| save_lead_contact (RPC) | ✅ | ❌ | ALTO |
| **checkout schema inteiro** (15 tabelas, 3 RPCs) | ✅ | ❌ | CRÍTICO |

---

## CRON JOBS (3, não 6)

| Job | Schedule | Comando | Status |
|-----|----------|---------|--------|
| cleanup-webhook-logs | `0 3 * * *` | DELETE webhook_logs > 90 dias | ✅ ativo |
| cleanup-tracking-sessions | `0 3 * * *` | DELETE tracking_sessions > 30 dias | ✅ ativo |
| daily-reconciliation | `0 9 * * *` | SELECT run_reconciliation(24) | ✅ ativo (última: 2026-06-15 09:00 UTC) |

---

## RESUMO EXECUTIVO

**9 bugs P0** — todos enganalm decisão de dinheiro:
- **fbc double-wrap** → EMQ degradado, Meta não casa cliques com conversões
- **Purchase dedup quebrada** → ROAS inflado (273 vs 19 eventos reais)
- **Persona × conversão cega** → segmentação/coorte inútil desde a troca pra WhatsApp
- **3 receitas diferentes** → impossível saber o número real numa olhada
- **Leads inflados 7x** → todas taxas de conversão erradas
- **Poluição de teste** → ML do Meta treinando com lixo

**9 bugs P1** + **11 itens P2** documentados acima.

**Drift crítico:** checkout schema inteiro + 7 tabelas + 3 RPCs existem só no banco (não nas migrations).

---

> 🛑 **CHECKPOINT PASSADA 1 — Aguardando OK do dono para Passada 2.**
