# Auditoria FIEL da camada de ANALYTICS — Admin "Rotina de Paz" / Primordia

**Data:** 2026-06-30
**Repo:** `/Users/guilhermehenrique/rotina-de-paz-app` (produção/Vercel)
**Método:** leitura direta de `supabase/migrations/*.sql` + `src/lib/admin/*.functions.ts` + `src/routes/admin.*.tsx`. Toda linha tem `arquivo:linha`. Não-confirmado = **[NÃO VERIFICADO]**.
**Complementa:** `docs/ANALISE-ADMIN-ESTRUTURA-2026-06-30.md` (visão geral). Este doc vai mais fundo na lógica SQL de cada métrica.

---

## 0. Âncoras confirmadas

- **Views fonte-de-verdade** (`20260616_intelligence_is_test.sql:71-80`):
  `vendas_reais = purchases WHERE status='confirmed' AND is_test=false AND created_at >= production_start_at`;
  `leads_reais = leads WHERE is_test=false AND created_at >= production_start_at`. `production_start_at='2026-06-08T00:00:00Z'` (`:12-20`).
- **Receita:** `receita_real() = Σ vendas_reais.gross_value / 100` (R$) (`20260616_intelligence_is_test.sql:83-87`). *(RPC existe mas NÃO é consumida por nenhuma rota admin — confirmado por grep; overview soma a view direto.)*
- **Join canônico lead↔venda:** `leads.external_id = purchases.src` (qs_*). **CONFIRMADO** em top_segments/quiz_conversion/cohort/conversion. **EXCEÇÃO:** `analytics_funnel` junta por `buyer_email` (ver §1.2).
- **Segurança:** RPCs `analytics_*` de funil são `SECURITY DEFINER`, GRANT só `service_role` (`20260611_analytics_quiz_funnel.sql:90-93`, `revoke_analytics_grants.sql`). As 5 RPCs "avançadas" têm GRANT `authenticated`+`service_role` re-aplicado em `20260617_*.sql:331-337` para `analytics_funnel`/`top_segments` (server fn usa service_role; o GRANT a authenticated é redundante mas não-explorável porque RLS das views fecha PII — `20260629_fix_pii_leak_views.sql`). Todas chamadas via `createServerFn` + `requireSupabaseAuth` + `assertAdmin`.

> **Ordem de migration importa.** O estado FINAL de cada RPC é o da migration mais recente. Para `analytics_quiz_funnel` a versão vigente é **`20260617_fix_contact_gate_and_email_to_whatsapp.sql:56-139`** (sobrescreve `20260611`, `20260611_fix_today`, `20260616_fix_rpc`). Para `analytics_full_funnel`/`analytics_funnel`/`analytics_top_segments` o estado final é **`20260617`**. Para as outras 3 (revenue_breakdown, quiz_conversion, cohort) é **`20260616_fix_analytics_rpcs.sql`** (substitui `20260531`, que junta por email — legado).

---

## 1. Inventário de TODA RPC/função de analytics

