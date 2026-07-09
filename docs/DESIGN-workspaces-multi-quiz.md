# Design Doc — Workspaces por Quiz (multi-quiz)

**Data:** 2026-07-09 · **Status:** APROVADO (decisões do dono abaixo) · **Origem:** auditoria multi-agente (3 Sonnet + 1 Opus) do ecossistema Rotina de Paz.

**Decisões do dono (2026-07-09):** (1) Workspace = 1 quiz, 1:1. (2) **Pixel único compartilhado** entre os quizzes (863734499693171) — atribuição no Meta fica misturada entre os funis; a separação por quiz existe só no admin/banco (via quiz_id). `external_id_prefix` continua per-quiz no catálogo (default 'qs_') para higiene de localStorage/join. (3) Todo admin vê todos os quizzes (is_admin global) — ACL por quiz fora de escopo.

Isolar Leads/Analytics/Tracking por quiz no admin, viabilizando um 2º quiz. Nada implementado até aprovação.

## 0. TL;DR
- Promover **`quiz_id`** (slug estável, ex. `"sacra"`) a cidadão de 1ª classe. NÃO reciclar `quiz_version` (continua = iteração de copy).
- **Workspace = quiz, 1:1** por ora. Campo `workspace` fica só como metadado para agrupamento futuro.
- Catálogo `quizzes` + coluna `quiz_id` em `leads`, `quiz_funnel_events`, `quiz_responses` (vendas via join por external_id). Backfill dos 152 leads / 3420 eventos para `'sacra'`.
- Tudo aditivo/retrocompatível: colunas `NOT NULL DEFAULT 'sacra'`, RPCs ganham `p_quiz_id text DEFAULT NULL`, frontend passa `quiz_id` idempotente. Produção nunca quebra.
- Admin v1: seletor global no topbar + `AdminQuizContext` que refiltra as 4 telas. SEM abas dedicadas por quiz.
- 4 fases deployáveis e reversíveis, começando pelo banco (risco zero para o funil vivo).

## 1. Estado atual (auditado)
É um pote único por design. Zero `quiz_id` em `leads`/`quiz_responses`/`purchases`. Só existe `quiz_funnel_events.quiz_version` (`"v2-resultado"` hardcoded em `QuizApp.tsx:40`) — mas é versão de copy (valores com ranges de data sobrepostos: v2-resultado 2447, v2-onda1 630, null 234, v2-onda0 109), não identidade de quiz, e nem propaga para o lead. As ~8 RPCs `analytics_*` só aceitam `p_days`. Admin (`~/rotina-de-paz-app`, TanStack Start) sem contexto de quiz; sidebar estática em `AdminSidebar.tsx:35-54`; `is_admin` global. Migrations reais em `~/rotina-de-paz-app/supabase/migrations` (as de `~/Quiz-sacra/supabase` estão em drift).

## 2. Decisão-mãe: `quiz_id` novo, ortogonal a `quiz_version`
| Eixo | `quiz_id` (novo) | `quiz_version` (existente) |
|---|---|---|
| Significado | qual produto/funil | qual iteração de copy |
| Estabilidade | permanente | muda a cada teste de hero |
| Uso | isolamento workspace/pixel/catálogo | A/B de copy dentro do workspace |
Não reaproveitar `quiz_version`: reescrever 3.186 valores históricos destruiria o histórico de A/B, e ele só existe em 1 tabela.

## 3. Modelo de dados (DDL conceitual)
Uma migração aditiva em `~/rotina-de-paz-app/supabase/migrations`.

```sql
create table public.quizzes (
  id text primary key,                         -- 'sacra', 'quiz2'
  nome text not null,
  workspace text not null default 'sacra',     -- metadado p/ agrupamento futuro
  pixel_id text,                               -- sai do bundle p/ config
  external_id_prefix text not null default 'qs_',
  base_path text,
  status text not null default 'active' check (status in ('active','paused','archived')),
  created_at timestamptz not null default now()
);
insert into public.quizzes (id, nome, pixel_id, external_id_prefix, base_path)
values ('sacra','Quiz Sacra','863734499693171','qs_','/sacra/quiz');

alter table public.leads              add column quiz_id text not null default 'sacra' references public.quizzes(id);
alter table public.quiz_funnel_events add column quiz_id text not null default 'sacra' references public.quizzes(id);
alter table public.quiz_responses     add column quiz_id text not null default 'sacra' references public.quizzes(id);
create index on public.leads (quiz_id);
create index on public.quiz_funnel_events (quiz_id, created_at);
create index on public.quiz_responses (quiz_id);
-- purchases: NÃO adicionar coluna; quiz_id da venda deriva do lead por external_id (checar venda órfã antes).
```
Backfill é automático via `DEFAULT 'sacra'` no `ADD COLUMN` (Postgres 11+ não reescreve a tabela). Views `leads_reais`/`vendas_reais`: só adicionam `quiz_id` à projeção; WHERE inalterado → mesmo número de linhas, nada que consome quebra.

