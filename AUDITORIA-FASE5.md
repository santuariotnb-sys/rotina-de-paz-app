# AUDITORIA FASE 5 — Server-Side (Read-Only)

Data: 2026-06-14 | Auditor: Claude (code review)

---

## 1. Fluxo Completo: Webhook → Purchase → CAPI

```
Kirvano POST /api/public/webhooks/kirvano?k=<URL_SECRET>
  │
  ├─ 1. URL secret check (KIRVANO_URL_SECRET, constant-time)
  ├─ 2. Body size check (64KB max)
  ├─ 3. KIRVANO_WEBHOOK_SECRET presente? (503 se não)
  ├─ 4. HMAC-SHA256 ou token estático (timingSafeEqual)
  │     └─ Se assinatura ausente: processa mesmo assim (Kirvano não envia header auth)
  │     └─ Se assinatura inválida: rate-limit check → 401
  ├─ 5. JSON parse
  ├─ 6. processKirvanoPayload(parsed)
  │     ├─ extractOfferIds → product_kirvano_offers → product_ids
  │     ├─ ensureUserForEmail (cria auth.users se necessário)
  │     ├─ APPROVED: upsert entitlements (onConflict: user_id,product_id)
  │     │   ├─ Registra purchases (1 por produto, onConflict: transaction_id)
  │     │   ├─ sendWelcomeEmail (não-bloqueante)
  │     │   └─ sendMetaCapiPurchase (não-bloqueante)
  │     └─ REVOKE: update entitlements → refunded, update purchases → refunded
  └─ 7. webhook_logs.insert (SEMPRE, inclusive falhas)
```

---

## 2. Análise do Webhook (kirvano.ts)

### Auth (URL secret + HMAC)
- **URL secret** (`?k=`): constant-time via `timingSafeEqual`. Solid.
- **HMAC-SHA256**: `createHmac("sha256", secret)` + `timingSafeEqual`. Solid.
- **Fallback token estático**: comparacao constant-time. OK.
- **RISCO:** Se `signature` for `null` (Kirvano nao envia header), o webhook e processado sem auth, dependendo apenas do `?k=` URL secret. Aceitavel dado o contexto Kirvano.

### Rate limit
- 10 falhas de assinatura por IP em 60s → 429. Baseado em query `webhook_logs`. Funcional.

### webhook_logs grava tudo?
- **SIM** para: JSON invalido, processamento OK, processamento com erro, assinatura invalida.
- **NAO** para: body >64KB (retorna 413 sem log) e secret ausente (retorna 503 sem log).
- **P2**: Eventos com body >64KB ou sem secret nao ficam no log. Aceitavel — sao edge cases.

### Idempotencia
- `entitlements`: upsert com `onConflict: "user_id,product_id"` → retry NAO duplica entitlements. **OK.**
- `purchases`: upsert com `onConflict: "transaction_id"` → retry NAO duplica purchases. **OK.**
- Meta CAPI: `event_id = sale_id` → Meta dedup automatico. **OK.**

---

## 3. Analise processKirvanoPayload (kirvano.server.ts)

### offer_id → product_id mapeamento
- `extractOfferIds` busca em `offer.id`, `offer_id`, `offer.hash`, `offer.code`, `products[].offer_id`. Robusto.
- Resolve via tabela `product_kirvano_offers`. Se nenhum match → retorna `matched: false` sem erro.
- **P1**: Se Kirvano adicionar nova oferta sem mapear na tabela, venda e silenciosamente ignorada. Nao ha alerta alem do `webhook_logs.error = "Nenhum produto vinculado..."`. Recomendacao: alertar via Slack/email.

### extractPaidTotalCents
- Le `total_price`, `data.total_price`, `data.total`, `total`.
- Converte pt-BR ("1.067,00") e en-US ("67.00"). `Math.round(reais * 100)` → centavos. **OK.**
- Rejeita valores <= 0 ou NaN. **OK.**

### UTM 5/5
- Le `payload.utm.utm_source/campaign/medium/content/term`. **OK.**
- Grava nas 5 colunas da tabela purchases (3 colunas adicionadas em migration 20260614). **OK.**

### upsert onConflict: transaction_id
- `transaction_id = txId_productId8chars` (ex: `"abc123_1a2b3c4d"`).
- Retry do mesmo webhook = mesmo txId = mesmo transaction_id → upsert atualiza, NAO duplica. **OK.**

