-- ============================================================================
-- V4-workspace-golive.sql — Go-live do workspace novo "Quiz Sacra v4"
-- ============================================================================
-- STATUS: RASCUNHO PARA APLICAÇÃO MANUAL. NÃO rodar via `supabase db push`.
-- Aplicar via Management API `/database/query` (token sbp_) na hora do
-- go-live, na ordem em que aparece neste arquivo (seções 0 → 1 → 2 → 3).
-- Fonte de verdade das migrations já aplicadas: `supabase/migrations/
-- 20260709_workspaces_multi_quiz*.sql` (colunas/RPCs confirmadas ali).
--
-- Contexto (ver docs/handoff/VERIFICACAO-ENCAIXES-ADMIN-V4.md no repo do quiz):
--   - Quiz v4 entra no link atual (/sacra/) como workspace NOVO, quiz_id
--     'sacra-v4', MESMO pixel (863734499693171) e MESMO external_id_prefix
--     ('qs_') do workspace antigo — decisão explícita, não é o "v4_" sugerido
--     na verificação original.
--   - Quiz antigo mantém quiz_id='sacra' (histórico intacto, mesma PK) e vai
--     pra /sacra-v2/ com nome "Quiz Sacra v2" (só nome + base_path mudam).
--   - Q1 do v4 usa question_key='peso' no lugar de 'situacao'. As demais 6
--     keys são idênticas nos dois workspaces (risco, sintoma, comportamento,
--     frase, espiritual, desejo).
-- ============================================================================


-- ============================================================================
-- SEÇÃO 0 — RODAR ANTES DO GO-LIVE (read-only, confirmar contra o banco vivo)
-- ============================================================================
-- Origem: §3 da verificação de encaixe. O CHECK real de `quiz_funnel_events`
-- não está em nenhuma migration deste repo (a tabela já existia quando a
-- migration 20260630 rodou `CREATE TABLE IF NOT EXISTS`, que é no-op e não
-- recria constraints). A migration `002_quiz_funnel_events.sql` do repo do
-- quiz (drift reconhecido) sugere um CHECK de só 6 valores, sem 'hero_intent'
-- nem 'contact_gate' — mas a RPC `track_quiz_step` aceita 8. Se a constraint
-- viva só aceitar 6, todo evento hero_intent/contact_gate falha silenciosamente
-- (best-effort, sem try/catch) e o KPI "Deram WhatsApp" do v4 nasce zerado.

-- 0.1) Definição exata da constraint hoje:
select con.conname, pg_get_constraintdef(con.oid)
from pg_constraint con
join pg_class rel on rel.oid = con.conrelid
join pg_namespace nsp on nsp.oid = rel.relnamespace
where rel.relname = 'quiz_funnel_events' and nsp.nspname = 'public' and con.contype = 'c';

-- 0.2) Confirma se hero_intent/contact_gate já conseguiram gravar alguma vez:
select stage, count(*) from public.quiz_funnel_events group by stage order by 2 desc;

-- Se a 0.1 mostrar só 6 valores (sem hero_intent/contact_gate) e a 0.2
-- confirmar 0 ocorrências dessas 2 stages, aplicar (fora deste arquivo, com
-- cuidado, contra produção — aditivo, não reescreve dados existentes):
--   ALTER TABLE public.quiz_funnel_events DROP CONSTRAINT <nome_encontrado_em_0.1>;
--   ALTER TABLE public.quiz_funnel_events ADD CONSTRAINT quiz_funnel_events_stage_check
--     CHECK (stage IN ('arrival','hero_intent','question','contact','contact_gate','result','offer','cta'));


begin;

-- ============================================================================
-- SEÇÃO 1 — Catálogo de quizzes (tabela public.quizzes)
-- Colunas confirmadas em supabase/migrations/20260709_workspaces_multi_quiz.sql:14-24:
--   id text PK · nome text NOT NULL · workspace text NOT NULL DEFAULT 'sacra'
--   pixel_id text · external_id_prefix text NOT NULL DEFAULT 'qs_' · base_path text
--   status text NOT NULL DEFAULT 'active' CHECK IN ('active','paused','archived')
--   created_at timestamptz
-- ============================================================================

