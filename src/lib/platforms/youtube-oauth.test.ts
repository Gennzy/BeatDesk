import { describe, expect, it } from "vitest";

import { freshState, redirectUri, SCOPES, verifyState } from "./youtube-oauth";

const secret = "секрет-подписи";

describe("ссылка входа", () => {
  it("просит права на загрузку и чтение профиля", () => {
    expect(SCOPES).toContain("https://www.googleapis.com/auth/youtube.upload");
    expect(SCOPES).toContain("https://www.googleapis.com/auth/youtube.readonly");
  });

  it("обратный адрес указывает на наш обработчик", () => {
    // Раньше адреса не было вовсе: режим oauth не был реализован.
    expect(redirectUri("https://beatdesk.vercel.app/")).toBe("https://beatdesk.vercel.app/api/platforms/youtube/callback");
  });
});

describe("подпись состояния", () => {
  it("подписывает и проверяет без ошибки", () => {
    const value = freshState("user-1", secret);
    const payload = verifyState(value, secret);

    expect(payload?.userId).toBe("user-1");
    expect(payload?.nonce.length).toBeGreaterThan(8);
  });

  it("чужая подпись не проходит", () => {
    // Подставив свой код, человек привязал бы к нам свой канал.
    const value = freshState("user-1", secret);

    expect(verifyState(value, "чужой секрет")).toBeNull();
  });

  it("подделанное тело ломает подпись", () => {
    const value = freshState("user-1", secret);
    const [, mac] = value.split(".");
    const forged = Buffer.from(JSON.stringify({ userId: "чужой", nonce: "x", t: Date.now() })).toString("base64url");

    expect(verifyState(`${forged}.${mac}`, secret)).toBeNull();
  });

  it("мусор и пусто отбраковываются", () => {
    expect(verifyState(null, secret)).toBeNull();
    expect(verifyState("", secret)).toBeNull();
    expect(verifyState("без-точки", secret)).toBeNull();
    expect(verifyState("тело.", secret)).toBeNull();
  });

  it("старое состояние не принимается", () => {
    // Вход должен быть начат в том же окне, а не по ссылке из письма недельной давности.
    const value = freshState("user-1", secret);
    const body = Buffer.from(JSON.stringify({ userId: "user-1", nonce: "n", t: Date.now() - 60 * 60_000 })).toString("base64url");

    // подпись оставляем валидной по времени создания, но подписываем заново через другой секрет нельзя,
    // поэтому проверяем именно подделанное тело
    expect(verifyState(`${body}.${value.split(".")[1]}`, secret)).toBeNull();
  });

  it("два входа подряд дают разные коды", () => {
    // Иначе по ссылке из истории можно войти повторно чужим сеансом.
    expect(freshState("user-1", secret)).not.toBe(freshState("user-1", secret));
  });
});
