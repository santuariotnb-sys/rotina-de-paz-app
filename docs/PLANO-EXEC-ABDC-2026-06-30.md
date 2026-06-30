# Planos de Execução Turnkey — Frentes A / B / D / C (Tracking Fiel)

**Data:** 2026-06-30
**Spec:** `docs/superpowers/specs/2026-06-30-tracking-funil-fiel-design.md`
**Prompt-mestre:** `docs/AUTONOMOUS-EXECUTION-MISSION-2026-06-30.md`
**Auditoria:** `docs/AUDIT-AUTONOMO-2026-06-30.md`
**Progresso:** `docs/PROGRESS-AUTONOMO-2026-06-30.md`

> Banco prod: Supabase `cemjibbauvvyfaxilrvm` (compartilhado c/ Quiz). **NUNCA** `supabase db push`.
> SQL no prod: `node <scratchpad>/sb-query.mjs <scratchpad>/sb-token.txt <arquivo.sql>` (1 statement/arquivo).
> Toda migration nova também vira arquivo em `supabase/migrations/`.

## Topologia (onde cada coisa mora)
- **App + Admin** (este repo, `/Users/guilhermehenrique/rotina-de-paz-app`) → Vercel. CAPI server-side sólido (`src/lib/admin/meta-capi.server.ts`).
- **LP + Quiz HTML** (`/Users/guilhermehenrique/rotina-de-paz`) → Cloudflare Pages (`deploy.sh` + `apps.manifest`, wrangler).
  - Bridge de tracking universal: `public/rdp-tracking.js` (IIFE; usado por `quiz.html` e páginas HTML).
  - Checkout SPA (React): `src/lib/attribution.ts`, `src/lib/track-event.ts`, `src/config/tracking.ts`.
- **Quiz fonte** (`/Users/guilhermehenrique/Quiz-sacra`) → build vira `~/rotina-de-paz/public/quiz.html`. Identidade em `src/lib/tracking.ts` (`rdp_external_id = qs_<uuid>`).
- **Edge function** `track-event` (Supabase) grava `tracking_sessions` + relay CAPI. **Hoje grava client-side: `client_ip` é null.**

## Estado de identidade HOJE (3 esquemas, todos localStorage-only, sem cookie de domínio-raiz)
| Superfície | Chave | Formato | Persistência |
|---|---|---|---|
| LP IIFE (`rdp-tracking.js`) | `rdp_visitor_id` | UUID puro | localStorage |
| LP React checkout (`attribution.ts`) | `rdp_visitor_id` + `rdp_attr` | UUID puro | localStorage + cookie `path=/` (NÃO domínio-raiz) |
| Quiz (`Quiz-sacra/.../tracking.ts`) | `rdp_external_id` | `qs_<uuid>` | localStorage |

→ Não viajam entre subdomínios nem para o checkout Kirvano; `external_id` chega a ~6% dos leads, 0% das compras.

---

# FRENTE A — Medir a verdade atual (EMQ / envios no Events Manager)

**Objetivo:** baseline numérico ANTES de mudar arquitetura. Sem código de produto; só leitura/medição.
**Depende de:** nada. Pode rodar já.

## A1 — Cobertura CAPI por venda (banco, read-only)
- Fonte: webhooks `SALE_APPROVED` × `capi_status` (já exposto em `admin.webhooks` via `capi_status`).
- Query (rodar via `sb-query.mjs`, SELECT only):
  ```sql
  SELECT capi_status, COUNT(*) FROM purchases
  WHERE is_test = false AND created_at >= now() - interval '30 days'
  GROUP BY capi_status ORDER BY 2 DESC;
  ```
- Achado da auditoria: 4/17 Purchases enviados (24%); 13 `SALE_APPROVED` com `capi_status=null` aguardando cron `capi-retry`. **Investigar o cron** (existe? está rodando? por que 76% pendente?).
- Entregável: % cobertura CAPI de partida + causa do backlog.

## A2 — EMQ atual no Events Manager (manual, no painel Meta)
- Pixel `863734499693171`. No Events Manager → Overview/Diagnostics:
  - Anotar EMQ (Event Match Quality) por evento: Purchase, Lead, InitiateCheckout, PageView.
  - Anotar % de eventos com `external_id`, `em`, `ph`, `fbp`, `fbc`, `ip`, `ua` (coluna de parâmetros).
  - Anotar "Additional conversions from CAPI" e taxa de deduplicação (dedup rate) por evento.
- A Meta não publica pesos exatos do EMQ → registrar a **faixa** (ex.: "Purchase 4.x/10") e os parâmetros presentes/ausentes.
- Entregável: tabela `evento × EMQ × parâmetros presentes` (baseline).

## A3 — Reconciliação beacon × atribuição × receita (banco)
- Confirmar princípio *beacon ≠ atribuição ≠ receita*: contar
  - `tracking_sessions` (beacon), `leads`/`quiz_funnel_events` (atribuição), `vendas_reais` (receita).
  - Quantas vendas têm `src`/`external_id` ligado a uma sessão (atribuição fechada): hoje ~5/23.
