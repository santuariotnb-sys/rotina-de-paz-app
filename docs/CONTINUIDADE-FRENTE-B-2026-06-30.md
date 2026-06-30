# PROMPT DE CONTINUIDADE — Missão Tracking Fiel (handoff sênior, 2026-06-30)

> Cole este arquivo como contexto inicial de uma sessão NOVA e limpa. Ele assume que você é um
> **engenheiro sênior** entrando num sistema de produção que processa dinheiro real. Leia inteiro
> antes de tocar em qualquer coisa. Depois leia, nesta ordem:
> 1. `docs/AUTONOMOUS-EXECUTION-MISSION-2026-06-30.md` (harness/guardrails)
> 2. `docs/superpowers/specs/2026-06-30-tracking-funil-fiel-design.md` (design dos 5 pilares)
> 3. `docs/PLANO-EXEC-ABDC-2026-06-30.md` (passo-a-passo técnico de A/B/D/C)
> 4. `docs/AUDIT-AUTONOMO-2026-06-30.md` (estado real auditado, 47 achados)
> 5. `docs/PROGRESS-AUTONOMO-2026-06-30.md` (log do que foi feito)

## RESUMO EXECUTIVO (estrutura completa · objetivo · o que foi feito)

### A — Estrutura completa do ecossistema
**Jornada do usuário (o funil):**
`Anúncio Meta → LP (rotinadepaz.com.br) e/ou Quiz Sacra → responde o quiz → vira lead → clica no CTA → checkout Kirvano (domínio externo) → compra → webhook Kirvano → libera entitlement → acesso no App (área de membros) → Admin gerencia/analisa tudo.`

**Camadas técnicas (onde cada coisa roda):**
- **LP estática + checkout React** — `~/rotina-de-paz` → Cloudflare Pages. Tracking via `public/rdp-tracking.js` (IIFE) + `src/lib/{attribution,track-event}.ts`.
- **Quiz Sacra** — fonte em `~/Quiz-sacra`, build vira `~/rotina-de-paz/public/quiz.html`. Identidade em `src/lib/tracking.ts`.
- **App + Admin** (TanStack Router) — `~/rotina-de-paz-app` → Vercel. CAPI server-side em `src/lib/admin/meta-capi.server.ts`; webhook Kirvano em `src/lib/admin/kirvano.server.ts`.
- **Edge function `track-event`** (Supabase) — grava `tracking_sessions` + relay CAPI.
- **Banco** — Supabase `cemjibbauvvyfaxilrvm` (COMPARTILHADO com o Quiz).
- **Meta** — Pixel `863734499693171` (browser) + CAPI (servidor).

**Modelo de dados (principais tabelas/views):** `leads`, `quiz_funnel_events` (tem `is_test`), `tracking_sessions` (beacon: external_id/fbp/fbc/fbclid/client_ip/ua), `purchases` + view `vendas_reais`, `leads_reais`, `receita_real`, `entitlements` (acessos), `webhook_logs` (+ `capi_status`). RPCs de funil/analytics: `analytics_quiz_funnel`, `analytics_full_funnel`, `analytics_checkout_funnel`, `analytics_top_segments`. ⚠️ `checkout.checkout_funnel_events` NÃO tem `is_test`.

### B — Objetivo (o que estamos construindo)
Tracking **100% fiel ao real, sem inflar**, pronto para quando subir tráfego. Concretamente, os **5 pilares**:
1. **Espinha de identidade única** (`external_id = rp_<uuid>`) do 1º toque à compra, em cookie de domínio-raiz `.rotinadepaz.com.br` → liga lead↔sessão↔checkout↔venda↔acesso.
2. **Captura server-side** de `client_ip` (CF-Connecting-IP) + User-Agent → sobe o EMQ.
3. **Dedup correto** Pixel↔CAPI por `event_id` compartilhado; compra usa `event_id = order_id` da Kirvano.
4. **Travessia até a Kirvano** (domínio externo): decorar URL do checkout + *stitching* no webhook.
5. **Fonte de verdade única**: funil por JOIN (nunca UNION), `COUNT(DISTINCT external_id)`, filtra `is_test`, receita real-only; mídia Meta reconciliada por `order_id` (nunca somada).
**Resultado esperado:** EMQ alto, atribuição lead→venda fechada, captura de todos os leads/respostas/entradas-saídas/liberações/checkout — coerentes e rastreáveis no Admin.

### C — O que JÁ foi feito (verificado no prod)
- ✅ **Spec + arquitetura aprovados** (5 pilares, roadmap Sprint 0→A→B→D→C) — `fa77e24`.
- ✅ **Sprint 0 inteiro (4 bugs)** corrigidos, aplicados no prod e verificados:
  - #1 revoke de acesso (`984326a`) · #2 CSV 100× (`527de0b`) · #3 funis ignoram `is_test` (`f113b19`) · #4 RLS de tracking (`527de0b`).
