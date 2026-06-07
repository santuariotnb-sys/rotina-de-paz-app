# Plano de Execucao — Missao Admin Producao

> Gerado: 2026-06-07 | Status: AGUARDANDO APROVACAO
> Baseado em: 6 subagentes de exploracao paralela (read-only)

---

## Resumo das Descobertas Criticas

| # | Achado | Impacto |
|---|--------|---------|
| 1 | `quiz_responses` tem schema ANTIGO (JSONB blob) mas RPC espera colunas individuais (`question_key`, `answer_value`, `time_to_answer`) que NAO EXISTEM | E5 depende de migration |
| 2 | LP persiste quiz em BATCH (fim) — nao incremental. Sem tracking de abandono por etapa | E5 precisa instrumentar LP |
| 3 | `admin.vendas.tsx` usa `entitlements` + preco de catalogo em vez de `purchases` (que tem `product_type` e `gross_value` real) | E4 precisa trocar source |
| 4 | Order bumps mostram R$0 porque matching usa strings placeholder `"..."` | E4 fix simples |
| 5 | `admin.vendas.tsx` tem PERIODS hardcoded em vez de importar de constants.ts | E2 precisa refatorar |
| 6 | `tracking_sessions` referenciada em RPC mas tabela possivelmente nao criada | E1 verificar antes de DELETE |
| 7 | Quiz Sacra (outro quiz) JA tem schema normalizado (`quiz_sacra_answers` + `quiz_sacra_funnel`) — modelo a seguir | E5 referencia |

---

## E1 — Limpeza de Dados de Teste

### Arquivos
- Nenhum arquivo de codigo tocado (operacao 100% SQL)
- Backup sera salvo em `backups/2026-06-07/`

### Abordagem
1. Ativar `tnb-careful`
2. Dry-run: `SELECT count(*) FROM <tabela> WHERE created_at < '2026-06-07T00:00:00-03:00'`
3. Apresentar contagens ao usuario e aguardar OK
4. Exportar CSV de cada tabela-alvo (via `supabase` CLI ou query)
5. DELETE na ordem segura (respeita FKs):
   - **Tier 1 (folhas):** `support_messages`, `webhook_logs`, `admin_audit_logs`
   - **Tier 2 (pais):** `support_tickets`
   - **Tier 3 (pipeline):** `purchases`, `quiz_responses`, `leads`, `entitlements`
6. Verificar: `tracking_sessions` — confirmar se tabela existe antes de tentar DELETE
7. NAO TOCAR: `products`, `ebooks`, `courses`, `course_lessons`, `louvores`, `audio_tracks`, `product_kirvano_offers`, `profiles`, `auth.users`
8. Confirmar zeros pos-limpeza

### Riscos
- `tracking_sessions` pode nao existir (RPC referencia mas CREATE TABLE nao encontrado em migrations)
- `profiles` e `auth.users` de teste — so com OK explicito do usuario
- Banco compartilhado — confirmar que WHERE filtra corretamente

### Como Testar
- `SELECT count(*)` pos-DELETE = 0 em todas as tabelas-alvo
- Admin mostra dashboards zerados sem erros

---

## E2 — Controle de Data "Hoje"

### Arquivos a Tocar
| Arquivo | Linha | Acao |
|---------|-------|------|
| `src/lib/admin/constants.ts` | 30-41 | Adicionar `{ label: "Hoje", days: 0 }` como primeiro item; ajustar `sinceISO` para retornar inicio do dia (America/Sao_Paulo) quando `days === 0` |
| `src/routes/admin.vendas.tsx` | 25-30, 55 | REMOVER PERIODS/sinceISO hardcoded; importar de constants.ts |

### Abordagem
1. Em `constants.ts`:
   - Inserir `{ label: "Hoje", days: 0 }` no inicio do array PERIODS
   - Em `sinceISO`: se `days === 0`, calcular meia-noite de hoje em America/Sao_Paulo e retornar ISO
   - Manter logica existente para days > 0 intacta
2. Em `admin.vendas.tsx`:
   - Remover linhas 25-30 (const PERIODS local)
   - Remover linha 55 (sinceISO local)
   - Importar `{ PERIODS, type Period, sinceISO }` de `@/lib/admin/constants`
   - Ajustar variavel de uso (renomear se conflito)
3. Verificar `admin.analytics.tsx` — usa `period.days` direto nas RPCs; se days=0 causar problema, tratar no RPC ou no fetch

### Paginas que propagam automaticamente (ja importam constants.ts)
- `admin.leads.tsx` ✅
- `admin.quiz.tsx` ✅
- `admin.tracking.tsx` ✅
- `admin.analytics.tsx` ✅ (usa days, precisa verificar se days=0 funciona nas RPCs)

