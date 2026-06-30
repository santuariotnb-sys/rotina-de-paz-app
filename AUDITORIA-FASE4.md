# AUDITORIA FASE 4 -- Client-Side Tracking (Quiz-sacra)

Data: 2026-06-14
Repo: ~/Quiz-sacra
Arquivos auditados: index.html, src/lib/tracking.ts, src/lib/utm.ts, src/lib/supabase.ts, src/components/quiz/QuizApp.tsx, vite.config.ts, .env.example

---

## Fluxo End-to-End

```
Ad click (fbclid na URL)
  -> index.html carrega: fbq init 838169472100225 + PageView
  -> QuizApp monta: captureUtms() + captureMetaClickData() (useEffect [])
  -> Hero: trackStep("arrival") beacon
  -> Perguntas: fbq("trackCustom","QuizStep") + trackStep("question", key) por pergunta
  -> Loading: persistLead(answers) via RPC (cria lead com UTMs)
  -> Contact gate: save_lead_contact(lead_id, email, whatsapp)
     -> fbq("init", PIXEL, {em, ph, external_id}) re-init Advanced Matching
     -> fbq("trackSingle", PIXEL, "Lead", ..., {eventID: "lead_<eid>"})
  -> Result: trackStep("result") beacon
  -> Offer: trackStep("offer") beacon
  -> CTA checkout:
     -> saveTrackingSession(externalId) fire-and-forget
     -> trackStep("cta") beacon
     -> trackInitiateCheckout(externalId, {value, contentName})
     -> redirect para Kirvano/Checkout-Sacra com src=externalId
```

---

## 1. external_id (qs_...)

| Aspecto | Status | Detalhe |
|---------|--------|---------|
| Geracao | OK | `getOrCreateExternalId()` em tracking.ts:9-18. Formato `qs_<UUID>`. |
| Persistencia | OK | localStorage key `rdp_external_id`. Sobrevive reload/fechar aba. Nao tem TTL (persiste para sempre). |
| Viaja pro checkout | OK | Passado como `src=<externalId>` na URL do Kirvano (utm.ts:53) e do Checkout Sacra (QuizApp.tsx:516). |
| Webhook match | OK | Kirvano devolve em `utm.src`, cruzavel com `tracking_sessions.external_id`. |
| Usado no pixel | OK | eventID do Lead = `lead_<eid>`, eventID do IC = `ic_<eid>_<scope>`. Permite dedup browser+server. |

**Sem problemas identificados.**

---

## 2. Sinais Meta (fbclid / _fbc / _fbp)

| Aspecto | Status | Detalhe |
|---------|--------|---------|
| fbclid captura | OK | `captureMetaClickData()` le de `window.location.search`. |
| _fbc cookie | OK | Regex `/_fbc=([^;]+)/` le do `document.cookie`. |
| _fbp cookie | OK | Regex `/_fbp=([^;]+)/` le do `document.cookie`. |
| _fbc fallback | OK | Se cookie _fbc ausente mas fbclid presente, constroi `fb.1.<ts>.<fbclid>` (tracking.ts:67-68). |
| Persistencia sessao | OK | sessionStorage key `rdp_meta_click`. Sobrevive navegacao SPA, morre ao fechar aba. |
| Salvo no Supabase | OK | `saveTrackingSession()` envia p_fbp, p_fbc, p_fbclid, p_user_agent via RPC. |
| Advanced Matching | OK | Re-init do pixel com `{em, ph, external_id}` no submitContact (QuizApp.tsx:478). |

### Cenarios de falha:

| Cenario | Impacto | Severidade |
|---------|---------|------------|
| Safari ITP (7d cookie) | _fbp expira em 7 dias; _fbc construido via JS tambem expira. O fallback fbclid->fbc mitiga parcialmente. | P2 -- mitigado pelo CAPI server-side |
| Incognito | _fbp nunca existe (pixel nao persiste cookie). _fbc construido do fbclid funciona na sessao. localStorage funciona. | P2 -- CAPI compensa |
| Adblock | fbq nao carrega. Todos os fbq() calls falham silenciosamente (try/catch). **saveTrackingSession() funciona** pois usa Supabase RPC direto. | P1 -- ver abaixo |
| p_client_ip: null | Passado como null (tracking.ts:106). Depende de resolucao server-side no webhook. | Conhecido/aceito |

