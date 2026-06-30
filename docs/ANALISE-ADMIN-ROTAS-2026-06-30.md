# Mapeamento FIEL das rotas do ADMIN — "Rotina de Paz" / Primordia

**Data:** 2026-06-30
**Repo (produção/Vercel):** `/Users/guilhermehenrique/rotina-de-paz-app`
**Método:** leitura direta (`Read`/`Grep`) de `src/routes/admin*.tsx`, `src/lib/admin/*`, `src/components/admin/*`. Toda afirmação tem `arquivo:linha`. O não confirmado está marcado **[NÃO VERIFICADO]**.

> Aprofunda o doc `docs/ANALISE-ADMIN-ESTRUTURA-2026-06-30.md` no DETALHE POR ROTA. Marca do painel: "Primordia" (`admin.tsx:11`).

---

## 0. Padrão de acesso a dados (resumo)

Dois caminhos de leitura/escrita, citados por rota abaixo:

1. **CLIENT (browser)** — `supabase` de `@/integrations/supabase/client`. Roda como o JWT do admin logado; segurança = **RLS** (`public.is_admin(auth.uid())`). É o caminho da maioria das rotas-tabela e de TODO o CRUD de conteúdo.
2. **SERVER** — `createServerFn` (`@tanstack/react-start`) com cadeia `requireSupabaseAuth` (middleware → injeta `context.userId`) + `assertAdmin(context.userId)` (`src/lib/admin/server-auth.ts:3-11`, consulta `admin_users` via `supabaseAdmin` = service_role) + `supabaseAdmin`. Bypassa RLS, roda no servidor Vercel. Usado p/ overview, analytics RPCs, funis, CRM, replay webhook, conversão, status integração, teste webhook.

As RPCs `analytics_*` são `SECURITY DEFINER` GRANT só `service_role` → **só** chamáveis via server fn.

---

## 1. Layout pai e autenticação

### `admin.tsx` → `/admin` (layout)
- `createFileRoute("/admin")` (`admin.tsx:8`); `head` com `robots noindex,nofollow` (`:12`). Renderiza `AdminSidebar` + `AdminTopbar` + `<Outlet/>` (`:86-101`).
- **Guard 100% CLIENT-SIDE em `useEffect`** (`admin.tsx:38-62`):
  - Se `window.location.pathname` começa com `/admin/login` → `state="login"`, pula o gate (`:40-44`).
  - Senão `getCurrentAdmin()`; se `null` → `navigate("/admin/login")` (`:46-51`).
  - `supabase.auth.onAuthStateChange`: sessão cai → volta ao login (`:55-57`).
- `getCurrentAdmin()` (`src/lib/admin/auth.ts:16-31`): `supabase.auth.getUser()` → RPC `is_admin({_user_id})` → `SELECT id,user_id,email,name,role FROM admin_users WHERE user_id=…`. Roda no **browser**; seguro pois RLS de `admin_users` só deixa admin ler.
- ⚠️ **A rota NÃO tem `beforeLoad`/`loader` de auth.** O gate é só visual (useEffect). A fronteira real de dados é RLS (client) + `assertAdmin` (server). Toda leitura nova deve passar por uma dessas duas.

### `admin.login.tsx` → `/admin/login`
- `createFileRoute("/admin/login")` (`:9`).
- Se já é admin ao montar → redireciona p/ `/admin` (`getCurrentAdmin()`, `:29`).
- Submit (`:43-52`): `supabase.auth.signInWithPassword({email,password})` (CLIENT) → `getCurrentAdmin()`; se não-admin → `supabase.auth.signOut()` + erro (`:45-47`); sucesso → `logAdminAction("admin.login",{metadata:{email}})` (`:52`).

### Auditoria
`logAdminAction(action, opts)` (`src/lib/admin/audit.ts:4-24`): CLIENT; `getCurrentAdmin()` → `supabase.from("admin_audit_logs").insert({admin_id, action, resource_type, resource_id, metadata})`. Try/catch silencioso (nunca quebra UI). Chamado em login, grant/revoke, e todo CRUD de conteúdo/produtos.

---

## 2. Rotas — uma seção por rota

