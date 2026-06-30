# Análise da estrutura do ADMIN — "Rotina de Paz" / Primordia

**Data:** 2026-06-30
**Repo analisado:** `/Users/guilhermehenrique/rotina-de-paz-app` (produção, Vercel)
**Método:** leitura direta do código (rotas `src/routes/admin.*`, server functions `src/lib/admin/`, migrations `supabase/migrations/`). Toda afirmação tem evidência `arquivo:linha`. O que não consegui confirmar está marcado **[NÃO VERIFICADO]**.

> Nota de naming: a marca interna do painel é **"Primordia"** (ver `admin.tsx:11`, `admin.login.tsx:12`), embora o app/produto seja "Rotina de Paz". Mesmo painel.

---

## 0. Resumo da arquitetura de acesso a dados

Há **dois caminhos** de leitura/escrita no admin, e isso é central para o dashboard de funil:

1. **Cliente do browser** (`supabase` de `@/integrations/supabase/client`) — roda como o usuário autenticado (JWT do admin). Depende de **RLS** com `public.is_admin(auth.uid())`. Usado na maioria das rotas-tabela (leads, vendas, tracking, acessos, clientes, membros, conteúdo).
2. **Server function** (`createServerFn` + `requireSupabaseAuth` + `assertAdmin`, usando `supabaseAdmin` = **service_role**) — bypassa RLS, roda no servidor Vercel. Usado para: overview KPIs, analytics avançado, funis (quiz/checkout/full), CRM, replay de webhook, conversão de leads.

A **fronteira de confiança** do segundo caminho é:
- `requireSupabaseAuth` (middleware) valida o JWT → injeta `context.userId`.
- `assertAdmin(context.userId)` (`src/lib/admin/server-auth.ts:3-11`) consulta `admin_users` via service_role; sem linha → `throw "Acesso negado"`.

As RPCs de analytics (`analytics_*`) são **`SECURITY DEFINER` e só têm GRANT para `service_role`** (ex.: `20260611_analytics_quiz_funnel.sql:90-93`), logo **só são chamáveis via server function** — nunca direto do browser.

---

## 1. Rotas do admin (todas)

Menu lateral em ordem (`src/components/admin/AdminSidebar.tsx`, ~linhas 36-54):
Visão Geral · Áudios do Método · Louvores · Cursos & Devocionais · E-books · Produtos & Kirvano · Acessos & Entitlements · Clientes · Webhooks · Leads do Quiz · Analytics Quiz · Membros · Vendas · Tracking · Analytics Avançado · CRM · Suporte · Configurações.

Arquivos: 19 rotas `src/routes/admin.*.tsx` + layout `admin.tsx` + `admin.login.tsx`.

### 1.1 `admin.tsx` — Layout pai / guard (ver §2)
### 1.2 `admin.login.tsx` — Login (ver §2)

### 1.3 `admin.index.tsx` → `/admin` — Visão Geral (painel de comando)
- **Função:** primeira tela do dono. KPIs de vendas + leads + membros + distribuição de arquétipos.
- **Acesso:** server function `getOverviewKpis` (`admin.index.tsx:23-27`), service_role.
- **Lê** (`src/lib/admin/overview.functions.ts:27-34`): view `leads_reais` (count total, count hoje, breakdown de `archetype`), `profiles` (count membros), view `vendas_reais` (`gross_value` total e hoje).
- **Métricas/fórmulas:**
  - `totalRevenue = Σ vendas_reais.gross_value / 100` (`overview.functions.ts:42`).
  - `revenueToday`: idem com filtro `created_at >= hoje 00:00 BRT` (corte em `todayISO = data SP + "T03:00:00Z"`, `overview.functions.ts:22-23`).
  - `totalPurchases = vendas_reais.length`; `leadsToday`/`totalLeads` via `count: exact, head: true`.
- **Exibe:** `KpiCard` (Vendas de hoje, Vendas totais, Leads do quiz, Membros, Leads hoje, Arquétipos) + barra de distribuição de arquétipos. Export CSV dos arquétipos.

