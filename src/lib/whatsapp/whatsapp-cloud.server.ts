// Cliente do WhatsApp Cloud API (Meta oficial). So backend.
const API_VERSION = "v22.0";

export type SendTemplateResult = { ok: true; id: string } | { ok: false; error: string };

/**
 * Envia uma mensagem de TEMPLATE aprovado. Mensagens business-initiated fora da
 * janela de 24h EXIGEM template — nao da pra mandar texto livre. As `variables`
 * preenchem {{1}}, {{2}}... do corpo, na ordem.
 */
export async function sendTemplate(opts: {
  to: string; // E.164 sem "+", ex "5511999998888"
  template: string; // nome do template aprovado
  lang: string; // ex "pt_BR"
  variables: string[];
  headerImageUrl?: string; // opcional: se o template tem header de IMAGEM
}): Promise<SendTemplateResult> {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_ID;
  if (!token || !phoneId) return { ok: false, error: "missing_credentials" };

  const url = `https://graph.facebook.com/${API_VERSION}/${phoneId}/messages`;

  // Templates com header de midia EXIGEM o header em cada envio (a imagem da
  // criacao e so amostra pra aprovacao). Botao de URL fixo NAO precisa de
  // component no envio — so URL dinamica (com variavel) precisaria.
  const components: Array<Record<string, unknown>> = [];
  if (opts.headerImageUrl) {
    components.push({
      type: "header",
      parameters: [{ type: "image", image: { link: opts.headerImageUrl } }],
    });
  }
  components.push({
    type: "body",
    parameters: opts.variables.map((v) => ({ type: "text", text: v })),
  });

  const body = {
    messaging_product: "whatsapp",
    to: opts.to,
    type: "template",
    template: {
      name: opts.template,
      language: { code: opts.lang },
      components,
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

  const j = (await r.json().catch(() => ({}))) as {
    error?: { message?: string };
    messages?: Array<{ id?: string }>;
  };
  if (!r.ok) return { ok: false, error: j?.error?.message ?? `http_${r.status}` };
  const id = j?.messages?.[0]?.id;
  return id ? { ok: true, id } : { ok: false, error: "no_message_id" };
}
