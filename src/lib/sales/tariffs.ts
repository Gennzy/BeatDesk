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

import { MAX_ASSET_BYTES } from "@/lib/beats";

export type TariffId = "start" | "pro" | "label";

export type Tariff = {
  id: TariffId;
  label: string;
  /** Цена в рублях в месяц. Ноль — бесплатный. */
  priceMonthly: number;
  /** Комиссия в базисных пунктах: 1000 = 10%, как в оферте и в money.ts. */
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

/*
 * Потолок файла — одна константа на всех, а не число в каждом тарифе.
 *
 * Загрузка проверяет размер по MAX_ASSET_BYTES, и тарифы этого пока не
 * меняют: подписки нет, баке�� один, правило одно. Своё число в тарифе
 * было бы правдой на бумаге и ложью в коде — реализовать проверку по
 * maxFileBytes, дойти до «Лейбла» и упереться в отказ хранилища на
 * файле, который тариф обещал принять.
 *
 * Когда тарифы заработают по-настоящему, здесь появится своё число, и
 * MAX_ASSET_BYTES станет нижней границей для всех: выше потолка хранилища
 * пропустить файл нельзя ни на каком тарифе.
 */
const maxFileBytes = MAX_ASSET_BYTES;

export const TARIFFS: Tariff[] = [
  {
    id: "start",
    label: "Старт",
    priceMonthly: 0,
    // Комиссия одинаковая на всех тарифах и равна боевой: скидка за подписку
    // без юрлица и без выплат была бы просто надбавкой к отсутствующей услуге.
    commissionBps: 1000,
    // Бакет на бесплатном тарифе Supabase — 1 ГБ, и держать в нём файлы
    // битов бессмысленно: два мастера по 500 МБ съедают всё место.
    storageBytes: GB,
    maxFileBytes,
    maxBeatsOnSale: 10,
    autoPayouts: false,
  },
  {
    id: "pro",
    label: "Pro",
    priceMonthly: 990,
    commissionBps: 1000,
    storageBytes: 20 * GB,
    maxFileBytes,
    maxBeatsOnSale: 100,
    autoPayouts: false,
  },
  {
    id: "label",
    label: "Лейбл",
    priceMonthly: 2990,
    commissionBps: 1000,
    storageBytes: 100 * GB,
    maxFileBytes,
    maxBeatsOnSale: 1000,
    autoPayouts: false,
  },
];

export const tariff = (id: TariffId): Tariff => {
  const found = TARIFFS.find((item) => item.id === id);

  if (!found) throw new Error(`Неизвестный тариф: ${id}`);

  return found;
};