Ordem do menu (`AdminSidebar.tsx:35-54`): Visão Geral · Áudios · Louvores · Cursos · E-books · Produtos & Kirvano · Acessos · Clientes · Webhooks · Leads · Analytics Quiz · Membros · Vendas · Tracking · Analytics Avançado · CRM · Suporte · Configurações. (`highlight` em Produtos e CRM, `AdminSidebar.tsx:41,51`.)

---

### 2.1 `admin.index.tsx` → `/admin` — Visão Geral
- **Propósito:** painel de comando do dono. KPIs de vendas/leads/membros + distribuição de arquétipos.
- **Renderiza:** `KpiCard`s (Vendas hoje, Vendas totais, Leads quiz, Membros, Leads hoje) + barra de distribuição de arquétipos; export CSV.
- **Fluxo de dados — SERVER** (`admin.index.tsx:8,23`): `useServerFn(getOverviewKpis)`.
  - `getOverviewKpis` (`src/lib/admin/overview.functions.ts:17-55`): `createServerFn GET` + `requireSupabaseAuth` + `assertAdmin` + `supabaseAdmin`.
  - Lê (`overview.functions.ts:27-34`, `Promise.all`):
    - view `leads_reais` — count total (`head:true`), count hoje (`gte created_at todayISO`), `select("archetype") not null` p/ breakdown.
    - `profiles` — count membros (`head:true`).
    - view `vendas_reais` — `select("gross_value")` total + hoje.
  - Fórmulas: `totalRevenue = Σ gross_value/100` (`:42`); `revenueToday` idem c/ corte `todayISO = dataSP+"T03:00:00Z"` (`:22-23`); `totalPurchases = vendas_reais.length`.
- **Mutations:** nenhuma.

---

### 2.2 `admin.vendas.tsx` → `/admin/vendas` — Vendas (faturamento)
- **Propósito:** receita aprovada Kirvano, funil por tipo de oferta, receita por produto, lista de vendas.
- **Renderiza:** KPIs (receita, aprovadas, AOV), funil por `product_type`, ranking por produto, tabela de vendas.
- **Fluxo de dados — CLIENT** (`admin.vendas.tsx:76-84`): `supabase.from("vendas_reais").select("id, transaction_id, product_name, product_type, gross_value, status, buyer_email, kirvano_offer_id, created_at").gte("created_at", since).order(desc).limit(500)`.
- **Métricas (front):** `revenue = Σ gross_value WHERE status='confirmed'`; `aov = revenue/approved` (`:90-104`); `funnelStats` por tipo (principal/order_bump/upsell/downsell, `:107-121`); `byProduct` agrega por `product_name` (`:124-140`).
- **Mutations:** nenhuma.
- ⚠️ A view `vendas_reais` já é só `confirmed`; o front re-filtra `status==='confirmed'` e tenta contar refunded/chargeback que não existem na view → `refunded` tende a 0. **[parcial]**

---

### 2.3 `admin.leads.tsx` → `/admin/leads` — Leads do Quiz
- **Propósito:** distribuição e listagem de leads do Quiz Sacra.
- **Renderiza:** KPIs (total, hoje, risco, com WhatsApp), donut por arquétipo, barras leads/dia × arquétipo, tabela; export CSV.
- **Fluxo de dados — CLIENT** (`admin.leads.tsx:66-78`): `supabase.from("leads_reais").select("id, name, email, whatsapp, archetype, desire, situation, risk_flag, utm_source, utm_campaign, created_at").gte("created_at", since).order(desc).limit(1000)`.
- **Mutations:** nenhuma.

---

### 2.4 `admin.tracking.tsx` → `/admin/tracking` — Tracking (fontes de tráfego)
- **Propósito:** UTMs/plataformas/campanhas/criativos por lead + taxa de conversão por lead.
- **Renderiza:** breakdown por plataforma, top campanhas, top criativos, matriz arquétipo×plataforma, com `rate` de conversão.
- **Fluxo de dados:**
  - **CLIENT** (`admin.tracking.tsx:113-122`): `supabase.from("leads_reais").select("id, name, email, archetype, utm_source, utm_medium, utm_campaign, utm_content, utm_term, created_at").gte("created_at", since).limit(1000)`.
  - **SERVER** (`:128-131`): `useServerFn(getConvertedLeadIds)`.
    - `getConvertedLeadIds` (`src/lib/admin/conversion.functions.ts:11-40`): `assertAdmin` + `supabaseAdmin`. Lê `vendas_reais.src` + `leads_reais.id,external_id`; retorna IDs de lead cujo `external_id ∈ set(vendas_reais.src)`. **Join `leads_reais.external_id = vendas_reais.src` (qs_*).**
