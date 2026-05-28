# Auditoria Completa: paz-guiada-diaria (Lovable)

**Data:** 2026-05-28

---

## 1. package.json

**Nome:** `tanstack_start_ts` | **Type:** `"module"` (ESM)

### Scripts
| Script | Comando |
|---|---|
| dev | `vite dev` |
| build | `vite build` |
| preview | `vite preview` |

### Dependencias Lovable-specific (REMOVER na migracao)
- `@lovable.dev/cloud-auth-js` ^1.1.2 — OAuth wrapper
- `@lovable.dev/vite-tanstack-config` ^2.1.1 — build config
- `@tanstack/react-router` ^1.168.25 — file-based routing
- `@tanstack/react-start` ^1.167.50 — SSR framework
- `@tanstack/router-plugin` ^1.167.28 — router code-gen
- `nitro` 3.0.260429-beta — SSR runtime (pinned beta)

### Dependencias para MANTER
- `@supabase/supabase-js` ^2.106.2
- `framer-motion` ^12.40.0
- `lucide-react` ^0.575.0
- `recharts` ^2.15.4
- `sonner` ^2.0.7
- `react-hook-form` + `@hookform/resolvers` + `zod`
- `class-variance-authority` + `clsx` + `tailwind-merge`
- Radix UI (23 packages — shadcn/ui)
- `date-fns`

### Dependencias para AVALIAR
- `embla-carousel-react` — usado? Se nao, remover
- `react-resizable-panels` — admin only, pode esperar
- `react-day-picker` — admin only
- `cmdk` — command palette, pode esperar
- `input-otp` — se nao usa OTP, remover
- `vaul` — drawer, pode substituir por Radix

---

## 2. Arvore src/ (3 niveis)

```
src/
├── assets/ (4 imagens: avatar, logo, volumes)
├── components/
│   ├── admin/ (5 arquivos: Sidebar, Topbar, GlassCard, KpiCard, StubPage)
│   ├── app/ (2 arquivos: AppNav, SessionModal)
│   ├── quiz/ (4 arquivos: QuizApp 946L, Avatar, SpeechBubble, EmotionalProgress)
│   └── ui/ (43 shadcn/ui components)
├── data/ (5 arquivos: quiz, plan, devocionais, ebooks, louvores)
├── hooks/ (3 arquivos: useEntitlements, useProductCheckouts, use-mobile)
├── integrations/
│   ├── lovable/ (1 arquivo: OAuth wrapper) ← REMOVER
│   └── supabase/ (5 arquivos: client, server, auth, types) ← SUBSTITUIR
├── lib/
│   ├── admin/ (8 arquivos: auth, queries, kirvano, email, etc.)
│   ├── api/ (1 arquivo: example) ← REMOVER
│   └── (6 arquivos: sound, student, supabase, utm, utils, error)
├── routes/ (31 arquivos) ← CONVERTER para React Router
├── routeTree.gen.ts ← REMOVER (auto-gerado)
├── router.tsx ← SUBSTITUIR
├── server.ts ← REMOVER (SSR)
├── start.ts ← REMOVER (SSR)
└── styles.css (1001 linhas)
```

---

## 3. Referencias Lovable (TODAS devem ser removidas)

### Pacotes
- `@lovable.dev/cloud-auth-js` → substituir por Supabase Auth direto
- `@lovable.dev/vite-tanstack-config` → substituir por vite.config.ts manual

### Imports a remover/substituir
| Pattern | Arquivos afetados |
|---------|------------------|
| `@/integrations/supabase/client` | 25 arquivos |
| `@/integrations/supabase/client.server` | 6 arquivos |
| `@/integrations/supabase/auth-middleware` | 3 arquivos |
| `@/integrations/supabase/auth-attacher` | 1 arquivo (start.ts) |
| `@/integrations/lovable` | 1 arquivo (login.tsx) |
| `createFileRoute` (TanStack Router) | 31 arquivos (todas as rotas) |
| `createServerFn` (TanStack Start) | 4 arquivos |
| `createMiddleware` (TanStack Start) | 2 arquivos |

### Meta tags Lovable no __root.tsx
- `title: "Lovable App"` → trocar
- `og:title: "Lovable App"` → trocar
- `twitter:site: "@Lovable"` → trocar
- OG/Twitter image URLs em `lovable.app` CDN → trocar

