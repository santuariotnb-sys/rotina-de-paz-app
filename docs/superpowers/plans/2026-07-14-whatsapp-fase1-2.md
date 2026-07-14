# WhatsApp Resultado/Conversao — Fase 1+2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Quando a pessoa termina o quiz e deixa o WhatsApp, disparar (~35s depois) uma mensagem de resultado no WhatsApp dela via Cloud API oficial, com as variaveis do template personalizadas por lead pelo Claude.

**Architecture:** O quiz (Quiz-sacra) faz um `fetch` fire-and-forget para um endpoint publico do rotina-de-paz-app com o `lead_id`. Esse endpoint **enfileira** uma linha em `whatsapp_sends` com `send_after = now() + 35s`. Um cron Vercel de 1 minuto varre as linhas vencidas, gera as variaveis do template com o Claude (`messages.parse`), envia via WhatsApp Cloud API e marca o status. Todo o envio e centralizado no rotina-de-paz-app (o quiz nunca fala com a Meta). Idempotente por `(lead_id, template)`.

**Tech Stack:** TanStack Start (server fns / file routes) · Supabase (Postgres, service role) · Vercel Cron · `@anthropic-ai/sdk` (Claude Opus 4.8, structured outputs) · WhatsApp Cloud API v22.0 (Meta oficial).

---

## Pre-requisitos (BLOQUEIAM o envio real — codigo pode ser construido sem eles)

Sem estes, o codigo compila e enfileira, mas **nenhuma mensagem sai**:

- [ ] **Numero no WhatsApp Business + Cloud API** verificado no Meta Business Manager (Phone Number ID + token permanente).
- [ ] **Template `quiz_resultado` APROVADO** na Meta (categoria Marketing/Utility), com corpo usando `{{1}}` e `{{2}}`. Sem template aprovado, mensagem business-initiated fora da janela de 24h e rejeitada.
- [ ] **Env vars na Vercel** (producao): `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`, `WHATSAPP_ENDPOINT_SECRET`, `WHATSAPP_TEMPLATE_RESULT=quiz_resultado`, `WHATSAPP_LANG=pt_BR`, `ANTHROPIC_API_KEY`. (`CRON_SECRET` ja existe.)
- [ ] **No Quiz-sacra:** `VITE_APP_URL` (base do rotina-de-paz-app) e `VITE_WHATSAPP_ENQUEUE_SECRET` (= `WHATSAPP_ENDPOINT_SECRET`).

> **Decisao de modelo:** o plano usa `claude-opus-4-8` (padrao). E um caminho de alto volume e baixa complexidade (gerar 2 variaveis curtas por lead) — o dono pode trocar por `claude-haiku-4-5` via env `WHATSAPP_COPY_MODEL` para cortar custo. Ambos suportam structured outputs.

---

## File Structure

**rotina-de-paz-app** (backend/envio):
- Create: `supabase/migrations/20260714_whatsapp_sends.sql` — tabela de fila + RLS.
- Create: `src/lib/whatsapp/whatsapp-cloud.server.ts` — cliente HTTP do WhatsApp Cloud API (`sendTemplate`).
- Create: `src/lib/whatsapp/whatsapp-copy.server.ts` — geracao das variaveis via Claude (`generateResultVariables`).
- Create: `src/routes/api/public/whatsapp/enqueue-result.ts` — endpoint publico (quiz -> fila).
- Create: `src/routes/api/cron/whatsapp-dispatch.ts` — cron: fila -> Claude -> envio.
- Modify: `vercel.json` — adiciona o cron de 1 min.

**Quiz-sacra** (frontend/captura):
- Create: `src/lib/whatsapp-enqueue.ts` — helper de fetch fire-and-forget.
- Modify: `src/components/quiz/QuizApp.tsx:~524` — chamar o enqueue apos `save_lead_contact`.

Cada arquivo tem uma responsabilidade unica; nada de logica de envio no quiz.

---

## FASE 1 — Infra

### Task 1: Instalar o SDK do Anthropic

**Files:**
- Modify: `rotina-de-paz-app/package.json`

