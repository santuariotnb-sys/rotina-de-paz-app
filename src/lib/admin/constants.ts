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
  if (period.days === 0) {
    // Meia-noite de hoje em São Paulo (UTC-3, Brasil sem horário de verão)
    const todaySP = new Date().toLocaleDateString("sv", { timeZone: "America/Sao_Paulo" });
    return todaySP + "T03:00:00.000Z";
  }
  return new Date(Date.now() - period.days * 86400_000).toISOString();
}
