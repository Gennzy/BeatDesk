/**
 * Товары: луп-киты, драм-киты, вокал-пресеты и услуги.
 *
 * ---------------------------------------------------------------------------
 * ЧТО ТАКОЕ ТОВАР
 *
 * Бит — товар особый: у него четыре уровня, у каждого свой состав, своя цена
 * и своя лицензия. Переустраивать это в общую сущность — значит переписать
 * ленту, избранное, счётчики, комментарии и выдачу покупок. Ради китов
 * невыгодно, и киты от битов не зависят.
 *
 * Остальные товары проще и стоят рядом: у комплекта одна цена и один файл,
 * у пресета то же, у услуги файла нет вообще — есть работа.
 *
 * ---------------------------------------------------------------------------
 * ПОЧЕМУ УСЛУГА ТОЖЕ ТОВАР
 *
 * Чтобы её можно было оплатить вместе с битом, показать в истории заказов и
 * не заводить вторую очередь со вторыми статусами. Отдельная «заявка» дала бы
 * выигрыш ровно в одном: «услуга — не файл». Это выражается в самом товаре.
 */

/** Что за товар. */
export type ProductKind = "kit" | "preset" | "service";

export const PRODUCT_KINDS: ProductKind[] = ["kit", "preset", "service"];

/** Файл товара: путь в баке и имя. */
export type ProductFile = {
  path?: string;
  name?: string;
  size?: number;
  mime?: string;
  parts?: { path?: string; size?: number }[];
};

/** Цена в копейках. */
export const MIN_PRICE_MINOR = 100;

export const isProductKind = (value: unknown): value is ProductKind =>
  typeof value === "string" && (PRODUCT_KINDS as string[]).includes(value);

/**
 * Что товар отдаёт покупателю.
 *
 * Услуга не отдаёт ничего: её выдаёт продавец, когда работа сделана. Оплата
 * прошла, а работы ещё нет — и это нормально, а не поломка.
 */
export function deliveredFiles(kind: ProductKind, files: Record<string, ProductFile>): ProductFile[] {
  if (kind === "service") return [];

  return Object.values(files ?? {}).filter(Boolean);
}

/** Есть ли у товара что отдавать. */
export function hasDeliverables(kind: ProductKind, files: Record<string, ProductFile>): boolean {
  return kind === "service" || deliveredFiles(kind, files).length > 0;
}

/**
 * Проверка товара перед сохранением.
 *
 * Текст ошибки — то, что человек прочитает, поэтому он должен называть
 * проблему, а не код.
 */
export function productProblem(input: {
  kind: ProductKind;
  title: string;
  priceMinor: number;
  files: Record<string, ProductFile>;
}): string | null {
  if (!input.title.trim()) return "У товара должно быть название";
  if (input.title.length > 120) return "Название длиннее 120 символов";
  if (!Number.isInteger(input.priceMinor) || input.priceMinor < 0) return "Цена задана неверно";

  if (input.priceMinor > 0 && input.priceMinor < MIN_PRICE_MINOR) {
    // Меньше рубля — это не цена, а опечатка: в копейках один рубль это сто.
    return "Цена меньше одного рубля — проверь, не потерялось ли два нуля";
  }

  if (input.kind !== "service" && deliveredFiles(input.kind, input.files).length === 0) {
    return "К товару нужен файл: без него покупателю нечего отдавать";
  }

  return null;
}

/**
 * Товар в заказе: что именно купили.
 *
 * Уровень у товара не нужен, а у бита — обязателен. Отдельное поле, а не
 * общий уровень: иначе в истории заказов пришлось бы угадывать, к чему
 * относится «mp3».
 */
export type OrderSubject =
  | { kind: "beat"; beatId: string; tier: string }
  | { kind: "product"; productId: string; productKind: ProductKind; title: string };

/** Предмет позиции корзины. */
export function subjectOf(cartItem: {
  beatId: string | null;
  productId: string | null;
  tier: string;
  /** Данные товара: в корзине они приходят вместе с позицией. */
  product?: { kind: ProductKind; title: string } | null;
}): OrderSubject | null {
  if (cartItem.beatId) return { kind: "beat", beatId: cartItem.beatId, tier: cartItem.tier };

  if (cartItem.productId && cartItem.product) {
    return {
      kind: "product",
      productId: cartItem.productId,
      productKind: cartItem.product.kind,
      title: cartItem.product.title,
    };
  }

  return null;
}
