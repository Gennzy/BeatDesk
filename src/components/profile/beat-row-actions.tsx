"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Icon } from "@/components/ui/icon";
import { useI18n } from "@/lib/i18n/provider";
import { formatMoney } from "@/lib/currency";
import { normalizePrices } from "@/lib/prices";
import { canPutOnSale, canTakeOffSale, type SaleState } from "@/lib/sales/state";

/**
 * Продажа и цена прямо в строке списка.
 *
 * Отдельная страница правки на восемь полей нужна для обложки, тегов и
 * файлов. Но чтобы поставить цену и выставить бит в продажу, человек
 * уходил на неё — а это отдельный адрес, ради одной галочки. Так и вышло,
 * что бит с готовыми ценами висел в черновике, пока продавец не догадается,
 * где переключатель.
 *
 * Здесь ровно два действия, которые нужны на пути к первой продаже: цена
 * самого дешёвого уровня и состояние продажи. Остальные уровни и оформление
 * остаются на странице правки — дублировать форму целиком значило бы завести
 * два места, которые разъедутся.
 */
export function BeatRowActions({
  beatId,
  saleState,
  isPublic,
  prices,
  currency,
}: {
  beatId: string;
  saleState: SaleState;
  isPublic: boolean;
  prices: Record<string, number | null> | null;
  currency: string;
}) {
  const { t } = useI18n();
  const router = useRouter();

  const current = normalizePrices(prices);
  const [price, setPrice] = useState(current.mp3 === null ? "" : String(current.mp3));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /*
   * Цены уходят в маршрут целиком и заменяются целиком: если прислать одну,
   * остальные уровни потерялись бы молча. Поэтому здесь читается вся строка
   * цен и меняется в ней одно поле.
   */
  async function save(extra: Record<string, string> = {}) {
    setBusy(true);
    setError(null);

    const body = new FormData();
    const trimmed = price.trim();

    if (trimmed !== "") {
      const value = Number(trimmed);

      if (!Number.isFinite(value) || value < 0) {
        setError(t("cabinet.beatsBadPrice"));
        setBusy(false);
        return;
      }

      body.set(
        "prices",
        JSON.stringify({
          mp3: trimmed,
          wav: current.wav ?? "",
          trackout: current.trackout ?? "",
          exclusive: current.exclusive ?? "",
        }),
      );
    }

    for (const [key, value] of Object.entries(extra)) body.set(key, value);

    try {
      const response = await fetch(`/api/beats/${beatId}`, { method: "PATCH", body });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? t("cabinet.beatsSaveFailed"));

        return;
      }

      router.refresh();
    } catch {
      setError(t("cabinet.beatsSaveFailed"));
    } finally {
      setBusy(false);
    }
  }

  const onSale = saleState === "on_sale";
  const movable = canPutOnSale(saleState) || canTakeOffSale(saleState);
  const needsPublic = !isPublic && !onSale;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2">
          <span className="sr-only">{t("upload.priceMp3")}</span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            step={50}
            value={price}
            disabled={busy}
            onChange={(event) => setPrice(event.target.value)}
            onBlur={() => {
              const trimmed = price.trim();
              const next = trimmed === "" ? "" : String(Number(trimmed));

              // Пустое поле — это «убрать цену», а не «сохранить пустое
              // число»: без проверки на blur пустое поле молча превращалось
              // в 0 и бит выглядел бесплатным.
              if (next !== price && (trimmed === "" || Number.isFinite(Number(trimmed)))) {
                void save();
              }
            }}
            className="h-8 w-24 rounded-md border border-line bg-ink-2 px-2 text-sm text-paper tabular-nums outline-none transition-colors focus:border-signal disabled:opacity-40"
            placeholder={t("upload.priceMp3")}
          />
        </label>

        {/*
          Состояние переводится кнопкой, а не переключателем: у бита есть
          ровно одно следующее состояние («в продаже» или «в черновике»), и
          выбирать из двух вариантов, когда один из них очевиден, — лишнее
          действие. При отсутствии публикации кнопка сначала включает её:
          продавать невидимое бессмысленно, а в два клика в два адреса.
        */}
        <button
          type="button"
          disabled={busy || !movable}
          onClick={() =>
            void save(
              onSale
                ? { onSale: "false" }
                : needsPublic
                  ? { onSale: "true", isPublic: "true" }
                  : { onSale: "true" },
            )
          }
          className="label inline-flex h-8 items-center gap-2 rounded-md border border-line px-3 transition-colors enabled:hover:border-signal enabled:hover:text-signal disabled:opacity-40"
        >
          <Icon name={onSale ? "close" : "check"} className="size-3.5" />
          {onSale ? t("cabinet.beatsTakeOffSale") : t("cabinet.beatsPutOnSale")}
        </button>

        {current.mp3 !== null ? (
          <span className="label text-mute tabular-nums">{formatMoney(current.mp3, currency)}</span>
        ) : null}
      </div>

      {error ? <span className="text-xs text-amber">{error}</span> : null}
    </div>
  );
}
