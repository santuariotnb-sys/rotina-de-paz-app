# CLAUDE.md — Rotina de Paz · App (Círculo da Paz)

## REGRA ZERO
Leia este arquivo INTEIRO antes de executar qualquer tarefa. É a fonte de verdade do repo.

## IDENTIDADE
App pós-compra **"Círculo da Paz"** (membro) + **admin** + **webhook de pagamento** + **CAPI** do funil "Jornada 7 Dias de Paz" (Rotina de Paz). Método RP7. ICP: mulheres cristãs 35-55, **pouca intimidade com tech** — UX tem que ser à prova de senhora de 55+.

## ARQUITETURA
- **Stack**: React 18 + **TanStack Start** + Vite + Tailwind + Framer Motion.
- **Hosting**: **Vercel** — `push` na `main` = **deploy automático em PRODUÇÃO**.
- **DB**: Supabase **`cemjibbauvvyfaxilrvm`** (LIVE, compartilhado com checkout-sacra + quiz). RLS ativo.
- **Backend**: **`createServerFn` (TanStack) em `src/lib/**`** — **NÃO** usa Supabase Edge Functions.
- **Repo**: github.com/santuariotnb-sys/rotina-de-paz-app
- **Origem**: extraído de um projeto Lovable (commit `81689a7`) e trabalhado fora.

### Caminhos críticos (NUNCA quebrar)
| Sistema | Arquivo | Se quebrar |
|---|---|---|
| Webhook pagamento | `src/routes/api/public/webhooks/kirvano.ts` → `lib/admin/kirvano.server.ts` → grava `entitlements`/`purchases` | compra não vira acesso |
| CAPI Meta | `lib/admin/meta-capi.server.ts` | Meta para de receber Purchase |
| Cron CAPI | `src/routes/api/cron/capi-retry.ts` | retries de CAPI param |

## DEPLOY
```bash
git push origin main   # Vercel deploya produção sozinho (~40s)
```
- **Branch + preview** pra mudança arriscada; **merge na main** quando provado.
- **🔴 BUMPAR `APP_BUILD`** (`src/components/app/AppNav.tsx`) **a CADA deploy** — aparece na TopBar ("Círculo da Paz · vXXjun-N") e é a ÚNICA forma do dono confirmar (no iPhone) qual build carregou. **Atual: `v17jun-2`.**
- **NUNCA `git add -A` / `commit -am`** — sempre arquivo por arquivo + revisar `git status`/`git diff --cached`. (Houve incidente: deleção do webhook na árvore de trabalho quase foi commitada.)

## AJUSTES & OTIMIZAÇÕES — 2026-06-17 (UX + Performance, app de membro)
> Tudo provado no iPhone real, **aba anônima + tradutor OFF + build novo** (ver "Disciplina de teste").

### UX — login à prova de senhora 55+ (`src/routes/login.tsx`)
- **`friendlyAuthError(e)`**: mapa erro→mensagem PT (rede/"Load failed", senha errada, já-cadastrado, email-não-confirmado, rate-limit "for security purposes…after X seconds", senha fraca). Aplicado nos **3 handlers** (submit, Google, reset) + resend.
- **Máquina de estado** `idle/submitting/needs_confirm/already_exists/error` + **`withTimeout(15s)`** (sem "Aguarde…" eterno).
- **Confirm email ON** (`mailer_autoconfirm:false`): após `signUp`, `identities.length===0` → tela **"Você já tem conta!"** (guia Entrar/Esqueci a senha — caso do comprador, que já tem conta criada pelo webhook); `!session` → tela **"📧 Quase lá!"** + reenviar. Não volta pro idle mudo.
- Microcopy guia do comprador, `aria-live`, `autoComplete`.
- **Reset de senha**: `reset-password.tsx` (catch humano) + handler global **`PASSWORD_RECOVERY`** no `__root.tsx` → redireciona pra `/reset-password` mesmo se o Supabase cair no Site URL.