### 1.4 `admin.vendas.tsx` → `/admin/vendas` — Faturamento
- **Função:** receita aprovada pela Kirvano, funil por tipo de oferta, receita por produto, lista de vendas.
- **Acesso:** **browser client** direto na view (`admin.vendas.tsx:76-84`).
- **Lê:** `vendas_reais` (`id, transaction_id, product_name, product_type, gross_value, status, buyer_email, kirvano_offer_id, created_at`), filtro `created_at >= since`, limit 500.
- **Métricas (calculadas no front):**
  - `revenue = Σ gross_value WHERE status='confirmed'`; `aov = revenue / approved` (`admin.vendas.tsx:90-104`).
  - `funnelStats` por `product_type` (principal/order_bump/upsell/downsell): count e revenue por tipo, % da receita (`admin.vendas.tsx:107-121`, `248-251`).
  - `byProduct`: agrega receita por `product_name`, ordena desc (`admin.vendas.tsx:124-140`).
- ⚠️ Nota: a view `vendas_reais` já é `status='confirmed' AND is_test=false AND pós-produção` (ver §3), mas o front **re-filtra** `status==='confirmed'` e ainda conta `refunded/chargeback` — que **não existem em `vendas_reais`** (a view só traz confirmed). Logo `kpis.refunded` aqui tende a 0 sempre. **[parcial]** Estornos reais só aparecem em `purchases`/`analytics_revenue_breakdown`, não nesta view.

### 1.5 `admin.leads.tsx` → `/admin/leads` — Leads do Quiz
- **Função:** distribuição e listagem de leads capturados pelo Quiz Sacra.
- **Acesso:** browser client (`admin.leads.tsx:66-75`).
- **Lê:** `leads_reais` (`id, name, email, whatsapp, archetype, desire, situation, risk_flag, utm_source, utm_campaign, created_at`), `created_at >= since`, limit 1000.
- **Métricas (front):** total, hoje, `risk_flag=true`, com WhatsApp; donut por arquétipo; barras empilhadas leads/dia × arquétipo. Export CSV.

### 1.6 `admin.tracking.tsx` → `/admin/tracking` — Fontes de tráfego
- **Função:** UTMs/plataformas/campanhas/criativos por lead + **taxa de conversão por lead**.
- **Acesso:** browser client para leads (`admin.tracking.tsx:113-121`) + server function `getConvertedLeadIds` para o set de conversões (`admin.tracking.tsx:127-131`).
- **Lê:** `leads_reais` (com colunas UTM completas); `getConvertedLeadIds` lê `vendas_reais.src` e `leads_reais.external_id` (`src/lib/admin/conversion.functions.ts:18-39`).
- **Lógica de conversão:** join **`leads_reais.external_id = vendas_reais.src`** (qs_*). `didConvert(lead) = convertedSet.has(lead.id)` (`admin.tracking.tsx:133-136`).
- **Métricas (front):** breakdown por plataforma (normaliza utm_source → Meta Ads/Google/TikTok/Direto, `admin.tracking.tsx:62-70`); top campanhas (limpa IDs Meta de utm_medium); top criativos (utm_content); matriz arquétipo×plataforma; `rate = converted/total` (`admin.tracking.tsx:153`).

### 1.7 `admin.quiz.tsx` → `/admin/quiz` — Analytics Quiz ⭐ (FUNIL JÁ EXISTE AQUI)
- **Função:** análise do quiz + **3 funis instrumentados** (quiz, checkout, full LP→compra).
- **Acesso:** browser client (respostas e leads) + **3 server functions de funil**.
- **Lê:**
  - `quiz_responses` (browser, `admin.quiz.tsx:88-94`, limit 5000), `leads_reais` (browser, `:103-109`).
  - `getQuizFunnel` → RPC `analytics_quiz_funnel` (`quiz-funnel.functions.ts:21-24`).
  - `getCheckoutFunnel` → RPC `analytics_checkout_funnel` (`checkout-funnel.functions.ts:24-27`).
  - `getFullFunnel` → RPC `analytics_full_funnel` (`checkout-funnel.functions.ts:38-41`).
  - `getConvertedLeadIds` (conversão por arquétipo).
- **Métricas:** completion rate do quiz (lead com ≥7 respostas, `admin.quiz.tsx:148-156`), distribuição por pergunta, conversão por arquétipo.
- **Este é o ponto de plug mais natural do dashboard de gargalos** (ver §6).

