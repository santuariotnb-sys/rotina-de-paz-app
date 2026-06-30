# AUDITORIA COMPLETA DO BANCO DE DADOS
**Projeto:** Rotina de Paz (cemjibbauvvyfaxilrvm)  
**Data:** 2026-06-15  
**Auditor:** Claude Opus 4.6

---

## 1. TABELAS DO SCHEMA `public` (25 tabelas)

### 1.1 admin_audit_logs (15 rows)
| Coluna | Tipo | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | gen_random_uuid() |
| admin_id | uuid | YES | - |
| action | text | NO | - |
| resource_type | text | YES | - |
| resource_id | text | YES | - |
| metadata | jsonb | YES | - |
| created_at | timestamptz | NO | now() |

RLS: ON. Policies: admins insert/read audit logs (authenticated).  
Indexes: pkey, admin_id, created_at DESC.

### 1.2 admin_users (1 row)
| Coluna | Tipo | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | gen_random_uuid() |
| user_id | uuid | NO | - |
| email | text | NO | - |
| name | text | NO | '' |
| role | text | NO | 'admin' |
| created_at | timestamptz | YES | now() |

RLS: ON. Policy: admins read admin_users (authenticated).  
Indexes: pkey, user_id UNIQUE.

### 1.3 audio_tracks (14 rows)
| Coluna | Tipo | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | gen_random_uuid() |
| product_id | uuid | NO | - |
| day | smallint | NO | - |
| kind | text | NO | - |
| title | text | NO | - |
| subtitle | text | YES | - |
| duration_seconds | integer | NO | 0 |
| audio_url | text | YES | - |
| transcript | text | YES | - |
| sort_order | integer | NO | 0 |
| created_at | timestamptz | NO | now() |
| updated_at | timestamptz | NO | now() |
| is_free_preview | boolean | NO | false |

RLS: ON. Policies: admins manage, auth read gated (entitlement + free_preview).  
Indexes: pkey, (product_id, day, kind).

### 1.4 checkout_config (2 rows)
| Coluna | Tipo | Nullable | Default |
|--------|------|----------|---------|
| key | text | NO (PK) | - |
| value | text | NO | - |
| description | text | YES | - |
| updated_at | timestamptz | YES | now() |

**RLS: OFF** -- FINDING: RLS is disabled on public.checkout_config.  
Valores atuais:
- `production_start_at` = `2026-06-08T00:00:00Z`
- `test_emails` = `henrique.voinvicta@gmail.com,guilherme.claude@gmail.com`

### 1.5 course_lessons (7 rows)
| Coluna | Tipo | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | gen_random_uuid() |
| course_id | uuid | NO | - |
| module_index | smallint | NO | 1 |
| lesson_index | smallint | NO | 1 |
| title | text | NO | - |
| description | text | YES | - |
| video_url | text | YES | - |
| duration_seconds | integer | NO | 0 |
| sort_order | integer | NO | 0 |
| created_at | timestamptz | NO | now() |
| updated_at | timestamptz | NO | now() |
| is_free_preview | boolean | NO | false |

RLS: ON. Policies: admins manage, auth read active courses.  
Indexes: pkey, (course_id, module_index, lesson_index).

### 1.6 courses (1 row)
| Coluna | Tipo | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | gen_random_uuid() |
| slug | text | NO (UNIQUE) | - |
| title | text | NO | - |
| subtitle | text | YES | - |
| badge | text | YES | - |
| cover_url | text | YES | - |
| days | smallint | NO | 0 |
| modules | smallint | NO | 0 |
| sort_order | integer | NO | 0 |
| status | text | NO | 'active' |
| kind | text | NO | 'devocional' |
| created_at | timestamptz | NO | now() |
| updated_at | timestamptz | NO | now() |
| required_product_id | uuid | YES | - |

RLS: ON. Policies: admins manage, auth read active.  
Indexes: pkey, slug UNIQUE, required_product_id.

