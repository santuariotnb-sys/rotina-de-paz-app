# Plano de Migração: Lovable → Repo Próprio (React 18 + Vite)

**Data:** 2026-05-28
**Origem:** `~/paz-guiada-diaria` (TanStack Start + Lovable Cloud)
**Destino:** Novo repo React 18 + Vite + Tailwind v3
**Supabase:** `cemjibbauvvyfaxilrvm` (externo, já tem leads/quiz_responses/risk_events)
**Deploy:** Cloudflare Pages

---

## Decisões já tomadas

- Stack: React 18 + Vite + Tailwind v3 (mesmo do rotina-de-paz)
- Quiz 100% fiel ao original (textos, efeitos, animações, timing)
- Supabase externo: `cemjibbauvvyfaxilrvm`
- Checkout: Kirvano (redirect externo)
- Remover TODOS metadados Lovable (TanStack Start, Lovable Cloud, lovable imports)

---

## O que existe no Lovable (mapeado)

### Quiz (funcional, 100% fiel ao preservar)
- 7 perguntas com scoring → 4 arquétipos (vigilante, sobrecarga, culposa, antecipatoria)
- State machine: hero → questions → loading (6 msgs × 1200ms) → result → bridge → offer → Kirvano redirect
- Sub-componentes: HeroScreen, QuestionScreen, LoadingScreen, ResultScreen, BridgeScreen, OfferScreen
- Efeitos: AmbientParticles (18 dots gold), GuideAvatar (breathing + blinking), SpeechBubble (typewriter), EmotionalProgress
- Som: WebAudio 528Hz sine wave (0.32s) a cada resposta
- Transições contextuais: Q2 usa resposta de Q1, Q4 usa resposta de Q3
- Confirmações aleatórias: "Compreendi 🤍" / "Anotado 🤍" / "Entendi 🤍" / "Recebi 🤍" (900ms)
- Encorajamentos a cada 3 perguntas (2500ms)
- Risk gate: Q2 opções 3/4 → /quiz/encaminhamento (zero tracking, zero PII)
- Email capture: opcional no ResultScreen (segundo INSERT em leads)
- Persistência: leads + quiz_responses no Supabase, sacra_student no localStorage

### Tracking/UTM
- captureUtms() no mount → localStorage["rdp:utm"]
- UTMs passados na URL Kirvano via buildKirvanoUrl()
- Campos: utm_source, utm_medium, utm_campaign, utm_content, utm_term, fbclid, gclid

### Oferta (OfferScreen)
- De R$197 por R$67 (12× de R$5,59)
- 6 bônus listados
- Garantia 7 dias incondicional
- CTA: "Eu creio — quero minha paz →" + CTA personalizado por desejo
- Redirect → Kirvano com archetype + nome + email + UTMs

### App da Aluna (parcialmente funcional)
- Auth: Supabase Auth (email+senha + Google)
- Splash screen: 1500ms, gold particles, "Haja Luz"
- Home: cards do plano 7 dias (manhã/noite)
- Player: AudioContext, MiniPlayer sticky, FullPlayer modal, MediaSession API
- Gating: entitlements por product_id
- Dados locais: devocionais.ts (hardcoded), louvores de Supabase
- syncStudentWithProfile: mescla localStorage com profiles table

### Admin
- Gate: admin_users table + is_admin() function
- Páginas: overview KPIs, clientes, membros, acessos, produtos, cursos, áudios, louvores, ebooks, vendas, webhooks, config
- Stubs vazios: /admin/leads, /admin/tracking
- Webhook: Kirvano POST → verifica HMAC → processKirvanoPayload → entitlements

### Banco (cemjibbauvvyfaxilrvm — já criado)
- ✅ leads (com RLS anon INSERT)
- ✅ quiz_responses (com RLS anon INSERT)
- ✅ risk_events (com RLS anon INSERT)
- ❌ Falta: profiles, admin_users, entitlements, products, product_kirvano_offers, audio_tracks, courses, course_lessons, ebooks, louvores, webhook_logs, admin_audit_logs
- ❌ Falta: functions (is_admin, has_entitlement, grant_entitlement_manual, handle_new_user, set_updated_at)
- ❌ Falta: storage buckets (method-audios, louvores-audios, ebooks-files, course-videos)

