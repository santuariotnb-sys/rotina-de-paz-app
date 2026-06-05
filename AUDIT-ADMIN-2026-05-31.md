# Auditoria Completa — Admin Rotina de Paz App

**Data:** 2026-05-31  
**Escopo:** 17 rotas admin, Supabase (15 tabelas, 4 buckets, RLS), seguranca, eficiencia  
**Tipo:** Read-only (nada alterado)

---

## Resumo Executivo

O app esta ~85% funcional com RLS em todas as tabelas e auth guard no admin. Porem ha **2 problemas criticos** que precisam de atencao antes de ir pra producao, e ~15 melhorias de media/alta prioridade.

---

## CRITICOS (corrigir antes de producao)

### C1. Service Role Key em `.env.vercel` no disco

O arquivo `.env.vercel` contem `SUPABASE_SERVICE_ROLE_KEY` em texto claro. Essa chave bypassa **todo o RLS**. Mesmo que esteja no `.gitignore`, pode ter sido commitada historicamente.

**Acao imediata:**
1. Rotacionar a key no dashboard Supabase
2. Verificar `git log --all -- .env.vercel` para confirmar que nunca foi commitada
3. Deletar o arquivo local e gerenciar secrets apenas via Vercel dashboard

### C2. Buckets de storage publicos vazam conteudo pago

Os 4 buckets (`method-audios`, `louvores-audios`, `ebooks-files`, `course-videos`) sao `public: true`. Qualquer pessoa com URL direta baixa audios, PDFs e videos sem autenticacao. Combinado com `file_url`/`video_url` expostos no RLS de ebooks/courses, **todo conteudo pago esta acessivel publicamente**.

**Acao:**
1. Tornar buckets privados (`public: false`)
2. Servir conteudo via signed URLs geradas no servidor
3. Adicionar `has_entitlement(required_product_id)` nas policies de `ebooks`, `courses` e `course_lessons`

---

## ALTA PRIORIDADE

| # | Problema | Arquivo(s) | Acao |
|---|----------|------------|------|
| H1 | Guard admin 100% client-side — UI admin visivel para nao-admins (dados protegidos por RLS) | `admin.tsx:39-54` | Adicionar `beforeLoad` server-side com `assertAdmin` |
| H2 | Queries admin rodam no browser com anon key — seguranca depende exclusivamente do RLS | 15+ rotas admin | Migrar queries para `createServerFn` com auth middleware |
| H3 | Sem protecao contra replay de webhooks — sem check de idempotencia | `api/public/webhooks/kirvano.ts` | Verificar `kirvano_transaction_id` antes de processar |
| H4 | Upload sem validacao de tamanho/tipo no servidor | `admin.audios`, `admin.louvores`, `admin.ebooks`, `admin.cursos` | Validar tamanho + MIME no cliente e considerar proxy server-side |
| H5 | `admin.membros.tsx` — profiles **SEM LIMIT** — pode crashar o browser | `admin.membros.tsx:54-65` | Adicionar `.limit(500)` e paginacao |

---

## PERFORMANCE — Top 5

| # | Problema | Impacto | Acao |
|---|----------|---------|------|
| P1 | `admin.webhooks.tsx` — carrega `payload` (JSON grande) de 100 logs de uma vez | PERF-CRITICAL | Remover `payload` do SELECT, carregar sob demanda |
| P2 | `admin.index.tsx` — carrega TODOS quiz_responses.archetype para contar no client | PERF-CRITICAL | Criar RPC com `GROUP BY archetype` |
| P3 | `admin.index.tsx` — receita calculada no client (todos entitlements × prices) | PERF-CRITICAL | Criar `sum(price_cents)` server-side |
| P4 | `admin.louvores.tsx` — BulkUploader faz upload sequencial em loop | PERF-CRITICAL | Paralelizar com batches de 3-5 (`Promise.all`) |
| P5 | QueryClient sem `defaultOptions` — `staleTime: 0` causa refetch a cada mount/focus | PERF-MODERATE | Adicionar `defaultOptions: { queries: { staleTime: 30_000 } }` |

---

## ARQUITETURA — Inconsistencias

### Tema Visual (2 temas misturados)
- **Light:** admin.produtos, admin.config, admin.vendas, admin.index
- **Dark:** admin.audios, admin.louvores, admin.cursos, admin.ebooks, admin.acessos, admin.clientes, admin.webhooks, admin.leads, admin.membros, admin.tracking, admin.suporte