-- 1.a) Workspace novo do v4. `on conflict do nothing` = idempotente, seguro
--      rodar de novo sem duplicar/sobrescrever se já existir.
insert into public.quizzes (id, nome, pixel_id, external_id_prefix, base_path)
values ('sacra-v4', 'Quiz Sacra v4', '863734499693171', 'qs_', '/sacra/')
on conflict (id) do nothing;

-- 1.b) Renomeia o workspace antigo (histórico) e move o base_path pro novo
--      endereço /sacra-v2/. NÃO mexe no `id` ('sacra' continua a PK — leads/
--      eventos/respostas já gravados apontam pra cá via FK, nada precisa
--      backfill).
update public.quizzes
set nome = 'Quiz Sacra v2',
    base_path = '/sacra-v2/'
where id = 'sacra';


-- ============================================================================
-- SEÇÃO 2 — RPCs: corrige CASE sem ELSE + adiciona `peso`
-- Corpo copiado de supabase/migrations/20260709_workspaces_multi_quiz_analytics.sql
-- (linhas 96-176 e 236-323), alterando SÓ o necessário. Mesma assinatura
-- (p_days, p_quiz_id) → CREATE OR REPLACE é seguro aqui (não precisa DROP,
-- os grants da migration original continuam valendo pra mesma assinatura).
-- Comportamento do workspace 'sacra' (situacao) fica 100% preservado.
-- ============================================================================

-- 2.a) analytics_quiz_funnel ---------------------------------------------------
-- Bug original: CASE sem ELSE → question_key='peso' cai em label=NULL,
-- sort_order=NULL; o `lag() over (order by sort_order)` (NULLS LAST) empurra
-- essa linha pro fim e quebra o drop_pct de todo o funil filtrado por
-- p_quiz_id='sacra-v4'.
-- Fix: `peso` entra no MESMO sort_order que `situacao` ocupava (2 — logo após
-- 'arrival'=1), já que as duas são a mesma posição Q1 em quizzes diferentes e
-- nunca coexistem com dados reais dentro do mesmo p_quiz_id. Acrescenta ELSE
-- genérico (label = question_key, sort_order alto = 100) pra nenhuma key
-- futura sumir do funil, mesmo sem CASE dedicado.
create or replace function public.analytics_quiz_funnel(p_days integer default 30, p_quiz_id text default null)
 returns table(stage text, label text, reached bigint, drop_pct numeric)
 language sql stable security definer set search_path to 'public'
