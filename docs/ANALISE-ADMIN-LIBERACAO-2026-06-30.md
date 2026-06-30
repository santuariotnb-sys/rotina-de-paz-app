# Mapa FIEL — Liberação de produtos + Webhook→Entitlement→CAPI→Acesso ("Rotina de Paz")

**Data:** 2026-06-30
**Repo (produção/Vercel):** `/Users/guilhermehenrique/rotina-de-paz-app`
**Método:** leitura direta de `src/` + `supabase/migrations/`. Toda afirmação tem `arquivo:linha`. O que não consegui confirmar neste repo está **[NÃO VERIFICADO]**.

---

## 0. Visão de 1 parágrafo

Compra Kirvano → `POST /api/public/webhooks/kirvano` → `processKirvanoPayload` resolve produto pela oferta, garante a conta (cria se não existir), faz **upsert idempotente em `entitlements` (status='active', onConflict user_id,product_id)**, grava `purchases` (analytics) e dispara **1 tentativa de Meta CAPI Purchase** (cron horário reprocessa falhas). O acesso ao conteúdo no app é verificado por `has_entitlement(required_product_id)`, que só conta `status='active'`. Há também liberação **manual** via RPC `grant_entitlement_manual(_email,_product_id)` nas telas Acessos/Clientes/Membros. **Dois furos confirmados no código:** (1) o `tracking_session` que alimenta fbp/fbc/ip do CAPI é gravado pelo **Quiz-Sacra**, não por este app — este repo nunca chama `upsert_tracking_session`; (2) `client_ip` não é populado pelo caminho deste repo (a única assinatura do RPC vista aqui insere `external_id, fbp, fbc, fbclid, user_agent`, sem `client_ip`).

---

## 1. WEBHOOK KIRVANO — `src/routes/api/public/webhooks/kirvano.ts`

### 1.1 Autenticação (em ordem)
1. **URL-secret `?k=`** (`kirvano.ts:93-100`): se `KIRVANO_URL_SECRET` setado, compara constant-time (`timingSafeEqual`) o query param `k` contra o env; mismatch → **401**. É a defesa real (Kirvano não manda header de auth).
2. **Tamanho do body** (`:107-109`): `> 64 KiB` → **413**.
3. **Secret obrigatório** (`:113-116`): sem `KIRVANO_WEBHOOK_SECRET` → `console.error` + **503**, **sem** gravar `webhook_logs` (evita poluir rate-limit do IP legítimo).
4. **HMAC-SHA256** (`verifyKirvanoSignature`, `kirvano.server.ts:10-30`): lê assinatura de uma lista de headers (`x-kirvano-signature`, `authorization`, `token`, …, `kirvano.ts:11-29`). Tenta HMAC hex constant-time; **fallback** para comparação de token plano se `len(sig)==len(secret)`.
5. **Processa mesmo sem assinatura** (`kirvano.ts:123`): `if (valid || !signature)`. Ou seja, **payload sem assinatura É processado** — proteção é URL não-adivinhável + rate-limit.
6. **Rate-limit** (`tooManyFailures`, `:70-81`, `167-172`): ≥10 logs `signature_valid=false` do mesmo `request_ip` em 60s → **429**. HMAC presente e inválido (abaixo do limite) → loga falha + **401** (`:182-184`).

### 1.2 Idempotência
- `webhook_logs` inserido **antes** de processar para capturar `logId` (`kirvano.ts:135`).
- Idempotência real está no **upsert** `entitlements onConflict:'user_id,product_id'` (`kirvano.server.ts:251`) e no upsert `purchases onConflict:'transaction_id'` (`:334`). Retry da Kirvano (em 500) não duplica.
- **Não há dedup por sale_id no log** (cada POST gera um `webhook_logs` novo); a dedup acontece nas tabelas de destino e no CAPI (event_id).

### 1.3 Parsing do payload (`kirvano.server.ts`)
- Decide evento: `APPROVED_EVENTS` (`SALE_APPROVED`, `sale.approved`, `order.approved`, `PURCHASE_APPROVED`, `purchase.approved` — `:38-44`) vs `REVOKE_EVENTS` (`SALE_REFUNDED`, `SALE_CHARGEBACK`, `SALE_CANCELED` e variações — `:46-55`). Fora dos dois → `matched:false`, ignorado (`:194-196`).
- `extractOfferIds` (`:75-92`): `offer.id/offer_id/offer.hash/offer.code` + array `products`/`items`.
- `extractCustomerEmail` (`:94-98`), `extractCustomerName` (`:100-104`), `extractTransactionId` (`:106-110`).
- `extractPaidTotalCents` (`:119-133`): valor real pago em centavos (pt-BR tolerante). Usado como `gross_value` **só quando há 1 produto** (`useRealPaid`, `:277`); multi-produto cai no `price_cents` de catálogo p/ evitar double-count.

