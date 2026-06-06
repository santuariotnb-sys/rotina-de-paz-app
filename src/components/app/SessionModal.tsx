import { motion } from "framer-motion";
import { Moon, Sun, X, Headphones, ShoppingCart, Lock, Loader2, RefreshCw } from "lucide-react";
import type { PlanSession } from "@/data/plan";

export type SessionAudio = {
  title: string;
  subtitle: string | null;
  audio_url: string | null;
  duration_seconds: number;
};

// Estado do áudio guiado da sessão. Garante que loading/erro NUNCA mostrem "comprar"
// e que um pagante (sem o áudio do dia) veja "em breve", não o CTA de compra.
export type AudioState =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "ready"; audio: SessionAudio }
  | { kind: "comingSoon" }
  | { kind: "locked"; checkoutUrl: string };

export function SessionModal({
  session, dayTheme, done, onClose, onToggle, audioState, onRetry, onAudioEnded,
}: {
  session: PlanSession;
  dayTheme: string;
  done: boolean;
  onClose: () => void;
  onToggle: () => void;
  audioState: AudioState;
  onRetry?: () => void;
  onAudioEnded?: () => void;
}) {
  const isMorning = session.time === "morning";
  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-end justify-center bg-[color:var(--deep-purple)]/30 backdrop-blur-sm sm:items-center"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-t-3xl rdp-light-card sm:rounded-3xl"
        initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative p-6">
          <button onClick={onClose} aria-label="Fechar" className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-full border border-[color:var(--rose-dust)]/40 text-[color:var(--amethyst)] hover:bg-[color:var(--rose-soft)]/30">
            <X className="h-4 w-4" />
          </button>

          <div className="flex items-center gap-3">
            <div className={`grid h-11 w-11 place-items-center rounded-xl border ${
              isMorning
                ? "border-[color:var(--gold-warm)]/50 text-[color:var(--gold-warm)] bg-[color:var(--gold-warm)]/10"
                : "border-[color:var(--lavender)]/60 text-[color:var(--amethyst)] bg-[color:var(--lavender)]/20"
            }`}>
              {isMorning ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.22em] text-[color:var(--gold-warm)]">{dayTheme} · {session.duration} min</p>
              <h3 className="mt-0.5 font-display text-2xl text-[color:var(--deep-purple)]">{session.title}</h3>
            </div>
          </div>
          <p className="mt-3 text-[14px] text-[color:var(--amethyst)] leading-relaxed">{session.focus}</p>

          {audioState.kind === "ready" ? (
            <div className="mt-5 rounded-2xl border border-[color:var(--gold-warm)]/40 bg-white/70 p-4">
              <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-[color:var(--gold-warm)]">
                <Headphones className="h-3.5 w-3.5" /> Áudio guiado · {audioState.audio.title}
              </div>
              <audio
                src={audioState.audio.audio_url ?? undefined}
                controls
                preload="none"
                className="mt-2 w-full"
                onEnded={onAudioEnded}
              />
            </div>
          ) : audioState.kind === "loading" ? (
            <div className="mt-5 flex items-center gap-2 rounded-2xl border border-[color:var(--gold-warm)]/40 bg-white/70 p-4 text-[13px] text-[color:var(--amethyst)]">
              <Loader2 className="h-4 w-4 animate-spin text-[color:var(--gold-warm)]" /> Carregando áudio guiado…
            </div>
          ) : audioState.kind === "error" ? (
            <div className="mt-5 flex items-center justify-between gap-3 rounded-2xl border border-[color:var(--rose-dust)]/40 bg-[color:var(--rose-soft)]/30 p-4">
              <p className="text-[13px] text-[color:var(--deep-purple)]">Não consegui carregar o áudio agora.</p>
              <button
                onClick={onRetry}
                className="inline-flex items-center gap-1.5 rounded-full border border-[color:var(--gold-warm)]/50 bg-white/70 px-3 py-1.5 text-[12px] font-semibold text-[color:var(--gold-warm)] transition active:scale-95 hover:bg-white"
              >
                <RefreshCw className="h-3.5 w-3.5" /> Tentar de novo
              </button>
            </div>
          ) : audioState.kind === "comingSoon" ? (
            <div className="mt-5 flex items-center gap-2 rounded-2xl border border-[color:var(--gold-warm)]/40 bg-white/70 p-4 text-[13px] text-[color:var(--amethyst)]">
              <Headphones className="h-4 w-4 text-[color:var(--gold-warm)]" /> Áudio guiado desta sessão em breve.
            </div>
          ) : audioState.kind === "locked" ? (
            <a
              href={audioState.checkoutUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-5 flex items-center gap-3 rounded-2xl border border-[#3B5BFD]/30 bg-gradient-to-br from-[#3B5BFD]/10 to-[#7C3AED]/10 p-4 transition hover:brightness-110"
            >
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-[#3B5BFD] to-[#7C3AED] text-white">
                <Lock className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] uppercase tracking-[0.22em] text-[#3B5BFD]">Áudio guiado premium</p>
                <p className="mt-0.5 text-[13px] font-semibold text-[color:var(--deep-purple)]">
                  Desbloqueie a versão guiada desta sessão
                </p>
              </div>
              <ShoppingCart className="h-5 w-5 text-[#3B5BFD]" />
            </a>
          ) : null}

          <div className="mt-5 rounded-2xl border border-[color:var(--gold-warm)]/40 bg-white/60 p-4">
            <p className="text-[10px] uppercase tracking-[0.22em] text-[color:var(--gold-warm)]">{session.verse.ref}</p>
            <p className="mt-1 font-display italic leading-relaxed text-[color:var(--deep-purple)]">"{session.verse.text}"</p>
          </div>

          <ol className="mt-5 space-y-3">
            {session.steps.map((s, i) => (
              <li key={i} className="flex gap-3">
                <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full border border-[color:var(--gold-warm)]/40 bg-white/70 text-[11px] font-semibold text-[color:var(--gold-warm)]">{i + 1}</span>
                <p className="text-[14px] leading-relaxed text-[color:var(--deep-purple)]/85">{s}</p>
              </li>
            ))}
          </ol>

          <div className="mt-6 rounded-2xl border border-[color:var(--rose-dust)]/40 bg-[color:var(--rose-soft)]/30 p-4 text-center">
            <p className="text-[10px] uppercase tracking-[0.22em] text-[color:var(--gold-warm)]">Selo</p>
            <p className="mt-1 font-display italic text-[color:var(--deep-purple)]">{session.seal}</p>
          </div>

          <button
            onClick={() => { onToggle(); onClose(); }}
            className={`mt-6 w-full rounded-full px-5 py-3 text-[13px] font-semibold transition ${
              done
                ? "border border-[color:var(--amethyst)]/30 bg-white/50 text-[color:var(--amethyst)] hover:bg-white/80"
                : "bg-gradient-to-br from-[#E8C9A0] to-[#C9A876] text-[#2C1F0B] hover:brightness-110 shadow-[0_8px_24px_-10px_rgba(201,168,118,0.55)]"
            }`}
          >
            {done ? "Desmarcar sessão" : "Marcar como feita ✓"}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}