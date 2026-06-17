import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { Louvor } from "@/data/louvores";

type Ctx = {
  current: Louvor | null;
  queue: Louvor[];
  isPlaying: boolean;
  progress: number;     // 0..1
  duration: number;     // segundos
  expanded: boolean;
  play: (track: Louvor, queue?: Louvor[]) => void;
  toggle: () => void;
  next: () => void;
  prev: () => void;
  seek: (frac: number) => void;
  setExpanded: (v: boolean) => void;
  close: () => void;
};

const PlayerCtx = createContext<Ctx | null>(null);

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [current, setCurrent] = useState<Louvor | null>(null);
  const [queue, setQueue] = useState<Louvor[]>([]);
  const [isPlaying, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [expanded, setExpanded] = useState(false);

  // criar elemento <audio> uma vez
  useEffect(() => {
    const a = new Audio();
    a.preload = "metadata";
    a.crossOrigin = "anonymous";
    audioRef.current = a;

    const onTime = () => {
      if (a.duration) {
        setProgress(a.currentTime / a.duration);
        setDuration(a.duration);
      }
    };
    const onEnd = () => playNextRef.current?.();
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);

    const onError = () => {
      const code = a.error?.code;
      // MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED (4) or network (2)
      if (code === 2) {
        toast.error("Não consegui carregar este louvor. Confira sua conexão.");
      } else if (code === 4) {
        toast.error("Este louvor não está disponível no momento.");
      } else {
        toast.error("Não consegui tocar este louvor. Toque pra tentar de novo.");
      }
      setPlaying(false);
    };

    a.addEventListener("timeupdate", onTime);
    a.addEventListener("loadedmetadata", onTime);
    a.addEventListener("ended", onEnd);
    a.addEventListener("play", onPlay);
    a.addEventListener("pause", onPause);
    a.addEventListener("error", onError);
    return () => {
      a.pause();
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("loadedmetadata", onTime);
      a.removeEventListener("ended", onEnd);
      a.removeEventListener("play", onPlay);
      a.removeEventListener("pause", onPause);
      a.removeEventListener("error", onError);
    };
  }, []);

  // Media Session: controles na tela bloqueada
  useEffect(() => {
    if (!current || !("mediaSession" in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: current.title,
      artist: "Rotina de Paz · Louvores do Reino",
      album: current.subtitle,
    });
    navigator.mediaSession.setActionHandler("play", () => toggleRef.current?.());
    navigator.mediaSession.setActionHandler("pause", () => toggleRef.current?.());
    navigator.mediaSession.setActionHandler("nexttrack", () => playNextRef.current?.());
    navigator.mediaSession.setActionHandler("previoustrack", () => playPrevRef.current?.());
    navigator.mediaSession.setActionHandler("seekto", (d) => {
      const a = audioRef.current;
      if (a && d.seekTime != null) a.currentTime = d.seekTime;
    });
    return () => {
      // Limpa os handlers ao trocar/fechar a faixa (evita handlers stale acumulando).
      if (!("mediaSession" in navigator)) return;
      for (const action of ["play", "pause", "nexttrack", "previoustrack", "seekto"] as const) {
        try { navigator.mediaSession.setActionHandler(action, null); } catch { /* noop */ }
      }
    };
  }, [current]);

  const play = useCallback((track: Louvor, q?: Louvor[]) => {
    const a = audioRef.current;
    if (!a) return;
    if (q) setQueue(q);
    setCurrent(track);
    if (a.src !== track.src) {
      // Troca de faixa: reseta progresso e força reload dos metadados (barra não "salta").
      a.pause();
      a.src = track.src;
      a.currentTime = 0;
      setProgress(0);
      setDuration(0);
      a.load();
    }
    // Guard: src vazio = áudio indisponível no banco
    if (!track.src) {
      toast.error("Áudio indisponível para esta faixa.");
      return;
    }
    a.play().catch((e: DOMException) => {
      if (e.name === "NotAllowedError") {
        toast("Toque no ▶ pra começar a ouvir.", { icon: "🔇" });
      }
      // Outros erros (rede) são tratados pelo listener 'error' no <audio>
    });
  }, []);

  const toggle = useCallback(() => {
    const a = audioRef.current;
    if (!a || !current) return;
    if (a.paused) {
      a.play().catch((e: DOMException) => {
        if (e.name === "NotAllowedError") {
          toast("Toque no ▶ pra começar a ouvir.", { icon: "🔇" });
        }
      });
    } else {
      a.pause();
    }
  }, [current]);

  const next = useCallback(() => {
    if (!current || queue.length === 0) return;
    const i = queue.findIndex((t) => t.id === current.id);
    const nx = queue[(i + 1) % queue.length];
    if (nx) play(nx, queue);
  }, [current, queue, play]);

  const prev = useCallback(() => {
    if (!current || queue.length === 0) return;
    const i = queue.findIndex((t) => t.id === current.id);
    const pv = queue[(i - 1 + queue.length) % queue.length];
    if (pv) play(pv, queue);
  }, [current, queue, play]);

  const seek = useCallback((frac: number) => {
    const a = audioRef.current;
    if (a && a.duration) a.currentTime = a.duration * Math.max(0, Math.min(1, frac));
  }, []);

  const close = useCallback(() => {
    const a = audioRef.current;
    if (a) {
      a.pause();
      a.removeAttribute("src"); // libera o áudio da memória sem recarregar a página
      a.load();
    }
    setCurrent(null);
    setProgress(0);
    setDuration(0);
    setExpanded(false);
  }, []);

  // refs estáveis pra usar dentro dos handlers do MediaSession
  const toggleRef = useRef(toggle); toggleRef.current = toggle;
  const playNextRef = useRef(next); playNextRef.current = next;
  const playPrevRef = useRef(prev); playPrevRef.current = prev;

  return (
    <PlayerCtx.Provider value={{ current, queue, isPlaying, progress, duration, expanded, play, toggle, next, prev, seek, setExpanded, close }}>
      {children}
    </PlayerCtx.Provider>
  );
}

export function usePlayer() {
  const ctx = useContext(PlayerCtx);
  if (!ctx) throw new Error("usePlayer fora do PlayerProvider");
  return ctx;
}