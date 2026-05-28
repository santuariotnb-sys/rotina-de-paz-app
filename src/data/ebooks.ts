export type Ebook = {
  id: string;
  title: string;
  subtitle: string;
  category: "bonus" | "colecao" | "embreve";
  price?: string;
  badge?: string;
  cover: string;
};

// Capas placeholder (gradiente CSS) — substituir por imagens reais depois.
export const EBOOKS: Ebook[] = [
  { id: "b1", title: "Diário da Paz",        subtitle: "Guia de oração matinal · 21 dias", category: "bonus",   badge: "Incluso", cover: "linear-gradient(135deg,#D4A5B5 0%,#C9A876 100%)" },
  { id: "b2", title: "Versículos para Ansiedade", subtitle: "60 textos curados",          category: "bonus",   badge: "Incluso", cover: "linear-gradient(135deg,#C4A8BC 0%,#75617F 100%)" },
  { id: "b3", title: "Carta às Mães",        subtitle: "Para mães cansadas em silêncio", category: "bonus",   badge: "Incluso", cover: "linear-gradient(135deg,#E8C9D1 0%,#D4A5B5 100%)" },

  { id: "c1", title: "Soltar a Régua",       subtitle: "Romanos 8:1 — destrava a culpa",  category: "colecao", price: "R$ 19",  cover: "linear-gradient(135deg,#75617F 0%,#443A52 100%)" },
  { id: "c2", title: "O Guarda Pode Descansar", subtitle: "Salmos 121 aplicado ao corpo", category: "colecao", price: "R$ 19",  cover: "linear-gradient(135deg,#C9A876 0%,#443A52 100%)" },
  { id: "c3", title: "Mesmo Que",            subtitle: "A arte de viver o presente",      category: "colecao", price: "R$ 24",  cover: "linear-gradient(135deg,#D4A5B5 0%,#443A52 100%)" },

  { id: "e1", title: "Casamento e Paz",       subtitle: "Em breve",                       category: "embreve", badge: "Em breve", cover: "linear-gradient(135deg,#E8C9D1 0%,#75617F 100%)" },
  { id: "e2", title: "Filhos e Presença",     subtitle: "Em breve",                       category: "embreve", badge: "Em breve", cover: "linear-gradient(135deg,#C4A8BC 0%,#C9A876 100%)" },
];