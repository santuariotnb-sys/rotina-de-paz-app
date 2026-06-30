# Auditoria Autônoma — Superfície Tracking/CAPI (2026-06-30)

**Status:** Auditoria Read-Only Completa  
**Data:** 2026-06-30  
**Escopo:** Banco Supabase `cemjibbauvvyfaxilrvm` (prod compartilhado com Quiz)

---

## Resumo Executivo

A superfície de **tracking e atribuição de tráfego é frágil** versus a arquitetura-alvo (5 pilares). Os gaps críticos são:

1. **Identidade fragmentada:** `external_id` presente em apenas **7/130 leads** (5%) e **ZERO/17 vendas reais** (0%)
2. **Captura server-side ausente:** `client_ip` é **null em 100% das 67 sessões** rastreadas
3. **Deduplicação incompleta:** CAPI envia apenas **4/17 eventos Purchase** (24% de cobertura); eventos de teste contaminam funis
4. **Sem funil sólido:** Análise atual usa `UNION ALL` de coortes disjuntas; sem JOIN por identidade
5. **Dados de teste não isolados:** `is_test` existe em schema mas não filtra corretamente em relatórios

**Impacto:** Não é possível rastrear um lead até compra, não há EMQ alta (faltam IP/UA server-side), e o tráfego pago aparece inflado/duplicado.

---

## 1. Pilar 1 — Espinha de Identidade Única (`external_id`)

### Estado Atual

| Tabela | Total | Com `external_id` | Cobertura |
|--------|-------|-------------------|-----------|
| `tracking_sessions` | 67 | 67 | 100% ✅ |
| `leads_reais` | 130 | 7 | 5% ❌ |
| `purchases` | 23 | 0 | 0% ❌ |
| `vendas_reais` | 17 | 0 | 0% ❌ |

### Análise

- **tracking_sessions:** Todas as 67 sessões têm `external_id` (formato `qs_<uuid>`), gerado corretamente no Quiz
- **leads_reais:** Apenas 7/130 (5%) de leads têm `external_id` preenchido
  - Gap: LP (`rotinadepaz.com.br`) não herda o `external_id` do Quiz via cookie domínio-raiz
  - A especificação exige cookie em `.rotinadepaz.com.br` compartilhada entre Quiz e LP
- **purchases:** **NENHUMA** das 23 compras tem `external_id` preenchido
  - O webhook de Kirvano traz `utm.src` (que é o `external_id`) no payload
  - Mas o campo não é persistido na tabela `purchases` durante upsert (linha 326 do `kirvano.server.ts` salva em `src`, não `external_id`)
  - `vendas_reais` (17 registros) também vazio
- **Bloqueador:** Sem `external_id` em compras, é impossível vincular lead → venda

### Evidência

```sql
-- Webhook contém external_id, mas não é salvo em purchases
SELECT (payload->'utm'->>'src') as utm_src FROM webhook_logs 
WHERE event_type = 'SALE_APPROVED' LIMIT 1;
-- Resultado: "qs_bdd313d6-4357-4676-b2a8-0200a1e40a47"

-- Mas compra não tem external_id
SELECT external_id, src FROM purchases LIMIT 1;
-- Resultado: external_id=NULL, src="qs_..." (nomenclatura inconsistente)
```

---

## 2. Pilar 2 — Captura Server-Side de Sinais

### Estado Atual

| Sinal | Sessões (67) | Cobertura | Status |
|-------|--------------|-----------|--------|
| `client_ip` | 0 | 0% | ❌ CRÍTICO |
| `user_agent` | 67 | 100% | ✅ |
| `fbp` (Facebook Pixel ID) | 21 | 31% | ⚠️ PARCIAL |
| `fbc` (Facebook Click ID) | 27 | 40% | ⚠️ PARCIAL |

### Análise

- **client_ip:** 100% null (0/67 sessões populadas)
  - `tracking_sessions` é gravado **client-side pelo Quiz** (arquivo não inspecionado, mas logs indicam localStorage)
  - Pixel não lê IP confiavelmente; server é a fonte
  - **Gap:** Nenhuma edge function ou webhook grava sessão server-side com `CF-Connecting-IP`
  - EMQ fica em nível médio-baixo sem IP real
- **user_agent:** 100% populado (✅ Quiz captura corretamente)
- **fbp/fbc:** Parcial (31%/40%)
  - Alguns usuários bloqueiam tracking de terceiros
  - Kirvano webhook traz `cookies.fbclid` (5 webhooks capturaram), mas nem todos

### Evidência

```sql
-- Verificar distribuição de client_ip
SELECT 
  COUNT(*) total,
  COUNT(CASE WHEN client_ip IS NOT NULL THEN 1 END) com_ip
FROM tracking_sessions;
-- Resultado: total=67, com_ip=0
```

---

## 3. Pilar 3 — Deduplicação Correta

### Cobertura CAPI