### 1.4 Resolução de produto + conta
- Ofertas → produtos: `product_kirvano_offers WHERE kirvano_offer_id IN (...)` (`:207-211`). Sem produto vinculado → `matched:false` (`:214-216`).
- `ensureUserForEmail` (`:139-164`): (a) acha `profiles.email`; (b) `auth.admin.createUser(email_confirm:true, source:'kirvano')`; (c) se erro (já existe) → RPC `get_user_id_by_email`. **Webhook CRIA a conta** se não existir.

### 1.5 APROVADO — gravação de entitlements
- Lê entitlements existentes; monta `refundedSet` e **não re-ativa** produto `refunded` (`:222-234`) — anti-reembolso burlado.
- Upsert dos `activatable` (`:236-253`): campos `user_id, product_id, source:'kirvano', status:'active', kirvano_transaction_id:txId, kirvano_offer_id:offerIds[0], buyer_email, granted_at, revoked_at:null, metadata{event,raw_offer_ids}`; `onConflict:'user_id,product_id'`.
- **Welcome email** (`:256-269`): isolado; falha → `console.error` (comprador pode precisar de "Esqueci a senha"), **não derruba** o webhook.

### 1.6 Gravação de `purchases` (analytics, isolado — `:271-338`)
- Resolve `lead_id` via `leads.external_id = utm.src` (`:281-294`).
- Por produto: upsert `purchases` com `transaction_id:${txId}_${product_id.slice(0,8)}`, `product_type:inferProductType(label)` (principal/upsell/downsell/order_bump, `:176-183`), `gross_value` (real ou catálogo), **`status:'confirmed'`**, `src:utm.src`, `lead_id`, `utm_*`, `onConflict:'transaction_id'` (`:316-334`).
- Bloco inteiro em `try/catch` → **nunca derruba o fulfillment** (`:336-338`).

### 1.7 Disparo do CAPI (`:340-367`)
- `sendMetaCapiPurchase(payload, {transactionId, productNames, productIds})`.
- Resultado → `capiStatus`: `sent` | `skipped` (missing_credentials) | `failed`. Tudo isolado em try/catch.

### 1.8 REVOKE (`:370-397`)
- `entitlements.update({status:'refunded', revoked_at})` para os produtos do user (`:371-376`).
- Marca `purchases` `confirmed→refunded` por `buyer_email`+`product_name` (`:379-395`, isolado).

### 1.9 Persistência do resultado no log (`kirvano.ts:138-163`)
- Sucesso → `webhook_logs.update({processed, capi_status, capi_error, capi_retries:1, capi_last_attempt})`.
- Erro lançado em `processKirvanoPayload` → log `processed:false` + **500** (Kirvano retenta; upsert idempotente protege).

---

## 2. CAPI — `src/lib/admin/meta-capi.server.ts`

- **Quando:** 1x no webhook aprovado (`kirvano.server.ts:351`) + retentativas no cron.
- **Evento:** `Purchase`, `action_source:'website'`, `event_source_url:'https://rotinadepaz.com.br/'` (`:158-166`).
- **event_id (dedup):** `transactionId ?? sale_id ?? checkout_id` (`:78-79`). Sem ele → não envia (`:80-83`). Mesmo event_id nos retries → Meta deduplica.
- **Pixel/Token:** `process.env.META_PIXEL_ID` / `META_CAPI_TOKEN` (`:17-18`). Sem credenciais → no-op `missing_credentials` (`:70-75`). `API_VERSION='v22.0'`, timeout 8s. Endpoint: `graph.facebook.com/v22.0/${PIXEL_ID}/events` (`:176-177`). **[NÃO VERIFICADO]** que o valor em produção seja `863734499693171` — o ID vem do env, não está hardcoded no código deste repo.
- **`test_event_code`:** `META_CAPI_TEST_CODE` opcional (`:21,169`).

### 2.1 user_data — origem de cada campo (`:138-147`)
| Campo | Origem | Linha |
|---|---|---|
| `em` (sha256) | `payload.customer.email` | `:106,139` |
| `ph` (sha256) | `payload.customer.phone_number/phone/cellphone`, normalizado E.164 (+55) | `:111-121,140` |
| `fn`/`ln` (sha256) | split de `payload.customer.name` | `:107-109,141-142` |
| `external_id` (sha256) | `payload.utm.src ?? payload.src` | `:86,147` |
| `fbp` | `tracking_sessions.fbp` → `cookies.fbp` | `:125,143` |
| `fbc` | `tracking_sessions.fbc` → `fbc(cookies.fbclid)` → `cookies.fbc` | `:126-134,144` |
| `client_ip_address` | `payload.ip ?? tracking_sessions.client_ip` | `:135,145` |
| `client_user_agent` | `tracking_sessions.user_agent` | `:146` |

