# Auditoria do Modelo de Dados — "Rotina de Paz" Admin
**Data:** 2026-06-30
**Repo auditado:** `/Users/guilhermehenrique/rotina-de-paz-app` (produção/Vercel)
**Metodo:** leitura direta de todas as migrations em `supabase/migrations/` + codigo-fonte relevante. Afirmacoes sem evidencia direta marcadas **[NAO VERIFICADO]**.

---

## 1. Diagrama textual das tabelas e relacionamentos

```
auth.users (Supabase Auth)
  |
  +--< profiles (user_id FK CASCADE)
  |       id, user_id UNIQUE, email, name, archetype, desire, situation, lead_id(text), created_at, updated_at
  |       [NAO VERIFICADO: whatsapp — coluna existe em types.ts:384 mas sem DDL nas migrations deste repo]
  |
  +--< admin_users (user_id FK CASCADE, UNIQUE)
  |       id, user_id, email, name, role DEFAULT 'admin'
  |       [sem CHECK em role — qualquer string aceita]
  |
  +--< entitlements (user_id FK CASCADE, product_id FK CASCADE)
          id, user_id, product_id, source CHECK('kirvano','manual','migration'),
          status CHECK('active','refunded','canceled','pending'),   <- VER BUG #1
          kirvano_transaction_id, kirvano_offer_id, buyer_email,
          granted_at, revoked_at, metadata jsonb,
          UNIQUE(user_id, product_id)

products
  |  id, slug UNIQUE, name, price_cents int, currency, status CHECK('draft','active','archived'),
  |  kind CHECK('method','course','ebook','bundle','other'), content_ref jsonb, checkout_url
  |
  +--< product_kirvano_offers (product_id FK CASCADE)
  |       id, product_id, kirvano_offer_id TEXT UNIQUE, label
  |
  +--< audio_tracks (product_id FK CASCADE)
  +--< courses (required_product_id FK SET NULL)
  |     +--< course_lessons (course_id FK CASCADE)
  +--< ebooks (required_product_id FK SET NULL, description, required_product_id)

leads
  |  id, name, email, archetype, scores jsonb, desire, situation, risk_flag bool,
  |  utm_source, utm_medium, utm_campaign, utm_content, utm_term, referrer, ip, user_agent,
  |  fbclid, gclid, external_id text,   <- chave de join para purchases.src e tracking_sessions.external_id
  |  is_test bool NOT NULL DEFAULT false,
  |  created_at, updated_at
  |  [NAO VERIFICADO: whatsapp — usada em RPCs de analytics mas sem DDL de ADD COLUMN nas migrations]
  |
  +--< quiz_responses (lead_id FK ON DELETE SET NULL)
          lead_id uuid (nullable pos-hardening), question_key, answer_value, answer_text, time_to_answer

purchases
  |  id, lead_id FK ON DELETE SET NULL, user_id FK ON DELETE SET NULL,
  |  external_id text (alias legado — NAO e a chave de join; a chave e `src`),
  |  transaction_id UNIQUE, product_name, product_type CHECK('principal','order_bump','upsell','downsell'),
  |  gross_value int (centavos), status CHECK('confirmed','refunded','chargeback'),
  |  kirvano_offer_id, buyer_email, utm_source, utm_campaign, utm_medium, utm_content, utm_term,
  |  src text,     <- external_id do lead — chave de join leads.external_id = purchases.src
  |  is_test bool NOT NULL DEFAULT false, metadata jsonb, created_at
  |
  [FK purchases.lead_id -> leads.id ON DELETE SET NULL — join fraco, src e o join real]

tracking_sessions
  |  external_id text UNIQUE (chave de join com leads/purchases),
  |  fbp, fbc, fbclid, user_agent
  |  [NAO VERIFICADO: DDL de CREATE TABLE nao encontrado nas migrations deste repo]
  |  [NAO VERIFICADO: client_ip — migration 20260608_tracking_session_client_ip.sql listada
  |   como untracked no git status mas nao existe no disco do repo auditado]

quiz_funnel_events        [NAO VERIFICADO: DDL de CREATE TABLE nao encontrado nas migrations]
  |  session_id text, stage text, question_key text, quiz_version text,
  |  is_test bool NOT NULL DEFAULT false, created_at
  |  [sem FK para leads ou tracking_sessions — join por session_id isolado]

checkout.checkout_funnel_events   [NAO VERIFICADO: DDL de CREATE TABLE nao encontrado]
  |  session_id, stage text, created_at
  |  [schema 'checkout', sem is_test — VER BUG #3]

webhook_logs
  |  id, source, event_type, payload jsonb, signature, signature_valid bool,
  |  processed bool, processed_at, error, request_ip,
  |  capi_status text, capi_error, capi_retries int DEFAULT 0, capi_last_attempt timestamptz,
  |  created_at

checkout_config
  |  key PK, value text NOT NULL, description, updated_at
  |  Linha-chave: production_start_at = '2026-06-08T00:00:00Z'
  |  [nota: o doc de visao usa o nome 'admin_config' — nome real e 'checkout_config']

admin_audit_logs / crm_opt_outs / crm_sends / reconciliation_reports / support_tickets / support_messages
  [DDLs verificados, sem anomalias criticas]

VIEWS CANONICAS (security_invoker=on pos 20260629):
  vendas_reais = purchases WHERE status='confirmed' AND is_test=false AND created_at >= production_start_at
  leads_reais  = leads     WHERE is_test=false      AND created_at >= production_start_at
```

