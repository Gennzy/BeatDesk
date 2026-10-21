"use client";

import { useState } from "react";

import { envelopeOfBytes } from "@/lib/audio/download-free";
import { align, MATCH_THRESHOLD } from "@/lib/protection/align";
import { useI18n } from "@/lib/i18n/provider";
import { cn } from "@/lib/cn";

/**
 * Мастер защиты: найти, где наш бит играют без лицензии.
 *
 * ---------------------------------------------------------------------------
 * ПОЧЕМУ ЭТО В БРАУЗЕРЕ
 *
 * Отпечаток — это огибающая звука, а сервер аудио не расшифровывает.
 * Браузер умеет: он расшифровывает превью, считает отпечаток и сверяет с
 * битом со смещением, потому что в трепе бит играет не с начала.
 *
 * ---------------------------------------------------------------------------
 * ЧТО ВИДИТ ЧЕЛОВЕК
 *
 * Ничего, кроме «ищу» и «нашёл столько». Все площадки, все ключи и вся
 * возня внутри. Битмейкер купил услугу и ждёт отчёт.
 */
export function ProtectWizard({
  beatId,
  title,
  artists,
  envelope,
  className,
}: {
  beatId: string;
  title: string;
  artists: string[];
  /** Отпечаток мастера: по нему ищем. */
  envelope: string;
  className?: string;
}) {
  const { t } = useI18n();

  const [state, setState] = useState<"idle" | "working" | "done" | "error">("idle");
  const [found, setFound] = useState(0);
  const [message, setMessage] = useState<string | null>(null);

  async function run() {
    setState("working");
    setMessage(null);

    try {
      // 1. Сканирование: сервер заводит запись и отдаёт кандидатов.
      const started = await fetch("/api/protection/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ beatId, envelope }),
      });

      const startData = (await started.json().catch(() => null)) as { id?: string; error?: string } | null;

      if (!started.ok || !startData?.id) {
        throw new Error(startData?.error ?? t("protect.failed"));
      }

      // 2. Кандидаты: их ищет сервер, ключи площадок наши.
      const candidatesResponse = await fetch("/api/protection/candidates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ beatId, title, artists }),
      });

      const candidatesData = (await candidatesResponse.json().catch(() => null)) as
        | { candidates?: { platform: string; externalId: string; title: string; artist: string; previewUrl: string | null; url: string }[]; failed?: string[]; error?: string }
        | null;

      if (!candidatesResponse.ok || !candidatesData?.candidates) {
        throw new Error(candidatesData?.error ?? t("protect.failed"));
      }

      // 3. Сверка: качаем превью через прокси, считаем отпечаток, ищем
      //    бит внутри трепа со смещением.
      const matches: unknown[] = [];

      for (const candidate of candidatesData.candidates) {
        if (!candidate.previewUrl) continue;

        const candidateEnvelope = await fetchEnvelope(candidate.previewUrl);

        if (!candidateEnvelope) continue;

        const result = align(envelope, candidateEnvelope);

        if (result.match * 100 < MATCH_THRESHOLD * 100) continue;

        matches.push({
          platform: candidate.platform,
          externalId: candidate.externalId,
          title: candidate.title,
          artist: candidate.artist,
          url: candidate.url,
          confidence: Math.round(result.match * 100),
          envelope: candidateEnvelope,
        });
      }

      // 4. Отчёт: сервер сам называет подозреваемого по нашему журналу.
      const saved = await fetch(`/api/protection/scan/${startData.id}/results`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matches }),
      });

      if (!saved.ok) {
        throw new Error(t("protect.failed"));
      }

      setFound(matches.length);
      setState("done");
    } catch (cause) {
      setState("error");
      setMessage(cause instanceof Error ? cause.message : t("protect.failed"));
    }
  }

  return (
    <span className={cn("flex flex-col gap-1", className)}>
      <button
        type="button"
        onClick={() => void run()}
        disabled={state === "working"}
        className={cn(
          "h-10 rounded-pill border border-line px-5 text-xs font-semibold tracking-[0.08em] uppercase transition-colors",
          "hover:border-signal/60 hover:text-signal disabled:opacity-50",
        )}
      >
        {state === "working" ? t("protect.working") : t("protect.run")}
      </button>

      {state === "done" ? (
        <span className="text-xs text-signal">{t("protect.found", { count: String(found) })}</span>
      ) : null}

      {message ? <span className="text-xs text-danger">{message}</span> : null}
    </span>
  );
}

/**
 * Отпечаток превью.
 *
 * Превью лежит на CDN площадки, и браузер часто не может забрать его сам:
 * CORS-заголовков там нет. Через наш прокси — всегда.
 */
async function fetchEnvelope(previewUrl: string): Promise<string | null> {
  try {
    const response = await fetch(`/api/protection/preview?url=${encodeURIComponent(previewUrl)}`);

    if (!response.ok) return null;

    const blob = await response.blob();

    return await envelopeOfBytes(new Uint8Array(await blob.arrayBuffer()));
  } catch {
    return null;
  }
}