### 1.8 `admin.analytics.tsx` → `/admin/analytics` — Analytics Avançado
- **Função:** lead campeão / nicho vencedor / funil de conversão / receita / cohort.
- **Acesso:** 5 server functions (`admin.analytics.tsx:71-94`), todas service_role.
- **Lê (via `src/lib/admin/analytics.functions.ts`):** RPCs `analytics_funnel`, `analytics_top_segments`, `analytics_revenue_breakdown`, `analytics_quiz_conversion`, `analytics_cohort_weekly`.
- **Funil exibido** (`admin.analytics.tsx:98-108`): Leads → Quiz completo (with_archetype) → Com WhatsApp → Compraram → Upsell → Downsell. **Começa em Lead** (não tem LP/quiz-start/checkout) — esse é o gap que o full funnel preenche.
- **Top Segmentos:** mínimo 20 leads/segmento (`analytics.functions.ts:29`); `conv_rate`, `revenue` por (arquétipo × situação × desejo).
- **Cohort semanal:** leads/buyers/revenue/conv por semana.

### 1.9 `admin.webhooks.tsx` → `/admin/webhooks` — Webhook Logs
- **Função:** todo evento Kirvano recebido (válido/inválido, processado/não) + status CAPI + replay manual.
- **Acesso:** browser client (`admin.webhooks.tsx:37-42`) + server function `replayWebhookLog`.
- **Lê:** `webhook_logs` (limit 100, inclui `capi_status/capi_error/capi_retries/capi_last_attempt`).
- **Métrica:** "Vendas no Meta (CAPI)" = `capiSent / capiAttempts` onde `capi_status != null` (`admin.webhooks.tsx:55-58`).

### 1.10 `admin.acessos.tsx` → `/admin/acessos` — Acessos & Entitlements ⭐ (LIBERAÇÃO)
- **Função:** quem tem acesso a quê; conceder/revogar manualmente (bypass Kirvano).
- **Acesso:** browser client + RPC.
- **Lê:** `entitlements` (`admin.acessos.tsx:44`), `products` (`:35`), `profiles` (`:57`).
- **Escreve:**
  - **Conceder:** RPC `grant_entitlement_manual({_email, _product_id})` (`admin.acessos.tsx:167`).
  - **Revogar:** `entitlements.update({status:'revoked', revoked_at})` direto (`admin.acessos.tsx:67`).
  - Toda ação chama `logAdminAction(...)` (auditoria).

### 1.11 `admin.produtos.tsx` → `/admin/produtos` — Produtos & Kirvano
- **Função:** catálogo de produtos + vínculo de ofertas Kirvano + variações de preço.
- **Acesso:** browser client. **Escreve:** `products` (CRUD), `product_kirvano_offers` (link/unlink), `product_offers` (variações). *(via Explore — `admin.produtos.tsx:62,72,330,528,633…`)*

### 1.12 `admin.clientes.tsx` → `/admin/clientes` — Clientes
- **Função:** todos os profiles + entitlements; conceder acesso manual.
- **Acesso:** browser client; RPC `grant_entitlement_manual` (`admin.clientes.tsx:241`). Lê `profiles`, `entitlements`, `products`.

### 1.13 `admin.membros.tsx` → `/admin/membros` — Membros
- **Função:** membros pagantes com produtos ativos; conceder/revogar.
- **Acesso:** browser client. Lê `profiles`, `entitlements`, `products`; revoga via `entitlements.update({status:'revoked'})` (`admin.membros.tsx:330`); concede via RPC (`:301`).

### 1.14 `admin.crm.tsx` → `/admin/crm` — CRM
- **Função:** segmentação de leads/compradores e envio de campanhas de email.
- **Acesso:** server functions `getCrmSegments`, `sendCrmTestEmail`, `sendCrmCampaign` (`admin.crm.tsx:63-65`; `src/lib/admin/crm.functions.ts`).

### 1.15 `admin.suporte.tsx` → `/admin/suporte` — Suporte
- **Função:** tickets de suporte; responder/fechar + notificações por email.
- **Acesso:** browser client (`support_tickets`, `support_messages`, `profiles`) + server functions de notificação.