### 1.1 `analytics_quiz_funnel(p_days int=30)` — Funil do Quiz (coorte única)
- **Def vigente:** `20260617_fix_contact_gate_and_email_to_whatsapp.sql:56-139`.
- **Retorno:** `(stage text, label text, reached bigint, drop_pct numeric)`.
- **Fonte:** **só** `quiz_funnel_events` (público). Coorte = `DISTINCT session_id`.
- **Etapas (sort_order):** arrival(1) → q_situacao(2) … q_desejo(8) [Q1–Q7] → contact_gate(9, `stage IN ('contact','contact_gate')`) → result(10) → offer(11) → cta(12, "Clicou comprar (IC)").
- **Filtros:** `created_at >= cutoff`. `cutoff = p_days=0 ? hoje 00h America/Sao_Paulo : now()-p_days`. **NÃO filtra `is_test`** (a coluna existe — `20260616_intelligence_is_test.sql:9`).
- **Fórmula drop:** `drop_pct = round((1 - reached/prev_reached)*100,1)` via `lag(reached) OVER (ORDER BY sort_order)`. Primeira etapa = 0.
- **Consumo:** `getQuizFunnel` (`quiz-funnel.functions.ts:14-27`) → `/admin/quiz` (`admin.quiz.tsx:120-124`). UI: KPIs (arrivals, completedQuiz=`q_desejo`, completionRate=`q_desejo/arrival`, whatsapp=`contact_gate`) + maior gargalo (`leakPoint`: maior drop_pct com prev.reached≥2) (`admin.quiz.tsx:246-273`).
- **Fidelidade:** ✅ funil internamente coerente (sempre decrescente, mesma coorte de sessão). ⚠️ **Mente em 3 pontos:**
  1. **`is_test` não filtrado** → sessões de teste/dev inflam todas as etapas. **[gap]**
  2. **`contact_gate` na posição 9 (depois de Q7, antes de result/offer)** mas o comentário do fix (`:100-101`) diz que no fluxo real WhatsApp vem antes de result — se a instrumentação real emitir `result`/`offer` ANTES de `contact_gate`, o `drop_pct` de `result` fica negativo (clampado a 0 pelo CASE) e o funil parece "subir". Ordem é assumida, não validada contra o emissor (quiz-sacra, repo separado). **[NÃO VERIFICADO o emissor]**
  3. `cta` = "InitiateCheckout" instrumentado, **não** é compra confirmada nem está ligado a `vendas_reais`.

### 1.2 `analytics_funnel(p_days int=30)` — Funil macro (Analytics Avançado)
- **Def vigente:** `20260617_*.sql:246-272` (DROP+CREATE; trocou `with_email`→`with_whatsapp`).
- **Retorno:** `(total_leads, with_archetype, with_whatsapp, purchasers, upsell_buyers, downsell_buyers, total_revenue)`.
- **Fonte:** `leads_reais` + `vendas_reais`, ambos filtrados `created_at >= now()-p_days`.
- **Fórmulas:** total_leads=`COUNT(*)`; with_archetype=`COUNT WHERE archetype IS NOT NULL`; with_whatsapp=`COUNT WHERE whatsapp IS NOT NULL`; **purchasers=`COUNT(DISTINCT buyer_email) WHERE product_type='principal'`**; upsell/downsell idem por tipo; total_revenue=`Σ gross_value/100`.
- **Consumo:** `getFunnel` (`analytics.functions.ts:35-55`) → `/admin/analytics` (`admin.analytics.tsx:71-108`). Funil visual "Leads→Quiz completo→Com WhatsApp→Compraram→Upsell→Downsell"; KPI "Taxa conversão = purchasers/total_leads".
- **Fidelidade:** ⚠️ **Divergência de método de join.** Aqui "Compraram" = compradores distintos por **`buyer_email`**, enquanto top_segments/cohort/conversion/tracking contam por **`external_id=src`**. Mesma pergunta ("quantos leads compraram?") dá **número diferente** entre `/admin/analytics` e `/admin/tracking` ou `/admin/quiz`. `buyer_email` conta TODOS os compradores do período (mesmo sem lead atribuído via quiz); `external_id=src` conta só os atribuídos. **[inconsistência confirmada]** As views já filtram is_test/baseline, então não infla por teste.

### 1.3 `analytics_top_segments(p_days int=30, p_min_leads int=20)` — Nicho Vencedor
- **Def vigente:** `20260617_*.sql:279-322` (`with_email`→`with_whatsapp`).
- **Retorno:** `(archetype, situation, desire, total_leads, with_whatsapp, purchasers, conv_rate, revenue)`.
- **Lógica:** `lead_data` = `leads_reais WHERE archetype IS NOT NULL AND created_at>=now()-p_days`. `purchase_agg` = `vendas_reais` agregado por `src` (`SUM(gross_value)`, evita fan-out de N compras/lead). `LEFT JOIN ld.external_id = pa.src`. `GROUP BY archetype,situation,desire HAVING COUNT(*)>=p_min_leads`.
- **Fórmulas:** purchasers=`COUNT(pa.src)`; **conv_rate=`round(purchasers/total_leads*100,1)` (já em %)**; revenue=`Σ pa.total_value/100` (R$); ordena `conv_rate DESC LIMIT 20`.
- **Consumo:** `getTopSegments` (`analytics.functions.ts:22-33`) → `/admin/analytics:235-295`.
- **Fidelidade:** ✅ join correto (external_id=src), is_test filtrado via views, anti-fan-out OK. ⚠️ **BUG DE EXIBIÇÃO no CSV:** a tabela mostra `{s.conv_rate}%` e `brl(s.revenue)` corretamente (`:282,287`), mas o **export CSV** faz `(s.conv_rate*100).toFixed(1)%` e `(s.revenue/100).toFixed(2)` (`admin.analytics.tsx:124,125`) — dupla-escala: conv_rate já vem em %, revenue já vem em R$. **CSV exporta conversão e receita 100× erradas.** **[bug confirmado]**