### Query Keys sem convencao
- `["admin", "products"]` vs `["adm-products-list"]` vs `["adm-products-mini"]` vs `["adm-config-products"]` vs `["adm-vendas-products"]`
- A mesma query de products duplicada em ~5 arquivos com keys diferentes → cache desperdicado

### Duplicacao de codigo
- `admin.clientes` vs `admin.membros` — ~70% identico (drawer, grant, listar entitlements)
- `MiniPlayer` duplicado identicamente em `admin.audios` e `admin.louvores`
- Logica de grant replicada em 3 rotas (acessos, clientes, membros)

### Limits inconsistentes
- profiles: 500 (clientes) vs SEM LIMIT (membros)
- entitlements: 500 (acessos/vendas) vs 2000 (clientes/membros)

---

## SUPABASE — Schema e RLS

### Schema: 15 tabelas
Todas com RLS habilitado. Foreign keys e cascades bem configurados.

### RLS — Issues encontrados

| Tabela | Problema | Severidade |
|--------|----------|------------|
| ebooks | SELECT permite qualquer authenticated — `file_url` exposto sem verificar entitlement | ALTO |
| courses | SELECT permite qualquer authenticated — sem verificar entitlement | ALTO |
| course_lessons | SELECT permite qualquer authenticated — `video_url` exposto | ALTO |
| louvores | `USING(true)` no SELECT — intencional (conteudo aberto para membros) | OK |
| storage.objects | Todos buckets publicos — conteudo pago acessivel por URL | CRITICO |

### Funcoes — `is_admin()`
Historico de migracoes conflitante (grant → revoke → re-grant → revoke parcial). Estado final correto: executavel por `authenticated`. Mas qualquer usuario pode testar UIDs arbitrarios para descobrir quem e admin.

### Triggers duplicados
Varias tabelas podem ter 2 triggers `set_updated_at` (original + recriado na migracao `141454`). Sem bug funcional, mas trabalho desnecessario.

### Indices ausentes
- `products.status` — usado em policies RLS, sem indice
- `entitlements.kirvano_transaction_id` — sem indice para idempotencia
- `webhook_logs.event_type` — sem indice

---

## SEGURANCA — Pontos Positivos

1. RLS habilitado em todas as 15 tabelas
2. HMAC-SHA256 com timing-safe comparison no webhook
3. Server functions protegidas com `requireSupabaseAuth` + `assertAdmin`
4. Audit logging presente via `logAdminAction`
5. Auth middleware robusto com validacao de Bearer token
6. Input validation com Zod nas server functions
7. HTML escaping em emails
8. Storage write protegido por RLS (`is_admin`)
9. `noindex,nofollow` nas paginas admin

---

## PLANO DE ACAO — Ordem de Prioridade

### Onda 0: Emergencia (hoje)
1. Rotacionar service role key
2. Verificar se `.env.vercel` foi commitado

### Onda 1: Seguranca (antes de producao)
3. Tornar buckets privados + signed URLs
4. Adicionar `has_entitlement()` nas policies de ebooks/courses/course_lessons
5. Guard server-side no admin (`beforeLoad`)

### Onda 2: Performance
6. Remover `payload` do SELECT em webhooks
7. RPCs server-side para KPIs (receita, arquetipos)
8. QueryClient defaultOptions (`staleTime: 30_000`)
9. Limit em `admin.membros` profiles
10. Paralelizar BulkUploader

### Onda 3: Qualidade de codigo
11. Unificar query keys
12. Extrair drawer compartilhado (clientes/membros)
13. Extrair MiniPlayer compartilhado
14. Padronizar tema visual (dark ou light, nao ambos)
15. `.select()` explicito em vez de `select("*")`

---

## AUDITORIA PROFUNDA — Suporte, Tracking, Quiz

### Sistema de Suporte

**Fluxo completo:** Aluna cria ticket (categoria + assunto + mensagem) → admin ve na lista → admin responde (status → answered) → email para aluna → aluna responde (status → open) → admin fecha (status → closed) → email para aluna.

**O que funciona:**
- Fluxo basico completo (criar, responder, fechar)
- RLS solida (aluna so ve proprios tickets, admin ve todos)
- 4 canais de email (novo ticket, admin reply, user reply, ticket closed)
- `assertAdmin` server-side nas funcoes de email
- Validacao Zod nos inputs
- Audit log em respostas e fechamentos

