import { supabaseAdmin } from "@/integrations/supabase/client.server";

const RESEND_URL = "https://api.resend.com/emails";

function siteUrl(): string {
  return (
    process.env.PUBLIC_SITE_URL ??
    process.env.SITE_URL ??
    "https://sacra.app"
  ).replace(/\/$/, "");
}

function fromAddress(): string {
  return process.env.RESEND_FROM ?? "Sacra <no-reply@resend.dev>";
}

/** Gera magic link de acesso direto (login sem senha). Falha silenciosa. */
async function magicLinkFor(email: string): Promise<string | null> {
  try {
    const { data, error } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: { redirectTo: `${siteUrl()}/app` },
    });
    if (error) return null;
    return data.properties?.action_link ?? null;
  } catch {
    return null;
  }
}

function renderWelcomeHtml(opts: {
  name: string | null;
  productNames: string[];
  loginUrl: string;
}): string {
  const greeting = opts.name ? `Olá, ${opts.name}!` : "Olá!";
  const products = opts.productNames.length
    ? `<ul style="padding-left:20px;margin:8px 0 24px;color:#1a1a1a">${opts.productNames
        .map((n) => `<li style="margin:4px 0">${escapeHtml(n)}</li>`)
        .join("")}</ul>`
    : "";

  return `<!doctype html><html><body style="margin:0;background:#ffffff;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff">
    <tr><td align="center" style="padding:32px 16px">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fafafa;border:1px solid #ececec;border-radius:16px;overflow:hidden">
        <tr><td style="padding:32px 32px 8px">
          <h1 style="margin:0 0 8px;font-size:22px;color:#0a0a0a">${greeting}</h1>
          <p style="margin:0 0 16px;font-size:15px;line-height:1.55;color:#3a3a3a">
            Sua compra foi aprovada e seu acesso já está liberado. Seja muito bem-vinda ao Sacra.
          </p>
          ${products ? `<p style="margin:0 0 6px;font-size:13px;color:#6a6a6a">Você desbloqueou:</p>${products}` : ""}
          <p style="margin:0 0 24px;font-size:15px;line-height:1.55;color:#3a3a3a">
            Clique no botão abaixo pra entrar direto no seu app — sem precisar de senha.
          </p>
          <p style="margin:0 0 32px">
            <a href="${opts.loginUrl}" style="display:inline-block;background:linear-gradient(90deg,#3B5BFD,#7C3AED);color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 22px;border-radius:10px">Acessar meu app</a>
          </p>
          <p style="margin:0 0 6px;font-size:12px;color:#8a8a8a">Se o botão não funcionar, copie e cole este link no navegador:</p>
          <p style="margin:0 0 24px;font-size:12px;color:#5a5a5a;word-break:break-all">${opts.loginUrl}</p>
        </td></tr>
        <tr><td style="padding:16px 32px 28px;border-top:1px solid #ececec">
          <p style="margin:0;font-size:12px;color:#9a9a9a">
            Você recebeu este email porque comprou um produto do Sacra. Qualquer dúvida, responda esta mensagem.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;",
  );
}

/**
 * Envia email de boas-vindas via Resend após compra aprovada.
 * Falha silenciosa: nunca quebra o webhook.
 */
export async function sendWelcomeEmail(opts: {
  email: string;
  name: string | null;
  productNames: string[];
}): Promise<{ sent: boolean; error?: string }> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { sent: false, error: "RESEND_API_KEY ausente" };

  const loginUrl = (await magicLinkFor(opts.email)) ?? `${siteUrl()}/login`;
  const html = renderWelcomeHtml({ name: opts.name, productNames: opts.productNames, loginUrl });
  const subject = opts.productNames.length
    ? `Seu acesso ao ${opts.productNames[0]} está liberado 💌`
    : "Seu acesso está liberado 💌";

  try {
    const res = await fetch(RESEND_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromAddress(),
        to: [opts.email],
        subject,
        html,
      }),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      return { sent: false, error: `Resend ${res.status}: ${txt.slice(0, 200)}` };
    }
    return { sent: true };
  } catch (e) {
    return { sent: false, error: e instanceof Error ? e.message : String(e) };
  }
}