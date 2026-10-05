"use client";

import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { formatDownbeat, formatTempo } from "@/lib/audio/analyze";
import { transposeTo } from "@/lib/audio/key";
import type { Tempo } from "@/lib/audio/tempo";
import { cn } from "@/lib/cn";
import { useI18n } from "@/lib/i18n/provider";
import { ConfidenceBar, useAudioAnalysis } from "./use-audio-analysis";

/** Куда подгонять чужой трек: это самая частая задача сведения. */
const TARGET_KEYS = ["C minor", "F minor", "G minor", "D minor", "A minor", "C major", "F major", "G major"];

export function StudioWorkbench() {
  const { t } = useI18n();
  const { analyze, reset, state, error, result, fileName } = useAudioAnalysis();

  const [dragging, setDragging] = useState(false);
  const [target, setTarget] = useState("F minor");
  const inputRef = useRef<HTMLInputElement>(null);

  const busy = state === "decoding" || state === "analyzing";

  async function take(file: File | undefined | null) {
    if (!file) return;
    await analyze(file);
  }

  return (
    <div className="flex flex-col gap-8">
      <label
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          void take(event.dataTransfer.files[0]);
        }}
        className={cn(
          "flex cursor-pointer flex-col items-start gap-4 border border-dashed px-6 py-10 transition-colors",
          dragging ? "border-signal bg-ink-2" : "border-line-2 bg-ink-2 hover:border-signal",
        )}
      >
        <span className="label text-paper">{t("studio.dropTitle")}</span>
        <span className="max-w-[52ch] text-sm text-mute">{t("studio.dropHint")}</span>

        <input
          ref={inputRef}
          type="file"
          accept="audio/*"
          className="hidden"
          onChange={(event) => void take(event.target.files?.[0])}
        />

        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="signal" size="sm" disabled={busy} onClick={() => inputRef.current?.click()}>
            {busy ? t("studio.analyzing") : t("studio.choose")}
            <span aria-hidden>→</span>
          </Button>

          {fileName && state !== "idle" ? (
            <span className="mono text-[11px] text-mute">{fileName}</span>
          ) : null}
        </div>

        <span className="label text-mute">{t("studio.localOnly")}</span>
      </label>

      {error ? (
        <p className="border border-amber/40 bg-ink-2 px-4 py-3 text-sm text-amber">
          {error}
          {state === "error" ? (
            <button type="button" onClick={reset} className="label ml-3 underline">
              {t("studio.reset")}
            </button>
          ) : null}
        </p>
      ) : null}

      {state === "decoding" ? <p className="mono text-sm text-mute">{t("studio.decoding")}</p> : null}

      {result ? <Results result={result} target={target} onTarget={setTarget} /> : null}
    </div>
  );
}

function Results({
  result,
  target,
  onTarget,
}: {
  result: NonNullable<ReturnType<typeof useAudioAnalysis>["result"]>;
  target: string;
  onTarget: (value: string) => void;
}) {
  const { t } = useI18n();
  const { tempo, swing, key, duration } = result;

  const shift = key ? transposeTo(target, key.key) : 0;

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Card label={t("studio.tempo")} value={formatTempo(tempo)} note={tempoNote(tempo, t)}>
        <div className="flex flex-col gap-4">
          <Row label={t("studio.downbeat")} value={formatDownbeat(tempo)} />
          <Row
            label={t("studio.swing")}
            value={
              swing.amount
                ? `${Math.round(swing.amount * 100)}% · ${(swing.amountRatio! * 100).toFixed(0)}`
                : t("studio.swingNone")
            }
          />
          <ConfidenceBar value={tempo.confidence} label={t("studio.confidence")} />
        </div>
      </Card>

      <Card
        label={t("studio.key")}
        value={key?.key ?? t("studio.unknown")}
        note={key ? key.short : undefined}
      >
        {key ? (
          <div className="flex flex-col gap-4">
            <ConfidenceBar value={key.confidence} label={t("studio.confidence")} />

            <div className="flex flex-col gap-2">
              <span className="label text-mute">{t("studio.candidates")}</span>
              <ul className="flex flex-col gap-1.5">
                {key.candidates.map((candidate) => (
                  <li key={candidate.key} className="flex items-center gap-3">
                    <span
                      className={cn(
                        "w-28 shrink-0 text-sm",
                        candidate.key === key.key ? "text-paper" : "text-mute",
                      )}
                    >
                      {candidate.key}
                    </span>
                    <span className="mono flex-1 text-[11px] text-mute">
                      {candidate.score.toFixed(2)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="label text-mute">{t("studio.transposeTo")}</span>
              {TARGET_KEYS.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => onTarget(option)}
                  className={cn(
                    "label border px-2 py-1 transition-colors",
                    option === target ? "border-signal bg-signal text-ink" : "border-line text-mute hover:text-paper",
                  )}
                >
                  {option}
                </button>
              ))}
            </div>

            <Row
              label={t("studio.shift")}
              value={
                shift === 0
                  ? t("studio.shiftNone")
                  : shift > 0
                    ? `${t("studio.shiftUp")} ${shift} ${t("studio.semitones")}`
                    : `${t("studio.shiftDown")} ${Math.abs(shift)} ${t("studio.semitones")}`
              }
            />
          </div>
        ) : (
          <p className="text-sm text-mute">{t("studio.keyHint")}</p>
        )}
      </Card>

      <p className="mono col-span-full text-[11px] text-mute">
        {t("studio.duration")}: {duration.toFixed(1)} {t("studio.seconds")} · {t("studio.analyzedLocal")}
      </p>
    </div>
  );
}

/**
 * Подпись под темпом: насколько он круглый.
 *
 * Раньше здесь стояли английские «exact» и «off» прямо из кода — мимо
 * переводов и без смысла для человека. Полезнее само отклонение: 140,1 BPM
 * означает, что в сетку встанет чуть не то.
 */
function tempoNote(tempo: Tempo, t: (key: never) => string): string | undefined {
  if (tempo.bpm <= 0) return undefined;

  if (tempo.exact) return t("studio.exact" as never);

  const deviation = Math.abs(tempo.bpm - Math.round(tempo.bpm)) * 100;
  return `${t("studio.deviation" as never)} ${deviation.toFixed(0)}`;
}

function Card({
  label,
  value,
  note,
  children,
}: {
  label: string;
  value: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-5 border border-line bg-ink-2 p-6">
      <div className="flex items-baseline gap-3 border-b border-line pb-4">
        <span aria-hidden className="size-1.5 bg-signal" />
        <span className="label text-mute">{label}</span>
        {note ? <span className="label ml-auto text-mute">{note}</span> : null}
      </div>

      <p className="font-display text-4xl leading-none text-paper uppercase">{value}</p>

      {children}
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line pb-2">
      <span className="label text-mute">{label}</span>
      <span className="mono text-xs text-paper">{value}</span>
    </div>
  );
}