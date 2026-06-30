# Complete Dependency Graph — rotina-de-paz-app + Quiz-sacra

Generated: 2026-06-15

---

## TASK 1: Complete File Inventory

### rotina-de-paz-app/src (89 files)

**Entry points:**
- `server.ts` — SSR server entry
- `start.ts` — TanStack Start middleware chain
- `router.tsx` — Router definition
- `routeTree.gen.ts` — Auto-generated route tree

**API Routes (server-side):**
- `routes/api/public/webhooks/kirvano.ts` — Kirvano webhook POST handler
- `routes/api/cron/capi-retry.ts` — CAPI retry cron GET handler

**Admin routes (18):**
- `routes/admin.tsx` — Layout (sidebar + topbar + auth gate)
- `routes/admin.index.tsx` — Dashboard overview
- `routes/admin.analytics.tsx` — Analytics dashboard
- `routes/admin.leads.tsx`, `admin.clientes.tsx`, `admin.membros.tsx`
- `routes/admin.vendas.tsx`, `admin.webhooks.tsx`, `admin.tracking.tsx`
- `routes/admin.quiz.tsx`, `admin.config.tsx`, `admin.login.tsx`
- `routes/admin.produtos.tsx`, `admin.audios.tsx`, `admin.ebooks.tsx`
- `routes/admin.louvores.tsx`, `admin.cursos.tsx`, `admin.acessos.tsx`
- `routes/admin.suporte.tsx`

**App routes (11):**
- `routes/app.tsx` — Layout (auth + entitlements + player)
- `routes/app.index.tsx`, `app.devocionais.tsx`, `app.devocional.$slug.tsx`
- `routes/app.ebooks.tsx`, `app.louvores.tsx`, `app.volume.$turno.tsx`
- `routes/app.suporte.tsx`, `app.suporte.$ticketId.tsx`
- `routes/app.depoimentos.tsx`

**Public routes:**
- `routes/index.tsx` — Landing/redirect
- `routes/login.tsx`, `reset-password.tsx`, `aceite.tsx`
- `routes/termos-de-uso.tsx`, `politica-de-privacidade.tsx`, `termo-de-ciencia.tsx`

**Server functions (*.functions.ts):**
- `lib/admin/analytics.functions.ts` — 5 fns: getTopSegments, getFunnel, getRevenueBreakdown, getQuizConversion, getCohortWeekly
- `lib/admin/checkout-funnel.functions.ts` — 2 fns: getCheckoutFunnel, getFullFunnel
- `lib/admin/quiz-funnel.functions.ts` — 1 fn: getQuizFunnel
- `lib/admin/config.functions.ts` — 1 fn: getIntegrationStatus
- `lib/admin/replay.functions.ts` — 1 fn: replayWebhookLog
- `lib/admin/test-webhook.functions.ts` — 1 fn: sendTestWebhook
- `lib/api/content.functions.ts` — 1 fn: getEbookUrl
- `lib/api/send-email.functions.ts` — 4 fns: notifyNewTicket, notifyUserReply, notifyAdminReply, notifyTicketClosed
- `lib/legal/legal.functions.ts` — fns: getLegalStatus, recordLegalAcceptance

**Server-only modules:**
- `lib/admin/kirvano.server.ts` — verifyKirvanoSignature, processKirvanoPayload
- `lib/admin/meta-capi.server.ts` — sendMetaCapiPurchase
- `lib/admin/email.server.ts` — sendWelcomeEmail
- `lib/admin/server-auth.ts` — assertAdmin
- `lib/config.server.ts` — server config helper
- `integrations/supabase/client.server.ts` — supabaseAdmin (service_role)

