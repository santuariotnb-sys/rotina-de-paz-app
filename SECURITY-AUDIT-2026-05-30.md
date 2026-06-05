# Auditoria de Seguranca — rotina-de-paz-app

**Data:** 2026-05-30
**Stack:** TanStack Start + React + Supabase + Vite + Vercel + Kirvano
**Modo:** READ-ONLY (nenhum arquivo foi modificado)

---

## A. Resumo Executivo

Auditoria completa em 4 eixos paralelos: (1) Secrets + Supabase, (2) Edge Functions + Pagamentos, (3) XSS + CSRF + Headers + Rotas, (4) Dependencias + Tracking/Privacidade.

- **2 achados CRITICOS** que exigem acao imediata
- **8 achados ALTOS** que devem ser corrigidos antes do proximo deploy
- **11 achados MEDIOS** para hardening
- **7 achados BAIXOS** para melhoria continua
- Varios pontos positivos: webhook HMAC com timingSafeEqual, RLS em todas as tabelas, Zod validation, service_role isolado em .server.ts

---

## B. Matriz de Risco

| Prioridade | Qtd | Achados |
|------------|-----|---------|
| P0 | 2 | .env.vercel exposto, email functions sem auth |
| P1 | 8 | XSS em email, sem headers, sem LGPD, PII em URL, auth client-only, rate limit, RLS tickets, admin PII |
| P2 | 11 | Error leaks, CORS, GRANT broad, silent 200, config.toml, assets publicos, CSV sem audit, webhook PII, nitro beta, admin queries |
| P3 | 7 | Idempotencia, example.functions, admin_users RLS, Kirvano URL, dangerouslySetInnerHTML, cookie flags, storage publico |

---

## C. Achados CRITICOS (P0)

### C1. .env.vercel com service_role key NAO esta no .gitignore

**Severidade:** CRITICA
**OWASP:** A07:2021 - Security Misconfiguration
**Arquivo:** `.env.vercel` (linha 4)
**Evidencia:** `SUPABASE_SERVICE_ROLE_KEY="eyJhbG...***MASKED***"` + Vercel OIDC token
**Risco:** service_role bypassa TODAS as politicas RLS. Se commitado, qualquer pessoa com acesso ao repo tem controle total do banco.
**Correcao:**
1. Adicionar `.env.vercel` ao `.gitignore`
2. `git rm --cached .env.vercel` se tracked
3. `git log --all -- .env.vercel` para verificar se ja foi commitado
4. Se sim: rotacionar a key no Supabase Dashboard imediatamente
**Pode quebrar algo?** Nao. Apenas protege o arquivo.

---

### C2. Funcoes de email sem autenticacao

**Severidade:** CRITICA
**OWASP:** A01:2021 - Broken Access Control
**Arquivo:** `src/lib/api/send-email.functions.ts` (linhas 88, 105, 121, 138)
**Evidencia:**
```typescript
export const notifyNewTicket = createServerFn({ method: "POST" })
  .inputValidator(newTicketSchema)
  .handler(async ({ data }) => { ... });
// SEM .middleware([requireSupabaseAuth])
```
Todas as 4 funcoes (`notifyNewTicket`, `notifyUserReply`, `notifyAdminReply`, `notifyTicketClosed`) sao publicas. `notifyAdminReply` envia email para qualquer endereco via `data.userEmail`.
**Risco:** Qualquer pessoa pode enviar spam pelo seu Resend, fazer phishing do seu dominio, ou esgotar sua cota.
**Correcao:** Adicionar `.middleware([requireSupabaseAuth])` nas 4 funcoes. Adicionar `assertAdmin` em `notifyAdminReply` e `notifyTicketClosed`.
**Pode quebrar algo?** Nao, se o frontend ja envia o token de auth (que ja faz para outras funcoes).

---

## D. Achados ALTOS (P1)

### D1. XSS em email de boas-vindas via nome nao escapado

**Severidade:** ALTA
**OWASP:** A03:2021 - Injection
**Arquivo:** `src/lib/admin/email.server.ts` (linha 37)
**Evidencia:** `const greeting = opts.name ? \`Ola, ${opts.name}!\` : "Ola!";` — nome vem do webhook Kirvano (controlado pelo atacante), interpolado raw em HTML.
**Risco:** Injecao de HTML/JS em emails: phishing, formularios falsos, links maliciosos.
**Correcao:** `const greeting = opts.name ? \`Ola, ${escapeHtml(opts.name)}!\` : "Ola!";`
**Pode quebrar algo?** Nao.

### D2. Nenhum security header configurado

