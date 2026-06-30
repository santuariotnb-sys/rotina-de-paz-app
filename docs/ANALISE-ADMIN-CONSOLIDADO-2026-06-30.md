# Admin Rotina de Paz — Consolidação da Auditoria (2026-06-30)

Síntese de 5 análises fiéis (com `arquivo:linha`). Documentos-fonte:
- `ANALISE-ADMIN-ESTRUTURA-2026-06-30.md` — visão geral
- `ANALISE-ADMIN-ROTAS-2026-06-30.md` — 18 rotas + fluxo de dados + auth
- `ANALISE-ADMIN-ANALYTICS-2026-06-30.md` — RPCs, fórmulas, fidelidade
- `ANALISE-ADMIN-DATAMODEL-2026-06-30.md` — schema, constraints, integridade
- `ANALISE-ADMIN-LIBERACAO-2026-06-30.md` — webhook→entitlement→CAPI→acesso

## Como o admin funciona (resumo)
Central que o dono controla solo: vendas, leads, liberação de produtos no app.
- **Fonte de verdade:** views `vendas_reais`/`leads_reais` (`confirmed` + `is_test=false` + pós `production_start_at='2026-06-08'`); receita = `receita_real()` (Σ `gross_value/100`).
- **Join canônico lead↔venda:** `leads.external_id = purchases.src` (sem FK).
- **Acesso a dados:** leituras CLIENT (browser, RLS `is_admin`) + server fn (`requireSupabaseAuth`+`assertAdmin`+service_role). RPCs `analytics_*` = SECURITY DEFINER, service_role-only. Guard de UI só client-side (`admin.tsx` useEffect) — sem loader.
- **Liberação:** AUTO (webhook Kirvano → `processKirvanoPayload` → upsert idempotente `entitlements` status='active' onConflict user_id,product_id + cria conta + grava purchase + CAPI) e MANUAL (RPC `grant_entitlement_manual`, exige conta existente; revoke = UPDATE direto). Acesso via `has_entitlement()` (`status='active'`) + `required_product_id`.
- **CAPI:** Purchase, `event_id=transaction_id` (dedup), pixel/token do env (863734499693171 novo); em/ph/fn/ln/external_id do payload Kirvano; **fbp/fbc/client_ip/ua de `tracking_sessions WHERE external_id=src`**; retry horário (5x).

## Issues priorizadas (deduplicadas entre os 4 auditores)

### 🔴 CRÍTICO — bugs ativos
1. **Revoke manual quebrado.** `admin.acessos.tsx:67` e `admin.membros.tsx:332` gravam `status='revoked'`, valor FORA do CHECK `entitlements.status` (`20260528111216:72` = active|refunded|canceled|pending). UPDATE viola constraint → **quem o dono revoga manualmente continua com acesso** (`has_entitlement` só corta se status≠active). Fix: trocar código p/ `'canceled'` (já válido) OU `ALTER TABLE ADD 'revoked'`. [confirmar se o CHECK foi alterado direto no prod]
2. **CSV de Top Segmentos 100× errado.** `admin.analytics.tsx:124-125` multiplica conv_rate% ×100 e divide receita ÷100 no export (a tela está certa). Relatórios exportados mentem.

### 🔴 ALTO — fidelidade de dados (bloqueia a frente D / dashboard)
3. **`analytics_full_funnel` cola coortes disjuntas com `UNION ALL`, não JOIN** (`20260617:144`). Quiz e checkout têm `session_id` de apps distintos; drop quiz→checkout é entre universos que não se conectam → sem sentido. Nenhum dos 3 funis liga-se a `leads_reais`/`vendas_reais`. "beacon ≠ atribuição ≠ receita."
4. **Furos de atribuição (frente B).** `src↔tracking_session = 0/9` nas vendas + `client_ip` sempre null. Causa raiz: **este app NÃO grava `tracking_sessions`** — o writer é o **Quiz-Sacra**; e o `upsert_tracking_session` versionado aqui (`20260605_hardening_rpcs.sql:107`) insere sem `client_ip`. CAPI acha `ts=null` → fbp/fbc/ip MISSING → EMQ médio. **O conserto mora majoritariamente no Quiz.**
5. **Join divergente:** `analytics_funnel` (`20260617:246`) usa `DISTINCT buyer_email`; todo o resto usa `external_id=src` → "quantos compraram" muda entre `/admin/analytics` e `/admin/quiz`+`/admin/tracking`.
6. **Funis não filtram `is_test`** (`quiz_funnel_events` tem a coluna, `20260616:9`) → eventos de teste inflam etapas.

### 🟠 SEGURANÇA (residual / defesa em profundidade)
7. `tracking_sessions` + `quiz_funnel_events` com `GRANT SELECT TO authenticated` → qualquer usuário logado lê fbp/fbc/fbclid de todos. (Mesmo padrão das views que fechamos em 2026-06-29.)
8. Webhook Kirvano processa payload **sem assinatura HMAC** (`kirvano.ts:123`, fail-open) — mas o url-secret `?k=` barra antes.
9. Rotas admin sem guard `is_admin` no loader (proteção 100% RLS/assertAdmin).

### 🟡 ROBUSTEZ / OPS
10. **Schema drift:** `tracking_sessions`/`quiz_funnel_events`/`checkout.checkout_funnel_events` existem em prod **sem DDL nas migrations** (vivem no Quiz / untracked) → `db reset` quebra. Reprodutibilidade em risco.
11. Faltam índices em `leads.external_id` e `purchases.src` (todo JOIN de analytics) → seq scan com crescimento.
12. Joins frágeis sem FK (`purchases.src→leads.external_id`, etc.).
13. Menores: `decline` morto (`admin.quiz.tsx:289`); `purchases.external_id` sem uso; `is_admin()` por-linha nas policies RLS.

## Implicações para o plano (frentes A→B→D→C)
- **Sprint 0 (bugs ativos, baratos, antes das frentes):** #1 revoke, #2 CSV, #6 is_test, #7 grants. Itens cirúrgicos que distorcem a operação/segurança hoje.
- **A — validar envios:** Events Manager (pixel 863) + webhooks; o CAPI em si é sólido (dedup + retry). Medir EMQ.
- **B — 100% tráfego (PRÉ-REQUISITO de D):** consertar a gravação de `tracking_sessions` (server-side + `client_ip`) e o fluxo de `external_id` quiz→Kirvano `src`. **Conserto mora no Quiz-Sacra + fronteira.**
- **D — dashboard de gargalos:** SÓ depois de B. Construir funil SÓLIDO (JOIN real, filtra is_test, liga a `vendas_reais`), plugado nas views canônicas — **NÃO** sobre o `analytics_full_funnel` furado.
- **C — tracking avançado:** por último.
