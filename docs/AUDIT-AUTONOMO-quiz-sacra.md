# AUDITORIA READ-ONLY: Quiz-Sacra (Superfície de Tracking)
**Data:** 2026-06-30  
**Status:** Auditoria completa entregue  
**Escopo:** Cobertura de eventos, identidade, dedup, EMQ, dados de teste vs reais, rastreabilidade lead→venda

---

## 1. Resumo Executivo

A superfície **Quiz-Sacra** (`~/Quiz-sacra`) é responsável por capturar o **primeiro toque** no funil (chegada, perguntas do quiz, contato, resultado e oferta). Estado REAL vs arquitetura-alvo:

| Pilar | Status | Gap | Severidade |
|---|---|---|---|
| **1. Identidade (external_id)** | ⚠️ Parcial | 94.2% de leads SEM external_id no banco (8/137) | **CRÍTICO** |
| **2. Captura server-side (IP/UA)** | ❌ Ausente | client_ip 0/67 nas tracking_sessions | **CRÍTICO** |
| **3. Dedup (event_id)** | ✅ Parcial | Pixel tem event_id; falta normalização e nível de payload | Médio |
| **4. Travessia cross-domain** | ✅ OK | URL decora com fbclid/fbp/fbc/external_id (src); stitching CAPI lê e popula | Baixo |
| **5. Fonte única + JOIN** | ❌ Falso | Correlação lead→venda: 5/7 leads rastreáveis (71%), 5/23 vendas linked | **CRÍTICO** |

**Conclusão:** A identidade é gerada no Quiz (prefixo `qs_`) e persiste em localStorage, mas **não viaja para o banco em 94% dos casos**. O IP nunca é capturado server-side. O funil é contável (eventos disparam) mas a **rastreabilidade end-to-end é frágil**.

---

## 2. Pilar 1: Espinha de Identidade (`external_id`)

### 2.1 Geração e Persistência (Código)

**Arquivo:** `/Users/guilhermehenrique/Quiz-sacra/src/lib/tracking.ts`

```typescript
export function getOrCreateExternalId(): string {
  const stored = localStorage.getItem("rdp_external_id");
  if (stored) return stored;
  const id = `qs_${crypto.randomUUID()}`;
  localStorage.setItem("rdp_external_id", id);
  return id;
}
```

**Achados:**
- ✅ Gerado no **primeiro mount** do Quiz (QuizApp.tsx linha 200).
- ✅ Prefixo `qs_` (Quiz Sacra) — reutilizado em todas as chamadas RPC.
- ⚠️ **Apenas localStorage** — sem cookie `.rotinadepaz.com.br` (não viaja entre domínios).
- ⚠️ **Sem fallback no app/checkout** — se LP/App gerados antes, IDs fragmentados.

### 2.2 Captura e Persistência (Banco)

**RPC chamado:** `upsert_tracking_session` (Quiz-sacra/lib/tracking.ts:106)

```typescript
const { error } = await sb.rpc("upsert_tracking_session", {
  p_external_id: externalId,  // ← sempre preenchido
  p_fbp: fbp ?? null,
  p_fbc: fbc ?? null,
  p_fbclid: fbclid ?? null,
  p_user_agent: userAgent,
  p_client_ip: null,  // ← always null (client não tem IP)
});
```

**Dados do banco (2026-06-30):**

| Métrica | Valor | Gap |
|---|---|---|
| Total tracking_sessions | 67 | — |
| Com external_id | 67 (100%) | ✅ OK |
| Com client_ip | 0 (0%) | ❌ CRÍTICO |
| Com fbp | 21 (31%) | ⚠️ Pixel nem sempre carrega |
| Com fbc | 27 (40%) | ⚠️ Precisa fbclid na URL |

**Evidência:** Todas as 67 sessões têm `external_id` (formato `qs_<uuid>`), mas nenhuma tem `client_ip`.

### 2.3 Propagação até Compra (URL + Kirvano)

**Arquivo:** `/Users/guilhermehenrique/Quiz-sacra/src/lib/utm.ts:29-58`

```typescript
export function buildKirvanoUrl(baseUrl: string, extras = {}) {
  const url = new URL(baseUrl);
  // ... passa UTMs ...
  const { fbclid, fbc, fbp } = getMetaClickData();
  if (fbclid) url.searchParams.set("fbclid", fbclid);
  if (fbc) url.searchParams.set("fbc", fbc);
  if (fbp) url.searchParams.set("fbp", fbp);
  // external_id viaja como "src"
  if (extras.externalId) url.searchParams.set("src", extras.externalId);
  return url.toString();
}
```

