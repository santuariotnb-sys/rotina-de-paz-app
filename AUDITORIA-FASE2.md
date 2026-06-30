# AUDITORIA FASE 2 -- Integridade do Banco de Dados

**Data:** 2026-06-15  
**Projeto Supabase:** cemjibbauvvyfaxilrvm  
**Periodo dos dados:** 2026-06-07 a 2026-06-15 (8 dias de operacao)

---

## 1. LEADS

### Schema
| Coluna | Tipo | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | gen_random_uuid() |
| created_at | timestamptz | NO | now() |
| name | text | YES | - |
| email | text | YES | - |
| archetype | text | YES | - |
| scores | jsonb | YES | - |
| desire | text | YES | - |
| situation | text | YES | - |
| risk_flag | boolean | YES | false |
| utm_source..utm_term | text x5 | YES | - |
| updated_at | timestamptz | YES | now() |
| fbclid | text | YES | - |
| gclid | text | YES | - |
| whatsapp | text | YES | - |
| consent_timestamp | timestamptz | YES | - |

**Indexes:** pkey(id), idx_leads_created, idx_leads_archetype, idx_leads_email, idx_leads_utm_source, idx_leads_whatsapp (partial, WHERE NOT NULL)  
**FKs:** Nenhuma FK de entrada. quiz_responses e purchases referenciam leads.

### RLS
- `admins read leads` (SELECT, authenticated, is_admin)
- `admins update leads` (UPDATE, authenticated, is_admin)
- `admins delete leads` (DELETE, authenticated, is_admin)
- Sem policy INSERT para anon/authenticated -- gravacao via RPC `persist_lead` (SECURITY DEFINER)

### Volume & Metricas

| Metrica | Valor | % |
|---------|-------|---|
| **Total** | **127** | 100% |
| Com email | 37 | 29.1% |
| Com whatsapp | 52 | 40.9% |
| Com ambos | 0 | 0% |
| **Sem contato nenhum** | **38** | **29.9%** |
| Com archetype | 127 | 100% |
| Com UTM 5/5 | 121 | 95.3% |
| Com fbclid | 122 | 96.1% |
| Com gclid | 0 | 0% |
| Com risk_flag | 39 | 30.7% |

### Problemas
- **[P1] 38 leads sem contato (29.9%)** -- leads que completaram quiz mas nao forneceram email nem whatsapp. Continuam ocorrendo ate 14/06. Sao leads de trafego pago (36/38 tem UTM) que abandonam antes do step de contato.
- **[P2] 0 leads com ambos email+whatsapp** -- a transicao email->whatsapp foi completa, sem periodo de sobreposicao. Normal se o quiz so pede um tipo de contato por vez.
- **[P2] idx_leads_email usa email e nao lower(email)** -- a migration definia `lower(email)` mas o indice real e sobre `email` sem lower. Pode causar mismatch em buscas case-insensitive.

---

## 2. QUIZ_RESPONSES

### Schema
| Coluna | Tipo | Nullable |
|--------|------|----------|
| id | uuid | NO |
| created_at | timestamptz | NO |
| lead_id | uuid | YES |
| question_key | text | NO |
| answer_value | text | YES |
| answer_text | text | YES |
| time_to_answer | integer | YES |

**FK:** quiz_responses_lead_id_fkey -> leads(id)  
**Indexes:** pkey(id), idx_quiz_responses_lead  
**Nota:** Tabela original tinha user_id + answers JSONB; foi reestruturada para formato normalizado com lead_id + question_key.

### RLS
- `admins read quiz_responses` (SELECT, authenticated, is_admin)
- Sem policy INSERT direta -- gravacao via RPC `persist_quiz_responses`

### Volume
| Metrica | Valor |
|---------|-------|
| Total | 889 |
| Com lead_id | 889 (100%) |
| Leads distintos | 127 |
| Perguntas distintas | 7 |
| Media respostas/lead | 7.0 |

**Status:** Integro. Todos os quiz_responses apontam para leads validos. Media de 7 respostas por lead = quiz completo.

---

## 3. QUIZ_FUNNEL_EVENTS

### Schema
| Coluna | Tipo | Nullable |
|--------|------|----------|
| id | uuid | NO |
| session_id | text | NO |
| stage | text | NO |
| question_key | text | YES |
| created_at | timestamptz | NO |
| quiz_version | text | YES |

**Indexes:** pkey(id), idx_qfe_created_at, idx_qfe_stage_qkey

### RLS
- **SEM POLICIES** -- tabela tem RLS habilitado mas zero policies definidas.
- Gravacao funciona via RPC `track_quiz_step` (SECURITY DEFINER).
- Leitura funciona via RPCs analytics (SECURITY DEFINER).

### Volume & Funil