**Client-side modules:**
- `integrations/supabase/client.ts` — supabase (anon, lazy proxy)
- `integrations/supabase/auth-attacher.ts` — middleware to attach auth
- `integrations/supabase/auth-middleware.ts` — middleware to require auth
- `integrations/supabase/types.ts` — Database type
- `lib/admin/auth.ts` — getCurrentAdmin (client-side)
- `lib/admin/audit.ts` — logAdminAction (client-side, uses anon)
- `lib/admin/queries.ts` — fetchOverviewKpis (client-side, uses anon)
- `lib/admin/constants.ts` — ARCHETYPE_COLORS, PERIODS, etc.
- `lib/admin/csv.ts` — downloadCsv
- `lib/admin/analytics.ts` — Type definitions only
- `lib/app-queries.ts` — TanStack Query options
- `lib/student.ts` — localStorage student helpers
- `lib/utils.ts` — cn() utility
- `lib/error-capture.ts`, `lib/error-page.ts` — Error handling

**Data files:**
- `data/quiz.ts`, `data/plan.ts`, `data/devocionais.ts`, `data/ebooks.ts`, `data/louvores.ts`

**Components:**
- `components/admin/` — AdminSidebar, AdminTopbar, GlassCard, KpiCard, StubPage
- `components/app/` — AppNav, ErrorFallback, SessionModal
- `components/app/player/` — PlayerProvider, MiniPlayer, FullPlayer
- `components/quiz/` — Avatar, EmotionalProgress, SpeechBubble
- `components/ui/` — 47 shadcn/ui components

**Hooks:**
- `hooks/useEntitlements.ts`, `hooks/useProductCheckouts.ts`, `hooks/use-mobile.tsx`

### Quiz-sacra/src (24 files)

**Entry:**
- `main.tsx` — React root + router
- `routeTree.gen.ts` — Auto-generated

**Routes:**
- `routes/__root.tsx` — Root layout
- `routes/index.tsx` — Redirects to /quiz-sacra
- `routes/quiz-sacra.tsx` — Main quiz page
- `routes/quiz.index.tsx` — Alternate quiz route
- `routes/obrigado.tsx` — Post-purchase upsell/downsell

**Components:**
- `components/quiz/QuizApp.tsx` — Main quiz SPA (1766 lines)
- `components/quiz/Avatar.tsx`, `SpeechBubble.tsx`, `EmotionalProgress.tsx`
- `components/quiz/ResultScreen.tsx`, `AlarmeDiagram.tsx`, `MirrorChecks.tsx`
- `components/funil/OfferPage.tsx`, `CheckoutModal.tsx`

**Lib:**
- `lib/supabase.ts` — getSupabase (anon, lazy singleton)
- `lib/tracking.ts` — getOrCreateExternalId, saveTrackingSession, trackInitiateCheckout, captureMetaClickData
- `lib/utm.ts` — captureUtms, buildKirvanoUrl
- `lib/sound.ts` — playDing
- `lib/prices.ts` — fetchProductPrices, formatBRL, fetchInstallmentFreeCount

**Data:**
- `data/quiz.ts` — QUESTIONS, ARCHETYPES, computeArchetype
- `data/narration.ts` — NARRATION cues for word-by-word caption
- `data/funil.ts` — UPSELL_CONTENT, DOWNSELL_CONTENT

---

## TASK 2: Import Graph (summary of cross-module edges)

### Quiz-sacra internal dependency tree

```
main.tsx
  └─ routeTree.gen.ts

routes/quiz-sacra.tsx → components/quiz/QuizApp.tsx
routes/quiz.index.tsx → components/quiz/QuizApp.tsx
routes/obrigado.tsx → components/funil/OfferPage.tsx, data/funil.ts, lib/prices.ts

QuizApp.tsx
  ├─ components/quiz/{Avatar, SpeechBubble, EmotionalProgress, ResultScreen}
  ├─ data/quiz.ts (QUESTIONS, ARCHETYPES, computeArchetype, getGuideReaction, getTransition)
  ├─ data/narration.ts (NARRATION)
  ├─ lib/sound.ts (playDing)
  ├─ lib/utm.ts (buildKirvanoUrl, captureUtms)
  ├─ lib/supabase.ts (getSupabase)
  ├─ lib/tracking.ts (captureMetaClickData, getOrCreateExternalId, saveTrackingSession, trackInitiateCheckout)
  └─ lib/prices.ts (fetchProductPrices, fetchInstallmentFreeCount, formatBRL)

ResultScreen.tsx → Avatar, SpeechBubble, AlarmeDiagram, MirrorChecks, data/quiz.ts
OfferPage.tsx → lib/tracking.ts, data/funil.ts
lib/tracking.ts → lib/supabase.ts
lib/utm.ts → lib/tracking.ts (getMetaClickData)
lib/prices.ts → lib/supabase.ts
```

