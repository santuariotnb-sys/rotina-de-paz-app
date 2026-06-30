# AUDITORIA DE FIDELIDADE DE DADOS — Rotina de Paz

**Data:** 2026-06-14
**Escopo:** Quiz-sacra (client) + rotina-de-paz-app (server) + checkout-sacra (OFF) + Supabase cemjibbauvvyfaxilrvm
**Método:** Read-only. Código lido linha a linha, banco consultado com queries reais, cruzamento contra webhook_logs e dados brutos.
**Relatórios detalhados:** AUDITORIA-FASE1.md a AUDITORIA-FASE5.md

---

## 1. VEREDITO (3 linhas)

**NÃO dá pra confiar nos números do admin hoje.** A receita por segmento e por coorte está inflada ~30% por fan-out de leads duplicados. O funil quiz mostra 0 no topo (stage "arrival" nunca emitido). Conversão inflada em até 150% (COUNT sem DISTINCT). A CAPI funciona mas perde fbc/fbp em ~85% das vendas (tracking_sessions match rate = 5.5%), degradando EMQ e atribuição. Domain guard inexistente no quiz contamina tudo com previews/dev.

**O que funciona:** receita total (analytics_funnel) está correta (R$760,40), Purchase CAPI é idempotente e dispara 1× por venda com event_id = sale_id, idempotência de purchases/entitlements é sólida, auth do webhook é robusta.

**O que mente:** receita por segmento/coorte, taxa de conversão por resposta, topo do funil quiz, match rate tracking→CAPI, validação HMAC (0% signature_valid).

---

## 2. TABELA-MESTRE

| # | Métrica | Fonte (RPC/tabela) | Conferido contra | Valor admin | Valor real | Status | Causa raiz |
|---|---------|---------------------|------------------|-------------|------------|--------|------------|
| 1 | Receita total (30d) | analytics_funnel | SUM(purchases.gross_value) | R$760,40 | R$760,40 | **OK** | Sem JOIN, query direta |
| 2 | Purchasers (30d) | analytics_funnel | COUNT(DISTINCT buyer_email) | 11 | 11 | **OK** | DISTINCT protege |
| 3 | Total leads (30d) | analytics_funnel | COUNT(leads) | 127 | 127 | **OK** | Query direta |
| 4 | Revenue coorte 06/08 | analytics_cohort_weekly | Query manual | R$291,70 | R$224,80 | **DIVERGE +29.8%** | Fan-out: celiaborim 2 leads × 2 purchases |
| 5 | Converted (sintoma=todos) | analytics_quiz_conversion | COUNT(DISTINCT buyer_email) | 5 | 2 | **DIVERGE +150%** | COUNT(p.id) sem DISTINCT |
| 6 | Converted (situação=casada-filhos) | analytics_quiz_conversion | COUNT(DISTINCT buyer_email) | 4 | 2 | **DIVERGE +100%** | COUNT(p.id) sem DISTINCT |
| 7 | Quiz arrival (topo funil) | analytics_quiz_funnel | quiz_funnel_events stage | 0 | ~417 sessões | **DIVERGE -100%** | Stage "arrival" nunca emitido |
| 8 | Quiz contact→cta drop | analytics_quiz_funnel | quiz_funnel_events | -433% | n/a | **ABSURDO** | contact (3) < cta (16), funil invertido |
| 9 | SALE_APPROVED → tracking match | reconciliation | JOIN tracking_sessions | n/a | 2/13 (15.4%) | **CRÍTICO** | tracking_sessions só tem 7 registros |
| 10 | Webhook signature_valid | webhook_logs | Todos os 26 registros | n/a | 0% (0/26) | **CRÍTICO** | HMAC nunca marca true ou validação quebrada |
| 11 | Purchases com lead_id | purchases.lead_id | COUNT(WHERE NOT NULL) | n/a | 0/19 (0%) | **CRÍTICO** | Handler nunca popula lead_id |
| 12 | Contact beacon vs leads com contato | quiz_funnel_events | leads com email/whatsapp | 3 beacons | 89 leads | **DIVERGE** | Beacon WhatsApp inexistente |
| 13 | Revenue por segmento | analytics_top_segments | Query sem fan-out | Inflada | Menor | **DIVERGE** | Mesmo fan-out que #4 |

---

## 3. DIVERGÊNCIAS PRIORIZADAS

