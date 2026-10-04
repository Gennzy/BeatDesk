/**
 * Валюты, в которых можно выставить цену бита.
 *
 * Суммы хранятся в той валюте, которую выбрал автор, и нигде не
 * пересчитываются: курс меняется, а цена у трека должна оставаться той,
 * которую поставил человек.
 */
export const CURRENCIES = [
  { code: "RUB", symbol: "₽", label: "Рубли" },
  { code: "USD", symbol: "$", label: "Доллары" },
  { code: "EUR", symbol: "€", label: "Евро" },
] as const;

export type CurrencyCode = (typeof CURRENCIES)[number]["code"];

export const DEFAULT_CURRENCY: CurrencyCode = "RUB";

export function isCurrency(value: unknown): value is CurrencyCode {
  return typeof value === "string" && CURRENCIES.some((item) => item.code === value);
}

export function currencySymbol(code: string | null | undefined): string {
  return CURRENCIES.find((item) => item.code === code)?.symbol ?? "₽";
}

/** 1500 → «1 500 ₽». Разделитель разрядов выбираем по валюте. */
export function formatMoney(value: number | null | undefined, code: string | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "";

  const locale = code === "USD" || code === "EUR" ? "en-US" : "ru-RU";
  const symbol = currencySymbol(code);
  const space = code === "RUB" || code === "USD" ? " " : " ";

  return `${new Intl.NumberFormat(locale).format(value)}${space}${symbol}`;
}

/** Короткий вид без символа: для полей ввода и подписей. */
export function formatAmount(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "";
  return new Intl.NumberFormat("ru-RU").format(value);
}
