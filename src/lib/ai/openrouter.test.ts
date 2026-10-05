import { describe, expect, it } from "vitest";

import { DEFAULT_MODEL, MODELS } from "./openrouter";

describe("список бесплатных моделей", () => {
  it("все модели помечены как бесплатные", () => {
    // Платная модель в списке означала бы счёт за наш счёт, а не за ваш.
    for (const model of MODELS) {
      expect(model, model).toContain(":free");
    }
  });

  it("модели не повторяются", () => {
    expect(new Set(MODELS).size).toBe(MODELS.length);
  });

  it("есть запасная модель, если первая перегружена", () => {
    // Бесплатные модели регулярно перегружены, и один отказ не должен
    // превращаться в ошибку на странице.
    expect(MODELS.length).toBeGreaterThan(1);
    expect(DEFAULT_MODEL).toBe(MODELS[0]);
  });

  it("модели указаны в формате провайдера OpenRouter", () => {
    for (const model of MODELS) {
      expect(model, model).toMatch(/^[a-z0-9-]+\/[a-z0-9.\-]+:free$/);
    }
  });
});
