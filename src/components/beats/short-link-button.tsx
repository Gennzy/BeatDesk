"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/provider";

/**
 * Короткая ссылка на бит.
 *
 * Появляется только у автора: зачем человеку ссылка на чужой бит. Кнопка
 * ничего не показывает, пока ссылка не создана, — иначе на странице каждого
 * бита висела бы пустая плашка.
 */
export function ShortLinkButton({ path }: { path: string }) {
  const { t } = useI18n();
  const [url, setUrl] = useState<string | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [copied, setCopied] = useState(false);

  async function create() {
    setState("loading");

    try {
      const response = await fetch("/api/short-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path }),
      });

      const data = (await response.json()) as { url?: string; error?: string };

      if (!response.ok || !data.url) {
        setState("error");
        return;
      }

      setUrl(data.url);
      setState("idle");
    } catch {
      setState("error");
    }
  }

  async function copy() {
    if (!url) return;

    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setState("error");
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      {url ? (
        <>
          <code className="mono text-xs text-paper">{url}</code>
          <Button type="button" size="sm" variant="ink" onClick={() => void copy()}>
            {copied ? t("shortLink.copied") : t("shortLink.copy")}
          </Button>
        </>
      ) : (
        <Button type="button" size="sm" variant="ghost" disabled={state === "loading"} onClick={() => void create()}>
          {state === "loading" ? t("shortLink.working") : t("shortLink.make")}
        </Button>
      )}

      {state === "error" ? <span className="text-xs text-amber">{t("shortLink.error")}</span> : null}
    </div>
  );
}