- [ ] **Step 1: Instalar**

Run: `cd ~/rotina-de-paz-app && npm install @anthropic-ai/sdk`
Expected: `@anthropic-ai/sdk` aparece em `dependencies`.

- [ ] **Step 2: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore(whatsapp): add @anthropic-ai/sdk"
```

---

### Task 2: Migration `whatsapp_sends`

**Files:**
- Create: `supabase/migrations/20260714_whatsapp_sends.sql`

- [ ] **Step 1: Escrever a migration**

```sql
-- Fila de envios de WhatsApp (resultado/conversao + futuro follow-up/CRM).
create table if not exists public.whatsapp_sends (
  id          uuid primary key default gen_random_uuid(),
  lead_id     uuid not null references public.leads(id),
  template    text not null,
  status      text not null default 'pending',  -- pending | sent | failed | skipped
  send_after  timestamptz not null default now(),
  variables   jsonb,
  wa_message_id text,
  error       text,
  attempts    int not null default 0,
  quiz_id     text,
  created_at  timestamptz not null default now(),
  sent_at     timestamptz,
  unique (lead_id, template)  -- idempotencia: 1 resultado por lead
);

-- indice para o cron pegar so as linhas vencidas e pendentes
create index if not exists idx_whatsapp_sends_due
  on public.whatsapp_sends (send_after)
  where status = 'pending';

alter table public.whatsapp_sends enable row level security;
revoke all on public.whatsapp_sends from public, anon;
-- sem policy = so service role (backend) acessa. Conforme padrao do repo.

comment on table public.whatsapp_sends is
  'Fila de envios WhatsApp Cloud API. Escrita/leitura so pelo backend (service role).';
```

- [ ] **Step 2: Aplicar no banco vivo via Management API**

Aplicar colando o SQL no editor SQL do Supabase, OU via script `.mjs` reusando o padrao dos `scripts/` (service role, sem curl).
Expected: `select to_regclass('public.whatsapp_sends')` retorna `whatsapp_sends`.

- [ ] **Step 3: Provar contra o banco vivo** (regra do CLAUDE.md: migration != banco real)

Run: script read-only que faz `select count(*) from whatsapp_sends` e confere `has_table_privilege('anon','public.whatsapp_sends','select') = false`.
Expected: tabela existe, anon sem acesso.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260714_whatsapp_sends.sql
git commit -m "feat(whatsapp): whatsapp_sends queue table + RLS"
```

---

### Task 3: Modulo de envio WhatsApp Cloud API

**Files:**
- Create: `src/lib/whatsapp/whatsapp-cloud.server.ts`

> Confirmar o shape exato do payload de template contra a doc atual da Meta (Context7 / graph.facebook.com docs) na hora de implementar — versoes da API mudam.

- [ ] **Step 1: Escrever o modulo**

```ts
// src/lib/whatsapp/whatsapp-cloud.server.ts
// Cliente do WhatsApp Cloud API (Meta oficial). So backend.
const API_VERSION = "v22.0";

export type SendTemplateResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

/**
 * Envia uma mensagem de TEMPLATE aprovado. Mensagens business-initiated fora da
 * janela de 24h EXIGEM template — nao da pra mandar texto livre. As `variables`
 * preenchem {{1}}, {{2}}... do corpo, na ordem.
 */
export async function sendTemplate(opts: {
  to: string;        // E.164 sem "+", ex "5511999998888"
  template: string;  // nome do template aprovado
  lang: string;      // ex "pt_BR"
  variables: string[];
}): Promise<SendTemplateResult> {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_ID;
  if (!token || !phoneId) return { ok: false, error: "missing_credentials" };

  const url = `https://graph.facebook.com/${API_VERSION}/${phoneId}/messages`;
  const body = {
    messaging_product: "whatsapp",
    to: opts.to,
    type: "template",
    template: {
      name: opts.template,
      language: { code: opts.lang },
      components: [
        {
          type: "body",
          parameters: opts.variables.map((v) => ({ type: "text", text: v })),
        },
      ],
    },
  };

  let r: Response;
  try {
    r = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000), // timeout defensivo
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "fetch_failed" };
  }

  const j = (await r.json().catch(() => ({}))) as any;
  if (!r.ok) return { ok: false, error: j?.error?.message ?? `http_${r.status}` };
  const id = j?.messages?.[0]?.id;
  return id ? { ok: true, id } : { ok: false, error: "no_message_id" };
}
```

- [ ] **Step 2: Verificar tipo**

Run: `cd ~/rotina-de-paz-app && npx tsc --noEmit 2>&1 | grep whatsapp-cloud`
Expected: vazio (sem erro).

- [ ] **Step 3: Commit**

```bash
git add src/lib/whatsapp/whatsapp-cloud.server.ts
git commit -m "feat(whatsapp): Cloud API template sender"
```

---

### Task 4: Modulo de geracao de variaveis via Claude

**Files:**
- Create: `src/lib/whatsapp/whatsapp-copy.server.ts`

- [ ] **Step 1: Escrever o modulo**

```ts
// src/lib/whatsapp/whatsapp-copy.server.ts
// Gera as variaveis do template quiz_resultado por lead, via Claude structured output.
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