### UX — error boundary humano (`src/components/app/ErrorFallback.tsx`)
- Para de mostrar `error.message` cru (vai só pro `console.error`). Mensagem humana + botão **Recarregar SEMPRE presente** (`reset?.()` ou `window.location.reload()`) + "Voltar ao início". (Wired em `__root.tsx:errorComponent`.)

### UX — player com fallback (`src/components/app/player/PlayerProvider.tsx`)
- `a.onerror` (MediaError codes) + `NotAllowedError` (autoplay-block → "Toque no ▶") + **guard de `src` vazio** → toasts via `sonner`, em vez de falhar mudo.
- **Throttle do progresso**: `timeupdate` → `setProgress` via `requestAnimationFrame` + cap 250ms (antes re-renderizava o contexto a cada tick).

### Responsividade — scroll lateral iOS (corrigido)
- `overflow-x: hidden` → **`overflow-x: clip`** no shell (`app.tsx` `<main>`+`<section>`, `styles.css` `html,body`) — `clip` não cria scroll-container que o iOS deixa panar, e não quebra o `sticky` da TopBar.
- Carrossel de e-books contido (`app.ebooks.tsx` div pai com `overflow-x-clip`); `overflow-x-auto` interno intacto.
- **Não existe `#root`** — TanStack monta direto no `<body>`; o clip em body+main cobre.
- **Prova**: `scrollWidth === clientWidth` em todas as páginas (320/375/390/430px) + iPhone.

### Performance — capas de e-book: 10 MB → 129 KB (`src/routes/app.ebooks.tsx`)
- **`optimizedCoverUrl()`** reescreve a URL do Supabase Storage de `/object/public/` → **`/render/image/public/…?width=400&height=600&resize=contain&quality=75`** (image transform nativo do Supabase, serve WebP via Accept). **Zero re-upload.**
- Causa: 4 de 6 capas eram PNG 2-3 MB (full-res) → no iOS cada uma decodifica ~4x em RAM → pressão de memória → travamento cíclico.
- ⚠️ Capas full-res continuam no Storage; o transform resolve no render. **Ideal futuro:** resize-on-upload no `admin.ebooks.tsx`.

### Performance — lista de Louvores (`src/routes/app.louvores.tsx`)
- **148 louvores num único livro ("salmos")**, todos pintando + animando (cascata de 5.2s) → travava ao passar pela aba.
- Fix: **`content-visibility: auto` + `contain-intrinsic-size: 0 76px`** nos `<li>` (≈130 off-screen não pintam) + **animação só nos 12 primeiros** + `useMemo` nos counts dos chips.

### UI — MiniPlayer (`src/components/app/player/MiniPlayer.tsx`)
- Offset de baixo aumentado pra **limpar a navbar** (antes a faixa "Salmos 3" ficava cortada).

## DISCIPLINA DE TESTE (lições que custaram caro hoje)
1. **3 confundidores que escondem os fixes** — sempre descartar ANTES de auditar código:
   - **Cache / aba velha** (SPA roda o bundle antigo em memória) → testar em **aba anônima** e conferir o **`APP_BUILD`** novo no topo.
   - **Google Tradutor ON** (app é PT) → reescreve labels + re-processa o DOM a cada navegação → causa overflow + travamento. **Desligar.**
   - **Fix não-deployado** → confirmar que está em `origin/main`, não só na branch/preview.
2. **Medir, não chutar** — performance/scroll se prova no device: `scrollWidth===clientWidth`, profiler de memória, `curl -sI` no `content-length` real. Leitura estática erra (ex.: a auditoria que cravou "Bunny nunca no código" estava errada — estava no `seed-audios.sql`).
3. **`committed ≠ pushed ≠ deployed ≠ live`** — confirmar os 4 separadamente, sempre na fonte (`git ls-tree origin/main`, a URL renderizando).
4. **Restaurar é seguro; commitar deleção é perigoso.** Nunca `git add -A`.

