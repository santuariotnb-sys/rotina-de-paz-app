export type Devocional = {
  id: string;
  title: string;
  subtitle: string;
  days: number;
  modules: number;
  badge: string;
  cover: string;
};

export const DEVOCIONAIS: Devocional[] = [
  { id: "d1", title: "A Chave da Gratidão",     subtitle: "7 videoaulas de fé e transformação", days: 7,  modules: 1, badge: "TRANSFORMAÇÃO", cover: "linear-gradient(135deg,#C9A876 0%,#443A52 100%)" },
  { id: "d2", title: "Quebrantamento e Cura",   subtitle: "Devocional guiado em 14 vídeos",     days: 14, modules: 2, badge: "INTIMIDADE",     cover: "linear-gradient(135deg,#D4A5B5 0%,#75617F 100%)" },
  { id: "d3", title: "A Mulher e a Presença",   subtitle: "Estudo profundo para mulheres",      days: 21, modules: 3, badge: "PROPÓSITO",      cover: "linear-gradient(135deg,#E8C9D1 0%,#C9A876 100%)" },
];