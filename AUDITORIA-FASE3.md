# AUDITORIA FASE 3 — RPCs de Analytics

**Data:** 2026-06-14
**Auditor:** Claude (read-only, zero codigo)
**Fonte:** SQL real lido de `supabase/migrations/`
**Validacao:** queries manuais via `npx supabase db query --linked`

---

## 1. RESUMO EXECUTIVO

| Severidade | Qtd | Resumo |
|------------|-----|--------|
| **P0** | 2 | Receita inflada em 3 RPCs; funil quiz sem stage "arrival" |
| **P1** | 3 | quiz_conversion conta convertidos inflados; persist_lead nao e idempotente; funil contact/cta invertido |
| **P2** | 2 | Timezone mismatch (cohort UTC vs funnel BRT); stage "result"/"offer" ignorados no funil |

---

## 2. RPCs DE ANALYTICS (leitura)

### 2.1 analytics_funnel(p_days)
**Arquivo:** `20260531_analytics_rpcs.sql` (linhas 45-71)
**O que faz:** Retorna total_leads, with_archetype, with_email, purchasers, upsell_buyers, downsell_buyers, total_revenue.
**Como funciona:** 2 CTEs separados (period_leads, period_purchases). Revenue somada direto de `purchases`.

**Fidelidade:** OK. Usa CTEs independentes sem JOIN entre leads e purchases, entao nao sofre fan-out.
- `purchasers = COUNT(DISTINCT buyer_email) WHERE product_type='principal'` -- correto
- `total_revenue = SUM(gross_value)/100` de TODAS as purchases (principal + bump + upsell + downsell) -- **intencional, receita total**

**Verificacao (30d):**

| Metrica | RPC diz | Query manual | Delta |
|---------|---------|-------------|-------|
| total_leads | 127 | 127 | 0 |
| with_email | 37 | 37 | 0 |
| purchasers | 11 | 11 | 0 |
| total_revenue | R$760,40 | R$760,40 | 0 |

**Resultado:** SEM PROBLEMAS.

---

### 2.2 analytics_top_segments(p_days, p_min_leads)
**Arquivo:** `20260531_analytics_rpcs.sql` (linhas 7-42)
**O que faz:** Agrupa leads por archetype/situation/desire, calcula conversao e receita por segmento.

**PROBLEMA P0 — Receita inflada por cross-join com leads duplicados**

A query faz `LEFT JOIN purchases ON lower(l.email) = lower(p.buyer_email)`.
Se um email aparece em N linhas de `leads`, cada purchase e multiplicada N vezes no SUM.

**Caso real:** `celiaborim@hotmail.com` tem 2 leads (archetypes: sobrecarga, culposa) e 2 purchases (R$47 + R$19.90).
- Resultado no join: 2 leads x 2 purchases = **4 linhas**, SUM = R$133.80 (2x o real)
- Correto: R$66.90

Alem disso, `COUNT(*)` (total_leads) tambem infla: cada lead e contada 1x por purchase.

**purchasers:** `COUNT(DISTINCT p.buyer_email)` -- correto, nao infla.
**revenue:** `SUM(p.gross_value)` -- **INFLADO** pelo fan-out.

---

### 2.3 analytics_revenue_breakdown(p_days)
**Arquivo:** `20260531_analytics_rpcs.sql` (linhas 74-94)
**O que faz:** Agrupa purchases por product_name/product_type, conta sales e revenue.

**Fidelidade:** OK. Query direta em `purchases` sem join com leads. Sem fan-out possivel.

**Verificacao (30d):**
- 11 sales principal, 6 order_bump, 2 upsell -- **confere** com dados brutos.
- Revenue correta (divide gross_value por 100).

**Resultado:** SEM PROBLEMAS.

---

### 2.4 analytics_quiz_conversion(p_days)
**Arquivo:** `20260531_analytics_rpcs.sql` (linhas 97-124)
**O que faz:** Para cada resposta de quiz (question_key + answer_value), conta total e convertidos.

**PROBLEMA P1 — `converted` usa COUNT(p.id) em vez de COUNT(DISTINCT)**

```sql
COUNT(p.id)::bigint AS converted  -- INFLADO
```

Se um lead tem 2 purchases, `COUNT(p.id)` = 2 (nao 1). Deveria ser `COUNT(DISTINCT p.buyer_email)`.