- ✅ **B1 Passo 1** — espinha de identidade semeada (cookie `rdp_eid` + `getOrCreateExternalId()`), aditivo, na LP (`f732aa0`).
- ✅ **B5** — schema de tracking versionado + índices `external_id`/`src` (`3e93bcd`).
- ✅ **Auditoria das 5 superfícies** (47 achados) + **planos turnkey A/B/D/C** (`4b2ce40`) + harness de execução autônoma + memória do projeto atualizada.

**Falta (o coração do EMQ/dedup):** propagar o `external_id` em todos os payloads, IP/UA server-side, decorar checkout, stitching no webhook, dedup Lead/IC, e então o dashboard de gargalos (D). Detalhe por passo abaixo.

---

## 0. Postura (como um sênior trabalha aqui — NÃO negociável)
- **Nunca confie, verifique no banco vivo.** Migrations locais ESTÃO DESSINCRONIZADAS do prod. O
  estado real só se conhece consultando o banco (`sb-query.mjs`, SELECT). Já aconteceu de a migration
  no disco divergir da função viva — sempre baseie mudanças no `pg_get_functiondef`/`information_schema` REAIS.
- **Reproduza a causa-raiz antes de corrigir.** Um sintoma ≠ a causa. (Ex.: o "CSV 100× errado" não era o
  RPC — era o export reaplicando `×100`/`÷100` que o SQL já fazia.)
