# Meta CAPI / Pixel / Tracking Audit Report

**Date:** 2026-06-15  
**Scope:** `rotina-de-paz-app` (server) + `Quiz-sacra` (client)  
**Auditor:** Claude (automated)

---

## A. ALL Pixel Events (Browser)

| # | Event | File:line | eventID format | user_data | content_ids | domain_guard |
|---|-------|-----------|---------------|-----------|-------------|--------------|
| 1 | **PageView** | `Quiz-sacra/index.html:20` | none (auto) | none | none | YES - `location.hostname === 'sacra.rotinadepaz.com.br' \|\| location.hostname === 'rotinadepaz.com.br'` (line 18) |
| 2 | **QuizStep** (trackCustom) | `Quiz-sacra/src/components/quiz/QuizApp.tsx:302` | none | none | none | **NO** - fires on any domain |
| 3 | **Lead** (trackSingle) | `Quiz-sacra/src/components/quiz/QuizApp.tsx:483` | `lead_{externalId}` (line 487) | em, ph, external_id via `fbq("init", PIXEL, {...})` (line 478-482) | none | **NO** - no hostname check before fbq call (lines 472-489) |
| 4 | **InitiateCheckout** | `Quiz-sacra/src/lib/tracking.ts:160` | `ic_{externalId}_{scope}` (line 148) | none (relies on pixel init) | `["rotina-de-paz"]` (line 153) | YES - lines 131-133 |
| 5 | **Purchase** (browser) | **DOES NOT EXIST** | -- | -- | -- | -- |

**Findings:**
- **BUG: Lead event has NO domain guard.** It will fire on localhost/preview. Lines 472-489 of QuizApp.tsx have no hostname check. PageView and InitiateCheckout are guarded, but Lead is not.
- **BUG: QuizStep (trackCustom) has NO domain guard.** Line 302 fires `fbq` without hostname check. However, since `fbq('init')` only runs on production domains (index.html:18), the fbq queue should be empty on non-production. **But** the Lead event re-inits the pixel (line 478) without domain guard, so on dev, if contact is submitted before QuizStep fires, QuizStep would work on dev too. In practice low risk since init happens after QuizStep fires.
- Purchase pixel was intentionally removed from browser - correct architectural decision.

---

## B. ALL CAPI Events (Server)

| # | Event | File:line | event_id | user_data fields | content_ids | action_source |
|---|-------|-----------|----------|-----------------|-------------|---------------|
| 1 | **Purchase** | `rotina-de-paz-app/src/lib/admin/meta-capi.server.ts:159` | `transactionId` (sale_id from Kirvano) - line 78-79 | em, ph, fn, ln, fbp, fbc, client_ip_address, client_user_agent, external_id (all hashed except fbp/fbc/ip/ua) - lines 139-147 | `["rotina-de-paz"]` (line 156) | `website` (line 161) |

**No other CAPI events exist.** Lead and InitiateCheckout are browser-only.

---

## C. fbc Construction - Complete Trace

### 1. Client: fbclid captured from URL
**File:** `Quiz-sacra/src/lib/tracking.ts:61`
```
const fbclid = params.get("fbclid") || null;
```
`captureMetaClickData()` reads `fbclid` from `window.location.search`.

### 2. Client: _fbc cookie read
**File:** `Quiz-sacra/src/lib/tracking.ts:30`
```
const fbc = cookies.match(/(?:^|;\s*)_fbc=([^;]+)/)?.[1] ?? null;
```

### 3. Client: synthetic fbc built when cookie missing
**File:** `Quiz-sacra/src/lib/tracking.ts:66-69`
```
if (!fbc && fbclid) {
  fbc = `fb.1.${Date.now()}.${fbclid}`;
}
```
Correct Meta format: `fb.1.<timestamp_ms>.<fbclid>`.

### 4. Client: fbc sent to Kirvano checkout URL
**File:** `Quiz-sacra/src/lib/utm.ts:44`
```
if (fbc) url.searchParams.set("fbc", fbc);
```
Also sends raw fbclid separately (line 43). Both travel as URL params to Kirvano.

### 5. Server: fbc arrives from webhook payload
**File:** `rotina-de-paz-app/src/lib/admin/meta-capi.server.ts:127`
```
const cookieFbclid: string | null = cookies?.fbclid ?? null;
```
Kirvano returns cookies data in `payload.cookies`. The server reads `cookies.fbclid`.