- **Lógica:** `didConvert(lead) = convertedSet.has(lead.id)` (`:133-136`); `rate = converted/total`.
- **Mutations:** nenhuma.

---

### 2.5 `admin.quiz.tsx` → `/admin/quiz` — Analytics Quiz ⭐ (3 funis instrumentados)
- **Propósito:** análise do quiz + funis quiz/checkout/full (LP→compra).
- **Renderiza:** completion rate do quiz, distribuição por pergunta, conversão por arquétipo, e os 3 funis com `drop_pct`.
- **Fluxo de dados:**
  - **CLIENT:** `supabase.from("quiz_responses").select("*").gte(since).limit(5000)` (`:88-95`); `supabase.from("leads_reais").select("id, archetype, email, whatsapp, created_at").limit(2000)` (`:104-110`).
  - **SERVER (4):** `getConvertedLeadIds` (`:115`); `getQuizFunnel` → RPC `analytics_quiz_funnel` (`quiz-funnel.functions.ts:14-27`); `getCheckoutFunnel` → RPC `analytics_checkout_funnel` (`checkout-funnel.functions.ts:18-30`); `getFullFunnel` → RPC `analytics_full_funnel` (`checkout-funnel.functions.ts:32-44`). Todas `assertAdmin`+service_role, input `{days}` (zod 0–3650).
- **Mutations:** nenhuma.

---

### 2.6 `admin.analytics.tsx` → `/admin/analytics` — Analytics Avançado
- **Propósito:** lead campeão / nicho vencedor / funil / receita / cohort.
- **Renderiza:** funil (Leads→Quiz completo→WhatsApp→Compraram→Upsell→Downsell), top segmentos, receita por produto (recharts), cohort semanal; CSV.
- **Fluxo de dados — SERVER (5)** (`admin.analytics.tsx:27-33` imports; `:73-93` queries), todas `assertAdmin`+service_role (`src/lib/admin/analytics.functions.ts`):
  - `getFunnel` → RPC `analytics_funnel` (`:35-55`).
  - `getTopSegments` → RPC `analytics_top_segments` (`p_min_leads:20`, `:22-33`).
  - `getRevenueBreakdown` → RPC `analytics_revenue_breakdown` (`:57-68`).
  - `getQuizConversion` → RPC `analytics_quiz_conversion` (`:70-81`).
  - `getCohortWeekly` → RPC `analytics_cohort_weekly` (`weeks:12`, `:83-96`).
- **Mutations:** nenhuma.
- ⚠️ `analytics_funnel` junta lead↔venda por `buyer_email`; o resto por `external_id=src` → métodos diferentes (inconsistência §3).

---

### 2.7 `admin.webhooks.tsx` → `/admin/webhooks` — Webhook Logs
- **Propósito:** todo evento Kirvano recebido (válido/inválido, processado/não) + cobertura CAPI + replay manual.
- **Renderiza:** KPI cobertura CAPI, tabela de logs com botão reprocessar.
- **Fluxo de dados:**
  - **CLIENT** (`admin.webhooks.tsx:36-46`): `supabase.from("webhook_logs").select("*").order(desc).limit(100)` (inclui `capi_status/capi_error/capi_retries` em runtime, tipos gerados defasados).
  - **SERVER** (`:31`): `useServerFn(replayWebhookLog)`.
- **Mutations — SERVER:** `replayWebhookLog` (`src/lib/admin/replay.functions.ts:8-42`): `assertAdmin`; lê `webhook_logs(id,payload,signature_valid)`; recusa se `signature_valid=false` (`:21`); chama `processKirvanoPayload(payload)`; faz `UPDATE webhook_logs SET processed,processed_at,error` (`:25-39`).
- **Métrica:** `capiPct = capiSent/capiAttempts` onde `capi_status != null` (`:55-58`).

---