- **Toda mudança: mínima → aplica → verifica resultado real → só então commita.** Falhou? Reverte e registra. Não empilha correção sobre correção.
- **Teste em banco sem tocar cliente real:** `BEGIN … ROLLBACK` ou linhas `is_test=true`. NUNCA um UPDATE/DELETE largo.
- **Commits granulares e SERIALIZADOS** (ver armadilha #1). Mensagem clara + `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. Commite só os arquivos da mudança (o working tree tem MUITOS `??`).

## 1. Missão (Definition of Done)
Quando o dono subir tráfego, tudo tem que funcionar e ser **fiel ao real, sem inflar**: todos os eventos
disparam (LP, Quiz Sacra, App, Admin); **EMQ alto** (external_id + IP/UA server-side + fbp/fbc em 100% das
compras); **dedup correto** (Pixel↔CAPI mesmo `event_id`; compra `event_id = order_id` Kirvano); **analytics
fiel** ligando lead→sessão→checkout→venda→liberação por uma espinha de identidade única (`external_id`),
via JOIN (nunca UNION); dados do Admin coerentes e rastreáveis, com teste (`is_test`) separado do real.

## 2. Topologia EXATA (a coisa que mais quebra quem não conhece)
| Peça | Caminho | Deploy |
|---|---|---|
| **App + Admin** (TanStack Router) | `/Users/guilhermehenrique/rotina-de-paz-app` ← trabalhe AQUI | Vercel (push → deploy) |
| **LP + quiz.html** (estático + checkout React) | `/Users/guilhermehenrique/rotina-de-paz` | Cloudflare Pages via wrangler (`deploy.sh` + `apps.manifest`) |
| **Quiz fonte** (build → `~/rotina-de-paz/public/quiz.html`) | `/Users/guilhermehenrique/Quiz-sacra` | build + copiado p/ LP |
| **Edge function `track-event`** (grava `tracking_sessions` + relay CAPI) | Supabase Functions | `supabase functions deploy` |
| **Banco** | Supabase **`cemjibbauvvyfaxilrvm`** (COMPARTILHADO com o Quiz) | DDL via Management API |

- ⚠️ Existe um **2º clone do app** em `/Users/guilhermehenrique/projects/rotina-de-paz-app` — é o "errado". Produção é `~/rotina-de-paz-app`.
- ⚠️ `supabase/config.toml` diz `project_id = "xzmlsnghjmwbyebrcfdh"` → **LIXO**, ignore. O banco real é `cemj…` (confirmado em `.env`, `linked-project.json`, pooler).
- Pixel Meta de produção: **`863734499693171`** (já trocado do antigo `838169472100225`).
- Bridge universal de tracking da LP: `~/rotina-de-paz/public/rdp-tracking.js` (IIFE). Checkout React: `~/rotina-de-paz/src/lib/{attribution,track-event}.ts` + `src/config/tracking.ts`.

## 3. Como aplicar DDL/SQL no PROD (método testado)
```
node <scratchpad>/sb-query.mjs <tokenFile> <sqlFile>
→ POST https://api.supabase.com/v1/projects/cemjibbauvvyfaxilrvm/database/query
```
- ⛔ **NUNCA** `supabase db push` (reaplicaria dezenas de migrations fora-de-banda no prod compartilhado).
- O `SERVICE_ROLE_KEY` do `.env` **não** serve para DDL (só PostgREST). Precisa do **token pessoal `sbp_…`**
  (Account → Access Tokens) ou da **senha do banco** (Settings → Database). **O dono os tem e autoriza** —
  peça para ele colar no início (ele não vai rotacionar). NÃO grave segredo no git.
- Toda DDL aplicada vira TAMBÉM arquivo em `supabase/migrations/` (idempotente: `IF EXISTS`/`IF NOT EXISTS`).
- Template do helper (recrie no scratchpad da sessão nova):
  ```js
  import { readFileSync } from "node:fs";
  const TOKEN = readFileSync(process.argv[2],"utf8").trim();
  const sql = readFileSync(process.argv[3],"utf8");
  const r = await fetch("https://api.supabase.com/v1/projects/cemjibbauvvyfaxilrvm/database/query",
    { method:"POST", headers:{Authorization:`Bearer ${TOKEN}`,"Content-Type":"application/json"}, body:JSON.stringify({query:sql}) });
  console.log("HTTP",r.status); console.log((await r.text()).slice(0,1000));
  ```
  (CLAUDE.md bloqueia `curl`/`fetch` inline no Bash; rodar via `node script.mjs` é OK.)

## 4. Estado ATUAL (checklist — verificado no prod)
**Pronto e aplicado/verificado:**
- ✅ Sprint 0 #1 revoke (`entitlements` aceita `revoked`; UI `.select()`+erro visível) — commit `984326a`.
- ✅ Sprint 0 #2 CSV 100× (`admin.analytics.tsx` export usa `Number().toFixed()`) — em `527de0b`.
- ✅ Sprint 0 #3 funis ignoram `is_test` (`analytics_quiz_funnel`/`analytics_full_funnel`) — `f113b19` + migration `20260630_funnels_filter_is_test.sql`.
- ✅ Sprint 0 #4 RLS: revogados grants residuais de tracking p/ anon/authenticated — `527de0b` + migration `20260630_revoke_residual_tracking_grants.sql`.
- ✅ B1 Passo 1 (LP `~/rotina-de-paz`, commit `f732aa0`): `getOrCreateExternalId()` + cookie domínio-raiz `rdp_eid` (`Domain=.rotinadepaz.com.br`), **aditivo** (nada lê ainda).
- ✅ B5 (este repo, commit `3e93bcd`): schema versionado + índices `idx_leads_external_id`, `idx_purchases_src`.

**Pendente (ordem recomendada):**
- ⬜ **B1 Passo 2** — propagar `external_id` em TODOS os payloads (LP IIFE, checkout React, quiz) e gravar em `tracking_sessions` via edge.
- ⬜ **B1 Passo 3** — decorar URL de checkout Kirvano com `src=<external_id>`+`fbp`/`fbc`/`fbclid` (Kirvano devolve em `utm.src` no webhook).
- ⬜ **B2** — edge `track-event`: ler `CF-Connecting-IP` + `User-Agent` server-side → `client_ip` deixa de ser null.
- ⬜ **B3** — webhook (`src/lib/admin/kirvano.server.ts` + `meta-capi.server.ts`): stitching por `external_id` → cola fbp/fbc/ip da sessão no Purchase CAPI.
- ⬜ **B4** — dedup: alinhar `event_id` browser↔CAPI em Lead/IC (Purchase já usa `order_id`).
- ⬜ **B6** — Lead + InitiateCheckout TAMBÉM no servidor (CAPI), `event_id` casado (`lead_<eid>`, `ic_<eid>_<scope>`).
- ⬜ **Frente A** (medição/baseline EMQ — pode rodar a qualquer momento; ver A1: cron `capi-retry`, só 24% das compras com CAPI enviado).
- ⬜ **Frente D** (dashboard de gargalos por JOIN; depende de B popular `external_id`).
- ⬜ **Frente C** (eventos finos + compras in-app).

## 5. Próximos passos — detalhe de execução
### B1 Passo 2 (propagação)
- Em `~/rotina-de-paz`: trocar leitura de `rdp_visitor_id` por `getOrCreateExternalId()` como fonte única; incluir `external_id` no payload do edge `track-event` e no `eventID`/advanced matching dos pixels.
- No quiz (`~/Quiz-sacra/src/lib/tracking.ts`): hoje gera `qs_<uuid>` em localStorage; alinhar para também escrever/ler o cookie `rdp_eid` (mesmo eTLD+1 → mesma identidade LP↔quiz). Cuidado para **não fragmentar** visitantes atuais (reaproveitar valor legado).
- Edge `track-event`: gravar `external_id` em `tracking_sessions` (já grava beacon). Verificar `SELECT external_id FROM tracking_sessions ORDER BY created_at DESC LIMIT 5`.

### B1 Passo 3 (decorar checkout)
- `buildKirvanoUrl` no app (`src/lib/utm.ts`) e equivalente da LP: anexar `src`, `fbp`, `fbc`, `fbclid`. Confirmar leitura do webhook em `utm.src` (visto em `Quiz-sacra/src/lib/utm.ts:52`).
- Verificação: clicar CTA → URL contém `src=rp_…`; venda de teste → webhook recebe `utm.src`.

### B2 (client_ip server-side)
- Edge: `req.headers.get('cf-connecting-ip')` (fallback `x-forwarded-for`.split(',')[0]) + `user-agent`. `upsert_tracking_session` por `external_id`.
- Verificação: nova sessão de teste → `client_ip` ≠ null.

### B3 (stitching) e B4/B6 (dedup) → exigem evento ao vivo + Events Manager. Ver §B3-B6 do PLANO-EXEC-ABDC.

## 6. ARMADILHAS CRÍTICAS (aprendidas na marra — leia 2×)
1. **Corrida de commits entre agentes paralelos:** rodar fixes em paralelo no MESMO clone causou um `git add -A` de uma sessão varrer o staged de outra (o fix #2 caiu no commit do #4). **Serialize commits.** Se for paralelizar implementação, use **worktrees git isolados** (1 por agente) ou faça `git add <arquivos exatos>` e commit imediato, um de cada vez.
2. **PostgREST serializa `numeric` como STRING.** `getTopSegments` faz `as TopSegment[]` (cast, não coerção) → `s.conv_rate` é `"12.5"`, não `12.5`. Use `Number(x)` antes de `.toFixed()`/aritmética, senão quebra em runtime ou concatena string.
3. **`checkout.checkout_funnel_events` NÃO tem coluna `is_test`** → o ramo de checkout do funil não dá pra filtrar teste ainda. Pré-requisito do dono: marcar sessões de teste no checkout. Até lá, use `quiz_funnel_events`/`purchases` (que têm `is_test`).
4. **Migrations no disco ≠ prod.** Sempre cheque a definição VIVA antes de recriar uma função/tabela. A migration antiga do funil estava "drifted" (labels/ordering diferentes do prod).
5. **Hook GateGuard (fact-forcing):** antes do 1º Bash e de cada Write/Edit, o harness EXIGE você declarar fatos (quem chama, duplicação, dados, instrução verbatim). É chato mas obrigatório — declare e prossiga. (Desligável via `ECC_GATEGUARD=off` ou `ECC_DISABLED_HOOKS`, mas é guardrail útil; mantenha.)
6. **Auto-mode bloqueia loops auto-perpetuáveis** que aplicam no prod sem humano no circuito (heartbeat infinito foi negado). Trabalho autônomo roda até o fim de um ciclo; a próxima leva precisa de um "continua" do dono.
7. **Mobile:** esta é sessão LOCAL no Mac; **não aparece no claude.ai/code do celular** e push só com Remote Control conectado. Não prometa push pro celular sem Remote Control.
8. **Dois pilares de receita não reconciliados:** financeiro = real-only (`vendas_reais`/webhook); mídia = Meta-rotulado. **Nunca somar** — reconciliar por `order_id`.
9. **Custo:** uma rodada multi-agente completa custou ~930k tokens. Escopo grande = caro. Prefira passos focados e verificáveis; pare e reporte em vez de queimar contexto no limite.

## 7. Protocolo de verificação & deploy
- **DB:** `sb-query.mjs` SELECT antes/depois; prova funcional com `BEGIN…ROLLBACK`.
- **Build:** `npm run build` + `tsc --noEmit` verdes no clone afetado antes de commit.
- **Eventos ao vivo:** Events Manager do pixel `863734499693171` → conferir evento recebido, parâmetros (external_id/fbp/fbc/ip/ua), e **dedup** (não dobrar contagem).
- **Deploy (só após verde + verificação):** App = push p/ Vercel; LP/Quiz = wrangler de `~/rotina-de-paz` (`deploy.sh`). ⚠️ O quiz NÃO pode cair — o pipeline é unificado; confira `apps.manifest`.
- Atualize `docs/PROGRESS-AUTONOMO-2026-06-30.md` a cada passo.

## 8. Higiene pendente (não-bloqueante)
- O working tree do app tem ~30 `.md` de auditoria soltos na raiz (gerados pelos agentes) + `docs/ANALISE-*` e `docs/AUDIT-AUTONOMO-*` não commitados. Decidir com o dono: commitar em `docs/` ou limpar.
- Considerar separar (rebase) o fix #2 do commit `527de0b` se quiser histórico granular (só se o dono pedir; é o clone de produção).