**Bugs encontrados:**

| # | Severidade | Problema | Arquivo |
|---|-----------|----------|---------|
| S1 | **BUG** | Profile lookup usa `.eq("id", user.id)` em vez de `.eq("user_id", user.id)` — profile nao encontrado, nome cai pro fallback (email split) | `app.suporte.tsx:198`, `app.suporte.$ticketId.tsx:83` |
| S2 | **MEDIO** | Sem realtime/polling — aluna nao sabe que recebeu resposta ate recarregar | Queries sem `refetchInterval` |
| S3 | **MEDIO** | Aluna pode inserir mensagem em ticket fechado via API direta (UI bloqueia mas RLS nao) | RLS de `support_messages` nao valida status do ticket |
| S4 | **MEDIO** | Policy de UPDATE permite aluna mudar qualquer coluna do proprio ticket (status, category, subject) via API direta | RLS de `support_tickets` |
| S5 | **MENOR** | Email fire-and-forget com `.catch(() => {})` — falha silenciosa | `app.suporte.tsx` (notifyNewTicket, notifyUserReply) |
| S6 | **MENOR** | Ticket pode ficar orfao sem mensagens se insert da mensagem falhar apos insert do ticket (sem transacao atomica) | `app.suporte.tsx:218-225` |

---

### Sistema de Tracking/UTM

**Pipeline:** LP captura UTMs → insere lead no banco → aluna faz quiz → compra via Kirvano → webhook cria entitlement → admin ve conversao por match de email.

**O que funciona:**
- Schema `leads` completo (5 campos UTM + referrer + ip + user_agent + scores)
- `captureUtms()` bem implementada (7 params, localStorage persistence)
- `buildKirvanoUrl()` propaga UTMs pro checkout
- Dashboard Tracking: KPIs, graficos Top Sources/Campaigns, tabela com busca, CSV
- Dashboard Leads: KPIs, donut arquetipos, bar chart leads/dia, tabela, CSV

**GAPS FATAIS:**

| # | Severidade | Gap | Impacto |
|---|-----------|-----|---------|
| T1 | **FATAL** | `captureUtms()` e `buildKirvanoUrl()` sao **codigo morto** — nunca importadas em nenhum componente | UTMs nunca sao capturados neste app |
| T2 | **FATAL** | Nao existe nenhum `supabase.from("leads").insert(...)` neste codebase | Tabela leads so recebe dados se LP externa existir |
| T3 | **GRAVE** | Conversao por match de email e fragil — email diferente no quiz vs compra = nao atribuida | Metricas imprecisas |
| T4 | **GRAVE** | UTMs nao voltam do Kirvano — `entitlements` nao tem campos UTM | Impossivel saber qual campanha gerou qual venda |
| T5 | **MODERADO** | Limite de 1000 leads nos dashboards — dados truncados silenciosamente | |
| T6 | **MODERADO** | Admin Overview usa `quiz_responses`, dashboard usa `leads` — tabelas diferentes, numeros divergentes | |
| T7 | **MENOR** | Tabela `leads` nao tem colunas `fbclid`/`gclid` mas `captureUtms()` captura | Dados perdidos |

**Conclusao:** O tracking depende de uma **LP externa** (provavelmente `rotinadepaz.com.br/quiz`) que insere leads. Neste app, o pipeline esta desconectado.

---

### Sistema de Quiz

**Estrutura:** 7 perguntas multipla escolha, 4 arquetipos (vigilante, sobrecarga, culposa, antecipatoria). Scoring em 4 perguntas, tie-break deterministico.

**O que existe:**
- Dados completos do quiz (`src/data/quiz.ts`) — perguntas, opcoes, scoring, arquetipos com conteudo rico (mechanismHtml, desarmeHtml, metodoHtml, bridges, chapters)
- Persistencia local (`src/lib/student.ts` — localStorage)
- Sync com profile autenticado (`syncStudentWithProfile()`)
- Banco pronto (tabelas `leads`, `quiz_responses` com RLS e insert anonimo)
- Admin dashboards prontos (graficos, tabela, filtros, CSV)

**O que NAO existe (0% implementado):**

| Item | Status |
|------|--------|
| Componente QuizFlow (UI interativa) | **NAO EXISTE** |
| Rota publica `/quiz` | **NAO EXISTE** |
| Pagina de resultado | **NAO EXISTE** |
| Endpoint POST /api/public/quiz | **NAO EXISTE** |
| Formulario de captura de email | **NAO EXISTE** |
| Redirecionamento pos-quiz | **NAO EXISTE** |

