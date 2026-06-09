import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { useQuery, type QueryClient } from "@tanstack/react-query";
import { Music, Pause, Play, Sparkles } from "lucide-react";
import { BOOKS, type BookKey } from "@/data/louvores";
import { usePlayer } from "@/components/app/player/PlayerProvider";
import { louvoresQueryOptions } from "@/lib/app-queries";

export const Route = createFileRoute("/app/louvores")({
  // Pré-carrega as faixas no intent/navegação → lista aparece sem "Carregando…".
  loader: ({ context }) => {
    const qc = (context as { queryClient: QueryClient }).queryClient;
    void qc.ensureQueryData(louvoresQueryOptions);
  },
  component: LouvoresPage,
  pendingComponent: LouvoresSkeleton,
});

function LouvoresPage() {
  const [book, setBook] = useState<BookKey>("salmos");
  const { current, isPlaying, play, toggle } = usePlayer();

  const { data: all = [], isLoading } = useQuery(louvoresQueryOptions);

  const list = useMemo(() => all.filter((l) => l.book === book), [all, book]);

  const firstRef = useRef(true);
  const first = firstRef.current;
  firstRef.current = false;

  return (
    <div className={first ? "" : "rdp-no-anim"}>
      <div className="mt-6 text-center rdp-fade-up">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl border border-[color:var(--gold-warm)]/40 bg-white/70 text-[color:var(--gold-warm)]">
          <Music className="h-6 w-6" />
        </div>
        <p className="mt-3 text-[10px] uppercase tracking-[0.28em] text-[color:var(--gold-warm)]">Adoração Profunda</p>
        <h1 className="mt-1 font-display text-4xl rdp-title-gradient">Louvores do Reino</h1>
        <p className="mt-2 text-[13px] text-[color:var(--amethyst)]">Faixas sagradas · Frequências de adoração e cura</p>
      </div>

      {/* Filtros */}
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        {BOOKS.map((b) => {
          const count = all.filter((l) => l.book === b.key).length;
          const active = b.key === book;
          return (
            <button key={b.key} onClick={() => setBook(b.key)} className={`rdp-chip ${active ? "rdp-chip-active" : ""}`}>
              <span>{b.emoji}</span> {b.label} <span className={`ml-1 rounded-full px-1.5 text-[10px] ${active ? "bg-black/15" : "bg-[color:var(--rose-soft)]/40"}`}>{count}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-6 flex items-center justify-between text-[12px] text-[color:var(--amethyst)]">
        <span><strong className="text-[color:var(--deep-purple)]">{list.length}</strong> faixas <Sparkles className="inline h-3 w-3 text-[color:var(--gold-warm)]" /> Bônus</span>
        {current && <span className="text-[color:var(--gold-warm)]">● Tocando</span>}
      </div>

      <ol className="mt-3 space-y-2">
        {isLoading && (
          <li className="rounded-2xl border border-[color:var(--rose-dust)]/25 bg-white/70 p-6 text-center text-[12px] text-[color:var(--amethyst)]">Carregando louvores…</li>
        )}
        {!isLoading && list.length === 0 && (
          <li className="rounded-2xl border border-[color:var(--rose-dust)]/25 bg-white/70 p-6 text-center text-[12px] text-[color:var(--amethyst)]">Nenhum louvor cadastrado neste livro ainda.</li>
        )}
        {list.map((t, i) => {
          const isCurrent = current?.id === t.id;
          return (
            <li key={t.id}
              className={`flex items-center gap-3 rounded-2xl border p-3 transition rdp-fade-up ${
                isCurrent
                  ? "border-[color:var(--gold-warm)]/60 bg-gradient-to-r from-white to-[color:var(--rose-soft)]/30 shadow-[0_8px_20px_-12px_rgba(201,168,118,0.4)]"
                  : "border-[color:var(--rose-dust)]/25 bg-white/70 hover:border-[color:var(--gold-warm)]/40"
              }`}
              style={{ animationDelay: `${i * 35}ms` }}
            >
              <span className="grid h-10 w-10 shrink-0 place-items-center font-mono text-[12px] text-[color:var(--amethyst)]/70">
                {isCurrent && isPlaying ? <Equalizer /> : String(i + 1).padStart(2, "0")}
              </span>
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-[#D4A5B5] to-[#C9A876] text-white">
                <Music className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-display text-base text-[color:var(--deep-purple)]">{t.title}</p>
                <p className="truncate text-[11px] text-[color:var(--amethyst)]">{t.subtitle} · {t.duration}</p>
              </div>
              <button
                onClick={() => isCurrent ? toggle() : play(t, list)}
                aria-label="Tocar"
                className={`grid h-10 w-10 place-items-center rounded-full transition ${
                  isCurrent
                    ? "bg-gradient-to-br from-[#E8C9A0] to-[#C9A876] text-[#2C1F0B] shadow-[0_6px_14px_-6px_rgba(201,168,118,0.6)]"
                    : "border border-[color:var(--gold-warm)]/40 text-[color:var(--gold-warm)] hover:bg-[color:var(--rose-soft)]/30"
                }`}
              >
                {isCurrent && isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 fill-current" />}
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function LouvoresSkeleton() {
  return (
    <div className="mt-6 animate-pulse">
      <div className="mx-auto h-14 w-14 rounded-2xl bg-[color:var(--rose-dust)]/15" />
      <div className="mx-auto mt-3 h-9 w-48 rounded-lg bg-[color:var(--rose-dust)]/15" />
      <div className="mt-6 flex justify-center gap-2">
        {[0, 1, 2].map((i) => <div key={i} className="h-8 w-20 rounded-full bg-[color:var(--rose-dust)]/15" />)}
      </div>
      <div className="mt-6 space-y-2">
        {[0, 1, 2, 3, 4].map((i) => <div key={i} className="h-[68px] rounded-2xl bg-[color:var(--rose-dust)]/10" />)}
      </div>
    </div>
  );
}

function Equalizer() {
  return (
    <span className="flex items-end gap-0.5 h-4">
      {[0.15, 0, 0.3].map((d, i) => (
        <span key={i} className="block w-[3px] bg-[color:var(--gold-warm)] rounded-full rdp-eq-bar" style={{ animationDelay: `${d}s`, height: "100%" }} />
      ))}
    </span>
  );
}