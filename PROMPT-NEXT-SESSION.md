# Prompt para Claude Code — Polir transições e micro-interações do app (Círculo da Paz)
### Repo: /Users/guilhermehenrique/rotina-de-paz-app · Vercel · TanStack Start + React + Tailwind + framer-motion
> Cole no Claude Code. **Aja como engenheiro sênior de frontend/UX.** Use o MCP **context7** antes de aplicar qualquer padrão de `framer-motion`, `@tanstack/react-router` ou `react`. **Teste em PREVIEW antes de produção** (app com clientes pagantes). Branch dedicada, commits atômicos.

---

## CONTEXTO DO PROJETO (leia antes de codar)

### Stack
- **Framework:** TanStack Start (SSR) + React 19 + Vite
- **Router:** @tanstack/react-router (file-based, auto code-splitting)
- **Styling:** Tailwind CSS 4 + CSS custom properties (paleta em `src/styles.css`)
- **Animação:** framer-motion (usado em modais/player) + CSS @keyframes (`rdp-fade-up`, `rdp-pulse-gold`)
- **Data:** React Query (staleTime 5min, gcTime 30min, prefetch no shell)
- **Deploy:** Vercel (auto-deploy de `main`). Preview em branches.
- **Env vars:** Supabase URL/keys configuradas em Production E Preview.

### Estrutura do app do membro (`/app`)
```
src/routes/
  app.tsx            — Shell (auth, sidebar, bottom nav, prefetch, player)
  app.index.tsx      — Aba "Paz" (home, volumes, progresso)
  app.louvores.tsx   — Aba "Louvores" (faixas de áudio por livro)
  app.ebooks.tsx     — Aba "E-books" (carrossel horizontal, capas Supabase)
  app.devocionais.tsx— Aba "Devocionais" (grid de cursos em vídeo)
  app.depoimentos.tsx— Aba "Depoimentos" (cards estáticos)
  app.volume.$turno.tsx  — Player de capítulo (áudio guiado)
  app.devocional.$slug.tsx — Detalhe do devocional (lições + checkout)
  app.suporte.tsx / .$ticketId.tsx — Suporte/tickets
src/components/app/
  AppNav.tsx          — Bottom nav (mobile) + sidebar (desktop)
  player/PlayerProvider.tsx — Contexto do player de áudio
  player/FullPlayer.tsx     — Player expandido (lazy-loaded, framer-motion)
  SessionModal.tsx    — Modal de sessão concluída
```

### O que já foi feito (performance — sessão anterior)
1. **Fix 1:** `rdp-fade-up` encurtado de 500ms→250ms. Na 2ª visita à aba, classe `rdp-no-anim` desliga animação (useRef inline). Conteúdo instantâneo na volta.
2. **Fix 2:** `defaultPendingMinMs: 300→0` no router. Cache quente = troca sem skeleton.
3. **Fix 3:** `width={400} height={600}` nas capas de e-book (lazy-load funcional).

Esses fixes estão na `main` (commit `fb82b44`). Produção atualizada.

### Regras SSR (TanStack Start)
- **NÃO criar hooks em arquivos separados** (`src/hooks/useX.ts`) — causou React error #310 por chunk SSR incompatível. Solução: inline `useRef` direto na rota.
- Componentes UI que usam hooks de browser precisam de `"use client"` (ex.: Radix UI).

---

## OBJETIVO DESTA SESSÃO

Polir as **transições entre abas, páginas e micro-interações** para que o app pareça nativo/premium. O público é mulher no celular (aparelho mediano, rede 4G). Tudo precisa ser suave, rápido e elegante.

### Áreas a melhorar (em ordem de prioridade)

#### 1. Transição entre abas (bottom nav)
- Hoje: conteúdo aparece instantâneo (fix anterior), mas sem transição — parece "corte seco".
- **Meta:** transição suave tipo crossfade (100-150ms) entre o conteúdo de uma aba e outra. Não pode atrasar a interação.
- Investigar: TanStack Router tem suporte a view transitions? Se sim, usar. Se não, adicionar um wrapper com framer-motion `AnimatePresence` no `<Outlet>` do `app.tsx`.
- **Cuidado:** `AnimatePresence mode="wait"` bloqueia a aba seguinte até a anterior sair — usar `mode="sync"` ou crossfade puro.

#### 2. Feedback tátil nos botões da navbar
- Hoje: `active:scale-90` (Tailwind) — funciona mas é abrupto.
- **Meta:** spring suave no toque (framer-motion `whileTap={{ scale: 0.92 }}` com spring curto). Ícone ativo com transição de cor suave (não snap).
- Ícone ativo pode ter um indicador sutil (dot dourado embaixo, ou glow).

#### 3. Transição de página interna (ex.: Louvores → Volume, Devocionais → Devocional)
- Hoje: corte seco.
- **Meta:** slide-in lateral suave (página entra da direita, 200ms). Botão "voltar" faz slide-out pra direita.
- Avaliar: pode usar CSS `view-transition-name` (se browser suportar) ou framer-motion no layout da rota.

#### 4. Micro-interações nos cards
- Cards de volume, e-book, devocional, louvor: hoje têm `hover:-translate-y-1` (bom no desktop).
- **Meta mobile:** adicionar `active:scale-[0.97]` com spring curto no toque. Sem atrasar a navegação.

#### 5. Player de áudio (mini bar)
- Avaliar se a barra do mini player (bottom) tem transição suave ao aparecer/desaparecer.
- O FullPlayer já usa framer-motion (spring) — verificar se está fluido.

---

## PROTOCOLO

1. **Branch:** `feat/app-transitions`
2. **Commits atômicos** — um por área (navbar, abas, páginas, cards, player).
3. **context7:** consultar docs de `framer-motion` (AnimatePresence, whileTap, layout) e `@tanstack/react-router` (view transitions, Outlet wrapper) ANTES de implementar.
4. **Teste em PREVIEW** — push da branch gera preview automática na Vercel.
5. **Mobile com throttle** — testar no DevTools com CPU 4x slowdown + 4G.
6. **Não quebrar:** as 5 abas abrem, áudio funciona, entitlements OK, sem novos erros no console.
7. **`prefers-reduced-motion`** — todas as animações desligam.
8. Só merge na `main` com meu OK.

## ENTREGA
- Link da preview
- Vídeo/descrição de cada transição implementada
- Confirmação de teste mobile throttle
- Diff por área

---

## REFERÊNCIA DE ESTILO (tom visual do app)
- Paleta: milk (#FAF6F4), deep-purple (#443A52), amethyst (#75617F), gold-warm (#C9A876), rose-dust (#D4A5B5)
- Tipografia: Cormorant Garamond (display) + Outfit (corpo)
- Tom: feminino, sereno, premium. Animações suaves e orgânicas, nunca mecânicas.
- Referência: apps de meditação (Calm, Abide) — transições lentas e intencionais.
