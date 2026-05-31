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