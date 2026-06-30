# Frente A -- Auditoria Banco/Estrutura

**Projeto:** cemjibbauvvyfaxilrvm (rotina-de-paz-app)
**Data:** 2026-06-15
**Metodo:** Queries via PostgREST (service_role + anon keys), OpenAPI spec, leitura de migrations

---

## Tabelas (public) -- 26 tabelas

| Tabela | Colunas-chave | Rows | Notas |
|--------|--------------|------|-------|
| profiles | id(uuid), user_id, email, name, archetype, desire, situation, lead_id | 14 | Trigger set_updated_at |
| products | id(uuid), slug, name, price_cents(int), currency, status, kind, checkout_url, checkout_role, pagarme_item_code, anchor_price_cents, offer_headline/subtext/badge/urgency | 6 | Catalogo principal |
| entitlements | id(uuid), user_id, product_id, source, status, kirvano_transaction_id, kirvano_offer_id, buyer_email, granted_at, revoked_at, metadata(jsonb) | 19 | 1:1 com purchases |
| purchases | id(uuid), lead_id, user_id, external_id, transaction_id, product_name, product_type, gross_value(int=centavos), status, kirvano_offer_id, buyer_email, utm_source/medium/campaign/content/term, metadata(jsonb) | 19 | gross_value em centavos |
| leads | id(uuid), name, email, archetype, scores(jsonb), desire, situation, risk_flag(bool), utm_*, fbclid, gclid, **whatsapp**(text), **consent_timestamp**(timestamptz) | 121 | Contem campos whatsapp+consent |
| tracking_sessions | external_id(text PK), fbp, fbc, fbclid, client_ip, user_agent, created_at | 7 | **DRIFT** -- nao esta em migrations |
| webhook_logs | id(uuid), source, event_type, payload(jsonb), signature, **signature_valid**(bool), processed(bool), processed_at, error, request_ip | 26 | Contem signature_valid |
| legal_acceptances | id(uuid), user_id, email, terms_version, privacy_version, responsibility_version, accepted_at, ip, user_agent | 7 | |
| support_tickets | id(uuid), user_id, category, subject, status | 0 | Vazia |
| support_messages | id(uuid), ticket_id, sender_type, sender_id, body | 0 | Vazia |
| reconciliation_reports | id(uuid), period_start/end, total_sales, with_utm/tracking/fbc/fbp, purchase_match, divergences(jsonb), summary(jsonb) | 3 | Gerado por pg_cron |
| quiz_responses | id(uuid), lead_id, question_key, answer_value, answer_text, time_to_answer(int) | 847 | |
| quiz_funnel_events | id(uuid), session_id, stage, question_key, quiz_version | 1663 | **DRIFT** -- nao esta em migrations |
| admin_users | id(uuid), user_id, email, name, role | 1 | |
| admin_audit_logs | id(uuid), admin_id, action, resource_type, resource_id, metadata(jsonb) | 15 | |
| audio_tracks | id(uuid), product_id, day(smallint), kind, title, subtitle, duration_seconds, audio_url, transcript, sort_order, is_free_preview | 14 | |
| louvores | id(uuid), book, chapter_index, title, subtitle, duration_seconds, audio_url, is_bonus, sort_order | 148 | |
| ebooks | id(uuid), title, subtitle, category, price_cents, badge, cover_url, file_url, sort_order, status, required_product_id, description | 6 | |
| courses | id(uuid), slug, title, subtitle, badge, cover_url, days, modules, sort_order, status, kind, required_product_id | 1 | |
| course_lessons | id(uuid), course_id, module_index, lesson_index, title, description, video_url, duration_seconds, sort_order, is_free_preview | 7 | |
| app_products | id(uuid), slug, name, price(numeric), price_cents(int), currency, status, kind, checkout_url, checkout_role, pagarme_item_code | 6 | **DRIFT** -- view ou tabela via Dashboard |
| offer_settings | id(uuid), offer_key, product_slug, is_enabled(bool), display_config(jsonb) | 4 | **DRIFT** |
| product_offers | id(uuid), product_id, offer_key, price_cents, anchor_price_cents, offer_headline, offer_subtext, badge, urgency_text, active(bool), is_default(bool) | 7 | **DRIFT** |
| product_kirvano_offers | id(uuid), product_id, kirvano_offer_id, label | 6 | |
| processed_events | sale_id(text), event_name, processed_at, emq_response(jsonb) | 0 | **DRIFT** |
| risk_events | id(uuid), created_at, source | 19 | **DRIFT** |
---

