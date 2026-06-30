-- =============================================================================
-- MIGRATION: Revoga GRANTs residuais em tracking_sessions / quiz_funnel_events
-- Date: 2026-06-30
-- Sprint 0 — Bug #4 (vazamento RLS residual de tracking)
--
-- CAUSA RAIZ (verificada ao vivo no prod via Management API):
--   Ambas as tabelas têm RLS ON, mas carregam GRANT SELECT, REFERENCES, TRIGGER
--   para `anon` e `authenticated`:
--     - tracking_sessions: RLS ON, 1 policy (service_role_all, qual=true)
--     - quiz_funnel_events: RLS ON, 0 policies
--   Origem dos grants:
--     1. `authenticated`: GRANT SELECT explícito em 20260615_revoke_anon_writes §4
--        (re-grant em bloco — porém o app NUNCA lê estas tabelas como authenticated;
--         a única leitura é via supabaseAdmin/service_role em meta-capi.server.ts,
--         que bypassa RLS e grants). Grant não utilizado.
--     2. `anon`: SELECT veio dos DEFAULT PRIVILEGES do Supabase (mesmo vetor do
--        vazamento de PII corrigido em 20260629). Nunca foi intencional.
--
-- RISCO ATUAL: hoje o vazamento está MITIGADO pela RLS (anon/auth sem policy
--   permissiva → 0 linhas). Mas o GRANT SELECT residual é um footgun: qualquer
--   policy permissiva futura, ou um DISABLE ROW LEVEL SECURITY acidental,
--   exporia TODO o tracking de TODOS os usuários a qualquer logado/anon.
--
-- FIX: revogar SELECT, REFERENCES, TRIGGER de anon e authenticated em ambas.
--   Escrita continua via RPC upsert_tracking_session (SECURITY DEFINER / service_role).
--   Leitura admin continua via supabaseAdmin (service_role) — intocado.
--
-- VERIFICAÇÃO PÓS-APPLY: information_schema.role_table_grants para anon/authenticated
--   nestas duas tabelas → 0 linhas. Smoke-test do Quiz: escrita via RPC segue OK.
-- ROLLBACK: GRANT SELECT ON public.tracking_sessions, public.quiz_funnel_events
--           TO authenticated;  (NÃO re-grantar anon — nunca foi intencional)
-- =============================================================================

REVOKE SELECT, REFERENCES, TRIGGER
  ON public.tracking_sessions, public.quiz_funnel_events
  FROM anon, authenticated;
