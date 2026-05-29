import { createServerFn } from "@tanstack/react-start";
import { Resend } from "resend";

const FROM = "Rotina de Paz <noreply@rotinadepaz.com.br>";
const SUPPORT_EMAIL = "suporte@rotinadepaz.com.br";

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

// ── Ticket Notifications ──────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  duvida: "Dúvida",
  dificuldade: "Dificuldade técnica",
  erro: "Erro no app",
  reembolso: "Reembolso",
};

export const notifyNewTicket = createServerFn({ method: "POST" })
  .validator((data: { userName: string; userEmail: string; category: string; subject: string; message: string }) => data)
  .handler(async ({ data }) => {
    await sendEmail({
      to: SUPPORT_EMAIL,
      subject: `[Suporte] Novo ticket: ${data.subject} — ${CATEGORY_LABELS[data.category] ?? data.category}`,
      html: `
        <h2>Novo ticket de suporte</h2>
        <p><strong>Aluna:</strong> ${data.userName} (${data.userEmail})</p>
        <p><strong>Categoria:</strong> ${CATEGORY_LABELS[data.category] ?? data.category}</p>
        <p><strong>Assunto:</strong> ${data.subject}</p>
        <hr>
        <p>${data.message.replace(/\n/g, "<br>")}</p>
      `,
    });
  });

export const notifyUserReply = createServerFn({ method: "POST" })
  .validator((data: { userName: string; userEmail: string; subject: string; message: string }) => data)
  .handler(async ({ data }) => {
    await sendEmail({
      to: SUPPORT_EMAIL,
      subject: `[Suporte] Nova resposta: ${data.subject}`,
      html: `
        <h2>Nova resposta da aluna</h2>
        <p><strong>Aluna:</strong> ${data.userName} (${data.userEmail})</p>
        <p><strong>Ticket:</strong> ${data.subject}</p>
        <hr>
        <p>${data.message.replace(/\n/g, "<br>")}</p>
      `,
    });
  });

export const notifyAdminReply = createServerFn({ method: "POST" })
  .validator((data: { userEmail: string; subject: string; message: string }) => data)
  .handler(async ({ data }) => {
    await sendEmail({
      to: data.userEmail,
      subject: `[Rotina de Paz] Resposta ao seu ticket: ${data.subject}`,
      html: `
        <h2>Resposta da equipe Rotina de Paz</h2>
        <p><strong>Ticket:</strong> ${data.subject}</p>
        <hr>
        <p>${data.message.replace(/\n/g, "<br>")}</p>
        <br>
        <p style="color:#888;font-size:12px">Você pode responder acessando o app em rotina-de-paz-app.vercel.app</p>
      `,
    });
  });

export const notifyTicketClosed = createServerFn({ method: "POST" })
  .validator((data: { userEmail: string; subject: string }) => data)
  .handler(async ({ data }) => {
    await sendEmail({
      to: data.userEmail,
      subject: `[Rotina de Paz] Ticket resolvido: ${data.subject}`,
      html: `
        <h2>Seu ticket foi resolvido</h2>
        <p><strong>Ticket:</strong> ${data.subject}</p>
        <p>Se precisar de mais ajuda, abra um novo ticket no app.</p>
        <br>
        <p style="color:#888;font-size:12px">Equipe Rotina de Paz</p>
      `,
    });
  });
