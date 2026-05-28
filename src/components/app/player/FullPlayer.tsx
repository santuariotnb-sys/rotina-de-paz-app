import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, Pause, Play, SkipBack, SkipForward } from "lucide-react";
import { usePlayer } from "./PlayerProvider";

function fmt(s: number) {
  if (!isFinite(s)) return "0:00";
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${r.toString().padStart(2, "0")}`;
}

export default function FullPlayer() {
  const { current, expanded, setExpanded, isPlaying, toggle, next, prev, progress, duration, seek } = usePlayer();
  return (
    <AnimatePresence>
      {expanded && current && (
        <motion.div
          initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
          transition={{ type: "spring", stiffness: 260, damping: 30 }}
          className="fixed inset-0 z-40 flex flex-col rdp-app-bg"
        >
          <header className="flex items-center justify-between px-5 py-4">
            <button onClick={() => setExpanded(false)} className="grid h-10 w-10 place-items-center rounded-full bg-white/70 text-[color:var(--deep-purple)] shadow-sm">
              <ChevronDown className="h-5 w-5" />
            </button>
            <p className="text-[10px] uppercase tracking-[0.28em] text-[color:var(--gold-warm)]">Louvores do Reino</p>
            <div className="w-10" />
          </header>

          <div className="flex flex-1 flex-col items-center justify-center px-8">
            <div className="aspect-square w-full max-w-xs rounded-3xl bg-gradient-to-br from-[#D4A5B5] via-[#C4A8BC] to-[#C9A876] shadow-[0_30px_70px_-20px_rgba(117,97,127,0.55)]" />
            <p className="mt-8 text-center text-[11px] uppercase tracking-[0.28em] text-[color:var(--gold-warm)]">{current.subtitle}</p>
            <h2 className="mt-1 text-center font-display text-3xl text-[color:var(--deep-purple)]">{current.title}</h2>

            <div className="mt-8 w-full max-w-md">
              <input
                type="range" min={0} max={1000} value={Math.round(progress * 1000)}
                onChange={(e) => seek(Number(e.target.value) / 1000)}
                className="w-full accent-[color:var(--gold-warm)]"
              />
              <div className="mt-1 flex justify-between text-[11px] text-[color:var(--amethyst)]">
                <span>{fmt(progress * duration)}</span>
                <span>{fmt(duration)}</span>
              </div>
            </div>

            <div className="mt-6 flex items-center gap-6">
              <button onClick={prev} className="grid h-12 w-12 place-items-center rounded-full bg-white/70 text-[color:var(--deep-purple)] shadow-sm">
                <SkipBack className="h-5 w-5" />
              </button>
              <button onClick={toggle} className="grid h-16 w-16 place-items-center rounded-full bg-gradient-to-br from-[#E8C9A0] to-[#C9A876] text-[#2C1F0B] shadow-[0_10px_30px_-10px_rgba(201,168,118,0.6)]">
                {isPlaying ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6 fill-current" />}
              </button>
              <button onClick={next} className="grid h-12 w-12 place-items-center rounded-full bg-white/70 text-[color:var(--deep-purple)] shadow-sm">
                <SkipForward className="h-5 w-5" />
              </button>
            </div>

            <p className="mt-8 text-center text-[11px] text-[color:var(--amethyst)]/70">🔒 Continue tocando com a tela bloqueada</p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}