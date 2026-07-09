-- ============================================================================
-- Workspaces / multi-quiz — Fase 2: p_quiz_id nas RPCs analytics_*
-- Design: docs/DESIGN-workspaces-multi-quiz.md §5
-- Param novo é trailing `p_quiz_id text default null`. null = comportamento
-- atual (retrocompat: admin sem seletor e chamadas antigas seguem iguais).
-- DROP + CREATE (não OR REPLACE): +param muda assinatura → OR REPLACE criaria
-- overload e PostgREST erra por ambiguidade de args nomeados. Re-concede os
-- grants EXATOS do banco vivo (nenhuma tinha public/anon → revoke public após
-- create p/ não vazar via default do Postgres).
--
-- Onde filtra de verdade: tabelas/views com quiz_id (leads_reais,
-- quiz_funnel_events, quiz_responses). Vendas (purchases/vendas_reais NÃO têm
-- quiz_id) são scopadas por src ∈ leads_reais(quiz_id). Checkout
-- (checkout_funnel_events) é superfície compartilhada (checkout único) → o
-- param é aceito p/ interface uniforme do admin mas NÃO filtra o ramo checkout.
-- ============================================================================

begin;

-- 1) analytics_funnel --------------------------------------------------------
drop function if exists public.analytics_funnel(integer);
create or replace function public.analytics_funnel(p_days integer default 30, p_quiz_id text default null)
 returns table(total_leads bigint, with_archetype bigint, with_whatsapp bigint, purchasers bigint, upsell_buyers bigint, downsell_buyers bigint, total_revenue numeric)
 language sql stable security definer set search_path to 'public'
as $function$
  with period_leads as (
    select * from leads_reais
    where created_at >= now() - (p_days || ' days')::interval
      and (p_quiz_id is null or quiz_id = p_quiz_id)
  ),
  period_purchases as (
    select * from vendas_reais
    where created_at >= now() - (p_days || ' days')::interval
      and (p_quiz_id is null or src in (select external_id from leads_reais where quiz_id = p_quiz_id))
  )
  select
    (select count(*) from period_leads)::bigint,
    (select count(*) from period_leads where archetype is not null)::bigint,
    (select count(*) from period_leads where whatsapp is not null)::bigint,
    (select count(distinct buyer_email) from period_purchases where product_type = 'principal')::bigint,
    (select count(distinct buyer_email) from period_purchases where product_type = 'upsell')::bigint,
    (select count(distinct buyer_email) from period_purchases where product_type = 'downsell')::bigint,
    (select coalesce(sum(gross_value), 0)::numeric / 100 from period_purchases);
$function$;
revoke execute on function public.analytics_funnel(integer, text) from public;
grant execute on function public.analytics_funnel(integer, text) to authenticated, service_role;

-- 2) analytics_cohort_weekly -------------------------------------------------
drop function if exists public.analytics_cohort_weekly(integer);
create or replace function public.analytics_cohort_weekly(p_weeks integer default 12, p_quiz_id text default null)
 returns table(cohort_week date, leads bigint, buyers bigint, revenue numeric, conv_pct numeric)
 language sql stable security definer set search_path to 'public'
as $function$
  select
    date_trunc('week', l.created_at)::date as cohort_week,
    count(distinct l.id)::bigint as leads,
    count(distinct p.src)::bigint as buyers,
    coalesce(sum(p.gross_value), 0)::numeric / 100 as revenue,
    round(count(distinct p.src)::numeric / nullif(count(distinct l.id), 0) * 100, 1) as conv_pct
  from leads_reais l
  left join vendas_reais p on l.external_id = p.src
  where l.created_at >= now() - (p_weeks || ' weeks')::interval
    and (p_quiz_id is null or l.quiz_id = p_quiz_id)
  group by cohort_week
  order by cohort_week desc;
$function$;
revoke execute on function public.analytics_cohort_weekly(integer, text) from public;
grant execute on function public.analytics_cohort_weekly(integer, text) to authenticated, service_role;

-- 3) analytics_quiz_conversion -----------------------------------------------
drop function if exists public.analytics_quiz_conversion(integer);
create or replace function public.analytics_quiz_conversion(p_days integer default 30, p_quiz_id text default null)
 returns table(question_key text, answer_value text, answer_text text, total bigint, converted bigint, conv_rate numeric)
 language sql stable security definer set search_path to 'public'