**P1: Adblock bloqueia fbevents.js mas NAO bloqueia Supabase RPC. O tracking_session e gravado, mas SEM _fbp (cookie nunca foi gerado). O CAPI server-side tera external_id + fbc (do fbclid) + user_agent, mas sem _fbp. Match quality cai.**

---

## 3. Captura de Lead (email -> WhatsApp)

| Aspecto | Status | Detalhe |
|---------|--------|---------|
| persist_lead | OK | RPC chamado no loading stage. Recebe: p_name, p_archetype, p_scores, p_desire, p_situation, p_risk_flag + todos UTMs (spread). NAO recebe email/whatsapp. |
| save_lead_contact | OK | RPC separado, chamado em submitContact. Recebe: p_lead_id, p_email, p_whatsapp (formato `55<digits>`), p_consent_timestamp. |
| p_whatsapp | OK | Aceita whatsapp (QuizApp.tsx:429). Formato `55${digits}`. |
| Ordem | OK | persist_lead e chamado no loading (antes do contact gate). submitContact faz `await leadPromiseRef.current` para garantir lead_id antes de salvar contato. |
| Email legado? | PARCIAL | save_lead_contact aceita tanto email quanto whatsapp. A UI (ContactGateScreen) pede WhatsApp como campo principal. Email nao tem campo visivel (`SHOW_WHATSAPP = false` e enganoso -- na verdade e o campo de email que nao aparece, whatsapp e o primario). |
| Skip sem contato | OK | Se usuario nao preenche nada, vai direto pro result sem salvar contato (QuizApp.tsx:413-415). |
| UTMs no lead | OK | `captureUtms()` retorna UTMs do localStorage, spread como `p_utm_source`, `p_utm_medium`, etc. |

**Nota: `SHOW_WHATSAPP = false` na linha 1090 e enganoso. A UI SEMPRE mostra WhatsApp. A flag parece ser vestígio de quando email era o campo principal. Nao afeta funcionalidade.**

---

## 4. Domain Guard

| Aspecto | Status | Detalhe |
|---------|--------|---------|
| Pixel init | **SEM GUARD** | index.html carrega pixel incondicionalmente. Qualquer deploy (pages.dev, localhost, preview) dispara PageView. |
| saveTrackingSession | **SEM GUARD** | Nenhum check de dominio. Grava em producao de qualquer origem. |
| trackStep (beacons) | **SEM GUARD** | Nenhum check de dominio. Beacons gravam de preview/localhost. |
| persistLead | **SEM GUARD** | Grava lead de qualquer dominio se Supabase estiver configurado. |
| fbq calls | **SEM GUARD** | QuizStep, Lead, InitiateCheckout disparam de qualquer dominio. |

### P0: AUSENCIA TOTAL DE DOMAIN GUARD

Qualquer acesso em `*.pages.dev`, `localhost:5173`, ou preview URL:
1. Dispara PageView no pixel 838169 (infla metricas)
2. Grava tracking_session no Supabase (polui dados)
3. Grava beacons (arrival, question, etc.) no track_quiz_step
4. Pode criar leads falsos via persistLead

**Unica protecao atual:** `.env` local pode nao ter VITE_SUPABASE_URL, mas Cloudflare Pages provavelmente injeta as env vars em preview deploys tambem.

---

## 5. Segundo Pixel (3207450996117474)

**NAO ENCONTRADO no codebase.**

Grep por `3207` em todo o repo retornou zero matches. O segundo pixel nao e inicializado, referenciado ou usado em nenhum arquivo do Quiz-sacra.

Possibilidades:
- Configurado no GTM (nao gerenciado por este repo)
- Configurado na LP principal (rotinadepaz.com.br) fora do quiz
- Removido em algum commit anterior

**Status: Ausente deste repo. Nao e um problema aqui.**

---

## 6. Beacons

### Beacons existentes (via `trackStep()`):

| Beacon | Stage | Trigger | Gate |
|--------|-------|---------|------|
| `arrival` | hero | mount (useEffect []) | Nenhum -- conta toda visita |
| `question` + key | questions | cada pergunta EXIBIDA (useEffect [stage, qIndex]) | Nenhum |
| `contact_gate` | contact | stage change | So chega aqui se completou quiz |
| `result` | result | stage change | Idem |
| `offer` | offer | stage change | Idem |
| `cta` | checkout | click no CTA | Idem |

### Beacons Meta (via `fbq()`):