**Dead code em `quiz.ts`:** `computeArchetype()`, `getTransition()`, `QUESTIONS`, `ENCOURAGEMENTS`, `CONFIRMATIONS`, `DESIRE_CTA`, `DESIRE_QUOTE` — nunca importados por nenhum arquivo. Somente `ARCHETYPES` e `type Archetype` sao usados (pelo `app.index.tsx` como fallback manual `ArchetypePicker`).

**Conclusao:** O quiz esta perfeitamente projetado como dados mas **nao existe como experiencia de usuario**. O `ArchetypePicker` no app.index.tsx e uma escolha manual de arquetipo — nao e quiz.

---

## PLANO DE ACAO ATUALIZADO — Ordem de Prioridade

### Onda 0: Emergencia (hoje)
1. Rotacionar service role key
2. Verificar se `.env.vercel` foi commitado

### Onda 1: Bugs (corrigir agora)
3. Fix profile lookup no suporte: `.eq("id")` → `.eq("user_id")` em 2 arquivos
4. Adicionar `.limit(500)` em `admin.membros` profiles

### Onda 2: Seguranca (antes de producao)
5. Tornar buckets privados + signed URLs
6. Adicionar `has_entitlement()` nas policies de ebooks/courses/course_lessons
7. Restringir UPDATE da aluna em support_tickets (so `updated_at`)
8. Bloquear INSERT em support_messages de ticket fechado (RLS)
9. Guard server-side no admin (`beforeLoad`)

### Onda 3: Performance
10. Remover `payload` do SELECT em webhooks
11. RPCs server-side para KPIs (receita, arquetipos)
12. QueryClient defaultOptions (`staleTime: 30_000`)
13. Paralelizar BulkUploader
14. Adicionar `refetchInterval: 30_000` no suporte

### Onda 4: Meta Pixel + CAPI (ZERO implementado)

**Estado atual: O Meta nao recebe NENHUM sinal de conversao. Zero eventos.**

| Evento | Client (fbq) | Server (CAPI) | Status |
|--------|-------------|---------------|--------|
| PageView | NAO EXISTE | N/A | Sem pixel instalado |
| Lead | NAO EXISTE | NAO EXISTE | Quiz nao existe como UI |
| InitiateCheckout | NAO EXISTE | NAO EXISTE | `buildKirvanoUrl()` monta URL mas nao dispara evento |
| Purchase | NAO EXISTE | NAO EXISTE | Webhook Kirvano nao envia CAPI |
| ViewContent | NAO EXISTE | NAO EXISTE | |

**Ausencias criticas:**
- Nenhum snippet `fbevents.js` no layout
- Nenhum `fbq()` em qualquer arquivo
- Nenhuma chamada a `graph.facebook.com`
- `facebook-nodejs-business-sdk` nao esta no `package.json`
- Nenhuma env var Meta (`META_PIXEL_ID`, `META_ACCESS_TOKEN`)
- `fbclid` capturado em `utm.ts` mas desperdicado (nao cria cookie `_fbc`)
- Pagina `/obrigado` nao existe (thank-you fica no Kirvano)

**Para implementar (ordem):**
15. Instalar pixel Meta no `__root.tsx` (PageView automatico)
16. Instalar `facebook-nodejs-business-sdk` + configurar env vars
17. Disparar Purchase server-side (CAPI) no webhook Kirvano
18. Criar pagina `/obrigado` com Purchase client-side (deduplicado via event_id)
19. Disparar InitiateCheckout em `buildKirvanoUrl()` / CTAs de compra
20. Disparar Lead na captura de email (depende do quiz)
21. Criar cookie `_fbc` a partir do `fbclid` para CAPI

### Onda 5: Features faltantes
22. Implementar UI do quiz (QuizFlow, rota /quiz, resultado, captura email)
23. Conectar pipeline de tracking (chamar `captureUtms`, usar `buildKirvanoUrl`)
24. Criar endpoint POST /api/public/quiz para inserir leads + quiz_responses
25. Adicionar `lead_id` em entitlements para atribuicao de conversao

### Onda 6: Qualidade de codigo
26. Unificar query keys
27. Extrair drawer compartilhado (clientes/membros)
28. Padronizar tema visual
29. `.select()` explicito em vez de `select("*")`
