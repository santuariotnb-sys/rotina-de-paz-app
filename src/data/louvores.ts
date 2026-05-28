// Catálogo de Louvores do Reino — dados mock com áudios placeholder.
// Quando subir áudios reais pro Storage, basta trocar `src`.
export type Louvor = {
  id: string;
  book: BookKey;
  index: number;
  title: string;
  subtitle: string;
  duration: string;
  src: string;
  isBonus?: boolean;
};

export type BookKey = "salmos" | "proverbios" | "tessalonicenses" | "colossenses";

export const BOOKS: { key: BookKey; label: string; emoji: string }[] = [
  { key: "salmos",          label: "Salmos",            emoji: "🎵" },
  { key: "proverbios",      label: "Provérbios",        emoji: "🎼" },
  { key: "tessalonicenses", label: "1 Tessalonicenses", emoji: "📜" },
  { key: "colossenses",     label: "Colossenses",       emoji: "✝︎" },
];

// Áudio placeholder (Apple sample, livre) — substituir depois.
const SAMPLE = "https://cdn.pixabay.com/download/audio/2022/03/15/audio_c8c8a73467.mp3?filename=ambient-piano-amp-strings-10711.mp3";

export const LOUVORES: Louvor[] = [
  { id: "s1",  book: "salmos", index: 1,  title: "Salmos 1",  subtitle: "Espaço TNB", duration: "4:00", src: SAMPLE, isBonus: true },
  { id: "s2",  book: "salmos", index: 2,  title: "Salmos 2 — Ele Reina", subtitle: "Espaço TNB", duration: "4:12", src: SAMPLE },
  { id: "s3",  book: "salmos", index: 3,  title: "Salmos 3",  subtitle: "Espaço TNB", duration: "3:48", src: SAMPLE },
  { id: "s4",  book: "salmos", index: 4,  title: "Salmos 4 — Em Paz Me Deito", subtitle: "Espaço TNB", duration: "4:05", src: SAMPLE },
  { id: "s5",  book: "salmos", index: 5,  title: "Salmos 5",  subtitle: "Espaço TNB", duration: "4:21", src: SAMPLE },
  { id: "s6",  book: "salmos", index: 6,  title: "Salmos 6",  subtitle: "Espaço TNB", duration: "3:55", src: SAMPLE },
  { id: "s23", book: "salmos", index: 23, title: "Salmos 23 — O Senhor é Meu Pastor", subtitle: "Espaço TNB", duration: "5:10", src: SAMPLE },

  { id: "p1",  book: "proverbios", index: 3,  title: "Provérbios 3 — Confia no Senhor", subtitle: "Espaço TNB", duration: "4:30", src: SAMPLE },
  { id: "p2",  book: "proverbios", index: 31, title: "Provérbios 31 — Mulher Virtuosa", subtitle: "Espaço TNB", duration: "5:02", src: SAMPLE },

  { id: "t1",  book: "tessalonicenses", index: 5, title: "1 Tess 5 — Orai Sem Cessar", subtitle: "Espaço TNB", duration: "4:18", src: SAMPLE },

  { id: "c1",  book: "colossenses", index: 3, title: "Colossenses 3 — Buscai as Coisas do Alto", subtitle: "Espaço TNB", duration: "4:44", src: SAMPLE },
];