### 1.16 `admin.config.tsx` → `/admin/config` — Configurações
- **Função:** integração Kirvano (status webhook), juros/parcelas do checkout, teste de webhook.
- **Acesso:** server functions `getIntegrationStatus`, `sendTestWebhook`; browser client lê `products` e `checkout.checkout_config`.

### 1.17–1.20 Conteúdo (`admin.audios`, `admin.louvores`, `admin.cursos`, `admin.ebooks`)
- **Função:** CRUD de conteúdo gated por produto. Browser client + Storage buckets (`method-audios`, `louvores-audios`, `course-videos`, `ebooks-files`). Tabelas: `audio_tracks`, `louvores`, `courses`/`course_lessons`, `ebooks` (todas com `required_product_id` → gating por entitlement).

---

## 2. Layout e autenticação do admin

- **Layout pai:** `src/routes/admin.tsx` (`createFileRoute("/admin")`, `:8`). Renderiza `AdminSidebar` + `AdminTopbar` + `<Outlet/>`.
- **Guard (client-side, em `useEffect`):** `admin.tsx:38-62`:
  - Se rota for `/admin/login` → pula o gate.
  - Senão chama `getCurrentAdmin()`; se `null` → `navigate("/admin/login")`.
  - `onAuthStateChange`: se sessão cair → volta pro login.
- **`getCurrentAdmin()`** (`src/lib/admin/auth.ts:16-31`): `supabase.auth.getUser()` → RPC `is_admin(_user_id)` → SELECT em `admin_users`. Roda no **browser**; seguro porque RLS de `admin_users` só deixa admin ler.
- **Login** (`admin.login.tsx:43-53`): `signInWithPassword` → `getCurrentAdmin()`; se não-admin, `signOut()` + erro. Sucesso → `logAdminAction("admin.login")`.
- **Guard server-side (a verdadeira fronteira):** `assertAdmin(userId)` em **toda** server function (`server-auth.ts:3-11`), via service_role em `admin_users`.
- **RLS:** `is_admin(auth.uid())` aparece em policies de `leads`, `products`, `entitlements`, `webhook_logs`, etc. (ex.: `20260528111216_*.sql:93-104,133-144`).

⚠️ **Observação crítica:** o guard de UI é **só client-side** (`useEffect`). A proteção real dos dados é **RLS + assertAdmin**, não a rota. `meta robots noindex,nofollow` em `admin.tsx:12`. Isso é adequado, mas vale lembrar ao plugar o dashboard: **toda leitura nova de funil deve passar por server function + assertAdmin** (as RPCs já são service_role-only).

---

## 3. Modelo de dados central

