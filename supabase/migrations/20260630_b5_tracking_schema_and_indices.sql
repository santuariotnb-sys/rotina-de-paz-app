-- Frente B — B5: versionar schema das tabelas de tracking (untracked) + índices p/ JOIN da Frente D.
-- TUDO idempotente e NÃO-destrutivo: nas tabelas que já existem no prod, os CREATE ... IF NOT EXISTS
-- são no-op (apenas documentam o schema vivo capturado via information_schema em 2026-06-30).
-- Índices aceleram a atribuição lead→venda por external_id/src (espinha de identidade da Frente B).

-- tracking_sessions: sessão de beacon (grava fbp/fbc/ip/ua por external_id). Hoje client_ip é null
-- (gravado client-side) — B2 fará a captura server-side via edge function.
CREATE TABLE IF NOT EXISTS public.tracking_sessions (
  external_id text NOT NULL PRIMARY KEY,
  fbp         text,
  fbc         text,
  fbclid      text,
  client_ip   text,
  user_agent  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- quiz_funnel_events: eventos do funil do quiz por etapa (já filtrado por is_test nos RPCs — Sprint 0 #3).
CREATE TABLE IF NOT EXISTS public.quiz_funnel_events (
  id           uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id   text NOT NULL,
  stage        text NOT NULL,
  question_key text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  quiz_version text,
  is_test      boolean NOT NULL DEFAULT false
);

-- Índices da espinha de identidade (atribuição lead→venda na Frente D).
CREATE INDEX IF NOT EXISTS idx_leads_external_id ON public.leads (external_id);
CREATE INDEX IF NOT EXISTS idx_purchases_src     ON public.purchases (src);
