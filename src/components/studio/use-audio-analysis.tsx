"use client";

import { useCallback, useRef, useState } from "react";

import { analyzeChannels, type Analysis } from "@/lib/audio/analyze";
import { useI18n } from "@/lib/i18n/provider";
import { cn } from "@/lib/cn";

type State = "idle" | "decoding" | "analyzing" | "done" | "error";

const MAX_MB = 100;

/**
 * Разбор файла целиком в браузере.
 *
 * Файл не загружается на сервер: незаконченный бит не должен покидать
 * машину, а «студия» обязана работать без интернета и без оплаты за
 * каждый прогон. Декодирование идёт через Web Audio, разбор — на
 * отдельном кадре, чтобы страница не подвисала.
 */
export function useAudioAnalysis() {
  const { t } = useI18n();

  const [state, setState] = useState<State>("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Analysis | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  const contextRef = useRef<AudioContext | null>(null);

  const reset = useCallback(() => {
    setState("idle");
    setError(null);
    setResult(null);
    setFileName(null);
  }, []);

  const analyze = useCallback(
    async (file: File) => {
      if (file.size > MAX_MB * 1024 * 1024) {
        setError(t("studio.fileTooBig"));
        setState("error");
        return;
      }

      setError(null);
      setFileName(file.name);
      setState("decoding");

      try {
        const context = contextRef.current ?? new AudioContext();
        contextRef.current = context;

        const buffer = await context.decodeAudioData(await file.arrayBuffer());

        // Декодирование кончилось — отдаём кадр браузеру, чтобы он показал
        // состояние до тяжёлого расчёта.
        setState("analyzing");
        await new Promise((resolve) => setTimeout(resolve, 16));

        const channels = Array.from({ length: buffer.numberOfChannels }, (_, index) => buffer.getChannelData(index));

        setResult(analyzeChannels(channels, buffer.sampleRate));
        setState("done");
      } catch {
        // Браузер умеет декодировать не всё, что названо .mp3: битый файл,
        // кодек или просто переименованный текст.
        setError(t("studio.cannotRead"));
        setState("error");
      }
    },
    [t],
  );

  return { analyze, reset, state, error, result, fileName };
}

/** Полоса уверенности: чем ближе к краю, тем честнее выглядит ответ. */
export function ConfidenceBar({ value, label }: { value: number; label: string }) {
  const percent = Math.round(value * 100);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="label text-mute">{label}</span>
        <span className="mono text-xs text-mute">{percent}%</span>
      </div>
      <div className="h-1 w-full bg-ink-3">
        <div
          className={cn("h-full transition-[width] duration-300", percent >= 70 ? "bg-signal" : percent >= 40 ? "bg-amber" : "bg-mute")}
          style={{ width: `${Math.max(2, percent)}%` }}
        />
      </div>
    </div>
  );
}