# PROMPT — FASE 2: Admin de Controle + Analytics + CRM (remarketing WhatsApp/Email)
> **v2 — corrigido após auditoria de código em 2026-06-11.** Premissas verificadas contra os repos reais.
> Cole no Claude Code na raiz de `rotina-de-paz-app`. Aja como engenheiro sênior. Use `context7` pra conferir API atual de cada lib (TanStack Start/Router/Query, @supabase/supabase-js, Recharts, Resend, provedor WhatsApp). TESTE ANTES DE CADA EXECUÇÃO e PARE nos checkpoints.

---

## §0. ONDE VOCÊ TRABALHA (ler antes de abrir qualquer arquivo)

| Repo / pasta | Papel | Você mexe? |
|---|---|---|
| `~/rotina-de-paz-app` (ESTE — raiz onde você está) | App de membro + admin (TanStack Start, Vercel) | **SIM — 95% da Fase 2 vive aqui** (Módulos A, B, C, E-analytics, F) |
| `~/checkout-sacra` | Checkout Pagar.me em produção, PROVADO com compra real | **Só no Módulo D** (fan-out de pixels) e **Módulo E** (exit-intent client). Qualquer outro toque = pedir autorização |
| `~/rotina-de-paz` | **LEGACY ARQUIVADO. NUNCA ABRIR.** Checkout velho, Supabase banido (`qcomfdcofxmpurnfpoon`), `.env.production` neutralizado | **NÃO. Se algum import/grep te levar até lá, PARE e avise** |

**Regra de bolso:** se o arquivo que você quer editar não está em `rotina-de-paz-app`, pare e confirme o módulo. Se está em `rotina-de-paz`, você errou de pasta — aborte.

**Supabase: um só pra tudo — `cemjibbauvvyfaxilrvm`.**
BANIDOS (nunca conectar): `qcomfdcofxmpurnfpoon`, `eofpeqbkhovqudrtdomd`, `xzmlsnghjmwbyebrcfdh`.
Todo comando de DB/functions com `--project-ref cemjibbauvvyfaxilrvm` explícito. **NUNCA** `supabase config push` (incidente 2026-06-10: sobrescreveu auth de produção).

---

## §0.5 REGRAS DE OURO (não negociáveis)

1. **Aditivo, sempre.** Nada que roda pode quebrar: app de membro, admin atual, checkout-sacra. Migrations em `public.*` e `checkout.*` só aditivas.
2. **NEGÓCIO ≠ SISTEMA.** Editar preço/copy/bump nunca toca lógica de pagamento.
3. **Guarda-corpos em toda escrita de negócio:** Zod → rascunho→publicar → audit log (`src/lib/admin/audit.ts`, já existe) → RLS admin-only.
4. **Commits atômicos + diff + parar nos checkpoints.** Prova funcional, não "o código parece certo".
5. **Sub-agentes leem antes de agir.** Antes de cada módulo, code-explorer confirma o padrão nos arquivos citados.

---

## §1. ARQUITETURA REAL (já auditada — fatos, não suposições)

