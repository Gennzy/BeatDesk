/**
 * Тарифы.
 *
 * Пока тарифов нет как сущности — подписки, оплаты, лимитов в базе — это
 * план. Написано здесь, а не в миграции, потому что тариф меняется чаще
 * схемы, а миграция после применения не переписывается.
 *
 * Числа ниже — предложение, а не решение. Меняются в этом файле и больше
 * нигде: превседний код читает их отсюда.
 */

export type TariffId = "start" | "pro" | "label";

export type Tariff = {
  id: TariffId;
  label: string;
  /** Цена в рублях в месяц. Ноль — бесплатный. */
  priceMonthly: number;
  /** Комиссия в базисных пунктах: 2000 = 20%. */
  commissionBps: number;
  /** Сколько места на файлы даёт тариф, в байтах. */
  storageBytes: number;
  /** Потолок одного файла, в байтах. */
  maxFileBytes: number;
  /** Сколько битов можно выставить на продажу одновременно. */
  maxBeatsOnSale: number;
  /**
   * Выплаты автоматически.
   *
   * До юрлица это false у всех: Platega принимает платежи, но выплат
   * продавцам не делает. Переключится само, когда появится договор.
   */
  autoPayouts: boolean;
};

const GB = 1024 * 1024 * 1024;
const MB = 1024 * 1024;

export const TARIFFS: Tariff[] = [
  {
    id: "start",
    label: "Старт",
    priceMonthly: 0,
    // Комиссия одинаковая на всех тарифах: скидка за подписку без юрлица
    // и без выплат была бы просто надбавкой к отсутствующей услуге.
    commissionBps: 2000,
    // Бакет на бесплатном тарифе Supabase — 1 ГБ, и держать в нём файлы
    // битов бессмысленно: два мастера по 500 МБ съедают всё место.
    storageBytes: GB,
    maxFileBytes: 500 * MB,
    maxBeatsOnSale: 10,
    autoPayouts: false,
  },
  {
    id: "pro",
    label: "Pro",
    priceMonthly: 990,
    commissionBps: 2000,
    storageBytes: 20 * GB,
    maxFileBytes: GB,
    maxBeatsOnSale: 100,
    autoPayouts: false,
  },
  {
    id: "label",
    label: "Лейбл",
    priceMonthly: 2990,
    commissionBps: 2000,
    storageBytes: 100 * GB,
    maxFileBytes: 2 * GB,
    maxBeatsOnSale: 1000,
    autoPayouts: false,
  },
];

export const tariff = (id: TariffId): Tariff => {
  const found = TARIFFS.find((item) => item.id === id);

  if (!found) throw new Error(`Неизвестный тариф: ${id}`);

  return found;
};