- **Cruzamento com tracking:** se há `externalId`, busca `tracking_sessions WHERE external_id=externalId` selecionando `fbp,fbc,client_ip,user_agent` (`:96-104`). É **a única fonte** de fbp/fbc/ip/ua de qualidade.
- **custom_data:** `currency:'BRL'`, `content_type:'product'`, `content_name:productNames`, `value:parseBRL(payload.total_price)`, `content_ids:['rotina-de-paz']` (`:149-156`).
- **Log estruturado** (`:172-174`) mostra fbc/fbp/ip/ua/ts_match — é onde se vê o furo ao vivo (`ts_match=NO`).

### 2.2 capi_status / retry / cron — `src/routes/api/cron/capi-retry.ts`
- GET protegido por `CRON_SECRET` (`:39-45`). Horário (comentário `:9`).
- Busca `webhook_logs WHERE capi_status='failed' AND capi_retries<5`, ordem antiga→nova, limit 10 (`:48-54`).
- Reextrai txId; sem txId → `skipped/missing_transaction_id` (`:73-85`). Reenvia → atualiza `capi_status/capi_error/capi_retries/capi_last_attempt` (`:94-130`).
- Colunas de status no `webhook_logs`: `capi_status, capi_error, capi_retries, capi_last_attempt` (gravadas em `kirvano.ts:145-148` e no cron).

---

## 3. LIBERAÇÃO MANUAL — `grant_entitlement_manual` / revoke

- **RPC** (`supabase/migrations/20260528114104_*.sql:28-53`): `grant_entitlement_manual(_email text, _product_id uuid) RETURNS uuid`, `SECURITY DEFINER`.
  - Exige `is_admin(auth.uid())` senão `RAISE 'forbidden'`.
  - Resolve `profiles WHERE lower(email)=lower(_email)`; **se não há conta → `RAISE 'user_not_found:%'`** (≠ webhook, que cria a conta).
  - `INSERT entitlements (source:'manual', status:'active', buyer_email, granted_at:now(), metadata{granted_by:auth.uid()})`.
  - GRANT EXECUTE só p/ `authenticated` (`:55-57`).
- **Pré-requisito:** o aluno **precisa já ter profile** com o mesmo email.
- **Rotas que chamam (grant):** `/admin/acessos` (`admin.acessos.tsx`, RPC via botão de concessão), `/admin/clientes` (`admin.clientes.tsx:241`), `/admin/membros` (`admin.membros.tsx:301`). Toda ação loga via `logAdminAction`.
- **Revoke (manual):** UPDATE direto, **não RPC** — `admin.acessos.tsx:67` e `admin.membros.tsx:332`: `entitlements.update({status:'revoked', revoked_at})`.

### ⚠️ Bug latente confirmado — `'revoked'` viola o CHECK
- O CHECK do schema é `status IN ('active','refunded','canceled','pending')` (`20260528111216_*.sql:72`).
- **`'revoked'` NÃO está na lista.** Busquei alterações posteriores ao constraint em todas as migrations: **nenhuma** (`grep entitlements ... constraint/check/revoked/alter` só retorna FKs e trigger, `20260528141454_*.sql:80,86,139`).
- Logo, o UPDATE manual `status:'revoked'` (`admin.acessos.tsx:67`, `admin.membros.tsx:332`) **deveria falhar com violação de CHECK** no Postgres. **[NÃO VERIFICADO em runtime]** se foi aplicado um constraint diferente direto no banco de produção fora das migrations versionadas. Recomenda-se: ou alinhar o app para gravar `'refunded'`/`'canceled'`, ou adicionar `'revoked'` ao CHECK. Funcionalmente o acesso é cortado de qualquer modo, porque `has_entitlement` só lê `='active'`.

---

## 4. ACESSO NO APP — como o conteúdo valida o direito

- **`has_entitlement(_product_id uuid)`** (`20260528114104_*.sql:10-25`, SQL STABLE SECURITY DEFINER):
  `true` se `_product_id IS NULL` **OU** `is_admin(auth.uid())` **OU** existe `entitlements WHERE user_id=auth.uid() AND product_id=_product_id AND status='active'`.
  → **Só `status='active'` libera.** `refunded`/`revoked`/`canceled`/`pending` cortam.
- **Gating por conteúdo:** colunas `required_product_id` em `ebooks` e `courses` (`20260528114104_*.sql:1-2`, índices `:5-6`); áudios/louvores via `product_id`.
- **Trace compra→acesso:** Kirvano `SALE_APPROVED` → `entitlements(user_id,product_id,status='active')` (`kirvano.server.ts:236-253`) → ao abrir conteúdo, RLS/loader chama `has_entitlement(required_product_id)` que encontra a linha `active` → libera. Reembolso → webhook seta `status='refunded'` → `has_entitlement` deixa de retornar a linha → conteúdo bloqueia.