- Entregável: número de partida de atribuição lead→venda.

## A4 — `processed_events` (dashboard EMQ futuro)
- Tabela existe mas está **vazia** → sem dashboard de cobertura EMQ. Decidir em D se alimentamos.

**Critério de pronto A:** relatório `docs/MEDICAO-FRENTE-A-<data>.md` com (1) % cobertura CAPI, (2) faixa EMQ + parâmetros por evento, (3) atribuição lead→venda de partida, (4) lista de eventos que chegam × faltam. Esse relatório é o baseline contra o qual B será medido.

---

# FRENTE B — Fundação: tráfego 100% fiel (5 pilares)

**Objetivo:** uma venda de teste ponta-a-ponta carrega `external_id` + fbp/fbc + ip; `client_ip` deixa de ser null; EMQ sobe vs. baseline A; atribuição lead→venda fecha; Lead/IC com dedup browser+servidor.
**Depende de:** baseline A para comparação. B1 não depende de A.

## B1 — Espinha de identidade `external_id = rp_<uuid>` (cookie domínio-raiz)
**Onde:** `~/rotina-de-paz/public/rdp-tracking.js` (IIFE — quiz.html + LP HTML), `~/rotina-de-paz/src/lib/attribution.ts` (checkout React), `~/Quiz-sacra/src/lib/tracking.ts` (fonte do quiz).

### Passo 1 (SEGURO/REVERSÍVEL — feito nesta rodada): gerar+persistir `rp_<uuid>` no 1º toque, ADITIVO
- Novo helper `getOrCreateExternalId()` que:
  1. Lê cookie domínio-raiz `rdp_eid` → se existe, usa.
  2. Senão lê `localStorage.rdp_external_id` (qualquer formato legado: `qs_…`, UUID puro) → reusa para preservar continuidade.
  3. Senão deriva de `rdp_visitor_id` existente (`rp_<visitorId>`) para não fragmentar visitantes atuais.
  4. Senão gera `rp_<uuid>`.
  5. **Escreve em AMBOS:** cookie `rdp_eid` com `Domain=.rotinadepaz.com.br; path=/; max-age=63072000; SameSite=Lax; Secure` (em prod) + `localStorage.rdp_external_id`.