const client = new Anthropic(); // le ANTHROPIC_API_KEY

// Padrao da skill claude-api. Alto volume + baixa complexidade -> dono pode trocar
// por "claude-haiku-4-5" via env. Ambos suportam structured outputs.
const MODEL = process.env.WHATSAPP_COPY_MODEL ?? "claude-opus-4-8";

const VarsSchema = z.object({
  // {{1}} saudacao personalizada com o nome (curta)
  saudacao: z.string(),
  // {{2}} frase-eco do arquetipo/desejo (1 linha, tom NeuroFe)
  frase_arquetipo: z.string(),
});

export type ResultVariables = z.infer<typeof VarsSchema>;

const SYSTEM = [
  "Voce escreve DUAS variaveis curtas para um template de WhatsApp da Rotina de Paz",
  "(publico: mulheres cristas 45-60, ansiedade, buscam sentir Deus).",
  "Regras rigidas: cada variavel em UMA linha, sem emoji, sem quebra de linha,",
  "no maximo ~90 caracteres, tom acolhedor e biblico sem exagero. Use o nome se houver.",
].join(" ");

// WhatsApp rejeita variaveis com \n, \t ou 4+ espacos seguidos.
function clean(s: string): string {
  return s.replace(/\s+/g, " ").trim().slice(0, 120);
}

export async function generateResultVariables(lead: {
  name: string | null;
  archetype: string | null;
  desire: string | null;
  situation: string | null;
}): Promise<ResultVariables> {
  const res = await client.messages.parse({
    model: MODEL,
    max_tokens: 1024,
    thinking: { type: "disabled" }, // tarefa simples; aceito no Opus 4.8
    output_config: {
      effort: "low",
      format: zodOutputFormat(VarsSchema, "vars"),
    },
    system: SYSTEM,
    messages: [{ role: "user", content: JSON.stringify(lead) }],
  });

  const out = res.parsed_output;
  if (!out) throw new Error("claude_parse_failed");
  return { saudacao: clean(out.saudacao), frase_arquetipo: clean(out.frase_arquetipo) };
}
```

- [ ] **Step 2: Verificar tipo**

Run: `cd ~/rotina-de-paz-app && npx tsc --noEmit 2>&1 | grep whatsapp-copy`
Expected: vazio.

- [ ] **Step 3: Provar contra a API real** (script de verificacao, nao commitado)

Criar `scripts/_verify-copy.mjs` que chama `generateResultVariables` com um lead sintetico e imprime a saida. Requer `ANTHROPIC_API_KEY` no `.env`.
Expected: 2 strings curtas, 1 linha cada, <=120 chars, sem `\n`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/whatsapp/whatsapp-copy.server.ts
git commit -m "feat(whatsapp): Claude-generated template variables per lead"
```

---

## FASE 2 — Disparo (resultado/conversao)

### Task 5: Endpoint publico de enfileiramento

