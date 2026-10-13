"use client";

import { useState } from "react";

import { tierAllows, tierLabel, type FileKind } from "@/lib/sales/delivery";
import { useI18n } from "@/lib/i18n/provider";

type Props = {
  orderId: string;
  itemId: string;
  tier: string;
};

/**
 * Файлы позиции: покупатель забирает то, за что заплатил.
 *
 * Состав файлов приходит из правил уровня, а не из верстки: новый уровень
 * автоматически отдаёт правильный набор, ничего дописывать не нужно.
 */
const KIND_KEYS: Record<FileKind, "download.fileMp3" | "download.fileWav" | "download.fileStems"> = {
  mp3: "download.fileMp3",
  wav: "download.fileWav",
  stems: "download.fileStems",
};

/**
 * Собирает файл из подписанных частей в браузере и отдаёт на скачивание.
 *
 * Мастер лежит в хранилище кусками по 20 МБ, и склеивать его нужно на
 * клиенте: серверу пришлось бы пропускать через себя полгигабайта ради
 * каждой покупки.
 */
async function saveFile(orderId: string, itemId: string, kind: FileKind, missing: string): Promise<void> {
  const response = await fetch(`/api/orders/${orderId}/download?item=${itemId}&kind=${kind}`);

  const data = (await response.json()) as { urls?: string[]; name?: string; error?: string };

  if (!response.ok || !data.urls?.length) throw new Error(data.error ?? missing);

  const chunks: Blob[] = [];

  for (const part of data.urls) {
    const file = await fetch(part);

    if (!file.ok) throw new Error(missing);

    chunks.push(await file.blob());
  }

  const blob = new Blob(chunks);
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = href;
  link.download = data.name ?? "download";
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(href);
}

export function OrderItemDownloads({ orderId, itemId, tier }: Props) {
  const { t } = useI18n();
  const [busy, setBusy] = useState<FileKind | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function download(kind: FileKind) {
    setBusy(kind);
    setError(null);

    try {
      await saveFile(orderId, itemId, kind, t("download.fileMissing"));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("download.fileMissing"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {(["mp3", "wav", "stems"] as FileKind[])
        .filter((kind) => tierAllows(tier, kind))
        .map((kind) => (
          <button
            key={kind}
            type="button"
            disabled={busy !== null}
            onClick={() => void download(kind)}
            className="label h-9 rounded-pill border border-line px-3.5 text-mute transition-colors hover:border-line-2 hover:text-paper disabled:opacity-50"
          >
            {busy === kind ? t("download.fileBusy") : t(KIND_KEYS[kind])}
          </button>
        ))}

      {error ? <span className="label text-amber">{error}</span> : null}

      <span className="sr-only">{tierLabel(tier)}</span>
    </div>
  );
}