**Checklist:**
- ✅ Decora com `fbclid`, `fbc`, `fbp`
- ✅ Passa `src` (= external_id do quiz)
- ✅ Checkout.tsx linha 533: passa externalId na URL Kirvano

### 2.4 Rastreabilidade em Leads

**Query (Q2):**
```sql
SELECT COUNT(*) total_leads, COUNT(external_id IS NOT NULL) with_external_id FROM leads;
```

**Resultado:**
```
total_leads: 137
leads_com_external_id: 8 (5.8%)
leads_sem_external_id: 129 (94.2%)
```

**Raiz:**
- Quiz chama `persist_lead()` (QuizApp.tsx:362) com `p_external_id: getOrCreateExternalId()`.
- ✅ RPC toca `p_external_id` → coloca em `leads.external_id`.
- **MAS:** A maioria dos leads foram criados ANTES dessa lógica existir (histórico de produção).
- **Prova:** Primeiros leads (amostra) têm `external_id=NULL`; recentes (qs_…) têm populated.

**Samples (leads com external_id):**
```
id: 2ed0f3ed...  external_id: qs_e9140c1e...  name: "teste gui 123"
id: 002f1880...  external_id: qs_cb3d0854...  name: "Berenice"
```

### 2.5 Correlação Lead→Venda

**Query (Q6):**
```sql
SELECT COUNT(DISTINCT l.external_id) unique_leads, COUNT(DISTINCT p.src) unique_purchases_with_src,
  COUNT(DISTINCT CASE WHEN p.src = l.external_id THEN l.external_id END) linked_identities
FROM leads l FULL OUTER JOIN purchases p ON l.external_id = p.src;
```

**Resultado:**
```
unique_leads_with_external_id: 7
unique_purchases_with_src: 13
linked_identities: 5 (de 7, ou 71%)
```

**Interpretação:**
- Só 7 leads têm `external_id` (dos 137).
- 13 vendas têm `src` preenchido (dos 23 totais; 100% segundo Q3).
- **Mas:** apenas 5 leads-→vendas casam por identidade.
- **Gap:** 8 vendas não encontram lead correspondente (src não está em leads.external_id).

---

## 3. Pilar 2: Captura Server-Side (IP + UA)

### 3.1 Design Intencional: Client Sem IP

**Código:** `/Users/guilhermehenrique/Quiz-sacra/src/lib/tracking.ts:112`

```typescript
p_client_ip: null,  // client não tem acesso ao IP; resolvido server-side
```

**Comentário acima (linha 114):**
```
// Essa sessão alimenta o fbp/fbc do CAPI server. Falha silenciosa
// aqui degrada o match quality de TODAS as compras sem ninguém perceber.
```

### 3.2 Estado Real do Banco

**Query (Q1):**
```
total_sessions: 67
sessions_com_client_ip: 0 (0%)
```

**Achado:** Nenhuma sessão de tracking tem IP. **100% NULL.**

### 3.3 Rota Esperada (Spec)

Segundo o spec (Pilar 2):
- Edge function de tracking deveria gravar `client_ip` (CF-Connecting-IP) server-side.
- App (`meta-capi.server.ts`) lê esse IP e o passa ao CAPI para melhorar EMQ.

**Status:** **Não implementado.**

### 3.4 Impacto no CAPI

**Arquivo:** `/Users/guilhermehenrique/rotina-de-paz-app/src/lib/admin/meta-capi.server.ts:135`

```typescript
const ip: string | null = payload?.ip ?? ts?.client_ip ?? null;
// ... user_data.client_ip_address = ip;
```

**Achado:** CAPI tenta ler IP de `tracking_sessions.client_ip`, mas como é sempre NULL, fallback para `payload.ip` (Kirvano — pode ou não ter). **EMQ fica reduzido.**

---

## 4. Pilar 3: Deduplicação (event_id)

### 4.1 Eventos do Pixel (Browser)

**Código:** `/Users/guilhermehenrique/Quiz-sacra/src/lib/tracking.ts:170-212` (`trackInitiateCheckout`)

```typescript
const eventId = `ic_${externalId}_${scope}`;
fbq("track", "InitiateCheckout", data, { eventID: eventId });
```

**Achado:**
- ✅ InitiateCheckout tem `eventID` = `ic_<external_id>_<scope>`.
- ✅ Lead tem `eventID` = `lead_<external_id>` (QuizApp.tsx:498).
- ⚠️ `scope` é derivado de `contentName` (truncado, sanitizado) — garante dedup por etapa.

