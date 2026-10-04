"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { useI18n } from "@/lib/i18n/provider";

/** ID расширения задаётся сборкой; в разработке остаётся пустым. */
const EXTENSION_ID = process.env.NEXT_PUBLIC_BEATDESK_EXTENSION_ID ?? "";

type Props = {
  /** Площадка: на неё расширение откроет форму. */
  platform: "beatstars" | "beatchain";
  label: string;
  beatId: string;
};

type State = "idle" | "waiting" | "sent" | "missing" | "error";

type Answer = { ok?: boolean; error?: string };

/**
 * Кнопка «открыть форму и заполнить». Сообщение с сайта ловит service worker
 * расширения: в content script внешние сообщения не приходят в принципе.
 *
 * Если расширения нет — говорим об этом прямо. Молчаливый отказ хуже:
 * человек решит, что кнопка сломалась.
 */
export function FillWithExtension({ platform, label, beatId }: Props) {
  const { t } = useI18n();
  const [state, setState] = useState<State>("idle");
  const [reason, setReason] = useState<string | null>(null);

  // Сайд сам сообщает свой адрес: на локальной сборке расширение не должно
  // стучаться в production за данными бита.
  useEffect(() => {
    if (!EXTENSION_ID || typeof chrome === "undefined" || !chrome.runtime?.sendMessage) return;

    chrome.runtime.sendMessage(EXTENSION_ID, { type: "beatdesk:hello" }, () => void chrome.runtime.lastError);
  }, []);

  async function send() {
    if (!EXTENSION_ID) {
      setState("missing");
      return;
    }

    setState("waiting");
    setReason(null);

    try {
      const answer = await new Promise<Answer>((resolve, reject) => {
        const timer = window.setTimeout(() => reject(new Error("timeout")), 8000);
        chrome.runtime.sendMessage(EXTENSION_ID, { type: "beatdesk:open-and-fill", platform, beatId }, (response) => {
          window.clearTimeout(timer);
          const lastError = chrome.runtime.lastError;
          if (lastError) reject(new Error(lastError.message));
          else resolve((response as Answer) ?? {});
        });
      });

      // Расширение ответило «не вышло». Это не «расширения нет»: иначе человек
      // заново ставил бы уже установленное расширение.
      if (answer?.ok === false) {
        setReason(answer.error ?? null);
        setState("error");
        return;
      }

      setState("sent");
    } catch {
      setState("missing");
    }
  }

  const hint =
    state === "missing"
      ? t("fill.extensionMissing")
      : state === "sent"
        ? t("fill.extensionSent")
        : state === "error"
          ? `${t("fill.failed")}${reason ? `: ${reason}` : ""}`
          : null;

  return (
    <div className="flex flex-col gap-2">
      <Button size="sm" variant="signal" disabled={state === "waiting"} onClick={() => void send()}>
        {state === "waiting" ? t("fill.opening") : t("fill.open")}
        <span aria-hidden>→</span>
      </Button>

      {hint ? (
        <p className={cn("max-w-[42ch] text-[11px]", state === "error" ? "text-amber" : "text-mute")}>
          {hint}
          {state === "missing" ? <span className="ml-1 text-mute">{label}</span> : null}
        </p>
      ) : null}
    </div>
  );
}
