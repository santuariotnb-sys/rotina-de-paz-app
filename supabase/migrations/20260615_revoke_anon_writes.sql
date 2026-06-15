-- =============================================================================
-- MIGRATION: Revoke dangerous WRITE grants from anon/public/authenticated
-- Date: 2026-06-15
-- Reason: anon has TRUNCATE on all 24 tables — TRUNCATE bypasses RLS entirely.
--         Proven with live test: RLS ON + TRUNCATE = data wiped.
--         All legitimate writes go through SECURITY DEFINER RPCs (persist_lead,
--         track_quiz_step, upsert_tracking_session, etc.) or service_role
--         (webhook handler). Direct table WRITE grants are unnecessary leftovers.
--
-- WHAT THIS DOES:
--   1. Revokes INSERT, UPDATE, DELETE, TRUNCATE from public, anon, authenticated
--      on ALL 24 public tables.
--   2. Re-grants SELECT to authenticated on tables the app reads directly.
--   3. Re-grants SELECT to anon on tables the Quiz-sacra reads directly
--      (products, product_offers — needed for price display).
--   4. Does NOT touch EXECUTE grants on functions (RPCs stay as-is).
--
-- WHAT THIS DOES NOT DO:
--   - Does NOT revoke SELECT (audited: Quiz-sacra reads products/product_offers
--     with anon key — revoking SELECT would break the quiz).
--   - Does NOT affect service_role (always has full access).
--   - Does NOT affect SECURITY DEFINER RPCs (they run as owner, not as caller).
-- =============================================================================

-- §1 — REVOKE all writes from public role (anon inherits from public)
REVOKE INSERT, UPDATE, DELETE, TRUNCATE
  ON ALL TABLES IN SCHEMA public
  FROM public;

-- §2 — REVOKE all writes from anon explicitly (belt + suspenders)
REVOKE INSERT, UPDATE, DELETE, TRUNCATE
  ON ALL TABLES IN SCHEMA public
  FROM anon;

-- §3 — REVOKE all writes from authenticated
--       (authenticated writes are also via RPCs or service_role webhook)
REVOKE INSERT, UPDATE, DELETE, TRUNCATE
  ON ALL TABLES IN SCHEMA public
  FROM authenticated;

-- §4 — Re-grant SELECT to authenticated (app reads these tables directly)
GRANT SELECT ON
  products, product_offers, profiles, entitlements, purchases,
  audio_tracks, courses, course_lessons, ebooks, louvores,
  leads, quiz_responses, webhook_logs, admin_users, admin_audit_logs,
  support_tickets, support_messages, legal_acceptances, product_kirvano_offers,
  quiz_funnel_events, tracking_sessions, reconciliation_reports,
  processed_events, risk_events
TO authenticated;

-- §5 — Re-grant INSERT/UPDATE on profiles for authenticated
--       (users can create/update their own profile — RLS enforces ownership)
GRANT INSERT, UPDATE ON profiles TO authenticated;

-- §6 — Re-grant INSERT on support tables for authenticated
--       (users create their own tickets/messages — RLS enforces ownership)
GRANT INSERT ON support_tickets TO authenticated;
GRANT INSERT ON support_messages TO authenticated;

-- §7 — Re-grant UPDATE on support_tickets for authenticated
--       (users can update status of own tickets — RLS enforces)
GRANT UPDATE ON support_tickets TO authenticated;

-- §8 — Re-grant INSERT/UPDATE/DELETE on admin-managed tables for authenticated
--       (admin writes are gated by is_admin() in RLS policies)
GRANT INSERT, UPDATE, DELETE ON products TO authenticated;
GRANT INSERT, UPDATE, DELETE ON product_offers TO authenticated;
GRANT INSERT, UPDATE, DELETE ON product_kirvano_offers TO authenticated;
GRANT INSERT, UPDATE, DELETE ON audio_tracks TO authenticated;
GRANT INSERT, UPDATE, DELETE ON courses TO authenticated;
GRANT INSERT, UPDATE, DELETE ON course_lessons TO authenticated;
GRANT INSERT, UPDATE, DELETE ON ebooks TO authenticated;
GRANT INSERT, UPDATE, DELETE ON louvores TO authenticated;
GRANT INSERT, UPDATE, DELETE ON entitlements TO authenticated;
GRANT INSERT, UPDATE, DELETE ON admin_users TO authenticated;
GRANT INSERT ON admin_audit_logs TO authenticated;
GRANT UPDATE ON webhook_logs TO authenticated;
GRANT INSERT ON legal_acceptances TO authenticated;

-- §9 — Re-grant SELECT to anon ONLY where Quiz-sacra reads directly
--       (verified: prices.ts reads products + product_offers with anon key)
GRANT SELECT ON products TO anon;
GRANT SELECT ON product_offers TO anon;

-- §10 — Ensure anon can still INSERT on quiz_responses (RLS policy allows it)
--        Actually NO — anon inserts via persist_quiz_responses RPC (SECURITY DEFINER).
--        Direct INSERT grant is NOT needed. RPC handles it.

-- §11 — Verify: anon should have ZERO write grants now, only SELECT on 2 tables.
--        authenticated should have scoped writes gated by RLS (is_admin or own data).
--        service_role is untouched (always full access).