### CSS/Visual (paleta quiz — diferente do admin)
- Quiz: milk (#FAF6F4), deep-purple (#443A52), lavender (#C4A8BC), gold (#D9C5A5), rose (#D4A5B5)
- App noite: #1A1326, #221A30, #2E2440
- Admin: dark glassmorphism (#07090f, #C9A96E) — sistema isolado

---

## Fases de Migração

### Fase 1 — Scaffold + Quiz (prioridade máxima)
**Objetivo:** Quiz funcionando idêntico em repo próprio com Supabase externo.

1. Criar repo Vite + React 18 + Tailwind v3 + Framer Motion + React Router
2. Configurar Supabase client (cemjibbauvvyfaxilrvm)
3. Migrar dados: src/data/quiz.ts (perguntas, arquétipos, bridges, CTAs)
4. Migrar componentes quiz: QuizApp + todos sub-componentes
5. Migrar utils: utm.ts, sound.ts, student.ts (localStorage)
6. Migrar CSS quiz: todas as classes rdp-*, animações, gradientes
7. Migrar /quiz/encaminhamento (risk page)
8. Testar: quiz completo end-to-end (hero → result → Kirvano redirect)
9. Testar: risk flow (Q2 → encaminhamento, zero tracking)
10. Testar: leads persistindo no Supabase cemjibbauvvyfaxilrvm

### Fase 2 — Banco completo + Webhook
**Objetivo:** Todas as tabelas + webhook Kirvano funcionando.

1. Migration SQL: criar as 10 tabelas faltantes + 5 functions + triggers
2. Storage buckets (privados com signed URLs)
3. Webhook Kirvano: POST /api/webhooks/kirvano (pode ser edge function Supabase)
4. processKirvanoPayload: entitlements, email welcome
5. Testar: webhook manual → entitlement criado

### Fase 3 — App da Aluna
**Objetivo:** App autenticado com player e gating.

1. Auth: login/signup com Supabase Auth
2. Splash screen + sync student
3. Home: plano 7 dias com progresso
4. Player: AudioContext, MiniPlayer, FullPlayer
5. Gating: useEntitlements + isUnlocked
6. Devocionais, Louvores, Ebooks (com gating)
7. Testar: login → app → audio playback → gated content

### Fase 4 — Admin
**Objetivo:** Dashboard admin funcional.

1. Admin gate (admin_users)
2. Overview KPIs
3. Leads (com filtros + export CSV)
4. Tracking (UTMs, funil, conversão por arquétipo)
5. Produtos + Kirvano offers
6. Acessos + entitlements
7. Webhooks (logs + replay)
8. Áudios, Louvores, Ebooks, Cursos (CRUD)

### Fase 5 — Performance + Deploy
**Objetivo:** Produção otimizada.

1. Cache headers (_headers Cloudflare)
2. Preconnect/prefetch Kirvano + CDN
3. Code splitting por rota
4. Bundle analysis (< 80KB JS inicial)
5. Lighthouse mobile > 90
6. Deploy Cloudflare Pages
7. DNS + domínio

---

## Arquivos-fonte críticos (paths no Lovable)

| Arquivo | O que contém | Prioridade |
|---------|-------------|-----------|
| src/data/quiz.ts | 7 perguntas, 4 arquétipos, bridges, CTAs, scoring | P0 |
| src/components/quiz/QuizApp.tsx | Quiz inteiro (946 linhas) | P0 |
| src/components/quiz/Avatar.tsx | Guia avatar (breathing, blinking) | P0 |
| src/components/quiz/SpeechBubble.tsx | Typewriter bubble | P0 |
| src/components/quiz/EmotionalProgress.tsx | Barra de progresso emocional | P0 |
| src/lib/utm.ts | UTM capture + Kirvano URL builder | P0 |
| src/lib/sound.ts | WebAudio 528Hz ding | P0 |
| src/lib/student.ts | localStorage student state | P0 |
| src/styles.css | CSS completo (1001 linhas) | P0 |
| src/routes/quiz.encaminhamento.tsx | Risk/safety page | P0 |
| src/data/plan.ts | Plano 7 dias (4 arquétipos) | P1 |
| src/data/devocionais.ts | Catálogo devocionais | P1 |
| src/components/app/player/PlayerProvider.tsx | Player de áudio | P1 |
| src/hooks/useEntitlements.ts | Gating por produto | P1 |
| src/lib/admin/kirvano.server.ts | Webhook processing | P1 |
| src/integrations/supabase/types.ts | Schema completo | P1 |

---

## O que remover (metadados Lovable)

- `src/integrations/supabase/` (client.ts, types.ts gerados pela Lovable)
- `src/routeTree.gen.ts` (gerado pelo TanStack)
- `src/router.tsx` (TanStack Router — substituir por React Router)
- `src/server.ts` + `src/start.ts` (TanStack Start SSR)
- Todas refs a `lovable.auth.*`
- Todas refs a `@/integrations/supabase/*`
- `.lovable/` directory se existir
- `tanstack.*` configs
- Dependências: `@tanstack/start`, `@tanstack/react-router`, `vinxi`, etc.

---

## Comando para próxima sessão

```
Executar Fase 1 do plano de migração em ~/paz-guiada-diaria/docs/MIGRATION-PLAN.md.
Criar novo repo React 18 + Vite + Tailwind v3 em ~/rotina-de-paz-app.
Supabase: cemjibbauvvyfaxilrvm (anon key: eyJhbGci...).
Código fonte: ~/paz-guiada-diaria (Lovable).
Quiz deve ficar 100% fiel (textos, efeitos, animações, timing).
Remover todos metadados Lovable.
```
