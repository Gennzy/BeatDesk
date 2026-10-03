"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { emitPlayback } from "@/lib/playback";
import type { PlayerTrack } from "@/lib/player";

/** Один бит считается один раз за сессию, иначе перемотки насчитают десятки. */
const counted = new Set<string>();

type PlayerContextValue = {
  track: PlayerTrack | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  plays: number;
  play: (track: PlayerTrack) => void;
  toggle: () => void;
  seek: (seconds: number) => void;
  close: () => void;
};

const PlayerContext = createContext<PlayerContextValue | null>(null);

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/**
 * Один аудиоэлемент на всё приложение: живёт в layout,
 * поэтому переходы между страницами звук не прерывают.
 */
export function PlayerProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [track, setTrack] = useState<PlayerTrack | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [plays, setPlays] = useState(0);

  const ensureAudio = useCallback(() => {
    if (audioRef.current) return audioRef.current;

    const audio = new Audio();
    audio.preload = "metadata";

    audio.addEventListener("timeupdate", () => {
      setCurrentTime(audio.currentTime);
      emitPlayback({ level: audio.currentTime % 4 < 0.12 ? 0.9 : 0.25, playing: !audio.paused });
    });
    audio.addEventListener("loadedmetadata", () => setDuration(Number.isFinite(audio.duration) ? audio.duration : 0));
    audio.addEventListener("play", () => {
      setIsPlaying(true);
      emitPlayback({ level: 0.6, playing: true });
    });
    audio.addEventListener("pause", () => {
      setIsPlaying(false);
      emitPlayback({ level: 0, playing: false });
    });
    audio.addEventListener("ended", () => {
      setIsPlaying(false);
      setCurrentTime(0);
      emitPlayback({ level: 0, playing: false });
    });

    audioRef.current = audio;
    return audio;
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    return () => {
      audio?.pause();
      if (audio) audio.src = "";
    };
  }, []);

  const play = useCallback(
    (next: PlayerTrack) => {
      const audio = ensureAudio();

      if (track?.id === next.id) {
        if (audio.paused) void audio.play().catch(() => setIsPlaying(false));
        else audio.pause();
        return;
      }

      audio.src = next.audioUrl;
      audio.currentTime = 0;
      setCurrentTime(0);
      setDuration(0);
      setTrack(next);
      setPlays(0);
      void audio.play().catch(() => setIsPlaying(false));
    },
    [ensureAudio, track?.id],
  );

  useEffect(() => {
    if (!track || counted.has(track.id)) return;
    counted.add(track.id);

    void fetch(`/api/beats/${track.id}/play`, { method: "POST" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { plays?: number } | null) => {
        if (typeof data?.plays === "number") setPlays(data.plays);
      })
      .catch(() => counted.delete(track.id));
  }, [track]);

  const toggle = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !track) return;

    if (audio.paused) void audio.play().catch(() => setIsPlaying(false));
    else audio.pause();
  }, [track]);

  const seek = useCallback((seconds: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = Math.max(0, Math.min(seconds, audio.duration || seconds));
  }, []);

  const close = useCallback(() => {
    const audio = audioRef.current;
    audio?.pause();
    if (audio) audio.src = "";
    setTrack(null);
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setPlays(0);
  }, []);

  const value = useMemo(
    () => ({ track, isPlaying, currentTime, duration, plays, play, toggle, seek, close }),
    [track, isPlaying, currentTime, duration, plays, play, toggle, seek, close],
  );

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}

export function usePlayer(): PlayerContextValue {
  const context = useContext(PlayerContext);
  if (!context) {
    throw new Error("usePlayer must be used inside <PlayerProvider>");
  }
  return context;
}

export { formatTime };