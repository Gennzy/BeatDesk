"use client";

import { useState } from "react";

import { useI18n } from "@/lib/i18n/provider";

/**
 * Кнопка «Отправить в Telegram».
 *
 * Нажатие не отправляет бит само — оно просит ссылку у сервера и открывает
 * её. Отправкой занимается бот: у него есть токен и вёрстка карточки, и
 * отправлять отсюда означало бы писать сообщение дважды — здесь и в боте.
 *
 * Окно открывается до ожидания ответа. Открыть окно надо в жесте
 * человека: браузер блокирует всплывающие окна, открытые позже, и вместо
 * перехода в Telegram человек увидел бы пустую вкладку.
 */
export function ShareToTelegram({ beatId, compact }: { beatId: string; compact?: boolean }) {
  const { t } = useI18n();

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function share() {
    setBusy(true);
    setError(null);

    const win = window.open("", "_blank");

    try {
      const response = await fetch(`/api/beats/${beatId}/telegram`, { method: "POST" });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? t("tg.shareFailed"));
        win?.close();
        return;
      }

      const data = (await response.json()) as { url?: string };

      if (!data.url) {
        setError(t("tg.shareFailed"));
        win?.close();
        return;
      }

      if (win) win.location.href = data.url;
      else window.location.href = data.url;
    } catch {
      setError(t("tg.shareFailed"));
      win?.close();
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="flex flex-col gap-1">
      <button
        type="button"
        disabled={busy}
        onClick={() => void share()}
        className={
          compact
            ? "chip chip-hover text-sm disabled:opacity-50"
            : "flex h-10 items-center gap-2 border border-line-2 px-4 text-sm font-semibold text-paper transition-colors hover:border-paper disabled:opacity-50"
        }
      >
        {busy ? t("tg.sharing") : t("tg.share")}
      </button>

      {error ? <span className="text-xs text-amber">{error}</span> : null}
    </span>
  );
}