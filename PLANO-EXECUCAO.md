# Plano de Execucao — Rotina de Paz

> Baseado em auditoria real do codebase em 2026-05-29

---

## O que voce listou vs o que realmente falta

### 1. TRACKING AVANCADO
**Status: critico — e o maior gap do projeto**

- UTM capture: FEITO (`src/lib/utm.ts`)
- Admin tracking dashboard: FEITO (`src/routes/admin.tracking.tsx`)
- Meta Pixel (fbq): NAO EXISTE — zero chamadas fbq() no projeto inteiro
- CAPI (Conversions API server-side): NAO EXISTE
- Eventos de conversao: NAO EXISTE (PageView, ViewContent, Lead, Purchase)

**Tarefas:**
- [ ] Instalar Meta Pixel no layout global (PageView automatico)
- [ ] Disparar ViewContent na LP/quiz result
- [ ] Disparar Lead no email capture do quiz
- [ ] Disparar Purchase na thank you page (client-side)
- [ ] Implementar CAPI server-side no webhook Kirvano (Purchase event)
- [ ] Deduplicar eventos pixel+CAPI via event_id
- [ ] Configurar `NEXT_PUBLIC_META_PIXEL_ID` e `META_ACCESS_TOKEN` no env

### 2. QUIZ — APLICAR TRACKING
**Status: quiz funciona, mas sem nenhum evento de tracking**

O quiz (`src/components/quiz/QuizApp.tsx`, 946 linhas) esta completo funcionalmente. Mas:
- Nenhum evento Meta disparado em nenhum step
- Rota `/quiz/encaminhamento` referenciada no codigo (linha 73) mas NAO EXISTE

**Tarefas:**
- [ ] Adicionar eventos de funil no quiz: QuizStart, QuizComplete, ArchetypeResult
- [ ] Criar rota `/quiz/encaminhamento` para respondentes de alto risco
- [ ] Disparar Lead event quando captura email

### 3. UPSELL / DOWNSELL (Lovable)
**Status: nao existe no app — voce vai criar em Lovable**

Atualmente: quiz → bridge → offer → Kirvano checkout (externo). Sem upsell/downsell.

**Tarefas:**
- [ ] Criar pagina upsell em Lovable
- [ ] Criar pagina downsell em Lovable
- [ ] Exportar e integrar no projeto Next.js
- [ ] Configurar produtos upsell/downsell em Kirvano
- [ ] Adicionar tracking nos botoes de aceitar/recusar upsell
- [ ] Mapear fluxo: checkout → upsell → downsell → obrigado

### 4. PAGINA OBRIGADO
**Status: NAO EXISTE**

Depois da compra no Kirvano, o usuario cai na thank you page do Kirvano, nao sua. Voce perde:
- Controle do pixel de Purchase
- Oportunidade de onboarding imediato
- Direcionamento pro app

**Tarefas:**
- [ ] Criar `/obrigado` com pixel Purchase + dados da transacao
- [ ] Mostrar proximos passos (baixar app, acessar conteudo)
- [ ] Configurar URL de retorno no Kirvano para `rotinadepaz.com.br/obrigado`
- [ ] Passar transaction_id via query param para deduplicacao CAPI

### 5. TRACKING NO ADMIN
**Status: dashboard existe, mas so mostra UTM**

`admin.tracking.tsx` (443 linhas) ja mostra leads por source/campaign e taxa de conversao. Falta:
- [ ] Integrar dados de receita por source (cruzar vendas com UTM)
- [ ] Mostrar custo por lead se tiver dados do Meta
- [ ] Adicionar filtro por periodo

### 6. CADASTRAR PRODUTOS EM KIRVANO
**Status: webhook ja processa, mas precisa configurar os produtos**

Webhook handler esta pronto (`src/routes/api/public/webhooks/kirvano.ts`). HMAC validado.

**Tarefas:**
- [ ] Cadastrar produto principal (R$47) em Kirvano
- [ ] Cadastrar produto upsell em Kirvano
- [ ] Configurar webhook URL no painel Kirvano → `seudominio.com/api/public/webhooks/kirvano`
- [ ] Testar webhook com compra simulada
- [ ] Verificar se entitlement e criado corretamente

