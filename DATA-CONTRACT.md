# DATA CONTRACT — Constituição de Dados (RASCUNHO)
> **Status:** RASCUNHO (Passada 1). Vira definitivo após execução da Passada 2.  
> **Data:** 2026-06-15 | **Projeto:** cemjibbauvvyfaxilrvm  
> **Regra:** Este documento é a fonte de verdade sobre como cada métrica deve ser calculada.  
> **Referenciado em:** CLAUDE.md (todo Claude lê primeiro)

---

## §1 PRINCÍPIOS

1. **Uma fonte por métrica.** Se duas queries dão números diferentes, uma está errada.
2. **`is_test` na origem.** Eventos de teste ficam no banco mas NUNCA contam.
3. **Linha de corte.** `production_start_at = '2026-06-14'`. Antes = legado/sujo.
4. **Prova na fonte viva.** Banco e Meta Events Manager. Nunca código, migrations, ou "✅" no chat.
5. **Banco auto-documentado.** `COMMENT ON` em toda coluna/função sensível.

---

## §2 DEFINIÇÕES CANÔNICAS

### Receita
```
FONTE ÚNICA: VIEW vendas_reais
= purchases WHERE status = 'confirmed'
                AND is_test = false
                AND created_at >= production_start_at
MÉTRICA: SUM(gross_value) / 100  →  R$
```
**Onde usar:** Visão Geral, Analytics, Vendas, qualquer dashboard.  
**PROIBIDO:** `entitlements × products.price_cents` (ignora desconto, conta grant manual).

### Leads
```
FONTE ÚNICA: VIEW leads_reais
= leads WHERE is_test = false
            AND created_at >= production_start_at
MÉTRICA: COUNT(*)
```
**PROIBIDO:** `COUNT(quiz_responses)` (7 rows por lead = inflação ~7x).

### Compradores únicos
```
FONTE: SELECT COUNT(DISTINCT buyer_email) FROM vendas_reais
```

### Conversão (lead → compra)
```
JOIN KEY: external_id (qs_) — NÃO email
= leads_reais l INNER JOIN vendas_reais p ON l.external_id = p.src
MÉTRICA: COUNT(DISTINCT l.id) FILTER (WHERE p.id IS NOT NULL) / COUNT(DISTINCT l.id)
```
**PROIBIDO:** `lower(l.email) = lower(p.buyer_email)` (email NULL pós-WhatsApp).  
**PROIBIDO:** `COUNT(p.id)` sem DISTINCT (double-count multi-produto).  
**PROIBIDO:** `entitlements` como proxy de conversão (inclui grants manuais).

### Arquétipo
```
FONTE: leads.archetype
```
**PROIBIDO:** `quiz_responses.archetype` (NULL nos novos).

### Segmentos (top_segments)
```
JOIN: leads_reais l LEFT JOIN vendas_reais p ON l.external_id = p.src
AGGREGATES: usar subquery ou DISTINCT para evitar fan-out
```

---

## §3 TRACKING / META

### fbc (Facebook Click ID)
```
REGRA: Se cookies.fbclid já começa com "fb.1." → usar AS IS (já é fbc)
        Se é fbclid raw → empacotar: fb.1.{timestamp_original}.{fbclid}
NUNCA: re-empacotar fbc em fbc (double-wrap)
```

### Purchase (CAPI)
```
EMISSOR ÚNICO: nossa CAPI (meta-capi.server.ts)
event_id: sale_id (transactionId do Kirvano)
value: payload.total_price (real, por venda)
content_ids: [slug padronizado] — mesmo no client e server
Kirvano CAPI: DESLIGADA (após retry nosso estar no ar)
```

### Dedup
```
REGRA: event_id idêntico entre pixel browser e CAPI server
       → Meta deduplica automaticamente
Pixel /obrigado: NÃO dispara Purchase (confirmado)
```

### ph (Phone Hash)
```
FORMATO: SHA-256 de número E.164 (ex: +5511999990000)
NORMALIZAÇÃO: sempre prefixar +55, remover espaços/traços, strip leading 0
ENVIAR EM: Lead (pixel) + Purchase (CAPI) + IC (quando disponível)
```

### content_ids
```
FORMATO ÚNICO: ["rotina-de-paz"] (slug com hífen, minúsculo)
ONDE: InitiateCheckout (client) + Purchase (CAPI) + ViewContent (quando implementar)
```

### Teste vs Produção
```
PIXEL TESTE: dataset separado (test_event_code ou pixel ID diferente)
PIXEL PROD: 838169472100225 — NUNCA recebe evento de dev/teste
DOMAIN GUARD: só dispara em rotinadepaz.com.br e sacra.rotinadepaz.com.br
is_test NO BANCO: carimbar na escrita por denylist (emails/phones de teste)
```

---

## §4 REGRAS DE is_test

```sql
-- Determina se é teste no momento da escrita
is_test = (
  buyer_email IN ('guilherme@...', 'teste@...', ...)  -- denylist do dono
  OR buyer_phone IN ('+5511...', ...)                   -- phones de teste
  OR created_at < '2026-06-14'                          -- antes da linha de corte
  OR source_environment = 'sandbox'                     -- flag do webhook
)
```

---

## §5 VIEWS CANÔNICAS (a criar na Passada 2)

```sql
-- vendas_reais: fonte única de receita
CREATE VIEW vendas_reais AS
SELECT * FROM purchases
WHERE status = 'confirmed'
  AND is_test = false
  AND created_at >= (SELECT value::timestamptz FROM checkout_config WHERE key = 'production_start_at');

-- leads_reais: fonte única de leads
CREATE VIEW leads_reais AS
SELECT * FROM leads
WHERE is_test = false
  AND created_at >= (SELECT value::timestamptz FROM checkout_config WHERE key = 'production_start_at');

-- receita_real(): função para dashboards
CREATE FUNCTION receita_real() RETURNS numeric AS $$
  SELECT COALESCE(SUM(gross_value), 0) / 100.0 FROM vendas_reais;
$$ LANGUAGE sql STABLE;
```

---

## §6 RECONCILIAÇÃO

```
REGRA: webhook_logs ↔ purchases ↔ Meta (via event_id = sale_id)
CRON: daily-reconciliation (09:00 UTC)
ALERTA: quando diverge > 0 entre fontes
TESTE: que falha se definição canônica quebrar
```

---

## §7 DRIFT — Itens a migrar

| Item | Ação necessária |
|------|-----------------|
| tracking_sessions | Criar migration |
| quiz_funnel_events | Criar migration |
| app_products, offer_settings, product_offers | Criar migration |
| track_quiz_step, track_checkout_step, save_lead_contact (RPCs) | Criar migration |
| checkout schema (15 tabelas, 3 RPCs) | Criar migration completa |

---

> 🛑 **RASCUNHO — Será finalizado após execução da Passada 2.**  
> Referência: `DIAGNOSTICO-REAL.md` para a lista completa de bugs e prioridades.
