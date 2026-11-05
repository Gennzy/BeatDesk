"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/provider";

/**
 * Смарт-ссылка на бит.
 *
 * Короткая ссылка, которую можно кинуть в сторис, био или чат. Ведёт на
 * страницу бита, где уже есть плеер, цены и покупка. Создаётся один раз:
 * повторный клик не плодит новые коды, а показывает существующий.
 */
export function SmartLinkButton({ beatId }: { beatId: string }) {
  const { t } = useI18n();
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/short-links", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ path: `/beats/${beatId}` }),
      });
      const data = (await response.json()) as { url?: string; error?: string };
      if (!response.ok || !data.url) {
        setError(data.error ?? t("smartLink.error"));
        return;
      }
      setUrl(data.url);
    } catch {
      setError(t("smartLink.error"));
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError(t("smartLink.copyError"));
    }
  }

  if (!url) {
    return (
      <Button type="button" size="sm" variant="ink" onClick={() => void create()} disabled={busy}>
        {busy ? t("smartLink.creating") : t("smartLink.create")}
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <input
        readOnly
        value={url}
        className="h-9 min-w-0 flex-1 rounded-control border border-line bg-ink-2 px-3 text-xs text-paper"
      />
      <Button type="button" size="sm" variant="signal" onClick={() => void copy()}>
        {copied ? t("smartLink.copied") : t("smartLink.copy")}
      </Button>
    </div>
  );
}