### Tabelas-base
| Tabela | Colunas-chave | Papel |
|---|---|---|
| `leads` | `id, name, email, whatsapp(*), archetype, scores(jsonb), desire, situation, risk_flag, utm_*, fbclid, gclid, **external_id**(qs_*), is_test, created_at` | Lead do quiz. `external_id` = chave de join com purchase/tracking. (`20260528141454_*.sql:7-26`, `20260616_intelligence_is_test.sql:35`) |
| `purchases` | `transaction_id, user_id, product_name, product_type, gross_value(cents), status, buyer_email, kirvano_offer_id, **src**(qs_*), lead_id, utm_*, is_test, metadata, created_at` | Venda (analytics). `src` = `external_id` do lead. (`20260616_intelligence_is_test.sql:8,39`; `20260531_purchases_table.sql`) |
| `entitlements` | `user_id, product_id, source('kirvano'\|'manual'\|'migration'), status('active'\|'refunded'\|'canceled'\|'pending'), kirvano_transaction_id, kirvano_offer_id, buyer_email, granted_at, revoked_at, **UNIQUE(user_id,product_id)**` | **Acesso liberado dentro do app.** (`20260528111216_*.sql:67-82`) |
| `products` | `id, slug, name, price_cents, status, kind` | Catálogo. (`20260528111216_*.sql:6-19`) |
| `product_kirvano_offers` | `product_id, kirvano_offer_id(UNIQUE), label` | Mapa oferta Kirvano → produto. (`:44-50`) |
| `profiles` | `user_id, email, name, archetype, …` | Conta do app (1:1 `auth.users`). |
| `webhook_logs` | `source, event_type, payload(jsonb), signature_valid, processed, error, request_ip, capi_status, capi_error, capi_retries, capi_last_attempt, created_at` | Auditoria de webhooks Kirvano + status CAPI. (`20260528111216_*.sql:111-123` + `20260616_capi_retry.sql`) |
| `quiz_responses` | `lead_id, question_key, answer_value, answer_text, time_to_answer, created_at` | Respostas individuais do quiz. |
| `quiz_funnel_events` | `session_id, stage('arrival'\|'question'\|'contact'\|'contact_gate'\|'result'\|'offer'\|'cta'), question_key, quiz_version, is_test, created_at` | **Instrumentação do funil do quiz** (gravado por RPC `track_quiz_step`). (`20260617_fix_contact_gate_*.sql:27-49`) |
| `checkout.checkout_funnel_events` | `session_id, stage('view'\|'form_start'\|'identity'\|'method'\|'payment_info'\|'submit'\|'purchase'), created_at` | **Instrumentação do funil de checkout** (schema `checkout`). (`20260611_analytics_checkout_funnel.sql:43-46`) |
| `tracking_sessions` | `external_id(qs_*), fbp, fbc, fbclid, user_agent, client_ip[NÃO VERIFICADO no DDL]` | Dados de tracking Meta por sessão. Join por `external_id`. (`20260605_hardening_rpcs.sql:107`; `20260614_reconciliation_job.sql:84-90`) **[DDL de criação não localizado nas migrations deste repo — NÃO VERIFICADO]** |
| `admin_users` | `id, user_id, email, name, role` | Lista de admins. RLS protege. |
| `checkout_config` | `key, value, description` | Config global; chave `production_start_at='2026-06-08T00:00:00Z'` = linha de corte. (`20260616_intelligence_is_test.sql:12-20`) |

### Views canônicas (fonte única de verdade)
`20260616_intelligence_is_test.sql:71-80`:
```sql
vendas_reais = purchases WHERE status='confirmed' AND is_test=false
               AND created_at >= production_start_at
leads_reais  = leads     WHERE is_test=false
               AND created_at >= production_start_at
```
- `security_invoker=on` + REVOKE anon (`20260629_fix_pii_leak_views.sql:30-34`) — fecha vazamento de PII; admin lê via RLS/service_role.

### RPC de receita
`receita_real() = Σ vendas_reais.gross_value / 100` (`20260616_intelligence_is_test.sql:83-87`). **R$, não centavos.**

### RPCs de analytics (todas service_role-only, `SECURITY DEFINER`)
Em `20260616_fix_analytics_rpcs.sql`:
- `analytics_funnel(p_days)` → total_leads, with_archetype, with_whatsapp, purchasers (distinct buyer_email, product_type='principal'), upsell_buyers, downsell_buyers, total_revenue. **Join lead↔venda por buyer_email aqui, não por src.**
- `analytics_top_segments(p_days, p_min_leads)` → join `leads_reais.external_id = vendas_reais.src`, agrega por (arquétipo, situação, desejo); `conv_rate`, `revenue`.
- `analytics_revenue_breakdown(p_days)` → por produto/tipo: sales, revenue, refunds (lê `purchases` direto + filtro is_test/baseline).
- `analytics_quiz_conversion(p_days)`, `analytics_cohort_weekly(p_weeks)` → join por `external_id=src`.

Funis instrumentados:
- `analytics_quiz_funnel(p_days)` (`20260611_analytics_quiz_funnel.sql` + fix `20260617`): arrival → Q1..Q7 → contact/contact_gate → cta. **Coorte única por `session_id`** de `quiz_funnel_events`; `drop_pct` via `lag()`.
- `analytics_checkout_funnel(p_days)`: view → form_start → identity → method → payment_info → submit → purchase (de `checkout.checkout_funnel_events`).
- `analytics_full_funnel(p_days)`: **q_arrival → q_q1 → q_q7 → q_contact → q_cta → c_view → c_identity → c_submit → c_purchase** — junta quiz + checkout por `session_id`. (`20260611_analytics_checkout_funnel.sql:82-178`)

