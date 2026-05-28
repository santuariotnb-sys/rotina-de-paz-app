
REVOKE EXECUTE ON FUNCTION public.is_admin(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_admin(UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_admin(UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin(UUID) TO service_role;
-- RLS policies that reference is_admin() bypass EXECUTE checks because
-- policies run with the table-owner role; revoking authenticated EXECUTE
-- prevents direct RPC calls without breaking RLS.
