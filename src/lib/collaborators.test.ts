import { describe, expect, it } from "vitest";

import { hasCollaborators, normalizeCollaborators, TOTAL_SHARE_BPS } from "./collaborators";

describe("normalizeCollaborators", () => {
  it("пустой ввод даёт пустой список", () => {
    expect(normalizeCollaborators(undefined)).toEqual({ ok: true, value: [] });
    expect(normalizeCollaborators(null)).toEqual({ ok: true, value: [] });
  });

  it("принимает валидный список", () => {
    const result = normalizeCollaborators([{ user_id: "u1", share_bps: 5000 }, { user_id: "u2", share_bps: 5000 }]);
    expect(result).toEqual({ ok: true, value: [{ user_id: "u1", share_bps: 5000 }, { user_id: "u2", share_bps: 5000 }] });
  });

  it("отвергает неверную сумму долей", () => {
    const result = normalizeCollaborators([{ user_id: "u1", share_bps: 3000 }, { user_id: "u2", share_bps: 3000 }]);
    expect(result.ok).toBe(false);
  });

  it("отвергает дубликаты", () => {
    const result = normalizeCollaborators([{ user_id: "u1", share_bps: 5000 }, { user_id: "u1", share_bps: 5000 }]);
    expect(result.ok).toBe(false);
  });

  it("отвергает невалидный share_bps", () => {
    const result = normalizeCollaborators([{ user_id: "u1", share_bps: 1.5 }]);
    expect(result.ok).toBe(false);
  });

  it("отвергает пустой user_id", () => {
    const result = normalizeCollaborators([{ user_id: "", share_bps: 10000 }]);
    expect(result.ok).toBe(false);
  });

  it("отвергает не-массив", () => {
    const result = normalizeCollaborators("nope");
    expect(result.ok).toBe(false);
  });
});

describe("hasCollaborators", () => {
  it("false для пустого", () => {
    expect(hasCollaborators([])).toBe(false);
    expect(hasCollaborators(null)).toBe(false);
    expect(hasCollaborators(undefined)).toBe(false);
  });

  it("true если есть хотя бы один", () => {
    expect(hasCollaborators([{ user_id: "u1", share_bps: 10000 }])).toBe(true);
  });
});

describe("TOTAL_SHARE_BPS", () => {
  it("равен 10000", () => {
    expect(TOTAL_SHARE_BPS).toBe(10000);
  });
});