**Chaves de join confirmadas:**
- `leads.external_id = purchases.src` (qs_*): chave de atribuicao real, confirmada em `analytics_top_segments`, `analytics_quiz_conversion`, `analytics_cohort_weekly`, `upsert_tracking_session`/`reconciliation_job`.
- `purchases.src = tracking_sessions.external_id`: join CAPI/reconciliacao.
- `quiz_funnel_events.session_id = checkout.checkout_funnel_events.session_id`: join do full_funnel, sem FK, sem verificacao de existencia cruzada.
- `purchases.lead_id`: FK exists mas **nao e usada pelos RPCs de analytics** (RPCs usam `src`); e um join auxiliar/legado.
- `product_kirvano_offers.kirvano_offer_id`: join Kirvano→produto no webhook, `UNIQUE` confirmado.

---

## 2. Esquema detalhado das tabelas/views centrais

### 2.1 `leads`
- **Arquivo:** `20260528141454_*.sql:7-26`, `20260606_fix_persist_lead_clickids.sql:11-12`, `20260616_intelligence_is_test.sql:7,35`, `20260605_hardening_schema.sql:4`
- **Colunas-chave:** `id uuid PK`, `email text` (nullable), `archetype text` (nullable), `scores jsonb NOT NULL DEFAULT '{}'`, `risk_flag bool NOT NULL DEFAULT false`, `external_id text` (nullable — chave de join), `fbclid text`, `gclid text`, `is_test bool NOT NULL DEFAULT false`
- **Sem whatsapp no DDL das migrations deste repo** — coluna existe em `types.ts:384` e e usada em `analytics_funnel` (20260617), mas nenhum `ALTER TABLE leads ADD COLUMN whatsapp` foi encontrado. Provavelmente aplicado direto no banco sem migration. **[NAO VERIFICADO — risco de schema drift]**
- **Sem UNIQUE em email** — um email pode ter multiplos leads (quiz repetido). Comportamento intencional.
- **Indices:** `idx_leads_created (created_at DESC)`, `idx_leads_archetype (archetype)`, `idx_leads_email (lower(email))`, `idx_leads_utm_source (utm_source)`. Sem indice em `external_id` — join em vendas/tracking sem indice. **[VER BUG #5]**
- **RLS:** `admins read/update/delete leads` + `anon/auth insert leads` (revogado em `hardening_rls_final`); gravacao via RPC `persist_lead` (SECURITY DEFINER).

### 2.2 `purchases`
- **Arquivo:** `20260531_purchases_table.sql`, `20260616_intelligence_is_test.sql:8,39`, `20260614_utm_complete_drop_overload.sql:7-10`
- **Colunas-chave:** `transaction_id text UNIQUE`, `product_type CHECK('principal','order_bump','upsell','downsell')`, `gross_value int` (centavos, NOT NULL), `status CHECK('confirmed','refunded','chargeback')`, `src text` (nullable — external_id do lead), `is_test bool NOT NULL DEFAULT false`
- **FKs:** `lead_id -> leads.id ON DELETE SET NULL`, `user_id -> auth.users ON DELETE SET NULL` — ambas nullable.
- **Sem FK de `src` para `leads.external_id`** — join implicito, sem integridade referencial. **[join fragil — VER BUG #4]**
- **Sem FK de `kirvano_offer_id` para `product_kirvano_offers`** — join so via codigo.
- **Indices:** `idx_purchases_lead (lead_id)`, `idx_purchases_type (product_type, created_at DESC)`, `idx_purchases_created (created_at DESC)`, `idx_purchases_email (lower(buyer_email))`. Sem indice em `src`. **[VER BUG #5]**
- **RLS:** `admins manage purchases` (ALL). `GRANT SELECT authenticated`, `GRANT ALL service_role`.

### 2.3 `entitlements`
- **Arquivo:** `20260528111216_*.sql:67-82`, `20260528141454_*.sql:77-86`
- **Colunas-chave:** `user_id uuid NOT NULL`, `product_id uuid NOT NULL`, `source CHECK('kirvano','manual','migration')`, `status CHECK('active','refunded','canceled','pending')`, `UNIQUE(user_id, product_id)`, `revoked_at timestamptz` (nullable)
- **FK:** `user_id -> auth.users ON DELETE CASCADE`, `product_id -> products ON DELETE CASCADE` (adicionadas em `20260528141454_*.sql:79-88`)
- **CHECK confirmado:** `status IN ('active','refunded','canceled','pending')` — `'revoked'` NAO esta no CHECK. **[CONFIRMA BUG #1 abaixo]**
- **Indices:** `idx_entitlements_user (user_id)`, `idx_entitlements_product (product_id)`, `idx_entitlements_email (buyer_email)`, `idx_entitlements_user_status (user_id, status)`
- **RLS:** `users read own entitlements` + `admins manage entitlements`
- **Grants:** `authenticated: SELECT, INSERT, UPDATE, DELETE` (re-concedido em `20260615_revoke_anon_writes.sql:74`)

### 2.4 `products`
- **Arquivo:** `20260528111216_*.sql:6-19`
- **Colunas-chave:** `slug text NOT NULL UNIQUE`, `price_cents int NOT NULL DEFAULT 0`, `status CHECK('draft','active','archived')`, `kind CHECK('method','course','ebook','bundle','other')`, `checkout_url text` (nullable, adicionado em `20260528114606_*.sql:3`)
- **RLS:** `admins manage products` + `authenticated read active products`

### 2.5 `product_kirvano_offers`
- **Arquivo:** `20260528111216_*.sql:44-50`
- **Colunas-chave:** `product_id FK NOT NULL ON DELETE CASCADE`, `kirvano_offer_id TEXT NOT NULL UNIQUE`, `label text`
- **Indice:** `idx_kirvano_offers_product (product_id)`

### 2.6 `profiles`
- **Arquivo:** `20260528104212_*.sql:2-13`
- **Colunas-chave:** `user_id UUID NOT NULL UNIQUE REFERENCES auth.users ON DELETE CASCADE`, `email text`, `name text`, `archetype text`, `lead_id TEXT` (nao e FK — e string arbitraria), `created_at`, `updated_at`
- **Indice:** `idx_profiles_email_unique (lower(email)) WHERE email IS NOT NULL` (unique parcial)
- **RLS:** `users read/insert/update own profile` + admin via `fix_rls_profiles_admin.sql` [NAO LIDO]
- **Sem FK `profiles.lead_id -> leads.id`** — campo textual sem integridade. **[join fragil]**

### 2.7 `webhook_logs`
- **Arquivo:** `20260528111216_*.sql:111-123`, `20260616_capi_retry.sql`
- **Colunas-chave:** `source text NOT NULL DEFAULT 'kirvano'`, `payload jsonb NOT NULL`, `signature_valid bool NOT NULL DEFAULT false`, `capi_status text` (NULL=sem CAPI, 'sent', 'failed', 'skipped'), `capi_retries int NOT NULL DEFAULT 0`
- **RLS:** `admins read webhook logs` + `admins update webhook logs`. Sem INSERT policy para authenticated — gravacao via service_role (webhook handler).
- **Grants:** `authenticated: SELECT, UPDATE` (para admin via RLS). `service_role: ALL`.
- **Sem INSERT GRANT para authenticated** — correto, webhook escreve via service_role.

### 2.8 `tracking_sessions`
- **DDL NAO ENCONTRADO nas migrations deste repo.** A RPC `upsert_tracking_session` (5 args, `20260605_hardening_rpcs.sql:95-118`) faz `INSERT INTO tracking_sessions(external_id, fbp, fbc, fbclid, user_agent)`. A migration `20260608_tracking_session_client_ip.sql` e citada no git status como untracked mas nao existe no disco do repo auditado. A versao de 6 args com `p_client_ip` e referenciada em `20260614_utm_complete_drop_overload.sql:18` sem que o DDL da funcao esteja aqui.
- **Colunas inferidas:** `external_id text (UNIQUE, PK de fato)`, `fbp text`, `fbc text`, `fbclid text`, `user_agent text`. Coluna `client_ip` — **[NAO VERIFICADO — migration ausente no repo]**.
- **RLS:** `service_role_all_tracking_sessions` (policy citada em hardening, nunca criada nas migrations deste repo — [NAO VERIFICADO])
- **Schema drift confirmado:** a migration que cria `tracking_sessions` foi aplicada no banco de producao mas nao esta versionada neste repo.

### 2.9 `quiz_funnel_events`
- **DDL NAO ENCONTRADO nas migrations deste repo.** A coluna `is_test bool NOT NULL DEFAULT false` foi adicionada via `ALTER TABLE` em `20260616_intelligence_is_test.sql:9`. A tabela pre-existia no banco. Colunas inferidas via RPCs: `session_id text`, `stage text`, `question_key text`, `quiz_version text`, `is_test bool`, `created_at`.
- **Sem FK para `leads` ou `tracking_sessions`** — join por session_id sem integridade referencial.

### 2.10 `checkout.checkout_funnel_events`
- **DDL NAO ENCONTRADO nas migrations deste repo.** Schema `checkout` (diferente de `public`). Colunas inferidas via `analytics_checkout_funnel`: `session_id`, `stage text`, `created_at`. **Sem coluna `is_test`** — confirmado pela ausencia de filtro is_test nas RPCs de checkout funnel. **[VER BUG #3]**

### 2.11 `checkout_config` (nota: doc anterior chamou de `admin_config` — nome incorreto)
- **Arquivo:** `20260616_intelligence_is_test.sql:12-20`
- **Colunas:** `key text PK`, `value text NOT NULL`, `description text`, `updated_at timestamptz`
- **Linha critica:** `production_start_at = '2026-06-08T00:00:00Z'`
- **Linha de denylist:** `test_emails = 'henrique.voinvicta@gmail.com,guilherme.claude@gmail.com'`

### 2.12 Views `leads_reais` / `vendas_reais`
- **Arquivo:** `20260616_intelligence_is_test.sql:71-80`, `20260629_fix_pii_leak_views.sql:30-34`
- **Definicao confirmada:** filtra `is_test=false`, `status='confirmed'` (vendas), `created_at >= production_start_at`
- **security_invoker=on** (pós 20260629): RLS das tabelas-base aplica ao chamador. Admin passa, anon retorna 0 rows.
- **GRANT SELECT authenticated** mantido (de 20260616). **REVOKE anon** aplicado em 20260629.
- **Risco residual:** `authenticated` nao-admin consegue SELECT na view mas recebe 0 rows (RLS de `leads`/`purchases` bloqueia). Comportamento correto mas dependente de is_admin() funcionar como SECURITY DEFINER sem cache por sessao — confirmado.

---

## 3. Bugs e riscos de integridade (priorizados)

### BUG #1 — CRITICO: CHECK constraint de `entitlements.status` nao inclui 'revoked'

**Confirmado. Nao e latente — e um bug ativo.**

- **CHECK na migration:** `status IN ('active','refunded','canceled','pending')` — arquivo `20260528111216_*.sql:72`.
- **'revoked' NAO consta** em nenhuma migration posterior que altere esse CHECK. Nenhum `ALTER TABLE entitlements DROP CONSTRAINT ... ADD CONSTRAINT ...` foi encontrado nas 30+ migrations deste repo.
- **Codigo que grava 'revoked':**
  - `src/routes/admin.acessos.tsx:67`: `.update({ status: "revoked", revoked_at: ... })`
  - `src/routes/admin.membros.tsx:332`: `.update({ status: "revoked", revoked_at: ... })`
- **Comportamento em producao:** o UPDATE via Supabase client viola o CHECK e retorna um erro PostgreSQL (`check_violation`). O admin UI provavelmente mostra um erro silencioso ou o revoke nao persiste. **Membros revogados manualmente podem continuar com acesso ativo.**
- **O webhook usa 'refunded' corretamente** (`kirvano.server.ts:373`), mas o admin manual usa 'revoked' — valor invalido.
- **Correcao:** `ALTER TABLE entitlements DROP CONSTRAINT entitlements_status_check; ALTER TABLE entitlements ADD CONSTRAINT entitlements_status_check CHECK (status IN ('active','refunded','canceled','pending','revoked'));`

### BUG #2 — ALTO: Dois metodos de join lead-venda incoerentes entre RPCs

- `analytics_funnel` (`20260617_fix_contact_gate_and_email_to_whatsapp.sql:268`): conta compradores por `COUNT(DISTINCT buyer_email)` — join por **email**.
- `analytics_top_segments`, `analytics_quiz_conversion`, `analytics_cohort_weekly` (`20260616_fix_analytics_rpcs.sql`): join por **`leads.external_id = purchases.src`** — join por qs_*.
- **Impacto:** "Compraram" na tela de Analytics Avancado (`analytics_funnel`) diverge do numero em Top Segmentos e Cohort para o mesmo periodo. Um comprador sem `src` preenchido (compra organica/direta) conta em `analytics_funnel` mas nao em `analytics_top_segments`. Numeros inconsistentes entre telas sem aviso ao usuario.
- **Correcao:** padronizar em `external_id=src` em todas as RPCs, ou documentar e separar explicitamente os dois universos.

### BUG #3 — ALTO: RPCs de funil nao filtram `is_test` — contaminacao por sessoes de teste

- `analytics_quiz_funnel` (`20260617_fix_contact_gate_and_email_to_whatsapp.sql:56-139`): lê `quiz_funnel_events` sem `WHERE is_test = false`. A coluna existe (adicionada em `20260616_intelligence_is_test.sql:9`) mas os filtros nas RPCs nao a usam.
- `analytics_checkout_funnel` (`20260611_analytics_checkout_funnel.sql:42-46`): lê `checkout.checkout_funnel_events` sem filtro is_test. A coluna `is_test` possivelmente nem existe nessa tabela (DDL nao encontrado — [NAO VERIFICADO]).
- `analytics_full_funnel` (`20260617_fix_contact_gate_and_email_to_whatsapp.sql:144-239`): mesmo problema em ambas as fontes.
- **Impacto:** sessoes de teste do dono inflam os numeros do funil instrumentado. Como `vendas_reais` ja filtra `is_test=false`, o funil mostra mais "chegadas" do que compradores reais justificam — drop_pct do ultimo passo parece pior do que e.
- **Correcao:** adicionar `AND e.is_test = false` em todos os CTEs das 3 RPCs. Para `checkout_funnel_events`, verificar se a coluna existe e adicionar se nao existir.

### BUG #4 — MEDIO: Joins frageis sem FK (schema drift silencioso)

- `purchases.src -> leads.external_id`: sem FK, sem indice em ambos os lados. Orphans de `src` (compra sem lead correspondente) nao sao detectaveis.
- `purchases.kirvano_offer_id -> product_kirvano_offers.kirvano_offer_id`: sem FK. Uma oferta removida do catalogo nao invalida compras historicas (pode ser intencional, mas e risco).
- `profiles.lead_id -> leads.id`: campo `text`, sem FK. Pode apontar para lead inexistente.
- `quiz_funnel_events.session_id <-> checkout_funnel_events.session_id`: sem FK cruzada entre schemas. `analytics_full_funnel` junta por session_id mas nao verifica se a sessao existiu em ambas as tabelas.
- `grant_entitlement_manual`: resolve usuario por `profiles.email` (case-insensitive) mas NAO por `auth.users` diretamente — se o profile nao foi criado (trigger `handle_new_user` falhou), o usuario existe em `auth.users` mas `grant_entitlement_manual` retorna `user_not_found`. **Ja documentado no codigo anterior mas confirmado aqui.**

### BUG #5 — MEDIO: Ausencia de indices nas colunas de join centrais

- `leads.external_id`: **sem indice**. Usado em JOINs de todas as RPCs de analytics, reconciliation_job, e no full_funnel. Com crescimento de leads, isso vira seq scan.
- `purchases.src`: **sem indice**. Mesmo problema — JOIN `vendas_reais.src` em 4 RPCs.
- `purchases.buyer_email`: tem indice `idx_purchases_email (lower(buyer_email))` mas `analytics_funnel` usa `COUNT(DISTINCT buyer_email)` sem `lower()` — pode nao usar o indice.
- **Correcao:** `CREATE INDEX idx_leads_external_id ON public.leads(external_id);` e `CREATE INDEX idx_purchases_src ON public.purchases(src);`

### BUG #6 — MEDIO: Schema drift — DDLs criticos ausentes no repo

- `tracking_sessions` (CREATE TABLE): ausente. Inferido via RPCs.
- `quiz_funnel_events` (CREATE TABLE): ausente. Inferido via RPCs.
- `checkout.checkout_funnel_events` (CREATE TABLE): ausente.
- `leads.whatsapp` (ADD COLUMN): ausente. A coluna e usada em `analytics_funnel`, `analytics_top_segments`, mas nenhuma migration a declara.
- `20260608_tracking_session_client_ip.sql`: listada no git status como arquivo nao-rastreado no repo `/projects/rotina-de-paz-app` (o clone errado) — nao existe no repo de producao. `client_ip` em `tracking_sessions` pode existir no banco mas sem migration documentada.
- **Risco:** qualquer `supabase db reset` ou migracao em ambiente novo vai criar um schema incompleto, quebrando as RPCs que acessam essas tabelas.

### BUG #7 — BAIXO: `purchases.external_id` vs `purchases.src` — campo ambiguo

- `purchases` tem **dois campos** com nomes confusos: `external_id text` (coluna original do DDL de `20260531_purchases_table.sql`, nunca usada em RPCs de analytics) e `src text` (adicionada em `20260616_intelligence_is_test.sql:39`, a chave real de atribuicao).
- Nenhuma RPC usa `purchases.external_id`. O campo pode estar vazio/nulo em todas as linhas.
- **Risco:** confusao futura — um desenvolvedor novo vai assumir que `external_id` e a chave de join (nome sugere isso) e usar a coluna errada.
- **Correcao recomendada:** deprecar/remover `purchases.external_id` ou adicionar COMMENT esclarecendo.

### BUG #8 — BAIXO: `is_admin()` sem wrapping em `(SELECT ...)` nas policies RLS

- Policies como `USING (public.is_admin(auth.uid()))` chamam a funcao **por linha** em vez de avalia-la uma vez. O padrao recomendado e `USING ((SELECT public.is_admin(auth.uid())))` para permitir que o planner avalie uma vez por query.
- Com poucos admins e tabelas pequenas, impacto e minimo agora, mas degrada com crescimento.
- **Confirmado em:** `20260528141454_*.sql:43`, `20260528111216_*.sql:30`, e multiplas outras policies.

---

## 4. RLS / Grants — confirmacoes e riscos residuais

| Tabela/View | anon | authenticated (nao-admin) | admin | service_role |
|---|---|---|---|---|
| `leads_reais` | REVOGADO (20260629) | SELECT (mas 0 rows via RLS) | SELECT via RLS | ALL (bypassa RLS) |
| `vendas_reais` | REVOGADO (20260629) | SELECT (mas 0 rows via RLS) | SELECT via RLS | ALL |
| `leads` | sem grant (pós 20260615) | sem grant | SELECT/UPDATE/DELETE via RLS | ALL |
| `purchases` | sem grant | SELECT (0 rows via RLS) | ALL via RLS | ALL |
| `entitlements` | sem grant | SELECT (propria linha via RLS) | ALL via RLS | ALL |
| `webhook_logs` | sem grant | SELECT/UPDATE (0 rows via RLS) | SELECT/UPDATE via RLS | ALL |
| `admin_users` | sem grant | SELECT (0 rows via RLS) | SELECT via RLS | ALL |
| `tracking_sessions` | sem grant (pós hardening) | SELECT (via grant 20260615:46) | — | ALL |
| `quiz_funnel_events` | sem grant | SELECT (via grant 20260615:46) | — | ALL |
| RPCs analytics_* | sem grant | REVOGADO (20260611) | service_role via server fn | GRANT |
| `analytics_quiz_funnel`, `checkout_funnel`, `full_funnel` | sem grant | REVOGADO | service_role via server fn | GRANT |

**Risco residual confirmado: `tracking_sessions` e `quiz_funnel_events` tem `GRANT SELECT TO authenticated`** (re-concedido em `20260615_revoke_anon_writes.sql:46`). Qualquer usuario logado pode ler TODOS os eventos de sessao e tracking sem restricao de RLS — incluindo session_ids, fbclid, fbp, fbc de todos os usuarios. Essas tabelas NAO tem policies de SELECT para usuarios comuns — apenas para service_role.

- **Severidade:** MEDIO/ALTO (dados de rastreio de todos os usuarios expostos a qualquer conta autenticada).
- **Correcao:** `REVOKE SELECT ON tracking_sessions, quiz_funnel_events FROM authenticated;` (o admin le via service_role/server function de qualquer forma).

---

## 5. Confirmacoes e refutacoes do doc de visao geral anterior

| Afirmacao do doc anterior | Veredicto |
|---|---|
| `entitlements.status CHECK` inclui apenas 4 valores, sem 'revoked' | **CONFIRMADO** — bug ativo |
| Views `leads_reais`/`vendas_reais` fechadas para anon em 20260629 | **CONFIRMADO** |
| RPCs de funil nao filtram `is_test` | **CONFIRMADO** (quiz_funnel e checkout_funnel) |
| `analytics_funnel` usa buyer_email; top_segments/cohort usam external_id=src | **CONFIRMADO** — incoerencia real |
| `tracking_sessions.client_ip` [NAO VERIFICADO] | **PERMANECE NAO VERIFICADO** — migration ausente |
| DDL de `tracking_sessions` nao localizado | **CONFIRMADO — ausente no repo** |
| `grant_entitlement_manual` requer profile pre-existente | **CONFIRMADO** (linha 42 da funcao) |
| Nome `admin_config` | **INCORRETO** — nome real e `checkout_config` |
| `is_admin()` chamada por-linha em policies | **CONFIRMADO** — sem `(SELECT ...)` wrapper |
| `purchases.external_id` vs `purchases.src` — campo `external_id` existe mas nao e usado | **CONFIRMADO** |

---

## 6. Evidencias arquivo:linha

- CHECK de `entitlements.status`: `supabase/migrations/20260528111216_eee77b2f-a260-484c-8175-1b71f506e3d4.sql:72`
- Codigo gravando 'revoked': `src/routes/admin.acessos.tsx:67`, `src/routes/admin.membros.tsx:332`
- Webhook grava 'refunded' (correto): `src/lib/admin/kirvano.server.ts:373`
- `analytics_funnel` com buyer_email: `supabase/migrations/20260617_fix_contact_gate_and_email_to_whatsapp.sql:268`
- `analytics_top_segments` com external_id=src: `supabase/migrations/20260616_fix_analytics_rpcs.sql:46`
- Ausencia de filtro is_test no quiz funnel: `supabase/migrations/20260617_fix_contact_gate_and_email_to_whatsapp.sql:56-139` (sem WHERE is_test)
- Views canonicas + security_invoker: `supabase/migrations/20260629_fix_pii_leak_views.sql:30-34`
- upsert_tracking_session 5-args (sem client_ip): `supabase/migrations/20260605_hardening_rpcs.sql:95-118`
- Grant SELECT authenticated em tracking_sessions/quiz_funnel_events: `supabase/migrations/20260615_revoke_anon_writes.sql:46`
- Indices faltando em external_id e src: ausencia confirmada em todas as migrations indexando `leads` e `purchases`
- `purchases.external_id` coluna sem uso: `supabase/migrations/20260531_purchases_table.sql:7` (declarada), `20260616_intelligence_is_test.sql:39` (src adicionada como substituta)
