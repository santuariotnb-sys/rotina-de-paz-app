// Gera as variaveis do template quiz_resultado por lead, via Claude structured output.
// {{1}} = nome (limpo), {{2}} = frase-eco personalizada (1 linha, tom NeuroFe).
// Usa JSON schema puro (nao o helper de Zod) p/ nao depender da versao do zod do repo.
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic(); // le ANTHROPIC_API_KEY

// Padrao da skill claude-api. Alto volume + baixa complexidade -> pode trocar por
// "claude-haiku-4-5" via env para cortar custo. Ambos suportam structured outputs.
const MODEL = process.env.WHATSAPP_COPY_MODEL ?? "claude-opus-4-8";

export type ResultVariables = { nome: string; frase_arquetipo: string };

const SCHEMA = {
  type: "object",
  properties: {
    nome: { type: "string" }, // {{1}} so o primeiro nome, capitalizado
    frase_arquetipo: { type: "string" }, // {{2}} frase-eco por arquetipo/desejo
  },
  required: ["nome", "frase_arquetipo"],
  additionalProperties: false,
} as const;

const SYSTEM = [
  "Voce escreve DUAS variaveis para um template de WhatsApp da Rotina de Paz",
  "(publico: mulheres cristas 45-60, ansiedade, buscam sentir Deus).",
  "nome: apenas o primeiro nome da pessoa, capitalizado (ex 'Ana'). Se nao houver, use 'amiga'.",
  "frase_arquetipo: UMA frase acolhedora e biblica (sem exagero), conectada ao arquetipo/desejo,",
  "em uma unica linha, sem emoji, sem quebra de linha, no maximo ~90 caracteres.",
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
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    thinking: { type: "disabled" }, // tarefa simples; aceito no Opus 4.8
    output_config: {
      effort: "low",
      format: { type: "json_schema", schema: SCHEMA },
    },
    system: SYSTEM,
    messages: [{ role: "user", content: JSON.stringify(lead) }],
  } as Anthropic.MessageCreateParamsNonStreaming);

  const text = res.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") throw new Error("claude_no_text");
  let out: Partial<ResultVariables>;
  try {
    out = JSON.parse(text.text) as Partial<ResultVariables>;
  } catch {
    throw new Error("claude_parse_failed");
  }
  if (!out.nome || !out.frase_arquetipo) throw new Error("claude_missing_fields");
  return { nome: clean(out.nome), frase_arquetipo: clean(out.frase_arquetipo) };
}
