// Gera as variaveis do template quiz_resultado por lead — SEM chamar API externa.
// Decisao do dono: nao usar Claude/Anthropic aqui (custo). Copies fixas por arquetipo.
// {{1}} = primeiro nome (capitalizado), {{2}} = frase-eco estatica por arquetipo.

export type ResultVariables = { nome: string; frase_arquetipo: string };

// Frases por arquetipo (tom NeuroFe, 1 linha, sem emoji, <=90 chars, com acentos).
const ARCHETYPE_PHRASES: Record<string, string> = {
  vigilante: "O alarme pode se calar: Deus cuida de você mesmo quando você não vigia.",
  sobrecarga: "Você não precisa carregar tudo sozinha — Ele quer levar o seu peso.",
  culposa: "A culpa não vem de Deus. Ele te olha com ternura, não com cobrança.",
  antecipatoria: "O amanhã já tem dono. Hoje, Deus quer te dar a sua paz.",
};
const DEFAULT_PHRASE = "Você não está sozinha — Deus quer devolver a sua paz.";

function firstName(name: string | null): string {
  const raw = (name ?? "").trim().split(/\s+/)[0] ?? "";
  if (!raw) return "amiga";
  return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
}

// Sincrono (sem API). O cron faz `await` — inofensivo sobre valor nao-Promise.
export function generateResultVariables(lead: {
  name: string | null;
  archetype: string | null;
  desire: string | null;
  situation: string | null;
}): ResultVariables {
  const key = (lead.archetype ?? "").trim().toLowerCase();
  return {
    nome: firstName(lead.name),
    frase_arquetipo: ARCHETYPE_PHRASES[key] ?? DEFAULT_PHRASE,
  };
}