- **Por que é seguro:** puramente aditivo. Nada lê `rdp_eid` ainda; nenhum payload muda. Se o cookie falhar (file://, host sem TLD+1), cai em localStorage. Cookie de domínio-raiz em host de preview (`*.pages.dev`) silenciosamente não persiste — sem efeito colateral.
- **Verificação:** `npm test` (LP, vitest) + `npm run build` verdes; teste manual: abrir página → `document.cookie` contém `rdp_eid=rp_…`; recarregar → mesmo valor; abrir `/quiz` → mesmo valor (mesmo eTLD+1).

### Passo 2 (próximo): propagar `external_id` em TODOS os payloads
- `track-event.ts` / `rdp-tracking.js` / quiz: incluir `external_id` no payload do edge `track-event` E no `eventID`/advanced matching onde aplicável.
- Edge function `track-event`: gravar `external_id` em `tracking_sessions` (já grava `visitor_id`).
- Migrar leitura de identidade de `rdp_visitor_id` → `getOrCreateExternalId()` (1 fonte).

### Passo 3 (próximo): decorar URL de checkout Kirvano
- `buildKirvanoUrl` (app `src/lib/utm.ts`) e equivalentes da LP: anexar `src=<external_id>` (Kirvano devolve em `utm.src` no webhook — confirmado em `Quiz-sacra/src/lib/utm.ts:52`), `fbp`, `fbc`, `fbclid`.

## B2 — Sessão server-side com `client_ip`
**Onde:** edge function `track-event` (Supabase).
- Ler `CF-Connecting-IP` (ou `X-Forwarded-For` 1ª entrada) + `User-Agent` do request no servidor.
- `upsert_tracking_session` idempotente por `external_id`, gravando `client_ip` + `user_agent` server-side.
- **Verificação:** nova sessão de teste → `SELECT client_ip FROM tracking_sessions WHERE external_id='rp_test…'` ≠ null.

## B3 — Stitching no webhook (Purchase)
**Onde:** `src/lib/admin/kirvano.server.ts` + `meta-capi.server.ts` (já lê cookies do payload).
- Lookup por `external_id` (via `utm.src`); fallback hash de email.
- Colar `fbp`/`fbc`/`client_ip` da `tracking_sessions` ligada ao `Purchase` CAPI.
- `event_id = order_id` (regra de ouro — já implementado; manter).
- **Verificação:** venda de teste → CAPI Purchase carrega fbp/fbc/ip vindos da sessão.

## B4 — Dedup Pixel↔CAPI
- Garantir `event_id` no **nível** de `event_name`/`event_time` no payload CAPI.
- Pixel da LP hoje sem `event_id` em alguns eventos → alinhar para casar com CAPI.
- **Verificação:** Events Manager mostra dedup (não dobra contagem) em Purchase/Lead/IC.

## B5 — Versionar schema (DDL) das tabelas untracked
**Onde:** `supabase/migrations/`.
- Criar migrations `CREATE TABLE IF NOT EXISTS` (idempotentes, não-destrutivas) refletindo o DDL VIVO de `tracking_sessions` e `quiz_funnel_events` (capturar via `pg_get_… ` / `information_schema`). Adicionar índices: `leads.external_id`, `purchases.src`.
- **Verificação:** rodar a migration no prod é no-op (tabelas já existem); índices criados (`CREATE INDEX IF NOT EXISTS`).

## B6 — Lead + InitiateCheckout no CAPI (par browser+servidor)
**Onde:** edge `track-event` (servidor) + pixels existentes (browser).
- Disparar Lead e InitiateCheckout TAMBÉM no servidor, reusando `external_id`+IP+UA+fbp/fbc.
- `event_id`: Lead = `lead_<external_id>`; IC = `ic_<external_id>_<scope>` — casado com o browser (sem inflar).
- **Verificação:** Events Manager mostra Lead/IC com origem browser+server e dedup correto.

**Critério de pronto B:** ver spec §4 Frente B. Medir contra baseline A.

---

# FRENTE D — Dashboard de gargalos (funil por JOIN, filtra is_test)

**Objetivo:** funil sólido que liga lead→venda pela espinha de identidade, **sem UNION de coortes disjuntas**.
**Depende de:** B (identidade populada). Sem `external_id` em leads/compras o JOIN fica vazio.

## D1 — Novo RPC `analytics_bottleneck_funnel` (NÃO mexer em `analytics_full_funnel`)
- Funil por `COUNT(DISTINCT external_id)` em subconjuntos ligados por JOIN em `external_id`:
  - LP/Quiz view → quiz start → quiz complete (lead) → initiate checkout → purchase confirmada.
- Filtrar `is_test = false` em toda fonte que tem a coluna (`quiz_funnel_events`, `leads`, `purchases`/`vendas_reais`).
- Receita real-only via `vendas_reais`; mídia Meta-rotulada exibida lado a lado, reconciliada por `order_id` (**nunca somada**).
- SECURITY DEFINER, EXECUTE só `service_role` (padrão dos RPCs financeiros).
- Migration versionada + aplicada via `sb-query.mjs`.

## D2 — Server fn + UI no admin
- `assertAdmin` + service_role → expõe o RPC.
- UI: cada etapa com número + drop entre etapas (mesma coorte).
- **Verificação:** bate com `/admin/vendas` e `/admin/leads`; drop faz sentido (não mistura universos).

## D3 — Gap do ramo checkout
- `checkout.checkout_funnel_events` **não tem `is_test`** → marcar sessões de teste no checkout é pré-requisito (TODO do dono). Até lá, etapa de checkout do funil usa `quiz_funnel_events`/`purchases` (que têm is_test).

**Critério de pronto D:** ver spec §4 Frente D.

---

# FRENTE C — Eventos finos + compras in-app plugáveis (por último)

**Objetivo:** eventos custom com identidade; modelo de compra in-app documentado e plugável.
**Depende de:** B (espinha) + D (funil).

## C1 — Eventos finos nas páginas
- scroll depth, tempo em página, micro-conversões — reusando `getOrCreateExternalId()` + edge `track-event`.
- Volume alto, baixo valor → só Pixel/edge, sem dobrar no CAPI (exceto se virar evento-chave).

## C2 — Compras in-app (futuro)
- Mesmo `external_id`; `event_id` único por cobrança (`order_id`+`charge_n`); `action_source` coerente.
- Documentar contrato do evento de compra in-app (campos, dedup, idempotência).

**Critério de pronto C:** ver spec §4 Frente C.

---

# Ordem de execução e guardrails
1. **A** (medir) → **B** (fundação) → **D** (dashboard) → **C** (avançado). A não bloqueia B1.
2. Cada mudança: reproduzir → mínimo → aplicar → **verificar resultado real** → só então prosseguir. Falhou → reverter, registrar, não empilhar.
3. Nunca destrutivo em dados reais. Teste em banco: transação `BEGIN…ROLLBACK` ou `is_test`.
4. Dedup sem dupla contagem: todo evento browser+servidor com mesmo `event_id`.
5. Commits granulares no clone certo (LP em `~/rotina-de-paz`, app em este repo, quiz em `~/Quiz-sacra`).
6. Deploy só após build verde + verificação. LP/Quiz via wrangler; App via Vercel. Quiz não pode cair (pipeline unificado).
7. Log contínuo em `docs/PROGRESS-AUTONOMO-2026-06-30.md`.
