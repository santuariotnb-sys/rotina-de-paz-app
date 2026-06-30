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
- [x] **#3 Funis contam teste — ✅ FEITO, APLICADO E VERIFICADO NO PROD.**
  - **Causa-raiz (com evidência):** `analytics_quiz_funnel` e `analytics_full_funnel` liam `quiz_funnel_events` direto, SEM `is_test`. `pg_get_functiondef` ao vivo confirmou 0 ocorrências de `is_test`. `quiz_funnel_events` TEM a coluna (1969 reais / 0 teste / 0 null hoje). `checkout.checkout_funnel_events` NÃO tem a coluna.
  - **O que mudou:** migration `supabase/migrations/20260630_funnels_filter_is_test.sql` recria as 2 funções adicionando `AND e.is_test = false` a TODA subquery sobre `quiz_funnel_events` (6 ocorrências em cada). Demais partes idênticas à definição viva (não à migration antiga, que estava drifted). Ramo `checkout_funnel_events` inalterado (sem coluna) — TODO inline + registrado abaixo. REVOKE/GRANT reafirmam EXECUTE só p/ service_role.
  - **Como verifiquei (real, no prod via sb-query.mjs):**
    1. Pós-apply `pg_get_functiondef`: `is_test` passou a aparecer 6× em cada função; `analytics_checkout_funnel` intocada.
    2. Grants pós-apply: EXECUTE só `postgres`+`service_role` (sem anon/auth) — sem regressão de segurança.
    3. Contagens idênticas ao baseline (0 teste hoje → output inalterado): prova não-destrutiva + funções executam OK.
    4. Prova do filtro em transação `BEGIN…ROLLBACK`: inseri 1 evento `arrival` com `is_test=true` → RPC continuou 554 (excluiu), raw sem filtro = 555. `ROLLBACK` confirmado: 0 linhas residuais, arrival=554, total=1969 intactos. Zero dado de cliente tocado.
  - **Frontend:** `quiz-funnel.functions.ts` / `checkout-funnel.functions.ts` só repassam o RPC (service_role), sem filtro próprio → fix no SQL é o lugar único; sem dupla filtragem, sem build necessário.
- [x] **#4 Grants residuais tracking** — ✅ FEITO E VERIFICADO NO PROD.
  - **Causa-raiz (reproduzida ao vivo):** ambas as tabelas com RLS ON mas carregando `GRANT SELECT, REFERENCES, TRIGGER` para `anon` e `authenticated`. Origem: (1) `authenticated` veio do re-grant em bloco de `20260615_revoke_anon_writes §4` — grant NÃO usado (app só lê via `supabaseAdmin`/service_role em `meta-capi.server.ts:98`); (2) `anon` veio dos DEFAULT PRIVILEGES do Supabase (mesmo vetor do vazamento de PII de 20260629). Hoje mitigado pela RLS (0 policies permissivas), mas footgun para qualquer policy futura ou DISABLE RLS acidental.
  - **O que mudou:** migration `supabase/migrations/20260630_revoke_residual_tracking_grants.sql` → `REVOKE SELECT, REFERENCES, TRIGGER ON tracking_sessions, quiz_funnel_events FROM anon, authenticated`. Aplicada no prod via `sb-query.mjs` (HTTP 201).
  - **Verificação:** `information_schema.role_table_grants` para anon/authenticated nas duas tabelas → **0 linhas** (antes: 6 cada). `service_role` mantém ALL (SELECT/INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER) → admin read/write intactos. `upsert_tracking_session` é SECURITY DEFINER → escrita do Quiz (anon via RPC) inalterada.
  - **Commit:** ver hash abaixo.

**Critério de pronto do Sprint 0:** CSV bate com a tela; funis ignoram teste; grants fechados; tsc/lint limpos; migrations versionadas + aplicadas + verificadas no prod; commits granulares no clone de produção.

---

## PLANOS TURNKEY A/B/D/C — ✅ ENTREGUES