### 6. Server: tracking_session lookup
**File:** `rotina-de-paz-app/src/lib/admin/meta-capi.server.ts:98-104`
```
const { data } = await (supabaseAdmin as any)
  .from("tracking_sessions")
  .select("fbp, fbc, client_ip, user_agent")
  .eq("external_id", externalId)
  .maybeSingle();
```
Looks up by `external_id` (the `qs_*` UUID that traveled as `utm.src`).

### 7. Server: fbc construction fallback - THE DOUBLE-WRAP FIX
**File:** `rotina-de-paz-app/src/lib/admin/meta-capi.server.ts:129-134`
```
const fbcFromCookie: string | null = cookieFbclid
  ? cookieFbclid.startsWith("fb.")
    ? cookieFbclid                           // already formatted → use as-is
    : `fb.1.${Date.now()}.${cookieFbclid}`   // raw fbclid → wrap
  : null;
const fbc: string | null = ts?.fbc ?? fbcFromCookie ?? cookies?.fbc ?? null;
```

**Does the fix correctly handle all cases?**
- **Raw fbclid** (e.g. `AbCdEf123`): wraps into `fb.1.<ts>.AbCdEf123` - CORRECT
- **Already-formatted fbc** (e.g. `fb.1.1234567890.AbCdEf123`): uses as-is - CORRECT
- **null**: returns null - CORRECT

**Priority order:** tracking_session.fbc > cookieFbclid (with format check) > cookies.fbc

### 8. Server: fbc sent to Meta
**File:** `rotina-de-paz-app/src/lib/admin/meta-capi.server.ts:144`
```
if (fbc) user_data.fbc = fbc;
```

**VERDICT: fbc flow is CORRECT.** The double-wrap fix properly handles all three cases.

---

## D. fbp Trace

### 1. Client: fbp generated
**File:** `Quiz-sacra/src/lib/tracking.ts:29` - read from `_fbp` cookie (set by Meta Pixel automatically)

### 2. Client: fbp persisted in sessionStorage
**File:** `Quiz-sacra/src/lib/tracking.ts:72` - stored as part of `MetaClickData` in sessionStorage

### 3. Client: fbp sent to Kirvano checkout
**File:** `Quiz-sacra/src/lib/utm.ts:45`
```
if (fbp) url.searchParams.set("fbp", fbp);
```

### 4. Client: fbp saved to tracking_sessions
**File:** `Quiz-sacra/src/lib/tracking.ts:105-106`
```
p_fbp: fbp ?? null,
```

### 5. Server: fbp recovered
**File:** `rotina-de-paz-app/src/lib/admin/meta-capi.server.ts:125`
```
const fbp: string | null = ts?.fbp ?? cookies?.fbp ?? null;
```
Priority: tracking_session > cookies from Kirvano payload.

### 6. Server: fbp sent to Meta
**File:** `rotina-de-paz-app/src/lib/admin/meta-capi.server.ts:143`
```
if (fbp) user_data.fbp = fbp;
```

**VERDICT: fbp flow is CORRECT.**

---

## E. ph (Phone Hash) Trace

### 1. Phone captured (client)
**File:** `Quiz-sacra/src/components/quiz/QuizApp.tsx:476`
```
const ph = hasWhatsapp ? `55${digits}` : undefined;
```
Used in Lead pixel Advanced Matching (line 481). `digits` is the raw WhatsApp number with non-digits stripped.

### 2. Phone arrives in webhook (server)
**File:** `rotina-de-paz-app/src/lib/admin/meta-capi.server.ts:111-113`
```
const rawPhone: string | null =
  payload?.customer?.phone_number ?? payload?.customer?.phone ?? payload?.customer?.cellphone ?? null;
```

### 3. Normalized to E.164
**File:** `rotina-de-paz-app/src/lib/admin/meta-capi.server.ts:114-121`
- Strip all non-digits (line 114)
- Remove leading zero (line 116-117)
- If 10-11 digits (BR without country code), prefix `55` (line 118-120)

### 4. Hashed (SHA-256)
**File:** `rotina-de-paz-app/src/lib/admin/meta-capi.server.ts:140`
```
const ph = sha256(phoneDigits);
```
`sha256()` at line 25-30: trims, lowercases, then SHA-256 hex digest.

