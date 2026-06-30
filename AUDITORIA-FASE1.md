# AUDITORIA FASE 1 — Inventário de Eventos Meta

**Data:** 2026-06-14
**Pixel canônico:** 838169472100225
**2º pixel (banido):** 3207450996117474
**Repos auditados:** Quiz-sacra, rotina-de-paz-app, checkout-sacra

---

## Legenda das fontes

| Sigla | Descrição |
|-------|-----------|
| QS-PIX | Quiz-sacra — pixel client (fbq inline no index.html ou via JS) |
| QS-JS  | Quiz-sacra — JS tracking (tracking.ts / QuizApp.tsx) |
| CS-PIX | Checkout-sacra — pixel client (usePixel hook → fbq) |
| CS-TE  | Checkout-sacra — track-event.ts → edge fn track-event → capi-relay |
| CS-PPO | Checkout-sacra — process-paid-order.ts (server, post-pagamento principal) |
| CS-PPU | Checkout-sacra — process-paid-upsell-order.ts (server, post-pagamento upsell/downsell) |
| RDP-CAPI | rotina-de-paz-app — meta-capi.server.ts (CAPI Kirvano) |
| KIR-IC | Kirvano IC (painel) — inferido como desligado |

---

## Tabela de Eventos

### PageView

| Fonte | Arquivo:linha | event_id | content_ids | Params | Condição | Domain guard | Status |
|-------|---------------|----------|-------------|--------|----------|--------------|--------|
| QS-PIX | Quiz-sacra/index.html:18 | NENHUM | — | — | Carga do HTML, incondicional | Nenhum (dispara em qualquer domínio) | **FALTA** event_id; **FALTA** domain guard |
| QS-PIX | Quiz-sacra/index.html:40 | — | — | noscript img | Fallback noscript | Nenhum | OK (noscript) |
| CS-PIX | checkout-sacra/src/hooks/usePixel.ts:63 | `pv_{trackingProfileId}_{timestamp}` | — | — | 1x por rota+pixel (Set dedup) | isPixelAllowed() allowlist rotinadepaz.com.br | OK |
| CS-TE | via track-event → capi-relay (CAPI_EVENTS inclui PageView) | Mesmo event_id do pixel | — | page_url, referrer | Se track-event receber PageView | BLOCKED_HOSTS no track-event | OK |

### ViewContent

| Fonte | Arquivo:linha | event_id | content_ids | Params | Condição | Domain guard | Status |
|-------|---------------|----------|-------------|--------|----------|--------------|--------|
| CS-TE+PIX | checkout-sacra/src/lib/track-event.ts:132-137 | `ViewContent_{timestamp}_{rand4}` | — | content_name (ex: 'checkout', 'home', 'quiz', 'upsell', 'downsell', 'obrigado') | Chamado nos useEffect de cada página | isPixelAllowed() | OK |
| CS-TE | via capi-relay (CAPI_EVENTS não lista ViewContent... **espera, lista sim**: `PageView, ViewContent, Lead, InitiateCheckout, AddPaymentInfo, Purchase`) | Mesmo event_id | — | — | Relay automático | Domain guard no capi-relay | OK |

**Nota:** Quiz-sacra NÃO dispara ViewContent (nenhum fbq('track','ViewContent') encontrado).

### Lead

| Fonte | Arquivo:linha | event_id | content_ids | Params | Condição | Domain guard | Status |
|-------|---------------|----------|-------------|--------|----------|--------------|--------|
| QS-JS | Quiz-sacra/src/components/quiz/QuizApp.tsx:483 | `lead_{externalId}` (externalId = `qs_UUID` localStorage) | — | content_name: "Rotina de Paz", value: 0, currency: "BRL" | submitContact() com email OU whatsapp válido | Nenhum domain guard no fbq | **FALTA** domain guard |
| QS-JS | QuizApp.tsx:478 | — | — | Re-init pixel com Advanced Matching (em, ph, external_id) antes do Lead | Idem | Idem | OK (AM) |
| CS-TE+PIX | checkout-sacra/src/lib/track-event.ts:165-170 → Quiz.tsx:110 | `Lead_{timestamp}_{rand4}` | — | ZERO PII | Quiz Sacra (checkout-sacra repo), na captura do nome | isPixelAllowed() | OK |

