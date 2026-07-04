import { Pause, Play, SkipForward, X, ChevronUp } from "lucide-react";
import { usePlayer } from "./PlayerProvider";

export default function MiniPlayer() {
  const { current, isPlaying, progress, toggle, next, setExpanded, close } = usePlayer();
  if (!current) return null;
  return (
    <div className="fixed inset-x-0 z-30 mx-auto max-w-3xl px-3 sm:bottom-3" style={{ bottom: "calc(5rem + env(safe-area-inset-bottom, 0px))" }}>
      <div
        className="flex items-center gap-3 overflow-hidden rounded-2xl border border-[color:var(--gold-warm)]/25 bg-[#1F1730]/95 px-3 py-2 shadow-[0_16px_36px_-14px_rgba(0,0,0,0.6)] backdrop-blur-xl"
      >
        <button
          onClick={() => setExpanded(true)}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-[#7C5A86] via-[#B06B84] to-[#C9A876] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.25)]">
            <Play className="h-4 w-4 fill-current" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-[15px] text-white">{current.title}</p>
            <p className="truncate text-[12px] text-white/60">
              {current.subtitle} · {current.duration}
            </p>
            <div className="mt-1 h-0.5 w-full overflow-hidden rounded-full bg-white/15">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#E8C9A0] to-[#C9A876]"
                style={{ width: `${progress * 100}%` }}
              />
            </div>
          </div>
          <ChevronUp className="h-4 w-4 shrink-0 text-white/50" />
        </button>
        <button
          onClick={toggle}
          aria-label={isPlaying ? "Pausar" : "Tocar"}
          className="grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br from-[#E8C9A0] to-[#C9A876] text-[#2C1F0B] shadow-[0_6px_16px_-6px_rgba(201,168,118,0.6)] transition active:scale-90"
        >
          {isPlaying ? <Pause className="h-4 w-4 fill-current" /> : <Play className="h-4 w-4 fill-current" />}
        </button>
        <button
          onClick={next}
          aria-label="Próxima"
          className="hidden h-10 w-10 place-items-center rounded-full text-white/70 hover:bg-white/10 sm:grid"
        >
          <SkipForward className="h-4 w-4 fill-current" />
        </button>
        <button
          onClick={close}
          aria-label="Fechar player"
          className="grid h-9 w-9 place-items-center rounded-full text-white/45 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}