| Evento | Stage | eventID |
|--------|-------|---------|
| PageView | index.html load | Nenhum (default) |
| QuizStep (custom) | cada pergunta | Nenhum |
| Lead | contact submit | `lead_<eid>` |
| InitiateCheckout | CTA checkout | `ic_<eid>_<scope>` |

### P1: Beacon `arrival` conta TODA entrada sem gate

O beacon `arrival` dispara no mount do hero, sem filtro. Isso significa:
- Bot crawlers contam como arrival
- Reloads contam como novo arrival (localStorage nao previne -- so restaura estado, mas `trackStep("arrival")` roda de novo se `stage === "hero"`)
- Preview deploys contam (sem domain guard)

**Inflacao potencial de metricas de topo de funil.**

### P2: QuizStep (fbq trackCustom) sem eventID

O evento `QuizStep` no pixel Meta (QuizApp.tsx:302) NAO tem eventID. Se o usuario recarregar a pagina no meio do quiz e o estado restaurar para a mesma pergunta, o pixel dispara QuizStep duplicado sem dedup.

---

## 7. Reload / Retry

| Cenario | Comportamento | Problema? |
|---------|---------------|-----------|
| Reload no hero | `arrival` beacon dispara novamente. external_id reutiliza (localStorage). | Beacon duplicado, mas external_id estavel. |
| Reload no questions | Estado restaurado de localStorage (qIndex, answers). `trackStep("question", key)` dispara novamente para a pergunta atual. | Beacon duplicado no Supabase. |
| Reload no result/offer | Estado restaurado. `trackStep("result")`/`trackStep("offer")` dispara novamente. | Beacon duplicado. |
| Reload no contact | Estado restaurado. `trackStep("contact_gate")` dispara novamente. | Beacon duplicado. |
| IC duplo (click CTA 2x) | eventID `ic_<eid>_<scope>` e determinístico -- Meta deduplica. Mas `trackStep("cta")` grava duplicado no Supabase. | Pixel OK, beacon Supabase duplicado. |
| Lead duplo (submit 2x) | eventID `lead_<eid>` e determinístico -- Meta deduplica. | Pixel OK. |
| external_id em reload | Reutiliza do localStorage. Nao gera novo UUID. | OK. |

### P2: Beacons Supabase nao deduplicam

`track_quiz_step` nao tem mecanismo de dedup client-side. Cada reload gera nova row. A dedup depende do server (se o RPC faz INSERT sem UPSERT/constraint).

---

## Resumo de Problemas Priorizados

### P0 -- Critico

| # | Problema | Impacto |
|---|----------|---------|
| P0-1 | **Ausencia total de domain guard** | Pixel + beacons + leads disparam de localhost, pages.dev, preview. Polui dados de producao e infla metricas Meta. |

### P1 -- Alto

| # | Problema | Impacto |
|---|----------|---------|
| P1-1 | **Beacon `arrival` sem gate e sem dedup** | Infla topo de funil. Bots e reloads contam. |
| P1-2 | **Adblock: _fbp nunca gerado** | Com adblock, tracking_session grava sem _fbp. CAPI server-side perde match quality (~30% dos usuarios). |

### P2 -- Medio

| # | Problema | Impacto |
|---|----------|---------|
| P2-1 | **QuizStep sem eventID** | Reload duplica evento no pixel sem dedup. |
| P2-2 | **Beacons Supabase duplicam em reload** | track_quiz_step grava row duplicada. Metricas de funil infladas se nao dedup server-side. |
| P2-3 | **SHOW_WHATSAPP flag enganosa** | Nao causa bug mas confunde manutencao. |
| P2-4 | **external_id sem TTL** | Persiste para sempre em localStorage. Se o mesmo browser volta meses depois, reutiliza o mesmo qs_. |
| P2-5 | **PageView sem eventID** | O PageView no index.html nao tem eventID. CAPI nao consegue dedup se enviar PageView server-side. |

---

## O que esta BEM

- external_id (qs_) corretamente gerado, persistido e propagado ate o checkout
- fbclid->fbc fallback implementado (resolve caso _fbc cookie ausente)
- Advanced Matching com re-init do pixel (em, ph, external_id) no Lead
- eventID determinístico para Lead e InitiateCheckout (dedup funciona)
- Ordem persist_lead -> save_lead_contact garantida via Promise ref
- Fire-and-forget pattern nao bloqueia UX
- saveTrackingSession salva fbp/fbc/fbclid/user_agent para CAPI
- 2o pixel (3207) nao presente = nao ha risco de conflito neste repo
