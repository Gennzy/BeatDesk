"use client";

import { useEffect, useRef } from "react";
import { subscribePlayback } from "@/lib/playback";

/** Текущий уровень сигнала без ререндеров: значение живёт в ref. */
export function usePlaybackSignal() {
  const signal = useRef({ level: 0, playing: false });

  useEffect(
    () =>
      subscribePlayback((next) => {
        signal.current = next;
      }),
    [],
  );

  return signal;
}