**Severidade:** ALTA
**OWASP:** A05:2021 - Security Misconfiguration
**Arquivo:** Nenhum `vercel.json`, nenhum middleware de headers
**Evidencia:** Zero matches para CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy.
**Risco:** Sem CSP, qualquer XSS tem poder total. Sem HSTS, downgrade HTTP possivel. Sem X-Frame-Options, clickjacking.
**Correcao:** Criar `vercel.json` com headers de seguranca.
**Pode quebrar algo?** CSP pode quebrar scripts inline se mal configurado. Testar em staging.

### D3. Sem mecanismo de consentimento / LGPD

**Severidade:** ALTA
**OWASP:** A04:2021 - Insecure Design
**Arquivo:** Codebase inteiro — zero matches para `consent`, `lgpd`, `gdpr`, `cookie-banner`
**Evidencia:** App armazena UTMs em localStorage, PII de leads em Supabase, sem consentimento.
**Risco:** Violacao da LGPD. Multas de ate 2% do faturamento.
**Correcao:** Implementar banner de consentimento. Bloquear `captureUtms()` e `persistLead()` ate aceite.
**Pode quebrar algo?** Sim, precisa de UI nova e logica condicional.

### D4. PII (nome + email) em URL de checkout

**Severidade:** ALTA
**OWASP:** A04:2021 - Insecure Design
**Arquivo:** `src/lib/utm.ts` (linhas 37-39), `src/components/quiz/QuizApp.tsx` (linha 189)
**Evidencia:** `url.searchParams.set("nome", extras.name); url.searchParams.set("email", extras.email);`
**Risco:** Nome e email aparecem em historico do browser, logs de servidor, Referer headers, extensoes.
**Correcao:** Se Kirvano exige, documentar o fluxo. Se possivel, usar POST. No minimo, nao enviar para analytics/UTM.
**Pode quebrar algo?** Depende se Kirvano aceita POST.

### D5. Auth guards apenas client-side (sem server guard)

**Severidade:** ALTA
**OWASP:** A01:2021 - Broken Access Control
**Arquivos:** `src/routes/app.tsx` (linhas 48-51), `src/routes/admin.tsx` (linhas 38-53)
**Evidencia:** Auth check em `useEffect` — sem `beforeLoad` server-side. HTML da pagina e renderizado antes do redirect.
**Risco:** Estrutura do app/admin visivel sem autenticacao. Dados protegidos por RLS, mas UI vaza.
**Correcao:** Adicionar `beforeLoad` guards com `throw redirect()` server-side.
**Pode quebrar algo?** Nao, melhora a protecao.

### D6. Sem rate limiting no webhook

**Severidade:** ALTA
**OWASP:** A04:2021 - Insecure Design
**Arquivo:** `src/routes/api/public/webhooks/kirvano.ts` (linhas 67-163)
**Evidencia:** Nenhum rate limit, IP allowlist, ou protecao contra abuso. Erros com assinatura invalida ainda gravam em `webhook_logs` via supabaseAdmin.
**Risco:** Log-flooding DoS. Se secret vazar, criacao ilimitada de usuarios/entitlements.
**Correcao:** Rate limiter (Upstash Redis ou Vercel middleware). IP allowlist para Kirvano.
**Pode quebrar algo?** Nao, se configurado corretamente.

### D7. Acesso a tickets de suporte sem filtro explicito de user_id

**Severidade:** MEDIA-ALTA
**OWASP:** A01:2021 - Broken Access Control
**Arquivos:** `src/routes/app.suporte.tsx` (linhas 67-72), `src/routes/app.suporte.$ticketId.tsx` (linhas 47-53)
**Evidencia:** Query sem `.eq("user_id", ...)` — depende apenas de RLS.
**Risco:** Se RLS de `support_tickets` estiver mal configurada, qualquer usuario le tickets de outros.
**Correcao:** Verificar RLS. Adicionar filtro `user_id` explicito como defesa em profundidade.
**Pode quebrar algo?** Nao.

### D8. Admin tracking page busca PII client-side

**Severidade:** MEDIA-ALTA
**OWASP:** A01:2021 - Broken Access Control
**Arquivo:** `src/routes/admin.tracking.tsx` (linhas 60-73)
**Evidencia:** Query de `leads` com nome/email via client-side Supabase. Depende apenas de RLS.
**Correcao:** Mover para `createServerFn` com `requireSupabaseAuth` + `assertAdmin()`.
**Pode quebrar algo?** Nao, apenas muda o local da query.

---

## E. Achados MEDIOS (P2)

