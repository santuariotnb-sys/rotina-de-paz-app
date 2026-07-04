import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { useQuery, type QueryClient } from "@tanstack/react-query";
import { Music, Pause, Play } from "lucide-react";
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

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of all) m.set(l.book, (m.get(l.book) ?? 0) + 1);
    return m;
  }, [all]);

  const firstRef = useRef(true);
  const first = firstRef.current;
  firstRef.current = false;

  return (
    <div className={first ? "" : "rdp-no-anim"}>
      {/* Header editorial (imersivo, plum + ouro) */}
      <section className="rdp-fade-up relative -mx-4 mt-2 overflow-hidden rounded-b-[2rem] bg-[#1A1326] px-6 pb-7 pt-8 sm:mx-0 sm:mt-5 sm:rounded-[2rem] sm:px-8">
        <div className="absolute inset-0 bg-[radial-gradient(90%_70%_at_85%_0%,rgba(201,168,118,0.30),transparent_60%),radial-gradient(80%_60%_at_0%_100%,rgba(212,165,181,0.22),transparent_60%)]" />
        <div className="relative">
          <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-[#E8C9A0] ring-1 ring-white/15">
            <Music className="h-3.5 w-3.5" /> Adoração
          </span>
          <h1 className="mt-3 font-display text-[2.25rem] leading-[1.05] text-white">
            Louvores do Reino
          </h1>
          <p className="mt-1.5 text-[13px] text-white/70">
            Frequências de adoração e cura · {all.length} cânticos
          </p>
          {current && (
            <span className="mt-3 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[12px] text-white/85">
              <Equalizer light /> {isPlaying ? "Tocando agora" : "Pausado"}
            </span>
          )}
        </div>
      </section>

      {/* Filtros */}
      <div className="mt-5 flex flex-wrap gap-2">
        {BOOKS.map((b) => {
          const count = counts.get(b.key) ?? 0;
          const active = b.key === book;
          return (
            <button
              key={b.key}
              onClick={() => setBook(b.key)}
              className={`rdp-chip ${active ? "rdp-chip-active" : ""}`}
            >
              <span>{b.emoji}</span> {b.label}
              <span
                className={`ml-1 rounded-full px-1.5 text-[11px] ${active ? "bg-black/15" : "bg-[color:var(--rose-soft)]/50"}`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      <p className="mt-5 px-1 text-[12px] text-[color:var(--amethyst)]">
        <strong className="text-[color:var(--deep-purple)]">{list.length}</strong> faixas nesta coletânea
      </p>

      <ol className="mt-2 space-y-1.5">
        {isLoading && (
          <li className="rounded-2xl rdp-light-card p-6 text-center text-[13px] text-[color:var(--amethyst)]">
            Carregando louvores…
          </li>
        )}
        {!isLoading && list.length === 0 && (
          <li className="rounded-2xl rdp-light-card p-6 text-center text-[13px] text-[color:var(--amethyst)]">
            Nenhum louvor cadastrado neste livro ainda.
          </li>
        )}
        {list.map((t, i) => {
          const isCurrent = current?.id === t.id;
          const animate = first && i < 12;
          return (
            <li
              key={t.id}
              className={`group flex items-center gap-3 rounded-2xl p-2.5 pr-3 transition ${animate ? "rdp-fade-up" : ""} ${
                isCurrent
                  ? "rdp-light-card border-[color:var(--gold-warm)]/60 shadow-[0_10px_26px_-14px_rgba(201,168,118,0.5)]"
                  : "border border-transparent hover:bg-white/60"
              }`}
              style={
                {
                  ...(animate ? { animationDelay: `${i * 35}ms` } : {}),
                  contentVisibility: "auto",
                  containIntrinsicSize: "0 72px",
                } as React.CSSProperties
              }
            >
              <span className="w-6 shrink-0 text-center font-mono text-[12px] tabular-nums text-[color:var(--amethyst)]/60">
                {isCurrent && isPlaying ? <Equalizer /> : String(i + 1).padStart(2, "0")}
              </span>
              <div className="relative grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-xl bg-gradient-to-br from-[#7C5A86] via-[#B06B84] to-[#C9A876] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.25)]">
                <Music className="h-5 w-5 opacity-90" />
              </div>
              <div className="min-w-0 flex-1">
                <p
                  className={`truncate font-display text-[17px] leading-tight ${isCurrent ? "text-[color:var(--gold-ink)]" : "text-[color:var(--deep-purple)]"}`}
                >
                  {t.title}
                </p>
                <p className="truncate text-[12px] text-[color:var(--amethyst)]">
                  {t.subtitle} · {t.duration}
                </p>
              </div>
              <button
                onClick={() => (isCurrent ? toggle() : play(t, list))}
                aria-label={isCurrent && isPlaying ? "Pausar" : "Tocar"}
                className={`grid h-11 w-11 shrink-0 place-items-center rounded-full transition active:scale-90 ${
                  isCurrent
                    ? "bg-gradient-to-br from-[#E8C9A0] to-[#C9A876] text-[#2C1F0B] shadow-[0_6px_16px_-6px_rgba(201,168,118,0.65)]"
                    : "border border-[color:var(--gold-warm)]/45 text-[color:var(--gold-ink)] group-hover:bg-[color:var(--rose-soft)]/30"
                }`}
              >
                {isCurrent && isPlaying ? (
                  <Pause className="h-4 w-4 fill-current" />
                ) : (
                  <Play className="h-4 w-4 translate-x-[1px] fill-current" />
                )}
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
    <div className="mt-5 animate-pulse">
      <div className="-mx-4 h-40 rounded-b-[2rem] bg-[#1A1326]/90 sm:mx-0 sm:rounded-[2rem]" />
      <div className="mt-5 flex gap-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-8 w-24 rounded-full bg-[color:var(--rose-dust)]/15" />
        ))}
      </div>
      <div className="mt-5 space-y-1.5">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-[68px] rounded-2xl bg-[color:var(--rose-dust)]/10" />
        ))}
      </div>
    </div>
  );
}

function Equalizer({ light }: { light?: boolean }) {
  return (
    <span className="flex h-4 items-end gap-0.5">
      {[0.15, 0, 0.3].map((d, i) => (
        <span
          key={i}
          className={`block w-[3px] rounded-full rdp-eq-bar ${light ? "bg-[#E8C9A0]" : "bg-[color:var(--gold-warm)]"}`}
          style={{ animationDelay: `${d}s`, height: "100%" }}
        />
      ))}
    </span>
  );
}
