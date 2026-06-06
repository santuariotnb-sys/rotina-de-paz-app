-- ═══════════════════════════════════════════════════════════════════
-- FIX DE SEGURANÇA: get_user_id_by_email era enumerável por anon
-- ═══════════════════════════════════════════════════════════════════
-- A auditoria confirmou (probe com a ANON key real) que anon conseguia
-- chamar get_user_id_by_email(p_email) e receber o UUID de auth.users —
-- um oráculo de enumeração de contas/PII. A função é SECURITY DEFINER e
-- só é usada pelo webhook (service_role), então revogar de anon/authenticated
-- não quebra nenhum fluxo legítimo. Também fixamos o search_path (evita
-- hijack em SECURITY DEFINER).

ALTER FUNCTION public.get_user_id_by_email(text) SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION public.get_user_id_by_email(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_user_id_by_email(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_user_id_by_email(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_id_by_email(text) TO service_role;
