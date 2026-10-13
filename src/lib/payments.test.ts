import { afterEach, describe, expect, it, vi } from "vitest";

import { platformPayment } from "./payments";

/**
 * Реквизиты площадки.
 *
 * Проверяется правило «нет переменной — нет реквизитов»: страница заказа
 * ведёт через поддержку, а не показывает пустую строку.
 */
describe("platformPayment", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("без переменной счёта отдаёт только поддержку", () => {
    vi.stubEnv("PLATFORM_ACCOUNT_DETAILS", "");
    vi.stubEnv("SUPPORT_EMAIL", "help@beatdesk.ru");

    expect(platformPayment()).toEqual({ supportEmail: "help@beatdesk.ru", account: null });
  });

  it("пробелы вокруг реквизитов не попадают наружу", () => {
    vi.stubEnv("PLATFORM_ACCOUNT_DETAILS", "  2200 0000 0000 0000  ");

    expect(platformPayment().account).toBe("2200 0000 0000 0000");
  });

  it("почта по умолчанию не пустая", () => {
    vi.stubEnv("PLATFORM_ACCOUNT_DETAILS", "");
    vi.stubEnv("SUPPORT_EMAIL", "");

    expect(platformPayment().supportEmail).toBeTruthy();
  });
});
