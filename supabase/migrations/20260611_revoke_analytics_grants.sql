-- Revoke GRANT EXECUTE FROM authenticated on 5 analytics RPCs
-- These RPCs expose leads, revenue, conversion data to ANY logged-in member.
-- Access is now restricted to service_role (called via server functions only).
-- SCOPE: ONLY the 5 analytics RPCs. DO NOT touch is_admin, has_entitlement, grant_entitlement_manual.

-- Must revoke from public + anon + authenticated (PostgreSQL grants EXECUTE to public by default)
REVOKE EXECUTE ON FUNCTION public.analytics_top_segments(integer, integer) FROM public, authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.analytics_funnel(integer) FROM public, authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.analytics_revenue_breakdown(integer) FROM public, authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.analytics_quiz_conversion(integer) FROM public, authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.analytics_cohort_weekly(integer) FROM public, authenticated, anon;

-- Ensure service_role still has access
GRANT EXECUTE ON FUNCTION public.analytics_top_segments(integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.analytics_funnel(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.analytics_revenue_breakdown(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.analytics_quiz_conversion(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.analytics_cohort_weekly(integer) TO service_role;

-- ROLLBACK:
-- GRANT EXECUTE ON FUNCTION public.analytics_top_segments(integer, integer) TO authenticated;
-- GRANT EXECUTE ON FUNCTION public.analytics_funnel(integer) TO authenticated;
-- GRANT EXECUTE ON FUNCTION public.analytics_revenue_breakdown(integer) TO authenticated;
-- GRANT EXECUTE ON FUNCTION public.analytics_quiz_conversion(integer) TO authenticated;
-- GRANT EXECUTE ON FUNCTION public.analytics_cohort_weekly(integer) TO authenticated;