### 5. Sent in which events?
- **Lead (browser):** YES - via Advanced Matching `fbq("init", PIXEL, { ph })` at QuizApp.tsx:481. **NOT hashed by us** - Meta Pixel SDK handles hashing for Advanced Matching.
- **Purchase (CAPI):** YES - `user_data.ph = [ph]` at meta-capi.server.ts:140. Hashed by us.

**VERDICT: Phone flow is CORRECT.** Client sends raw to pixel (correct for AM), server hashes for CAPI (correct for server API).

---

## F. Dedup Analysis

### 1. CAPI event_id
**File:** `rotina-de-paz-app/src/lib/admin/meta-capi.server.ts:78-79`
```
const event_id: string | null =
  opts.transactionId ?? payload?.sale_id ?? payload?.checkout_id ?? null;
```
Value: Kirvano's `sale_id` (transaction ID), resolved in `kirvano.server.ts:107-109`.

### 2. Browser Purchase pixel exists?
**NO.** Exhaustive search confirms Purchase pixel was removed from the client. Only CAPI Purchase exists. This is the correct architecture.

### 3. Kirvano CAPI
Kirvano may fire its own Purchase event to Meta via its built-in pixel integration. We don't control Kirvano's event_id. If Kirvano sends Purchase with a different event_id than our sale_id, **both events will count** (no dedup).

**RISK:** If Kirvano has its own pixel/CAPI integration enabled, it will double-count Purchase events. **Recommendation:** Verify in Kirvano dashboard that their Meta pixel integration is DISABLED. Our CAPI is the single source of truth.

### 4. UTMify
**File:** `Quiz-sacra/index.html:33-38` - UTMify script loaded with `data-utmify-prevent-xcod-sck` and `data-utmify-prevent-subids`.

UTMify can fire Purchase events via its own integration. Per the project's Guia.md: "NAO deixar a UTMify enviar conversao pro Meta (causaria double-count, pois ela usa outro event_id)".

**RISK:** If UTMify's Meta integration is enabled in its dashboard, it will double-count. **Verify UTMify dashboard settings.**

### 5. For dedup to work: what must be true?
- Kirvano's own Meta pixel/CAPI must be **DISABLED**
- UTMify's Meta conversion firing must be **DISABLED**
- Our CAPI is the only source of Purchase events to Meta
- `event_id = sale_id` is unique per transaction and stable across retries

**VERDICT: Internal dedup is SOLID (event_id = sale_id, no browser Purchase). External dedup depends on Kirvano/UTMify config.**

---

## G. Retry CAPI

### 1. Webhook handler creates log and captures id
**File:** `rotina-de-paz-app/src/routes/api/public/webhooks/kirvano.ts:135`
```
const logId = await logEvent({...});
```
Insert happens BEFORE processing (line 135). Returns `data?.id` (line 59).

### 2. processKirvanoPayload returns capiStatus
**File:** `rotina-de-paz-app/src/lib/admin/kirvano.server.ts:325-348`
```
capiStatus = capi.sent ? "sent" : (capi.error === "missing_credentials" ? "skipped" : "failed");
```

### 3. Handler updates capi_status by id
**File:** `rotina-de-paz-app/src/routes/api/public/webhooks/kirvano.ts:141-149`
```
await supabaseAdmin.from("webhook_logs").update({
  capi_status: result.capiStatus ?? null,
  capi_error: result.capiError ?? null,
  capi_retries: result.capiStatus ? 1 : 0,
  capi_last_attempt: result.capiStatus ? new Date().toISOString() : null,
}).eq("id", logId);
```

### 4. Cron finds failed entries
**File:** `rotina-de-paz-app/src/routes/api/cron/capi-retry.ts:48-54`
```
.eq("capi_status", "failed")
.lt("capi_retries", MAX_CAPI_ATTEMPTS)  // MAX_CAPI_ATTEMPTS = 5
.order("created_at", { ascending: true })
.limit(MAX_RETRIES_PER_RUN)              // MAX_RETRIES_PER_RUN = 10
```

### 5. Cron reprocesses
**File:** `rotina-de-paz-app/src/routes/api/cron/capi-retry.ts:95-98`
```
const capi = await sendMetaCapiPurchase(payload, {
  transactionId: txId,
  productNames,
});
```
Calls the same `sendMetaCapiPurchase` function with the stored payload.

