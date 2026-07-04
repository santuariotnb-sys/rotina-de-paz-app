import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, Pause, Play, SkipBack, SkipForward, Music } from "lucide-react";
import { usePlayer } from "./PlayerProvider";

function fmt(s: number) {
  if (!isFinite(s)) return "0:00";
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${r.toString().padStart(2, "0")}`;
}

export default function FullPlayer() {
  const { current, expanded, setExpanded, isPlaying, toggle, next, prev, progress, duration, seek } =
    usePlayer();
  return (
    <AnimatePresence>
      {expanded && current && (
        <motion.div
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={{ type: "spring", stiffness: 260, damping: 30 }}
          className="fixed inset-0 z-40 flex flex-col bg-[#171021]"
        >
          {/* atmosfera */}
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(80%_50%_at_50%_0%,rgba(201,168,118,0.22),transparent_60%),radial-gradient(90%_60%_at_50%_100%,rgba(176,107,132,0.20),transparent_65%)]" />

          <div className="relative flex h-full flex-col">
            <header
              className="flex items-center justify-between px-5 py-4"
              style={{ paddingTop: "calc(1rem + env(safe-area-inset-top, 0px))" }}
            >
              <button
                onClick={() => setExpanded(false)}
                aria-label="Minimizar player"
                className="grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white ring-1 ring-white/15 backdrop-blur transition active:scale-90"
              >
                <ChevronDown className="h-5 w-5" />
              </button>
              <p className="text-[11px] uppercase tracking-[0.28em] text-[#E8C9A0]">
                Louvores do Reino
              </p>
              <div className="w-10" />
            </header>

            <div className="flex flex-1 flex-col items-center justify-center px-8 pb-10">
              <div className="relative aspect-square w-full max-w-[300px]">
                <div className="absolute -inset-6 rounded-full bg-[radial-gradient(circle,rgba(201,168,118,0.28),transparent_70%)] blur-xl" />
                <div className="relative grid h-full w-full place-items-center overflow-hidden rounded-[2rem] bg-gradient-to-br from-[#7C5A86] via-[#B06B84] to-[#C9A876] shadow-[0_40px_90px_-30px_rgba(0,0,0,0.7)] ring-1 ring-white/15">
                  <Music className="h-16 w-16 text-white/85" />
                </div>
              </div>

              <p className="mt-9 text-center text-[11px] uppercase tracking-[0.28em] text-[#E8C9A0]">
                {current.subtitle}
              </p>
              <h2 className="mt-1.5 text-balance text-center font-display text-[2rem] leading-tight text-white">
                {current.title}
              </h2>

              <div className="mt-8 w-full max-w-md">
                <input
                  type="range"
                  min={0}
                  max={1000}
                  value={Math.round(progress * 1000)}
                  onChange={(e) => seek(Number(e.target.value) / 1000)}
                  aria-label="Progresso"
                  className="w-full accent-[#E8C9A0]"
                />
                <div className="mt-1 flex justify-between text-[12px] tabular-nums text-white/60">
                  <span>{fmt(progress * duration)}</span>
                  <span>{fmt(duration)}</span>
                </div>
              </div>

              <div className="mt-7 flex items-center gap-7">
                <button
                  onClick={prev}
                  aria-label="Anterior"
                  className="grid h-12 w-12 place-items-center rounded-full bg-white/10 text-white ring-1 ring-white/15 transition active:scale-90"
                >
                  <SkipBack className="h-5 w-5 fill-current" />
                </button>
                <button
                  onClick={toggle}
                  aria-label={isPlaying ? "Pausar" : "Tocar"}
                  className="grid h-[74px] w-[74px] place-items-center rounded-full bg-gradient-to-br from-[#F0D9AE] to-[#C9A876] text-[#2C1F0B] shadow-[0_16px_40px_-12px_rgba(201,168,118,0.7)] transition active:scale-95"
                >
                  {isPlaying ? (
                    <Pause className="h-7 w-7 fill-current" />
                  ) : (
                    <Play className="h-7 w-7 translate-x-[2px] fill-current" />
                  )}
                </button>
                <button
                  onClick={next}
                  aria-label="Próxima"
                  className="grid h-12 w-12 place-items-center rounded-full bg-white/10 text-white ring-1 ring-white/15 transition active:scale-90"
                >
                  <SkipForward className="h-5 w-5 fill-current" />
                </button>
              </div>

              <p className="mt-9 text-center text-[12px] text-white/45">
                🔒 Continue tocando com a tela bloqueada
              </p>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