### rotina-de-paz-app critical dependency tree

```
start.ts → lib/error-page.ts, integrations/supabase/auth-attacher.ts
server.ts → lib/error-capture.ts, lib/error-page.ts

Webhook chain:
  routes/api/public/webhooks/kirvano.ts
    ├─ integrations/supabase/client.server.ts (supabaseAdmin)
    └─ lib/admin/kirvano.server.ts (processKirvanoPayload, verifyKirvanoSignature)
         ├─ integrations/supabase/client.server.ts (supabaseAdmin)
         ├─ lib/admin/email.server.ts (sendWelcomeEmail)
         │    └─ integrations/supabase/client.server.ts (supabaseAdmin)
         └─ lib/admin/meta-capi.server.ts (sendMetaCapiPurchase)
              └─ integrations/supabase/client.server.ts (supabaseAdmin)

Cron chain:
  routes/api/cron/capi-retry.ts
    ├─ integrations/supabase/client.server.ts (supabaseAdmin)
    └─ lib/admin/meta-capi.server.ts (sendMetaCapiPurchase)

Admin server functions:
  All *.functions.ts files use:
    ├─ integrations/supabase/auth-middleware.ts (requireSupabaseAuth)
    ├─ integrations/supabase/client.server.ts (supabaseAdmin)
    └─ lib/admin/server-auth.ts (assertAdmin)
         └─ integrations/supabase/client.server.ts (supabaseAdmin)

Client admin:
  admin.tsx → lib/admin/auth.ts (getCurrentAdmin) → integrations/supabase/client.ts (supabase)
  audit.ts → lib/admin/auth.ts → integrations/supabase/client.ts
  queries.ts → integrations/supabase/client.ts
```

---

## TASK 3: Critical Path Function Call Graphs

### Path A: Webhook → Purchase → CAPI