**Relacionamentos (joins reais):**
- **Lead ↔ Venda (atribuição):** `leads.external_id = purchases.src` (qs_*). Usado em conversion/top_segments/quiz_conversion/cohort.
- **Lead ↔ Venda (volume):** `analytics_funnel` usa `buyer_email` (DISTINCT) — método **diferente**, atenção a inconsistência (§6).
- **Compra ↔ Tracking Meta:** `purchases.src = tracking_sessions.external_id` (reconciliação CAPI, `20260614_reconciliation_job.sql`).
- **Funil:** `quiz_funnel_events.session_id = checkout_funnel_events.session_id` — coorte instrumentada (≠ external_id).
- **Entitlement ↔ User/Product:** FKs `entitlements.user_id→auth.users`, `entitlements.product_id→products`.
- **Oferta Kirvano ↔ Produto:** `product_kirvano_offers.kirvano_offer_id` → `product_id`.

---

## 4. Fluxo de liberação de produtos (compra → acesso no app)

Existem **dois caminhos**, ambos terminam em `entitlements`:

### A) Automático (webhook Kirvano) — caminho principal
1. Kirvano → `POST /api/public/webhooks/kirvano` (`src/routes/api/public/webhooks/kirvano.ts`).
2. Auth: secret na URL `?k=` (constant-time) + HMAC-SHA256 (ou token plano) — `kirvano.server.ts:10-30`; se sem assinatura, processa mesmo assim (URL não-adivinhável + rate-limit de falhas). Rate-limit: ≥10 falhas/60s por IP → 429.
3. Log em `webhook_logs` **antes** de processar (`kirvano.ts:135`).
4. `processKirvanoPayload` (`kirvano.server.ts:189-398`):
   - Evento aprovado (`SALE_APPROVED` etc.) ou revoke (`SALE_REFUNDED`/chargeback/canceled) — `kirvano.server.ts:38-55`.
   - Extrai offer_ids/email/txId → resolve produtos via `product_kirvano_offers` (`:207-211`).
   - `ensureUserForEmail`: acha por `profiles.email` ou cria user via `auth.admin.createUser` ou recupera por RPC `get_user_id_by_email` (`:139-164`).
   - **Aprovado:** upsert em `entitlements` `onConflict:'user_id,product_id'` com `status='active', source='kirvano'` — **não re-ativa entitlement `refunded`** (`:222-253`). Idempotente.
   - Envia welcome email; registra `purchases` (analytics, com `src`/`lead_id` resolvidos por `utm.src`); dispara Meta CAPI Purchase (`:271-367`).
   - **Revoke:** `entitlements.update({status:'refunded', revoked_at})` + marca `purchases` como refunded (`:371-395`).
5. Webhook atualizado com `processed` + `capi_status`. Falha transiente → 500 (Kirvano retenta; upsert idempotente protege).

### B) Manual (admin) — bypass
- Rotas: **`/admin/acessos`**, **`/admin/clientes`**, **`/admin/membros`**.
- Conceder: RPC `grant_entitlement_manual(_email, _product_id)` (`20260528114104_*.sql:28-53`): exige `is_admin(auth.uid())`; resolve `profiles` por email (lança `user_not_found` se não há conta); insere `entitlements` `source='manual', status='active'`, metadata `granted_by`.
  - ⚠️ Pré-requisito: **o aluno precisa já ter conta** (profile com mesmo email). Diferente do webhook, que cria a conta.
- Revogar: `entitlements.update({status:'revoked'})` direto (`admin.acessos.tsx:67`, `admin.membros.tsx:330`).

### Como o acesso "vale" no app
- `has_entitlement(_product_id)` (`20260528114104_*.sql:10-25`): `true` se admin, ou existe `entitlements` `status='active'` do user para o produto.
- Conteúdo gated por `required_product_id` (`ebooks`, `courses`; áudios/louvores por `product_id`).
- ⚠️ **Inconsistência de status:** webhook revoke grava `status='refunded'`; admin grava `status='revoked'`. `has_entitlement` só checa `='active'`, então ambos cortam acesso — mas relatórios que filtram por status específico precisam considerar os dois valores. (`'revoked'` **nem está** no CHECK do schema: `CHECK (status IN ('active','refunded','canceled','pending'))` — `20260528111216_*.sql:72`). **[possível bug latente — o UPDATE com 'revoked' violaria o CHECK constraint]** — verificar se o constraint foi alterado em migration posterior. **[NÃO VERIFICADO]**

