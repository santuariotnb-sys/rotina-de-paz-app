import { supabaseAdmin } from "@/integrations/supabase/client.server";

const RESEND_URL = "https://api.resend.com/emails";

function siteUrl(): string {
  return (
    process.env.PUBLIC_SITE_URL ??
    process.env.SITE_URL ??
    "https://rotina-de-paz-app.vercel.app"
  ).replace(/\/$/, "");
}

function fromAddress(): string {
  return process.env.RESEND_FROM ?? "Rotina de Paz <noreply@rotinadepaz.com.br>";
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
  const displayName = opts.name ? escapeHtml(opts.name) : "querida";

  return `<!doctype html><html><body style="margin:0;padding:0;font-family:Arial,sans-serif">
<div style="background:#F8F1F3;padding:40px 20px;">
  <div style="max-width:560px;margin:0 auto;text-align:center;">

    <div style="margin-bottom:28px;">
      <div style="font-family:Georgia,serif;letter-spacing:4px;color:#C49A5A;font-size:18px;">ROTINA DE PAZ</div>
      <div style="letter-spacing:5px;color:#7C6387;font-size:12px;margin-top:4px;">CÍRCULO DA PAZ</div>
    </div>

    <div style="background:#FFFDFC;border:1px solid #E8D8C5;border-radius:28px;padding:38px 32px;box-shadow:0 18px 45px rgba(74,59,86,0.10);">

      <div style="height:1px;background:#E2C792;margin-bottom:30px;"></div>

      <h1 style="font-family:Georgia,serif;color:#4A3B56;font-size:30px;line-height:1.2;margin:0 0 14px;">
        ${displayName}, bem-vinda ao Círculo da Paz
      </h1>

      <p style="color:#7C6387;font-size:16px;line-height:1.6;margin:0 0 18px;">
        Sua compra foi confirmada com sucesso.
      </p>

      <p style="color:#4A3B56;font-size:16px;line-height:1.7;margin:0 0 28px;">
        Hoje você deu um passo de fé, cuidado e coragem pela sua paz interior.
        Seu acesso ao <strong>Círculo da Paz</strong> já está liberado.
      </p>

      <a href="${opts.loginUrl}" style="display:inline-block;background:#C9A45C;color:#1F1A14;text-decoration:none;font-weight:bold;font-size:16px;padding:16px 34px;border-radius:16px;box-shadow:0 10px 24px rgba(201,164,92,0.35);">
        Criar minha conta e acessar
      </a>

      <div style="background:#FAF4F0;border:1px solid #E8D8C5;border-radius:18px;padding:18px;margin:30px 0 24px;">
        <p style="color:#7C6387;font-size:14px;line-height:1.6;margin:0;">
          Ao clicar, seu nome e e-mail já estarão preenchidos.<br>
          Basta criar uma senha para entrar.
        </p>
      </div>

      <p style="color:#7C6387;font-size:14px;margin:0 0 28px;">
        Já tem conta? <a href="${siteUrl()}/login" style="color:#C49A5A;font-weight:bold;text-decoration:none;">Fazer login</a>
      </p>

      <div style="height:1px;background:#F0E4D8;margin:26px 0;"></div>

      <p style="font-family:Georgia,serif;color:#9A8A96;font-size:14px;font-style:italic;line-height:1.6;margin:0;">
        "E sede transformados pela renovação da vossa mente."<br>
        — Romanos 12:2
      </p>

    </div>
  </div>
</div>
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
  const firstName = opts.name?.split(" ")[0] ?? "";
  const subject = firstName
    ? `${firstName}, bem-vinda ao Círculo da Paz ✨`
    : "Bem-vinda ao Círculo da Paz ✨";

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