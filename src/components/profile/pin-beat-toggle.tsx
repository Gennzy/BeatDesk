"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { useI18n } from "@/lib/i18n/provider";

type Props = {
  beatId: string;
  /** Что сейчас наверху: null — ничего не закреплено. */
  pinnedBeatId: string | null;
};

/**
 * Закрепить бит наверху витрины или снять закрепление.
 *
 * Сделано переключателем, а не двумя кнопками по той же причине, по которой
 * публичность — переключатель: состояние одно («наверху этот бит или
 * нет»), и два элемента управления для одного состояния заставляют
 * человека гадать, какой из них сейчас нажат.
 *
 * Кнопка не показывается, если бит уже наверху и других нет смысла
 * предлагать: повторное нажатие всё равно сняло бы закрепление, но
 * выглядело бы как ошибка — «закрепить» на том, что уже закреплено.
 */
export function PinBeatToggle({ beatId, pinnedBeatId }: Props) {
  const { t } = useI18n();
  const router = useRouter();
  const [pinned, setPinned] = useState(pinnedBeatId === beatId);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    setBusy(true);

    // Оптимистично: закрепление не терпит ощущения задержки, а откат при
    // ошибке честнее, чем кнопка, которая нажата, но ничего не сделала.
    const next = !pinned;
    setPinned(next);

    try {
      const response = next
        ? await fetch("/api/profile/pinned-beat", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ beatId }),
          })
        : await fetch("/api/profile/pinned-beat", { method: "DELETE" });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;

        setPinned(!next);
        window.alert(data?.error ?? t("profile.pinError"));
      } else {
        router.refresh();
      }
    } catch {
      setPinned(!next);
      window.alert(t("profile.pinError"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      aria-pressed={pinned}
      title={t(pinned ? "profile.unpin" : "profile.pin")}
      className={
        pinned
          ? "flex size-8 items-center justify-center rounded-pill border border-accent/40 bg-accent/12 text-accent transition-colors hover:border-accent"
          : "flex size-8 items-center justify-center rounded-pill border border-line text-mute transition-colors hover:border-line-2 hover:text-paper"
      }
    >
      <Icon filled={pinned} />
      <span className="sr-only">{t(pinned ? "profile.unpin" : "profile.pin")}</span>
    </button>
  );
}

/** Значок закрепления: якорь или булавка, одним штрихом по кромке. */
function Icon({ filled }: { filled: boolean }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width="14"
      height="14"
      aria-hidden
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
    >
      <path d="M8 1.5v9" />
      <path d="M4.5 5.5h7" />
      <path d="M8 10.5 6 14h4z" />
    </svg>
  );
}