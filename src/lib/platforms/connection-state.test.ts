import { describe, expect, it } from "vitest";

import { connectionProblem, isConnected, needsSecret } from "./connection-state";

const row = (over = {}) => ({ platform: "youtube", hasToken: false, label: null, meta: null, ...over });

describe("подключение по-настоящему", () => {
  it("строка без секрета — это не подключение", () => {
    // Раньше интерфейс показывал «подключено» при пустой строке в базе.
    expect(isConnected({ auth: "oauth" }, row())).toBe(false);
    expect(connectionProblem({ auth: "oauth" }, row())).toBe("нет секрета");
  });

  it("с секретом подключение настоящее", () => {
    expect(isConnected({ auth: "oauth" }, row({ hasToken: true }))).toBe(true);
    expect(connectionProblem({ auth: "oauth" }, row({ hasToken: true }))).toBeNull();
  });

  it("площадке без секрета достаточно самой строки", () => {
    expect(needsSecret({ auth: "none" })).toBe(false);
    expect(isConnected({ auth: "none" }, row())).toBe(true);
  });

  it("токенная площадка без токена не подключена", () => {
    expect(isConnected({ auth: "token" }, row())).toBe(false);
  });

  it("отсутствие строки — не проблема, а состояние «не подключено»", () => {
    expect(isConnected({ auth: "oauth" }, undefined)).toBe(false);
    expect(connectionProblem({ auth: "oauth" }, undefined)).toBeNull();
  });
});