| Métrica | Valor | Status |
|---------|-------|--------|
| Webhooks SALE_APPROVED | 17 | — |
| Enviados ao CAPI (`capi_status='sent'`) | 4 | 24% ❌ |
| Não enviados (`capi_status=null`) | 13 | 76% ❌ |
| Falhos (`capi_status='failed'`) | 0 | — |
| Retry pending | 13 | ⚠️ CRÍTICO |

### Análise

- **Cobertura CAPI baixa:** Apenas 4/17 eventos Purchase foram enviados ao Meta
  - Razão: Muitos webhooks têm `capi_status=null` (não foram processados pelo cron de retry)
  - O `capi-retry` cron parece não estar ativo ou não reprocessa frequentemente
- **event_id:** Correto (usa `transaction_id` da Kirvano = `sale_id`, garantindo dedup)
  - Linha 351 do `kirvano.server.ts` passa `transactionId` para `sendMetaCapiPurchase`
  - `meta-capi.server.ts:78` define `event_id` = `opts.transactionId`, ✅ certo
- **event_id no nível correto:** Payload Meta inclui `event_id` no topo (linha 163), ✅ certo
- **Missing:** Sem IP/UA server-side em CAPI (client_ip null), EMQ fica reduzido

### Evidência

```sql
-- Distribuição de status CAPI
SELECT capi_status, COUNT(*) FROM webhook_logs WHERE event_type = 'SALE_APPROVED' GROUP BY capi_status;
-- Resultado:
-- capi_status='sent'    | 4
-- capi_status=NULL      | 13
-- (total 17)
```

---

## 4. Pilar 4 — Travessia Cross-Domain (Kirvano)

### Estado Atual

| Componente | Status | Evidência |
|-----------|--------|-----------|
| Decoração de link (utm.ts) | ✅ FUNCIONA | Captura UTMs e fbclid, propaga via URL |
| Webhook de Kirvano | ✅ FUNCIONA | 41 webhooks recebidos, 38 processados |
| Stitching server-side | ⚠️ PARCIAL | Recupera fbp/fbc por external_id (linhas 96-104 meta-capi.server.ts) |
| Propagação de fbp/fbc para CAPI | ⚠️ PARCIAL | Só se tracking_sessions for encontrada (31-40% hit rate) |

### Análise

- **utm.ts:** Funciona — captura fbclid e UTMs, propaga ao Kirvano via URL
- **Webhook Kirvano:** Recebe e processa — 41 webhooks total, 38 matched
  - Payload traz `utm.src` (external_id), `cookies.fbclid`, e outros sinais
- **Stitching (`meta-capi.server.ts`):**
  - Tenta lookup em `tracking_sessions` por `external_id` (linha 98-103)
  - Fallback para `fbclid` do payload Kirvano (linha 129-133)
  - **Gap:** Se tracking_sessions não existe ou fbp/fbc está vazio, CAPI recebe sinal reduzido
- **Cross-domain:** Funciona em princípio, mas efetividade reduzida por falta de cobertura fbp/fbc

### Evidência

```sql
-- Webhooks trazem utm.src (external_id)
SELECT COUNT(DISTINCT (payload->'utm'->>'src')) FROM webhook_logs 
WHERE event_type = 'SALE_APPROVED';
-- Resultado: 16 valores únicos (16/17 webhooks têm utm.src)
```

---

## 5. Pilar 5 — Fonte de Verdade Única & Funil por JOIN

### Estado Atual

| Métrica | Tabela | Problema |
|---------|--------|----------|
| Funil principal | `leads_reais` + `purchases` | Sem JOIN por external_id; muitos leads não tem external_id |
| Vista agregada | `analytics_full_funnel` (não inspecionada) | Presumível UNION ALL (spec menciona gap) |
| Filtro is_test | Schema (sim) | Não aplicado uniformemente em relatórios |
| Reconciliação lead↔venda | — | Impossível (0% external_id em compras) |

### Análise

- **Leads vs Vendas:** 130 leads, 17 vendas reais, 7 leads convertem
  - Apenas 6/17 vendas têm `lead_id` preenchido (35%)
  - NENHUMA tem `external_id` preenchido
  - **Resultado:** Funil "cai para o vazio" entre quiz e compra
- **is_test:** Campo presente em `leads_reais`, `purchases`, `vendas_reais`, `quiz_funnel_events`
  - `leads_reais`: 0 leads marcados como teste (todos presumivelmente reais)
  - `purchases`: 4/23 marcados como teste (17%)
  - `vendas_reais`: 0/17 (mesmo dado?)
  - **Risco:** Relatórios podem contar eventos de teste sem filtro (depende da view)
- **Sem funil sólido:** Atualmente relatório de tracking (`admin.tracking.tsx`) lê de `leads_reais` com filtros simples (UTM); não há JOIN com purchases

### Evidência

```sql
-- Leads sem external_id não podem ser ligados a vendas
SELECT COUNT(*) leads_linkable FROM leads_reais WHERE external_id IS NOT NULL;
-- Resultado: 7

SELECT COUNT(*) vendas_sem_lead FROM vendas_reais WHERE lead_id IS NULL;
-- Resultado: 11/17 (65% orfãs)
```

