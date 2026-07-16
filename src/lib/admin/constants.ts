export const ARCHETYPE_COLORS: Record<string, string> = {
  vigilante: "#3B82F6",
  sobrecarga: "#F59E0B",
  culposa: "#8B5CF6",
  antecipatoria: "#EC4899",
};

export const ARCHETYPE_LABELS: Record<string, string> = {
  vigilante: "Vigilante",
  sobrecarga: "Sobrecarga",
  culposa: "Culposa",
  antecipatoria: "Antecipatória",
};

export const SITUATION_LABELS: Record<string, string> = {
  "casada-filhos-pequenos": "Casada, filhos pequenos",
  "casada-filhos-grandes": "Casada, filhos grandes",
  "casada-sem-filhos": "Casada, sem filhos",
  "mae-solo": "Mãe solo",
  solteira: "Solteira",
};

export const DESIRE_LABELS: Record<string, string> = {
  dormir: "Dormir em paz",
  descansar: "Descansar de verdade",
  orar: "Orar sem culpa",
  "parar-pior": "Parar de imaginar o pior",
};

export const PERIODS = [
  { label: "Hoje", days: 0 },
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
  { label: "Tudo", days: 3650 },
] as const;

export type Period = (typeof PERIODS)[number];

export function sinceISO(period: Period): string {
  // Relógio ÚNICO do admin: sempre meia-noite (00:00) em São Paulo, N dias-CALENDÁRIO
  // atrás. Brasil sem horário de verão desde 2019 → offset fixo -03:00 é correto.
  // days=0 → hoje 00:00 SP; days=7 → 7 dias-calendário atrás 00:00 SP; etc.
  // (Antes: days>0 usava Date.now()-N*24h = janela ROLANTE em UTC, desalinhada do
  // calendário → páginas com períodos diferentes nunca batiam. Corrigido.)
  const todaySP = new Date().toLocaleDateString("sv", { timeZone: "America/Sao_Paulo" });
  const since = new Date(todaySP + "T00:00:00-03:00");
  since.setDate(since.getDate() - period.days);
  return since.toISOString();
}