```
POST /api/public/webhooks/kirvano
  │
  ├─ 1. URL secret check (KIRVANO_URL_SECRET, constant-time)
  ├─ 2. Read raw body + signature from headers
  ├─ 3. Body size check (64KB max)
  ├─ 4. Secret configured check (KIRVANO_WEBHOOK_SECRET) → 503 if missing
  ├─ 5. verifyKirvanoSignature(rawBody, signature, secret)
  │      → HMAC-SHA256 comparison OR plain token fallback
  │      → returns boolean
  │
  ├─ 6. Parse JSON
  ├─ 7. logEvent() → INSERT webhook_logs (processed=false) → returns logId
  │
  ├─ 8. processKirvanoPayload(parsed, logId)
  │      ├─ Detect event type (APPROVED_EVENTS / REVOKE_EVENTS)
  │      ├─ extractOfferIds(payload) → array of kirvano offer IDs
  │      ├─ extractCustomerEmail(payload) → email
  │      ├─ extractTransactionId(payload) → txId
  │      ├─ extractCustomerName(payload) → name
  │      │
  │      ├─ supabaseAdmin.from("product_kirvano_offers").select().in("kirvano_offer_id", offerIds)
  │      │   → resolves to product_ids
  │      │
  │      ├─ ensureUserForEmail(email, name)
  │      │   ├─ supabaseAdmin.from("profiles").select("user_id").eq("email") → check existing
  │      │   ├─ supabaseAdmin.auth.admin.createUser() → create if not found
  │      │   └─ (supabaseAdmin as any).rpc("get_user_id_by_email") → fallback
  │      │
  │      ├─ IF APPROVED:
  │      │   ├─ Check existing entitlements (skip refunded ones)
  │      │   ├─ supabaseAdmin.from("entitlements").upsert(rows, {onConflict:"user_id,product_id"})
  │      │   ├─ sendWelcomeEmail({email, name, productNames}) → Resend API (non-blocking)
  │      │   │   └─ magicLinkFor(email) → supabaseAdmin.auth.admin.generateLink()
  │      │   │
  │      │   ├─ Analytics: supabaseAdmin.from("purchases").upsert(..., {onConflict:"transaction_id"})
  │      │   │   └─ extractPaidTotalCents(payload) for real paid value
  │      │   │
  │      │   └─ sendMetaCapiPurchase(payload, {transactionId, productNames, productIds})
  │      │       ├─ Check META_PIXEL_ID + META_CAPI_TOKEN → skipped if missing
  │      │       ├─ Lookup tracking_sessions by external_id (payload.utm.src)
  │      │       │   → recovers fbp, fbc, client_ip, user_agent
  │      │       ├─ Build user_data (em, ph, fn, ln, fbp, fbc, ip, ua, external_id — all SHA256)
  │      │       ├─ POST graph.facebook.com/v22.0/{PIXEL_ID}/events (8s timeout)
  │      │       └─ Returns {sent: boolean, error?: string}
  │      │
  │      └─ IF REVOKE:
  │          ├─ supabaseAdmin.from("entitlements").update({status:"refunded"})
  │          └─ supabaseAdmin.from("purchases").update({status:"refunded"})
  │
  ├─ 9. UPDATE webhook_logs SET processed, capi_status, capi_error, capi_retries
  └─ 10. Return {ok: true, result}

FAILURE MODES:
- Missing KIRVANO_WEBHOOK_SECRET → 503 (no log written, avoids polluting rate limit)
- Invalid JSON → 400, logged
- No offer_id in payload → matched=false, logged
- No email → matched=false, logged
- No product mapped to offer → matched=false, logged
- ensureUserForEmail fails → throws → 500, Kirvano retries
- entitlements upsert fails → throws → 500, Kirvano retries (idempotent)
- sendWelcomeEmail fails → logged as ERROR, does NOT throw
- purchases upsert fails → logged, does NOT throw
- sendMetaCapiPurchase fails → capiStatus="failed", logged, does NOT throw
  → cron capi-retry.ts picks up failed ones (max 5 attempts, 10 per run)
- Invalid HMAC with too many failures → 429

capi_status is SET at:
  kirvano.ts:145-148 (initial attempt result)
  capi-retry.ts:103,104 (retry result)
```

### Path B: Quiz → Lead → Tracking

```
QuizApp.tsx user flow:
  │
  ├─ 1. MOUNT: captureUtms() → reads URL params, persists localStorage
  │              captureMetaClickData() → reads fbclid + _fbp/_fbc cookies → sessionStorage
  │
  ├─ 2. HERO: user enters name → startQuiz() → stage="questions"
  │            trackStep("arrival") → sb.rpc("track_quiz_step", {session_id, stage, version})
  │
  ├─ 3. QUESTIONS: each answer → answer(value)
  │     ├─ playDing()
  │     ├─ setAnswers(next)
  │     ├─ getGuideReaction() → shows reaction bubble
  │     ├─ trackStep("question", q.key) per question DISPLAYED
  │     └─ fbq("trackCustom", "QuizStep", {step, total, question})
  │
  ├─ 4. LOADING: stage="loading"
  │     └─ persistLead(answers) → fire-and-forget Promise
  │         ├─ sb.rpc("persist_lead", {p_name, p_archetype, p_scores, p_desire, p_situation,
  │         │   p_risk_flag, p_utm_source, p_utm_medium, p_utm_campaign, p_utm_content, p_utm_term,
  │         │   p_fbclid, p_gclid})
  │         │   → returns lead_id
  │         ├─ localStorage.setItem("sacra_student", {archetype, name, desire, situation, lead_id})
  │         └─ sb.rpc("persist_quiz_responses", {p_rows: [{lead_id, question_key, answer_value, ...}]})
  │
  ├─ 5. CONTACT GATE: stage="contact"
  │     └─ submitContact()
  │         ├─ await leadPromiseRef.current → ensures lead_id is ready
  │         ├─ sb.rpc("save_lead_contact", {p_lead_id, p_email, p_whatsapp, p_consent_timestamp})
  │         ├─ sb.functions.invoke("send-quiz-result", {body: {email, archetype data...}})
  │         └─ fbq("init", PIXEL, {em, ph, external_id}) + fbq("trackSingle", "Lead")
  │
  ├─ 6. RESULT: stage="result" → ResultScreen
  │     └─ trackStep("result")
  │
  └─ 7. OFFER: stage="offer" → checkout()
        ├─ saveTrackingSession(externalId) — fire-and-forget
        │   └─ sb.rpc("upsert_tracking_session", {p_external_id, p_fbp, p_fbc, p_fbclid, p_user_agent})
        │      Domain guard: only on sacra.rotinadepaz.com.br or rotinadepaz.com.br
        ├─ trackStep("cta")
        ├─ trackInitiateCheckout(externalId, {contentName, value})
        │   └─ fbq("track", "InitiateCheckout", {...}, {eventID: "ic_<eid>_<scope>"})
        │      + 300ms delay for beacon
        └─ window.location.href = buildKirvanoUrl(...) OR checkout sacra URL

RPCs invoked (all via anon client in Quiz-sacra):
  1. track_quiz_step — funnel beacon
  2. persist_lead — creates lead row
  3. persist_quiz_responses — saves quiz answers
  4. save_lead_contact — adds email/whatsapp to lead
  5. upsert_tracking_session — saves browser signals for CAPI
```

