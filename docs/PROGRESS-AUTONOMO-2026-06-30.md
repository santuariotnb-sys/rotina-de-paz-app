# Log de Progresso — Execução Autônoma Tracking Fiel (2026-06-30)

> Log contínuo da missão. Cada entrada: o que foi feito, o que foi verificado, o que falta.
> Spec: `docs/superpowers/specs/2026-06-30-tracking-funil-fiel-design.md`
> Prompt-mestre: `docs/AUTONOMOUS-EXECUTION-MISSION-2026-06-30.md`
> Banco prod: Supabase `cemjibbauvvyfaxilrvm` (compartilhado c/ Quiz). NUNCA `supabase db push`.
> SQL no prod: `node <scratchpad>/sb-query.mjs <scratchpad>/sb-token.txt <arquivo.sql>` (1 statement por arquivo).

---

## FASE 0 — Auditoria (read-only) — ✅ CONCLUÍDA

- ✅ 5 superfícies auditadas em paralelo (LP, Quiz-Sacra, App, Admin, Tracking/CAPI).
- ✅ Consolidado em `docs/AUDIT-AUTONOMO-2026-06-30.md` (visão geral + achados por severidade + gap vs 5 pilares + coerência/rastreabilidade + dados de teste + estado RLS verificado ao vivo).

**Verificações ao vivo (prod) feitas na síntese:**
- `external_id`: ~6% leads, 0% compras, 100% tracking_sessions. ✓
- `client_ip`: 0/67 sessões. ✓
- Funis: os 3 RPCs (`analytics_quiz_funnel`, `analytics_checkout_funnel`, `analytics_full_funnel`) **não** filtram `is_test` (`pg_get_functiondef` sem ocorrência). ✓
- `quiz_funnel_events`: coluna `is_test` existe; 1969 reais / 0 teste no recorte atual. ✓
- `checkout.checkout_funnel_events`: **sem** coluna `is_test` (e sem PII). Filtro is_test aplica só a quiz_funnel_events. ✓
- Grants/RLS: ambas as tabelas com RLS ON; `tracking_sessions` só policy `service_role_all`; `quiz_funnel_events` 0 policies → anon/auth já negados por RLS, mas ainda há `GRANT SELECT,REFERENCES` residual a anon+authenticated; sem grants de escrita. ✓

---

## SPRINT 0 — Bugs ativos — ⏳ EM EXECUÇÃO (#2 ✅ e #4 ✅ fechados; #3 pendente)

Estado planejado (detalhe + abordagem no plano entregue ao dono):

- [x] **#2 CSV Top Segmentos 100× errado** — ✅ CORRIGIDO. `src/routes/admin.analytics.tsx:124-125`.
  - **Causa-raiz (com evidência):** o RPC `analytics_top_segments` já retorna `conv_rate = ROUND(... * 100, 1)` (percentual, ex. `12.5`) e `revenue = SUM(gross_value) / 100` (BRL, ex. `63.90`) — confirmado ao vivo via `pg_get_functiondef` no prod. A tela renderiza cru (`{s.conv_rate}%`, `brl(s.revenue)`) e está certa. O **export aplicava as conversões de novo**: `(s.conv_rate * 100)` → `1250.0%` e `(s.revenue / 100)` → `0.64`. Daí o 100× nos dois sentidos.
  - **Achado extra:** PostgREST serializa `numeric` como **string** (raw: `"conv_rate":"12.5"`); `getTopSegments` faz `as TopSegment[]` (cast, não coerção). Por isso o fix usa `Number(...)` antes de `.toFixed()` — senão quebraria em runtime (string não tem `.toFixed`).
  - **Mudança:** `taxa_conv: \`${Number(s.conv_rate).toFixed(1)}%\``, `receita_brl: Number(s.revenue).toFixed(2)`.
  - **Verificação:** dado real `sobrecarga` (conv 12.5 / R$63,90) → CSV agora `12.5%` / `63.90` (= tela). `tsc --noEmit` limpo. Sem DDL.
- [ ] **#3 Funis contam teste** — adicionar `AND e.is_test = false` às subqueries de `quiz_funnel_events` em `analytics_quiz_funnel` e `analytics_full_funnel`. `checkout_funnel_events` não tem is_test → ramo de checkout fica como está (gap registrado). Nova migration `supabase/migrations/2026063X_funnels_filter_is_test.sql` + aplicar via sb-query.mjs. Verificação: `pg_get_functiondef` passa a conter `is_test`; contagem do funil não muda hoje (0 teste) mas histórico deixa de inflar.
- [x] **#4 Grants residuais tracking** — ✅ FEITO E VERIFICADO NO PROD.
  - **Causa-raiz (reproduzida ao vivo):** ambas as tabelas com RLS ON mas carregando `GRANT SELECT, REFERENCES, TRIGGER` para `anon` e `authenticated`. Origem: (1) `authenticated` veio do re-grant em bloco de `20260615_revoke_anon_writes §4` — grant NÃO usado (app só lê via `supabaseAdmin`/service_role em `meta-capi.server.ts:98`); (2) `anon` veio dos DEFAULT PRIVILEGES do Supabase (mesmo vetor do vazamento de PII de 20260629). Hoje mitigado pela RLS (0 policies permissivas), mas footgun para qualquer policy futura ou DISABLE RLS acidental.
  - **O que mudou:** migration `supabase/migrations/20260630_revoke_residual_tracking_grants.sql` → `REVOKE SELECT, REFERENCES, TRIGGER ON tracking_sessions, quiz_funnel_events FROM anon, authenticated`. Aplicada no prod via `sb-query.mjs` (HTTP 201).
  - **Verificação:** `information_schema.role_table_grants` para anon/authenticated nas duas tabelas → **0 linhas** (antes: 6 cada). `service_role` mantém ALL (SELECT/INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER) → admin read/write intactos. `upsert_tracking_session` é SECURITY DEFINER → escrita do Quiz (anon via RPC) inalterada.
  - **Commit:** ver hash abaixo.

**Critério de pronto do Sprint 0:** CSV bate com a tela; funis ignoram teste; grants fechados; tsc/lint limpos; migrations versionadas + aplicadas + verificadas no prod; commits granulares no clone de produção.

---

## Pendências / TODOs para o dono (registrados, não chutados)

- `checkout.checkout_funnel_events` sem `is_test` nem identidade — marcar sessões de teste no checkout é pré-requisito para filtrar o ramo de checkout do funil (fora do Sprint 0).
- Cobertura CAPI 24%: investigar cron `capi-retry` (13 webhooks pendentes) na Frente A.
- `processed_events` vazia: alimentar para dashboard de EMQ (Frente A/D).