**Caso real verificado:**
| answer_value | total | converted (RPC) | converted (correto) | Inflacao |
|-------------|-------|-----------------|---------------------|----------|
| todos (sintoma) | 49 | 5 | 2 | +150% |
| casada-filhos-grandes | 61 | 4 | 2 | +100% |

**conv_rate tambem inflado** porque usa COUNT(p.id) no numerador.

Alem disso, sofre o mesmo fan-out de leads duplicados que `analytics_top_segments`.

---

### 2.5 analytics_cohort_weekly(p_weeks)
**Arquivo:** `20260531_analytics_rpcs.sql` (linhas 127-151)
**O que faz:** Agrupa leads por semana de criacao, calcula buyers e revenue por coorte.

**PROBLEMA P0 — Receita inflada pelo mesmo fan-out de leads duplicados**

```sql
FROM leads l LEFT JOIN purchases p ON lower(l.email) = lower(p.buyer_email)
```

**Verificacao (semana 2026-06-08):**

| Metrica | RPC diz | Query manual | Delta | Causa |
|---------|---------|-------------|-------|-------|
| leads | 116 | 116 | 0 | |
| buyers | 4 | 4 | 0 | DISTINCT protege |
| revenue | **R$291,70** | **R$224,80** | **+R$66,90 (+29.8%)** | celiaborim 2 leads x 2 purchases |

**PROBLEMA P2 — Timezone:** `date_trunc('week', l.created_at)` usa UTC. Dashboard do Brasil espera BRT.
Leads criados entre 21h-0h BRT (00-03 UTC) caem na semana seguinte.

**Filtro `l.archetype IS NOT NULL`:** exclui leads sem archetype da contagem. Parece intencional (quiz incompleto), mas pode confundir se comparado com analytics_funnel que conta TODOS os leads.

---

### 2.6 analytics_quiz_funnel(p_days)
**Arquivo:** `20260611_fix_quiz_funnel_today.sql` (versao final com cutoff CTE)
**O que faz:** Conta sessoes distintas por estagio do quiz: arrival, Q1-Q7, contact, cta.

**PROBLEMA P0 — Stage "arrival" NAO EXISTE nos dados**

A RPC espera `stage = 'arrival'`, mas os dados reais usam stages:
- `question` (com question_key)
- `result` (165 eventos)
- `offer` (151 eventos)
- `contact` (3 eventos)
- `cta` (20 eventos)

**Nao ha nenhum evento com stage='arrival'.** O topo do funil fica VAZIO (0 sessoes).
Na pratica, `situacao` (Q1) se torna o topo = 137 sessoes.

**PROBLEMA P2 — Stages "result" e "offer" sao ignorados**

A RPC so conta: arrival, question(Q1-Q7), contact, cta.
Mas o quiz emite "result" (165) e "offer" (151) entre Q7 e contact. Esses eventos sao descartados silenciosamente.

**PROBLEMA P1 — Funil invertido entre contact e cta**

| Stage | Reached |
|-------|---------|
| contact (email) | 3 |
| cta (clicou comprar) | 16 |

Isso gera `drop_pct = -433.3%` (negativo = "crescimento"), o que e absurdo num funil.
**Causa:** muita gente clica "comprar" SEM preencher email. O funil assume contact < cta, mas na realidade cta pode acontecer sem contact.

---

### 2.7 analytics_checkout_funnel(p_days)
**Arquivo:** `20260611_analytics_checkout_funnel.sql` (linhas 16-70)
**O que faz:** Conta sessoes por stage do checkout: view, form_start, identity, method, payment_info, submit, purchase.

**Fidelidade:** OK. Usa `COUNT(DISTINCT session_id)` por stage.
Cutoff com BRT para `p_days=0` (hoje) -- **correto e consistente**.

**Dados reais (90d):** view=6, form_start=2, identity=4, method=2, payment_info=1, submit=1, purchase=1

**PROBLEMA menor:** identity (4) > form_start (2) = drop negativo (-100%).
Possivel causa: form_start beacon nao dispara em todos os cenarios. Nao e bug da RPC, e bug de instrumentacao.

**Resultado:** RPC correta dado os dados. Problema e na emissao de beacons.

---

### 2.8 analytics_full_funnel(p_days)
**Arquivo:** `20260611_analytics_checkout_funnel.sql` (linhas 82-178)
**O que faz:** Junta quiz (arrival, Q1, Q7, contact, cta) + checkout (view, identity, submit, purchase).