as $function$
  select
    qr.question_key, qr.answer_value, qr.answer_text,
    count(distinct l.id)::bigint as total,
    count(distinct l.id) filter (where p.src is not null)::bigint as converted,
    round(
      count(distinct l.id) filter (where p.src is not null)::numeric
      / nullif(count(distinct l.id), 0) * 100, 1
    ) as conv_rate
  from quiz_responses qr
  join leads_reais l on l.id = qr.lead_id
  left join vendas_reais p on l.external_id = p.src
  where l.created_at >= now() - (p_days || ' days')::interval
    and qr.question_key is not null
    and (p_quiz_id is null or l.quiz_id = p_quiz_id)
  group by qr.question_key, qr.answer_value, qr.answer_text
  order by qr.question_key, conv_rate desc;
$function$;
revoke execute on function public.analytics_quiz_conversion(integer, text) from public;
grant execute on function public.analytics_quiz_conversion(integer, text) to authenticated, service_role;

-- 4) analytics_quiz_funnel ---------------------------------------------------
drop function if exists public.analytics_quiz_funnel(integer);
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
        when 'situacao' then 'Q1 · Situação' when 'risco' then 'Q2 · Risco'
        when 'sintoma' then 'Q3 · Sintoma' when 'comportamento' then 'Q4 · Comportamento'
        when 'frase' then 'Q5 · Frase' when 'espiritual' then 'Q6 · Espiritual'
        when 'desejo' then 'Q7 · Desejo'
      end,
      case e.question_key
        when 'situacao' then 2 when 'risco' then 3 when 'sintoma' then 4
        when 'comportamento' then 5 when 'frase' then 6
        when 'espiritual' then 7 when 'desejo' then 8
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
revoke execute on function public.analytics_quiz_funnel(integer, text) from public;
grant execute on function public.analytics_quiz_funnel(integer, text) to service_role;

-- 5) analytics_revenue_breakdown ---------------------------------------------
drop function if exists public.analytics_revenue_breakdown(integer);
create or replace function public.analytics_revenue_breakdown(p_days integer default 30, p_quiz_id text default null)
 returns table(product_name text, product_type text, sales bigint, revenue numeric, refunds bigint)
 language sql stable security definer set search_path to 'public'
as $function$
  select
    product_name, product_type,
    count(*) filter (where status = 'confirmed')::bigint as sales,
    coalesce(sum(gross_value) filter (where status = 'confirmed'), 0)::numeric / 100 as revenue,
    count(*) filter (where status = 'refunded')::bigint as refunds
  from purchases
  where is_test = false
    and created_at >= (select value::timestamptz from checkout_config where key = 'production_start_at')
    and created_at >= now() - (p_days || ' days')::interval
    and (p_quiz_id is null or src in (select external_id from leads_reais where quiz_id = p_quiz_id))
  group by product_name, product_type
  order by revenue desc;
$function$;
revoke execute on function public.analytics_revenue_breakdown(integer, text) from public;
grant execute on function public.analytics_revenue_breakdown(integer, text) to authenticated, service_role;

-- 6) analytics_top_segments --------------------------------------------------
drop function if exists public.analytics_top_segments(integer, integer);
create or replace function public.analytics_top_segments(p_days integer default 30, p_min_leads integer default 20, p_quiz_id text default null)
 returns table(archetype text, situation text, desire text, total_leads bigint, with_whatsapp bigint, purchasers bigint, conv_rate numeric, revenue numeric)
 language sql stable security definer set search_path to 'public'
as $function$
  with lead_data as (
    select l.id, l.archetype, l.situation, l.desire, l.whatsapp, l.external_id
    from leads_reais l
    where l.archetype is not null
      and l.created_at >= now() - (p_days || ' days')::interval
      and (p_quiz_id is null or l.quiz_id = p_quiz_id)
  ),
  purchase_agg as (
    select p.src, sum(p.gross_value) as total_value
    from vendas_reais p
    where p.src is not null
    group by p.src
  )
  select
    ld.archetype, ld.situation, ld.desire,
    count(*)::bigint as total_leads,
    count(ld.whatsapp)::bigint as with_whatsapp,
    count(pa.src)::bigint as purchasers,
    round(count(pa.src)::numeric / nullif(count(*), 0) * 100, 1) as conv_rate,
    coalesce(sum(pa.total_value), 0)::numeric / 100 as revenue
  from lead_data ld
  left join purchase_agg pa on ld.external_id = pa.src
  group by ld.archetype, ld.situation, ld.desire
  having count(*) >= p_min_leads
  order by conv_rate desc
  limit 20;