**Files:**
- Create: `src/routes/api/public/whatsapp/enqueue-result.ts`

> Padrao de seguranca igual ao webhook Kirvano: URL nao-adivinhavel + secret via query + idempotencia. O secret e de baixo valor (so enfileira 1 msg para um numero ja capturado, idempotente). Copiar o FORMATO exato de file-route de `src/routes/api/public/webhooks/kirvano.ts`.

- [ ] **Step 1: Escrever o endpoint** (ajustar o wrapper ao formato do kirvano.ts do repo)

```ts
// src/routes/api/public/whatsapp/enqueue-result.ts
import { createServerFileRoute } from "@tanstack/react-start/server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const TEMPLATE = process.env.WHATSAPP_TEMPLATE_RESULT ?? "quiz_resultado";
const DELAY_SECONDS = 35;

export const ServerRoute = createServerFileRoute(
  "/api/public/whatsapp/enqueue-result",
).methods({
  POST: async ({ request }) => {
    // 1. secret gate
    const url = new URL(request.url);
    const secret = process.env.WHATSAPP_ENDPOINT_SECRET;
    if (!secret || url.searchParams.get("k") !== secret) {
      return new Response("forbidden", { status: 403 });
    }

    // 2. body
    let leadId: string | undefined;
    try {
      const raw = await request.text();
      if (raw.length > 4096) return new Response("too large", { status: 413 });
      leadId = JSON.parse(raw)?.lead_id;
    } catch {
      return new Response("bad json", { status: 400 });
    }
    if (!leadId || typeof leadId !== "string") {
      return new Response("missing lead_id", { status: 400 });
    }

    const db = supabaseAdmin as any;

    // 3. lead precisa existir, ter whatsapp e nao ser teste
    const { data: lead } = await db
      .from("leads")
      .select("id, whatsapp, is_test, quiz_id")
      .eq("id", leadId)
      .maybeSingle();
    if (!lead?.whatsapp) return Response.json({ ok: true, skipped: "no_whatsapp" });
    if (lead.is_test) return Response.json({ ok: true, skipped: "is_test" });

    // 4. enfileira idempotente: send_after = agora + 35s
    const sendAfter = new Date(Date.now() + DELAY_SECONDS * 1000).toISOString();
    const { error } = await db.from("whatsapp_sends").upsert(
      {
        lead_id: leadId,
        template: TEMPLATE,
        status: "pending",
        send_after: sendAfter,
        quiz_id: lead.quiz_id ?? null,
      },
      { onConflict: "lead_id,template", ignoreDuplicates: true },
    );
    if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

    return Response.json({ ok: true, enqueued: true });
  },
});
```

- [ ] **Step 2: Verificar tipo**

Run: `cd ~/rotina-de-paz-app && npx tsc --noEmit 2>&1 | grep enqueue-result`
Expected: vazio.

- [ ] **Step 3: Commit**

```bash
git add src/routes/api/public/whatsapp/enqueue-result.ts
git commit -m "feat(whatsapp): public enqueue-result endpoint (35s delay)"
```

---

### Task 6: Cron de disparo (fila -> Claude -> WhatsApp)

**Files:**
- Create: `src/routes/api/cron/whatsapp-dispatch.ts`

> Molde: `src/routes/api/cron/capi-retry.ts` (CRON_SECRET, limite por run, status). Copiar o gate de auth de la.

- [ ] **Step 1: Escrever o cron**