**Herda todos os problemas do quiz_funnel:**
- arrival = 0 (stage nao existe)
- contact/cta invertido
- "result"/"offer" ignorados

**Resultado:** Mesmos problemas de 2.6.

---

## 3. RPCs DE ESCRITA

### 3.1 persist_lead(13 params)
**Arquivo:** `20260606_fix_persist_lead_clickids.sql` (versao final com fbclid/gclid)
**O que faz:** INSERT INTO leads, retorna uuid.

**PROBLEMA P1 — NAO e idempotente**

Sem `ON CONFLICT`. Chamada dupla cria 2 leads identicos.
**Caso real:** `celiaborim@hotmail.com` tem 2 leads (IDs distintos, 10min de diferenca).
Isso causa o fan-out que infla receita em 3 RPCs de analytics.

**Campos:** todos opcionais (DEFAULT NULL), exceto p_risk_flag (DEFAULT false).

---

### 3.2 save_lead_email(p_lead_id, p_email) / save_lead_contact
**Arquivo:** `20260605_hardening_rpcs.sql` (linhas 55-69)

`save_lead_email`: UPDATE leads SET email WHERE id = p_lead_id **AND email IS NULL**.
- **Idempotente:** sim, segunda chamada com email diferente nao sobrescreve.
- **Validacao:** regex basico de email.

`save_lead_contact`: referenciada em REVOKE mas **NAO tem CREATE FUNCTION em nenhuma migration**. Funcao fantasma — provavelmente criada manualmente no dashboard ou removida. REVOKE nao falha se funcao nao existe (PostgreSQL ignora silenciosamente? Nao — falha. Pode ter sido criada fora das migrations.)

---

### 3.3 upsert_tracking_session
**Arquivo:** `20260605_hardening_rpcs.sql` (linhas 95-118) -- versao 5 args
**Versao atual:** 6 args (com p_client_ip), overload de 5 args dropada em `20260614_utm_complete_drop_overload.sql`.

**Idempotencia:** SIM. Usa `ON CONFLICT (external_id) DO UPDATE SET ... COALESCE(EXCLUDED, existing)`.
Nunca sobrescreve valor existente com NULL. Correto.

---

### 3.4 persist_quiz_responses(p_rows jsonb)
**Arquivo:** `20260605_hardening_rpcs.sql` (linhas 73-91)
**O que faz:** INSERT INTO quiz_responses em batch via jsonb_array_elements.

**Idempotencia:** NAO. Sem ON CONFLICT. Chamada dupla duplica respostas.
Impacto: analytics_quiz_conversion contaria respostas duplicadas, inflando "total" e distorcendo conv_rate.

---

### 3.5 run_reconciliation(p_hours_back)
**Arquivo:** `20260614_reconciliation_job.sql`
**O que faz:** Compara webhook_logs (SALE_APPROVED) com purchases e tracking_sessions. Grava divergencias em reconciliation_reports.

**Fidelidade:** Boa. Checa UTM completa, purchase match, fbc/fbp.
**Purchase match:** usa `transaction_id LIKE sale_id || '_%'` -- correto para o padrao Kirvano.
**Idempotencia parcial:** cada execucao grava um novo report (nao duplica dados, so cria relatorios).

---

## 4. RPCs NAO ENCONTRADAS NAS MIGRATIONS

| RPC | Status |
|-----|--------|
| `save_lead_contact` | REVOKE existe, CREATE FUNCTION nao encontrado. Funcao fantasma. |
| `track_quiz_step` | REVOKE existe, CREATE FUNCTION nao encontrado. Funcao fantasma. |
| `track_checkout_step` | Nao referenciada em nenhuma migration. Nao existe. |

---

## 5. TABELA DE FIDELIDADE: RPC vs REALIDADE

