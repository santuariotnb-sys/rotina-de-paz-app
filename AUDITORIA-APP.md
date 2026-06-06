# Auditoria do App — Rotina de Paz / Círculo da Paz

> Pente-fino em 4 frentes (bugs, UX, conteúdo, retenção) por 4 agentes em paralelo.
> **Read-only — nada foi alterado.** Roadmap pra decidir o que planejar/executar.
> Data: 2026-06-06.

## Ordem sugerida de ataque
1. **Fase 1 — Cliente pagante (P0/P1)** — protege quem pagou, baixo risco.
2. **Fase 2 — Retenção** — maior alavancagem de uso/receita.
3. **Fase 3 — UX/polish mobile** — percepção de qualidade.
4. **Fase 4 — Conteúdo/metadados** — limpeza de catálogo.

Processo combinado antes de mexer: **ler os arquivos exatos → plano → executar**.

---

## FASE 1 — Bugs & Estabilidade (cliente pagante) 🔴

| Sev | Local | Problema | Correção |
|---|---|---|---|
| **P0** | `src/routes/app.tsx:50-75` | Auth gate só roda no `.then()` do `getSession()`; se rejeitar, nunca há `setAuthReady(true)` → preso no Splash pra sempre. Sessão não-hidratada no 1º tick pode chutar cliente pagante pro /login. | `.catch()` com fallback/retry + garantir `setAuthReady(true)`; tratar hidratação tardia via `onAuthStateChange`. |
| **P0** | `src/routes/app.volume.$turno.tsx:36-66` | Query `method-audio` sem `error`/`isError`: falha de rede/RLS → `methodAudio` undefined → SessionModal mostra CTA de **compra (cadeado)** pra quem JÁ PAGOU. | Distinguir loading vs erro vs "sem produto"; só mostrar checkout quando confirmado que não há entitlement. |
| **P0** | `src/routes/app.volume.$turno.tsx` (tela) | Sem verificação de entitlement: gate é só "tem audio_url?". Inconsistente com ebooks (`getEbookUrl` server-side). (suspeita de regra) | Usar `useEntitlements()`/server fn pra decidir liberação, como nos ebooks. |
| **P1** | `src/routes/login.tsx:36-41` | `onAuthStateChange` navega pra /app em **qualquer** evento (inclui `TOKEN_REFRESHED`, `PASSWORD_RECOVERY`) → redirect indevido, conflita com recovery. | Filtrar `event === "SIGNED_IN"` antes de navegar. |
| **P1** | `src/routes/aceite.tsx:36-39` | `recordLegalAcceptance()` em catch vazio: falha → botão volta a "Aceitar" sem mensagem; cliente trava no gate legal. | Exibir erro + permitir retry com feedback. |
| **P1** | `src/routes/app.ebooks.tsx:197-203` | `getEbookUrl` com `catch {}` silencioso: entitlement expirado/rede/popup bloqueado → nada acontece ao tocar "Ler agora". | Toast/erro; fallback abrir na mesma aba se popup bloqueado. |
| **P1** | `src/components/app/player/PlayerProvider.tsx:81-88` | `play()` não reseta progresso nem chama `a.load()` ao trocar faixa → barra "salta"; em alguns browsers não recarrega. | `setProgress(0); setDuration(0)` + `a.load()` ao trocar `src`. |
| **P2** | `src/components/app/player/PlayerProvider.tsx:64-79` | Handlers do MediaSession setados no effect `[current]` sem cleanup → acumulam, ficam setados após `close()`. | Limpar handlers (`null`) no cleanup. |
| **P2** | `src/routes/reset-password.tsx:28-37` | Link recovery inválido/expirado → `ready` nunca vira true → eterno "Validando link…" sem saída. | Timeout + mensagem de erro + reenviar. |
| **P2** | `src/lib/student.ts:62-75` | `syncStudentWithProfile` faz `upsert` amplo em `profiles` a cada boot → corrida/writes redundantes; erros engolidos. | Reduzir condições; logar/sinalizar falha. |

**Contexto:** cadeia de auth p/ server fns (`attachSupabaseAuth`→`requireSupabaseAuth` em `src/start.ts:23`) e `getEbookUrl` (entitlement server-side) estão sólidos. Risco concentra no fluxo de áudio do método (`volume/$turno`), que confia só em presença de URL e não trata erro.

---

## FASE 2 — Retenção & Engajamento 🟡

| Impacto | Existe? | Oportunidade | Como |
|---|---|---|---|
| **Alto** | Não | Sem PWA/manifest/SW — app não instala na home screen (canal nº1 de retorno de app de hábito). | `vite-plugin-pwa` + manifest (ícones, theme-color, standalone) + SW de cache. |
| **Alto** | Não | Zero lembretes — nada puxa de volta manhã/noite (gatilho central do produto). | Push PWA ou quick-win: lembrete diário por email (`send-email.functions.ts` já existe) via cron. |
| **Alto** | Parcial | Conclusão 100% manual ("Marcar como feita"); ouvir até o fim não conta → subnotifica progresso. | Auto-marcar `done` no evento `ended` (~90%) no SessionModal/player. |
| **Alto** | Parcial | Progresso só em `localStorage` (`sacra_progress`) → limpar browser/trocar aparelho zera tudo. | Persistir no Supabase (tabela `progress` por user_id), mesclar como `syncStudentWithProfile`. |
| **Alto** | Não | Sem streak/sequência de dias — sem mecânica de hábito. | Com progresso datado, calcular dias consecutivos + badge "X dias seguidos". |
| **Médio** | Parcial | Home sugere próximo passo só por contagem, ignora horário do dia. | `new Date().getHours()` pra priorizar manhã/noite. |
| **Médio** | Não | Bônus sem selo "Novo" → conteúdo novo passa despercebido. | Badge "Novo" via `created_at` vs último acesso. |
| **Médio** | Parcial | Sem "continuar de onde parou" no áudio; jornada 14 dias sem celebração de marco. | Salvar `currentTime` por faixa + modal de conquista ao completar Volume I/II. |
| **Médio** | Não | Sem reengajamento pra quem some ("Senti sua falta, retomar Dia X"). | Banner condicional quando `now - lastProgressDate > N dias`. |
| **Baixo** | Parcial | MediaSession só no player de louvores, não no áudio do método. | Reaproveitar PlayerProvider/MediaSession no método. |