### 1.4 `analytics_revenue_breakdown(p_days int=30)` — Receita por produto
- **Def vigente:** `20260616_fix_analytics_rpcs.sql:83-105`.
- **Retorno:** `(product_name, product_type, sales, revenue, refunds)`.
- **Fonte:** **`purchases` CRU** (não a view), com filtro manual: `is_test=false AND created_at >= production_start_at AND created_at >= now()-p_days`.
- **Fórmulas:** sales=`COUNT FILTER(status='confirmed')`; revenue=`Σ gross_value FILTER(confirmed)/100`; **refunds=`COUNT FILTER(status='refunded')`**. Ordena `revenue DESC`.
- **Consumo:** `getRevenueBreakdown` (`analytics.functions.ts:57-68`) → `/admin/analytics:297-330` (cards por produto, com contagem de reembolsos).
- **Fidelidade:** ✅ é a **única** RPC que mostra reembolsos reais (lê `purchases` direto, não a view que só traz confirmed). Replica is_test+baseline na mão (em vez de usar a view) — funciona, mas é frágil: se o critério da view mudar, esta RPC fica dessincronizada. **[risco de drift, não bug hoje]**

### 1.5 `analytics_quiz_conversion(p_days int=30)` — Resposta de quiz × conversão
- **Def vigente:** `20260616_fix_analytics_rpcs.sql:108-136`.
- **Retorno:** `(question_key, answer_value, answer_text, total, converted, conv_rate)`.
- **Lógica:** `quiz_responses qr JOIN leads_reais l ON l.id=qr.lead_id LEFT JOIN vendas_reais p ON l.external_id=p.src`, `WHERE l.created_at>=now()-p_days AND qr.question_key IS NOT NULL`, `GROUP BY question_key,answer_value,answer_text`.
- **Fórmulas:** total=`COUNT(DISTINCT l.id)`; converted=`COUNT(DISTINCT l.id) FILTER(p.src IS NOT NULL)`; conv_rate=`round(converted/total*100,1)` (%). (O `DISTINCT l.id` + agregação por src evita fan-out.)
- **Consumo:** `getQuizConversion` (`analytics.functions.ts:70-81`) → `/admin/analytics:332-388` (barra por resposta, seletor de pergunta).
- **Fidelidade:** ✅ join e DISTINCT corretos. ⚠️ Mede "comprou alguma vez" (qualquer venda atribuída), não "comprou o produto principal".

### 1.6 `analytics_cohort_weekly(p_weeks int=12)` — Cohort semanal
- **Def vigente:** `20260616_fix_analytics_rpcs.sql:139-160`.
- **Retorno:** `(cohort_week date, leads, buyers, revenue, conv_pct)`.
- **Lógica:** `leads_reais l LEFT JOIN vendas_reais p ON l.external_id=p.src`, `WHERE l.created_at>=now()-p_weeks`, `GROUP BY date_trunc('week',l.created_at)`.
- **Fórmulas:** leads=`COUNT(DISTINCT l.id)`; buyers=`COUNT(DISTINCT p.src)`; revenue=`Σ gross_value/100`; conv_pct=`round(buyers/leads*100,1)`.
- **Consumo:** `getCohortWeekly` (`analytics.functions.ts:83-96`, `p_weeks=12` fixo) → `/admin/analytics:390-421` (barras leads vs compradores). **conv_pct e revenue não são renderizados** (só leads/buyers no gráfico).
- **Fidelidade:** ✅ join correto. Nota: a versão legada (`20260531:147`) tinha `WHERE l.archetype IS NOT NULL`; a vigente removeu esse filtro → cohort agora conta TODOS os leads_reais, não só os com arquétipo. Mudança de semântica silenciosa entre versões. **[mudança intencional, mas não documentada]**

