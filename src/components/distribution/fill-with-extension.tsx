"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/provider";

/** ID расширения задаётся сборкой; в разработке остаётся пустым. */
const EXTENSION_ID = process.env.NEXT_PUBLIC_BEATDESK_EXTENSION_ID ?? "";

type Props = {
  /** Площадка: на неё расширение откроет форму. */
  platform: "beatstars" | "beatchain" | "airbit";
  label: string;
  beatId: string;
};

type State = "idle" | "waiting" | "sent" | "missing" | "error";

/**
 * Кнопка «открыть форму и заполнить». Расширение ловит сообщение с
 * сайта и само уходит на страницу площадки.
 *
 * Если расширения нет — говорим об этом прямо. Молчаливый отказ хуже:
 * человек решит, что кнопка сломалась.
 */
export function FillWithExtension({ platform, label, beatId }: Props) {
  const { t } = useI18n();
  const [state, setState] = useState<State>("idle");

  async function send() {
    if (!EXTENSION_ID) {
      setState("missing");
      return;
    }

    setState("waiting");

    try {
      await new Promise<void>((resolve, reject) => {
        const timer = window.setTimeout(() => reject(new Error("timeout")), 1200);
        chrome.runtime.sendMessage(EXTENSION_ID, { type: "beatdesk:open-and-fill", platform, beatId }, () => {
          window.clearTimeout(timer);
          const lastError = chrome.runtime.lastError;
          if (lastError) reject(new Error(lastError.message));
          else resolve();
        });
      });

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
        : null;

  return (
    <div className="flex flex-col gap-2">
      <Button size="sm" variant="signal" disabled={state === "waiting"} onClick={() => void send()}>
        {state === "waiting" ? t("fill.opening") : t("fill.open")}
        <span aria-hidden>→</span>
      </Button>

      {hint ? (
        <p className="text-[11px] text-amber">
          {hint}
          {state === "missing" ? <span className="ml-1 text-mute">{label}</span> : null}
        </p>
      ) : null}
    </div>
  );
}
