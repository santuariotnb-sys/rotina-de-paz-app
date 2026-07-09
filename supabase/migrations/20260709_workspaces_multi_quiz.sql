-- ============================================================================
-- Workspaces / multi-quiz — Fase 0 (aditivo, retrocompatível)
-- Design: docs/DESIGN-workspaces-multi-quiz.md (aprovado 2026-07-09)
-- Banco COMPARTILHADO (quiz + checkout + app). Tudo aqui é aditivo: colunas com
-- DEFAULT 'sacra' e catálogo novo. Checkout/app ignoram quiz_id — nada quebra.
-- Backfill dos leads/eventos/respostas existentes = automático via DEFAULT no
-- ADD COLUMN (Postgres 11+ não reescreve a tabela).
-- ============================================================================

begin;

-- 1) Catálogo de quizzes (1 workspace = 1 quiz). Pixel único compartilhado
--    (decisão do dono); external_id_prefix per-quiz p/ higiene de localStorage/join.
create table if not exists public.quizzes (
  id                 text primary key,               -- slug estável: 'sacra', 'quiz2'
  nome               text not null,
  workspace          text not null default 'sacra',  -- metadado p/ agrupamento futuro (=id por ora)
  pixel_id           text,                            -- Meta pixel (config, não hardcode)
  external_id_prefix text not null default 'qs_',
  base_path          text,                            -- '/sacra/quiz'
  status             text not null default 'active'
                       check (status in ('active','paused','archived')),
  created_at         timestamptz not null default now()
);

insert into public.quizzes (id, nome, pixel_id, external_id_prefix, base_path)
values ('sacra', 'Quiz Sacra', '863734499693171', 'qs_', '/sacra/quiz')
on conflict (id) do nothing;

-- RLS: leitura só p/ admin autenticado; escrita só service_role (via supabaseAdmin).
alter table public.quizzes enable row level security;

drop policy if exists quizzes_select_authenticated on public.quizzes;
create policy quizzes_select_authenticated
  on public.quizzes for select
  to authenticated
  using (true);

-- anon NÃO lê o catálogo (frontend resolve quiz_id via env de build, não via DB).
revoke all on public.quizzes from public, anon;
grant select on public.quizzes to authenticated;
grant all on public.quizzes to service_role;

-- 2) Coluna quiz_id nas 3 tabelas de dados. NOT NULL DEFAULT 'sacra' =
--    backfill implícito das linhas existentes + retrocompat p/ inserts atuais.
alter table public.leads
  add column if not exists quiz_id text not null default 'sacra'
    references public.quizzes(id);

alter table public.quiz_funnel_events
  add column if not exists quiz_id text not null default 'sacra'
    references public.quizzes(id);

alter table public.quiz_responses
  add column if not exists quiz_id text not null default 'sacra'
    references public.quizzes(id);

-- purchases: SEM coluna nova. quiz_id da venda deriva do lead por external_id (src)
-- nas RPCs de analytics (Fase 2) — evita coluna redundante e vendas órfãs de lead.

create index if not exists idx_leads_quiz_id on public.leads (quiz_id);
create index if not exists idx_qfe_quiz_id_created on public.quiz_funnel_events (quiz_id, created_at);
create index if not exists idx_quiz_responses_quiz_id on public.quiz_responses (quiz_id);

-- 3) leads_reais expõe quiz_id (append no fim — preserva a projeção PII-safe da
--    migration 20260629_fix_pii_leak_views.sql; CREATE OR REPLACE mantém grants).
--    vendas_reais NÃO muda nesta fase (quiz_id via join na Fase 2).
create or replace view public.leads_reais as
  select
    id, created_at, name, email, archetype, scores, desire, situation, risk_flag,
    utm_source, utm_medium, utm_campaign, utm_content, utm_term, updated_at,
    fbclid, gclid, whatsapp, consent_timestamp, is_test, external_id,
    quiz_id
  from leads
  where is_test = false
    and created_at >= ((select checkout_config.value::timestamptz
                        from checkout_config
                        where checkout_config.key = 'production_start_at'));

commit;

-- Validação pós-migração (rodar manualmente contra o banco vivo):
--   select count(*) from leads              where quiz_id = 'sacra';  -- esperado 152
--   select count(*) from quiz_funnel_events where quiz_id = 'sacra';  -- esperado 3420
--   select count(*) from quiz_responses     where quiz_id = 'sacra';  -- esperado 1057
--   select count(*) from leads_reais        where quiz_id is null;    -- esperado 0
-- Rollback (se ninguém depender ainda):
--   drop view ...; alter table ... drop column quiz_id; drop table public.quizzes;
