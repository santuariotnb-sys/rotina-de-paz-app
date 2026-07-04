import { Pause, Play, SkipForward, X, ChevronUp } from "lucide-react";
import { usePlayer } from "./PlayerProvider";

export default function MiniPlayer() {
  const { current, isPlaying, progress, toggle, next, setExpanded, close } = usePlayer();
  if (!current) return null;
  return (
    <div className="fixed inset-x-0 z-30 mx-auto max-w-3xl px-3 sm:bottom-3" style={{ bottom: "calc(5rem + env(safe-area-inset-bottom, 0px))" }}>
      <div
        className="flex items-center gap-3 rounded-2xl border border-[color:var(--gold-warm)]/40 bg-white/95 px-3 py-2 shadow-[0_12px_30px_-12px_rgba(117,97,127,0.45)] backdrop-blur"
      >
        <button
          onClick={() => setExpanded(true)}
          className="flex flex-1 items-center gap-3 text-left min-w-0"
        >
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-[#E8C9A0] to-[#C9A876] text-[#2C1F0B]">
            <Play className="h-4 w-4 fill-current" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-sm text-[color:var(--deep-purple)]">{current.title}</p>
            <p className="truncate text-[12px] text-[color:var(--amethyst)]">{current.subtitle} · {current.duration}</p>
            <div className="mt-1 h-0.5 w-full overflow-hidden rounded-full bg-[color:var(--rose-soft)]/50">
              <div className="h-full rounded-full bg-gradient-to-r from-[#D4A5B5] to-[#C9A876]" style={{ width: `${progress * 100}%` }} />
            </div>
          </div>
          <ChevronUp className="h-4 w-4 shrink-0 text-[color:var(--amethyst)]" />
        </button>
        <button onClick={toggle} aria-label={isPlaying ? "Pausar" : "Tocar"} className="grid h-10 w-10 place-items-center rounded-full border border-[color:var(--gold-warm)]/40 text-[color:var(--deep-purple)] hover:bg-[color:var(--rose-soft)]/30">
          {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 fill-current" />}
        </button>
        <button onClick={next} aria-label="Próxima" className="hidden sm:grid h-10 w-10 place-items-center rounded-full border border-[color:var(--rose-dust)]/40 text-[color:var(--amethyst)] hover:bg-[color:var(--rose-soft)]/30">
          <SkipForward className="h-4 w-4" />
        </button>
        <button onClick={close} aria-label="Fechar player" className="grid h-9 w-9 place-items-center rounded-full text-[color:var(--amethyst)]/70 hover:text-[color:var(--deep-purple)]">
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}