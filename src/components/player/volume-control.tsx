"use client";

import { usePlayer } from "@/components/player/player-provider";
import { Icon } from "@/components/ui/icon";
import { useI18n } from "@/lib/i18n/provider";
import { cn } from "@/lib/cn";

/**
 * Регулятор громкости.
 *
 * Кнопка отключения и ползунок живут вместе: человек приглушил бит,
 * вернулся через минуту и хочет вернуть ту же громкость одним нажатием,
 * а не искать, где стоял ползунок.
 *
 * На телефоне ползунок спрятан под кнопкой: панель и без него впритык,
 * а на узком экране две ручки рядом не помещаются. Кнопка остаётся —
 * отключить звук можно всегда и одним касанием.
 */
export function VolumeControl({ size = "sm" }: { size?: "sm" | "lg" }) {
  const { t } = useI18n();
  const { volume, muted, setVolume, toggleMute } = usePlayer();

  // Приглушённым считаем и явное отключение, и нулевой ползунок: иначе
  // кнопка показывала бы «звук есть», а звука не было бы.
  const silent = muted || volume === 0;

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={toggleMute}
        aria-pressed={silent}
        aria-label={silent ? t("player.unmute") : t("player.mute")}
        title={silent ? t("player.unmute") : t("player.mute")}
        className={cn(
          "grid shrink-0 place-items-center border transition-colors",
          size === "lg" ? "size-10" : "size-8",
          silent ? "text-signal" : "text-mute hover:border-line-2 hover:text-paper",
        )}
      >
        <Icon name={silent ? "mute" : "volume"} className={size === "lg" ? "size-4" : "size-3.5"} />
      </button>

      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={muted ? 0 : volume}
        onChange={(event) => setVolume(Number(event.target.value))}
        aria-label={t("player.volume")}
        aria-valuetext={silent ? t("player.muted") : `${Math.round(volume * 100)}%`}
        className={cn(
          // Ползунок виден от среднего экрана: на телефоне рядом с ним
          // больше нечего поставить.
          "hidden accent-signal sm:block",
          size === "lg" ? "w-28 cursor-pointer" : "w-20 cursor-pointer",
        )}
      />
    </div>
  );
}