$function$;
revoke execute on function public.analytics_top_segments(integer, integer, text) from public;
grant execute on function public.analytics_top_segments(integer, integer, text) to authenticated, service_role;

-- 7) analytics_full_funnel ---------------------------------------------------
-- (ramo quiz filtra por quiz_id; ramo checkout permanece global — sem quiz_id)
drop function if exists public.analytics_full_funnel(integer);
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
    where e.stage = 'question' and e.question_key = 'situacao'
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
    -- checkout_funnel_events NÃO tem quiz_id nem is_test → ramo global (v1)
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
revoke execute on function public.analytics_full_funnel(integer, text) from public;
grant execute on function public.analytics_full_funnel(integer, text) to service_role;

-- 8) analytics_checkout_funnel -----------------------------------------------
-- p_quiz_id aceito p/ interface uniforme do admin, mas NÃO filtra: checkout é
-- superfície única compartilhada entre quizzes (v1). Corpo idêntico ao vivo.
drop function if exists public.analytics_checkout_funnel(integer);
create or replace function public.analytics_checkout_funnel(p_days integer default 30, p_quiz_id text default null)
 returns table(stage text, label text, reached bigint, drop_pct numeric)
 language sql stable security definer set search_path to 'public', 'checkout'
as $function$
  with cutoff(ts) as (
    select case when p_days = 0
      then (date_trunc('day', now() at time zone 'America/Sao_Paulo')) at time zone 'America/Sao_Paulo'
      else now() - make_interval(days => p_days)
    end
  ),
  stages(stage, label, sort_order) as (
    values
      ('view', 'Chegaram no checkout', 1), ('form_start', 'Começaram a preencher', 2),
      ('identity', 'Dados pessoais', 3), ('method', 'Escolheram pagamento', 4),
      ('payment_info', 'Info de pagamento', 5), ('submit', 'Clicaram pagar', 6),
      ('purchase', 'Pagaram', 7)
  ),
  raw_counts as (
    select e.stage, count(distinct e.session_id) as reached
    from checkout.checkout_funnel_events e
    where e.created_at >= (select ts from cutoff)
      and e.stage in ('view','form_start','identity','method','payment_info','submit','purchase')
    group by e.stage
  ),
  merged as (
    select s.stage, s.label, s.sort_order, coalesce(r.reached, 0) as reached
    from stages s
    left join raw_counts r on r.stage = s.stage
  ),
  ordered as (
    select *, lag(reached) over (order by sort_order) as prev_reached
    from merged
  )
  select o.stage, o.label, o.reached,
    case
      when o.prev_reached is null or o.prev_reached = 0 then 0
      else round((1 - o.reached::numeric / o.prev_reached) * 100, 1)
    end as drop_pct
  from ordered o
  order by o.sort_order;
$function$;
revoke execute on function public.analytics_checkout_funnel(integer, text) from public;
grant execute on function public.analytics_checkout_funnel(integer, text) to service_role;

-- ── Correção de ACL: Supabase concede anon+authenticated por DEFAULT a toda ──
-- função nova em public (ALTER DEFAULT PRIVILEGES). Nenhuma analytics_* tinha
-- anon no estado original; 3 eram service_role-only. Reverter explicitamente:
revoke execute on function public.analytics_funnel(integer, text) from anon;
revoke execute on function public.analytics_cohort_weekly(integer, text) from anon;
revoke execute on function public.analytics_quiz_conversion(integer, text) from anon;
revoke execute on function public.analytics_revenue_breakdown(integer, text) from anon;
revoke execute on function public.analytics_top_segments(integer, integer, text) from anon;
revoke execute on function public.analytics_quiz_funnel(integer, text) from anon, authenticated;
revoke execute on function public.analytics_full_funnel(integer, text) from anon, authenticated;
revoke execute on function public.analytics_checkout_funnel(integer, text) from anon, authenticated;

commit;
