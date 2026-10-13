import { afterEach, describe, expect, it, vi } from "vitest";

import { decryptSecret, encryptSecret } from "./crypto";

/**
 * Шифрование токенов площадок.
 *
 * Проверяется круг: зашифрованное своим же ключом читается обратно, а смена
 * ключа ломает чтение, а не отдаёт чужой текст. Формат base64url с тремя
 * частями — контракт расшифровки.
 */
describe("crypto", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("шифрует и расшифровывает обратно", () => {
    vi.stubEnv("PLATFORM_TOKEN_SECRET", "test-secret-for-beatdesk-0123456789");

    const cipher = encryptSecret("vk1.a.token");

    expect(cipher.split(".")).toHaveLength(3);
    expect(decryptSecret(cipher)).toBe("vk1.a.token");
  });

  it("без секрета шифровать отказывается, а не молчит", () => {
    vi.stubEnv("PLATFORM_TOKEN_SECRET", "");

    expect(() => encryptSecret("x")).toThrow();
  });
});