| Stage | Events | Sessoes Unicas | Drop |
|-------|--------|----------------|------|
| arrival | 573 | 417 | - |
| Q1 situacao | 137 | 114 | 72.7% |
| Q2 risco | 108 | 105 | 7.9% |
| Q3 sintoma | 101 | 100 | 4.8% |
| Q4 comportamento | 98 | 97 | 3.0% |
| Q5 frase | 94 | 93 | 4.1% |
| Q6 espiritual | 93 | 92 | 1.1% |
| Q7 desejo | 93 | 92 | 0% |
| result | 165 | 82 | - |
| offer | 151 | 58 | - |
| contact | 3 | 3 | - |
| cta | 20 | 16 | - |

### Problemas
- **[P1] contact = 3 sessoes vs 37 emails + 52 whatsapps** -- o beacon "contact" quase nunca dispara. Suspeita: o step de whatsapp nao emite beacon `contact`, ou o beacon foi adicionado depois da maioria dos leads.
- **[P2] result (82 sessoes) > Q7 (92 sessoes)** -- possivel duplicacao de eventos result (165 events / 82 sessoes = 2x por sessao em media). Nao e problema funcional mas infla metricas se nao tratado com DISTINCT.

---

## 4. TRACKING_SESSIONS

### Schema
| Coluna | Tipo | Nullable |
|--------|------|----------|
| external_id | text | NO (PK) |
| fbp | text | YES |
| fbc | text | YES |
| fbclid | text | YES |
| client_ip | text | YES |
| user_agent | text | YES |
| created_at | timestamptz | NO |

**PK:** external_id (formato qs_UUID)  
**Sem FKs formais** -- join via webhook payload `utm.src`

### RLS
- `service_role_all_tracking_sessions` (ALL, service_role)
- Sem policies para anon/authenticated -- gravacao via RPC `upsert_tracking_session`

### Volume

| Metrica | Valor | % |
|---------|-------|---|
| **Total** | **7** | 100% |
| Com fbc | 7 | 100% |
| Com fbp | 7 | 100% |
| Com fbclid | 5 | 71% |
| Com client_ip | 0 | 0% |

### Problemas
- **[P0] Apenas 7 tracking_sessions vs 127 leads** -- match rate = 5.5%. A imensa maioria dos leads NAO gera tracking_session. O RPC `upsert_tracking_session` nao esta sendo chamado consistentemente pelo quiz.
- **[P1] client_ip = 0% preenchido** -- a coluna existe mas a RPC nunca recebe valor. A versao de 6 args aceita `p_client_ip` mas o quiz nao envia.
- **[P0] Apenas 2/13 SALE_APPROVED tem tracking match** -- reconciliacao mostra que 84.6% dos webhooks aprovados nao conseguem fazer join com tracking_sessions. Isso QUEBRA o envio de fbc/fbp para CAPI.

---

## 5. PURCHASES

### Schema
| Coluna | Tipo | Nullable |
|--------|------|----------|
| id | uuid | NO |
| lead_id | uuid | YES |
| user_id | uuid | YES |
| external_id | text | YES |
| transaction_id | text | YES (UNIQUE) |
| product_name | text | NO |
| product_type | text | NO |
| gross_value | integer | NO |
| status | text | NO |
| kirvano_offer_id | text | YES |
| buyer_email | text | YES |
| utm_source..utm_term | text x5 | YES |
| metadata | jsonb | YES |
| created_at | timestamptz | NO |

**FKs:** purchases_lead_id_fkey -> leads(id), purchases_user_id_fkey -> auth.users(id)  
**Constraint:** product_type IN ('principal','order_bump','upsell','downsell'), status IN ('confirmed','refunded','chargeback')

### RLS
- `admins manage purchases` (ALL, authenticated, is_admin)

### Volume

| Metrica | Valor | % |
|---------|-------|---|
| **Total** | **19** | 100% |
| Com transaction_id | 19 | 100% |
| Com user_id | 19 | 100% |
| **Com lead_id** | **0** | **0%** |
| Com buyer_email | 19 | 100% |
| UTM 5/5 | 19 | 100% |
| Revenue total | R$ 760,40 | - |

**Breakdown por tipo:**
| Tipo | Qtd | Revenue |
|------|-----|---------|
| principal | 11 | R$ 517,00 |
| order_bump | 6 | R$ 109,40 |
| upsell | 2 | R$ 134,00 |

### Problemas
- **[P1] lead_id = 0% (todos NULL)** -- o webhook handler nunca popula lead_id. A FK existe mas nao e usada. Impede join direto purchases->leads para atribuicao.
- **[P2] lead_id nao e populavel via email** -- tentei JOIN leads por email/whatsapp e retornou NULL. Os buyers nao existem na tabela leads (leads capturam whatsapp, webhook envia email diferente, ou buyers nunca passaram pelo quiz).

---

## 6. WEBHOOK_LOGS