**DUP potencial:** Se o quiz Quiz-sacra E o quiz checkout-sacra estão ambos em produção, um Lead pode ser disparado em AMBOS com event_ids DIFERENTES → duplicação no Meta. Porém checkout-sacra está OFF, então hoje não há dup.

### QuizStep (Custom)

| Fonte | Arquivo:linha | event_id | content_ids | Params | Condição | Domain guard | Status |
|-------|---------------|----------|-------------|--------|----------|--------------|--------|
| QS-JS | Quiz-sacra/src/components/quiz/QuizApp.tsx:302 | NENHUM | — | step, total, question | Cada pergunta EXIBIDA (useEffect qIndex) | Nenhum | **FALTA** event_id; **FALTA** domain guard |

### InitiateCheckout

| Fonte | Arquivo:linha | event_id | content_ids | Params | Condição | Domain guard | Status |
|-------|---------------|----------|-------------|--------|----------|--------------|--------|
| QS-JS | Quiz-sacra/src/lib/tracking.ts:149 | `ic_{externalId}_{scope}` (scope = contentName normalizado, max 24 chars) | `["rotina_de_paz"]` | content_name, currency: BRL, value (se fornecido) | checkout() no QuizApp + handleAccept() no OfferPage | Nenhum domain guard no fbq | **FALTA** domain guard |
| CS-TE+PIX | checkout-sacra/src/lib/track-event.ts:140-151 → Checkout.tsx:403 | `InitiateCheckout_{timestamp}_{rand4}` | `["jornada_7dias_paz"]` | value (totalCents/100) | Submit do form de pagamento | isPixelAllowed() | OK |
| CS-TE | via capi-relay | Mesmo event_id | sanitizeContentIds | value, currency BRL | Relay automático | capi-relay domain guard | OK |

**DUP REAL (quando checkout-sacra ativo):** O quiz dispara IC no redirect (QS-JS, event_id=`ic_qs_UUID_rotina_de_paz`) e o checkout dispara IC no submit (CS-TE, event_id=`InitiateCheckout_ts_rand`). São event_ids DIFERENTES → **duplicação sem dedup** para a mesma sessão. Porém checkout-sacra está OFF atualmente.

**Quando ambos ativos:** Quiz IC = intenção (clicou CTA), Checkout IC = ação (preencheu form). Semanticamente distintos, mas Meta vê 2 IC por funil.

### AddPaymentInfo

| Fonte | Arquivo:linha | event_id | content_ids | Params | Condição | Domain guard | Status |
|-------|---------------|----------|-------------|--------|----------|--------------|--------|
| CS-TE+PIX | checkout-sacra/src/lib/track-event.ts:153-161 → Checkout.tsx:402 | `AddPaymentInfo_{timestamp}_{rand4}` | — | payment_method (pix/credit_card) | Submit do form | isPixelAllowed() | OK |
| CS-TE | via capi-relay | Mesmo event_id | — | — | Relay automático | capi-relay domain guard | OK |

**Nota:** Nenhuma outra fonte dispara AddPaymentInfo. Quiz-sacra NÃO dispara. Kirvano NÃO dispara (desligado).

### Purchase

| Fonte | Arquivo:linha | event_id | content_ids | Params | Condição | Domain guard | Status |
|-------|---------------|----------|-------------|--------|----------|--------------|--------|
| CS-PIX+TE | checkout-sacra/src/pages/ThankYou.tsx:39 + track-event.ts:173-189 | `Purchase_{timestamp}_{rand4}` (gerado no Checkout.tsx:406, salvo em sessionStorage) | `["jornada_7dias_paz"]` | value (purchaseValue de sessionStorage) | rdp_payment_confirmed === 'true' em sessionStorage | isPixelAllowed() | OK mas **RELOAD = re-disparo se sessionStorage não limpo** — limpeza existe (linha 43-45) |
| CS-TE | via capi-relay (track-event forward) | Mesmo event_id | sanitizeContentIds | value | Forward automático | Domain guard | **DUP** com CS-PPO (ver abaixo) |
| CS-PPO | checkout-sacra/supabase/functions/_shared/process-paid-order.ts:198 | Preferência: metadata.purchase_event_id (= mesmo do pixel). Fallback: `Purchase_{ts}_{rand}` | safeContentIds(product_slug) | value = amount_cents/100, currency BRL, geodata, PII hashed | Webhook/polling pagamento confirmado. Lock atômico: capi_purchase_sent_at IS NULL | Server-only (capi-relay domain guard) | OK dedup SE metadata.purchase_event_id presente |
| CS-PPU | checkout-sacra/supabase/functions/_shared/process-paid-upsell-order.ts:188-218 | `rdp_{upsell|downsell}_purchase_{uuid}` (estável, determinístico) | safeContentIds(product_slug) | value = amount_cents/100 | Per-step flag: capi_purchase_sent_at IS NULL | Server-only | OK |
| RDP-CAPI | rotina-de-paz-app/src/lib/admin/meta-capi.server.ts:66 → kirvano.server.ts:326 | `sale_id` (transactionId do Kirvano) | productIds (UUIDs do DB) | value = parseBRL(total_price), currency BRL, PII hashed | SALE_APPROVED no webhook Kirvano. Guard: event_id obrigatório | Server-only | OK |

