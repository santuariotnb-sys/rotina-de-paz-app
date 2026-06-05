-- Migration: Estado final RLS pós-hardening (idempotente)
-- Quiz usa RPCs SECURITY DEFINER — anon NÃO precisa de acesso direto a tabelas.

-- ═══ leads: apenas admin lê/escreve; anon grava via RPC persist_lead/save_lead_email ═══
DROP POLICY IF EXISTS "anon insert leads" ON public.leads;
DROP POLICY IF EXISTS "auth insert leads" ON public.leads;
DROP POLICY IF EXISTS "public update own lead email" ON public.leads;
DROP POLICY IF EXISTS "temp_anon_update_leads" ON public.leads;
DROP POLICY IF EXISTS "temp_anon_select_leads_for_returning" ON public.leads;
DROP POLICY IF EXISTS "anon_select_leads_30s_window" ON public.leads;
DROP POLICY IF EXISTS "anon_select_leads_id" ON public.leads;
-- Manter: admins read leads, admins update leads, admins delete leads

-- ═══ quiz_responses: apenas admin lê; anon grava via RPC persist_quiz_responses ═══
DROP POLICY IF EXISTS "anon_insert_quiz_responses" ON public.quiz_responses;
-- Manter: admins read quiz_responses

-- ═══ tracking_sessions: service_role gerencia; anon grava via RPC upsert_tracking_session ═══
DROP POLICY IF EXISTS "anon_insert_tracking_sessions" ON public.tracking_sessions;
DROP POLICY IF EXISTS "temp_anon_update_tracking_sessions" ON public.tracking_sessions;
DROP POLICY IF EXISTS "anon_update_tracking_sessions" ON public.tracking_sessions;
DROP POLICY IF EXISTS "anon_select_tracking_for_upsert" ON public.tracking_sessions;
DROP POLICY IF EXISTS "anon_select_tracking_30s_window" ON public.tracking_sessions;
-- Manter: service_role_all_tracking_sessions