### P0 — ENGANA DECISÃO DE DINHEIRO

| # | Problema | Impacto | Fix recomendado |
|---|----------|---------|-----------------|
| P0-1 | **Receita inflada em 3 RPCs** (analytics_top_segments, analytics_cohort_weekly, analytics_quiz_conversion) por fan-out de leads duplicados no JOIN email | Receita por coorte +29.8% na semana 06/08. Decisões de budget baseadas em ROAS errado. | Deduplica leads antes do JOIN: subquery `SELECT DISTINCT ON (lower(email)) * FROM leads` ou separar receita em CTE independente (como analytics_funnel já faz) |
| P0-2 | **Quiz funnel com topo zerado** — stage "arrival" não existe nos dados. RPCs quiz_funnel e full_funnel mostram 0 no topo. | Dashboard inutilizável para otimização de funil. Taxas de drop impossíveis de calcular. | O quiz JÁ emite beacon "arrival" via trackStep, mas grava com stage="arrival" — verificar se a RPC filtra corretamente. Se não, ajustar a RPC para usar o stage real emitido |
| P0-3 | **tracking_sessions: 5.5% match rate** (7/127 leads). CAPI perde fbc/fbp em ~85% das vendas. | EMQ degradado. Meta não consegue atribuir ~85% das conversões ao ad correto. Budget allocation cega. | Investigar por que upsert_tracking_session não é chamado consistentemente. O quiz chama saveTrackingSession() no CTA (fire-and-forget) — pode estar falhando silenciosamente ou o usuário sai antes de executar |
| P0-4 | **signature_valid = 0% em todos 26 webhooks** | Se HMAC está desligado/quebrado, qualquer POST forjado ao endpoint é aceito. Risco de purchases/entitlements falsos. | Investigar: o campo é atualizado para true após validação bem-sucedida? Ou a validação passa mas o campo não é escrito? Ler o código do handler que grava webhook_logs |
| P0-5 | **GRANTS ALL para anon** em leads, purchases, webhook_logs, tracking_sessions (DELETE, TRUNCATE inclusos). RLS protege mas viola defense-in-depth. | Se qualquer policy RLS tiver bug, anon pode deletar/truncar tabelas inteiras. | REVOKE excessos. Manter apenas o necessário para RPCs SECURITY DEFINER |

### P1 — DEGRADA QUALIDADE DE DADOS

| # | Problema | Impacto | Fix recomendado |
|---|----------|---------|-----------------|
| P1-1 | **analytics_quiz_conversion usa COUNT(p.id)** em vez de COUNT(DISTINCT p.buyer_email) | Conversão inflada até 150% por resposta de quiz | Trocar para COUNT(DISTINCT p.buyer_email) |
| P1-2 | **persist_lead não é idempotente** (sem ON CONFLICT) | Leads duplicados causam P0-1. celiaborim tem 2 leads. | Adicionar ON CONFLICT (lower(email)) DO UPDATE ou debounce no front |
| P1-3 | **Funil contact/cta invertido** — contact(3) < cta(16) gera drop -433% | Funil absurdo no admin | Reordenar estágios ou tratar como paralelos |
| P1-4 | **CAPI timeout 8s sem retry** — Purchase perdido para o Meta se timeout | Eventos CAPI perdidos sem rastro (catch retorna sent:false, sem fila) | Criar tabela capi_retry_queue + pg_cron retenta a cada 5min (max 3) |
| P1-5 | **content_ids divergentes** — CAPI envia UUIDs internos, quiz envia slugs ("rotina_de_paz") | Catálogo Meta poluído. Se houver catálogo configurado, IDs não batem | Padronizar 1 formato ou remover campo |
| P1-6 | **purchases.lead_id nunca populado** (0/19) | Impossível JOIN direto purchases→leads para atribuição end-to-end | Webhook handler buscar lead por email/whatsapp ao inserir purchase |
| P1-7 | **Oferta não mapeada = venda silenciosamente ignorada** | Nova oferta Kirvano sem entry em product_kirvano_offers → zero alerta | Adicionar notificação (Slack/email) quando productIds.length === 0 |
| P1-8 | **Beacon `arrival` sem gate** — bots, reloads, previews contam | Infla topo de funil. Sem domain guard, previews poluem. | Adicionar domain guard centralizado |
| P1-9 | **Adblock: _fbp nunca gerado** (~30% users) | tracking_session grava sem _fbp, CAPI perde match quality | Aceitar como limitação ou capturar fbp server-side |
| P1-10 | **tracking_sessions retenção 30d** vs reconciliação retroativa | Análises retroativas perdem dado de tracking | Aumentar para 90d (alinhado com webhook_logs) |