as $function$
  with cutoff(ts) as (
    select case when p_days = 0
      then (date_trunc('day', now() at time zone 'America/Sao_Paulo')) at time zone 'America/Sao_Paulo'
      else now() - make_interval(days => p_days)
    end
  ),
  raw_funnel as (
    select 'arrival' as stage, 'Chegaram' as label, 1 as sort_order,
      count(distinct session_id) as reached
    from quiz_funnel_events e
    where e.stage = 'arrival' and e.is_test = false and e.created_at >= (select ts from cutoff)
      and (p_quiz_id is null or e.quiz_id = p_quiz_id)

    union all
    select 'q_' || e.question_key,
      case e.question_key
        when 'situacao' then 'Q1 · Situação' when 'peso' then 'Q1 · O peso invisível'
        when 'risco' then 'Q2 · Risco'
        when 'sintoma' then 'Q3 · Sintoma' when 'comportamento' then 'Q4 · Comportamento'
        when 'frase' then 'Q5 · Frase' when 'espiritual' then 'Q6 · Espiritual'
        when 'desejo' then 'Q7 · Desejo'
        else initcap(e.question_key)
      end,
      case e.question_key
        when 'situacao' then 2 when 'peso' then 2 when 'risco' then 3 when 'sintoma' then 4
        when 'comportamento' then 5 when 'frase' then 6
        when 'espiritual' then 7 when 'desejo' then 8
        else 100
      end,
      count(distinct session_id)
    from quiz_funnel_events e
    where e.stage = 'question' and e.question_key is not null
      and e.is_test = false and e.created_at >= (select ts from cutoff)
      and (p_quiz_id is null or e.quiz_id = p_quiz_id)
    group by e.question_key

    union all
    select 'contact_gate', 'WhatsApp capturado', 9,
      count(distinct session_id)
    from quiz_funnel_events e
    where e.stage in ('contact', 'contact_gate') and e.is_test = false and e.created_at >= (select ts from cutoff)
      and (p_quiz_id is null or e.quiz_id = p_quiz_id)

    union all
    select 'result', 'Viu resultado', 10,
      count(distinct session_id)
    from quiz_funnel_events e
    where e.stage = 'result' and e.is_test = false and e.created_at >= (select ts from cutoff)
      and (p_quiz_id is null or e.quiz_id = p_quiz_id)

    union all
    select 'offer', 'Viu oferta', 11,
      count(distinct session_id)
    from quiz_funnel_events e
    where e.stage = 'offer' and e.is_test = false and e.created_at >= (select ts from cutoff)
      and (p_quiz_id is null or e.quiz_id = p_quiz_id)

    union all
    select 'cta', 'Clicou comprar (IC)', 12,
      count(distinct session_id)
    from quiz_funnel_events e
    where e.stage = 'cta' and e.is_test = false and e.created_at >= (select ts from cutoff)
      and (p_quiz_id is null or e.quiz_id = p_quiz_id)
  ),
  ordered as (
    select *, lag(reached) over (order by sort_order) as prev_reached
    from raw_funnel
  )
  select o.stage, o.label, o.reached,
    case
      when o.prev_reached is null or o.prev_reached = 0 then 0
      else round((1 - o.reached::numeric / o.prev_reached) * 100, 1)
    end as drop_pct
  from ordered o
  order by o.sort_order;
$function$;
-- Sem DROP → grants da migration original (service_role only) continuam valendo.