### 1.7 `analytics_checkout_funnel(p_days int=30)` — Funil do checkout
- **Def:** `20260611_analytics_checkout_funnel.sql:16-70`.
- **Retorno:** `(stage,label,reached,drop_pct)`. **Fonte:** `checkout.checkout_funnel_events` (schema `checkout`). Coorte=`DISTINCT session_id`.
- **Etapas:** view→form_start→identity→method→payment_info→submit→purchase. `stages(...)` é VALUES + `LEFT JOIN raw_counts` → etapa sem evento vira `reached=0` (não some do funil).
- **Filtros:** `created_at >= cutoff` (mesmo padrão p_days=0=hoje SP). **NÃO há coluna is_test** em `checkout_funnel_events` (não foi adicionada). **[confirmado: sem is_test]**
- **Consumo:** `getCheckoutFunnel` (`checkout-funnel.functions.ts:18-30`) → `/admin/quiz:126-130`. KPIs: views, purchases, conversionRate=`purchase/view`, declines (`admin.quiz.tsx:275-301`).
- **Fidelidade:** ⚠️ `purchase` = evento de front, **não** = `vendas_reais`. Sem filtro is_test (mas a tabela não tem a coluna). `decline` é lido na UI mas **não existe na lista de stages da RPC** — `checkoutKpis.declines` busca `stage==='decline'` que a RPC nunca retorna → sempre 0/undefined. **[bug latente: decline morto]**

### 1.8 `analytics_full_funnel(p_days int=30)` — Funil ponta-a-ponta (quiz→checkout)
- **Def vigente:** `20260617_*.sql:144-239` (sobrescreve `20260611:82-178`).
- **Retorno:** `(stage,label,reached,drop_pct)`. **Fonte:** `quiz_funnel_events` + `checkout.checkout_funnel_events`, unidos por `UNION ALL` (NÃO por join de chave).
- **Etapas (sort_order 1-9):** q_arrival → q_q1(situacao) → q_q7(desejo) → q_contact(`IN('contact','contact_gate')`, label "Quiz · WhatsApp") → q_cta → c_view → c_identity → c_submit → c_purchase.
- **Fórmula drop:** `lag()` sobre sort_order global. **NÃO filtra is_test no trecho quiz.**
- **Consumo:** `getFullFunnel` (`checkout-funnel.functions.ts:32-44`) → `/admin/quiz:132-135`.
- **Fidelidade:** 🔴 **A mais perigosa.** A transição **q_cta(5)→c_view(6)** calcula `drop_pct` entre **duas coortes que NÃO se conectam**: as sessões do quiz (`quiz_funnel_events.session_id`) e as do checkout (`checkout_funnel_events.session_id`) são **universos de session_id distintos** — só são "unidos" por `UNION ALL` e ordenados. Não há garantia de que o `session_id` do quiz seja o mesmo do checkout (apps/domínios diferentes: quiz-sacra vs checkout). Logo o "drop quiz→checkout" pode ser >100% ou negativo e **não significa nada**. O comentário da própria migration original admite "join por session_id (coorte única, só sessões instrumentadas)" — mas o SQL **não faz join**, faz UNION. **[furo grave de fidelidade]**

### 1.9 Funções auxiliares (não-RPC, leitura direta)
- **`getConvertedLeadIds`** (`conversion.functions.ts:11-40`): NÃO usa RPC. Lê `vendas_reais.src` (Set) + `leads_reais.id/external_id`, retorna leads cujo `external_id ∈ src`. Join canônico em JS. Consumido por `/admin/tracking` e `/admin/quiz` (conversão por arquétipo). ✅ fiel (usa as views + external_id=src).
- **`getOverviewKpis`** (`overview.functions.ts`): soma `vendas_reais.gross_value/100` + counts de `leads_reais`/`profiles`. ✅ fiel (descrito no doc de estrutura §1.3).

