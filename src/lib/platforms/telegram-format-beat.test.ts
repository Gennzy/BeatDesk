import { describe, expect, it } from "vitest";

import { formatBeatCaption } from "./telegram-format";

/**
 * Карточка бита в Telegram.
 *
 * Проверяется то, что человек видит в своём канале и видит это каждый раз.
 * Пропавшая лицензия выглядит как «у меня нет файла», а не как ошибка в
 * коде: никто не может понять, что причина в том, что ключ называется
 * иначе.
 */

const base = {
  title: "ZIP",
  artists: ["PittKid"],
  bpm: 150,
  musicalKey: "G# major",
  tags: [],
  currency: "RUB",
  username: "gennzy",
};

describe("карточка бита в Telegram", () => {
  it("показывает все четыре уровня лицензии", () => {
    // Именно этот случай терялся: в базе уровень лежит под `bundle`,
    // а читался `wav`, и MP3+WAV исчезал из поста молча.
    const caption = formatBeatCaption({
      ...base,
      prices: { mp3: 500, wav: 800, trackout: 1500, exclusive: 3500 },
    });

    expect(caption).toContain("MP3");
    expect(caption).toContain("MP3+WAV");
    expect(caption).toContain("Track Out");
    expect(caption).toContain("Эксклюзив");
  });

  it("каждый уровень стоит на своей строке", () => {
    const caption = formatBeatCaption({
      ...base,
      prices: { mp3: 500, wav: 800, trackout: 1500, exclusive: 3500 },
    });

    // Четыре уровня в одну строку не влезают в ширину телефона, и
    // последний уезжает за край.
    for (const label of ["MP3", "MP3+WAV", "Track Out", "Эксклюзив"]) {
      const line = caption.split("\n").find((item) => item.startsWith(label));
      expect(line, label).toBeTruthy();
    }
  });

  it("не повторяет подпись, если название её уже содержит", () => {
    const caption = formatBeatCaption({
      ...base,
      // Продавец так и назвал бит — «PITTKIID TYPE BEAT | ZIP».
      title: "PittKid type beat | ZIP",
      prices: { mp3: 500, wav: null, trackout: null, exclusive: null },
    });

    // Раньше под названием вставало «type beat PittKid» — то же самое
    // словами, и читалось как недоделка.
    expect(caption.toLowerCase().includes("type beat pittkid")).toBe(false);
    expect(caption).toContain("TYPE BEAT | ZIP");
  });

  it("подпись остаётся, если в названии артиста нет", () => {
    const caption = formatBeatCaption({
      ...base,
      title: "Ночной дрейф",
      prices: { mp3: 500, wav: null, trackout: null, exclusive: null },
    });

    expect(caption).toContain("type beat PittKid");
  });

  it("пустые уровни не показываются", () => {
    const caption = formatBeatCaption({
      ...base,
      prices: { mp3: 500, wav: null, trackout: null, exclusive: null },
    });

    expect(caption).toContain("MP3");
    expect(caption).not.toContain("Track Out");
    expect(caption).not.toContain("Эксклюзив");
  });

  it("название приводится в верхний регистр и экранируется", () => {
    const caption = formatBeatCaption({
      ...base,
      title: "Ночь <b>&</b> город",
      prices: { mp3: 500, wav: null, trackout: null, exclusive: null },
    });

    expect(caption).toContain("НОЧЬ");
    expect(caption).not.toContain("<b>&</b>");
  });
});