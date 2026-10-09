/**
 * Цены бита и уровни лицензии.
 *
 * Тип был продублирован в девяти файлах, и добавление нового уровня
 * грозилось забыть про один из них: цена молча пропадала бы то из
 * карточки, то из поста. Поэтому тип живёт здесь один раз.
 *
 * Порядок уровней не произвольный: Track Out — это те же стемы, то есть
 * шаг между WAV и эксклюзивом. Подробности прав — в licensing.ts.
 */

export type PriceKey = "mp3" | "wav" | "trackout" | "exclusive";

export type Prices = Record<PriceKey, number | null>;

export const PRICE_KEYS: PriceKey[] = ["mp3", "wav", "trackout", "exclusive"];

export const emptyPrices = (): Prices => ({ mp3: null, wav: null, trackout: null, exclusive: null });

/**
 * Подпись уровня для интерфейса и постов.
 *
 * `wav` хранится в колонке `bundle` в базе — так он назывался раньше,
 * когда кодировки были только три. Переименование колонки затронуло бы
 * старые биты, поэтому здесь честная приписка: человек видит «MP3 + WAV».
 */
export const priceLabel: Record<PriceKey, string> = {
  mp3: "MP3",
  wav: "MP3 + WAV",
  trackout: "Track Out",
  exclusive: "Эксклюзив",
};

/** Что лежит в покупке — для подсказки в форме. */
export const priceHint: Record<PriceKey, string> = {
  mp3: "Бит + теги",
  wav: "Бит и волна",
  trackout: "Стемы по дорожкам",
  exclusive: "Все файлы, права",
};

/**
 * Привести чужой объект к Prices.
 *
 * Старые биты лежат без `wav` и `trackout`, поэтому отсутствие полей
 * нормально: недостающее — это «не продаётся».
 */
export function normalizePrices(value: unknown): Prices {
  const record = (value ?? {}) as Record<string, unknown>;
  const read = (key: string): number | null => {
    const raw = record[key];
    if (raw === null || raw === undefined || raw === "") return null;

    const parsed = Number(raw);

    return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null;
  };

  return {
    mp3: read("mp3"),
    // bundle — старое имя уровня WAV.
    wav: read("wav") ?? read("bundle"),
    trackout: read("trackout"),
    exclusive: read("exclusive"),
  };
}

/** Цена для базы: уровень WAV ложится в старую колонку bundle. */
export function pricesForDb(prices: Prices): Record<string, number | null> {
  return { mp3: prices.mp3, bundle: prices.wav, trackout: prices.trackout, exclusive: prices.exclusive };
}

/**
 * Привести чужой объект к форме: ключи формы не совпадают с ключами цен.
 */
export function pricesToForm(prices: Prices): Record<string, number | null> {
  return { priceMp3: prices.mp3, priceBundle: prices.wav, priceTrackout: prices.trackout, priceExclusive: prices.exclusive };
}
/**
 * Цена из поля ввода в число или null.
 *
 * Пустое поле — это не ноль и не минус один, это «уровень не продаётся».
 * Если превратить его в ноль, проверка решит, что уровень выставлен, и
 * начнёт требовать файл, который никто покупать не собирается.
 */
export function parsePrice(raw: string | null | undefined): number | null {
  const text = (raw ?? "").trim();
  const value = Number(text);

  return text !== "" && Number.isFinite(value) && value > 0 ? value : null;
}

/**
 * Скидка.
 *
 * Считается здесь, а не в компонентах, по той же причине, что и разбор
 * тегов: одно правило в трёх местах расходится. Применяется к ценам до
 * сохранения — в базе лежит то, что спишется, а прежние цены остаются рядом
 * для зачёркивания.
 */
export const MAX_DISCOUNT = 90;

/** Цены со скидкой. Округление до рубля вниз: скидка не должна быть меньше обещанной. */
export function applyDiscount(prices: Prices, percent: number): Prices {
  const share = (100 - percent) / 100;

  return {
    mp3: prices.mp3 === null ? null : Math.floor(prices.mp3 * share),
    wav: prices.wav === null ? null : Math.floor(prices.wav * share),
    trackout: prices.trackout === null ? null : Math.floor(prices.trackout * share),
    exclusive: prices.exclusive === null ? null : Math.floor(prices.exclusive * share),
  };
}

/** Есть ли что показывать как скидку: нужен хотя бы один проданный уровень. */
export function hasDiscount(prices: Prices, discountPercent: number): boolean {
  return discountPercent > 0 && PRICE_KEYS.some((key) => prices[key] !== null);
}

/** Процент из поля ввода: мусор и выход за пределы отбрасываются к ближайшему. */
export function normalizeDiscount(raw: unknown): number {
  const value = Math.round(Number(raw));

  if (!Number.isFinite(value) || value <= 0) return 0;

  return Math.min(MAX_DISCOUNT, value);
}