### Padrões do admin em `rotina-de-paz-app` (reusar, não reinventar)
- **Rotas file-based**: `src/routes/admin.*.tsx`. Já existem 17: index, leads, clientes, membros, produtos, acessos, **vendas**, **analytics**, tracking, quiz, webhooks, suporte, ebooks, cursos, louvores, audios, config. Layout `admin.tsx`, login `admin.login.tsx`. Sidebar: `src/components/admin/AdminSidebar.tsx`.
- **Auth client**: `getCurrentAdmin()` em `src/lib/admin/auth.ts` (RPC `is_admin` + tabela `admin_users`).
- **Auth server**: `createServerFn({method}).middleware([requireSupabaseAuth]).handler()` com `supabaseAdmin` (service role) de `src/integrations/supabase/client.server.ts`. Middleware em `src/integrations/supabase/auth-middleware.ts`.
- ⚠️ **CORREÇÃO 1**: `assertAdmin()` hoje é **função privada dentro de `src/lib/admin/config.functions.ts`** — NÃO está em `auth.ts`. **Pré-tarefa do Módulo A**: extrair pra `src/lib/admin/server-auth.ts` e importar em `config.functions.ts` (refactor puro, zero mudança de comportamento, commit separado).
- **Toolkit pronto**: `audit.ts` (logAdminAction), `email.server.ts` (Resend), `meta-capi.server.ts` (CAPI v22 + sha256 + dedup), `csv.ts` (downloadCsv), `constants.ts` (PERIODS + sinceISO), `analytics.ts` (wrappers das RPCs), `kirvano.server.ts`. UI: `KpiCard`, `GlassCard`, recharts, shadcn, zod, react-hook-form.
- **RPCs existentes** (`supabase/migrations/20260531_analytics_rpcs.sql`): `analytics_funnel(p_days)` — **já retorna** purchasers/upsell_buyers/downsell_buyers/total_revenue —, `analytics_revenue_breakdown`, `analytics_top_segments`, `analytics_quiz_conversion`, `analytics_cohort_weekly`. Todas leem **somente `public.*`** (`SET search_path = public`). **ESTENDER, não duplicar.**
- ⚠️ **CORREÇÃO 2 (segurança, corrigir no PR do Módulo A)**: as 5 RPCs são `SECURITY DEFINER` com `GRANT EXECUTE TO authenticated` → **qualquer membro logado do app consegue chamar `analytics_funnel` e ver a receita total**. Migration aditiva: `REVOKE ... FROM authenticated` + chamar via server function (service_role). Toda RPC NOVA: grant **só** `service_role`.
- Edge functions neste repo: **zero**. Todas as 18 vivem no checkout-sacra.

### Dados do checkout (schema `checkout.*` no cemjibba, código em `checkout-sacra`)
- Tabelas: `orders`, `upsell_orders`, `tracking_events`, `checkout_leads`, `offer_settings` (JSONB `display_config`), `checkout_config`, `abandoned_carts`, `campaign_snapshots` (existe, vazia — reservada p/ Meta spend), `app_access_grants`, `checkout_webhook_logs`, `jobs`. Há também `whatsapp_messages` na geração antiga (ver Correção 3) — candidata a reuso no Módulo F.
- Tracking: os 5 eventos do funil **disparam de verdade** no client (PageView, ViewContent, InitiateCheckout, AddPaymentInfo, Purchase) — confirmado em `src/lib/track-event.ts` e `src/pages/Checkout.tsx`. Edge: `track-event` → `capi-relay` com dedup por `event_id` e hash de PII server-side.
- UTMs: `checkout.orders` tem `utm_source/utm_campaign/...` com índice `idx_ck_orders_utm` → join do Módulo B é viável.
- ⚠️ **CORREÇÃO 3 (bloqueante — fazer ANTES de qualquer migration)**: as migrations do checkout-sacra têm **duas gerações**: `001_initial_schema.sql` cria tabelas SEM schema e `101_checkout_schema.sql` recria tudo em `checkout.*`. **PRIMEIRO PASSO obrigatório**: rodar SQL de verificação no cemjibba (`select table_schema, table_name from information_schema.tables where table_name in ('orders','tracking_events','offer_settings') order by 1`) pra confirmar qual geração está VIVA, e conferir no Dashboard (manual!) se o schema `checkout` está exposto no PostgREST (senão `supabaseAdmin.schema('checkout')` falha). Já houve migration marcada "applied" sem rodar — não confiar no histórico.
- ⚠️ **CORREÇÃO 4 (premissa falsa removida)**: o checkout **NÃO usa React Query** e **NÃO existe `config_version`**. `useCart.ts` busca `offer_settings` direto do Supabase no load da página. Consequência pro Módulo C: publicar oferta **reflete no próximo page load de cada visitante** — isso é suficiente e NÃO exige tocar no checkout-sacra. Não inventar mecanismo de revalidação.
- ⚠️ **VERIFICAR no Módulo A**: se o checkout-sacra grava também em `public.purchases` (o plano original afirma que sim). Se gravar, `admin.vendas` (lê `public.purchases`) e o novo `admin.checkout` (lê `checkout.orders`) mostrarão a mesma venda em duas telas — decidir apresentação com o dono no Checkpoint A pra não confundir.

---

## §2. ENTREGÁVEIS (módulos incrementais — cada um: PR atômico + teste + checkpoint)