### 6. Max retries, max per run
- **Max retries per event:** 5 (`MAX_CAPI_ATTEMPTS` at line 16)
- **Max per cron run:** 10 (`MAX_RETRIES_PER_RUN` at line 14)

### 7. Race condition protection
**No explicit locking.** The cron selects rows with `capi_status = 'failed'` and updates them after processing. If two cron runs overlap:
- Both could select the same rows
- Both would call `sendMetaCapiPurchase` with the same payload
- **Safe because:** Meta deduplicates by `event_id = sale_id`. Double-sending is harmless.
- The `capi_retries` counter might be slightly off (both read same value, increment by 1), but this is cosmetic.

**VERDICT: Retry mechanism is CORRECT. Race condition is mitigated by Meta's event_id dedup.**

---

## H. Domain Guard Analysis

| Location | Guard present? | Allowed hostnames |
|----------|---------------|-------------------|
| `index.html:18` (PageView + init) | YES | `sacra.rotinadepaz.com.br`, `rotinadepaz.com.br` |
| `tracking.ts:95-96` (saveTrackingSession) | YES | `sacra.rotinadepaz.com.br`, `rotinadepaz.com.br` |
| `tracking.ts:131-133` (InitiateCheckout) | YES | `sacra.rotinadepaz.com.br`, `rotinadepaz.com.br` |
| `QuizApp.tsx:302` (QuizStep) | **NO** | -- |
| `QuizApp.tsx:472-489` (Lead + Advanced Matching) | **NO** | -- |

**BUG: Lead event and QuizStep have no domain guard.** The Lead event at QuizApp.tsx:478 calls `fbq("init", PIXEL, {...})` which RE-INITIALIZES the pixel on any domain (including localhost), then fires the Lead event. This means:
1. On localhost/preview, Lead events WILL fire (polluting production pixel data)
2. The `fbq("init")` call with Advanced Matching data will work even on non-production domains

**Recommendation:** Add hostname check before the `fbq("init", PIXEL, {...})` block at QuizApp.tsx:472.

---

## I. content_ids Consistency

| Location | content_ids value |
|----------|-------------------|
| `tracking.ts:153` (InitiateCheckout) | `["rotina-de-paz"]` |
| `meta-capi.server.ts:156` (Purchase CAPI) | `["rotina-de-paz"]` |

