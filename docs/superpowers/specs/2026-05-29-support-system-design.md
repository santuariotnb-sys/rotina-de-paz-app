# Design — Sistema de Suporte (Tickets)

## Contexto

O app Rotina de Paz precisa de um sistema de suporte por tickets. Alunas abrem tickets categorizados pelo app, admins respondem pelo painel. Notificações por email em ambas as direções.

---

## 1. Fluxo da Aluna (App)

### Rota: `/app/suporte`

**Acesso:** Botão "Suporte" no topbar (substitui o `mailto:` atual no AppNav.tsx)

**Tela principal:**
- Lista de tickets da aluna (ordenados por `updated_at DESC`)
- Cada ticket mostra: categoria (badge), assunto (truncado), status (badge colorido), data
- Status: `open` (Aberto, amber), `answered` (Respondido, green), `closed` (Fechado, gray)
- Botão "Novo ticket" no topo

**Formulário de novo ticket:**
- Campo **Categoria** (select): Dúvida | Dificuldade técnica | Erro no app | Reembolso
- Campo **Assunto** (input, max 100 chars)
- Campo **Mensagem** (textarea, max 2000 chars)
- Botão "Enviar"
- Ao enviar:
  1. Insere `support_tickets` + primeira `support_messages`
  2. Dispara email para `suporte@rotinadepaz.com.br` via Resend (notificação de novo ticket)
  3. Redireciona para lista de tickets com toast de sucesso

**Tela de detalhe do ticket (click na lista):**
- Header: assunto, categoria, status, data
- Thread de mensagens (aluna e admin alternando, estilo chat simples)
- Se status != `closed`: textarea para responder + botão "Enviar resposta"
- Ao enviar resposta:
  1. Insere `support_messages` (sender_type: 'user')
  2. Status volta para `open` (se estava `answered`)
  3. Email para `suporte@rotinadepaz.com.br`

---

## 2. Fluxo do Admin (Painel)

### Rota: `/admin/suporte`

**Sidebar:** Novo item "Suporte" com ícone `MessageSquare`, posicionado após "Tracking" e antes de "Configurações"

**Tela principal:**
- KPIs (3 cards):
  - Tickets abertos (status = open)
  - Respondidos hoje
  - Reembolsos pendentes (category = reembolso AND status = open)
- Filtro por status (Todos / Abertos / Respondidos / Fechados)
- Tabela: Aluna (nome+email) | Categoria (badge) | Assunto | Status (badge) | Última atualização
- Click na linha → Drawer lateral

**Drawer de ticket:**
- Info da aluna: nome, email, arquétipo (join com profiles)
- Thread completa de mensagens
- Campo de resposta (textarea) + botão "Responder" + botão "Fechar ticket"
- Ao responder:
  1. Insere `support_messages` (sender_type: 'admin', sender_id: admin user_id)
  2. Atualiza ticket status para `answered`
  3. Envia email para a aluna com a resposta via Resend
  4. `logAdminAction("ticket.reply", ...)`
- Ao fechar:
  1. Atualiza ticket status para `closed`
  2. Envia email para aluna informando fechamento
  3. `logAdminAction("ticket.close", ...)`

---

## 3. Schema Supabase

### Tabela `support_tickets`

```sql
CREATE TABLE public.support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('duvida', 'dificuldade', 'erro', 'reembolso')),
  subject TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'answered', 'closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

-- Aluna lê/cria seus próprios tickets
CREATE POLICY "users read own tickets" ON public.support_tickets
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "users create own tickets" ON public.support_tickets
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users update own tickets" ON public.support_tickets
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);

-- Admins leem/atualizam todos
CREATE POLICY "admins manage tickets" ON public.support_tickets
  FOR ALL TO authenticated USING (public.is_admin(auth.uid()));

CREATE INDEX idx_tickets_user ON public.support_tickets (user_id, updated_at DESC);
CREATE INDEX idx_tickets_status ON public.support_tickets (status, updated_at DESC);
```

### Tabela `support_messages`

```sql
CREATE TABLE public.support_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  sender_type TEXT NOT NULL CHECK (sender_type IN ('user', 'admin')),
  sender_id UUID NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;

-- Aluna lê mensagens dos seus tickets
CREATE POLICY "users read own ticket messages" ON public.support_messages
  FOR SELECT TO authenticated
  USING (ticket_id IN (SELECT id FROM public.support_tickets WHERE user_id = auth.uid()));
CREATE POLICY "users create messages on own tickets" ON public.support_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_type = 'user'
    AND sender_id = auth.uid()
    AND ticket_id IN (SELECT id FROM public.support_tickets WHERE user_id = auth.uid())
  );

-- Admins leem/criam em todos
CREATE POLICY "admins manage messages" ON public.support_messages
  FOR ALL TO authenticated USING (public.is_admin(auth.uid()));

CREATE INDEX idx_messages_ticket ON public.support_messages (ticket_id, created_at);
```

### Trigger updated_at

```sql
CREATE TRIGGER trg_tickets_updated
  BEFORE UPDATE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
```

---

## 4. Emails (Resend)

### Setup
- Instalar `resend` no projeto: `npm install resend`
- Env var: `RESEND_API_KEY` (server-side only, não VITE_)
- Domínio remetente: `noreply@rotinadepaz.com.br` (precisa verificar domínio no Resend)

### Emails enviados

| Evento | De | Para | Assunto |
|--------|----|----|---------|
| Aluna abre ticket | noreply@rotinadepaz.com.br | suporte@rotinadepaz.com.br | [Suporte] Novo ticket: {assunto} — {categoria} |
| Aluna responde | noreply@rotinadepaz.com.br | suporte@rotinadepaz.com.br | [Suporte] Nova resposta: {assunto} |
| Admin responde | noreply@rotinadepaz.com.br | {aluna.email} | [Rotina de Paz] Resposta ao seu ticket: {assunto} |
| Admin fecha ticket | noreply@rotinadepaz.com.br | {aluna.email} | [Rotina de Paz] Ticket resolvido: {assunto} |

### Implementação
- Server function em `src/lib/api/send-email.functions.ts`
- Chamada via `createServerFn` do TanStack Start (roda no Nitro, não expõe API key)
- Templates HTML inline simples (sem lib de template)

---

## 5. Arquivos

| Ação | Arquivo | Responsabilidade |
|------|---------|-----------------|
| Create | `supabase/migrations/support_tables.sql` | Schema das tabelas |
| Create | `src/routes/app.suporte.tsx` | Lista de tickets da aluna |
| Create | `src/routes/app.suporte.$ticketId.tsx` | Detalhe/thread do ticket |
| Create | `src/routes/admin.suporte.tsx` | Painel admin de suporte |
| Create | `src/lib/api/send-email.functions.ts` | Server function para Resend |
| Modify | `src/components/app/AppNav.tsx` | Trocar mailto por Link /app/suporte |
| Modify | `src/components/admin/AdminSidebar.tsx` | Adicionar item "Suporte" |

---

## 6. Fora do Escopo

- Chat em tempo real / WebSocket
- Anexos / upload de imagens nos tickets
- SLA / auto-fechamento por inatividade
- Notificações push
- Templates de email elaborados (HTML simples, funcional)
- Busca global de tickets