-- 2.b) analytics_full_funnel ---------------------------------------------------
-- Bug original: `q_q1` hardcoded pra `e.question_key = 'situacao'` → pra
-- p_quiz_id='sacra-v4' essa contagem SEMPRE retorna 0 (nenhum evento do v4
-- tem key 'situacao'), mesmo com tráfego real chegando no Q1.
-- Fix mais simples e correto (lido no SQL real): trocar `= 'situacao'` por
-- `in ('situacao', 'peso')`. Como as 2 keys nunca coexistem dentro do mesmo
-- quiz_id, isso funciona igual a um COALESCE por quiz sem precisar de CASE
-- p_quiz_id nem tabela de metadados nova — e quando p_quiz_id IS NULL ("Todos
-- os quizzes") soma as sessões dos dois workspaces na mesma etapa "Quiz · Q1",
-- que é o comportamento desejado pra visão agregada.
create or replace function public.analytics_full_funnel(p_days integer default 30, p_quiz_id text default null)
 returns table(stage text, label text, reached bigint, drop_pct numeric)
 language sql stable security definer set search_path to 'public', 'checkout'
as $function$
  with cutoff(ts) as (
    select case when p_days = 0
      then (date_trunc('day', now() at time zone 'America/Sao_Paulo')) at time zone 'America/Sao_Paulo'
      else now() - make_interval(days => p_days)
    end
  ),
  quiz_counts as (
    select 'q_arrival' as stage, 'Quiz · Chegaram' as label, 1 as sort_order,
      count(distinct session_id) as reached
    from quiz_funnel_events e
    where e.stage = 'arrival' and e.is_test = false and e.created_at >= (select ts from cutoff)
      and (p_quiz_id is null or e.quiz_id = p_quiz_id)

    union all
    select 'q_q1', 'Quiz · Q1', 2, count(distinct session_id)
    from quiz_funnel_events e
    where e.stage = 'question' and e.question_key in ('situacao', 'peso')
      and e.is_test = false and e.created_at >= (select ts from cutoff)
      and (p_quiz_id is null or e.quiz_id = p_quiz_id)

    union all
    select 'q_q7', 'Quiz · Q7', 3, count(distinct session_id)
    from quiz_funnel_events e
    where e.stage = 'question' and e.question_key = 'desejo'
      and e.is_test = false and e.created_at >= (select ts from cutoff)
      and (p_quiz_id is null or e.quiz_id = p_quiz_id)

    union all
    select 'q_contact', 'Quiz · WhatsApp', 4, count(distinct session_id)
    from quiz_funnel_events e
    where e.stage in ('contact', 'contact_gate')
      and e.is_test = false and e.created_at >= (select ts from cutoff)
      and (p_quiz_id is null or e.quiz_id = p_quiz_id)

    union all
    select 'q_cta', 'Quiz · CTA', 5, count(distinct session_id)
    from quiz_funnel_events e
    where e.stage = 'cta' and e.is_test = false and e.created_at >= (select ts from cutoff)
      and (p_quiz_id is null or e.quiz_id = p_quiz_id)
  ),
  checkout_counts as (
    -- checkout_funnel_events NÃO tem quiz_id nem is_test → ramo global (v1),
    -- inalterado.
    select 'c_view' as stage, 'Checkout · Chegaram' as label, 6 as sort_order,
      count(distinct e.session_id) as reached
    from checkout.checkout_funnel_events e
    where e.stage = 'view' and e.created_at >= (select ts from cutoff)

    union all
    select 'c_identity', 'Checkout · Dados', 7, count(distinct e.session_id)
    from checkout.checkout_funnel_events e
    where e.stage = 'identity' and e.created_at >= (select ts from cutoff)

    union all
    select 'c_submit', 'Checkout · Pagar', 8, count(distinct e.session_id)
    from checkout.checkout_funnel_events e
    where e.stage = 'submit' and e.created_at >= (select ts from cutoff)

    union all
    select 'c_purchase', 'Checkout · Compra', 9, count(distinct e.session_id)
    from checkout.checkout_funnel_events e
    where e.stage = 'purchase' and e.created_at >= (select ts from cutoff)
  ),
  combined as (
    select * from quiz_counts
    union all
    select * from checkout_counts
  ),
  ordered as (
    select *, lag(reached) over (order by sort_order) as prev_reached
    from combined
  )
  select o.stage, o.label, o.reached,
    case
      when o.prev_reached is null or o.prev_reached = 0 then 0
      else round((1 - o.reached::numeric / o.prev_reached) * 100, 1)
    end as drop_pct
  from ordered o
  order by o.sort_order;
$function$;
-- Sem DROP → grants da migration original (service_role only) continuam valendo.

commit;

-- ============================================================================
-- SEÇÃO 3 — Validação pós-aplicação (rodar manualmente, fora da transação)
-- ============================================================================
--   select id, nome, pixel_id, external_id_prefix, base_path from public.quizzes order by id;
--     esperado: 'sacra' → 'Quiz Sacra v2' / '/sacra-v2/' ; 'sacra-v4' → 'Quiz Sacra v4' / '/sacra/'
--   select * from public.analytics_quiz_funnel(30, 'sacra-v4');   -- Q1 deve aparecer com label 'Q1 · O peso invisível'
--   select * from public.analytics_quiz_funnel(30, 'sacra');      -- Q1 deve continuar 'Q1 · Situação', sem regressão
--   select * from public.analytics_full_funnel(30, 'sacra-v4');   -- 'Quiz · Q1' deve refletir tráfego real do v4
-- ============================================================================