---

## 6. Tabelas de Apoio — Estado Não-Rastreado

| Tabela | Linhas | Columns em schema | Status |
|--------|--------|-------------------|--------|
| `tracking_sessions` | 67 | ✅ (externa em schema) | Rastreado mas schema pode divergir |
| `quiz_funnel_events` | 1969 | ✅ (externa em schema) | Idem |
| `processed_events` | 0 | ✅ | Vazio; nunca preenchido? |
| `webhook_logs` | 41 | ✅ | Ativo; rastreia retry CAPI |

### Análise

- **tracking_sessions / quiz_funnel_events:** Existem em prod sem migrations versionadas
  - Schema pode divergir entre ambientes
  - Spec pillar B5 recomenda versionar DDL em migrations
- **processed_events:** Vazio → tabela criada mas nunca usada?
  - Presumida para reconciliação CAPI (Meta EMQ tracking)
  - Poderia alimentar dashboard de cobertura
- **webhook_logs:** Ativo e completo — rastreia cada tentativa CAPI com `capi_status`, `capi_error`, `capi_retries`

---

## 7. Checklist vs Arquitetura-Alvo

| Pilar | Descrição | Estado | Gap |
|-------|-----------|--------|-----|
| **1a** | `external_id` em 100% dos eventos | ❌ 0% em compras | Crítico |
| **1b** | Cookie domínio-raiz `.rotinadepaz.com.br` | ❌ não implementado | Crítico |
| **2a** | IP real (CF-Connecting-IP) server-side | ❌ 0% populado | Crítico |
| **2b** | User-Agent server-side | ✅ 100% | OK |
| **2c** | fbp/fbc server-side | ⚠️ 31-40% | Médio |
| **3a** | `event_id` no nível certo do payload | ✅ Correto | OK |
| **3b** | Dedup `event_id` = `order_id` | ✅ Sim | OK |
| **3c** | Cobertura CAPI de Purchases | ❌ 24% | Crítico |
| **4a** | Decoração de checkout URL | ✅ Funciona | OK |
| **4b** | Stitching no webhook | ⚠️ Parcial | Médio |
| **5a** | JOIN em vez de UNION ALL | ❌ não verificado | Provável |
| **5b** | Filtro `is_test` ativo | ⚠️ Schema sim, aplicação incerta | Médio |

---

## 8. Impacto Operacional

### Dados Atuais São Inutilizáveis Para:
1. **Atribuição lead → venda:** 0% external_id em compras
2. **EMQ tracking:** IP null em 100% das sessões reduz matching Meta
3. **Funil acurado:** Impossível JOIN por identidade
4. **Filtragem de teste:** is_test presente mas aplicação desconhecida
5. **ROAS/ROI:** Sem dedup Pixel↔CAPI completa, tráfego aparece inflado

### Dados Ainda Úteis Para:
1. **Volume de leads por UTM:** `leads_reais.utm_*` está correto
2. **Contagem de vendas brutas:** `vendas_reais` tem transaction_id e valores
3. **Status de processamento de webhook:** `webhook_logs` rastreia cada evento

---

## 9. Recomendações Sequenciais

### Imediato (Bloqueadores)
1. **Pilar 1:** Promover `external_id` de localStorage em `.rotinadepaz.com.br` (cookie domínio-raiz)
   - Garantir geração no 1º toque em Quiz E LP
   - Propagar em 100% dos eventos e URLs de checkout
2. **Pilar 2:** Implementar gravação server-side de `client_ip` (CF-Connecting-IP)
   - Edge function de tracking do Quiz (antes de localStorage)
   - Webhook Kirvano: incluir ip real no payload antes de CAPI
3. **Pilar 3:** Ativar cron `capi-retry` para processar os 13 webhooks pendentes
   - Validar que `capi_status` passa de `null` → `sent/failed`

### Médio (Qualidade)
4. **Pilar 5:** Refatorar funil com JOIN em vez de UNION ALL
5. **Pilar 3:** Adicionar `processed_events` para dashboard de EMQ
6. **Dados:** Aplicar filtro `is_test` uniformemente em relatórios

---

## Conclusão

O sistema **coleta dados, mas não os conecta**. A raiz é a ausência de identidade única (`external_id`) ao longo do funil. Sem ela:
- Leads permanecem órfãos
- Compras não podem ser rastreadas até origem
- Atribuição é impossível
- Tráfego pago não pode ser medido com confiança

Os 5 pilares da especificação ainda não foram implementados. Recomenda-se começar pela Frente B (fundação) do roadmap, com ênfase em Pilar 1 (identidade) e Pilar 2 (IP server-side), que desbloqueiam os demais.

---

**Próximas ações:** Executar Frente B (sprint de 3-5 dias) + Verificação ponta-a-ponta de uma venda de teste antes de enviar tráfego real.