## 4. Propagação
RPCs ganham último param opcional: `persist_lead(..., p_quiz_id text default 'sacra')`, `track_quiz_step(..., p_quiz_id text default 'sacra')` (mantém `quiz_version`), `persist_quiz_responses(..., p_quiz_id text default 'sacra')`.
Frontend resolve `quiz_id` via **env de build** (não runtime): `VITE_QUIZ_ID=sacra`, `VITE_PIXEL_ID`, `VITE_EXTERNAL_ID_PREFIX`. Casa com o deploy atual (1 bundle por path). Os 13 pontos de injeção viram 4 fontes: QUIZ_ID, PIXEL_ID, EXTERNAL_ID_PREFIX (env) + repasse de p_quiz_id nas 3 RPCs.

## 5. Analytics multi-quiz
Todas as ~8 RPCs: `+ p_quiz_id text default null` e `WHERE (p_quiz_id IS NULL OR quiz_id = p_quiz_id)`. null = comportamento atual (retrocompat). Lista: analytics_funnel, analytics_top_segments, analytics_quiz_conversion, analytics_cohort_weekly, analytics_revenue_breakdown, analytics_quiz_funnel + server fns getCheckoutFunnel/getFullFunnel/getConvertedLeadIds.

## 6. Admin — v1 (seletor global, NÃO abas por quiz)
1. `getQuizzes()` server fn → dropdown.
2. `AdminQuizContext` provido no layout `admin.tsx`; estado `{quizId, setQuizId, quizzes}`; persiste em localStorage `admin.quizId`.
3. Dropdown no topbar (visível em todas as telas).
4. Consumo nas 4 telas (`admin.leads`, `admin.quiz`, `admin.tracking`, `admin.analytics`): passar `quizId` às RPCs / `.eq('quiz_id', quizId)` nas queries inline, e **incluir `quizId` na queryKey** do TanStack Query (senão o cache não invalida ao trocar de quiz — armadilha silenciosa).
Sem rotas novas, sem mexer na sidebar.

## 7. Ordem incremental (cada fase deployável e reversível)
- **Fase 0 — banco**: catálogo + colunas + backfill (default) + params `p_quiz_id` nas 3 RPCs de escrita + views expõem quiz_id. Risco ~zero. Validar contra o banco vivo (152/3420/1057 = 'sacra').
- **Fase 1 — frontend**: env VITE_QUIZ_ID/PIXEL_ID/PREFIX, passar p_quiz_id (idempotente = 'sacra'). Deploy do bundle sacra sem risco.
- **Fase 2 — RPCs analytics**: p_quiz_id opcional nas ~8. Sem consumidor ainda → invisível.
- **Fase 3 — admin**: contexto + dropdown + queryKeys + filtros. Com 1 quiz, dropdown mostra só "Sacra"; encanamento pronto.
- **Fase 4 (quando quiz2 existir)**: só config — `insert into quizzes` + build com VITE_QUIZ_ID=quiz2 + deploy novo path. Zero código.

## 8. Riscos
1. **Drift de migrations**: criar SÓ em `~/rotina-de-paz-app/supabase/migrations`; não tocar `~/Quiz-sacra/supabase` (lixo histórico); validar contra produção.
2. **Banco compartilhado** (quiz+checkout+app): tudo aditivo; checkout/app ignoram quiz_id. Venda liga ao lead por external_id — quiz_id da venda deriva do join; checar venda órfã antes de qualquer coluna em purchases.
3. **is_admin global**: v1 assume que todo admin vê todos os quizzes (mesmo dono). ACL por quiz (`admin_quiz_access`) fica para depois — modelo já suporta plugar sem re-migração.
4. **Bug contact_gate** (RPC aceita, CHECK rejeita — código morto, 0 ocorrências): NÃO consertar junto; dívida ortogonal, commit isolado.
5. **Dedup de Lead cross-quiz**: pixels e prefixos de external_id distintos por quiz → sem colisão; mesma pessoa em 2 quizzes = 2 leads por design.

## 9. Decisões para aprovar
| # | Decisão | Recomendação |
|---|---|---|
| 1 | Dimensão de isolamento | `quiz_id` novo, separado de `quiz_version` |
| 2 | Workspace | = quiz 1:1; `workspace` só metadado |
| 3 | Catálogo | tabela `quizzes` |
| 4 | Coluna | `quiz_id NOT NULL DEFAULT 'sacra'` em 3 tabelas |
| 5 | Backfill | automático via default; views expõem quiz_id |
| 6 | Frontend | env de build (não runtime) |
| 7 | RPCs | `p_quiz_id text default null` |
| 8 | Admin | v1 seletor global; sem abas por quiz |
| 9 | Ordem | banco → frontend → RPCs → admin → (quiz2 = config) |
| 10 | Fora de escopo | ACL por quiz, bug contact_gate, unificar padrões, dedup cross-quiz |
