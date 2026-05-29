# Master Plan — Rotina de Paz App (Finalização Completa)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Levar o app Rotina de Paz + Admin de protótipo a produção robusta — conteúdo real, gating funcional, performance, error handling.

**Architecture:** App usa TanStack Router (SSR/Nitro) com TanStack Query para dados. Admin é SPA com Supabase PostgREST direto. Webhook Kirvano já funcional. As queries Supabase já estão implementadas nas rotas — o que falta é conteúdo real, polish e robustez.

**Tech Stack:** React 18, TanStack Router + Start (Nitro), TanStack Query, Supabase (PostgREST + Auth + Storage), Tailwind CSS, Framer Motion, Recharts, Lucide Icons

---

## Estado Atual — Diagnóstico (pós-análise profunda)

### ✅ FUNCIONAL (já pronto)
- Auth completo (login email/senha + Google + reset password)
- Admin: 16 telas operacionais
- Admin: Sidebar responsiva
- Webhook Kirvano (API route + logs + processamento)
- Schema Supabase completo (todas as tabelas migradas)
- App: Louvores → query Supabase ✅
- App: E-books → query Supabase + entitlements + checkout URLs ✅
- App: Devocionais → query Supabase + entitlements + checkout URLs ✅
- App: Dashboard RP7 (7 dias × 2 turnos) → funcional com audio_tracks ✅
- App: Volume/Turno → áudio guiado com gating ✅
- App: Player com MediaSession (controles tela bloqueada) ✅
- App: Depoimentos (estático, social proof) ✅
- App: Navegação responsiva (TopBar desktop + BottomNav mobile) ✅
- Hooks: useEntitlements, useProductCheckouts ✅

### 🔶 FALTA (conteúdo e polish)
- Áudios de louvores são placeholder (sample Pixabay) — precisam de upload real
- Capas de ebooks/devocionais são gradientes CSS — precisam de imagens reais
- RLS: admins não conseguem ler `profiles` (falta policy)
- Favicon retorna 404
- Sem error boundaries globais
- Sem prefetch/cache otimizado
- Plan.ts (RP7) usa dados estáticos por arquétipo — não customizável pelo admin

---

## Plano de Ação — O Que Realmente Falta

### 🔴 ONDA 1: Fixes Críticos (paralelo, ~15min cada)

| # | Task | Arquivos | Paralelo? |
|---|------|----------|-----------|
| 1 | **RLS: admin read profiles** | SQL migration | ✅ |
| 2 | **Favicon + meta tags** | public/, __root.tsx | ✅ |
| 3 | **Error boundary global** | __root.tsx, componentes | ✅ |

---

### Task 1: RLS Fix — Admin read profiles

**Files:**
- Create: `supabase/migrations/fix_rls_profiles_admin.sql`

- [ ] **Step 1: Criar e rodar migration**

```sql
-- Permitir admins lerem todos os profiles
DROP POLICY IF EXISTS "admins read all profiles" ON public.profiles;
CREATE POLICY "admins read all profiles" ON public.profiles
  FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "admins update profiles" ON public.profiles;
CREATE POLICY "admins update profiles" ON public.profiles
  FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));
```

- [ ] **Step 2: Rodar no Supabase remoto**

```bash
PGPASSWORD="[DB_PASSWORD]" psql "postgresql://postgres:[DB_PASSWORD]@db.cemjibbauvvyfaxilrvm.supabase.co:5432/postgres" -f supabase/migrations/fix_rls_profiles_admin.sql
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/fix_rls_profiles_admin.sql
git commit -m "fix(supabase): add admin read/update policies on profiles"
```

---

### Task 2: Favicon + Meta Tags

**Files:**
- Modify: `src/routes/__root.tsx`

- [ ] **Step 1: Verificar se logo existe como asset**

```bash
ls src/assets/rotina-de-paz-logo.png
```

- [ ] **Step 2: Copiar logo para public/ como favicon**

```bash
cp src/assets/rotina-de-paz-logo.png public/favicon.png
```

- [ ] **Step 3: Atualizar __root.tsx head com favicon e meta tags**

Adicionar no `head()` da rota root:

```typescript
meta: [
  { title: "Rotina de Paz · Círculo da Paz" },
  { name: "description", content: "Método RP7 — sua jornada de paz interior guiada por fé e neurociência." },
  { name: "theme-color", content: "#443A52" },
],
links: [
  { rel: "icon", type: "image/png", href: "/favicon.png" },
],
```

- [ ] **Step 4: Commit**

```bash
git add public/favicon.png src/routes/__root.tsx
git commit -m "feat: add favicon and meta tags"
```

---

### Task 3: Error Boundary Global

**Files:**
- Create: `src/components/app/ErrorFallback.tsx`
- Modify: `src/routes/__root.tsx`

- [ ] **Step 1: Criar ErrorFallback**