### Path C: Admin → Analytics

```
admin.analytics.tsx
  │
  ├─ imports from analytics.functions.ts:
  │   getTopSegments, getFunnel, getRevenueBreakdown, getQuizConversion, getCohortWeekly
  │
  └─ Each is a createServerFn with:
      ├─ middleware: [requireSupabaseAuth] → auth-middleware.ts
      │   → Creates per-request Supabase client from cookie auth
      │   → Extracts userId → context.userId
      ├─ assertAdmin(context.userId) → server-auth.ts
      │   → supabaseAdmin.from("admin_users").select().eq("user_id", userId)
      └─ supabaseAdmin.rpc("<rpc_name>", {p_days})

RPCs called (all via supabaseAdmin / service_role):
  - analytics_top_segments(p_days, p_min_leads)
  - analytics_funnel(p_days)
  - analytics_revenue_breakdown(p_days)
  - analytics_quiz_conversion(p_days)
  - analytics_cohort_weekly(p_weeks)

Also from checkout-funnel.functions.ts (used in admin.quiz.tsx):
  - analytics_checkout_funnel(p_days)
  - analytics_full_funnel(p_days)

Also from quiz-funnel.functions.ts (used in admin.quiz.tsx):
  - analytics_quiz_funnel(p_days)
```

### Path D: Cron → Retry

```
GET /api/cron/capi-retry
  │
  ├─ 1. Verify CRON_SECRET (Bearer token in Authorization header)
  ├─ 2. supabaseAdmin.from("webhook_logs")
  │      .select("id, payload, capi_retries")
  │      .eq("capi_status", "failed")
  │      .lt("capi_retries", 5)    ← MAX_CAPI_ATTEMPTS
  │      .order("created_at", asc)
  │      .limit(10)                ← MAX_RETRIES_PER_RUN
  │
  ├─ 3. For each log:
  │     ├─ extractTransactionId(payload) → txId
  │     ├─ If no txId → mark capi_status="skipped", skip
  │     ├─ Extract product names from payload
  │     ├─ sendMetaCapiPurchase(payload, {transactionId, productNames})
  │     └─ UPDATE webhook_logs:
  │         ├─ sent=true → capi_status="sent"
  │         └─ sent=false → capi_status="failed", increment capi_retries
  │
  └─ Return {ok, retried, sent, failed}
```

---

## TASK 4: Dead Code Detection

### DEAD FILES (never imported by any other file)

