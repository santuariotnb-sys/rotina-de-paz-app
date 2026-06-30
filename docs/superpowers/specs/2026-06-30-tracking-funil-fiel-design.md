# Design — Tracking & Atribuição 100% Fiéis do Funil Rotina de Paz

**Data:** 2026-06-30
**Status:** Aprovado (direção) — aguarda revisão do spec
**Escopo:** Quiz-Sacra → LP → checkout (Kirvano) → App (liberação + compras futuras in-app)
**Objetivo de negócio:** dados de tráfego/eventos/vendas 100% reais e fiéis, sem inflar, com deduplicação correta e alta pontuação de qualidade (EMQ), para decidir oferta e tráfego com confiança.

---

## 1. Problema

A operação depende dos dados do funil para decidir oferta e tráfego, mas hoje os dados **mentem em pontos específicos** (confirmado por auditoria multi-agente 2026-06-30 + verificação adversarial com dados reais do Supabase):

1. **Identidade fragmentada.** Cada superfície tem seu ID e eles não se ligam. `external_id` presente em só **7/136 leads** e **0/9 vendas** têm sessão de tracking ligada. Sem espinha de identidade, a atribuição lead→venda é cega.
2. **Captura server-side ausente.** `client_ip` é **null em 45/45 sessões**; o Pixel não lê IP/UA de forma confiável. EMQ fica em "médio".
3. **Funil falso.** `analytics_full_funnel` cola coortes disjuntas com `UNION ALL` (não JOIN) — o drop quiz→checkout é entre universos que não se conectam. Nenhum funil liga-se a `vendas_reais`/`leads_reais`.
4. **Bugs ativos** distorcem a operação hoje (revoke quebrado, CSV 100× errado, funis contando teste).

**Princípio-guia:** *beacon ≠ atribuição ≠ receita*. Os três são fontes distintas e só podem ser reconciliados por chave, nunca somados.

---

## 2. Arquitetura-alvo (5 pilares)

### Pilar 1 — Espinha de identidade única
- `external_id` próprio no formato `rp_<uuid>`, gerado no **primeiro toque** (Quiz ou LP).
- Persistido em **cookie first-party em `.rotinadepaz.com.br`** (compartilha entre quiz e LP, mesmo eTLD+1) + `localStorage` como backup.
- Capturar `fbclid` cedo e persistir junto.
- Presente em **100% dos eventos**, Pixel e CAPI.
- É a coluna que liga: lead → sessão → checkout → venda → entitlement no app.

### Pilar 2 — Captura server-side de sinais
- IP real (`CF-Connecting-IP` / `X-Forwarded-For`) + `User-Agent` capturados **no servidor** (edge function de tracking + webhook), amarrados ao `external_id`.
- Pixel não acessa IP/UA confiavelmente → server é a fonte.
- Grava em `tracking_sessions` com `client_ip` populado (hoje sempre null).

### Pilar 3 — Deduplicação correta
- Mesmo `event_name` + mesmo `event_id`, janela **48h**, `action_source` coerente.
- **`event_id` no mesmo nível** de `event_name`/`event_time` no payload (senão dedup quebra).
- **Regra de ouro p/ compra:** `event_id` derivado do **`order_id` da Kirvano** — resolve de uma vez: dedup Pixel↔CAPI, idempotência de retry CAPI, e webhook duplicado.
- Recorrente/in-app: `event_id` único por cobrança (`order_id`+`charge_n`).

#### Cobertura de eventos browser+servidor (resiliência a ad-blocker/iOS)
Eventos só-Pixel somem quando bloqueador/iOS mata o client. Para o funil não subnotificar, os eventos-chave ganham **par browser+servidor** com `event_id` casado:

| Evento | Browser (Pixel) | Servidor (CAPI) | `event_id` |
|---|---|---|---|
| PageView / QuizStep | ✅ | — (volume alto, baixo valor) | — |
| **Lead** | ✅ | ✅ (novo) | `lead_<external_id>` |
| **InitiateCheckout** | ✅ | ✅ (novo) | `ic_<external_id>_<scope>` |
| **Purchase** | ✅ | ✅ (existe) | `<order_id>` |

O servidor de Lead/IC dispara da edge function de tracking (mesma que grava a sessão), reusando `external_id`+IP+UA+fbp/fbc — herda EMQ alto de graça.

