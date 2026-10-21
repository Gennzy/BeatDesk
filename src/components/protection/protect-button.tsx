"use client";

import { useState } from "react";

import { ProtectWizard } from "@/components/protection/protect-wizard";
import { envelopeOfBytes } from "@/lib/audio/download-free";
import { useI18n } from "@/lib/i18n/provider";
import { cn } from "@/lib/cn";

/**
 * Защита бита: кнопка и мастер.
 *
 * ---------------------------------------------------------------------------
 * ПОЧЕМУ ОТПЕЧАТОК СЧИТАЕТСЯ ПО КЛИКУ
 *
 * Чтобы найти бит внутри чужого трепа, нужен эталон: отпечаток нашего
 * мастера. Он считается из того же файла, который лежит в мастерах бита, — в
 * браузере, потому что сервер аудио не расшифровывает.
 *
 * Считать его при открытии страницы нельзя: мастер — это десятки мегабайт,
 * и страница вставала на его загрузке. Теперь файл трогается только тогда,
 * когда человек действительно нажал «Защитить бит».
 */
export function ProtectButton({
  beatId,
  title,
  artists,
  className,
}: {
  beatId: string;
  title: string;
  artists: string[];
  className?: string;
}) {
  const { t } = useI18n();

  const [state, setState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [envelope, setEnvelope] = useState<string | null>(null);

  async function prepare() {
    setState("loading");

    try {
      const response = await fetch(`/api/protection/masters?beatId=${beatId}`);

      if (!response.ok) throw new Error("Файл недоступен");

      const data = (await response.json()) as { url?: string };

      if (!data.url) throw new Error("Файл недоступен");

      // Ссылка временная, и качать файл надо напрямую с хранилища: через
      // прокси это десятки мегабайт через Next.js.
      const file = await fetch(data.url);

      if (!file.ok) throw new Error("Файл недоступен");

      setEnvelope(await envelopeOfBytes(new Uint8Array(await file.arrayBuffer())));
      setState("ready");
    } catch {
      setState("error");
    }
  }

  if (state === "error") {
    return <span className={cn("text-xs text-mute", className)}>{t("protect.noMaster")}</span>;
  }

  if (state === "ready" && envelope) {
    return (
      <ProtectWizard
        beatId={beatId}
        title={title}
        artists={artists}
        envelope={envelope}
        className={className}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => void prepare()}
      disabled={state === "loading"}
      className={cn(
        "h-10 rounded-pill border border-line px-5 text-xs font-semibold tracking-[0.08em] uppercase transition-colors",
        "hover:border-signal/60 hover:text-signal disabled:opacity-50",
        className,
      )}
    >
      {state === "loading" ? t("protect.loading") : t("protect.run")}
    </button>
  );
}
