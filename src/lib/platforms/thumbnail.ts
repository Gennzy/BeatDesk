import sharp from "sharp";

/**
 * Обложка для плеера телеграма.
 *
 * Telegram принимает картинку плеера не больше 200 КБ и не крупнее
 * 200×200. Обложки битов весят сотни килобайт и бывают 1400×1400, поэтому
 * исходник Telegram отвергает, а пост уходит без картинки — музыкальный
 * трек без обложки в ленте выглядит как ошибка.
 *
 * Поэтому уменьшаем сами и, если не уложились в вес, сжимаем сильнее.
 * Лучше заметно смазанная обложка, чем никакой.
 */

const MAX_SIDE = 200;
const MAX_BYTES = 200 * 1024;

/** Telegram жёстко ограничивает обе величины; превышение молча ломает пост. */
export const thumbnailLimits = { maxSide: MAX_SIDE, maxBytes: MAX_BYTES } as const;

/**
 * Привести картинку к требованиям Telegram.
 *
 * Возвращает null, когда привести не к чему: пустой источник или формат,
 * который не читается. Молчание лучше отправки битой картинки.
 */
export async function telegramThumbnail(source: Buffer | ArrayBuffer | Uint8Array | null | undefined): Promise<Buffer | null> {
  if (!source || source.byteLength === 0) return null;

  try {
    // Сначала впираем в сторону, потом в вес: уменьшение стороны само по
    // себе обычно уводит картинку ниже 200 КБ.
    let candidate = await sharp(source)
      .rotate()
      .resize(MAX_SIDE, MAX_SIDE, { fit: "cover", position: "centre" })
      .jpeg({ quality: 82, progressive: true })
      .toBuffer();

    for (const quality of [70, 55, 40]) {
      if (candidate.byteLength <= MAX_BYTES) break;

      candidate = await sharp(source)
        .rotate()
        .resize(MAX_SIDE, MAX_SIDE, { fit: "cover", position: "centre" })
        .jpeg({ quality, progressive: true })
        .toBuffer();
    }

    return candidate.byteLength <= MAX_BYTES ? candidate : null;
  } catch {
    return null;
  }
}

/** Вписывается ли источник в требования без пережатия. */
export const fitsTelegramThumbnail = (bytes: number) => bytes > 0 && bytes <= MAX_BYTES;
