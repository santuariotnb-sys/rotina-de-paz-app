# Auditoria Completa de Emails — Ecossistema Rotina de Paz
**Data:** 2026-05-31 | **Status:** Read-only / Diagnostico

---

## 1. Tabela de Todos os Emails do Sistema

| # | Trigger | Destinatario | Assunto | Provider | Arquivo | Status |
|---|---------|-------------|---------|----------|---------|--------|
| 1 | Compra aprovada (webhook Kirvano) | Aluna (compradora) | "Seu acesso ao {produto} esta liberado" | Resend (API direta) | `src/lib/admin/email.server.ts:84` | **QUEBRADO** — sem RESEND_API_KEY no .env local nem .env.vercel |
| 2 | Aluna abre ticket de suporte | suporte@rotinadepaz.com.br | "[Suporte] Novo ticket: {assunto} — {categoria}" | Resend (SDK) | `src/lib/api/send-email.functions.ts:99` | **QUEBRADO** — sem RESEND_API_KEY |
| 3 | Aluna responde ticket | suporte@rotinadepaz.com.br | "[Suporte] Nova resposta: {assunto}" | Resend (SDK) | `src/lib/api/send-email.functions.ts:122` | **QUEBRADO** — sem RESEND_API_KEY |
| 4 | Admin responde ticket | Aluna (email do ticket) | "[Rotina de Paz] Resposta ao seu ticket: {assunto}" | Resend (SDK) | `src/lib/api/send-email.functions.ts:144` | **QUEBRADO** — sem RESEND_API_KEY |
| 5 | Admin fecha ticket | Aluna (email do ticket) | "[Rotina de Paz] Ticket resolvido: {assunto}" | Resend (SDK) | `src/lib/api/send-email.functions.ts:168` | **QUEBRADO** — sem RESEND_API_KEY |
| 6 | Aluna pede reset de senha | Aluna | Template padrao Supabase | Supabase Auth (built-in) | `src/routes/login.tsx:109` | **FUNCIONA** — usa Supabase Auth nativo |
| 7 | Signup manual (criar conta) | Aluna | Template padrao Supabase (confirmar email) | Supabase Auth (built-in) | `src/routes/login.tsx:58` | **FUNCIONA** — usa Supabase Auth nativo |

**Quiz-sacra:** ZERO emails enviados. O quiz salva lead no banco (tabela `leads`) e opcionalmente captura email, mas nao envia nenhum email — nem de resultado, nem de follow-up.

---

## 2. Detalhamento por Email

### Email 1: Boas-vindas pos-compra (Welcome Email)
- **Arquivo:** `/Users/guilhermehenrique/rotina-de-paz-app/src/lib/admin/email.server.ts`
- **Chamado por:** `processKirvanoPayload()` em `kirvano.server.ts:205`
- **Trigger:** Webhook Kirvano com evento SALE_APPROVED
- **Logica:**
  1. Gera um **magic link** via `supabaseAdmin.auth.admin.generateLink({ type: "magiclink" })`
  2. Se o magic link falhar, usa fallback: `{siteUrl}/login`
  3. Renderiza HTML com saudacao, lista de produtos desbloqueados, e botao "Acessar meu app"
- **From:** `process.env.RESEND_FROM` ou fallback `"Sacra <no-reply@resend.dev>"`
- **Conteudo do body:**
  - Saudacao personalizada com nome
  - "Sua compra foi aprovada e seu acesso ja esta liberado"
  - Lista de produtos desbloqueados
  - Botao com magic link (login sem senha)
  - Link em texto para copiar/colar
- **PROBLEMA CRITICO:** `RESEND_API_KEY` nao existe em `.env` nem `.env.vercel`. O email nunca sai.

### Emails 2-5: Sistema de Suporte
- **Arquivo:** `/Users/guilhermehenrique/rotina-de-paz-app/src/lib/api/send-email.functions.ts`
- **From:** `"Rotina de Paz <noreply@rotinadepaz.com.br>"` (hardcoded)
- **Destinos:**
  - Tickets novos e respostas da aluna → `suporte@rotinadepaz.com.br`
  - Respostas do admin e fechamento → email da aluna
- **PROBLEMA:** Mesma situacao — sem `RESEND_API_KEY`, o `getResend()` retorna null e pula o envio silenciosamente.

### Emails 6-7: Auth do Supabase
- **Reset de senha:** `supabase.auth.resetPasswordForEmail()` → redireciona para `/reset-password`
- **Signup:** `supabase.auth.signUp()` → redireciona para `/app`
- **Templates:** Nao ha pasta `supabase/templates/`. Usa templates **padrao do Supabase** (generico, em ingles por default).
- **Status:** Funcionam porque usam o SMTP built-in do Supabase.

---

## 3. Fluxo do Usuario Pos-Compra