**content_ids divergentes:** RDP-CAPI envia UUIDs do DB (ex: `"abc123-def456"`), CS-PPO/PPU envia slugs sanitizados (`"jornada_7dias_paz"`). Isso impede dedup cross-sistema por content_ids (não afeta dedup por event_id, mas polui o catálogo do pixel).

### CompleteRegistration

**NENHUMA FONTE DISPARA.** Nenhum fbq('track','CompleteRegistration') encontrado em nenhum repo.

---

## Duplicações Encontradas

### DUP-1: Purchase pixel client + Purchase CAPI (ThankYou → capi-relay)
- **Fontes:** CS-PIX+TE (ThankYou.tsx) + CS-PPO (process-paid-order.ts)
- **event_id:** Compartilhado quando metadata.purchase_event_id está presente (gerado no Checkout.tsx, salvo em sessionStorage, passado via metadata Pagar.me → webhook → processPaidOrder).
- **Status:** **DEDUP OK** quando o event_id do pixel chega ao webhook via metadata. Se metadata.purchase_event_id estiver ausente (ex: PIX timeout, sessionStorage limpo), o server gera um novo → **dois eventos no Meta com event_ids diferentes = DUP**.

### DUP-2: InitiateCheckout Quiz × Checkout (quando ambos ativos)
- **Fontes:** QS-JS (tracking.ts) + CS-TE (track-event.ts)
- **event_id:** Completamente diferentes (`ic_qs_UUID_scope` vs `InitiateCheckout_ts_rand`)
- **Status:** **DUP sem dedup.** Atualmente mitigado porque checkout-sacra está OFF. Quando ativar, haverá 2 IC por funil.

### DUP-3: PageView Quiz-sacra (sem event_id)
- **Fontes:** QS-PIX (index.html:18) — fbq('track','PageView') sem eventID
- **Status:** Se capi-relay algum dia receber PageView para o mesmo usuário, não há event_id para dedup. Risco baixo hoje (quiz não envia PageView via CAPI).

### DUP-4: Purchase RDP-CAPI + CS-PPO (se ambos pipelines processam a mesma venda)
- **Fontes:** RDP-CAPI (Kirvano webhook → meta-capi.server.ts) + CS-PPO (Pagar.me webhook → process-paid-order.ts)
- **event_id:** RDP-CAPI usa `sale_id` (Kirvano), CS-PPO usa `Purchase_{ts}_{rand}` ou metadata.purchase_event_id
- **Status:** **Não ocorre hoje** porque IC Kirvano está desligado E checkout-sacra está OFF. Mas se ambos forem ativados para a mesma oferta, a mesma venda geraria 2 Purchases com event_ids diferentes → **DUP fatal**.

---

## Buracos Encontrados

### BURACO-1: PageView do Quiz sem event_id
- **Arquivo:** Quiz-sacra/index.html:18
- **Impacto:** Impossibilita dedup pixel↔CAPI para PageView. Cada reload = novo PageView sem proteção.

### BURACO-2: PageView do Quiz sem domain guard
- **Arquivo:** Quiz-sacra/index.html:17-18
- **Impacto:** Pixel dispara em qualquer domínio (preview Vercel, localhost, etc.). Contamina dados.