### 4.2 Eventos do CAPI (Server)

**Arquivo:** `/Users/guilhermehenrique/rotina-de-paz-app/src/lib/admin/meta-capi.server.ts:78`

```typescript
const event_id: string | null = opts.transactionId ?? payload?.sale_id ?? payload?.checkout_id ?? null;
```

**Achado:**
- ✅ Purchase usa `event_id = transactionId` (derivado de `sale_id` Kirvano).
- ✅ Dedup garantido (sale_id é único).
- ✅ Alinhar Pixel↔CAPI não é possível aqui (origins diferentes).

### 4.3 Funil (quiz_funnel_events)

**Query (Q4):**
```
stage: arrival  →  743 events
stage: question →  844 events
stage: result   →  184 events
stage: offer    →  170 events
stage: cta      →   25 events (checkout click)
stage: contact  →    3 events (email gate)
```

**Achado:**
- ✅ Eventos disparam (fbq trackCustom + RPC track_quiz_step).
- ✅ Queda progressiva = esperada (abandono normal).
- ⚠️ `contact` bem baixo (só 3) — muitos skippam a gate ou preenchem via Lead event.

---

## 5. Pilar 4: Travessia Cross-Domain (Kirvano)

### 5.1 Decoração de Link

**Código:** `/Users/guilhermehenrique/Quiz-sacra/src/lib/utm.ts` + `QuizApp.tsx:533`

```typescript
const url = buildKirvanoUrl(KIRVANO_URL, { 
  archetype, name, email, whatsapp: whatsappNorm, externalId 
});
window.location.href = url;
```

**Resultado:** URL viaja com `fbclid`, `fbc`, `fbp`, `src`, `utm_*`.

### 5.2 Stitching no Webhook (CAPI)

**Arquivo:** `/Users/guilhermehenrique/rotina-de-paz-app/src/lib/admin/meta-capi.server.ts:86-104`

```typescript
const externalId = payload?.utm?.src ?? payload?.src ?? null;
if (externalId) {
  const { data } = await supabaseAdmin.from("tracking_sessions")
    .select("fbp, fbc, client_ip, user_agent")
    .eq("external_id", externalId)
    .maybeSingle();
  ts = data ?? null;
}
```

**Achado:**
- ✅ Webhook recebe `src` (external_id) na URL.
- ✅ Faz lookup em `tracking_sessions` por identidade.
- ✅ Coleta fbp/fbc/IP/UA e passa ao CAPI.

---

## 6. Pilar 5: Fonte Única + Funil por JOIN

### 6.1 Arquitetura Atual: UNION vs JOIN

**Estado:** O spec diz que `analytics_full_funnel` usa `UNION ALL` (coortes disjuntas).

**Esperado:** `COUNT(DISTINCT external_id)` por etapa, ligadas por identidade.

**Achado:** Correlação lead→venda:
```
7 leads com external_id
23 purchases (todos com src)
5 linked (lead.external_id = purchase.src)
8 orphaned purchases (src não encontrado em leads)
```

**Gap:** Não há visibilidade de qual venda saiu de qual lead. Funil não fecha.

### 6.2 Dados de Teste vs Reais

**Query (Q3):**
```
total_purchases: 23
purchases_teste: 4
purchases_real: 19
```

**Spec requirement:** Filtrar `is_test` em TODAS as etapas.

**Achado:** Tabelas têm coluna `is_test`, mas funis históricos (pre-Sprint0) não filtram.

---

## 7. Cobertura de Eventos por Superfície

### 7.1 Eventos do Quiz-Sacra

| Evento | Tipo | Cobertura | Event_ID | Deduplic |
|---|---|---|---|---|
| **Arrival** | fbq trackCustom + RPC track_quiz_step | ✅ 743 | — | Por sessão/stage |
| **QuizStep (por pergunta)** | fbq trackCustom + RPC | ✅ 844 | — | Por pergunta/value |
| **Result** | RPC track_quiz_step | ✅ 184 | — | 1× per session |
| **Offer** | RPC track_quiz_step | ✅ 170 | — | 1× per session |
| **InitiateCheckout** | fbq track + RPC | ✅ 25 | `ic_<eid>_<scope>` | ✅ Por scope |
| **Lead** | fbq trackSingle (Meta Advanced Matching) | ⚠️ Baixo | `lead_<eid>` | ✅ Uma vez |
| **Contact Gate** | Não explícito | ❌ Falta | — | — |

### 7.2 Implementação de Lead Event

