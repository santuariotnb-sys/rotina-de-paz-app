-- ============================================================================
-- Workspaces / multi-quiz — Fase 0 (parte 2): p_quiz_id nas 3 RPCs de escrita
-- Design: docs/DESIGN-workspaces-multi-quiz.md
-- Param novo é trailing com DEFAULT 'sacra' → chamadas atuais (sem p_quiz_id)
-- continuam gravando 'sacra'. Retrocompatível 100%.
-- DROP + CREATE (não CREATE OR REPLACE): adicionar param muda a assinatura e
-- CREATE OR REPLACE criaria um OVERLOAD → PostgREST erra por ambiguidade de
-- args nomeados. Por isso dropamos a assinatura antiga e re-concedemos os grants
-- exatos capturados do banco vivo (persist_lead/track_quiz_step tinham PUBLIC;
-- persist_quiz_responses NÃO tinha — mantido).
-- ============================================================================

begin;

-- 1) persist_lead ------------------------------------------------------------
drop function if exists public.persist_lead(
  text, text, jsonb, text, text, boolean, text, text, text, text, text, text, text, text);

create or replace function public.persist_lead(
  p_name text default null, p_archetype text default null, p_scores jsonb default null,
  p_desire text default null, p_situation text default null, p_risk_flag boolean default false,
  p_utm_source text default null, p_utm_medium text default null, p_utm_campaign text default null,
  p_utm_content text default null, p_utm_term text default null, p_fbclid text default null,
  p_gclid text default null, p_external_id text default null, p_quiz_id text default 'sacra'
)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_id uuid;
begin
  insert into leads (
    name, archetype, scores, desire, situation, risk_flag,
    utm_source, utm_medium, utm_campaign, utm_content, utm_term,
    fbclid, gclid, external_id, quiz_id
  ) values (
    p_name, p_archetype, p_scores, p_desire, p_situation, p_risk_flag,
    p_utm_source, p_utm_medium, p_utm_campaign, p_utm_content, p_utm_term,
    p_fbclid, p_gclid, p_external_id, coalesce(p_quiz_id, 'sacra')
  )
  returning id into v_id;
  return v_id;
end;
$function$;

grant execute on function public.persist_lead(
  text, text, jsonb, text, text, boolean, text, text, text, text, text, text, text, text, text)
  to public, anon, authenticated, service_role;

-- 2) track_quiz_step ---------------------------------------------------------
-- (search_path = 'public' apenas, como no original; lista de stages inalterada —
--  bug contact_gate é dívida ortogonal, NÃO corrigir aqui)
drop function if exists public.track_quiz_step(text, text, text, text);

create or replace function public.track_quiz_step(
  p_session_id text, p_stage text, p_question_key text default null,
  p_version text default null, p_quiz_id text default 'sacra'
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if p_session_id is null or length(p_session_id) > 100 then return; end if;
  if p_stage not in ('arrival', 'hero_intent', 'question', 'contact', 'contact_gate', 'result', 'offer', 'cta') then return; end if;
  if p_question_key is not null and length(p_question_key) > 50 then return; end if;
  if p_version is not null and length(p_version) > 30 then return; end if;

  if (select count(*) from quiz_funnel_events where session_id = p_session_id) >= 200 then return; end if;

  insert into quiz_funnel_events (session_id, stage, question_key, quiz_version, quiz_id)
  values (p_session_id, p_stage, p_question_key, p_version, coalesce(p_quiz_id, 'sacra'));
end;
$function$;

grant execute on function public.track_quiz_step(text, text, text, text, text)
  to public, anon, authenticated, service_role;

-- 3) persist_quiz_responses --------------------------------------------------
-- (NÃO tinha grant a public no banco vivo → revoke explícito após create p/ manter)
drop function if exists public.persist_quiz_responses(jsonb);

create or replace function public.persist_quiz_responses(
  p_rows jsonb, p_quiz_id text default 'sacra'
)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  insert into quiz_responses (lead_id, question_key, answer_value, answer_text, time_to_answer, quiz_id)
  select
    (r->>'lead_id')::uuid,
    r->>'question_key',
    r->>'answer_value',
    r->>'answer_text',
    (r->>'time_to_answer')::int,
    coalesce(p_quiz_id, 'sacra')
  from jsonb_array_elements(p_rows) as r;
end;
$function$;

revoke execute on function public.persist_quiz_responses(jsonb, text) from public;
grant execute on function public.persist_quiz_responses(jsonb, text)
  to anon, authenticated, service_role;

commit;