### 7. CADASTRAR PRODUTOS NO APP
**Status: CRUD existe no admin**

`admin.produtos.tsx` tem CRUD completo com mapeamento Kirvano offer IDs.

**Tarefas:**
- [ ] Cadastrar produto principal com offer_id do Kirvano
- [ ] Cadastrar produto upsell com offer_id
- [ ] Verificar mapeamento product → kirvano_offer funciona end-to-end

### 8. AUDITORIA FINAL + PERFORMANCE
**Status: problemas reais identificados**

Imagens nao otimizadas (5.1MB total):
- `guide-avatar.jpg`: 1.9MB (deveria ser <400KB)
- `primordia-logo-full.png`: 1.2MB (deveria ser <100KB)
- `primordia-icon.png`: 1.0MB (deveria ser <100KB)
- `rotina-de-paz-logo.png`: 933KB (deveria ser <100KB)
- `favicon.png`: 933KB (deveria ser <50KB)

**Tarefas:**
- [ ] Converter imagens para WebP
- [ ] Comprimir todas as imagens (meta: <500KB total)
- [ ] Lazy-load quiz data (`src/data/quiz.ts` = 24KB)
- [ ] Code-split rotas admin
- [ ] Testar Lighthouse score mobile

---

## O QUE VOCE NAO LISTOU MAS FALTA

### 9. LANDING PAGE (LP) PROPRIA
**Status: NAO EXISTE**

`/` redireciona para `/login`. Nao tem LP de trafego direto. Quem clicar num anuncio sem quiz cai no login.

**Tarefas:**
- [ ] Decidir se trafego direto vai pra quiz ou LP dedicada
- [ ] Se LP: criar hero + proposta de valor + prova social + CTA
- [ ] Configurar tracking da LP (ViewContent, scroll depth)

### 10. EMAILS DE ENGAJAMENTO
**Status: so tem welcome email**

Welcome email via Resend funciona. Mas nao tem:
- [ ] Email de lembrete D+1, D+3, D+7 (completou o protocolo?)
- [ ] Email de recuperacao se nao acessou o app
- [ ] Decidir se isso e prioridade agora ou pos-lancamento

### 11. ROTA DE RISCO DO QUIZ
**Status: CODIGO QUEBRADO**

Linha 73 do QuizApp.tsx: `if (opt.risk) navigate("/quiz/encaminhamento")` — essa rota nao existe. Se alguem responde com indicador de risco, da 404.

- [ ] Criar `/quiz/encaminhamento` com mensagem de acolhimento + indicacao CVV/profissional

---

## ORDEM DE EXECUCAO RECOMENDADA

```
FASE 1 — Infraestrutura de tracking (sem isso, ads nao escalam)
  1.1 Meta Pixel no layout global
  1.2 Eventos no quiz (Lead, QuizComplete)
  1.3 CAPI no webhook Kirvano (Purchase)
  1.4 Deduplicacao pixel+CAPI

FASE 2 — Funil pos-compra
  2.1 Pagina /obrigado com pixel Purchase
  2.2 Upsell/downsell (Lovable → export)
  2.3 Integrar upsell/downsell no fluxo

FASE 3 — Kirvano
  3.1 Cadastrar produtos em Kirvano
  3.2 Cadastrar produtos no admin do app
  3.3 Configurar webhooks
  3.4 Testar fluxo completo compra → entitlement → email

FASE 4 — Performance + polish
  4.1 Otimizar imagens (5.1MB → <500KB)
  4.2 Code-split + lazy-load
  4.3 Lighthouse audit
  4.4 Criar /quiz/encaminhamento

FASE 5 — Opcional pre-lancamento
  5.1 LP de trafego direto (se necessario)
  5.2 Emails de engajamento (pode ser pos-lancamento)
  5.3 Dashboard admin: receita por source
```

---

> Auditado em 2026-05-29 contra o codebase real.
> Nenhum achismo — cada item foi verificado no codigo.