**VERDICT: Consistent.** Both use `["rotina-de-paz"]` (hyphenated slug). Lead event does not send content_ids (correct - it's not a product event).

---

## J. Complete Purchase Data Flow

```
User lands on quiz (sacra.rotinadepaz.com.br)
  ├─ index.html:18-20    → fbq('init', '838169472100225') + PageView
  ├─ QuizApp.tsx:197      → captureMetaClickData() → reads fbclid from URL + _fbc/_fbp cookies
  │                         → stores in sessionStorage (tracking.ts:55-76)
  ├─ QuizApp.tsx:196      → captureUtms() → reads UTM params from URL → localStorage
  └─ QuizApp.tsx:202      → trackStep("arrival") → quiz funnel beacon to Supabase

User answers questions
  └─ QuizApp.tsx:302      → fbq("trackCustom", "QuizStep", {...}) per question

Loading screen
  └─ QuizApp.tsx:336      → persistLead() → saves lead in Supabase with answers

Contact form submitted
  ├─ QuizApp.tsx:478-487  → fbq("init", PIXEL, {em, ph, external_id}) → Advanced Matching
  │                       → fbq("trackSingle", PIXEL, "Lead", {...}, {eventID: "lead_<eid>"})
  └─ QuizApp.tsx:494      → setStage("result")

User clicks CTA (checkout)
  ├─ QuizApp.tsx:501      → saveTrackingSession(externalId) → upserts fbp/fbc/fbclid/ua to Supabase
  ├─ QuizApp.tsx:504      → trackInitiateCheckout() → fbq("track", "InitiateCheckout", {...})
  ├─ QuizApp.tsx:521      → buildKirvanoUrl() → appends utm/fbclid/fbc/fbp/src to checkout URL
  └─ redirect to Kirvano checkout (window.location.href)

User pays on Kirvano
  └─ Kirvano sends webhook POST to /api/public/webhooks/kirvano

Server processes webhook
  ├─ kirvano.ts:95-99     → validates KIRVANO_URL_SECRET (?k= param)
  ├─ kirvano.ts:121       → validates HMAC signature (if present)
  ├─ kirvano.ts:135       → logEvent() → inserts webhook_logs, gets logId
  ├─ kirvano.ts:138       → processKirvanoPayload(parsed, logId)
  │   ├─ kirvano.server.ts:207-210  → resolves offer_id → product_id via product_kirvano_offers
  │   ├─ kirvano.server.ts:218      → ensureUserForEmail() → creates/finds auth user
  │   ├─ kirvano.server.ts:249-252  → upsert entitlements (user_id, product_id)
  │   ├─ kirvano.server.ts:298-315  → upsert purchases (analytics)
  │   └─ kirvano.server.ts:331-332  → sendMetaCapiPurchase(payload, {...})
  │       ├─ meta-capi.server.ts:98-104  → lookup tracking_session by external_id (utm.src)
  │       ├─ meta-capi.server.ts:125-134 → resolve fbp/fbc (tracking_session > cookies > fallback)
  │       ├─ meta-capi.server.ts:138-147 → build user_data (em, ph, fn, ln, fbp, fbc, ip, ua, external_id)
  │       ├─ meta-capi.server.ts:156     → content_ids = ["rotina-de-paz"]
  │       ├─ meta-capi.server.ts:163     → event_id = sale_id
  │       └─ meta-capi.server.ts:176-184 → POST to graph.facebook.com/v22.0/<pixel>/events
  ├─ kirvano.ts:141-149   → update webhook_logs with capi_status/capi_error
  └─ return 200 to Kirvano

If CAPI fails:
  └─ capi-retry.ts (hourly cron)
      ├─ Selects up to 10 rows with capi_status='failed' and capi_retries < 5
      ├─ Re-calls sendMetaCapiPurchase() with stored payload
      └─ Updates capi_status/capi_retries per row
```

---

## Summary of Bugs & Risks

### BUGS (should fix)

| # | Severity | Issue | Location |
|---|----------|-------|----------|
| 1 | **MEDIUM** | Lead event has NO domain guard. Fires on localhost/preview, polluting pixel data. The `fbq("init", PIXEL, {...})` re-inits the pixel on any domain. | `QuizApp.tsx:472-489` |
| 2 | **LOW** | QuizStep (trackCustom) has no domain guard. Mitigated by pixel not being initialized on non-prod (unless Lead fires first). | `QuizApp.tsx:302` |

### RISKS (verify externally)

| # | Severity | Risk | Mitigation |
|---|----------|------|------------|
| 3 | **HIGH** | If Kirvano's own Meta pixel/CAPI is enabled, Purchase events will double-count (different event_id). | Verify Kirvano dashboard: Meta integration must be OFF. |
| 4 | **HIGH** | If UTMify fires Purchase to Meta, double-count. | Verify UTMify dashboard: Meta conversion must be OFF. |
| 5 | **LOW** | Cron retry has no row-level locking. Overlapping runs could double-send. | Safe: Meta deduplicates by event_id. Counter may be slightly off. |
| 6 | **INFO** | No CAPI for Lead or InitiateCheckout. Match quality for upper-funnel events is browser-only. | Acceptable tradeoff for now. |
| 7 | **INFO** | `event_source_url` is hardcoded to `https://rotinadepaz.com.br/` (meta-capi.server.ts:162). If quiz runs on `sacra.rotinadepaz.com.br`, this is technically the wrong URL, but Meta doesn't use it for matching. | Cosmetic. |

### WHAT'S CORRECT

- fbc double-wrap fix: handles raw fbclid, pre-formatted fbc, and null correctly
- fbp flow: cookie -> sessionStorage -> tracking_session -> CAPI
- Phone normalization: E.164 with +55 prefix logic
- Phone hashing: raw to pixel AM (correct), SHA-256 for CAPI (correct)
- content_ids: consistent `["rotina-de-paz"]` everywhere
- Dedup architecture: single-source Purchase via CAPI only, event_id = sale_id
- Retry: up to 5 attempts, 10 per cron run, safe due to event_id dedup
- external_id linkage: quiz generates `qs_*` UUID -> travels as `src` param -> Kirvano returns as `utm.src` -> server looks up tracking_session -> recovers fbp/fbc/ip/ua