### Schema
| Coluna | Tipo | Nullable |
|--------|------|----------|
| id | uuid | NO |
| source | text | NO |
| event_type | text | YES |
| payload | jsonb | NO |
| signature | text | YES |
| signature_valid | boolean | NO |
| processed | boolean | NO |
| processed_at | timestamptz | YES |
| error | text | YES |
| request_ip | text | YES |
| created_at | timestamptz | NO |

### RLS
- `admins read webhook logs` (SELECT, authenticated, is_admin)
- `admins update webhook logs` (UPDATE, authenticated, is_admin)

### Volume

| Metrica | Valor |
|---------|-------|
| Total | 26 |
| Processados | 23 (88.5%) |
| Nao processados | 3 (11.5%) |
| Com erro | 3 (11.5%) |
| **signature_valid = true** | **0 (0%)** |

**Eventos:**
| Tipo | Qtd | Processados | Erros |
|------|-----|-------------|-------|
| SALE_APPROVED | 13 | 13 | 0 |
| SALE_REFUNDED | 12 | 10 | 2 |
| SALE_REFUSED | 1 | 0 | 1 |

**Erros detalhados:**
1. SALE_REFUSED: "Evento ignorado: SALE_REFUSED" -- por design, nao processado
2. 2x SALE_REFUNDED: "Nenhum produto vinculado as offers 09494a43..." -- offer nao cadastrada em product_kirvano_offers

### Problemas
- **[P0] signature_valid = 0% (26/26 invalidas)** -- NENHUM webhook tem assinatura valida. Ou a validacao HMAC esta quebrada, ou o campo nunca e atualizado para true apos validacao. Se a validacao esta desligada, qualquer request forjado e aceito.
- **[P1] SALE_APPROVED orfaos = 0** -- positivo, todas as vendas aprovadas geraram purchase.
- **[P2] 2 SALE_REFUNDED com offer nao mapeada** -- offer 09494a43 nao esta em product_kirvano_offers. Pode ser produto legado ou teste.

---

## 7. RECONCILIATION_REPORTS

### Schema
| Coluna | Tipo |
|--------|------|
| id | uuid (PK) |
| created_at, period_start, period_end | timestamptz |
| total_sales, with_utm, with_tracking, with_fbc, with_fbp, purchase_match | integer |
| divergences | jsonb |
| summary | jsonb |

### RLS
- Apenas service_role (REVOKE ALL de public/anon/authenticated)

### Volume
2 relatorios existentes. O segundo (mais recente) mostra:
- 3 vendas no periodo, 100% com UTM, 67% com tracking, 67% com fbc, 100% purchase match

**Status:** Funcional, pg_cron roda diariamente as 09:00 UTC.

---

## 8. PROCESSED_EVENTS

### Schema
| Coluna | Tipo | PK |
|--------|------|----|
| sale_id | text | YES |
| event_name | text | - |
| processed_at | timestamptz | - |
| emq_response | jsonb | - |

**Volume:** 0 registros. Tabela existe mas nunca foi populada.

### Problema
- **[P2] Tabela orfao** -- provavelmente criada para idempotencia de CAPI events mas nunca integrada ao fluxo.

---

## 9. RISK_EVENTS

### Schema
| Coluna | Tipo |
|--------|------|
| id | uuid (PK) |
| created_at | timestamptz |
| source | text |

**Volume:** 19 registros.

### RLS
- `anon insert risk_events` (INSERT, anon, WITH CHECK true) -- qualquer anon pode inserir.

### Problema
- **[P2] Tabela muito simples** -- apenas id, created_at, source. Sem detalhes do evento de risco. Funciona como contador mas nao como audit trail.

---

## 10. SEGURANCA -- GRANTs Excessivos

### Problema Critico

**[P0] GRANTs ALL para anon em 7 tabelas de tracking/analytics.**

As seguintes tabelas tem GRANTs de ALL (incluindo DELETE, TRUNCATE, UPDATE) para o role `anon`:

| Tabela | anon tem |
|--------|----------|
| leads | SELECT, INSERT, UPDATE, DELETE, TRUNCATE |
| quiz_responses | SELECT, INSERT, UPDATE, DELETE, TRUNCATE |
| quiz_funnel_events | SELECT, INSERT, UPDATE, DELETE, TRUNCATE |
| tracking_sessions | SELECT, INSERT, UPDATE, DELETE, TRUNCATE |
| purchases | SELECT, INSERT, UPDATE, DELETE, TRUNCATE |
| webhook_logs | SELECT, INSERT, UPDATE, DELETE, TRUNCATE |
| processed_events | SELECT, INSERT, UPDATE, DELETE, TRUNCATE |
| risk_events | SELECT, INSERT, UPDATE, DELETE, TRUNCATE |

