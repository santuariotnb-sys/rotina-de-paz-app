# PROMPT-MESTRE — Execução Autônoma da Missão de Tracking Fiel (2026-06-30)

> Você é um agente autônomo de **alta qualidade e segurança**. Não há gate humano: o dono
> autorizou **autonomia total** (aplicar no banco e deployar sozinho). "Total" NÃO é
> imprudente — significa que **você mesmo verifica tudo** antes de seguir. Leia este
> documento inteiro, depois `docs/superpowers/specs/2026-06-30-tracking-funil-fiel-design.md`,
> e a memória em `~/.claude/projects/-Users-guilhermehenrique-projects-rotina-de-paz-app/memory/MEMORY.md`.

## 1. Objetivo (Definition of Done)
Quando o dono subir tráfego, **TUDO** tem que funcionar e ser **fiel ao real, sem inflar**:
- Todos os eventos disparam (PageView e custom) em **LP, Quiz Sacra, App, Admin**.
- **EMQ alto** (external_id + IP/UA server-side + fbp/fbc em 100% das compras).
- **Dedup correto**: Pixel↔CAPI com mesmo `event_id`; compra usa `event_id = order_id` da Kirvano.
- **Analytics fiel**: captura de todos os leads, todas as respostas do quiz, entradas/saídas de
  página, liberações (entitlements), checkout Kirvano — tudo **coerente e rastreável** por uma
  espinha de identidade única (`external_id`), ligado por JOIN (nunca UNION).
- Coerência de dados no Admin, **incluindo identificar/separar dados de teste** (`is_test`) dos reais.

## 2. Topologia do projeto (CRÍTICO — não errar)
- **Clone de produção:** `/Users/guilhermehenrique/rotina-de-paz-app` (trabalhe AQUI; NÃO no `/projects/`).
- **Banco de produção:** Supabase `cemjibbauvvyfaxilrvm` — **compartilhado com o Quiz/Sacra**.
  - ⚠️ `supabase/config.toml` diz `xzmlsnghjmwbyebrcfdh` = **LIXO/desatualizado**. Ignore.
- **Superfícies:**
  - LP `rotinadepaz.com.br` → Cloudflare Pages (deploy via wrangler de `~/rotina-de-paz`; ver `~/rotina-de-paz/deploy.sh` + `apps.manifest`).
  - Quiz Sacra → `~/Quiz-sacra` (e servido em `~/rotina-de-paz/public/quiz.html`).
  - App + Admin → este repo (TanStack Router), deploy Vercel.

## 3. Credenciais e como aplicar no PROD (método testado)
- Token Management API (`sbp_…`) em: `<SCRATCHPAD>/sb-token.txt`
- Senha do banco em: `<SCRATCHPAD>/db-password.txt`
- Script de execução SQL: `<SCRATCHPAD>/sb-query.mjs` → `node sb-query.mjs <tokenFile> <sqlFile>`
  (usa `POST https://api.supabase.com/v1/projects/cemjibbauvvyfaxilrvm/database/query`).
- `<SCRATCHPAD>` = `/private/tmp/claude-501/-Users-guilhermehenrique-projects-rotina-de-paz-app/29e92dda-581e-4f1d-b58c-3d6adf3ccc25/scratchpad`
- ⛔ **NUNCA** rodar `supabase db push` (migrations aplicadas fora-de-banda → reaplicaria dezenas no prod compartilhado).
- ⛔ **NUNCA** commitar segredos. `.env` é gitignored; mantenha assim.
- DDL/DML no prod: SEMPRE pelo `sb-query.mjs`. Toda migration nova também vira arquivo em `supabase/migrations/`.

## 4. Arquitetura-alvo (5 pilares) — ver spec para detalhes
1. Espinha de identidade única `external_id` (`rp_<uuid>`) do 1º toque à compra, cookie domínio-raiz `.rotinadepaz.com.br` + localStorage.
2. Captura server-side de IP real (CF-Connecting-IP) + User-Agent, amarrados ao external_id.
3. Dedup via `event_id` compartilhado; compra: `event_id = order_id` Kirvano.
4. Travessia até Kirvano (outro domínio): decorar `<a href>` do checkout + stitching no webhook.
5. Fonte de verdade única; funil por JOIN, `COUNT(DISTINCT external_id)`, filtra `is_test`, receita real-only.

## 5. Status (o que já foi feito)
- ✅ Spec aprovado e commitado (`fa77e24`).
- ✅ **Sprint 0 — Bug #1 (revoke quebrado)**: causa-raiz = CHECK de `entitlements` sem `'revoked'` +
  mutation sem `onError`. Corrigido (migration `20260630_entitlements_allow_revoked_status.sql` +
  `admin.acessos.tsx` com `.select()`/guarda/erro visível), **aplicado no prod e verificado**, commit `984326a`.

## 6. Roadmap (execute nesta ordem, AUDITANDO ANTES)
**FASE 0 — AUDITORIA (read-only, primeiro):** Antes de mudar qualquer coisa, audite o estado REAL
(código + banco ao vivo via sb-query.mjs + eventos). Produza `docs/AUDIT-AUTONOMO-<data>.md` com:
coerência/rastreabilidade dos dados do admin, cobertura atual de eventos por superfície, EMQ atual,
dados de teste vs reais, e o gap vs arquitetura-alvo. Só então execute.

**Sprint 0 (terminar):**
- #2 CSV de segmentos com número 100× errado (em `src/lib/admin/csv.ts` / segmentos).
- #3 Funis contando eventos de teste (filtrar `is_test`).
- #4 Vazamento residual: usuário logado lê tracking de todos (RLS).

**Depois (do spec):** A (medir envios/EMQ no Events Manager) → B (espinha de identidade + IP/UA + stitching + B6 Lead/IC no CAPI) → D (dashboard de gargalos por JOIN) → C (eventos finos + compras in-app plugáveis).

## 7. Guardrails de qualidade/segurança (OBRIGATÓRIOS)
1. **Verifique tudo:** para cada mudança → reproduza o problema, implemente o mínimo, **aplique, verifique o resultado real** (query/teste), e só então prossiga. Se falhar, **reverta** e registre; não empilhe correções.
2. **Nunca destrutivo em dados de clientes reais.** Testes em banco: use transação com ROLLBACK ou dados `is_test`. Jamais um UPDATE/DELETE largo sem WHERE preciso.
3. **Dedup sem dupla contagem:** todo evento navegador+servidor com mesmo `event_id`. Não duplicar pixels.
4. **Commits granulares** no clone de produção, mensagem clara + `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. Commite só os arquivos da mudança (o working tree tem muitos `??`).
5. **Deploy** só depois de build verde + verificação. LP/Quiz via wrangler (`~/rotina-de-paz`), App via Vercel. Confirme que o deploy não derruba o quiz (pipeline unificado).
6. **Log de progresso contínuo** em `docs/PROGRESS-AUTONOMO-<data>.md`: o que fez, o que verificou, o que falta. Atualize a memória quando descobrir algo durável.
7. **Pare e registre (não chute)** se algo estiver ambíguo ou arriscado além do previsto; deixe um TODO claro para o dono em vez de adivinhar.
8. Respeite o `CLAUDE.md` (context-mode: nada de curl/wget; HTTP via node script/ctx).

## 8. Critério de sucesso da rodada
Auditoria completa entregue + Sprint 0 fechado e verificado no prod + progresso real e verificado
em B (espinha/CAPI/dedup), tudo commitado e logado, sem quebrar nenhuma superfície existente.
