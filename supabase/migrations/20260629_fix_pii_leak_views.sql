-- =============================================================================
-- MIGRATION: Fecha vazamento de PII nas views leads_reais / vendas_reais
-- Date: 2026-06-29
-- Severidade: P0 (LGPD). Prova ao vivo (anon key, sem JWT de admin):
--   - leads_reais  → 130 linhas com email/nome/whatsapp
--   - vendas_reais →  17 linhas com buyer_email
--
-- CAUSA RAIZ (dois vetores no mesmo ponto):
--   1. As views nasceram em 20260616 e pegaram SELECT para `anon` via DEFAULT
--      PRIVILEGES do Supabase (auto-grant em todo objeto novo). A migration
--      20260616 só concedeu explicitamente a `authenticated`, mas o default deu a anon.
--   2. Views são SECURITY DEFINER por padrão (owner = postgres) → bypassam o RLS
--      das tabelas-base (leads/purchases, que exigem is_admin(auth.uid())).
--      Resultado: qualquer `anon` E qualquer `authenticated` (cliente comum logado)
--      lia TODOS os leads/vendas.
--
-- FIX:
--   - REVOKE SELECT de anon (remove o grant indevido).
--   - security_invoker = on → a view passa a aplicar o RLS da tabela-base no
--     contexto do CHAMADOR. Só quem é is_admin() lê. anon e authenticated-comum → 0.
--   - `authenticated` mantém o GRANT SELECT (de 20260616); o admin passa pelo RLS
--     is_admin() das bases (leads/purchases têm GRANT SELECT a authenticated em
--     20260615 §4 + policy "admins read"). Leituras server-side usam supabaseAdmin
--     (service_role) e bypassam RLS → analytics/CAPI/receita_real intactos.
--
-- VERIFICAÇÃO PÓS-APPLY: rodar de novo o teste anon → leads_reais/vendas_reais = 0 rows.
-- ROLLBACK: ALTER VIEW ... SET (security_invoker = off); GRANT SELECT ... TO anon;
-- =============================================================================

REVOKE SELECT ON public.leads_reais  FROM anon;
REVOKE SELECT ON public.vendas_reais FROM anon;

ALTER VIEW public.leads_reais  SET (security_invoker = on);
ALTER VIEW public.vendas_reais SET (security_invoker = on);