### MÓDULO A — Seção "Checkout" no admin: Pedidos + Funil + AOV + Upsell/Downsell
**Trabalha em:** `rotina-de-paz-app` apenas.
**Pré-tarefas (commits separados):** (0a) verificação de schema vivo + PostgREST (Correção 3); (0b) extrair `assertAdmin` → `src/lib/admin/server-auth.ts` (Correção 1); (0c) migration de revoke nas RPCs existentes (Correção 2).
- Rota nova `src/routes/admin.checkout.tsx` + item no `AdminSidebar.tsx`.
- Server functions `src/lib/admin/checkout.functions.ts` (padrão exato de `config.functions.ts`):
  - `getCheckoutOrders({period,status,method})` → `checkout.orders` + `checkout.upsell_orders` via `supabaseAdmin.schema('checkout')` (data, valor, método, status, UTM).
  - `getCheckoutFunnel({days})` → nova RPC `public.analytics_checkout_funnel(p_days)` contando etapas distintas de `checkout.tracking_events` por `event_name` (PageView→ViewContent→InitiateCheckout→AddPaymentInfo→Purchase) + taxa por degrau + gargalo. `SECURITY DEFINER`, `SET search_path = public, checkout`, **GRANT só service_role**.
  - `getCheckoutKpis({days})` → AOV, taxa upsell/downsell, receita, refunds. Reusar `analytics_funnel`/`analytics_revenue_breakdown` onde der.
- UI: `KpiCard`/`GlassCard` + funil recharts + tabela com `PERIODS` + export `csv.ts`.
- Migration aditiva: `supabase/migrations/<ts>_analytics_checkout_funnel.sql` — testar em transação com ROLLBACK antes de aplicar.
- **TESTES**: (1) RPC bate com SELECT manual; (2) não-admin → erro; (3) período filtra; (4) zero linhas não quebra; (5) membro comum logado NÃO consegue chamar a RPC nova nem as antigas pós-revoke.
- **CHECKPOINT A**: dono vê funil + pedidos reais e decide a questão vendas×checkout (verificação acima). PARA.

### MÓDULO B — ROI por campanha (Meta spend)
**Trabalha em:** `rotina-de-paz-app` (UI + server fns + RPC). Sync de spend pode virar cron Vercel neste repo — NÃO criar edge function no checkout-sacra sem necessidade.
- `checkout.campaign_snapshots` já existe pra isso. ⚠️ Decisão do dono ANTES: spend via (a) sync automático token Meta ou (b) entrada manual no admin. Tabela serve pra ambas; comece pela que destravar mais rápido.
- RPC `public.analytics_roi_by_campaign(p_days)`: join `utm_campaign` (orders) ↔ `campaign_name/campaign_id` (snapshots) → gasto, receita, vendas, ROAS, CPA. Grant só service_role. **Logar UTMs que não casarem.**
- UI: aba "ROI" dentro de `admin.checkout.tsx`.
- **TESTES**: ROAS de 1 campanha bate com cálculo manual; UTMs órfãos aparecem no log.
- **CHECKPOINT B.**

### MÓDULO C — Controle de oferta (preço, bumps, copy) com guarda-corpos
**Trabalha em:** `rotina-de-paz-app` apenas. **NÃO tocar no checkout-sacra** — a leitura por page load já entrega a propagação (Correção 4).
- Estender `admin.produtos.tsx` (que já tem draft/active/archived em `public.products`) + aba "Ofertas do Checkout".
- Editáveis: `public.products.price_cents` (preço sempre server-side) e `checkout.offer_settings.display_config` (headline, descrição, badge, emoji, capa, ordem, on/off).
- Server functions `src/lib/admin/offer.functions.ts`: `getOffers()`, `saveOfferDraft(payload)` (Zod), `publishOffer(id)` (draft→live + `logAdminAction` + auditoria).
- Draft: coluna aditiva `display_config_draft JSONB` em `checkout.offer_settings` (migration aditiva) — draft NUNCA lido pelo checkout (que só lê `display_config`).
- Preview ao vivo do card no admin antes de publicar.
- **TESTES**: config inválida não salva; draft invisível no checkout ao vivo; publish reflete num page load novo do checkout (testar com aba anônima); auditoria registra quem/quando; preço alterado respeitado server-side (client não manda preço — confirmar em `pagarme-payment`).
- **CHECKPOINT C**: dono troca preço/bump/copy e vê refletir, com rollback via auditoria. PARA.