### 2.8 `admin.acessos.tsx` → `/admin/acessos` — Acessos & Entitlements ⭐
- **Propósito:** quem tem acesso a quê; conceder/revogar manual (bypass Kirvano).
- **Renderiza:** tabela de entitlements (join com produto/profile), form de concessão.
- **Fluxo de dados — CLIENT (leituras):**
  - `supabase.from("products").select("id, name, slug").order("name")` (`:35`).
  - `supabase.from("entitlements").select("*").order("granted_at",desc).limit(500)` (`:44`).
  - `supabase.from("profiles").select("user_id, email, name").in("user_id", userIds)` (`:57`).
- **Mutations — CLIENT:**
  - **Conceder:** RPC `grant_entitlement_manual({_email, _product_id})` (`:167`) → `logAdminAction("entitlement.grant")` (`:172`).
  - **Revogar:** `supabase.from("entitlements").update({status:"revoked", revoked_at}).eq("id",id)` (`:67`) → `logAdminAction("entitlement.revoke")` (`:69`).
- ⚠️ `'revoked'` pode violar o CHECK `status IN ('active','refunded','canceled','pending')` — webhook usa `'refunded'`; admin usa `'revoked'`. **[possível bug latente — NÃO VERIFICADO se constraint foi alterado]**

---

### 2.9 `admin.produtos.tsx` → `/admin/produtos` — Produtos & Kirvano
- **Propósito:** catálogo de produtos + ofertas Kirvano + variações de preço.
- **Renderiza:** tabela de produtos; sub-painéis de ofertas Kirvano e de `product_offers` (preços).
- **Fluxo de dados — CLIENT** (todas via `useQuery`/`useMutation` react-query):
  - Leituras: `products` (`:63`), `product_kirvano_offers` (`:72`), `product_offers` (`:633`).
  - **Mutations (CLIENT):**
    - `products`: insert (`:330`), update (`:334`), delete (`:102`) → `logAdminAction product.{create,update,delete}`.
    - `product_kirvano_offers`: insert (`:528`), delete (`:547`) → `offer.{add,remove}`.
    - `product_offers`: insert (`:805`), update (`:809`), update active toggle (`:652`), delete (`:661`) → `price_offer.{create,update,toggle,delete}`.

---

### 2.10 `admin.clientes.tsx` → `/admin/clientes` — Clientes
- **Propósito:** todos os profiles + entitlements; conceder acesso manual.
- **Fluxo de dados — CLIENT:**
  - Leituras: `profiles` (`:42`), `entitlements` (`:55`), `products` (`:67`).
  - **Mutation (CLIENT):** RPC `grant_entitlement_manual({_email,_product_id})` (`:241`) → `logAdminAction("entitlement.grant")` (`:249`).

---

### 2.11 `admin.membros.tsx` → `/admin/membros` — Membros
- **Propósito:** membros pagantes c/ produtos ativos; conceder/revogar.
- **Fluxo de dados — CLIENT:**
  - Leituras: `profiles` (`:58`), `entitlements` (`:70`), `products` (`:85`).
  - **Mutations (CLIENT):** conceder RPC `grant_entitlement_manual` (`:301`) → `logAdminAction grant` (`:310`); revogar `entitlements.update({status:"revoked", revoked_at}).eq("id")` (`:331-332`) → `logAdminAction revoke` (`:335`).
- ⚠️ Mesmo ponto do `'revoked'` vs CHECK (ver 2.8).

---

### 2.12 `admin.crm.tsx` → `/admin/crm` — CRM ⭐
- **Propósito:** segmentação de leads/compradores + envio de campanhas de email (Resend).
- **Renderiza:** KPIs por segmento, form de teste e de campanha.
- **Fluxo de dados — SERVER (3)** (`admin.crm.tsx:24-26,63-65`), todas `assertAdmin`+service_role (`src/lib/admin/crm.functions.ts`):
  - `getCrmSegments` → RPC `crm_segments({p_days:365})` (`:39-50`).
  - **Mutation:** `sendCrmTestEmail` → POST Resend single (`:108-145`).
  - **Mutation:** `sendCrmCampaign` → RPC `crm_segment_contacts` + dedup via `crm_sends` + batches Resend + upsert `crm_sends` (`:159-285`).
  - (Também existe `getCrmContacts` → RPC `crm_segment_contacts`, `:61-74`; e `getCrmSendHistory` → `crm_sends`, `:298-317`.)