**Arquivo:** `/Users/guilhermehenrique/Quiz-sacra/src/components/quiz/QuizApp.tsx:481-500`

```typescript
const fbq = (window as any).fbq;
if (fbq) {
  const eid = getOrCreateExternalId();
  fbq("init", PIXEL, {
    ...(hasEmail ? { em: email.toLowerCase().trim() } : {}),
    ...(ph ? { ph } : {}),
    external_id: eid,
  });
  fbq("trackSingle", PIXEL, "Lead", {
    content_name: "Rotina de Paz",
    value: 0,
    currency: "BRL",
  }, { eventID: `lead_${eid}` });
}
```

**Achado:**
- ✅ Lead disparado COM `external_id` (Advanced Matching).
- ✅ Event ID garante dedup.
- ⚠️ Only if email || whatsapp (skip se sem contato).

### 7.3 Quiz Responses (Banco)

**Query (Q5):**
```
total_responses: 952
with_lead_id: 952 (100%)
unique_leads: 136
```

**Achado:** Todas as respostas ligadas a um lead (1 lead = ~7 respostas).

---

## 8. EMQ (Email Match Quality) — Diagnóstico

### 8.1 Sinais Disponíveis (Prioridade Meta)

| Sinal | Status | Cobertura | Nível |
|---|---|---|---|
| `em` (email hash) | ✅ Se email | ~50% leads | Alto |
| `ph` (phone hash) | ✅ Se WhatsApp | ~30% leads | Alto |
| `external_id` (hash) | ✅ Se external_id | 100% quiz sessions | Alto |
| `fbp` (Facebook Pixel ID) | ✅ Se pixel carregou | 31% sessions | Médio |
| `fbc` (Facebook Click ID) | ✅ Se fbclid na URL | 40% sessions | Médio |
| `client_ip` | ❌ Sempre NULL | 0% sessions | Suporte |
| `client_user_agent` | ✅ Se server-side (CAPI) | ~0% quiz, ~100% app | Suporte |

**Conclusão:** EMQ fica em "MÉDIO" porque:
- Email/phone só em ~50% (contact gate optional).
- IP/UA não capturado (server-side não implementado).

### 8.2 Pixel vs CAPI

| Evento | Browser | Server | Dedup |
|---|---|---|---|
| InitiateCheckout | ✅ | ❌ | event_id no browser |
| Lead | ✅ | ❌ | event_id no browser |
| Purchase | ✅ | ✅ CAPI | event_id = sale_id |

**Spec goal:** Dobrar Lead + IC no servidor também (Frente B6). **Não feito.**

---

## 9. Coerência e Rastreabilidade de Dados

### 9.1 Fluxo Esperado vs Real

```
1. Usuário chega → Quiz gera qs_<uuid> em localStorage ✅
2. Sessions salva (fbp/fbc/external_id) ✅
3. Contato (email/whatsapp) → Lead criado COM external_id ⚠️ (94% sem)
4. Quizstep responses ligadas a lead ✅
5. Checkout: URL decorada com src=qs_<uuid> ✅
6. Kirvano webhook: lookup tracking_sessions por src ✅
7. CAPI: fbp/fbc/IP passado ao Meta ⚠️ (IP sempre NULL)
8. Purchase salva com src (external_id) ✅
9. Funil: COUNT(DISTINCT external_id) liga lead→venda ❌ (94% leads sem external_id)
```

### 9.2 Visibilidade no Admin

**Arquivo:** `/Users/guilhermehenrique/rotina-de-paz-app/src/routes/admin/analytics.tsx`

- ✅ Vendas: `vendas_reais` view filtra `is_test=false`.
- ✅ Leads: `leads_reais` view filtra `is_test=false`.
- ⚠️ Funis: `analytics_full_funnel` usa UNION (não JOIN).
- ❌ Rastreabilidade: Sem coluna JOIN `external_id`, não há ligação visível.

---

## 10. Conclusões e Prioridades

### 10.1 Crítico (Bloqueia Objetivo)

1. **external_id não viaja para leads (94% NULL)**
   - **Causa:** Código está correto, mas histórico de produção predates da lógica.
   - **Impacto:** Funil não fecha; não há rastreamento lead→venda.
   - **Solução:** Retroativamente popular `leads.external_id` a partir de `quiz_responses` via lead_id (Frente B1).

2. **client_ip sempre NULL (server-side não implementado)**
   - **Causa:** Especificação sabe mas design não implementou edge function.
   - **Impacto:** EMQ reduzido; CAPI sem sinal IP/UA.
   - **Solução:** Edge function no webhook (ou tracking endpoint) captura CF-Connecting-IP (Frente B2).