| # | Titulo | Arquivo | Correcao |
|---|--------|---------|----------|
| E1 | Webhook vaza mensagens de erro internas | kirvano.ts:141-155 | Retornar `{ error: "processing_failed" }` generico |
| E2 | `listUsers` carrega 200 usuarios em memoria | kirvano.server.ts:124-126 | Usar `getUserByEmail()` |
| E3 | Sem CORS explicito | server.ts, routes | Configurar CORS para dominios de producao |
| E4 | GRANT broad em entitlements (CRUD para authenticated) | migration:289 | Reduzir para SELECT only |
| E5 | Webhook retorna 200 em erro (sem retry) | kirvano.ts:154 | Retornar 500 para erros transientes |
| E6 | config.toml aponta para projeto errado | supabase/config.toml | Atualizar project_id |
| E7 | Assets premium potencialmente publicos | app.louvores.tsx, admin.ebooks.tsx | Signed URLs com verificacao de entitlement |
| E8 | CSV export sem audit trail | admin.tracking.tsx:153-169 | Adicionar `logAdminAction()` |
| E9 | Webhook logs armazenam PII completo | kirvano.ts:44-53 | Mascarar email/nome nos logs |
| E10 | Dependencia beta (nitro 3.0.260429-beta) | package.json:83 | Monitorar ou pinar versao estavel |
| E11 | Admin queries dependem apenas de RLS client-side | admin.vendas/webhooks/membros/clientes/leads | Mover para server functions |

---

## F. Achados BAIXOS (P3)

| # | Titulo | Arquivo |
|---|--------|---------|
| F1 | Sem idempotencia por transaction_id no webhook | kirvano.server.ts:178-193 |
| F2 | example.functions.ts expoe NODE_ENV | src/lib/api/example.functions.ts |
| F3 | admin_users sem politicas INSERT/UPDATE/DELETE | migration:122-145 |
| F4 | Placeholder Kirvano URL no .env | .env:5 |
| F5 | dangerouslySetInnerHTML com dados estaticos | QuizApp.tsx:609,615 |
| F6 | Cookie sidebar sem Secure/SameSite | sidebar.tsx:86 |
| F7 | Storage buckets com leitura publica | migration:597-647 |

---

## G. Arquivos Analisados

- `src/routes/**/*.tsx` (app, admin, api, quiz, login)
- `src/lib/**/*.ts` (admin, api, utm, student, support)
- `src/components/**/*.tsx` (quiz, app, player, ui)
- `src/data/*.ts` (quiz, plan, louvores, ebooks, devocionais)
- `src/hooks/*.ts` (useEntitlements, useProductCheckouts)
- `src/integrations/supabase/client.ts`
- `supabase/consolidated_migration*.sql`
- `supabase/config.toml`
- `.env`, `.env.vercel`, `.gitignore`
- `package.json`, `package-lock.json`
- `vite.config.ts`, `tsconfig.json`

---

## H. Pontos Positivos

- Webhook HMAC-SHA256 com `timingSafeEqual` (constant-time)
- RLS habilitado em TODAS as tabelas
- service_role isolado em `.server.ts` (nao bundled no client)
- Admin server functions com `requireSupabaseAuth` + `assertAdmin()`
- Validacao Zod em todas as server functions
- `escapeHtml()` aplicado em nomes de produtos em emails
- CSRF mitigado: Supabase Auth usa Bearer tokens, nao cookies
- Sem Meta Pixel / GTM implementado (sem vazamento para terceiros)
- Lockfile integro, sem registries suspeitos, sem scripts de lifecycle
- `SECURITY DEFINER` functions com `REVOKE EXECUTE FROM public, anon`
- Preco NAO e confiado no frontend — checkout via Kirvano hosted

---

## K. Ordem Segura de Implementacao

1. **P0** — `.env.vercel` no .gitignore + rotacionar key (5 min)
2. **P0** — Auth middleware nas funcoes de email (15 min)
3. **P1** — escapeHtml no nome do email (2 min)
4. **P1** — Security headers via vercel.json (30 min com testes)
5. **P1** — Server-side auth guards com beforeLoad (1h)
6. **P1** — Rate limiting no webhook (1h)
7. **P1** — Verificar RLS de support_tickets (15 min)
8. **P1** — Mover admin tracking para server function (30 min)
9. **P2** — Demais achados medios (backlog priorizado)
10. **P3** — Achados baixos (melhoria continua)

---

## L. Itens que Exigem Validacao Manual

1. Verificar no Supabase Dashboard se `is_admin()` esta revogada de `anon`
2. Verificar RLS de `support_tickets` e `support_messages` no banco live
3. Confirmar que `.env.vercel` nunca foi commitado (`git log --all -- .env.vercel`)
4. Testar se assets de storage (audios, PDFs) sao acessiveis sem auth via URL direta
5. Validar se Kirvano suporta checkout via POST (para evitar PII em URL)
6. Confirmar politicas de retencao de dados em `webhook_logs`