| File | Status |
|------|--------|
| `rotina-de-paz-app/src/lib/supabase.ts` | **DEAD** — duplicate of Quiz-sacra's lib/supabase.ts pattern but never imported. The app uses `integrations/supabase/client.ts` instead. |
| `rotina-de-paz-app/src/lib/utm.ts` | **DEAD** — never imported. UTM handling only exists in Quiz-sacra. |
| `rotina-de-paz-app/src/lib/sound.ts` | **DEAD** — never imported. Sound only used in Quiz-sacra. |
| `rotina-de-paz-app/src/lib/config.server.ts` | **DEAD** — never imported by any other file. |
| `rotina-de-paz-app/src/components/quiz/Avatar.tsx` | **DEAD** — quiz components in rotina-de-paz-app are never imported (quiz lives in Quiz-sacra). |
| `rotina-de-paz-app/src/components/quiz/EmotionalProgress.tsx` | **DEAD** — same reason. |
| `rotina-de-paz-app/src/components/quiz/SpeechBubble.tsx` | **DEAD** — same reason. |
| `rotina-de-paz-app/src/components/admin/StubPage.tsx` | **DEAD** — never imported by any route or component. |
| `rotina-de-paz-app/src/components/app/player/FullPlayer.tsx` | **DEAD** — imports PlayerProvider but is never itself imported by any route or parent. |
| `rotina-de-paz-app/src/routes/app.depoimentos.tsx` | Exists but not verified as imported — may be auto-registered by TanStack Router via routeTree.gen.ts (NOT dead via filesystem routing). |

### DEAD EXPORTS (exported but never imported elsewhere)

| File:export | Notes |
|-------------|-------|
| `lib/supabase.ts:getSupabase` | Entire file is dead (see above) |
| `lib/supabase.ts:supabaseEnabled` | Entire file is dead |
| `lib/utm.ts:captureUtms` | Entire file is dead in this repo |
| `lib/utm.ts:buildKirvanoUrl` | Entire file is dead in this repo |
| `lib/sound.ts:playDing` | Entire file is dead in this repo |
| `integrations/supabase/auth-attacher.ts` | Only imported by `start.ts` — may be dead if not actually used by the auth chain |
| `data/quiz.ts` | Imported by app routes (volume, index) — quiz data is shared |

### RPCs called from code (complete list)

**From Quiz-sacra (anon client):**
1. `track_quiz_step` — QuizApp.tsx:187
2. `persist_lead` — QuizApp.tsx:354
3. `persist_quiz_responses` — QuizApp.tsx:393
4. `save_lead_contact` — QuizApp.tsx:427
5. `upsert_tracking_session` — tracking.ts:105

**From rotina-de-paz-app (supabaseAdmin, service_role):**
6. `analytics_top_segments` — analytics.functions.ts:28
7. `analytics_funnel` — analytics.functions.ts:41
8. `analytics_revenue_breakdown` — analytics.functions.ts:63
9. `analytics_quiz_conversion` — analytics.functions.ts:76
10. `analytics_cohort_weekly` — analytics.functions.ts:91
11. `analytics_checkout_funnel` — checkout-funnel.functions.ts:25
12. `analytics_full_funnel` — checkout-funnel.functions.ts:39
13. `analytics_quiz_funnel` — quiz-funnel.functions.ts:22
14. `get_user_id_by_email` — kirvano.server.ts:158

**From rotina-de-paz-app (anon client):**
15. `is_admin` — auth.ts:20

---

## TASK 5: Supabase Client Usage

### `supabase` (anon client from `integrations/supabase/client.ts`)

| File | Operations |
|------|------------|
| `lib/admin/queries.ts:18-33` | `.from("leads").select()`, `.from("profiles").select()`, `(sb as any).from("purchases").select()` |
| `lib/admin/auth.ts:17-30` | `.auth.getUser()`, `.rpc("is_admin")`, `.from("admin_users").select()` |
| `lib/admin/audit.ts:15` | `.from("admin_audit_logs").insert()` |
| `routes/admin.config.tsx:273` | `(supabase as any).schema("checkout")` — accessing checkout schema |
| Many admin route files | Various `.from()` queries for leads, profiles, entitlements, webhook_logs, products, etc. |
| `hooks/useEntitlements.ts` | Via `app-queries.ts` queryOptions |
| `hooks/useProductCheckouts.ts` | Via `app-queries.ts` queryOptions |