---

## 2. Os 3 funis instrumentados — como (não) se conectam

| Funil | RPC | Tabela | Chave de coorte | Etapas |
|---|---|---|---|---|
| **Quiz** | `analytics_quiz_funnel` | `quiz_funnel_events` | `session_id` (quiz) | arrival→Q1..Q7→contact_gate→result→offer→cta |
| **Checkout** | `analytics_checkout_funnel` | `checkout.checkout_funnel_events` | `session_id` (checkout) | view→form_start→identity→method→payment_info→submit→purchase |
| **Full** | `analytics_full_funnel` | as duas, **UNION ALL** | nenhuma — só concatena | q_arrival→q_q7→q_contact→q_cta ‖ c_view→c_identity→c_submit→c_purchase |

**Como se conectam:** **NÃO se conectam por dado.** O `analytics_full_funnel` **não faz JOIN** entre `quiz_funnel_events.session_id` e `checkout_funnel_events.session_id` — faz `UNION ALL` e calcula `drop_pct` por `lag()` na ordem (`20260617:219-237`). São dois funis colados visualmente. A fronteira q_cta→c_view é a junção mais frágil: duas populações de session_id potencialmente disjuntas (quiz e checkout são apps separados). **Nenhum dos 3 funis se liga a `leads_reais`/`vendas_reais`** (coorte de atribuição por `external_id`) — são universos paralelos:

```
  Coorte INSTRUMENTADA (beacons)        Coorte de ATRIBUIÇÃO (negócio)
  session_id                            external_id (qs_*) = src
  quiz_funnel_events ─┐                 leads_reais ──┐
                      ├─ UNION (full)                 ├─ external_id=src
  checkout_funnel_ ───┘                 vendas_reais ─┘
   events                               (analytics_funnel/top_segments/
                                         cohort/conversion/tracking)
```
Não há ponte entre os dois blocos. "Cliques no CTA" (beacon) ≠ "leads que compraram" (atribuição) ≠ "purchase event no checkout" (beacon) ≠ "receita confirmada" (`vendas_reais`).

---

## 3. Tabela métrica → fonte → fórmula → fidelidade

| Métrica (onde aparece) | Fonte | Fórmula | Fidelidade |
|---|---|---|---|
| Receita total (`/analytics`, overview) | `vendas_reais` | `Σ gross_value/100` | ✅ fiel |
| Taxa conversão macro (`/analytics` KPI) | `analytics_funnel` | `purchasers/total_leads`, purchasers por **buyer_email** | ⚠️ join por email diverge das outras telas |
| Compraram / Upsell / Downsell (funil `/analytics`) | `analytics_funnel` | `COUNT(DISTINCT buyer_email)` por product_type | ⚠️ buyer_email (não external_id) |
| Com WhatsApp (funil `/analytics`) | `analytics_funnel` | `COUNT WHERE whatsapp IS NOT NULL` | ✅ |
| Nicho: conv_rate (`/analytics` tabela) | `analytics_top_segments` | `purchasers/total_leads*100` (já %); join external_id=src | ✅ tabela / 🔴 **CSV 100× errado** |
| Nicho: revenue (tabela vs CSV) | top_segments | `/100` (R$) | ✅ tabela / 🔴 **CSV divide por 100 de novo** |
| Receita por produto + reembolsos (`/analytics`) | `analytics_revenue_breakdown` (purchases cru) | sales/revenue FILTER confirmed; refunds FILTER refunded | ✅ (única com refunds reais); risco de drift do filtro manual |
| Quiz×conversão (`/analytics`) | `analytics_quiz_conversion` | converted=`DISTINCT l.id FILTER(p.src NOT NULL)`; join external_id=src | ✅ |
| Cohort leads/buyers (`/analytics`) | `analytics_cohort_weekly` | buyers=`DISTINCT p.src`; join external_id=src | ✅ (revenue/conv não renderizados) |
| Funil Quiz: reached/drop (`/quiz`) | `analytics_quiz_funnel` | `DISTINCT session_id`, `lag()` drop | ⚠️ **sem is_test**; ordem result/offer/contact_gate assumida |
| Maior gargalo (`/quiz` leakPoint) | quiz_funnel | maior drop_pct com prev.reached≥2 | ⚠️ herda os furos do quiz_funnel |
| Funil Checkout (`/quiz`) | `analytics_checkout_funnel` | `DISTINCT session_id`, `lag()` | ⚠️ purchase=evento front; `decline` lido na UI mas RPC não retorna → morto |
| Funil Full quiz→checkout (`/quiz`) | `analytics_full_funnel` | UNION ALL + `lag()` | 🔴 **drop q_cta→c_view entre coortes disjuntas; sem is_test** |
| Conversão por arquétipo (`/quiz`, `/tracking`) | `getConvertedLeadIds` | `external_id ∈ vendas_reais.src` | ✅ fiel |
| Completion rate quiz (`/quiz` KPI) | `quiz_responses` (browser) | lead com `≥7` respostas / leads | ✅ (mas é coorte de quiz_responses, ≠ funnel beacons) |