### 1.7 ebooks (6 rows)
| Coluna | Tipo | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | gen_random_uuid() |
| title | text | NO | - |
| subtitle | text | YES | - |
| category | text | NO | 'bonus' |
| price_cents | integer | NO | 0 |
| badge | text | YES | - |
| cover_url | text | YES | - |
| file_url | text | YES | - |
| sort_order | integer | NO | 0 |
| status | text | NO | 'active' |
| created_at | timestamptz | NO | now() |
| updated_at | timestamptz | NO | now() |
| required_product_id | uuid | YES | - |
| description | text | YES | - |

RLS: ON. Policies: admins manage, auth read active.  
Indexes: pkey, (category, sort_order), (status, sort_order), required_product_id.

### 1.8 entitlements (19 rows)
| Coluna | Tipo | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | gen_random_uuid() |
| user_id | uuid | NO | - |
| product_id | uuid | NO | - |
| source | text | NO | 'kirvano' |
| status | text | NO | 'active' |
| kirvano_transaction_id | text | YES | - |
| kirvano_offer_id | text | YES | - |
| buyer_email | text | YES | - |
| granted_at | timestamptz | NO | now() |
| revoked_at | timestamptz | YES | - |
| metadata | jsonb | NO | '{}' |
| created_at | timestamptz | NO | now() |
| updated_at | timestamptz | NO | now() |

Status breakdown: 19 active, 0 other.  
RLS: ON. Policies: admins manage, users read own.  
Indexes: pkey, (user_id, product_id) UNIQUE, user_id, product_id, buyer_email, (user_id, status).  
**Note:** Duplicate indexes on user_id: `idx_entitlements_user_id` and `idx_entitlements_user`.

### 1.9 leads (128 rows, 122 reais)
| Coluna | Tipo | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | gen_random_uuid() |
| created_at | timestamptz | NO | now() |
| name | text | YES | - |
| email | text | YES | - |
| archetype | text | YES | - |
| scores | jsonb | YES | - |
| desire | text | YES | - |
| situation | text | YES | - |
| risk_flag | boolean | YES | false |
| utm_source..utm_term | text | YES | - |
| updated_at | timestamptz | YES | now() |
| fbclid | text | YES | - |
| gclid | text | YES | - |
| whatsapp | text | YES | - |
| consent_timestamp | timestamptz | YES | - |
| is_test | boolean | NO | false |
| external_id | text | YES | - |

RLS: ON. Policies: admins read/update/delete (authenticated).  
Indexes: pkey, created_at DESC, email, archetype, utm_source, whatsapp.

### 1.10 legal_acceptances (7 rows)
Columns: id, user_id, email, terms_version, privacy_version, responsibility_version, accepted_at, ip, user_agent, created_at.  
RLS: ON. Policy: legal_select_own.

### 1.11 louvores (148 rows)
Columns: id, book, chapter_index, title, subtitle, duration_seconds, audio_url, is_bonus, sort_order, created_at, updated_at.  
RLS: ON. Policies: admins manage, auth read all.

### 1.12 processed_events (0 rows)
Columns: sale_id (PK text), event_name, processed_at, emq_response (jsonb).  
RLS: ON. Policy: service_role_all.

### 1.13 product_kirvano_offers (6 rows)
Columns: id, product_id, kirvano_offer_id (UNIQUE), label, created_at.  
RLS: ON. Policy: admins manage.

### 1.14 product_offers (7 rows)
Columns: id, product_id, offer_key, price_cents, anchor_price_cents, offer_headline, offer_subtext, badge, urgency_text, active, is_default, created_at.  
RLS: ON. Policies: admins manage, anon read active, authenticated read active/admin.