- **Opt-out:** `processOptOut`/`signUnsubToken` em `crm-unsub.server.ts` (server-only, `node:crypto`); grava `crm_opt_outs`.

---

### 2.13 `admin.suporte.tsx` → `/admin/suporte` — Suporte
- **Propósito:** tickets de suporte; responder/fechar + (email).
- **Fluxo de dados — CLIENT:**
  - Leituras: `support_tickets` (`:57`), `profiles` (`:77`), `support_messages` por ticket (`:293`).
  - **Mutations (CLIENT):** responder → `supabase.auth.getUser()` + insert `support_messages` (`:314-315`) + update `support_tickets` status=`answered` (`:324-325`) → `logAdminAction("ticket.reply")` (`:339`); fechar → update `support_tickets` status=`closed` (`:361-362`) → `logAdminAction("ticket.close")` (`:375`).
  - (Notificações de email via server fn de `email.server.ts` — `[NÃO VERIFICADO no detalhe deste arquivo]`.)

---

### 2.14 `admin.config.tsx` → `/admin/config` — Configurações
- **Propósito:** status integração Kirvano, juros/parcelas do checkout, teste de webhook.
- **Fluxo de dados:**
  - **SERVER:** `getIntegrationStatus` (`:20`) → `config.functions.ts:13-45`: `assertAdmin`; checa `process.env.KIRVANO_WEBHOOK_SECRET` + conta `webhook_logs` 7d (total/approved/failed).
  - **SERVER (mutation):** `sendTestWebhook` (`:146,168`) → `test-webhook.functions.ts:8-85`: `assertAdmin`; lê `products`+`product_kirvano_offers`; insere `webhook_logs` de teste; chama `processKirvanoPayload`; atualiza log.
  - **CLIENT:** `supabase.from("products").select(...)` (`:156`).
  - **CLIENT (schema `checkout`):** `supabase.schema("checkout").from("checkout_config").select("key,value")` p/ `installment_*` (`:277-280`); **save** = `update checkout_config` por key (`:303-305`).

---

### 2.15 `admin.audios.tsx` → `/admin/audios` — Áudios do Método
- **Propósito:** CRUD de faixas de áudio gated por produto.
- **Fluxo de dados — CLIENT:**
  - Leituras: `products(id,name,slug,status)` (`:45`); `audio_tracks` por `product_id` (`:52`).
  - **Storage:** bucket `method-audios` — upload (`:247`), getPublicUrl (`:251`), remove (`:88`).
  - **Mutations (CLIENT):** `audio_tracks` insert (`:287`), update (`:291`), delete (`:90`) → `logAdminAction audio_track.{create,update,delete}`.

---

### 2.16 `admin.louvores.tsx` → `/admin/louvores` — Louvores
- **Propósito:** CRUD de louvores (com upload em lote).
- **Fluxo de dados — CLIENT:**
  - Leitura: `louvores` ordenado por book/sort_order/chapter (`:39`).
  - **Storage:** bucket `louvores-audios` — upload (`:191,357`), getPublicUrl (`:193,363`), remove (`:66`).
  - **Mutations (CLIENT):** `louvores` insert (`:219,375`), update (`:223`), delete (`:68`) → `logAdminAction louvor.{create,update,delete}` (`:221,225,377…`).

---

### 2.17 `admin.cursos.tsx` → `/admin/cursos` — Cursos & Devocionais
- **Propósito:** CRUD de cursos e aulas (vídeo).
- **Fluxo de dados — CLIENT:**
  - Leituras: `courses` (`:45`), `course_lessons` por `course_id` (`:50`), `products` (`:239`).
  - **Storage:** bucket `course-videos` — upload (`:250,396`), getPublicUrl (`:252,398`), remove (`:151`).
  - **Mutations (CLIENT):** `courses` insert (`:277`)/update (`:281`)/delete (`:65`); `course_lessons` insert (`:425`)/update (`:429`)/delete (`:153`) → `logAdminAction course.* / lesson.*`.

---