---

## 4. Veredito — onde a métrica NÃO é fiel (prioridade)

1. 🔴 **`analytics_full_funnel` cola coortes que não se conectam** (`20260617:219-237`): `q_cta→c_view` faz `drop_pct` entre `session_id` de quiz e de checkout que são universos distintos (UNION ALL, sem JOIN). Número da transição quiz→checkout é **sem sentido**.
2. 🔴 **CSV de Top Segmentos 100× errado** (`admin.analytics.tsx:124-125`): conv_rate já vem em %, revenue já em R$, mas o CSV multiplica conv_rate por 100 e divide revenue por 100. A tela está certa; só o arquivo exportado mente.
3. ⚠️ **Dois métodos de join lead↔venda divergem:** `analytics_funnel` usa `buyer_email`; todo o resto usa `external_id=src`. "Quantos compraram" muda entre `/admin/analytics` e `/admin/quiz`+`/admin/tracking`.
4. ⚠️ **Funis de evento sem `is_test`:** `quiz_funnel_events` tem coluna `is_test` (`20260616:9`) mas `analytics_quiz_funnel`/`analytics_full_funnel` não a filtram → eventos de teste inflam todas as etapas. (`checkout_funnel_events` não tem a coluna.)
5. ⚠️ **`decline` morto no checkout funnel:** `analytics_checkout_funnel` não retorna stage `decline`, mas `admin.quiz.tsx:289-298` tenta lê-lo → sempre vazio.
6. ⚠️ **`purchase`/`cta` de beacon ≠ receita:** etapas finais dos funis instrumentados são eventos de front, nunca reconciliados com `vendas_reais`. Para receita, só `vendas_reais`/`receita_real()`.

**Pontos sólidos:** views canônicas (`vendas_reais`/`leads_reais`) com is_test+baseline; join external_id=src nas RPCs de atribuição (top_segments, conversion, cohort, getConvertedLeadIds); `receita_real()`; segurança service_role+assertAdmin.

---

## Apêndice — arquivo:linha
- RPCs avançadas (estado final): `20260616_fix_analytics_rpcs.sql` (revenue_breakdown:83, quiz_conversion:108, cohort:139); `20260617_fix_contact_gate_and_email_to_whatsapp.sql` (funnel:246, top_segments:279, quiz_funnel:56, full_funnel:144).
- Funis: `20260611_analytics_quiz_funnel.sql`, `20260611_analytics_checkout_funnel.sql`, `20260611_fix_quiz_funnel_today.sql`, `20260616_fix_quiz_funnel_rpc.sql`.
- Grants: `20260611_revoke_analytics_grants.sql`; `20260617:329-337`.
- Server fns: `src/lib/admin/analytics.functions.ts`, `quiz-funnel.functions.ts`, `checkout-funnel.functions.ts`, `conversion.functions.ts`.
- UI: `src/routes/admin.analytics.tsx` (CSV bug :124-125), `src/routes/admin.quiz.tsx` (funnelKpis:246, checkoutKpis:275, decline morto:289).
- Legado por email (substituído): `20260531_analytics_rpcs.sql`.
- is_test em quiz_funnel_events: `20260616_intelligence_is_test.sql:9`.