---

## 5. Analytics existentes vs. faltantes

### Já existe hoje
- **Receita:** `receita_real()`, overview (`vendas_reais`), `/admin/vendas` (AOV, por tipo, por produto), `analytics_revenue_breakdown` (com refunds).
- **Leads:** contagem total/hoje, por arquétipo, por dia, risco, WhatsApp (`/admin/leads`, overview).
- **Conversão lead→venda:** por lead (tracking), por arquétipo×situação×desejo (top_segments), por resposta de quiz (quiz_conversion), cohort semanal.
- **Funis instrumentados (⭐ já implementados e renderizados em `/admin/quiz`):**
  - Quiz: arrival → Q1..Q7 → contact → cta.
  - Checkout: view → form_start → identity → method → payment_info → submit → purchase.
  - **Full (LP/quiz → compra):** q_arrival…q_cta → c_view…c_purchase. **Já existe `analytics_full_funnel`.**
- **CAPI / Meta:** % de vendas enviadas ao Meta (`/admin/webhooks`); reconciliação webhook↔purchase↔tracking (`20260614_reconciliation_job.sql`).
- **Tracking de mídia:** plataforma/campanha/criativo por lead (`/admin/tracking`).

### NÃO existe (ou está incompleto)
- **Métricas de mídia paga:** sem LPV/CTR/CPC/CPM/CPL/ROAS — o admin **não puxa gasto/impressões do Meta**; só conta leads por UTM. (Confirmado: nenhuma tabela/RPC de spend.)
- **Funil com nomes/percentuais consolidados num só dashboard "de gargalos":** os 3 funis existem mas estão **soltos dentro de `/admin/quiz`**, sem KPI de "maior gargalo" nem comparação período-a-período.
- **InitiateCheckout como etapa de primeira-classe atrelada a receita:** o `cta` do quiz e o `view`/`submit` do checkout existem em `*_funnel_events`, mas **não há reconciliação** entre a coorte instrumentada (`session_id`) e a coorte de atribuição (`external_id`/`buyer_email`). São universos separados.
- **Receita atribuída por etapa do funil** (ex.: receita dos que passaram pelo checkout): não há.
- **Frequência/reach, LTV consolidado no admin:** não.

---

## 6. Pontos de conexão para o dashboard de funil/gargalos

O dashboard de **LP→quiz→lead→InitiateCheckout→Purchase** **NÃO deve ser construído do zero** — boa parte já existe. Recomendações para plugar de forma coerente:

### 6.1 Fonte de verdade a reusar (não duplicar)
- **Receita:** sempre `vendas_reais` / `receita_real()` (R$) — nunca somar `purchases` cru (traz teste/legado).
- **Leads:** sempre `leads_reais` (já filtra is_test + production_start_at).
- **Funil ponta-a-ponta:** **`analytics_full_funnel(p_days)`** já entrega LP/quiz→checkout→purchase por `session_id`. O dashboard de gargalos deveria **consumir essa RPC** e calcular o "maior drop" (a coluna `drop_pct` já vem pronta via `lag()`).
- **InitiateCheckout:** mapeia para `quiz_funnel_events.stage='cta'` (clicou comprar) e/ou `checkout_funnel_events.stage='view'/'submit'`.
- **Purchase:** `checkout_funnel_events.stage='purchase'` (coorte instrumentada) **ou** `vendas_reais` (coorte de atribuição/receita). **Escolher conscientemente** — ver 6.3.

### 6.2 Onde plugar na UI
- Opção A (menor atrito): **nova aba/seção em `/admin/quiz`** (já carrega os 3 funis) ou em `/admin/analytics`. Reusa `getFullFunnel`/`getQuizFunnel`/`getCheckoutFunnel`.
- Opção B (rota dedicada `/admin/funil`): nova server function `getFunnelDashboard` (padrão `requireSupabaseAuth` + `assertAdmin` + `supabaseAdmin.rpc('analytics_full_funnel')`). **Seguir o padrão existente** (`checkout-funnel.functions.ts`).
- Em ambos: **service_role-only** (as RPCs já são). Não expor ao browser.

