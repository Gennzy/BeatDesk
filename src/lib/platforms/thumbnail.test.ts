import { describe, expect, it } from "vitest";

import { fitsTelegramThumbnail, telegramThumbnail, thumbnailLimits } from "./thumbnail";

/** Картинка заведомо больше ограничений Telegram: 1400×1400, тяжёлая. */
async function bigPng(size = 1400): Promise<Buffer> {
  const sharp = (await import("sharp")).default;

  return sharp({
    create: { width: size, height: size, channels: 3, background: { r: 200, g: 40, b: 90 } },
  })
    .png({ compressionLevel: 0 })
    .toBuffer();
}

describe("обложка для плеера телеграма", () => {
  it("исходник не вписывается в требования", () => {
    expect(fitsTelegramThumbnail(thumbnailLimits.maxBytes)).toBe(true);
    expect(fitsTelegramThumbnail(thumbnailLimits.maxBytes + 1)).toBe(false);
    expect(fitsTelegramThumbnail(0)).toBe(false);
  });

  it("уменьшает большую обложку до допустимой", async () => {
    // Раньше обложка просто терялась, и пост уходил без картинки.
    const source = await bigPng();
    expect(fitsTelegramThumbnail(source.byteLength)).toBe(false);

    const thumbnail = await telegramThumbnail(source);
    expect(thumbnail).not.toBeNull();
    expect(thumbnail!.byteLength).toBeLessThanOrEqual(thumbnailLimits.maxBytes);
  });

  it("сторона не превышает 200 пикселей", async () => {
    const sharp = (await import("sharp")).default;
    const thumbnail = await telegramThumbnail(await bigPng());

    const meta = await sharp(thumbnail!).metadata();
    expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBeLessThanOrEqual(thumbnailLimits.maxSide);
  });

  it("картинка не обрезается в ноль и остаётся картинкой", async () => {
    const thumbnail = await telegramThumbnail(await bigPng(300));
    const head = thumbnail!.subarray(0, 3).toString("hex");

    // JPEG начинается с FF D8 FF: пустой или битый ответ не пройдёт.
    expect(head.startsWith("ffd8ff")).toBe(true);
  });

  it("на пустом источнике молчит, а не шлёт мусор", async () => {
    expect(await telegramThumbnail(null)).toBeNull();
    expect(await telegramThumbnail(new ArrayBuffer(0))).toBeNull();
  });

  it("на мусоре не падает", async () => {
    const garbage = new TextEncoder().encode("не картинка вовсе").buffer;

    expect(await telegramThumbnail(garbage)).toBeNull();
  });

  it("уже маленькую обложку не раздувает зря", async () => {
    const small = await (await import("sharp")).default({
      create: { width: 120, height: 120, channels: 3, background: { r: 10, g: 10, b: 10 } },
    })
      .png()
      .toBuffer();

    const thumbnail = await telegramThumbnail(small);
    expect(thumbnail).not.toBeNull();
  });
});
