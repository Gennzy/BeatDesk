"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { emitPlayback } from "@/lib/playback";
import type { PlayerTrack } from "@/lib/player";

/** Один бит считается один раз за сессию, иначе перемотки насчитают десятки. */
const counted = new Set<string>();

const VOLUME_KEY = "beatdesk:player-volume";

/**
 * Громкость по умолчанию — полная.
 *
 * Раньше регулировки не было, и звук играл на полной. Молча ставить 0.8
 * «как в других плеерах» — значит тише сделать то, о чем человек не
 * просил. Начали с того, что было.
 */
const DEFAULT_VOLUME = 1;

/**
 * Чтение сохранённой громкости.
 *
 * Берётся лениво, при первом обращении: localStorage на сервере нет, и
 * чтение его во время рендера уронило бы страницу целиком, а не плеер.
 *
 * Значение проверяется, а не просто читается: в хранилище может лежать
 * что угодно — оттуда приходят и старые сборки, и чужие правки. Мусор,
 * попавший в громкость, превратился бы в неслышимый бит без объяснений.
 */
function readVolume(): number {
  if (typeof window === "undefined") return DEFAULT_VOLUME;

  try {
    const raw = window.localStorage.getItem(VOLUME_KEY);
    if (raw === null) return DEFAULT_VOLUME;

    const value = Number(raw);
    return Number.isFinite(value) && value >= 0 && value <= 1 ? value : DEFAULT_VOLUME;
  } catch {
    // Приватный режим и заблокированное хранилище: играем на полной.
    return DEFAULT_VOLUME;
  }
}

function writeVolume(value: number): void {
  try {
    window.localStorage.setItem(VOLUME_KEY, value.toFixed(2));
  } catch {
    // Не записалось — переживём, громкость действует до конца сессии.
  }
}

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
  /** Громкость 0..1. Сохраняется между визитами. */
  volume: number;
  muted: boolean;
  setVolume: (value: number) => void;
  toggleMute: () => void;
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
  const [volume, setVolumeState] = useState(DEFAULT_VOLUME);
  const [muted, setMuted] = useState(false);

  /*
   * Громкость подставляется лениво, при первом обращении к аудио, а не во
   * время рендера: localStorage на сервере недоступен, и чтение в рендере
   * сломало бы всю страницу, а не плеер. Побочный эффект тот же, что и у
   * разметки: первый серверный кадр показывает полную громкость, а клиент
   * сразу её уточняет. Плеер появляется по нажатию, и к тому моменту
   * значение уже прочитано.
   */
  const [volumeRestored, setVolumeRestored] = useState(false);

  const ensureAudio = useCallback(() => {
    if (audioRef.current) return audioRef.current;

    const audio = new Audio();
    audio.preload = "metadata";
    audio.volume = readVolume();

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

  /*
   * Сохранённая громкость применяется один раз, когда аудио появилось.
   * Отдельным эффектом, а не прямо в рендере: рендер на сервере не может
   * читать localStorage, а значение из useState инициализируется
   * дефолтом, поэтому без этого шага сохранённый выбор не применился бы
   * никогда.
   */
  // Громкость из localStorage применяется после монтирования: Audio
  // и localStorage на сервере недоступны.
  useEffect(() => {
    if (volumeRestored) return;

    const audio = ensureAudio();
    const saved = readVolume();

    audio.volume = saved;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage доступен только в браузере
    setVolumeState(saved);
    setVolumeRestored(true);
  }, [ensureAudio, volumeRestored]);

  const play = useCallback(
    (next: PlayerTrack) => {
      const audio = ensureAudio();

      if (track?.id === next.id) {
        if (audio.paused) void audio.play().catch(() => setIsPlaying(false));
        else audio.pause();
        return;
      }

      audio.src = next.audioUrl;
      audio.muted = muted;
      audio.currentTime = 0;
      setCurrentTime(0);
      setDuration(0);
      setTrack(next);
      setPlays(0);
      void audio.play().catch(() => setIsPlaying(false));
    },
    [ensureAudio, track?.id, muted],
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

  const setVolume = useCallback((value: number) => {
    const next = Math.max(0, Math.min(1, Number.isFinite(value) ? value : DEFAULT_VOLUME));

    setVolumeState(next);
    writeVolume(next);

    const audio = audioRef.current;
    if (audio) audio.volume = next;

    /*
     * Двигаем ползунок — звук возвращается. Иначе приглушённый плеер
     * выглядит сломанным: человек тянет громкость, а звука нет, и
     * решить, где он включён, негде.
     */
    if (next > 0) setMuted(false);
  }, []);

  const toggleMute = useCallback(() => {
    setMuted((previous) => {
      const next = !previous;

      const audio = audioRef.current;
      // Глушат само свойство muted, а не обнуляют volume: так ползунок
      // остаётся на месте и возвращает звук тем же движением.
      if (audio) audio.muted = next;

      return next;
    });
  }, []);

  const value = useMemo(
    () => ({
      track,
      isPlaying,
      currentTime,
      duration,
      plays,
      play,
      toggle,
      seek,
      close,
      volume,
      muted,
      setVolume,
      toggleMute,
    }),
    [
      track,
      isPlaying,
      currentTime,
      duration,
      plays,
      play,
      toggle,
      seek,
      close,
      volume,
      muted,
      setVolume,
      toggleMute,
    ],
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