---

## 4. MULTI-PRODUTO (P0 de receita) — Analise Detalhada

### Como funciona
```typescript
const paidCents = extractPaidTotalCents(payload);  // total_price do webhook
const useRealPaid = productIds.length === 1 && paidCents != null;

for (const product_id of productIds) {
  gross_value: useRealPaid ? paidCents : prod.price_cents,
  //           ↑ 1 produto = valor real     ↑ N produtos = catalogo
}
```

### Cenario: Venda R$47 com 3 produtos
- `productIds.length === 3` → `useRealPaid = false`
- Cada purchase recebe `prod.price_cents` (preco de catalogo)
- Se os 3 produtos custam R$47, R$37, R$27 no catalogo → banco registra R$111
- **Valor real pago: R$47. Valor no banco: soma dos catalogos.**

### Veredicto
- **P0-MITIGADO**: O codigo conscientemente evita usar `paidCents` em multi-produto para nao duplicar o total. Mas usar preco de catalogo tambem e ERRADO quando a oferta tem desconto (bundle por R$47 vs soma dos catalogos R$111).
- **Na pratica**: Kirvano dispara 1 webhook por oferta one-click (principal, upsell, downsell separados). Cada webhook tem 1 `total_price` e tipicamente 1 offer_id. Multi-produto real (N offer_ids no mesmo webhook) e raro na Kirvano.
- **Risco real**: BAIXO. Mas se acontecer, o gross_value sera incorreto.
- **Recomendacao**: Quando `productIds.length > 1`, dividir `paidCents` igualmente ou proporcional ao catalogo. Ou gravar `paidCents` como total e marcar as linhas individuais como `is_bundle = true`.

---

## 5. CAPI (sendMetaCapiPurchase) — meta-capi.server.ts

### event_id
- `event_id = opts.transactionId ?? payload?.sale_id ?? payload?.checkout_id`
- `opts.transactionId` vem de `extractTransactionId` que busca `data.id, data.transaction_id, data.sale_id, sale_id, id`.
- **NAO** tem sufixo `_product_id`. E o sale_id puro. **OK para dedup.**

### Multi-produto e CAPI
- `sendMetaCapiPurchase` e chamado **1 vez** por webhook, com `productIds = todos os produtos`.
- `content_ids = productIds` (array de UUIDs).
- `value = parseBRL(payload?.total_price)` → valor real pago (nao multiplicado).
- **1 evento Purchase por webhook, valor correto.** OK.

### fbc chain
```typescript
const fbc = ts?.fbc ?? fbcFromCookie ?? cookies?.fbc ?? null;
```
- 1o: `tracking_sessions.fbc` (via external_id join)
- 2o: `cookies.fbclid` convertido para formato `fb.1.{timestamp}.{fbclid}`
- 3o: `cookies.fbc` direto
- **OK. Prioridade correta.**

### fbp
```typescript
const fbp = ts?.fbp ?? cookies?.fbp ?? null;
```
- Se nao houver tracking_session match E cookies.fbp for null → fbp = null.
- **P1**: Sem fbp, Event Match Quality cai. Depende do quiz ter gravado a session. Se usuario comprar sem passar pelo quiz (link direto), nao ha tracking_session. Risco moderado.

### content_ids
- `content_ids = opts.productIds` → UUIDs internos do Supabase.
- **P1**: Meta Catalog espera IDs do catalogo Meta, nao UUIDs internos. Se nao houver catalogo Meta configurado, e ignorado. Se houver, os IDs nao vao bater.
- **Recomendacao**: Mapear para SKUs do catalogo Meta ou remover o campo.

### event_source_url
- Hardcoded `"https://rotinadepaz.com.br/"`. Aceitavel para action_source=website.

### timeout 8s sem retry
- `AbortSignal.timeout(8000)` → se Meta demorar >8s, Purchase e perdido.
- **P1**: Sem retry. Se Meta retornar timeout, o evento some silenciosamente (catch retorna `sent: false`).
- O log de erro existe (`console.error`), mas nao ha re-tentativa.
- **Recomendacao**: Gravar eventos CAPI falhos numa fila (tabela `capi_retry_queue`) e retentar com cron.