```ts
// src/routes/api/cron/whatsapp-dispatch.ts
import { createServerFileRoute } from "@tanstack/react-start/server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendTemplate } from "@/lib/whatsapp/whatsapp-cloud.server";
import { generateResultVariables } from "@/lib/whatsapp/whatsapp-copy.server";

const LANG = process.env.WHATSAPP_LANG ?? "pt_BR";
const MAX_PER_RUN = 15;
const MAX_ATTEMPTS = 3;

export const ServerRoute = createServerFileRoute(
  "/api/cron/whatsapp-dispatch",
).methods({
  GET: async ({ request }) => {
    // auth identico ao capi-retry
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
      return new Response("unauthorized", { status: 401 });
    }

    const db = supabaseAdmin as any;
    const nowISO = new Date().toISOString();

    // linhas vencidas, pendentes, com tentativas restantes
    const { data: due, error } = await db
      .from("whatsapp_sends")
      .select("id, lead_id, template, attempts")
      .eq("status", "pending")
      .lte("send_after", nowISO)
      .lt("attempts", MAX_ATTEMPTS)
      .order("send_after", { ascending: true })
      .limit(MAX_PER_RUN);
    if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

    let sent = 0, failed = 0, skipped = 0;

    for (const row of due ?? []) {
      // carregar o lead (com whatsapp + campos p/ a copy). Re-checa is_test.
      const { data: lead } = await db
        .from("leads")
        .select("id, name, whatsapp, is_test, archetype, desire, situation")
        .eq("id", row.lead_id)
        .maybeSingle();

      if (!lead?.whatsapp || lead.is_test) {
        await db.from("whatsapp_sends")
          .update({ status: "skipped", error: !lead?.whatsapp ? "no_whatsapp" : "is_test" })
          .eq("id", row.id);
        skipped++;
        continue;
      }

      try {
        const vars = await generateResultVariables({
          name: lead.name, archetype: lead.archetype,
          desire: lead.desire, situation: lead.situation,
        });
        const res = await sendTemplate({
          to: lead.whatsapp, // ja vem "55..." do save_lead_contact
          template: row.template,
          lang: LANG,
          variables: [vars.saudacao, vars.frase_arquetipo],
        });

        if (res.ok) {
          await db.from("whatsapp_sends").update({
            status: "sent", wa_message_id: res.id, variables: vars,
            sent_at: new Date().toISOString(), attempts: row.attempts + 1, error: null,
          }).eq("id", row.id);
          sent++;
        } else {
          await db.from("whatsapp_sends").update({
            status: row.attempts + 1 >= MAX_ATTEMPTS ? "failed" : "pending",
            error: res.error, attempts: row.attempts + 1,
          }).eq("id", row.id);
          failed++;
        }
      } catch (e) {
        await db.from("whatsapp_sends").update({
          status: row.attempts + 1 >= MAX_ATTEMPTS ? "failed" : "pending",
          error: e instanceof Error ? e.message : String(e),
          attempts: row.attempts + 1,
        }).eq("id", row.id);
        failed++;
      }
    }

    return Response.json({ ok: true, sent, failed, skipped });
  },
});
```

- [ ] **Step 2: Verificar tipo**

Run: `cd ~/rotina-de-paz-app && npx tsc --noEmit 2>&1 | grep whatsapp-dispatch`
Expected: vazio.

- [ ] **Step 3: Commit**

```bash
git add src/routes/api/cron/whatsapp-dispatch.ts
git commit -m "feat(whatsapp): dispatch cron (queue -> Claude vars -> Cloud API)"
```

---

### Task 7: Registrar o cron no vercel.json

**Files:**
- Modify: `vercel.json`

- [ ] **Step 1: Adicionar a entrada de cron**

No array `crons`, adicionar (1 min e a granularidade minima da Vercel; o delay real fica entre 35s e ~95s):

```json
{ "path": "/api/cron/whatsapp-dispatch", "schedule": "* * * * *" }
```

- [ ] **Step 2: Commit**

```bash
git add vercel.json
git commit -m "chore(whatsapp): schedule whatsapp-dispatch cron (every minute)"
```

---

### Task 8: Gatilho no quiz (captura -> enqueue)

**Files:**
- Create: `Quiz-sacra/src/lib/whatsapp-enqueue.ts`
- Modify: `Quiz-sacra/src/components/quiz/QuizApp.tsx` (logo apos `save_lead_contact` retornar, ~linha 524)

- [ ] **Step 1: Helper de enqueue**

