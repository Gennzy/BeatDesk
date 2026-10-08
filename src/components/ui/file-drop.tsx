"use client";

import { useRef, useState, type ChangeEvent, type DragEvent } from "react";

import { cn } from "@/lib/cn";

type FileDropProps = {
  label: string;
  hint?: string;
  prompt?: string;
  accept: string;
  /** короткая подпись формата, например MP3 или JPG · PNG */
  format?: string;
  /** подпись, когда файл уже выбран */
  selected?: File | null;
  error?: string | null;
  onSelect?: (file: File | null) => void;
  inputProps?: {
    id?: string;
    name?: string;
  };
};

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Зона выбора файла. Файл наружу не отдаётся сам: его держит родитель,
 * здесь только отображение состояния и ошибки.
 */
export function FileDrop({ label, hint, prompt, accept, format, selected, error, onSelect, inputProps }: FileDropProps) {
  const [over, setOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function accept_(file: File | null) {
    onSelect?.(file);
  }

  function handleDrop(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    setOver(false);
    accept_(event.dataTransfer.files?.[0] ?? null);
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    accept_(event.target.files?.[0] ?? null);
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-4">
        <span className={cn("label", error ? "text-amber" : "text-paper")}>{label}</span>
        {selected ? (
          <button type="button" onClick={() => accept_(null)} className="label text-mute hover:text-paper">
            ×
          </button>
        ) : null}
      </div>

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(event) => {
          event.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={handleDrop}
        className={cn(
          "flex min-h-24 flex-col items-start justify-center gap-1.5 rounded-xs border border-dashed border-line-2 bg-ink-2 px-5 py-5 text-left transition-colors hover:border-signal/60",
          over && "border-signal bg-signal/5",
          selected && "border-solid border-line-2",
        )}
      >
        {selected ? (
          <>
            <span className="truncate font-display text-sm text-paper uppercase">{selected.name}</span>
            <span className="label text-mute">{formatSize(selected.size)}</span>
          </>
        ) : (
          <>
            <span aria-hidden className="h-px w-8 bg-line-2" />
            <span className="text-sm text-paper">{prompt ?? label}</span>
            <span aria-hidden className="label text-mute">
              {format ?? accept}
            </span>
          </>
        )}
      </button>

      <input ref={inputRef} type="file" accept={accept} className="sr-only" onChange={handleChange} {...inputProps} />

      {error ? (
        <p className="label text-amber">{error}</p>
      ) : hint ? (
        <p className="text-xs leading-relaxed text-mute">{hint}</p>
      ) : null}
    </div>
  );
}