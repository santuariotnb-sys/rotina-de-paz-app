import { createServerFn } from "@tanstack/react-start";
import { Resend } from "resend";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const FROM = "Rotina de Paz <noreply@rotinadepaz.com.br>";
const SUPPORT_EMAIL = "rotinadepaz.suporte@gmail.com";

async function assertAdmin(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("admin_users")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) throw new Error("Unauthorized");
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getResend() {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.warn("[send-email] RESEND_API_KEY not set — emails will be skipped");
    return null;
  }
  return new Resend(key);
}

type EmailPayload = {
  to: string;
  subject: string;
  html: string;
};

async function sendEmail(payload: EmailPayload): Promise<boolean> {
  const resend = getResend();
  if (!resend) return false;
  try {
    await resend.emails.send({
      from: FROM,
      to: payload.to,
      subject: payload.subject,
      html: payload.html,
    });
    return true;
  } catch (e) {
    console.error("[send-email] Failed:", e);
    return false;
  }
}

// ── Zod Schemas ──────────────────────────────────────

const ticketCategory = z.enum(["duvida", "dificuldade", "erro", "reembolso"]);

const newTicketSchema = z.object({
  userName: z.string().min(1),
  userEmail: z.string().email(),
  category: ticketCategory,
  subject: z.string().min(3).max(100),
  message: z.string().min(10).max(2000),
});

const userReplySchema = z.object({
  userName: z.string().min(1),
  userEmail: z.string().email(),
  subject: z.string().min(1),
  message: z.string().min(1).max(2000),
});

const adminReplySchema = z.object({
  userEmail: z.string().email(),
  subject: z.string().min(1),
  message: z.string().min(1).max(2000),
});

const ticketClosedSchema = z.object({
  userEmail: z.string().email(),
  subject: z.string().min(1),
});

// ── Ticket Notifications ──────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  duvida: "Dúvida",
  dificuldade: "Dificuldade técnica",
  erro: "Erro no app",
  reembolso: "Reembolso",
};

export const notifyNewTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(newTicketSchema)
  .handler(async ({ data }) => {
    try {
      await sendEmail({
        to: SUPPORT_EMAIL,
        subject: `[Suporte] Novo ticket: ${data.subject} — ${CATEGORY_LABELS[data.category] ?? data.category}`,
        html: `
          <h2>Novo ticket de suporte</h2>
          <p><strong>Aluna:</strong> ${escapeHtml(data.userName)} (${escapeHtml(data.userEmail)})</p>
          <p><strong>Categoria:</strong> ${escapeHtml(CATEGORY_LABELS[data.category] ?? data.category)}</p>
          <p><strong>Assunto:</strong> ${escapeHtml(data.subject)}</p>
          <hr>
          <p>${escapeHtml(data.message).replace(/\n/g, "<br>")}</p>
        `,
      });
    } catch (e) {
      console.error("[send-email] notifyNewTicket failed:", e);
      // Falha silenciosa — ticket já foi salvo no banco, email é best-effort
    }
  });

export const notifyUserReply = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(userReplySchema)
  .handler(async ({ data }) => {
    try {
      await sendEmail({
        to: SUPPORT_EMAIL,
        subject: `[Suporte] Nova resposta: ${data.subject}`,
        html: `
          <h2>Nova resposta da aluna</h2>
          <p><strong>Aluna:</strong> ${escapeHtml(data.userName)} (${escapeHtml(data.userEmail)})</p>
          <p><strong>Ticket:</strong> ${escapeHtml(data.subject)}</p>
          <hr>
          <p>${escapeHtml(data.message).replace(/\n/g, "<br>")}</p>
        `,
      });
    } catch (e) {
      console.error("[send-email] notifyUserReply failed:", e);
      // Falha silenciosa — ticket já foi salvo no banco, email é best-effort
    }
  });

export const notifyAdminReply = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(adminReplySchema)
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    try {
      await sendEmail({
        to: data.userEmail,
        subject: `[Rotina de Paz] Resposta ao seu ticket: ${data.subject}`,
        html: `
          <h2>Resposta da equipe Rotina de Paz</h2>
          <p><strong>Ticket:</strong> ${escapeHtml(data.subject)}</p>
          <hr>
          <p>${escapeHtml(data.message).replace(/\n/g, "<br>")}</p>
          <br>
          <p style="color:#888;font-size:12px">Você pode responder acessando o app em rotina-de-paz-app.vercel.app</p>
        `,
      });
    } catch (e) {
      console.error("[send-email] notifyAdminReply failed:", e);
      // Falha silenciosa — ticket já foi salvo no banco, email é best-effort
    }
  });

export const notifyTicketClosed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(ticketClosedSchema)
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    try {
      await sendEmail({
        to: data.userEmail,
        subject: `[Rotina de Paz] Ticket resolvido: ${data.subject}`,
        html: `
          <h2>Seu ticket foi resolvido</h2>
          <p><strong>Ticket:</strong> ${escapeHtml(data.subject)}</p>
          <p>Se precisar de mais ajuda, abra um novo ticket no app.</p>
          <br>
          <p style="color:#888;font-size:12px">Equipe Rotina de Paz</p>
        `,
      });
    } catch (e) {
      console.error("[send-email] notifyTicketClosed failed:", e);
      // Falha silenciosa — ticket já foi salvo no banco, email é best-effort
    }
  });
