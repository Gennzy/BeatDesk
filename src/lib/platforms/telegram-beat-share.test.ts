import { createHmac } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createBeatShareLink, readBeatShareLink } from "./telegram-beat-share";

/**
 * Подпись на ссылку «отправить бит в Telegram».
 *
 * Проверяется не вёрстка, а границы: подделка, протухание и смена секрета.
 * Всё это на глаз не увидеть, а цена ошибки — бот присылает то, чего
 * просили не присылать, либо молчит там, где должен был ответить.
 */
describe("ссылка на бит в Telegram", () => {
  const OLD = process.env.PLATFORM_TOKEN_SECRET;

  beforeEach(() => {
    process.env.PLATFORM_TOKEN_SECRET = "секрет-для-тестов";
  });

  afterEach(() => {
    process.env.PLATFORM_TOKEN_SECRET = OLD;
  });

  const beat = { beatId: "beat-1", ownerId: "owner-1" };

  it("подпись читается обратно в те же данные", () => {
    const link = createBeatShareLink(beat);
    expect(link).toBeTruthy();

    const payload = readBeatShareLink(link!);

    expect(payload?.b).toBe("beat-1");
    expect(payload?.o).toBe("owner-1");
  });

  it("подделанный идентификатор не проходит", () => {
    const link = createBeatShareLink(beat)!;
    const [body, mac] = link.split(".");

    // Меняем только содержимое, подпись оставляем прежней.
    const forged = Buffer.from(
      JSON.stringify({ b: "чужой-бит", o: "owner-1", e: Math.floor(Date.now() / 1000) + 600 }),
    ).toString("base64url");

    expect(readBeatShareLink(`${forged}.${mac}`)).toBeNull();
    expect(readBeatShareLink(`${body}.${mac}`)).not.toBeNull();
  });

  it("пробитая подпись не проходит", () => {
    const link = createBeatShareLink(beat)!;
    const [body] = link.split(".");

    expect(readBeatShareLink(`${body}.подделка`)).toBeNull();
    expect(readBeatShareLink(`${body}.`)).toBeNull();
    expect(readBeatShareLink(body)).toBeNull();
  });

  it("протухшая ссылка не проходит", () => {
    const [, mac] = createBeatShareLink(beat)!.split(".");

    // Подписываем «истёкшее» время тем же секретом: проверка должна отклонить
    // не подпись, а именно срок.
    const past = Buffer.from(
      JSON.stringify({ b: "beat-1", o: "owner-1", e: Math.floor(Date.now() / 1000) - 10 }),
    ).toString("base64url");

    const good = createHmac("sha256", "секрет-для-тестов").update(past).digest("base64url");

    expect(readBeatShareLink(`${past}.${good}`)).toBeNull();
    expect(mac).toBeTruthy();
  });

  it("смена серверного секрета делает старые ссылки мёртвыми", () => {
    const link = createBeatShareLink(beat)!;

    process.env.PLATFORM_TOKEN_SECRET = "другой-секрет";

    expect(readBeatShareLink(link)).toBeNull();
  });

  it("без секрета ссылка не выдаётся и не читается", () => {
    /*
     * Именно delete, а не присваивание undefined: Node превращает
     * `env.X = undefined` в строку "undefined", которая истинна, и проверка
     * прошла бы на сервере, где секрет не задан.
     */
    delete process.env.PLATFORM_TOKEN_SECRET;

    expect(createBeatShareLink(beat)).toBeNull();
    expect(readBeatShareLink("что-угодно.подпись")).toBeNull();
  });

  it("бит не проходит в ссылку как есть: подпись защищает содержимое", () => {
    const link = createBeatShareLink({ beatId: "a", ownerId: "b" })!;
    const payload = readBeatShareLink(link)!;

    // Владелец внутри подписи — не просто украшение: вебхук сверяет его с
    // владельцем бита, и без этого подписью можно было бы выпросить чужой.
    expect(payload.o).toBe("b");
  });
});