### Arquivos auto-gerados (DELETAR)
- `src/routeTree.gen.ts`
- `src/integrations/lovable/index.ts`
- `src/integrations/supabase/client.ts`
- `src/integrations/supabase/client.server.ts`
- `src/integrations/supabase/auth-attacher.ts`
- `src/integrations/supabase/auth-middleware.ts`

---

## 4. Arquivos grandes (> 300 linhas)

| Linhas | Arquivo | Acao |
|--------|---------|------|
| 946 | quiz/QuizApp.tsx | MIGRAR inteiro, quebrar em componentes menores |
| 800 | supabase/types.ts | REGENERAR do schema real |
| 744 | ui/sidebar.tsx | MANTER (shadcn/ui) |
| 685 | routeTree.gen.ts | DELETAR |
| 564 | admin.produtos.tsx | MIGRAR |
| 493 | admin.cursos.tsx | MIGRAR |
| 480 | admin.louvores.tsx | MIGRAR |
| 424 | data/quiz.ts | MIGRAR inteiro |
| 409 | admin.audios.tsx | MIGRAR |
| 380 | admin.clientes.tsx | MIGRAR |
| 331 | ui/chart.tsx | MANTER (shadcn/ui) |
| 321 | admin.config.tsx | MIGRAR |
| 314 | data/plan.ts | MIGRAR inteiro |

---

## 5. Configs de Build

### vite.config.ts (ATUAL — delegado a Lovable)
```ts
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
export default defineConfig({ tanstackStart: { server: { entry: "server" } } });
```
→ SUBSTITUIR por config manual Vite + React

### tsconfig.json
- Target: ES2022, JSX: react-jsx, Module: ESNext
- Path alias: `@/*` → `./src/*` ← MANTER
- Strict mode ← MANTER

### components.json (shadcn/ui)
- Style: new-york, Icon: lucide ← MANTER

---

## 6. Variaveis de Ambiente

### Client-side (VITE_*)
| Var | Valor atual | Acao |
|-----|-------------|------|
| VITE_SUPABASE_URL | xzmlsnghjmwbyebrcfdh.supabase.co | TROCAR → cemjibbauvvyfaxilrvm |
| VITE_SUPABASE_ANON_KEY | (anon key do xzml...) | TROCAR → anon key do cemj... |
| VITE_KIRVANO_URL | NÃO EXISTE (fallback placeholder) | DEFINIR URL real |

### Server-side
| Var | Status |
|-----|--------|
| SUPABASE_SERVICE_ROLE_KEY | Injetado pelo Lovable Cloud, NAO esta no .env |
| KIRVANO_WEBHOOK_SECRET | NAO esta no .env |

### Hardcode em supabase-config.ts
- `EXTERNAL_SUPABASE_URL` aponta para `cemjibbauvvyfaxilrvm` (correto, é o banco externo que queremos)
- Tem prioridade sobre .env em supabase.ts

---

## 7. Dois Projetos Supabase em Uso

| Projeto | Ref | Uso |
|---------|-----|-----|
| Lovable Cloud | xzmlsnghjmwbyebrcfdh | .env, integrations/supabase/client.ts |
| Externo (nosso) | cemjibbauvvyfaxilrvm | supabase-config.ts, hardcoded |

Na migracao: usar SOMENTE cemjibbauvvyfaxilrvm.

---

## 8. Resumo para Migracao

### Copiar tal qual (conteudo, nao estrutura)
- src/data/quiz.ts (424L) — perguntas, arquetipos, bridges
- src/data/plan.ts (314L) — plano 7 dias
- src/data/devocionais.ts — catalogo
- src/data/louvores.ts — catalogo
- src/data/ebooks.ts — catalogo
- src/components/quiz/* (4 arquivos) — quiz inteiro
- src/lib/sound.ts — WebAudio 528Hz
- src/lib/utm.ts — UTM capture + Kirvano URL builder
- src/lib/student.ts — localStorage state
- src/styles.css (1001L) — CSS completo
- src/assets/* — imagens

### Converter (TanStack → React Router)
- 31 route files → React Router lazy routes
- 4 server functions → Supabase Edge Functions
- 1 API route (webhook) → Supabase Edge Function

### Deletar (Lovable)
- src/integrations/lovable/
- src/integrations/supabase/ (substituir por client proprio)
- src/routeTree.gen.ts
- src/router.tsx (TanStack)
- src/server.ts
- src/start.ts
- Todas refs a @lovable.dev/*