**RLS salva parcialmente:** as policies restringem acesso efetivo. Porem:
- `quiz_funnel_events` tem **zero policies** com RLS habilitado -- anon nao consegue nada (deny-by-default), mas se alguem adicionar uma policy permissiva, os GRANTs ja estao la.
- `tracking_sessions` so tem policy para service_role -- anon tem GRANTs mas RLS bloqueia. Funciona, mas viola principio de menor privilegio.
- `leads`, `purchases`, `webhook_logs` -- anon tem GRANTs de DELETE/TRUNCATE que nunca deveriam existir, mesmo com RLS bloqueando.

**Recomendacao:** REVOKE excessos de anon em todas essas tabelas. Manter apenas o necessario para RPCs SECURITY DEFINER (que bypass RLS e GRANTs).

---

## 11. RETENCAO (pg_cron)

| Job | Schedule | Retencao |
|-----|----------|----------|
| cleanup-webhook-logs | 03:00 UTC diario | 90 dias |
| cleanup-tracking-sessions | 03:00 UTC diario | 30 dias |
| daily-reconciliation | 09:00 UTC diario | - |
| process-webhook-jobs | cada minuto | - |
| retry-pending-grants | cada 5 min | - |
| expire-pending-pix | cada 15 min | - |

### Problema
- **[P1] tracking_sessions retencao 30d vs reconciliacao** -- a reconciliacao precisa fazer JOIN com tracking_sessions. Se uma venda do dia 1 so for reconciliada no dia 31+, o tracking ja foi deletado. Na pratica, como reconciliacao roda diariamente (24h lookback), o risco e baixo. Mas para analises retroativas, o dado se perde.

---

## TABELA RESUMO DE MATCH RATES

| Relacao | Match | Total | Rate | Status |
|---------|-------|-------|------|--------|
| leads -> quiz_responses | 127/127 | 127 | 100% | OK |
| leads -> contato (email ou whatsapp) | 89/127 | 127 | 70.1% | ATENCAO |
| leads -> UTM 5/5 | 121/127 | 127 | 95.3% | OK |
| leads -> fbclid | 122/127 | 127 | 96.1% | OK |
| SALE_APPROVED -> purchase | 13/13 | 13 | 100% | OK |
| SALE_APPROVED -> tracking_session | 2/13 | 13 | **15.4%** | **CRITICO** |
| purchases -> lead_id (FK) | 0/19 | 19 | **0%** | **CRITICO** |
| purchases -> UTM 5/5 | 19/19 | 19 | 100% | OK |
| webhook_logs -> signature_valid | 0/26 | 26 | **0%** | **CRITICO** |
| quiz_funnel contact beacon -> leads com contato | 3/89 | 89 | **3.4%** | **CRITICO** |

---

## RANKING DE PROBLEMAS

### P0 -- Criticos (impactam atribuicao/seguranca AGORA)

1. **tracking_sessions: 5.5% match rate (7/127 leads)** -- a grande maioria dos leads nao gera tracking_session. CAPI perde fbc/fbp em ~85% das vendas. Causa provavel: o quiz nao chama `upsert_tracking_session` de forma consistente.

2. **signature_valid = 0% em todos webhooks** -- validacao HMAC esta desligada ou broken. Qualquer POST forjado para o endpoint de webhook seria aceito e processado.

3. **GRANTs ALL para anon em tabelas sensiveis** -- leads, purchases, webhook_logs, tracking_sessions tem GRANTs de DELETE/TRUNCATE/UPDATE para anon. RLS protege, mas e defense-in-depth insuficiente.

### P1 -- Importantes (degradam qualidade de dados)

4. **purchases.lead_id = 0% (nunca populado)** -- impede join purchases->leads para atribuicao end-to-end. O webhook handler nao busca lead_id por email/whatsapp.

5. **contact beacon dispara em 3.4% dos leads com contato** -- o funil no dashboard mostra "Email capturado = 3" quando na verdade 89 leads deram contato. O beacon de whatsapp provavelmente nao existe.

6. **tracking_sessions.client_ip nunca populado** -- a coluna existe, o parametro da RPC tambem, mas o quiz nao envia.

7. **30d retencao em tracking_sessions** -- reconciliacoes retroativas perdem dado. Considerar aumentar para 90d (mesmo que webhook_logs).

### P2 -- Menores

8. **idx_leads_email sem lower()** -- indice real usa `email` direto, nao `lower(email)` como a migration pretendia.
9. **2 SALE_REFUNDED com offer nao mapeada** -- offer 09494a43 nao cadastrada.
10. **processed_events tabela vazia** -- nunca integrada ao fluxo.
11. **quiz_funnel_events sem policies RLS** -- funciona por deny-by-default, mas deveria ter policies explicitas.
12. **Events result/offer duplicados** -- media 2x por sessao, infla contagem bruta.