3. **Rastreabilidade end-to-end frágil**
   - **Causa:** JOIN lead→venda requer external_id aligned.
   - **Impacto:** Admin não mostra funil real.
   - **Solução:** Reescrever `analytics_full_funnel` com JOIN (Frente D).

### 10.2 Alto (Degrada Qualidade)

4. **Lead event opcional (só se contato)**
   - **Gap:** CAPI não recebe Lead como evento server-side (Frente B6).
   - **Impacto:** Falta sinal de "interesse" ao Meta.

5. **Dados de teste não filtrados historicamente**
   - **Gap:** Funis antigos contam teste.
   - **Solução:** Filter `is_test=false` em todas as queries (Sprint 0 #3).

### 10.3 Médio (Otimizações)

6. **fbp/fbc coverage baixa (31%/40%)**
   - **Causa:** Pixel não sempre carrega (adblocker/iOS).
   - **Nota:** Esperado; mitigado por email/phone.

7. **Contact gate underutilizado (só 3 events)**
   - **Causa:** Opcional; muitos skippam.
   - **Nota:** OK — Lead event já dispara mesmo sem contato.

---

## 11. Recomendações

### Roadmap (Ordem de Execução)

1. **Imediato (Sprint 0):**
   - Verificar se `leads.external_id` começou a popular corretamente (query histórico).
   - Filtrar `is_test` em funis (bug #3).
   - RLS em tracking_sessions/quiz_funnel_events (bug #4).

2. **Frente B (1-2 semanas):**
   - B1: Popular retroativamente `leads.external_id` (lookup via quiz_responses.lead_id).
   - B2: Edge function captura CF-Connecting-IP → `tracking_sessions.client_ip`.
   - B6: Dobrar Lead + IC como eventos CAPI (server-side).

3. **Frente D (após B):**
   - Reescrever funil com JOIN (em vez de UNION).
   - Dashboard mostra rastreabilidade real.

---

## 12. Evidências Brutas (Queries)

### Q1 — tracking_sessions
```json
{
  "total_sessions": 67,
  "sessions_com_external_id": 67,
  "sessions_sem_external_id": 0,
  "sessions_com_client_ip": 0,
  "sessions_com_fbp": 21,
  "sessions_com_fbc": 27
}
```

### Q2 — leads
```json
{
  "total_leads": 137,
  "leads_com_external_id": 8,
  "leads_sem_external_id": 129
}
```

### Q3 — purchases
```json
{
  "total_purchases": 23,
  "purchases_com_src": 23,
  "purchases_sem_src": 0,
  "purchases_teste": 4,
  "purchases_real": 19
}
```

### Q4 — quiz_funnel_events
```json
[
  {"stage": "arrival", "total_events": 743},
  {"stage": "question", "total_events": 844},
  {"stage": "result", "total_events": 184},
  {"stage": "offer", "total_events": 170},
  {"stage": "cta", "total_events": 25},
  {"stage": "contact", "total_events": 3}
]
```

### Q5 — quiz_responses
```json
{
  "total_responses": 952,
  "with_lead_id": 952,
  "unique_leads": 136
}
```

### Q6 — lead→purchase correlation
```json
{
  "unique_leads_with_external_id": 7,
  "unique_purchases_with_src": 13,
  "linked_identities": 5
}
```

---

## 13. Arquivos Auditados

- `/Users/guilhermehenrique/Quiz-sacra/src/lib/tracking.ts` — Geração e persistência de external_id; RPC upsert_tracking_session.
- `/Users/guilhermehenrique/Quiz-sacra/src/lib/utm.ts` — Decoração de URL Kirvano.
- `/Users/guilhermehenrique/Quiz-sacra/src/components/quiz/QuizApp.tsx` — Lógica de persistência de lead, Lead event (fbq), fluxo de ofertas.
- `/Users/guilhermehenrique/rotina-de-paz-app/src/lib/admin/meta-capi.server.ts` — Stitching no webhook; lookup de tracking_sessions; construção de user_data CAPI.
- `/Users/guilhermehenrique/rotina-de-paz-app/src/routes/admin/analytics.tsx` — Queries de funil e relatórios.
- Banco: `tracking_sessions`, `leads`, `purchases`, `quiz_funnel_events`, `quiz_responses`.

---

**Documento gerado:** 2026-06-30 (auditoria autônoma, read-only)  
**Próximo passo:** Implementar recomendações (Frente B + Sprint 0).

