# Auditoria Autônoma Consolidada — Tracking & Funil Fiel

**Data:** 2026-06-30
**Tipo:** READ-ONLY (banco prod Supabase `cemjibbauvvyfaxilrvm`, compartilhado com Quiz/Sacra)
**Escopo:** 5 superfícies auditadas em paralelo — LP, Quiz-Sacra, App, Admin, Tracking/CAPI
**Spec de referência:** `docs/superpowers/specs/2026-06-30-tracking-funil-fiel-design.md`
**Docs-fonte por superfície:**
- `docs/AUDIT-AUTONOMO-lp-2026-06-30.md`
- `docs/AUDIT-AUTONOMO-quiz-sacra.md`
- `docs/AUDIT-AUTONOMO-app-2026-06-30.md`
- `docs/AUDIT-AUTONOMO-admin.md`
- `docs/AUDIT-AUTONOMO-tracking-capi.md`

---

## 1. Visão geral

O sistema **coleta** dados mas **não os conecta**. A infraestrutura (colunas, RPCs, views canônicas, CAPI server-side, dedup por `order_id`) está majoritariamente pronta e bem desenhada — mas a **espinha de identidade (`external_id`) não é populada em produção**, o **IP server-side nunca é capturado**, e parte dos relatórios **conta dados de teste** e **junta coortes disjuntas por UNION** em vez de JOIN. O resultado é um funil que não fecha lead→venda e métricas incompatíveis com decisão operacional.

**Quadro-resumo (números reais do prod, últimos 30 dias):**

| Sinal | Estado real | Alvo |
|---|---|---|
| `external_id` em leads | ~6% (8/137) | 100% |
| `external_id`/`src` em compras | 0% (0/23) | 100% |
| `client_ip` em `tracking_sessions` | 0% (0/67) | 100% server-side |
| `external_id` em `tracking_sessions` | 100% (67/67, gerado no Quiz) | 100% (propagar p/ leads+compras) |
| `fbp` / `fbc` em sessões | 31% / 40% | alto onde houver fbclid |
| Cobertura CAPI Purchase | 24% enviado (4/17), 76% pendente | ~100% |
| Atribuição lead→venda (linked) | 5 de 23 vendas | ~100% |
| Dedup Purchase (event_id=order_id) | ✅ sólido | mantido |
| Funis filtram `is_test` | ❌ nenhum dos 3 RPCs | todos |

**Estado por superfície:**
- **LP** — 🔴 Crítico. Identidade fragmentada, sem captura server-side, Pixel sem `event_id`, checkout Kirvano sem stitching de fbp/fbc/external_id.
- **Quiz-Sacra** — 🟡/🔴. Identidade gerada e 100% em sessões, mas não persiste em leads históricos; Lead só dispara no Pixel (sem backup CAPI); contact gate subutilizado.
- **App** — 🟡 Bom com gaps. Segurança sólida, joins por `external_id=src` corretos, views canônicas filtram is_test; falta captura de IP e a propagação 100% depende do Quiz.
- **Admin** — 🟡. Bugs #1/#4 já corrigidos; #2 (CSV) e #3 (funis com teste) pendentes; schema drift em `quiz_funnel_events`.
- **Tracking/CAPI** — 🔴. Os 5 gaps centrais concentram-se aqui: identidade, IP, cobertura CAPI, funil por JOIN, dados de teste.

---

## 2. Achados por severidade

### CRÍTICO

1. **Espinha de identidade não populada.** `external_id` em ~6% dos leads e 0% das compras; `purchases.src` carrega valor mas `external_id` fica nulo (nomenclatura inconsistente). Sem isto, atribuição lead→venda e dedup Pixel↔CAPI são impossíveis. *(LP, Quiz, App, Admin, Tracking)*
2. **Captura server-side ausente — `client_ip` 0/67.** EMQ degrada para "médio"; Meta não consegue matchear por IP. Edge function de tracking com `CF-Connecting-IP` não implementada. *(todas)*
3. **Cobertura CAPI incompleta — 4/17 Purchases enviados (24%).** 13 webhooks `SALE_APPROVED` com `capi_status=null` aguardando o cron `capi-retry`. Sem eles, dedup browser↔servidor fica incompleta. *(Tracking/CAPI)*
4. **Revoke de entitlements quebrado — JÁ CORRIGIDO.** CHECK de `entitlements` sem `'revoked'` + mutation sem `onError` deixava acesso ativo após revogação. Migration `20260630_entitlements_allow_revoked_status.sql` + `.select()` guard. *(App, Admin)*
5. **Vazamento RLS de analytics — JÁ CORRIGIDO (2026-06-29).** RPCs de analytics e views (`vendas_reais`/`leads_reais`) revogadas de anon/auth, movidas para service_role + `security_invoker`. *(App, Admin)*