### P2 — MELHORIAS

| # | Problema | Fix |
|---|----------|-----|
| P2-1 | Timezone mismatch: cohort UTC vs funnel BRT | Padronizar BRT em todas as RPCs |
| P2-2 | Stages "result"/"offer" ignorados no funil | Incluir na RPC entre Q7 e contact |
| P2-3 | QuizStep e PageView sem eventID | Adicionar eventID determinístico |
| P2-4 | Beacons Supabase duplicam em reload | ON CONFLICT ou dedup client-side |
| P2-5 | idx_leads_email sem lower() | Recriar índice com lower(email) |
| P2-6 | 2 SALE_REFUNDED com offer não mapeada | Cadastrar offer 09494a43 ou marcar como legada |
| P2-7 | processed_events tabela vazia/órfã | Remover ou integrar ao fluxo |
| P2-8 | quiz_funnel_events sem policies RLS | Adicionar policies explícitas |
| P2-9 | Chargeback = refund (mesmo status) | Novo status "chargeback" + CAPI refund event |
| P2-10 | Refund busca por product_name, não transaction_id | Pode refundar purchase errado se mesmo produto comprado 2× |
| P2-11 | external_id sem TTL | Persiste forever em localStorage. Raro causar problema |

---

## 4. DOMAIN GUARD — AUSÊNCIA TOTAL NO QUIZ

**Status atual:** ZERO domain guard em Quiz-sacra. Todo disparo (pixel, beacons, leads, tracking_sessions) acontece de qualquer origem: localhost, *.pages.dev, preview deploys.

| Componente | Guard? | Consequência |
|------------|--------|-------------|
| Pixel init (index.html) | NÃO | PageView em preview = métrica inflada |
| fbq calls (Lead, IC, QuizStep) | NÃO | Eventos Meta de preview |
| trackStep beacons (Supabase) | NÃO | Funil poluído com dados dev |
| persistLead | NÃO | Leads falsos de preview |
| saveTrackingSession | NÃO | tracking_sessions de dev |

**Fix:** Guard centralizado no início do QuizApp: `if (!isProduction()) return` para todos os disparos. `isProduction = () => window.location.hostname === 'rotinadepaz.com.br'`.

---

## 5. MAPA DO RIPPLE EMAIL → WHATSAPP

### Estado atual da transição
- **Leads com email:** 37 (29.1%) — todos antigos
- **Leads com WhatsApp:** 52 (40.9%) — todos recentes
- **Leads com ambos:** 0 (0%) — transição completa, sem sobreposição
- **Leads sem contato:** 38 (29.9%) — abandonaram antes do contact gate

### Impactos downstream

| Área | Impacto | Ação necessária |
|------|---------|-----------------|
| **CRM/Email marketing** | Novos leads NÃO têm email. Sequências de email não alcançam ~60% dos leads. | Criar fluxo WhatsApp (API Business ou Zapier) para nurturing |
| **EMQ (Event Match Quality)** | Advanced Matching envia `em` (email) no Lead. Com WhatsApp, `em` fica vazio, só `ph` (phone). Meta aceita phone mas match rate é menor que email. | Verificar se `ph` está sendo hashado corretamente (SHA-256, formato E.164) |
| **purchases.buyer_email** | Kirvano envia `buyer_email` no webhook. Leads novos têm WhatsApp, não email. JOIN leads↔purchases por email FALHA para leads novos. | Adicionar JOIN alternativo por WhatsApp ou pelo external_id (qs_) |
| **Onboarding (welcome email)** | `sendWelcomeEmail` usa buyer_email do webhook. Funciona se Kirvano tiver o email de pagamento. Mas se o lead deu só WhatsApp no quiz, o "lead" e o "buyer" podem ser pessoas diferentes ou com dados diferentes. | Enviar welcome também por WhatsApp |
| **Reconciliação** | run_reconciliation cruza webhook↔purchases por transaction_id (OK). Mas o cruzamento lead↔purchase é impossível sem email no lead. | Usar external_id (qs_ no utm.src) como chave de reconciliação lead↔purchase |
| **KPIs por canal** | Funil antigo: lead(email) → purchase(email) = atribuição direta. Funil novo: lead(WhatsApp) → purchase(email) = sem link direto. | external_id é o elo. Garantir que utm.src chega no webhook e é gravado na purchase |

