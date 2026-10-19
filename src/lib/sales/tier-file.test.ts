import { describe, expect, it } from "vitest";

import { hasTierFile, TIER_FILE, type TierFileFacts } from "./tier-file";

/**
 * Файлы уровня.
 *
 * Правило живёт здесь, а проверка в базе (0056) повторяет его. Дубликат
 * неприятен и обязателен: приложение отвечает за то, что уровень показан и
 * не врёт, а база — за то, что за деньги отдают товар.
 *
 * Факты приходят флагами: путь в баке содержит идентификатор владельца, и
 * тащить его в браузер незачем.
 */

const facts = (over: Partial<TierFileFacts> = {}): TierFileFacts => ({
  hasPreview: false,
  hasWav: false,
  hasStems: false,
  ...over,
});

describe("файл уровня", () => {
  it("MP3 требует превью", () => {
    expect(hasTierFile(facts({ hasPreview: true }), "mp3")).toBe(true);
    expect(hasTierFile(facts(), "mp3")).toBe(false);
  });

  it("MP3+WAV требует мастер", () => {
    expect(hasTierFile(facts({ hasWav: true }), "bundle")).toBe(true);
    expect(hasTierFile(facts(), "bundle")).toBe(false);
  });

  it("Track Out и Эксклюзив требуют архив дорожек", () => {
    expect(hasTierFile(facts({ hasStems: true }), "trackout")).toBe(true);
    expect(hasTierFile(facts({ hasStems: true }), "exclusive")).toBe(true);
    expect(hasTierFile(facts(), "trackout")).toBe(false);
  });

  it("файл чужого уровня не считается", () => {
    // Архив дорожек не заменяет мастер: купил «MP3 + WAV» — получил WAV.
    expect(hasTierFile(facts({ hasStems: true }), "bundle")).toBe(false);
    expect(hasTierFile(facts({ hasWav: true }), "trackout")).toBe(false);
  });

  it("неизвестный уровень файла не имеет", () => {
    expect(hasTierFile(facts({ hasPreview: true, hasWav: true, hasStems: true }), "какой-то уровень")).toBe(
      false,
    );
  });
});

describe("название главного файла", () => {
  it("у каждого уровня свой главный файл", () => {
    expect(TIER_FILE.mp3).toBe("превью");
    expect(TIER_FILE.bundle).toBe("мастер WAV");
    expect(TIER_FILE.trackout).toBe("архив дорожек");
    expect(TIER_FILE.exclusive).toBe("архив дорожек");
  });
});