```tsx
export function ErrorFallback({ error, reset }: { error: Error; reset?: () => void }) {
  return (
    <div className="grid min-h-dvh place-items-center px-5">
      <div className="max-w-md text-center">
        <h1 className="font-display text-2xl text-[color:var(--deep-purple)]">Algo deu errado</h1>
        <p className="mt-2 text-[13px] text-[color:var(--amethyst)]">{error.message}</p>
        {reset && (
          <button onClick={reset} className="mt-4 rounded-full bg-gradient-to-br from-[#E8C9A0] to-[#C9A876] px-5 py-2.5 text-[13px] font-semibold text-[#2C1F0B]">
            Tentar novamente
          </button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Adicionar ErrorComponent no __root.tsx**

No `createRootRoute`:
```typescript
errorComponent: ({ error }) => <ErrorFallback error={error} />,
```

- [ ] **Step 3: Commit**

```bash
git add src/components/app/ErrorFallback.tsx src/routes/__root.tsx
git commit -m "feat: add global error boundary with retry"
```

---

### 🟡 ONDA 2: Conteúdo Real (paralelo, depende de assets)

| # | Task | O que faz | Paralelo? |
|---|------|-----------|-----------|
| 4 | **Upload áudios louvores** | Subir MP3 reais para Supabase Storage `louvores-audios` e atualizar registros | ✅ |
| 5 | **Upload capas ebooks** | Subir imagens para `ebooks-files` e atualizar `cover_url` | ✅ |
| 6 | **Upload capas devocionais** | Subir imagens para `course-videos` e atualizar `cover_url` | ✅ |
| 7 | **Upload áudios método RP7** | Subir áudios guiados para `method-audios` e criar registros em `audio_tracks` | ✅ |

> ⚠️ **Estas tasks dependem de VOCÊ ter os arquivos de mídia prontos.** O admin dashboard já tem interface para upload de todos eles:
> - `/admin/louvores` — upload de áudios de louvores
> - `/admin/ebooks` — upload de capas e PDFs
> - `/admin/cursos` — upload de capas e vídeos
> - `/admin/audios` — upload de faixas do método

**Ação:** Use o admin dashboard para fazer upload do conteúdo. Não precisa de código — tudo já está implementado.

---

### 🟢 ONDA 3: Performance e Polish (sequencial)

| # | Task | O que faz | Depende de |
|---|------|-----------|------------|
| 8 | **Query prefetch nas rotas** | Prefetch louvores/ebooks/courses no app.tsx para navegação instant | Onda 1 |
| 9 | **Depoimentos dinâmicos (opcional)** | Criar tabela `testimonials` e migrar de hardcoded para Supabase | Nada |

---

### Task 8: Query Prefetch

**Files:**
- Modify: `src/routes/app.tsx`

- [ ] **Step 1: Adicionar prefetch no loader do app.tsx**

```typescript
import { queryClient } from "@/lib/query-client"; // ou onde está configurado

// No layout, após confirmar auth:
useEffect(() => {
  // Prefetch dados comuns para navegação rápida
  queryClient.prefetchQuery({ queryKey: ["louvores"], queryFn: fetchLouvores, staleTime: 5 * 60_000 });
  queryClient.prefetchQuery({ queryKey: ["ebooks"], queryFn: fetchEbooks, staleTime: 5 * 60_000 });
}, []);
```

- [ ] **Step 2: Commit**

```bash
git add src/routes/app.tsx
git commit -m "perf: prefetch louvores and ebooks on app mount"
```

---

### Task 9: Depoimentos Dinâmicos (Opcional)

**Files:**
- Create: migration SQL para tabela `testimonials`
- Modify: `src/routes/app.depoimentos.tsx`

- [ ] **Step 1: Criar tabela**

```sql
CREATE TABLE IF NOT EXISTS public.testimonials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  age INTEGER,
  quote TEXT NOT NULL,
  rating INTEGER NOT NULL DEFAULT 5,
  avatar_url TEXT,
  featured BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.testimonials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone reads testimonials" ON public.testimonials
  FOR SELECT USING (true);
CREATE POLICY "admins manage testimonials" ON public.testimonials
  FOR ALL TO authenticated USING (public.is_admin(auth.uid()));

GRANT SELECT ON public.testimonials TO anon, authenticated;
GRANT ALL ON public.testimonials TO service_role;
```

- [ ] **Step 2: Inserir depoimentos existentes (seed)**

```sql
INSERT INTO public.testimonials (name, age, quote, rating, featured, sort_order) VALUES
('Maria Clara', 34, 'Eu dormia com medo de fechar os olhos. Hoje deito em paz, sabendo que Ele cuida do que não posso controlar.', 5, true, 1),
('Renata Souza', 41, 'Achei que era frescura minha. Depois do método, percebi que carregar tudo sozinha não era força — era medo de pedir ajuda.', 5, true, 2),
('Juliana Mendes', 28, 'Eu orava pedindo paz, mas não conseguia sentir nada. O método me mostrou que paz não é ausência de luta — é presença dEle no meio dela.', 5, true, 3);
```

- [ ] **Step 3: Atualizar app.depoimentos.tsx com query**

```typescript
const { data: testimonials = [] } = useQuery({
  queryKey: ["testimonials"],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("testimonials")
      .select("id, name, age, quote, rating, avatar_url")
      .eq("featured", true)
      .order("sort_order");
    if (error) throw error;
    return data ?? [];
  },
  staleTime: 10 * 60_000,
});
```

- [ ] **Step 4: Criar tela admin.depoimentos.tsx (CRUD)**

- [ ] **Step 5: Commit**

---

## Ordem de Execução

```
ONDA 1 (paralelo — 3 agents simultâneos)
├── Task 1: RLS Fix
├── Task 2: Favicon  
└── Task 3: Error Boundary

ONDA 2 (manual via admin dashboard)
├── Task 4-7: Upload de conteúdo real via UI

ONDA 3 (sequencial — 1 agent)
├── Task 8: Prefetch
└── Task 9: Depoimentos dinâmicos (opcional)

DEPLOY → git push origin main
```

## Resumo

| Categoria | Qtd Tasks | Status |
|-----------|-----------|--------|
| Fixes críticos | 3 | Pronto para executar |
| Conteúdo real | 4 | Depende de assets (upload via admin) |
| Performance | 1 | Após fixes |
| Opcional | 1 | Depoimentos dinâmicos |
| **Total** | **9** | |

**O app está 85% pronto.** Os 15% restantes são: RLS fix, error boundary, favicon, conteúdo real (upload), e polish de performance.