### `supabaseAdmin` (service_role from `integrations/supabase/client.server.ts`)

| File | Operations |
|------|------------|
| `routes/api/public/webhooks/kirvano.ts:42,73,141,155` | `.from("webhook_logs").insert/update/select` |
| `lib/admin/kirvano.server.ts:141-367` | `.from("profiles")`, `.auth.admin.createUser()`, `.from("product_kirvano_offers")`, `.from("entitlements").upsert/update`, `.from("products")`, `.from("purchases").upsert/update` |
| `lib/admin/meta-capi.server.ts:98` | `.from("tracking_sessions").select()` |
| `lib/admin/email.server.ts:20` | `.auth.admin.generateLink()` |
| `lib/admin/server-auth.ts:4` | `.from("admin_users").select()` |
| `routes/api/cron/capi-retry.ts:48-120` | `.from("webhook_logs").select/update` |
| All `*.functions.ts` files | `.rpc()` calls to analytics RPCs |
| `lib/api/content.functions.ts:15-26` | `.from("ebooks").select()`, `.from("entitlements").select()` |

### Quiz-sacra Supabase (anon client from `lib/supabase.ts`)

| File | Operations |
|------|------------|
| `components/quiz/QuizApp.tsx:186-394` | `.rpc("track_quiz_step")`, `.rpc("persist_lead")`, `.rpc("persist_quiz_responses")`, `.rpc("save_lead_contact")`, `.functions.invoke("send-quiz-result")` |
| `lib/tracking.ts:105` | `.rpc("upsert_tracking_session")` |
| `lib/prices.ts:33-121` | `.from("products").select()`, `.from("product_offers").select()`, `.schema("checkout").from("checkout_config").select()` |

### `as any` casts — inventory and safety

| Location | Why | Safe? |
|----------|-----|-------|
| `kirvano.server.ts:158` | `(supabaseAdmin as any).rpc("get_user_id_by_email")` — RPC not in generated types | YES — fallback path, result validated |
| `kirvano.server.ts:297-298` | `(payload as any).utm` + `(supabaseAdmin as any).from("purchases")` — purchases table not in types | YES — created via Dashboard, not in migrations |
| `kirvano.server.ts:367` | `(supabaseAdmin as any).from("purchases").update()` — same reason | YES |
| `meta-capi.server.ts:98` | `(supabaseAdmin as any).from("tracking_sessions")` — not in generated types | YES — table exists but not in codegen |
| `capi-retry.ts:48,75,100,120` | `(supabaseAdmin as any).from("webhook_logs")` — capi_* columns not in types | YES — columns exist in DB |
| `kirvano.ts:149,158` | `} as any).eq("id", logId)` — update payload has extra capi_* fields | YES — same reason |
| `queries.ts:18` | `const sb = supabase as any` — for purchases table | YES — same |
| `admin.config.tsx:273` | `(supabase as any).schema("checkout")` — checkout schema not in types | YES — cross-schema query |
| `analytics.functions.ts:27,40,62,75,90` | `(supabaseAdmin.rpc as any)()` — RPCs not in generated types | YES — RPCs exist in DB |

**Root cause of all `as any`**: The Supabase type file (`types.ts`) was generated before these tables/RPCs/columns were created in the Dashboard. Regenerating types with `supabase gen types` would eliminate most casts.

---

## TASK 6: Environment Variables

### rotina-de-paz-app (process.env)