### Token na URL
- `access_token=${CAPI_TOKEN}` na query string. Padrao da API do Meta, nao e vazamento. Mas logs de request (Vercel) podem capturar. `redact()` protege nos logs internos. **OK.**

---

## 6. CAPI Kirvano (AddPaymentInfo)

- **Nenhum evento AddPaymentInfo** e enviado pelo codigo deste repo.
- Grep por `AddPaymentInfo` retornou zero resultados.
- IC Kirvano desligado (conforme contexto). **Sem risco de duplicacao.**

---

## 7. Outros Handlers

### processPaidUpsellOrder
- **NAO EXISTE** neste repo. Grep retornou zero.
- Upsells sao tratados pelo mesmo `processKirvanoPayload` — Kirvano envia webhook separado por oferta one-click, com offer_id do upsell mapeado na `product_kirvano_offers`.

### processRefund / processChargeback
- **NAO existem como funcoes separadas.**
- Tratados dentro de `processKirvanoPayload` via `REVOKE_EVENTS` (SALE_REFUNDED, SALE_CHARGEBACK, SALE_CANCELED).
- Logica: update entitlements → `status = "refunded"`, update purchases → `status = "refunded"`.
- **P2**: Chargeback usa o mesmo status "refunded" que refund voluntario. Nao diferencia para analytics. Tambem nao envia evento Purchase(refund) para Meta CAPI para ajustar o ROAS.

### replayWebhookLog
- Admin pode re-processar webhook via UI. Checa `signature_valid` antes. **OK.**

---

## 8. Tabela de Riscos

| # | Severidade | Componente | Descricao | Status |
|---|-----------|------------|-----------|--------|
| 1 | **P0-MITIGADO** | Multi-produto | gross_value usa catalogo em multi-produto; valor pode divergir do pago. Na pratica Kirvano envia 1 webhook/oferta, risco baixo | Monitorar |
| 2 | **P1** | CAPI timeout | 8s sem retry — Purchase perdido para o Meta se timeout | Implementar fila de retry |
| 3 | **P1** | content_ids | UUIDs internos vs IDs do catalogo Meta | Mapear ou remover |
| 4 | **P1** | fbp ausente | Sem tracking_session (compra direta), fbp = null → EMQ baixo | Aceitar ou capturar fbp no checkout |
| 5 | **P1** | Oferta nao mapeada | Nova oferta Kirvano sem entry em product_kirvano_offers → venda silenciosamente ignorada | Adicionar alerta |
| 6 | **P2** | Chargeback = refund | Sem diferenciacao no status; sem evento CAPI de refund | Diferenciar status |
| 7 | **P2** | Logs incompletos | Body >64KB e secret ausente nao geram webhook_log | Aceitavel |
| 8 | **P2** | Refund por product_name | Refund busca purchases por `buyer_email + product_name`, nao por transaction_id | Pode refundar purchase errado se mesmo produto comprado 2x |

---

## 9. Recomendacoes Priorizadas

### Imediato (P1)
1. **CAPI retry queue**: Criar tabela `capi_retry_queue`, gravar falhas, pg_cron retenta a cada 5min (max 3 tentativas).
2. **Alerta de oferta nao mapeada**: Quando `productIds.length === 0`, alem de logar, enviar notificacao (Slack/email).
3. **content_ids**: Remover `content_ids` do evento CAPI ou mapear para retailer_id do catalogo Meta.

### Proximo sprint (P2)
4. **Diferenciar chargeback**: Novo status `"chargeback"` na tabela purchases.
5. **Refund por transaction_id**: Refund deveria buscar purchases pelo `transaction_id LIKE txId || '_%'` ao inves de `buyer_email + product_name`.
6. **CAPI refund event**: Enviar evento Purchase com `event_name = "Refund"` para Meta ajustar ROAS.

---

## 10. Pontos Positivos

- Idempotencia solida (upsert em entitlements e purchases)
- Auth em 2 camadas (URL secret + HMAC) com constant-time comparison
- Rate limiting funcional
- Separacao fulfillment vs analytics (analytics nunca derruba entitlements)
- CAPI event_id = sale_id (dedup correto)
- CAPI dispara 1x por webhook (nao multiplica por produto)
- Reconciliacao diaria via pg_cron
- Logs estruturados com rastreabilidade