### Pilar 4 — Travessia até o checkout (cross-domain)
- Kirvano é eTLD+1 diferente → cookie não viaja.
- Decorar o link de checkout (`<a href>` real) com `fbclid`/`fbp`/`fbc`/`external_id` na query.
- **Server-side stitching** no webhook: lookup por `external_id` (e fallback email-hash) para colar `fbp`/`fbc`/`ip` ao evento `Purchase`.
- Parte já existe (`utm.ts` decora URL; `meta-capi.server.ts` lê cookies do payload). Falta fechar a gravação confiável da sessão.

### Pilar 5 — Fonte de verdade única, funil por JOIN
- Tabela de eventos canônica + identity stitching.
- Funil = `COUNT(DISTINCT external_id)` em subconjuntos ligados por identidade (JOIN), **nunca `UNION ALL`** de coortes disjuntas.
- Filtrar `is_test` em todas as etapas.
- Receita = real-only (`vendas_reais`, via webhook). Mídia = Meta-rotulada. Reconciliar por `order_id` — **nunca somar**.

### Regras de ouro (hashing / parâmetros)
- `em`/`ph`/`external_id` = SHA-256 normalizado.
- `fbp`/`fbc`/`fbclid`/`ip`/`ua` = **texto puro, NUNCA hashear**.
- `fbc` só quando há `fbclid` — não inventar.
- Prioridade EMQ: `em`,`ph`,`external_id`,`fbc`,`fbp` (alto) > nome/geo (médio) > `ip`/`ua` (suporte, só server).
- `test_event_code` só em dev — remover em produção.

> Fonte das regras: `docs/PESQUISA-BEST-PRACTICES-TRACKING-2026-06-30.md` (com links Meta oficiais).
> Limitação conhecida: a Meta não publica os pesos numéricos exatos do EMQ; a prioridade acima é a hierarquia documentada qualitativamente.

---

## 3. Gap analysis (onde estamos × alvo)

| Pilar | Estado hoje | Gap |
|---|---|---|
| 1 Identidade | `external_id` existe no quiz (localStorage `rdp_external_id`), mas não é cookie de domínio raiz; 7/136 leads, 0/9 vendas ligadas | Promover a cookie `.rotinadepaz.com.br`; garantir propagação 100% |
| 2 Server-side | `tracking_sessions` gravado client-side pelo quiz; `client_ip` 0/45 | Gravar sessão server-side (edge/webhook) com `client_ip`+UA |
| 3 Dedup | CAPI usa `event_id=transaction_id`; Pixel da LP sem `event_id` | Unificar em `order_id`; alinhar Pixel↔CAPI; nível do payload |
| 4 Travessia | `utm.ts` decora URL; CAPI lê cookies do payload (mitigação parcial) | Fechar gravação de sessão + stitching robusto no webhook |
| 5 Funil | `analytics_full_funnel` = `UNION ALL`; join divergente (`buyer_email` vs `external_id=src`) | Reescrever por JOIN, filtrar `is_test`, ligar a `vendas_reais` |

**Onde mora o conserto:** majoritariamente no **Quiz-Sacra** (`~/Quiz-sacra`) e na fronteira do checkout — é onde os dados nascem. O CAPI do app (`meta-capi.server.ts`) já está sólido.

---

## 4. Roadmap faseado

### Sprint 0 — Bugs ativos (cirúrgico, ~1 dia)
Itens que distorcem a operação/segurança HOJE, antes das frentes:

1. **Revoke manual quebrado** — `admin.acessos.tsx:67`, `admin.membros.tsx:332` gravam `status='revoked'`, valor FORA do CHECK de `entitlements` (`active|refunded|canceled|pending`). UPDATE viola constraint → quem o dono revoga **continua com acesso**. Fix: trocar para `'canceled'` (já válido). [Confirmar antes se o CHECK foi alterado direto no prod.]
2. **CSV Top Segmentos 100× errado** — `admin.analytics.tsx:124-125` (×100 no conv_rate, ÷100 na receita só no export; a tela está certa).
3. **Funis não filtram `is_test`** — `quiz_funnel_events` tem a coluna; eventos de teste inflam etapas.
4. **Grants residuais** — `tracking_sessions` + `quiz_funnel_events` com `GRANT SELECT TO authenticated` (qualquer logado lê fbp/fbc de todos). Fechar como nas views de 2026-06-29.

**Critério de pronto:** revoke corta acesso de fato; CSV bate com a tela; funis ignoram teste; grants fechados. Migrations com timestamp; tsc/lint limpos.

### Frente A — Medir a verdade atual (sem mudar arquitetura)
- Validar no Events Manager que o pixel `863734499693171` recebe (browser + CAPI).
- Medir **cobertura CAPI** (já exposta em `admin.webhooks` via `capi_status`) e **EMQ** atual.
- Confirmar cada venda → CAPI. Documentar o número de partida.