### 1.15 products (6 rows)
| Slug | Name | Kind | Price | Role |
|------|------|------|-------|------|
| biblia-das-emocoes | Biblia das Emocoes | ebook | R$16.90 | bump |
| chave-da-gratidao | Chave da Gratidao | course | R$67.00 | upsell |
| chave-da-gratidao-light | Chave da Gratidao Light | course | R$37.00 | downsell |
| da-ansiedade-a-gratidao | Da Ansiedade a Gratidao | ebook | R$19.90 | main |
| devocional-30-dias-salmos | Devocional 30 Dias Salmos | ebook | R$18.90 | bump |
| rotina-de-paz | Rotina de Paz | method | R$47.00 | main |

RLS: ON. Policies: admins manage, anon/auth read active.  
**Note:** Two unique indexes on slug: `products_slug_key` and `products_slug_unique` (redundant).

### 1.16 profiles (14 rows)
Columns: id, user_id (UNIQUE), email, name, archetype, desire, situation, lead_id, created_at, updated_at.  
RLS: ON. Policies: users read/update own, admins read/update all, users insert own.

### 1.17 purchases (19 rows)
Columns: id, lead_id, user_id, external_id, transaction_id (UNIQUE), product_name, product_type, gross_value, status, kirvano_offer_id, buyer_email, utm_source..utm_term, metadata, created_at, is_test, src.  
RLS: ON. Policy: admins manage.

**Breakdown:**

| product_type | status | is_test | count | total (centavos) |
|---|---|---|---|---|
| order_bump | confirmed | false | 6 | 10940 (R$109.40) |
| principal | confirmed | true | 2 | 9400 (R$94.00) |
| principal | confirmed | false | 9 | 42300 (R$423.00) |
| upsell | confirmed | false | 2 | 13400 (R$134.00) |

**Totals:** 19 confirmed, 0 refunded, 0 other status.  
Receita real (non-test confirmed): R$666.40

### 1.18 quiz_funnel_events (1741 rows)
Columns: id, session_id, stage, question_key, created_at, quiz_version, is_test.  
RLS: ON. No explicit anon/auth policies besides service_role inherited.

**Stage breakdown:**

| Stage | Count |
|-------|-------|
| arrival | 612 |
| question | 775 |
| result | 173 |
| offer | 156 |
| cta | 22 |
| contact | 3 |

462 distinct sessions. Quiz completion rate: 173/612 = 28.3%.

### 1.19 quiz_responses (889 rows)
Columns: id, created_at, lead_id, question_key, answer_value, answer_text, time_to_answer.  
RLS: ON. Policy: admins read.  
127 distinct lead_ids referenced (vs 128 total leads = 1 lead without responses).

### 1.20 reconciliation_reports (3 rows)
Latest report (2026-06-15 09:00): 3 sales, 100% UTM, 67% tracking, 67% fbc, 100% purchase match.

### 1.21 risk_events (19 rows)
Columns: id, created_at, source.  
RLS: ON. Policy: anon insert (wide open INSERT).

### 1.22 support_tickets (0 rows) / support_messages (0 rows)
Empty. RLS: ON. Policies properly scoped to user_id ownership.

### 1.23 tracking_sessions (9 rows)
Columns: external_id (PK), fbp, fbc, fbclid, client_ip, user_agent, created_at.  
RLS: ON. Policy: service_role_all only.  
Fill rates: 9/9 fbc (100%), 7/9 fbp (78%).

### 1.24 webhook_logs (26 rows)
Columns: id, source, event_type, payload (jsonb), signature, signature_valid, processed, processed_at, error, request_ip, created_at, capi_status, capi_error, capi_retries, capi_last_attempt.

| source | event_type | count |
|--------|-----------|-------|
| kirvano | SALE_APPROVED | 13 |
| kirvano | SALE_REFUNDED | 12 |
| kirvano | SALE_REFUSED | 1 |

- 23 processed, 3 unprocessed
- **capi_status: ALL 26 are NULL** -- no CAPI events ever sent from Kirvano pipeline

RLS: ON. Policies: admins read/update.

---

