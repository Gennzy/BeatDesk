"use client";

import { useI18n } from "@/lib/i18n/provider";
import { cn } from "@/lib/cn";

type Props = {
  isPlaying: boolean;
  onToggle: () => void;
  size?: "sm" | "lg";
};

/**
 * Кнопка play/pause.
 *
 * Две одинаковые кнопки в двух режимах плеера разъезжались по размеру и
 * иконке, поэтому вынесены в одно место.
 */
export function PlayPause({ isPlaying, onToggle, size = "sm" }: Props) {
  const { t } = useI18n();
  const large = size === "lg";

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={isPlaying ? t("player.pause") : t("player.play")}
      className={cn(
        "grid shrink-0 place-items-center bg-signal text-ink transition-colors hover:bg-paper",
        large ? "size-16" : "size-11",
      )}
    >
      {isPlaying ? (
        <svg viewBox="0 0 10 12" aria-hidden className={large ? "h-6 w-5 fill-current" : "h-3.5 w-3 fill-current"}>
          <path d="M0 0h3.5v12H0zM6.5 0H10v12H6.5z" />
        </svg>
      ) : (
        <svg viewBox="0 0 10 12" aria-hidden className={large ? "h-6 w-5 fill-current" : "h-3 w-2.5 fill-current"}>
          <path d="M0 0l10 6-10 6z" />
        </svg>
      )}
    </button>
  );
}