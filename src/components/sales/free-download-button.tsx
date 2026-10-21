"use client";

import { useState } from "react";

import { downloadFreeBeat } from "@/lib/audio/download-free";
import { useI18n } from "@/lib/i18n/provider";
import { cn } from "@/lib/cn";

/**
 * Кнопка «Скачать бесплатно».
 *
 * ---------------------------------------------------------------------------
 * ЗАЧЕМ ЭТО НЕ ПРОСТО ССЫЛКА
 *
 * Бесплатное скачивание разрешает битмейкер, и вместе с ним бит встаёт под
 * защиту. Чтобы защита работала, нужно знать, кто брал файл: без этого
 * невозможно сказать «этот треп на площадке слил тот, кто скачал 12 марта».
 *
 * Поэтому скачивание идёт через нас: мы считаем отпечаток выдаваемого файла и
 * записываем, кто его взял. Ссылка была бы проще, но тогда узнать, кто слил,
 * было бы нечем.
 *
 * ---------------------------------------------------------------------------
 * ЧТО ПРОСИТ У ЧЕЛОВЕКА
 *
 * Ничего. Отпечаток считает браузер, файл уходит обычной ссылкой.
 */
export function FreeDownloadButton({
  beatId,
  fileUrl,
  signedIn,
  className,
}: {
  beatId: string;
  /** Прямая ссылка на превью: её человек и получит. */
  fileUrl: string | null;
  signedIn: boolean;
  className?: string;
}) {
  const { t } = useI18n();

  const [state, setState] = useState<"idle" | "busy" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  if (!fileUrl) return null;

  async function download() {
    if (!fileUrl) return;

    setState("busy");
    setError(null);

    try {
      await downloadFreeBeat(beatId, fileUrl);

      setState("idle");
    } catch (cause) {
      setState("error");
      setError(cause instanceof Error ? cause.message : t("download.failed"));
    }
  }

  return (
    <span className="flex flex-col gap-1">
      <button
        type="button"
        onClick={() => void download()}
        disabled={state === "busy" || !signedIn}
        title={signedIn ? undefined : t("download.signInFirst")}
        className={cn(
          "h-10 rounded-pill border border-line px-5 text-xs font-semibold tracking-[0.08em] uppercase transition-colors",
          "hover:border-signal/60 hover:text-signal disabled:opacity-50",
          className,
        )}
      >
        {state === "busy" ? t("download.preparing") : t("download.free")}
      </button>

      {error ? <span className="text-xs text-danger">{error}</span> : null}
    </span>
  );
}