### MÓDULO D — Event bus de pixels (2º pixel por config)
**Trabalha em:** `checkout-sacra` (único módulo que edita o repo do checkout) + tela de gestão em `rotina-de-paz-app`.
⚠️ Aqui vale dobrado: o checkout está PROVADO em produção. Branch separada, diff revisado, rodar 1 checkout de ponta a ponta em teste antes de deploy.
- Tabela aditiva `checkout.tracking_destinations` (tipo: meta_pixel/meta_capi/ga4/tiktok; id; token; enabled) — **não existe ainda em lugar nenhum, é net-new** (confirmado).
- Fan-out no hub `track-event`→`capi-relay`: 1 disparo → N destinos ativos. Pixel novo = 1 linha de config.
- Tela de gestão em `admin.tracking.tsx` (rotina-de-paz-app).
- **TESTES**: evento dispara nos 2 destinos; PII só server-side (hash); dedup `event_id` mantido; destino desligado não recebe.
- **CHECKPOINT D** + smoke de compra completa.

### MÓDULO E — A/B test + Popup de saída
**Trabalha em:** flag/variant + exit-intent no `checkout-sacra` (client-side, config-driven); analytics da variante no `rotina-de-paz-app`.
- `variant` em `checkout.checkout_config` + `variant_id` carimbado em `tracking_events`.
- Exit-intent: mouse-out/back-mobile/scroll-up, config-driven (on/off, copy, oferta), conectado a `abandoned_carts`, frequência limitada.
- **TESTES**: variante segrega no dashboard; popup respeita frequência e dispara evento.
- **CHECKPOINT E** + smoke de compra completa.

### MÓDULO F — CRM de remarketing (segmentos + Email + WhatsApp)
**Trabalha em:** `rotina-de-paz-app` apenas.
- Segmentos (server fns sobre `checkout.checkout_leads` + `checkout.abandoned_carts` + `public.purchases`/`entitlements`): carrinho abandonado, PIX gerado não pago, comprou principal sem upsell, comprou e sumiu.
- Email: reusar `email.server.ts` + Resend. Templates, sequências, opt-out, log.
- WhatsApp: ⚠️ Decisão do dono — Cloud API oficial vs Z-API/Evolution (opt-in, janela 24h, templates aprovados). `sendWhatsapp()` atrás de adapter (trocar provedor = 1 arquivo). **Avaliar reuso da tabela `whatsapp_messages`** que já existe na geração antiga do checkout-sacra — se a geração viva for a `checkout.*`, criar `checkout.whatsapp_messages` aditiva equivalente.
- Tela `src/routes/admin.crm.tsx`: segmento → contagem → disparo → resultado. Auditoria por envio.
- Guarda-corpos: rate limit, opt-out, dedup, NUNCA enviar sem opt-in.
- **TESTES**: contagem do segmento vs SQL; envio de teste pra 1 contato; opt-out bloqueia; WhatsApp respeita janela/template.
- **CHECKPOINT F.**

---

## §3. TESTE E SEGURANÇA (por módulo)
- Migration: rodar em transação ROLLBACK primeiro; aplicar com `--project-ref cemjibbauvvyfaxilrvm`; bloco de rollback no header.
- RPC: comparar com SELECT manual; testar que membro comum NÃO executa.
- Server fn: gate admin + caminho feliz + caso vazio.
- UI: smoke (carrega, filtra, exporta, zero-linha ok).
- Integridade: confirmar migrations vs DB real (Correção 3) — nunca confiar no histórico.
- Após C/D/E: 1 checkout de ponta a ponta (entrega + cobrança intactas).

## §4. SEQUÊNCIA
A → B → C → D → E → F. Cada um entrega valor sozinho. Não avançar sem checkpoint aprovado.

## §5. DECISÕES DO DONO (travar antes do módulo correspondente)
1. **Mód. B**: Meta spend = sync automático (token) ou manual?
2. **Mód. F**: WhatsApp = Cloud API oficial ou Z-API/Evolution?
3. **Mód. A (checkpoint)**: ordem das métricas no dashboard + como apresentar vendas×checkout se houver dupla fonte.

**Comece:** Pré-tarefa 0a (verificação schema vivo + PostgREST) → 0b (extrair assertAdmin) → 0c (revoke RPCs) → Módulo A → CHECKPOINT A.
