/**
 * Деньги заказа.
 *
 * Тот же расчёт, что в create_order, на TypeScript: база считает итог
 * при создании заказа, а здесь мы показываем человеку, сколько он
 * заплатит и сколько с этого получит продавец. Если эти два места
 * разойдутся, человек увидит одну сумму, а заплатит другую.
 *
 * Деньги — целые копейки. Число с плавающей точкой здесь означает
 * расхождение на копейку в каждом заказе и невозможность объяснить его
 * покупателю.
 */

export type TierId = "mp3" | "bundle" | "trackout" | "exclusive";

export type Split = {
  /** Сколько платит покупатель, в копейках. */
  priceMinor: number;
  /** Сколько берёт BeatDesk. */
  commissionMinor: number;
  /** Сколько получает продавец. */
  sellerNetMinor: number;
};

/**
 * Комиссия площадки.
 *
 * Здесь и в platform_settings.commission_bps живёт одно число. Расхождение
 * между ними означает, что предпросмотр в интерфейсе и настоящий заказ
 * посчитаны по-разному, поэтому правится вместе с миграцией.
 */
export const COMMISSION_BPS = 2000;

/**
 * Разделение суммы на комиссию и долю продавца.
 *
 * Комиссию округляем вверх, а долю продавца считаем разностью. Округление
 * вниз отдало бы площадке меньше, чем она берёт: заказ на одну копейку при
 * 20% не дал бы комиссии вообще ничего. Вверх — площадка не теряет
 * копейку, а сумма всё равно сходится, потому что доля продавца получена
 * вычитанием, а не умножением.
 */
export function splitPrice(priceRubles: number, commissionBps = COMMISSION_BPS): Split {
  if (!Number.isFinite(priceRubles) || priceRubles < 0) {
    // Отрицательная цена — это ошибка, а не значение: база её и не примет,
    // но предпросмотр показал бы покупателю выплату продавцу.
    throw new RangeError(`Цена не может быть отрицательной: ${priceRubles}`);
  }

  return fromMinor(Math.round(priceRubles * 100), commissionBps);
}

/**
 * Разделение готовой суммы в копейках.
 *
 * Сумма уже целая, поэтому делим целочисленно и округляем комиссию вверх.
 */
export function fromMinor(priceMinor: number, commissionBps = COMMISSION_BPS): Split {
  if (!Number.isInteger(priceMinor) || priceMinor < 0) {
    throw new RangeError(`Сумма в копейках должна быть целым неотрицательным числом: ${priceMinor}`);
  }

  const commissionMinor = Math.ceil((priceMinor * commissionBps) / 10_000);

  return {
    priceMinor,
    commissionMinor,
    // Разность, а не умножение: так сумма сходится копейка в копейку.
    sellerNetMinor: priceMinor - commissionMinor,
  };
}

/** Итог по заказу из нескольких позиций. */
export function totalOf(splits: Split[]): Split {
  return splits.reduce(
    (sum, split) => ({
      priceMinor: sum.priceMinor + split.priceMinor,
      commissionMinor: sum.commissionMinor + split.commissionMinor,
      sellerNetMinor: sum.sellerNetMinor + split.sellerNetMinor,
    }),
    { priceMinor: 0, commissionMinor: 0, sellerNetMinor: 0 },
  );
}