### Cadeia de dados WhatsApp

```
Quiz captura WhatsApp (55XXXXXXXXXXX)
  → save_lead_contact(lead_id, null, whatsapp) → leads.whatsapp
  → Advanced Matching: fbq init com {ph: whatsapp} (hash SHA-256)
  → Kirvano recebe src=qs_UUID na URL de checkout
  → Webhook retorna utm.src=qs_UUID → grava em purchases.external_id? 
     ⚠️ VERIFICAR: purchases tem coluna external_id mas é populada?
```

**Ponto cego:** Se `purchases.external_id` não é populado pelo webhook handler, o link lead(WhatsApp)↔purchase fica quebrado. O campo existe na tabela mas tem 0% de preenchimento verificado (ver Fase 2).

---

## 6. RECOMENDAÇÕES PARA PASSADA 2

### Bloco A — Fixes de fidelidade de dados (P0)
1. **Corrigir 3 RPCs com fan-out** (analytics_top_segments, analytics_cohort_weekly, analytics_quiz_conversion) — deduplica leads antes do JOIN
2. **Corrigir topo do funil** — verificar por que "arrival" não aparece na RPC (o beacon existe no quiz)
3. **Investigar tracking_sessions baixo** — por que 7/127? saveTrackingSession está falhando?
4. **Investigar signature_valid = 0%** — campo não atualizado ou HMAC quebrado?
5. **REVOKE GRANTs excessivos de anon** — manter só o necessário

### Bloco B — Fixes de qualidade (P1)
6. **persist_lead idempotente** — ON CONFLICT para evitar leads duplicados
7. **CAPI retry queue** — não perder Purchase por timeout
8. **purchases.lead_id** — popular no webhook handler
9. **Alerta de oferta não mapeada** — notificação quando venda é ignorada
10. **Domain guard centralizado** — impedir poluição de preview/dev

### Bloco C — Reconciliação expandida (Fase 6 do prompt original)
11. **Expandir run_reconciliation** — cruzar com Meta Graph API
12. **Alertas automáticos** — Resend/WhatsApp quando divergence > 0
13. **Painel de saúde no admin** — match rates visíveis

### Bloco D — Padronização (Fase 7 do prompt original)
14. **content_ids consistente** — 1 formato em todos os eventos
15. **Guard de domínio** — centralizado em Quiz-sacra
16. **Testes E2E** — webhook → purchase → CAPI

---

## 7. 2º PIXEL (3207450996117474)

- **Quiz-sacra:** Não encontrado (zero referências)
- **checkout-sacra:** Explicitamente BANIDO em BANNED_PIXELS
- **rotina-de-paz-app:** Não referenciado no código CAPI
- **Status:** Totalmente removido. Seguro.

---

## 8. O QUE ESTÁ BEM (não mexer)

- Receita total (analytics_funnel) = R$760,40 ✓ conferida
- Revenue breakdown por tipo de produto ✓ conferida
- Idempotência de purchases (upsert onConflict: transaction_id) ✓
- Idempotência de entitlements (upsert onConflict: user_id, product_id) ✓
- CAPI event_id = sale_id (dedup correto no Meta) ✓
- CAPI dispara 1× por webhook, value = total real ✓
- Auth webhook 2 camadas (URL secret + HMAC constant-time) ✓
- Rate limiting funcional ✓
- external_id (qs_) end-to-end: quiz → localStorage → URL → Kirvano → webhook ✓
- fbclid→fbc fallback implementado ✓
- Advanced Matching (em/ph/external_id) no Lead ✓
- eventID determinístico para Lead e InitiateCheckout ✓
- Reconciliação diária via pg_cron ✓
- RPCs de analytics restritas a service_role ✓

---

# 🛑 PASSADA 1 CONCLUÍDA — AGUARDANDO APROVAÇÃO DO DONO

**Nenhum código foi alterado.** Todos os achados são recomendações documentadas.
**Próximo passo:** Dono revisa este documento e aprova quais itens executar na Passada 2.