- Documento: `docs/PLANO-EXEC-ABDC-2026-06-30.md` (passo a passo, arquivos, SQL, verificação por frente).
- Frente A: medir EMQ/cobertura CAPI/atribuição (baseline, read-only).
- Frente B: 5 pilares — B1 identidade (`external_id rp_<uuid>` cookie domínio-raiz), B2 IP server-side, B3 stitching webhook, B4 dedup, B5 schema DDL, B6 Lead/IC no CAPI.
- Frente D: dashboard de gargalos por JOIN (novo RPC, filtra is_test, liga a vendas_reais).
- Frente C: eventos finos + compras in-app plugáveis.

---

## FRENTE B — B1 Passo 1 (espinha de identidade) — ✅ FEITO, VERIFICADO, COMMITADO (LP)

> Passo SEGURO e REVERSÍVEL: gerar/persistir `external_id = rp_<uuid>` no 1º toque, ADITIVO.

- **Onde:** repo LP `~/rotina-de-paz` (Cloudflare). Commit `f732aa0`.
  - `public/rdp-tracking.js` (IIFE — quiz.html + LP HTML): novo `getOrCreateExternalId()` + `window.rdpTrack.externalId`.
  - `src/lib/attribution.ts` (checkout React): novo `export getOrCreateExternalId()`.
- **Comportamento:** cookie domínio-raiz `rdp_eid` (`Domain=.rotinadepaz.com.br; SameSite=Lax; Secure; 2 anos`) + localStorage `rdp_external_id`. Resolução preserva continuidade: cookie > localStorage legado (`qs_…`/`rp_…`) > deriva de `rdp_visitor_id` existente > novo `rp_<uuid>`.
- **Por que é seguro:** puramente aditivo — **nada lê `rdp_eid` ainda**, nenhum payload muda, sem deploy forçado. Em host sem o eTLD+1 (preview `*.pages.dev`, localhost) grava cookie de host (sem `Domain`) — silencioso. Falha de cookie → cai em localStorage.
- **Verificação (real):**
  - Mock de cookie do `rdp-tracking.test.ts` corrigido para fazer **append** (como browser real) em vez de clobber — revelou que setar `document.cookie` num mock flat apagava `_fbp/_fbc`; em browser real apenas adiciona.
  - +2 testes no IIFE (deriva `rp_<visitorId>`; reusa cookie existente) e novo `attribution-external-id.test.ts` (6 testes: 1º toque, estabilidade, reuso cookie, reuso legado `qs_`, derivação de visitor_id, escrita de cookie).
  - Suite LP **254 testes verdes** (era 246); `tsc -b` limpo; `npm run build` ok (quiz.html + dist/rdp-tracking.js regenerados com o novo código).
- **NÃO deployado** (guardrail: deploy é passo separado, após decisão do dono / janela segura). O dist local já reflete a mudança caso queira subir via wrangler.

### Próximos passos B1 (não feitos nesta rodada — documentados no plano)
- B1.2 propagar `external_id` em TODOS os payloads (edge `track-event` grava em `tracking_sessions`; pixel/CAPI usam como identidade) e migrar leitura `rdp_visitor_id` → `getOrCreateExternalId()`.
- B1.3 decorar URL do checkout Kirvano com `src=<external_id>`+fbp/fbc/fbclid.
- Quiz fonte (`~/Quiz-sacra/src/lib/tracking.ts`) usa `rdp_external_id=qs_<uuid>` em localStorage; o cookie `rdp_eid` do IIFE já o reusa (continuidade preservada). Unificar no B1.2.

---

## Pendências / TODOs para o dono (registrados, não chutados)

- `checkout.checkout_funnel_events` sem `is_test` nem identidade — marcar sessões de teste no checkout é pré-requisito para filtrar o ramo de checkout do funil (fora do Sprint 0).
- Cobertura CAPI 24%: investigar cron `capi-retry` (13 webhooks pendentes) na Frente A.
- `processed_events` vazia: alimentar para dashboard de EMQ (Frente A/D).