### Riscos
- `sinceISO` com days=0 retornaria `Date.now()` (errado) — tratamento explicito necessario
- RPCs de analytics recebem `days` como param — confirmar que `days=0` e tratado server-side
- Timezone: usar `Intl.DateTimeFormat` ou `toLocaleString('sv', {timeZone})` para pegar meia-noite correta

### Como Testar
- Abrir cada tela analitica, clicar "Hoje", verificar que filtra apenas dados do dia corrente
- Verificar que 7d/30d/90d/Tudo continuam funcionando
- Verificar que admin.vendas.tsx usa o mesmo comportamento das outras

---

## E3 — Export CSV em Todas as Telas

### Arquivos a Tocar
| Arquivo | Linha Header | Dados para Export |
|---------|-------------|-------------------|
| `src/routes/admin.quiz.tsx` | ~201 | quiz_responses (question_key, answer_value, lead archetype, created_at) |
| `src/routes/admin.vendas.tsx` | ~148 | entitlements/purchases (produto, valor, status, email, data) |
| `src/routes/admin.index.tsx` | ~68 | KPIs resumidos (archetypes, receita diaria) |
| `src/routes/admin.analytics.tsx` | ~126 | funnel, segments, revenue breakdown |

### Padrao Existente (referencia: admin.leads.tsx:167-172)
```tsx
<button onClick={handleExport} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-[12px] font-medium text-white/70 hover:bg-white/10">
  <Download className="h-3.5 w-3.5" /> CSV
</button>
```

### Abordagem
- Importar `downloadCsv` de `@/lib/admin/csv` + `Download` de lucide-react
- Criar `handleExport()` que mapeia dados filtrados pelo periodo atual para objetos flat
- Filename: `{contexto}-{period.label}-{YYYY-MM-DD}.csv`
- Posicionar botao no header, adjacente aos botoes de periodo (mesmo padrao)

### Riscos
- Nenhum risco significativo (aditivo, nao altera dados)
- Quiz pode ter muitas linhas — verificar se nao trava o browser

### Como Testar
- Clicar CSV em cada pagina, abrir arquivo, confirmar que dados batem com o que a tela mostra
- Testar com periodo "Hoje" (E2) — CSV deve refletir filtro

---

## E4 — Vendas com Dados Reais

### Arquivos a Tocar
| Arquivo | Linhas | Acao |
|---------|--------|------|
| `src/routes/admin.vendas.tsx` | 46-137 | Refatorar para usar `purchases` como fonte principal |

### Abordagem
1. **Trocar fonte de dados**: em vez de `entitlements` + lookup de `products.price_cents`, usar `purchases` diretamente:
   - `purchases` ja tem: `product_type` (principal/order_bump/upsell/downsell), `gross_value` (centavos reais), `status`, `buyer_email`, `created_at`
2. **KPIs**:
   - Receita aprovada = SUM(`gross_value`) WHERE `status = 'confirmed'`
   - Vendas aprovadas = COUNT WHERE `status = 'confirmed'`
   - Estornos = COUNT WHERE `status IN ('refunded', 'chargeback')`
3. **Funil (bump/upsell/downsell)**: usar `product_type` direto do purchases — ELIMINA matching fragil por nome
4. **Manter entitlements** como fonte secundaria para "ultimas vendas" se necessario (ou unificar em purchases)
5. **Tabela de vendas recentes**: mostrar de `purchases` (tem product_name, gross_value, status, created_at)

### Riscos
- `purchases` so e populada pelo webhook — vendas anteriores a criacao da tabela (31/05) nao existem
- Se nao houver purchases ainda (pre-limpeza E1 remove tudo), a pagina mostrara zeros (correto pos-E1)
- `product_kirvano_offers.label` precisa estar configurado para novos webhooks classificarem corretamente

### Como Testar
- Apos E1 (limpeza): pagina mostra zeros
- Simular webhook de venda (skill `test-webhook`) e verificar que purchases aparece com tipo correto
- Soma dos cards (bump + upsell + downsell + principal) == receita total

---

## E5 — Analytics de Jornada do Quiz (a mais complexa)

### Descoberta Critica: LP Persiste em BATCH

A LP do quiz (`~/rotina-de-paz`) persiste respostas **apenas no fim** (batch). Nao ha como medir drop-off por etapa apenas com dados atuais.

