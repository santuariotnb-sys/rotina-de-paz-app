-- ═══════════════════════════════════════════════════════════════
-- FASE 1B Pré-canário: sweep SECURITY DEFINER — fechar PUBLIC
--
-- PostgreSQL concede EXECUTE ao pseudo-role PUBLIC por default.
-- Em functions SECURITY DEFINER, PUBLIC vaza poder de postgres.
-- Beacons (anon intencional) mantêm anon explícito, só PUBLIC removido.
--
-- ROLLBACK: GRANT EXECUTE ... TO PUBLIC nos mesmos OIDs.
-- ═══════════════════════════════════════════════════════════════

-- CRITICAL: funções sensíveis que tinham PUBLIC
REVOKE EXECUTE ON FUNCTION checkout.check_card_velocity FROM public;
REVOKE EXECUTE ON FUNCTION checkout.claim_pending_jobs FROM public;
REVOKE EXECUTE ON FUNCTION public.get_user_id_by_email FROM public;

-- CLEANUP: beacons e tracking já têm anon — PUBLIC redundante
REVOKE EXECUTE ON FUNCTION public.track_quiz_step FROM public;
REVOKE EXECUTE ON FUNCTION public.persist_lead FROM public;
REVOKE EXECUTE ON FUNCTION public.save_lead_contact FROM public;