## EMAIL — DOIS sistemas (não confundir)
- **App (Resend direto)** — `lib/admin/email.server.ts` (welcome+magic link no webhook), `send-email.functions.ts` (suporte), `crm.functions.ts` (campanhas). `RESEND_API_KEY` no Vercel (✅ há 11+ dias). `from: noreply@rotinadepaz.com.br`. **Caminho principal do comprador = welcome + magic link (PT, funciona).**
- **Auth do Supabase (signup confirm + reset senha)** — ✅ **CONFIGURADO (2026-06-17)** via Management API (PATCH cirúrgico, NÃO `config push`): templates **PT** + **SMTP Resend** (`noreply@rotinadepaz.com.br`, domínio verified sa-east-1). Emails chegam **em PT, da marca, na inbox**. Confirm + reset **provados ponta a ponta** (email + clique no link → `/app` e `/reset-password`). **A config vive no Supabase (não no git);** `docs/supabase-email-templates.md` é a receita de restauração se resetar. **NUNCA `supabase config push`.**

## CONTEÚDO (onde mora cada mídia)
| Mídia | Tabela | Storage/Host | Admin |
|---|---|---|---|
| Louvores | `louvores` | Supabase Storage `louvores-audios` | `admin.louvores.tsx` |
| E-books (capa+pdf) | `ebooks` | Supabase Storage `ebooks-files` | `admin.ebooks.tsx` |
| Áudios do método (Vol I/II) | `audio_tracks` (kind `despertar`/`aquietar`) | **Bunny CDN** (`cdnrotinadepaz.b-cdn.net`) — URL colada no admin | `admin.audios.tsx` |
| Devocionais | `courses` | capa = **gradiente CSS** (leve) | — |
- **`audio_tracks` é RLS-gated**: `is_admin OR is_free_preview OR has_entitlement(product_id)`. **Sem entitlement ativo = 0 linhas = "em breve".** Ao testar áudio do método, usar conta de **comprador com entitlement ativo** (admin tem bypass; conta reembolsada não vê). Produto método: `kind='method', status='active'`.

## PROIBIDO
- **Supabase banidos**: `qcomfdcofxmpurnfpoon`, `eofpeqbkhovqudrtdomd`, `xzmlsnghjmwbyebrcfdh`. **Nunca `supabase config push`.**
- `git add -A` / `commit -am` / `git clean` cego.
- Commitar `.env` (segredos só no Vercel/Vault).
- Mostrar erro cru pra cliente.

## PENDENTE
- **Imagens bundladas** (`src/assets`): `rotina-de-paz-logo.png` 932 KB, `favicon.png` 932 KB, `guide-avatar.jpg` 1.9 MB, `primordia-logo-full.png` 1.2 MB (NÃO usado → deletar). Resize+WebP → ~0.3 MB total. **Prompt escrito, NÃO executado.**
- **Limpeza da árvore de trabalho**: dezenas de `AUDIT-*.md`/`AUDITORIA-*.md` untracked geram ruído de "uncommitted changes" e escondem deleção perigosa → mover pra pasta no `.gitignore`.
- **`kirvano.server.ts:231`** — bloqueia re-ativar entitlement reembolsado → comprador que reembolsa e recompra fica trancado (edge case real, corrigir com cuidado).
- **Player H2 parte 2** — isolar a barra de progresso num componente pequeno (só se voltar a engasgar com áudio tocando).
- **Resize-on-upload** no `admin.ebooks.tsx` (pra não subir capa de 3 MB de novo).

## STATUS (2026-06-17)
✅ Webhook + CAPI + cron intactos em produção · ✅ Login UX / ErrorFallback / Player fallback · ✅ Scroll lateral (clip) · ✅ Capas e-book (transform, 10MB→129KB) · ✅ Louvores (content-visibility) · ✅ MiniPlayer offset · ✅ `APP_BUILD` v17jun-2 · ✅ App "liso e fluido" confirmado no iPhone · ✅ Áudios do método: 9/9 compradores veem (RLS ok, era falso-alarme de teste com conta reembolsada) · ✅ **Email auth PT** (confirm + reset, remetente da marca, SMTP Resend — provado ponta a ponta).