## 2. TABELAS DO SCHEMA `checkout` (15 tabelas)

| Tabela | Rows | RLS |
|--------|------|-----|
| abandoned_carts | 0 | ON |
| app_access_grants | 0 | ON |
| campaign_snapshots | 0 | ON |
| checkout_config | 10 | ON |
| checkout_funnel_events | 25 | ON |
| checkout_leads | 0 | ON |
| checkout_webhook_logs | 33 | ON |
| jobs | 3 | ON |
| offer_settings | 4 | ON |
| orders | 0 | ON |
| tracking_events | 57 | ON |
| upsell_orders | 0 | ON |
| whatsapp_messages | 0 | ON |
| whatsapp_optout | 0 | ON |
| whatsapp_templates | 1 | ON |

All checkout tables have `ck_service_all` (service_role ALL) policies.  
checkout_config has `ck_anon_read_config` (allowlisted keys).  
offer_settings has `ck_anon_read_offers` (is_enabled=true).

**Note:** `checkout.orders` has 0 rows, `checkout.upsell_orders` has 0 rows -- the Sacra checkout has no paid orders yet. All 19 purchases are via Kirvano.

---

## 3. VIEWS (4 views)

| View | Based On |
|------|----------|
| app_products | products (adds price = price_cents/100) |
| leads_reais | leads WHERE is_test=false AND created_at >= production_start_at |
| vendas_reais | purchases WHERE status='confirmed' AND is_test=false AND created_at >= production_start_at |
| offer_settings | checkout.offer_settings (cross-schema view) |

---

## 4. FUNCTIONS/RPCs (21 functions)

| Function | Args | Security | Callable by |
|----------|------|----------|-------------|
| analytics_checkout_funnel | p_days | INVOKER | postgres, service_role |
| analytics_cohort_weekly | p_weeks | INVOKER | authenticated, postgres, service_role |
| analytics_full_funnel | p_days | INVOKER | postgres, service_role |
| analytics_funnel | p_days | INVOKER | authenticated, postgres, service_role |
| analytics_quiz_conversion | p_days | INVOKER | authenticated, postgres, service_role |
| analytics_quiz_funnel | p_days | INVOKER | postgres, service_role |
| analytics_revenue_breakdown | p_days | INVOKER | authenticated, postgres, service_role |
| analytics_top_segments | p_days, p_min_leads | INVOKER | authenticated, postgres, service_role |
| get_user_id_by_email | p_email | INVOKER | postgres, service_role |
| grant_entitlement_manual | _email, _product_id | INVOKER | authenticated, postgres, service_role |
| handle_new_user | (trigger) | INVOKER | postgres, service_role |
| has_entitlement | _product_id | INVOKER | authenticated, postgres, service_role |
| is_admin | _user_id | INVOKER | authenticated, postgres, service_role |
| persist_lead | 14 params | INVOKER | **PUBLIC, anon**, authenticated |
| persist_quiz_responses | p_rows (jsonb) | INVOKER | anon, authenticated |
| receita_real | (none) | INVOKER | **PUBLIC, anon**, authenticated |
| run_reconciliation | p_hours_back | INVOKER | postgres, service_role |
| save_lead_contact | 4 params | INVOKER | anon, authenticated |
| save_lead_email | p_lead_id, p_email | INVOKER | anon, authenticated |
| set_updated_at | (trigger) | INVOKER | postgres, service_role |
| track_checkout_step | 3 params | INVOKER | anon, authenticated |
| track_quiz_step | 4 params | INVOKER | **PUBLIC**, anon, authenticated |
| upsert_tracking_session | 6 params | INVOKER | anon, authenticated |

---

## 5. CRON JOBS (6 jobs, all active)