**Critério de pronto:** relatório com cobertura CAPI % e faixa de EMQ real; lista dos eventos que chegam e dos que faltam.

### Frente B — Fundação: tráfego 100% fiel
Implementa os 5 pilares. Maior parte no Quiz-Sacra + fronteira do checkout.

- **B1 Identidade:** promover `external_id` a cookie `.rotinadepaz.com.br`; garantir geração no 1º toque em quiz E LP; propagar em todos os eventos e na URL de checkout.
- **B2 Sessão server-side:** gravar `tracking_sessions` no servidor (edge function) com `client_ip` (`CF-Connecting-IP`) + UA; idempotente por `external_id`.
- **B3 Stitching no webhook:** lookup por `external_id` (fallback email-hash) para colar fbp/fbc/ip ao `Purchase`; `event_id` = `order_id`.
- **B4 Dedup Pixel↔CAPI:** alinhar `event_id` entre browser e server onde houver evento duplicado; garantir nível correto no payload.
- **B5 Schema/DDL:** versionar nas migrations as tabelas que hoje vivem "untracked" (`tracking_sessions`, `quiz_funnel_events`) para reprodutibilidade; índices em `leads.external_id` e `purchases.src`.
- **B6 Lead + InitiateCheckout no CAPI:** dobrar os dois eventos de topo no servidor (edge function de tracking), além do Pixel, com `event_id` casado (`lead_<external_id>` / `ic_<external_id>_<scope>`). Reusa `external_id`+IP+UA+fbp/fbc → EMQ alto. Resistente a ad-blocker/iOS; sem dupla contagem (mesmo `event_id`).

**Critério de pronto:** nova venda de teste carrega `external_id`+fbp/fbc+ip; `client_ip` deixa de ser null; EMQ sobe vs. baseline da Frente A; atribuição lead→venda fecha; Lead/IC aparecem no Events Manager com dedup browser+servidor (sem inflar).

### Frente D — Dashboard de gargalos (depende de B)
- Funil SÓLIDO: JOIN real por `external_id`, filtra `is_test`, liga a `vendas_reais`/`leads_reais`. **NÃO** sobre `analytics_full_funnel`.
- Etapas: LP/Quiz view → quiz start → quiz complete (lead) → initiate checkout → purchase confirmada.
- Receita real-only; mídia Meta-rotulada exibida lado a lado (reconciliada por `order_id`, nunca somada).
- Exposto por server fn (`assertAdmin` + service_role).

**Critério de pronto:** cada etapa com número confiável; drop entre etapas faz sentido (mesma coorte); bate com `/admin/vendas` e `/admin/leads`.

### Frente C — Tracking avançado + in-app (por último)
- Eventos finos nas páginas (scroll, tempo, micro-conversões) reusando a espinha.
- Preparar **compras futuras dentro do app**: mesmo `external_id`, `event_id` único por cobrança, `action_source` coerente.

**Critério de pronto:** eventos custom chegam ao Events Manager com identidade; modelo de compra in-app documentado e plugável.

---

## 5. Não-objetivos (YAGNI)
- Não construir métricas de mídia paga (spend/CTR/CPC/ROAS) dentro deste app — isso é do Primórdia Digital (projeto separado).
- Não rotacionar o token CAPI (decisão do dono — risco aceito e formalizado).
- Não refatorar o admin além do necessário para fidelidade de dados.
- Não migrar para SDK oficial da Meta — o `fetch` cru atual atende.

## 6. Riscos
- **Cross-domain Kirvano:** se a decoração de link + stitching falhar, fbp/fbc ficam só no fallback. Mitigação: testar venda real ponta-a-ponta na Frente B.
- **Schema drift:** tabelas untracked podem divergir entre prod e migrations. Mitigação: B5 versiona o DDL.
- **Mudanças no Quiz-Sacra (repo separado):** deploy via Cloudflare Pages (`deploy.sh`), não Vercel. Validar em preview antes de `--prod`.
- **Token exposto no chat:** aceito pelo dono; documentado.

## 7. Critério de sucesso global
Uma venda nova de teste, ponta-a-ponta, produz: lead ligado por `external_id`, sessão com `client_ip`+fbp/fbc, `Purchase` deduplicado (Pixel↔CAPI, `event_id`=`order_id`), EMQ alto no Events Manager, e aparição correta em todas as etapas do dashboard de gargalos — sem inflar, batendo com `vendas_reais`.