| Metrica | RPC | Valor RPC | Valor correto | Delta | Causa raiz |
|---------|-----|-----------|---------------|-------|------------|
| Revenue cohort 06/08 | analytics_cohort_weekly | R$291,70 | R$224,80 | **+29.8%** | fan-out leads duplicados |
| Converted (sintoma=todos) | analytics_quiz_conversion | 5 | 2 | **+150%** | COUNT(p.id) sem DISTINCT |
| Converted (situacao=casada-filhos-grandes) | analytics_quiz_conversion | 4 | 2 | **+100%** | COUNT(p.id) sem DISTINCT |
| Quiz arrival | analytics_quiz_funnel | 0 | ~165 (result) | **-100%** | stage "arrival" nao emitido |
| Quiz drop contact→cta | analytics_quiz_funnel | -433% | n/a | **absurdo** | contact nao e pre-requisito de cta |
| Funnel total_revenue (30d) | analytics_funnel | R$760,40 | R$760,40 | 0 | OK (sem join) |
| Revenue breakdown | analytics_revenue_breakdown | correto | correto | 0 | OK (sem join) |

---

## 6. PROBLEMAS PRIORIZADOS

### P0 — Corrigir URGENTE

**P0-1: Receita inflada em 3 RPCs por fan-out de leads duplicados**
- RPCs afetadas: `analytics_top_segments`, `analytics_cohort_weekly`, `analytics_quiz_conversion`
- Causa: `leads JOIN purchases ON email` sem deduplicar leads
- Fix: usar subquery com `DISTINCT ON (email)` ou `GROUP BY email` antes do join, ou separar receita em CTE independente (como analytics_funnel ja faz)

**P0-2: Quiz funnel sem topo — stage "arrival" nao existe**
- RPCs afetadas: `analytics_quiz_funnel`, `analytics_full_funnel`
- Causa: quiz emite "question"/"result"/"offer" mas nunca "arrival"
- Fix: ou emitir beacon "arrival" no quiz, ou usar `situacao` (Q1) como topo do funil

### P1 — Corrigir em seguida

**P1-1: analytics_quiz_conversion conta convertidos inflados**
- `COUNT(p.id)` deve ser `COUNT(DISTINCT p.buyer_email)`

**P1-2: persist_lead nao e idempotente**
- Sem ON CONFLICT. 2 chamadas = 2 leads. Causa P0-1.
- Fix: ON CONFLICT (lower(email)) para leads com email, ou debounce no front

**P1-3: Funil contact > cta invertido**
- contact (3) < cta (16) = drop negativo
- Fix: reordenar ou tratar como estagios paralelos (nao sequenciais)

### P2 — Melhorias

**P2-1: Timezone mismatch no cohort**
- `analytics_cohort_weekly` trunca semanas em UTC
- `analytics_quiz_funnel` e `analytics_checkout_funnel` usam BRT para p_days=0
- Inconsistencia: mesmo lead pode aparecer em semanas diferentes dependendo da RPC

**P2-2: Stages "result" e "offer" ignorados no funil**
- 165 eventos "result" e 151 "offer" sao descartados
- Se sao estagios validos do quiz, devem aparecer no funil entre Q7 e contact

---

## 7. RECEITA MULTI-PRODUTO: INFLADA?

**Pergunta:** 1 venda com 3 produtos = R$47 ou R$141?

**Resposta:** Depende da RPC.

- `analytics_funnel`: R$760,40 = soma CORRETA de TODAS as purchases (principal + bump + upsell). Uma venda com 3 produtos conta R$47+R$16.90+R$19.90 = R$83.80. **NAO inflada** — sao 3 transacoes distintas na tabela.

- `analytics_top_segments` / `analytics_cohort_weekly`: **INFLADA** pelo fan-out de leads duplicados, NAO pelo multi-produto em si. O multi-produto e modelado corretamente (1 row por product na tabela purchases).

- `analytics_quiz_conversion`: conv_rate inflada porque `COUNT(p.id)` conta cada purchase como uma conversao separada. Um buyer com 3 purchases conta como "converted=3" em vez de "converted=1".

---

## 8. SEGURANCA (nota)

| RPC | Acesso |
|-----|--------|
| analytics_* (5 originais) | service_role only (REVOKE em 20260611) |
| analytics_quiz_funnel | service_role only |
| analytics_checkout_funnel | service_role only |
| analytics_full_funnel | service_role only |
| run_reconciliation | service_role only |
| persist_lead | anon + authenticated |
| save_lead_email | anon + authenticated |
| persist_quiz_responses | anon + authenticated |
| upsert_tracking_session | anon + authenticated |

Todas as RPCs de analytics estao corretamente restritas a service_role. RPCs de escrita permitem anon (necessario para quiz sem login). Seguranca OK.