```
Quiz-sacra (LP)                       rotina-de-paz-app (webhook)
================                      ===========================

1. Lead faz quiz
2. Ve resultado + oferta
3. Clica "Quero minha paz" →
4. Redirect para Kirvano checkout
   (com UTMs, nome, email, externalId)

                                      5. Kirvano envia webhook SALE_APPROVED
                                      6. processKirvanoPayload():
                                         a. Extrai email, nome, offer_id
                                         b. Busca produto vinculado (product_kirvano_offers)
                                         c. ensureUserForEmail():
                                            - Tenta achar perfil existente
                                            - Se nao existe: createUser() SEM SENHA
                                              (email_confirm: true, source: "kirvano")
                                         d. Cria entitlement (user_id + product_id)
                                         e. sendWelcomeEmail():  ← QUEBRADO
                                            - Gera magic link
                                            - Tenta enviar via Resend
                                            - FALHA: sem API key
                                         f. Registra purchase (analytics)

                                      7. Usuario criado NO BANCO sem senha
                                         Nao recebe email
                                         Nao sabe que tem conta
                                         Nao tem como acessar o app
```

### Como a aluna acessa o app HOJE?

**Resposta: NAO ACESSA (a menos que descubra sozinha).**

O usuario criado pelo webhook:
- Foi criado via `auth.admin.createUser()` **sem senha**
- O `email_confirm: true` confirma o email automaticamente (bom)
- Mas **nenhum email sai** porque nao tem `RESEND_API_KEY`
- Se a aluna acessa `/login`, ela pode tentar:
  - **Login com senha:** NAO funciona (nao tem senha)
  - **"Esqueci minha senha":** Funciona tecnicamente (Supabase Auth envia email de reset). Depois de definir senha, consegue entrar.
  - **Login com Google:** Funciona SE o email do Google for o mesmo da compra
  - **Criar conta:** Falha ("already registered") porque o webhook ja criou o user

---

## 4. Inconsistencia de "From" Address

| Contexto | From Address | Dominio |
|----------|-------------|---------|
| Welcome email | `process.env.RESEND_FROM` ou `"Sacra <no-reply@resend.dev>"` | resend.dev (sandbox!) |
| Suporte | `"Rotina de Paz <noreply@rotinadepaz.com.br>"` | rotinadepaz.com.br |
| Auth Supabase | default Supabase | noreply@mail.app.supabase.io |

**Problema:** O nome "Sacra" no welcome email nao bate com "Rotina de Paz" no suporte. O fallback `no-reply@resend.dev` e o sandbox do Resend (so envia para emails verificados).

---

## 5. O Que Esta FALTANDO

### Critico (bloqueia experiencia da aluna):
1. **RESEND_API_KEY** nao esta configurada em nenhum .env — NENHUM email Resend sai
2. **RESEND_FROM** nao esta configurado — usa fallback sandbox `no-reply@resend.dev`
3. **A aluna nao recebe email pos-compra** — nao sabe que tem conta, nao sabe como acessar
4. **Dominio rotinadepaz.com.br nao verificado no Resend** (presumido, precisa checar dashboard)

### Importante:
5. **Sem email de resultado do quiz** — a tela diz "Enviei seu resultado pro seu email" mas NAO envia nada (so salva no banco)
6. **Templates Supabase Auth** estao em ingles (padrao) — aluna brasileira recebe email de reset/confirm em ingles
7. **Sem email de confirmacao de compra com credenciais** — mesmo quando o Resend funcionar, a aluna recebe magic link (expira em 24h). Se nao usar a tempo, precisa ir em "esqueci senha"

### Nice-to-have:
8. Sem email de onboarding/sequencia pos-compra
9. Sem email quando ticket for atualizado pelo admin (notifyAdminReply depende do admin clicar "responder" E do Resend funcionar)
10. Sem retry/fila de emails falhados (falha silenciosa)

---

## 6. Checklist de Correcao

- [ ] Criar conta no Resend e obter API key
- [ ] Verificar dominio `rotinadepaz.com.br` no Resend (DNS: DKIM + SPF)
- [ ] Adicionar `RESEND_API_KEY` nas env vars do Vercel (producao)
- [ ] Adicionar `RESEND_FROM=Rotina de Paz <noreply@rotinadepaz.com.br>` nas env vars
- [ ] Unificar o "from" address: trocar `email.server.ts` para usar `"Rotina de Paz <noreply@rotinadepaz.com.br>"` ao inves do fallback Sacra
- [ ] Customizar templates Supabase Auth para portugues (Dashboard → Auth → Email Templates)
- [ ] Implementar envio real do resultado do quiz por email (ou remover o texto "Enviei pro seu email")
- [ ] Testar fluxo completo: webhook → createUser → welcome email → magic link → app
