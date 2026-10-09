"use client";

import { formatMoney } from "@/lib/currency";
import type { Prices } from "@/lib/prices";
import { useI18n } from "@/lib/i18n/provider";

type Props = {
  /** Цена, которую платит покупатель: в базе это и есть prices. */
  price: number;
  /** Цена до скидки: бит без скидки приходит с null. */
  before: number | null;
  percent: number;
  currency: string;
};

/**
 * Цена со скидкой: новая, зачёркнутая прежняя и подпись «−30%».
 *
 * Отдельный компонент, потому что зачёркивание легко расписать в трёх
 * местах по-разному — и однажды карточка покажет скидку, а страница бита
 * нет. Здесь оно выглядит одинаково везде.
 *
 * Порядок элементов выбран под взгляд, а не под вёрстку: сначала сколько
 * платить, потом от чего отступ, потом почему. Обратный порядок заставил бы
 * покупателя складывать проценты в уме, чтобы понять выгоду.
 */
export function DiscountPrice({ price, before, percent, currency }: Props) {
  const { t } = useI18n();

  if (percent <= 0 || before === null || before <= price) {
    return <span className="font-mono text-base text-paper tabular-nums">{formatMoney(price, currency)}</span>;
  }

  return (
    <span className="flex items-baseline gap-1.5">
      <span className="font-mono text-base text-paper tabular-nums">{formatMoney(price, currency)}</span>
      <span className="font-mono text-xs text-mute line-through tabular-nums">{formatMoney(before, currency)}</span>
      <span className="rounded-full bg-accent/12 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-accent tabular-nums">
        {t("discount.badge", { percent })}
      </span>
    </span>
  );
}

/**
 * Прежняя цена уровня для таблицы тарифов.
 *
 * Отдельная мелочь, но без неё таблица на странице бита молча врала бы:
 * цена со скидкой на месте, а зачёркнутой старой нет.
 */
export function DiscountedTierPrice({
  price,
  before,
  percent,
  currency,
}: Props) {
  return <DiscountPrice price={price} before={before} percent={percent} currency={currency} />;
}

/** Прежняя цена уровня, если она вообще есть. */
export function beforePrice(prices: Prices | null, key: keyof Prices): number | null {
  return prices ? prices[key] : null;
}