**Porem**: Quiz Sacra JA tem modelo normalizado com:
- `quiz_sacra_answers` (question_key, answer_value, time_on_screen)
- `quiz_sacra_funnel` (screen_name, entered_at, exited_at, exit_type)

### Plano em 2 Partes

#### Parte A — Dashboard com dados DISPONIVEIS (implementar agora)
Com o schema atual (`quiz_responses` JSONB + `leads`), podemos mostrar:
1. **Taxa de conclusao**: leads criados vs leads com respostas completas
2. **Distribuicao de respostas por pergunta** (ja existe parcialmente)
3. **Tempo total** (se disponivel no JSONB)
4. **Taxa de captura de email**: leads com email vs sem
5. **Conversao quiz→compra**: leads com email vs entitlements

#### Parte B — Instrumentar LP para tracking granular (PROPOSTA — requer OK do usuario)

**Opcao 1 (recomendada):** Adaptar o modelo do Quiz Sacra para o quiz principal:
- Chamar `persist_quiz_responses` (RPC que ja existe) **por pergunta** (mudar LP)
- Criar migration para adicionar colunas faltantes em `quiz_responses`
- Adicionar tracking de "quiz started" vs "quiz completed" para medir abandono

**Opcao 2:** Usar eventos Meta Pixel existentes (Quiz_Q1_Answered, etc.) como proxy:
- Parsear `analytics`/`track-event` table se existir
- Menos preciso, nao requer mudanca na LP

**Opcao 3:** Criar endpoint de heartbeat/progresso na LP:
- A cada pergunta respondida, enviar evento leve ao Supabase
- Nao persiste resposta completa, apenas "lead X chegou na pergunta Y"

### Arquivos a Tocar (Parte A)
| Arquivo | Acao |
|---------|------|
| `src/routes/admin.quiz.tsx` | Adicionar secao de funil com dados disponiveis |
| `src/lib/admin/queries.ts` | Adicionar query/RPC para metricas de funil |
| `supabase/migrations/` | Migration para colunas se necessario |

### Arquivos a Tocar (Parte B — LP, so com OK)
| Arquivo (repo LP) | Acao |
|---------|------|
| `src/hooks/useQuizSession.ts` | Enviar progresso por pergunta |
| `supabase/functions/save-quiz-session/` | Aceitar updates incrementais |

### Riscos
- Migration em tabela existente com dados (pos-E1 estara vazia — timing ideal)
- Mudanca na LP requer deploy separado
- Schema mismatch entre RPC e tabela precisa ser resolvido

### Como Testar
- Dashboard de funil mostra percentuais coerentes
- Se Parte B implementada: fazer quiz parcial, verificar que admin mostra onde parou

---

## E6 — Polimento UX (Transversal)

### Achados da Auditoria (A1)
- Mistura light/dark: discriminador real e `text-white`/`bg-[#1A1B1F]` (dark) vs `bg-white`/`border-slate-200` (light)
- `GlassCard` e theme-neutral (nao e o problema)

### Abordagem
1. **Escolher dark como tema unico do admin** (maioria das telas ja usa dark)
2. Identificar componentes que usam classes light e converter
3. Substituir "Carregando..." cru por skeletons (reusar padrao de ebooks)
4. Garantir sidebar/topbar coesas

### Arquivos Provaveis
- Componentes em `src/components/admin/`
- Rotas admin que tenham classes light
- (Levantamento fino sera feito durante implementacao)

### Riscos
- Regressao visual — usar `webapp-testing` para capturar screenshots antes/depois
- Nao introduzir mudancas em componentes compartilhados com o app do aluno

### Como Testar
- Todas as telas admin com tema visual consistente
- Sem texto ilegivel, contraste adequado
- Loading states com skeleton em todas as paginas

---

## Ordem de Execucao Proposta

```
E1 (limpeza) → E2 (Hoje) → E3 (CSV) → E4 (vendas) → E5-A (dashboard com dados atuais) → E6 (polish) → E5-B (instrumentar LP — com OK separado)
```

**Justificativa:**
- E1 primeiro porque limpa dados de teste (timing ideal para migrations de E5)
- E2 antes de E3 porque CSV precisa respeitar periodo "Hoje"
- E4 antes de E5 porque ambos tocam dados de vendas/conversao
- E5-B separado porque requer deploy de outro repo + decisao do usuario
- E6 por ultimo para nao ter regressoes das entregas anteriores

---

## Validacoes por Entrega (checklist)

- [ ] `npm run build` verde
- [ ] `npm run lint` verde
- [ ] Fluxo testado com `webapp-testing` (Playwright)
- [ ] Commit atomico com mensagem descritiva
- [ ] Thread GSD atualizada