### BURACO-3: Lead do Quiz sem domain guard
- **Arquivo:** Quiz-sacra/src/components/quiz/QuizApp.tsx:483
- **Impacto:** Lead dispara em previews/dev. Contamina contagem de leads.

### BURACO-4: InitiateCheckout do Quiz sem domain guard
- **Arquivo:** Quiz-sacra/src/lib/tracking.ts:149
- **Impacto:** IC dispara em previews/dev.

### BURACO-5: QuizStep custom sem event_id
- **Arquivo:** Quiz-sacra/src/components/quiz/QuizApp.tsx:302
- **Impacto:** Evento custom sem dedup (menor gravidade, não é evento padrão Meta).

### BURACO-6: ViewContent ausente no Quiz-sacra
- **Impacto:** O funil do Quiz-sacra não emite ViewContent. O checkout-sacra emite. Gap na jornada de atribuição.

### BURACO-7: CompleteRegistration não disparado por ninguém
- **Impacto:** Se o funil pretende rastrear registro/conclusão do quiz, esse evento está ausente.

### BURACO-8: AddPaymentInfo ausente no funil Kirvano
- **Impacto:** Quando o funil passa pelo Kirvano (não pelo checkout-sacra), nenhum AddPaymentInfo é disparado.

### BURACO-9: content_ids divergentes entre RDP-CAPI e CS-PPO
- **RDP-CAPI:** Envia UUIDs do banco (ex: `"a1b2c3d4-..."`)
- **CS-PPO/PPU:** Envia slugs sanitizados (`"jornada_7dias_paz"`)
- **Impacto:** Catálogo de produtos no Events Manager fica poluído com IDs inconsistentes.

### BURACO-10: fbc/fbp podem estar ausentes no Purchase CAPI (RDP-CAPI)
- **Arquivo:** rotina-de-paz-app/src/lib/admin/meta-capi.server.ts:113-118
- **Condição:** Se tracking_session não existir para o external_id (quiz abandonado antes do saveTrackingSession, ou external_id não propagado pelo Kirvano), fbc/fbp ficam NULL → EMQ degradado.

---

## Observações sobre o 2º Pixel (3207450996117474)

1. **BANIDO explicitamente** em checkout-sacra/src/config/tracking.ts:29 — está na lista `BANNED_PIXELS` com comentário "Pixel V4 contaminado por vazamento Vercel + flag domínio".
2. **NÃO aparece** em nenhum fbq('init') ativo nos 3 repos.
3. **NÃO aparece** no meta-capi.server.ts (que usa `process.env.META_PIXEL_ID`).
4. **NÃO aparece** no capi-relay (que usa `Deno.env.get('META_PIXEL_ID')`).
5. **Status:** Totalmente removido do código. Seguro — nenhum evento vai para esse pixel.

---

## Resumo por Evento

| Evento | Quiz-sacra pixel | Quiz-sacra JS | Checkout-sacra pixel | Checkout-sacra CAPI | RDP-CAPI (Kirvano) | Kirvano painel |
|--------|-----------------|---------------|---------------------|--------------------|--------------------|----------------|
| PageView | SIM (sem event_id, sem guard) | — | SIM (com event_id, com guard) | SIM (relay) | — | DESLIGADO |
| ViewContent | — | — | SIM | SIM (relay) | — | DESLIGADO |
| Lead | — | SIM (sem guard) | SIM (checkout OFF) | SIM (relay, checkout OFF) | — | DESLIGADO |
| QuizStep | — | SIM (custom, sem event_id) | — | — | — | — |
| InitiateCheckout | — | SIM (sem guard) | SIM (checkout OFF) | SIM (relay, checkout OFF) | — | DESLIGADO |
| AddPaymentInfo | — | — | SIM (checkout OFF) | SIM (relay, checkout OFF) | — | DESLIGADO |
| Purchase | — | — | SIM (ThankYou, checkout OFF) | SIM (PPO+PPU, checkout OFF) | SIM (fonte única ativa) | DESLIGADO |
| CompleteRegistration | — | — | — | — | — | — |

**Fonte única de Purchase em produção hoje:** RDP-CAPI via webhook Kirvano → meta-capi.server.ts → Graph API direta (sem capi-relay intermediário).
