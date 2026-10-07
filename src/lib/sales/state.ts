/**
 * Состояние бита в продаже.
 *
 * Записи переходов живут в базе — их там выполняет create_order, и делать это
 * в приложении нельзя: два покупателя, открывшие страницу в одну секунду,
 * купили бы один эксклюзив. Здесь нет второй копии переходов, потому что две
 * копии разъезжаются тихо и ловятся уже на деньгах.
 *
 * Здесь только чтение: что битмейкер может сделать с битом, исходя из
 * текущего состояния. Всё, что меняет состояние, спрашивает у базы.
 */

import type { TierId } from "@/lib/audio/delivery-rules";

export type SaleState = "draft" | "on_sale" | "reserved" | "sold_exclusive";

export const SALE_STATES: SaleState[] = ["draft", "on_sale", "reserved", "sold_exclusive"];

/** Что состояние значит для человека. */
export const SALE_STATE_LABELS: Record<SaleState, string> = {
  draft: "Черновик",
  on_sale: "В продаже",
  reserved: "Оплачивается",
  sold_exclusive: "Продан эксклюзивно",
};

/**
 * Бит можно выставить на продажу.
 *
 * Эксклюзив уводит бит навсегда, и вернуть его в продажу нельзя: покупатель
 * заплатил за то, чтобы бита на рынке не было. Поэтому и черновик, и
 * продающийся бит здесь верны, а проданный — нет.
 */
export const canPutOnSale = (state: SaleState): boolean => state === "draft" || state === "on_sale";

/**
 * Бит можно снять с продажи.
 *
 * Придержанный заказ снимать нельзя: покупатель уже платит, и если бит
 * вернётся в черновик, create_order откажет ему в оплате — посреди оплаты.
 */
export const canTakeOffSale = (state: SaleState): boolean => state === "draft" || state === "on_sale";

/**
 * Бит виден в ленте.
 *
 * Придержанный бит виден: он всё ещё продаётся, его просто оплачивает
 * конкретный человек. Проданный эксклюзив из ленты уходит — покупатель
 * заплатил за то, чтобы бит не рекламировали.
 */
export const showsInFeed = (state: SaleState): boolean => state !== "sold_exclusive";

/**
 * Придержание истекло.
 *
 * Её чинит база при любом create_order, но интерфейс тоже должен понимать,
 * что бит висит в «Оплачивается» с прошедшим сроком: показывать бесконечное
 * ожидание хуже, чем сказать, что придержание слетело.
 */
export const isReservationLive = (state: SaleState, reservedUntil: string | null, now = Date.now()): boolean =>
  state === "reserved" && reservedUntil !== null && new Date(reservedUntil).getTime() > now;

/**
 * Какие уровни битмейкер может выставить в этот момент.
 *
 * У проданного эксклюзива не остаётся ничего: бит ушёл из продажи, и цены на
 * нём — историческая справка, а не предложение.
 */
export const sellableTiers = (state: SaleState): TierId[] =>
  canPutOnSale(state) ? ["mp3", "bundle", "trackout", "exclusive"] : [];

/**
 * Что помешает купить этот уровень прямо сейчас.
 *
 * Отличается от того, что обещает уровень: уровень может быть обещан, но
 * недоступен, потому что бит уже оплачивает другой человек.
 */
export type SoldOut = { tier: TierId; reason: "exclusive-sold" | "reserved" };

export function soldOutReason(state: SaleState, tiers: TierId[]): SoldOut[] {
  const sold = tiers;

  if (state === "sold_exclusive") return sold.map((tier) => ({ tier, reason: "exclusive-sold" as const }));
  if (state === "reserved") return sold.map((tier) => ({ tier, reason: "reserved" as const }));

  return [];
}