### 2.18 `admin.ebooks.tsx` → `/admin/ebooks` — E-books
- **Propósito:** CRUD de e-books gated por produto.
- **Fluxo de dados — CLIENT:**
  - Leituras: `ebooks` ordenado por category/sort_order (`:34`), `products(id,name)` (`:156`).
  - **Storage:** bucket `ebooks-files` — upload (`:167`), getPublicUrl (`:169`), remove (`:59`).
  - **Mutations (CLIENT):** `ebooks` insert (`:191`)/update (`:195`)/delete (`:62`) → `logAdminAction ebook.{create,update,delete}`.

---

## 3. Componentes admin reutilizados (`src/components/admin/`)

- **`AdminSidebar.tsx`** — navegação fixa de 18 itens (`:35-54`); ativa por `pathname.startsWith` (`exact` só na Visão Geral); modo colapsado + overlay mobile. Sem acesso a dados.
- **`AdminTopbar.tsx`** — barra superior; recebe `admin` (record) por prop.
- **`GlassCard.tsx`** — card glass com framer-motion (`whileHover` lift). Wrapper visual.
- **`KpiCard.tsx`** — KPI com `CountUp` animado; props `label/value/hint/icon/accent`. (accentMap atual é uniforme.)
- **`StubPage.tsx`** — placeholder "Em construção" (não usado por rotas reais hoje).

`src/lib/admin/`: `auth.ts` (getCurrentAdmin, CLIENT), `server-auth.ts` (assertAdmin, SERVER), `audit.ts` (logAdminAction, CLIENT), `constants.ts` (labels arquétipo/situação/desejo + `PERIODS`/`sinceISO`), `csv.ts` (downloadCsv), `analytics.ts`/`queries.ts` (só tipos; `queries.ts` **deprecated/vazio**), e os `*.functions.ts`/`*.server.ts` (server fns descritos acima) + `kirvano.server.ts`, `meta-capi.server.ts`, `email.server.ts`.

---

## 4. Inconsistências e pontos de atenção

1. **Guard só client-side:** `admin.tsx` protege via `useEffect`, sem `beforeLoad`/`loader`. Segurança real = RLS (client) + `assertAdmin` (server). Rotas-tabela CLIENT dependem 100% de RLS `is_admin` estar correta nessas tabelas/views.

2. **Mesma informação, fontes diferentes:**
   - **Entitlements/grant** aparece em 3 rotas (`acessos`, `clientes`, `membros`) — todas CLIENT, RPC `grant_entitlement_manual`; revoke direto em `acessos`/`membros`.
   - **Leads:** `index` lê `leads_reais` via SERVER (service_role); `leads`/`tracking`/`quiz` lêem `leads_reais` via CLIENT (RLS). Mesma view, caminhos distintos.
   - **Vendas/receita:** `index` lê `vendas_reais` via SERVER; `vendas` lê a mesma view via CLIENT; `analytics` usa RPCs service_role. Três leituras da mesma base.
   - **Conversão lead↔venda:** `tracking`/`quiz`/top_segments/cohort usam join `external_id=src`; `analytics_funnel` usa `buyer_email`. **Métodos divergentes** → "Compraram" pode diferir entre telas.

3. **Leituras sensíveis via browser (CLIENT):** `vendas` (`buyer_email`), `leads`/`tracking` (email, whatsapp, UTMs), `clientes`/`membros`/`acessos` (`profiles.email`), `suporte` (`support_messages`), `webhooks` (`payload` cru) — todas no browser sob RLS. Aceitável SE a RLS de cada tabela/view exigir `is_admin`; views `leads_reais`/`vendas_reais` têm `security_invoker=on` + REVOKE anon. **Confirmar RLS de `webhook_logs`/`support_*`/`profiles` — [NÃO VERIFICADO neste levantamento de rotas].**

4. **`status='revoked'`** gravado por `acessos`/`membros` pode violar o CHECK `('active','refunded','canceled','pending')`. **[possível bug latente — NÃO VERIFICADO]**

5. **`vendas` re-filtra `confirmed`** sobre view já filtrada e conta refunded/chargeback inexistentes na view (sempre ~0).

6. **Nenhuma rota tem `loader`/`beforeLoad` de dados** — todo fetch é client-side (react-query/useEffect) ou via `useServerFn`. Navegação não bloqueia (alinhado ao commit `418ca7e`).
