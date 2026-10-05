import { describe, expect, it } from "vitest";

import { buildMessages, SYSTEM_PROMPT } from "./beat-copy";

const text = (messages: ReturnType<typeof buildMessages>) => messages.map((m) => m.content).join("\n");

describe("правила подсказки", () => {
  it("просит только JSON: иначе ответ не разобрать", () => {
    expect(SYSTEM_PROMPT).toContain("ТОЛЬКО валидным JSON");
    expect(SYSTEM_PROMPT).toContain("titles");
  });

  it("запрещает выдумывать звучание", () => {
    // Модель охотно пишет «тёмный бит» про любой жанр, если не запретить.
    expect(SYSTEM_PROMPT).toMatch(/не выдумывай/i);
  });

  it("задаёт схему, а не примеры", () => {
    expect(SYSTEM_PROMPT).toMatch(/\{"titles"/);
  });
});

describe("данные, которые видит модель", () => {
  it("передаёт факты о бите", () => {
    const prompt = text(buildMessages({ bpm: 166, musicalKey: "A# minor", tags: ["trap"], duration: 184 }));

    expect(prompt).toContain("166 BPM");
    expect(prompt).toContain("A# minor");
    expect(prompt).toContain("trap");
    expect(prompt).toContain("184 с");
  });

  it("помечает наличие стемов и WAV", () => {
    const prompt = text(buildMessages({ bpm: 140, hasStems: true, hasWav: true }));

    expect(prompt).toContain("есть стемы");
    expect(prompt).toContain("есть WAV");
  });

  it("не выдумывает того, чего не передали", () => {
    const prompt = text(buildMessages({ bpm: 140 }));

    expect(prompt).not.toContain("тональность:");
    expect(prompt).not.toContain("длительность:");
    expect(prompt).not.toContain("есть стемы");
  });

  it("без данных просит не догадываться, а сказать, чего не хватает", () => {
    expect(text(buildMessages({}))).toContain("чего не хватает");
  });

  it("имя текущего названия показывает, что его можно улучшить", () => {
    expect(text(buildMessages({ bpm: 140, title: "бит1" }))).toContain("«бит1»");
  });

  it("слишком длинный список артистов обрезается", () => {
    const many = Array.from({ length: 30 }, (_, index) => `Артист ${index}`);
    const prompt = text(buildMessages({ bpm: 140, artists: many }));

    expect(prompt).toContain("Артист 5");
    expect(prompt).not.toContain("Артист 6");
  });
});
