import { describe, expect, it } from "vitest";

import { clientKey, rateLimit } from "./rate-limit";

/**
 * Ограничитель частоты.
 *
 * Проверяется контракт заголовка Retry-After: секунды, а не миллисекунды,
 * иначе клиенты ждут ноль. Окна по ключам независимы.
 */
describe("rateLimit", () => {
  it("первые попытки проходят", () => {
    expect(rateLimit("test-first", 3, 60_000).ok).toBe(true);
  });

  it("после лимита отказывает и говорит, сколько ждать", () => {
    const key = `test-limit-${Date.now()}`;

    expect(rateLimit(key, 2, 60_000).ok).toBe(true);
    expect(rateLimit(key, 2, 60_000).ok).toBe(true);

    const denied = rateLimit(key, 2, 60_000);
    expect(denied.ok).toBe(false);
    expect(denied.retryAfter).toBeGreaterThan(0);
    expect(denied.retryAfter).toBeLessThanOrEqual(60);
  });

  it("разные ключи не мешают друг другу", () => {
    const suffix = Date.now();
    rateLimit(`test-a-${suffix}`, 1, 60_000);
    rateLimit(`test-a-${suffix}`, 1, 60_000);

    expect(rateLimit(`test-b-${suffix}`, 1, 60_000).ok).toBe(true);
  });

  it("ключ клиента строится от адреса", () => {
    const request = new Request("https://beatdesk.test/api/x", {
      headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" },
    });

    expect(clientKey(request, "scope")).toBe("scope:1.2.3.4");
  });
});