### ALTO

6. **Cookie domínio-raiz não implementado.** `external_id` do Quiz (`qs_<uuid>`/`rdp_external_id` em localStorage) não viaja para a LP nem para o checkout via cookie `.rotinadepaz.com.br`. Quebra a continuidade Quiz→LP→Kirvano. *(LP, Tracking)*
7. **Funil por UNION, não JOIN.** `analytics_full_funnel` cola coortes disjuntas com `UNION ALL`; drop entre etapas é entre universos não conectados. Não liga a `vendas_reais`/`leads_reais`. *(LP, Admin, Tracking)*
8. **Lead/InitiateCheckout sem par CAPI.** Hoje só Pixel; iOS/adblocker matam o client. Spec B6 pede dobrar no servidor com `event_id` casado (`lead_<external_id>` / `ic_<external_id>_<scope>`). *(Quiz, App)*
9. **Dados de teste não filtrados nos funis.** `is_test` existe em `quiz_funnel_events` (1969 reais, 0 teste hoje — mas histórico mistura) mas **nenhum** dos 3 RPCs de funil filtra. Compras: 4/23 são teste. *(LP, Quiz, App, Admin, Tracking)*
10. **`fbclid` inconsistente.** Leads têm fbclid (UTM parser), compras não; webhook de Purchase não carrega fbclid da URL de checkout → `fbc` não construído → EMQ cai. *(LP)*

### MÉDIO

11. **CSV Top Segmentos 100× errado.** `admin.analytics.tsx:124-125` reescala `conv_rate` (×100) e `revenue` (÷100) que o RPC **já** retorna escalados. Tela correta; só o export erra. *(App, Admin)*
12. **Dedup ausente em eventos de quiz.** `quiz_funnel_events` sem `event_id`; dedup só por `session_id+stage` → risco de dupla contagem em retry. *(Admin, Tracking)*
13. **Schema não-versionado.** `tracking_sessions` e `quiz_funnel_events` existem em prod sem DDL em `supabase/migrations/` → risco de drift. *(Admin, Tracking)*
14. **`processed_events` vazia.** Tabela de reconciliação CAPI/EMQ criada mas nunca alimentada → sem dashboard de cobertura EMQ. *(Tracking)*
15. **Stitching parcial.** `meta-capi.server.ts` faz lookup por `external_id` + fallback fbclid, mas fbp/fbc só existem em 31-40% das sessões → sinal reduzido. *(App, Tracking)*
16. **Contact gate subutilizado.** 3 eventos `contact` vs 743 `arrival` (~0.35%); usuários pulam. *(Quiz)*

### BAIXO / SÓLIDO (sem ação)

- Dedup de Purchase (`event_id=order_id`, janela 48h, idempotência de retry) — sólido.
- Controle de acesso ao admin (`assertAdmin`, service_role gates, webhook URL-secret timing-safe) — sólido pós-hardening.
- Coerência das views canônicas (`vendas_reais`/`leads_reais` filtram is_test + production_start_at) e RPCs que as usam (`analytics_funnel`, `analytics_top_segments`, `analytics_quiz_conversion`, `analytics_cohort_weekly`) — boa.

---

## 3. Gap vs arquitetura-alvo (5 pilares)