---

## 5. FUROS CONFIRMADOS (causa raiz no código)

### 5.1 `src ↔ tracking_session = 0/9` — CAPI perde fbp/fbc/ip
**Causa raiz:** o app "Rotina de Paz" **não grava `tracking_sessions`**. Confirmado:
- `grep upsert_tracking_session src/` → **nada** (writer não está neste repo).
- O único client-side relacionado a tracking aqui é `src/lib/utm.ts`, que **só** captura UTMs para `localStorage` e decora a URL da Kirvano (`captureUtms`/`buildKirvanoUrl`, `utm.ts:6-44`) — **não chama `upsert_tracking_session` nem grava fbp/fbc**.
- O RPC `upsert_tracking_session` existe nas migrations (`20260605_hardening_rpcs.sql:95-118`) com GRANT p/ `anon,authenticated`, mas o **chamador é o Quiz-Sacra** (comentário do código: "Quiz salva tracking session", `:94`; e `20260614_utm_complete_drop_overload.sql:13`: "A versão com p_client_ip … é a única usada pelo **Quiz-sacra**").
- **Consequência:** no CAPI, `sendMetaCapiPurchase` busca `tracking_sessions WHERE external_id=utm.src` (`meta-capi.server.ts:96-104`). Se o Quiz não gravou a sessão para aquele `external_id` (ou o `external_id` não fluiu até a Kirvano via UTM), `ts=null` → `fbp/fbc/ip/user_agent` vêm **MISSING**, restando só `cookies` do payload (raramente presentes). Daí o `ts_match=NO` no log (`:173`) e a estatística 0/9 da reconciliação (`20260614_reconciliation_job.sql:82-100` conta `with_tracking/with_fbc/with_fbp` por `external_id=src`).
- **Não é bug deste app isoladamente:** é uma **fronteira de integração** Quiz↔Rotina. O conserto mora no Quiz (gravar `tracking_sessions` no carregamento da LP/quiz com o mesmo `external_id` que vai na UTM `src` até a Kirvano), não em `meta-capi.server.ts`.

### 5.2 `client_ip` sempre null
**Causa raiz no caminho deste repo:**
- A assinatura de `upsert_tracking_session` versionada **aqui** insere apenas `(external_id, fbp, fbc, fbclid, user_agent)` — **sem `client_ip`** (`20260605_hardening_rpcs.sql:107-113`).
- Existe referência a uma overload de **6 args com `p_client_ip`** (`20260614_utm_complete_drop_overload.sql:12-19`), mas o **DDL de criação dessa versão de 6 args não está nas migrations deste repo** → vive no Quiz-Sacra. **[NÃO VERIFICADO neste repo]**.
- A migration que adiciona/popula `client_ip` (`20260608_tracking_session_client_ip.sql`) aparece como **untracked no working tree do OUTRO clone** (git status do início da sessão lista `supabase/migrations/20260608_tracking_session_client_ip.sql` como `??`), ou seja, **não commitada / não aplicada via histórico versionado**.
- No CAPI, `client_ip_address = payload.ip ?? ts.client_ip` (`meta-capi.server.ts:135`). Como (a) o Kirvano normalmente não envia `payload.ip` e (b) `ts` é null (furo 5.1) ou `ts.client_ip` é null (coluna não populada), o resultado é **client_ip ausente** na maioria dos eventos. Confirma o "client_ip sempre null".

---

## Apêndice — evidências `arquivo:linha`
- Webhook handler/auth/rate-limit: `src/routes/api/public/webhooks/kirvano.ts:83-184`.
- Processamento/entitlement/purchase/revoke: `src/lib/admin/kirvano.server.ts:38-55,139-164,189-398`.
- CAPI: `src/lib/admin/meta-capi.server.ts:17-23,66-189`.
- Cron retry: `src/routes/api/cron/capi-retry.ts:34-140`.
- grant/has_entitlement: `supabase/migrations/20260528114104_*.sql:10-57`.
- CHECK status entitlements: `supabase/migrations/20260528111216_*.sql:72`.
- Revoke manual (UPDATE 'revoked'): `src/routes/admin.acessos.tsx:67`; `src/routes/admin.membros.tsx:332`; grant nas telas: `admin.clientes.tsx:241`, `admin.membros.tsx:301`.
- upsert_tracking_session RPC (5 args, sem client_ip): `supabase/migrations/20260605_hardening_rpcs.sql:95-118`.
- overload 6 args c/ p_client_ip (DDL ausente aqui): `supabase/migrations/20260614_utm_complete_drop_overload.sql:12-19`.
- UTM client-side (não grava tracking): `src/lib/utm.ts:6-44`.
- Reconciliação tracking (0/9): `supabase/migrations/20260614_reconciliation_job.sql:82-100`.
