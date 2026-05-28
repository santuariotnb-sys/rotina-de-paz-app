import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
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

    a.addEventListener("timeupdate", onTime);
    a.addEventListener("loadedmetadata", onTime);
    a.addEventListener("ended", onEnd);
    a.addEventListener("play", onPlay);
    a.addEventListener("pause", onPause);
    return () => {
      a.pause();
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("loadedmetadata", onTime);
      a.removeEventListener("ended", onEnd);
      a.removeEventListener("play", onPlay);
      a.removeEventListener("pause", onPause);
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
  }, [current]);

  const play = useCallback((track: Louvor, q?: Louvor[]) => {
    const a = audioRef.current;
    if (!a) return;
    if (q) setQueue(q);
    setCurrent(track);
    if (a.src !== track.src) a.src = track.src;
    a.play().catch(() => {});
  }, []);

  const toggle = useCallback(() => {
    const a = audioRef.current;
    if (!a || !current) return;
    if (a.paused) a.play().catch(() => {}); else a.pause();
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
    audioRef.current?.pause();
    setCurrent(null);
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