| Job | Schedule | Command |
|-----|----------|---------|
| cleanup-webhook-logs | 0 3 * * * | DELETE > 90 days |
| cleanup-tracking-sessions | 0 3 * * * | DELETE > 30 days |
| process-webhook-jobs | * * * * * | POST /functions/v1/process-webhook-jobs |
| retry-pending-grants | */5 * * * * | POST /functions/v1/retry-grants |
| expire-pending-pix | */15 * * * * | Expire PIX orders > 20 min |
| daily-reconciliation | 0 9 * * * | run_reconciliation(24) |

---

## 6. INDEXES

72 indexes total across public schema. Notable:
- **Redundant:** `products_slug_key` + `products_slug_unique` (same column)
- **Redundant:** `idx_entitlements_user_id` + `idx_entitlements_user` (same column)
- **Redundant:** `idx_entitlements_email` + `idx_entitlements_buyer_email` (partial vs full on buyer_email)

---

## 7. DATA CONSISTENCY CHECKS

| Check | Result | Status |
|-------|--------|--------|
| Purchase without entitlement | 0 | OK |
| Entitlement without purchase (kirvano) | 0 | OK |
| Orphan quiz_responses (lead_id not in leads) | 0 | OK |
| Leads without archetype | 1/128 | OK (minimal) |
| Leads without external_id | **128/128** | **CRITICAL** |
| Purchases without src | **19/19** | **CRITICAL** |
| is_test accuracy (2 test purchases match test_emails) | 2 test | OK |
| quiz_responses distinct leads vs total leads | 127 vs 128 | OK |

---

## 8. MIGRATION DRIFT

**No migration files found** at `supabase/migrations/`. The entire database schema is managed via Supabase Dashboard, not version-controlled migrations. Every table, function, and policy exists only in production.

---

## 9. CRITICAL FINDINGS

### SEVERITY: CRITICAL

**F1. leads.external_id is NULL for ALL 128 leads.**  
The `external_id` field was designed to link leads to purchases via `purchases.src`, but it is never populated. The `persist_lead` RPC accepts `p_external_id` but the quiz frontend apparently never sends it. This breaks the entire attribution chain: `vendas_reais` joins on `leads_reais.external_id = purchases.src`, and since both sides are NULL, the join always produces zero matches. The analytics functions (`analytics_cohort_weekly`, `analytics_top_segments`, `analytics_quiz_conversion`) that use this join return zero conversions.

**F2. purchases.src is NULL for ALL 19 purchases.**  
The `src` column in purchases (used by `vendas_reais` view for attribution) is never populated by the Kirvano webhook processing. This is the counterpart to F1 -- neither side of the lead-to-purchase attribution link is populated.

**F3. capi_status is NULL for ALL 26 webhook_logs.**  
No CAPI (Conversions API) events were ever sent through the Kirvano webhook pipeline. The `process-webhook-jobs` cron runs every minute, but CAPI sending is either not implemented or broken.

**F4. public.checkout_config has RLS OFF.**  
While this table only has 2 rows with non-sensitive configuration, RLS being disabled means anon has full read/write access per the grants (DELETE, INSERT, SELECT, TRUNCATE, UPDATE). Anyone could modify `production_start_at` or `test_emails` via the anon key.

### SEVERITY: HIGH

**F5. anon has full DML on checkout_config (public).**  
Grants: DELETE, INSERT, SELECT, TRUNCATE, UPDATE. Combined with RLS OFF, this is a write vulnerability.

**F6. anon has full DML on views `leads_reais` and `vendas_reais`.**  
Both views have DELETE, INSERT, SELECT, TRUNCATE, UPDATE granted to anon. Since these are views on tables with RLS, the actual writability depends on the base table policies, but the grants are unnecessarily broad.

**F7. `receita_real()` and `persist_lead()` granted to PUBLIC role.**  
The `PUBLIC` role (includes unauthenticated connections) can call `receita_real()` to see total revenue, and `persist_lead()` to insert leads. The `persist_lead` grant is intentional (quiz flow), but `receita_real` to PUBLIC leaks business data.

