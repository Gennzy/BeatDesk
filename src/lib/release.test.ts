import { describe, expect, it } from "vitest";

import { evaluateGate } from "./release";

describe("заглушка на время разработки", () => {
  it("в продакшене чужим закрыт", () => {
    expect(evaluateGate({ production: true, email: "stranger@example.com" }).open).toBe(false);
  });

  it("гостю без входа закрыт", () => {
    expect(evaluateGate({ production: true, email: null }).open).toBe(false);
  });

  it("владельцу открыт, иначе проверять правки будет нечем", () => {
    expect(evaluateGate({ production: true, email: "gennzybeatz@gmail.com" }).open).toBe(true);
  });

  it("регистр адреса не важен", () => {
    expect(evaluateGate({ production: true, email: "GennzyBeatz@Gmail.com" }).open).toBe(true);
  });

  it("локально и на превью открыто: e2e и отладка должны работать", () => {
    expect(evaluateGate({ email: null }).open).toBe(true);
    expect(evaluateGate({ production: false, email: null }).open).toBe(true);
  });

  it("явное off открывает сайт для всех", () => {
    expect(evaluateGate({ production: true, gate: "off", email: null }).open).toBe(true);
    expect(evaluateGate({ production: true, gate: " OFF ", email: null }).open).toBe(true);
  });

  it("любое другое значение gate не открывает", () => {
    expect(evaluateGate({ production: true, gate: "on", email: null }).open).toBe(false);
    expect(evaluateGate({ production: true, gate: "yes", email: null }).open).toBe(false);
  });

  it("причину закрытия видно, чтобы заглушка могла её объяснить", () => {
    expect(evaluateGate({ production: true, email: null }).reason).toBe("разработка");
    expect(evaluateGate({ production: true, email: "gennzybeatz@gmail.com" }).reason).toBe("владелец");
  });
});