### 6.3 Inconsistências/armadilhas a evitar
1. **Dois métodos de join lead↔venda:** `analytics_funnel` usa **`buyer_email`**; o resto (top_segments, conversion, cohort) usa **`external_id=src`**. Para o dashboard, **padronizar em `external_id=src`** (é o que liga ao tracking/atribuição e ao quiz). Se misturar, os números de "Compraram" vão divergir entre telas.
2. **Coorte instrumentada vs. coorte de atribuição:** `*_funnel_events.session_id` ≠ `leads.external_id`. Hoje o full funnel é só sessões instrumentadas; vendas em `vendas_reais` são por atribuição. **Não somar/dividir um pelo outro** sem reconciliar. Se o dashboard quiser "% de leads que compraram", use `external_id=src` (leads_reais↔vendas_reais), não a contagem do checkout funnel.
3. **`purchase` no checkout funnel ≠ receita confirmada:** `checkout_funnel_events.stage='purchase'` é um evento de front; a venda confirmada é `vendas_reais` (status confirmed pós-webhook). Para receita, sempre `vendas_reais`.
4. **Timezone:** o corte "hoje" é BRT via `production_start_at`/`AT TIME ZONE 'America/Sao_Paulo'` nas RPCs e `T03:00:00Z` no front (`overview.functions.ts:22`). Manter o mesmo critério no dashboard.
5. **`is_test` + `production_start_at`:** garantidos nas views/RPCs canônicas, mas **`quiz_funnel_events`/`checkout_funnel_events` têm `is_test` próprio** (quiz tem, `20260616_intelligence_is_test.sql:9`). Verificar se o full_funnel filtra is_test — **as RPCs de funil NÃO filtram is_test hoje** (lêem `quiz_funnel_events`/`checkout_funnel_events` sem `WHERE is_test=false`). **[gap a corrigir antes de confiar nos números do funil]**.
6. **Spend/CTR não existem no banco:** se o dashboard precisar de CPL/ROAS, isso vem do **Meta (Primordia/Meta Ads API)**, não deste admin. Decidir se entra agora ou fica como fase 2.

### 6.4 Resumo do encaixe recomendado
> O dashboard de gargalos deve ser uma **camada de leitura fina** sobre `analytics_full_funnel` (etapas + drop_pct já prontos) para o eixo LP→checkout, **cruzada** com `analytics_funnel`/top_segments (padronizado em `external_id=src`) para o eixo receita/atribuição — exposto por uma server function `assertAdmin`/service_role, e renderizado em `/admin/quiz` ou numa rota `/admin/funil`. **Antes de subir, corrigir o filtro `is_test` nas RPCs de funil e unificar o join lead↔venda.**

---

## Apêndice — evidências de arquivo:linha (principais)
- Guard layout: `src/routes/admin.tsx:38-62`; `src/lib/admin/auth.ts:16-31`; `src/lib/admin/server-auth.ts:3-11`.
- Overview: `src/lib/admin/overview.functions.ts:27-54`.
- Views canônicas + receita_real: `supabase/migrations/20260616_intelligence_is_test.sql:71-87`.
- RPCs analytics: `supabase/migrations/20260616_fix_analytics_rpcs.sql` (todo).
- Funis: `20260611_analytics_quiz_funnel.sql`, `20260611_analytics_checkout_funnel.sql`, `20260617_fix_contact_gate_and_email_to_whatsapp.sql`.
- Entitlements/products/webhook DDL: `20260528111216_*.sql`; grant/has_entitlement: `20260528114104_*.sql:10-57`.
- Webhook pipeline: `src/routes/api/public/webhooks/kirvano.ts`; `src/lib/admin/kirvano.server.ts:189-398`.
- Liberação manual UI: `src/routes/admin.acessos.tsx:65-72,164-176`.
- Conversão lead↔venda: `src/lib/admin/conversion.functions.ts:18-39`.