```ts
// Quiz-sacra/src/lib/whatsapp-enqueue.ts
// Fire-and-forget: avisa o backend pra enfileirar a msg de resultado no WhatsApp.
const APP_URL = import.meta.env.VITE_APP_URL as string | undefined;
const SECRET = import.meta.env.VITE_WHATSAPP_ENQUEUE_SECRET as string | undefined;

export function enqueueWhatsappResult(leadId: string): void {
  if (!APP_URL || !SECRET || !leadId) return;
  try {
    fetch(`${APP_URL}/api/public/whatsapp/enqueue-result?k=${encodeURIComponent(SECRET)}`, {
      method: "POST",
      keepalive: true, // sobrevive a navegacao/redirect
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ lead_id: leadId }),
    }).catch(() => {}); // silencioso: nunca bloqueia o quiz
  } catch {
    /* noop */
  }
}
```

- [ ] **Step 2: Chamar no submitContact, apos `save_lead_contact`**

Em `QuizApp.tsx`, importar `enqueueWhatsappResult` e chamar logo apos a RPC `save_lead_contact` resolver com sucesso (perto da linha 524), passando o `lead_id` ja disponivel. Fire-and-forget — nao `await`, nao bloqueia o fluxo de tracking/checkout existente.

```ts
import { enqueueWhatsappResult } from "@/lib/whatsapp-enqueue";
// ... dentro de submitContact, apos save_lead_contact:
enqueueWhatsappResult(leadId);
```

- [ ] **Step 3: Verificar build do quiz**

Run: `cd ~/Quiz-sacra && npm run build`
Expected: build passa.

- [ ] **Step 4: Commit (no repo Quiz-sacra)**

```bash
cd ~/Quiz-sacra
git add src/lib/whatsapp-enqueue.ts src/components/quiz/QuizApp.tsx
git commit -m "feat(quiz): enqueue WhatsApp result after contact capture"
```

---

## Verificacao end-to-end (apos pre-requisitos prontos)

- [ ] Setar as env vars na Vercel + no `.env` local dos dois repos.
- [ ] Enviar seu WhatsApp num quiz de teste com um **email de teste da denylist** -> deve cair como `is_test` e **NAO** enviar (so grava skipped). Confirmar em `whatsapp_sends`.
- [ ] Enviar com um numero real seu (fora da denylist) -> apos ~1 min, mensagem chega no WhatsApp; `whatsapp_sends.status = sent`, `wa_message_id` preenchido, `variables` gravadas.
- [ ] Disparar o cron manualmente: `GET /api/cron/whatsapp-dispatch` com header `Authorization: Bearer $CRON_SECRET`.
- [ ] Conferir painel Meta: a conversa aparece; sem bloqueios de qualidade.

## Rollout / seguranca

- Deploy e push na `main` (producao automatica). Bumpar `APP_BUILD`.
- Comecar com volume baixo (voce ja esta segurando verba) para o numero "aquecer" o tier de qualidade da Meta — aquecimento aqui e operacional (responder rapido, baixo bloqueio), nao codigo.
- `whatsapp_sends` e a fonte de verdade auditavel (status/erro por lead) — nada de envio "solto".

---

## Self-Review

- **Cobertura do spec:** conversao/resultado (Tasks 2-8) OK. Follow-up 24h e CRM WhatsApp ficam para Fase 3/4 (fora deste plano, mas a tabela `whatsapp_sends` e os modulos ja servem de base). OK
- **Timer 35s:** `send_after = now()+35s` + cron 1 min -> delay real 35-95s. Documentado. OK
- **Claude preenche variaveis:** Task 4 (`messages.parse` + Zod). OK Modelo trocavel por env. OK
- **is_test:** filtrado no enqueue E no cron (dupla checagem). OK
- **Idempotencia:** unique `(lead_id, template)` + upsert ignoreDuplicates. OK
- **Consistencia de tipos:** `sendTemplate` recebe `variables: string[]`; o cron passa `[saudacao, frase_arquetipo]` na ordem {{1}},{{2}}. OK
- **Placeholders:** nenhum — todo codigo presente. Pontos marcados "confirmar contra doc/repo" sao verificacoes de API externa, nao TODOs de codigo.