**Quick-wins (ordem):** (1) auto-conclusão ao fim do áudio, (2) PWA instalável, (3) lembrete diário por email via cron, (4) progresso no Supabase (destrava streak + reengajamento).

---

## FASE 3 — UX & Polish Visual 🟢

| Prio | Local | Problema | Melhoria |
|---|---|---|---|
| Alta | `src/styles.css:424` | `prefers-reduced-motion` só cobre `[data-scope="admin"]`; splash 28 partículas/springs ignoram (público ansioso). | Estender p/ `*` global, neutralizar animation/transition. |
| Alta | `src/styles.css` (global) | Sem `:focus-visible` global → navegação teclado/leitor sem foco. | Ring de foco com `--gold-warm`. |
| Alta | `FullPlayer.tsx:31` | Capa do louvor é gradiente genérico p/ toda faixa → parece "não carregado". | Renderizar `current.cover` real com fallback. |
| Alta | `FullPlayer.tsx:36-40` | `<input range>` nativo, thumb minúsculo difícil de arrastar. | Thumb ≥28px, trilha mais alta, área de toque maior. |
| Média | `app.devocionais.tsx:48`, `app.louvores.tsx:73` | "Carregando…" em texto vs skeleton dos ebooks → inconsistência. | Padronizar skeletons (reusar `EbooksSkeleton`). |
| Média | `MiniPlayer.tsx:34`, `AppNav.tsx:44` | Botões 36px (`h-9 w-9`) abaixo do mínimo de toque (44px). | ≥44px ou ampliar área tocável. |
| Média | `app.index.tsx:150,:23` | "Bem-vinda" fixo feminino; ArchetypePicker sem transição/boas-vindas. | Saudação neutra/dinâmica + entrada animada. |
| Média | `app.louvores.tsx:66-69` | Sem header/skeleton no load; "● Tocando" sutil demais. | Reforçar estado tocando + contagem real (evita layout shift). |
| Baixa | `app.devocionais.tsx`, `app.louvores.tsx` | Estados vazios = 1 linha de texto, quebra tom premium. | Card vazio com ícone + frase + CTA. |
| Baixa | `AppNav.tsx:121` | `h-4.5 w-4.5` não é classe Tailwind válida → ícones podem cair p/ default. | Trocar por `h-5 w-5`. |

**Notas:** paleta, tipografia, `rdp-light-card`, gradientes e safe-areas estão muito consistentes. MediaSession já existe no PlayerProvider.

---

## FASE 4 — Conteúdo & Catálogo 🔵

| Prio | Item | Problema | Ação |
|---|---|---|---|
| Alta | `louvores` (DB) / `src/data/louvores.ts` | Só **salmos** (148). BOOKS lista 4 livros (Provérbios, 1 Tess, Colossenses) sem faixas → abas vazias. | Popular ou remover do BOOKS até ter conteúdo. |
| Alta | `course_lessons` (DB) | 7 aulas do curso com `duration_seconds = 0` (UI mostra 0s). | Preencher durações reais. |
| Alta | `ebooks` (DB) títulos | Typos: "Imegens", "Biblia das Emoções", "Dormir Melhor␣␣Hoje", "Da Ansiedade a Gratidão". | Corrigir grafia. |
| Média | `ebooks` `sort_order` | Todos = 0 → ordem indefinida. | Definir sort_order por categoria. |
| Média | `ebooks` `subtitle` | 5 de 6 sem subtitle. | Adicionar subtítulos. |
| Média | `louvores` `is_bonus` | 148 faixas todas `is_bonus = true` (provável engano em massa). | Revisar quais são bônus. |
| Média | `louvores` títulos | Caixa inconsistente ("SALMOS 10" vs "Salmos N"); subtítulos nulos. | Normalizar capitalização. |
| Baixa | `products` vs `ebooks` | 6 ebooks sem `required_product_id` mapeado verificado. | Conferir vínculo produto↔ebook p/ entitlement. |
| Baixa | `src/data/*.ts` | Dados estáticos legados não usados (UI lê do DB). | Remover constantes mortas. |
| Baixa | Seeds | Só `seed-audios.sql` (14 áudios); louvores/ebooks/courses sem seed versionado. | Documentar/criar seeds. |

**Estado geral:** núcleo completo e sólido (14 áudios manhã/noite no Bunny CDN, curso 7 dias com vídeos+capas HTTP 200, tudo via Supabase). Lacunas são de **qualidade de metadados** e **cobertura de louvores** — nada quebrado, mas catálogo preenchido à mão.