**F8. 3 unprocessed webhook_logs remain.**  
3 webhooks never got processed. Should be investigated for stuck processing.

**F9. No migrations directory.**  
Zero version control over database schema. Any schema recreation or DR would require manual reconstruction.

### SEVERITY: MEDIUM

**F10. `analytics_checkout_funnel`, `analytics_full_funnel`, `analytics_quiz_funnel` not accessible to `authenticated`.**  
These three analytics functions are only callable by postgres/service_role. The dashboard admin (authenticated) can call `analytics_funnel` and others but not these three, which may cause incomplete dashboard data.

**F11. Redundant indexes waste storage.**  
- `products_slug_key` + `products_slug_unique` on products.slug
- `idx_entitlements_user_id` + `idx_entitlements_user` on entitlements.user_id
- `idx_entitlements_email` + `idx_entitlements_buyer_email` partially overlap

**F12. `processed_events` table is empty (0 rows).**  
The Kirvano webhook flow writes to `webhook_logs` but never uses `processed_events`. This table appears unused.

**F13. Checkout schema has zero orders.**  
All 15 checkout tables designed for the Sacra checkout are mostly empty (0 orders, 0 upsell_orders, 0 abandoned_carts). Only config (10 rows), funnel events (25), webhook logs (33), tracking events (57), and jobs (3) have data. The custom checkout is in early testing.

**F14. `checkout.checkout_funnel_events` has no RLS policy for anon/authenticated.**  
RLS is enabled but no policy exists. The `track_checkout_step` function inserts via SECURITY INVOKER, so it relies on the function's own validation rather than RLS. If anyone queries the table directly (not via function), they get zero rows.

**F15. `risk_events` allows anon INSERT with `true` (no restriction).**  
Any anonymous user can insert unlimited risk events. There is no rate limiting at the database level.

---

## 10. NUMERIC SUMMARY

| Metric | Value |
|--------|-------|
| Total leads | 128 |
| Real leads (non-test, post-production) | 122 |
| Total purchases | 19 |
| Real purchases (non-test confirmed) | 17 |
| Real revenue | R$666.40 |
| Test purchases | 2 (R$94.00) |
| Refunds | 0 |
| Entitlements | 19 (all active) |
| Profiles | 14 |
| Quiz responses | 889 (127 distinct leads) |
| Quiz funnel events | 1,741 (462 distinct sessions) |
| Tracking sessions | 9 |
| Webhook logs | 26 (23 processed, 3 stuck) |
| Products | 6 |
| Audio tracks | 14 |
| Ebooks | 6 |
| Courses | 1 (7 lessons) |
| Louvores | 148 |
| Cron jobs | 6 |
| Functions | 21 |

---

## 11. RECOMMENDATIONS (prioritized)

1. **[URGENT]** Populate `leads.external_id` -- fix quiz frontend to pass external_id to `persist_lead()`, then backfill existing leads
2. **[URGENT]** Populate `purchases.src` -- fix Kirvano webhook handler to set src from webhook payload
3. **[URGENT]** Enable RLS on `public.checkout_config` and REVOKE DML from anon
4. **[URGENT]** REVOKE unnecessary grants from anon on `leads_reais`, `vendas_reais` views
5. **[HIGH]** Fix CAPI sending in Kirvano webhook pipeline (all 26 logs have capi_status=NULL)
6. **[HIGH]** Investigate 3 unprocessed webhook_logs
7. **[HIGH]** REVOKE `receita_real()` from PUBLIC role
8. **[HIGH]** Create `supabase/migrations/` and version-control the schema
9. **[MEDIUM]** Grant `analytics_checkout_funnel`, `analytics_full_funnel`, `analytics_quiz_funnel` to authenticated
10. **[MEDIUM]** Drop redundant indexes
11. **[LOW]** Add rate limiting to `risk_events` anon INSERT policy
12. **[LOW]** Clean up or drop unused `processed_events` table