| Pilar | Estado hoje | Gap |
|---|---|---|
| **1 Identidade única `external_id`** | Gerado no Quiz (localStorage), 100% em sessões; ~6% leads, 0% compras | Cookie `.rotinadepaz.com.br`; geração 1º toque em Quiz E LP; propagar 100% em eventos + URL checkout; unificar `src`↔`external_id` |
| **2 Sinais server-side** | `user_agent` 100%; `client_ip` 0%; fbp/fbc 31-40% | Edge function grava `client_ip` (CF-Connecting-IP) + UA por `external_id` |
| **3 Dedup por `event_id`** | Purchase ✅ (`order_id`); Pixel LP sem event_id; Lead/IC só Pixel | event_id no nível do payload; par browser+servidor Lead/IC; alinhar Pixel↔CAPI |
| **4 Travessia Kirvano** | `utm.ts` decora URL; CAPI lê cookies do payload | Decorar `<a href>` com fbp/fbc/external_id; stitching robusto no webhook |
| **5 Fonte única, funil por JOIN** | `analytics_full_funnel`=UNION; não filtra is_test; não liga a vendas_reais | Reescrever por JOIN em `external_id`; `COUNT(DISTINCT external_id)`; filtrar is_test; receita real-only |

**Onde mora o conserto:** majoritariamente no **Quiz-Sacra** (`~/Quiz-sacra`) e na fronteira do checkout — onde os dados nascem. O CAPI do app (`meta-capi.server.ts`) já está sólido.

---

## 4. Coerência e rastreabilidade dos dados (incl. dados de teste)

**Rastreabilidade (end-to-end):** quebrada. A cadeia `quiz_responses → lead → tracking_session → checkout → purchase → entitlement` tem todas as peças mas o elo de identidade (`external_id`) só está populado em `tracking_sessions`. `quiz_responses` tem 100% de `lead_id`, mas `leads.external_id` é nulo em ~94% → respostas não rastreáveis até a venda. Vendas: 65% órfãs (sem `lead_id`), 0% com `src`/`external_id`.

**Coerência:**
- ✅ Views canônicas (`vendas_reais`, `leads_reais`) filtram `is_test=false` + `production_start_at` corretamente; RPCs financeiros usam-nas.
- ❌ Os 3 RPCs de funil (`analytics_quiz_funnel`, `analytics_checkout_funnel`, `analytics_full_funnel`) **não** filtram `is_test` e usam `quiz_funnel_events`/`checkout.checkout_funnel_events` direto.
- ❌ `analytics_full_funnel` usa UNION (coortes disjuntas) — `COUNT(DISTINCT email)` em leads ≠ `COUNT(DISTINCT buyer_email)` em compras; drop entre etapas não reflete o funil real.

**Dados de teste (`is_test`):**
- Coluna presente em `leads`, `purchases`, `vendas_reais`, `quiz_funnel_events`.
- `quiz_funnel_events`: 1969 reais / 0 teste no recorte atual — mas histórico mistura e os RPCs não filtram.
- `purchases`: 4/23 são teste (17%).
- ⚠️ `checkout.checkout_funnel_events` **não tem coluna `is_test`** (nem PII; só `session_id/stage/payment_method/created_at`). Logo o filtro is_test aplica-se apenas às fontes `quiz_funnel_events`; o ramo de checkout fica sem marcador de teste — gap a tratar fora do Sprint 0 (marcar sessões de teste no checkout).

---

## 5. Estado de segurança (RLS / grants) — verificado ao vivo

- `tracking_sessions`: RLS **ON**; única policy = `service_role_all` (qual `true`). anon/authenticated **negados por RLS** (sem policy permissiva). Porém ainda carregam `GRANT SELECT, REFERENCES` residual.
- `quiz_funnel_events`: RLS **ON**; **0 policies** → anon/authenticated negados por RLS. Também carregam `GRANT SELECT, REFERENCES` residual.
- Nenhuma das duas tem grant de escrita (INSERT/UPDATE/DELETE) para anon/auth — escrita via RPC `upsert_tracking_session` (service_role).

➡️ **Conclusão:** o vazamento que a auditoria temia já está **mitigado pela RLS**, mas o `GRANT SELECT` residual é cruft real e um footgun para qualquer policy permissiva futura. Revogar (Bug #4) alinha ao hardening de 2026-06-29 e é seguro (escrita via RPC, leitura via service_role).

---

## 6. Próximos passos

Ver Sprint 0 priorizado no fim da resposta do sintetizador e o log em `docs/PROGRESS-AUTONOMO-2026-06-30.md`. Ordem do roadmap: **Sprint 0** (#2, #3, #4) → **A** (medir EMQ/cobertura) → **B** (identidade + IP/UA + stitching + Lead/IC CAPI) → **D** (dashboard por JOIN) → **C** (eventos finos + in-app).