## Tabelas (checkout) -- 15 tabelas

| Tabela | Colunas-chave | Rows | Notas |
|--------|--------------|------|-------|
| orders | pagarme_order_id, transaction_id, lead_id, customer_*, product_slug, amount_cents, payment_method, installments, status, utm_*, fbclid/fbp/fbc, app_access_granted, capi_*, bump_slugs | 0 | Checkout Sacra -- sem pedidos |
| tracking_events | event_id, event_name, visitor_id, session_id, funnel_id, pixel_id, fbp, fbc, capi_status | 57 | |
| checkout_funnel_events | session_id, stage, payment_method | 25 | |
| checkout_webhook_logs | source, event_type, headers/body(jsonb), status, processing_ms, order_id | 33 | |
| offer_settings | offer_key, product_slug, is_enabled, display_config(jsonb) | 4 | Duplicada do public |
| abandoned_carts | email, name, phone, product_slug, amount_cents, status, recovered_order_id | 0 | |
| checkout_leads | first_name, email, phone, detected_gender, status, whatsapp_opted_in | 0 | |
| app_access_grants | order_id, customer_email, product_grant, status, attempts | 0 | |
| upsell_orders | parent_order_id, type, product_slug, amount_cents, pagarme_order_id, status | 0 | |
| whatsapp_messages | phone, template_name, direction, status, wa_message_id, lead_id | 0 | |
| whatsapp_templates | name, language, category, status, variables(jsonb), body_preview | 1 | |
| whatsapp_optout | phone(text PK), opted_out_at, reason | 0 | |
| jobs | job_type, payload(jsonb), status, attempts, max_attempts, error_message | 3 | |
| campaign_snapshots | campaign_id/name, adset_id/name, ad_id/name, date, spend_cents, impressions, clicks, roas | 0 | |
| checkout_config | key(text PK), value(jsonb), description, updated_by | 10 | |

---

## RPCs/Functions (public) -- 20 funcoes

| Funcao | Args | Seguranca |
|--------|------|-----------|
| persist_lead | p_name, p_archetype, p_desire, p_situation, p_risk_flag, p_scores(jsonb), p_utm_*, p_fbclid, p_gclid | SECURITY DEFINER, anon+auth OK |
| save_lead_contact | p_lead_id(uuid), p_email, p_whatsapp, p_consent_timestamp(timestamptz) | SECURITY DEFINER, anon+auth OK. **DRIFT** |
| save_lead_email | p_email, p_lead_id(uuid) | anon+auth OK |
| persist_quiz_responses | p_rows(jsonb) | SECURITY DEFINER, anon+auth OK |
| upsert_tracking_session | p_external_id, p_fbp, p_fbc, p_fbclid, p_client_ip, p_user_agent | SECURITY DEFINER, anon+auth OK |
| track_quiz_step | p_session_id, p_stage, p_question_key, p_version | SECURITY DEFINER, anon+auth OK. **DRIFT** |
| track_checkout_step | p_session_id, p_stage, p_method | SECURITY DEFINER, anon+auth OK. **DRIFT** |
| is_admin | _user_id(uuid) | anon DENIED, auth OK |
| has_entitlement | _product_id(uuid) | anon DENIED, auth OK |
| grant_entitlement_manual | _email, _product_id(uuid) | anon DENIED, auth OK |
| get_user_id_by_email | p_email | service_role only |
| analytics_funnel | p_days(int) | service_role only |
| analytics_quiz_funnel | p_days(int) | service_role only |
| analytics_checkout_funnel | p_days(int) | service_role only |
| analytics_full_funnel | p_days(int) | service_role only |
| analytics_top_segments | p_days(int), p_min_leads(int) | service_role only |
| analytics_revenue_breakdown | p_days(int) | service_role only |
| analytics_quiz_conversion | p_days(int) | service_role only |
| analytics_cohort_weekly | p_weeks(int) | service_role only |
| run_reconciliation | p_hours_back(int) | service_role only |

### RPCs (checkout schema) -- 3 funcoes

| Funcao | Notas |
|--------|-------|
| claim_pending_jobs | checkout schema |
| track_checkout_step | checkout schema version |
| check_card_velocity | checkout schema |