| Variable | File:Line | Used For |
|----------|-----------|----------|
| `SUPABASE_URL` | client.server.ts:9, auth-middleware.ts:12, client.ts:5 | Supabase connection |
| `SUPABASE_ANON_KEY` | auth-middleware.ts:13, client.ts:6 | Anon client auth |
| `SUPABASE_SERVICE_ROLE_KEY` | client.server.ts:10 | Admin client (bypasses RLS) |
| `KIRVANO_WEBHOOK_SECRET` | kirvano.ts:102, config.functions.ts:18 | Webhook HMAC verification |
| `KIRVANO_URL_SECRET` | kirvano.ts:93 | URL query param auth for webhook |
| `META_PIXEL_ID` | meta-capi.server.ts:17 | Facebook Pixel ID for CAPI |
| `META_CAPI_TOKEN` | meta-capi.server.ts:18 | CAPI access token |
| `META_CAPI_TEST_CODE` | meta-capi.server.ts:21 | Optional test event code |
| `RESEND_API_KEY` | email.server.ts:108, send-email.functions.ts:20 | Resend email API |
| `RESEND_FROM` | email.server.ts:14 | Email sender address |
| `PUBLIC_SITE_URL` | email.server.ts:7 | Site URL for magic links |
| `SITE_URL` | email.server.ts:8 | Fallback site URL |
| `CRON_SECRET` | capi-retry.ts:39 | Cron job auth |
| `NODE_ENV` | config.server.ts:21 | Environment detection |

### rotina-de-paz-app (import.meta.env)

| Variable | File:Line | Used For |
|----------|-----------|----------|
| `VITE_SUPABASE_URL` | client.ts:5 | Client-side Supabase URL |
| `VITE_SUPABASE_ANON_KEY` | client.ts:6 | Client-side anon key |

### Quiz-sacra (import.meta.env)

| Variable | File:Line | Used For |
|----------|-----------|----------|
| `VITE_SUPABASE_URL` | supabase.ts:3 | Client Supabase URL |
| `VITE_SUPABASE_ANON_KEY` | supabase.ts:4 | Client anon key |
| `VITE_KIRVANO_URL` | QuizApp.tsx:36 | Main checkout URL |
| `VITE_USE_CHECKOUT_SACRA` | QuizApp.tsx:41 | Feature flag: Sacra checkout vs Kirvano |
| `VITE_CHECKOUT_SACRA_URL` | QuizApp.tsx:44 | Sacra checkout URL |
| `VITE_KIRVANO_UPSELL_URL` | funil.ts:108 | Upsell checkout URL |
| `VITE_KIRVANO_DOWNSELL_URL` | funil.ts:166 | Downsell checkout URL |
| `DEV` | quiz.ts:622 | Dev-only validation check |

---

## Cross-Repo Data Flow

```
Quiz-sacra (browser)                    rotina-de-paz-app (server)
─────────────────────                   ──────────────────────────
1. User answers quiz
2. persist_lead(answers) ──RPC──→       leads table
3. persist_quiz_responses ──RPC──→      quiz_responses table
4. save_lead_contact(email/whatsapp)──→ leads table (update)
5. upsert_tracking_session ──RPC──→     tracking_sessions table
6. track_quiz_step ──RPC──→             quiz_steps table
7. fbq("Lead") ──pixel──→              Meta (client-side)
8. fbq("InitiateCheckout") ──pixel──→   Meta (client-side)
9. redirect to Kirvano ──→             payment

                                        Kirvano sends webhook POST
                                        ──────────────────────────
10. kirvano.ts receives POST ──→        webhook_logs (insert)
11. processKirvanoPayload ──→           product_kirvano_offers (lookup)
12. ensureUserForEmail ──→              profiles / auth.users (create/find)
13. entitlements.upsert ──→             entitlements table
14. sendWelcomeEmail ──→                Resend API → user inbox
15. purchases.upsert ──→                purchases table
16. sendMetaCapiPurchase ──→            tracking_sessions (read fbp/fbc)
    ──→ graph.facebook.com              Meta CAPI (server-side)

                                        Cron (hourly)
                                        ──────────────────────────
17. capi-retry.ts GET ──→               webhook_logs (read failed)
18. sendMetaCapiPurchase ──→            Meta CAPI retry
19. webhook_logs update ──→             capi_status: sent/failed

Key join:
  Quiz external_id (qs_UUID) travels as:
    localStorage → URL param "src" → Kirvano → webhook payload.utm.src
    tracking_sessions.external_id = payload.utm.src
    This enables CAPI to recover fbp/fbc/ip/ua from the quiz session.
```
