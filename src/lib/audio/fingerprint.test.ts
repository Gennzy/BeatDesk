import { describe, expect, it } from "vitest";

import {
  BYTES_PER_WINDOW,
  decodeEnvelope,
  encodeEnvelope,
  envelopeOf,
  isSameBeat,
  LEVELS,
  similarity,
  WINDOW_MS,
} from "./fingerprint";

/**
 * Отпечаток аудио.
 *
 * Проверяется главное свойство: пережатый трек остаётся узнаваемым, а разные
 * треки не путаются между собой. Всё остальное — детали реализации.
 */

/** Ровный тон частотой 2 Гц при 8 кГц: окно в 50 мс вмещает ровно период. */
const tone = (seconds: number, sampleRate = 8000, freq = 2000) => {
  const samples = new Float32Array(Math.floor(seconds * sampleRate));

  for (let i = 0; i < samples.length; i++) {
    samples[i] = Math.sin((2 * Math.PI * freq * i) / sampleRate) * 0.5;
  }

  return { samples, sampleRate };
};

/** Тон с меняющейся частотой: огибающая меняется, форма другая. */
const sweep = (seconds: number, sampleRate = 8000) => {
  const samples = new Float32Array(Math.floor(seconds * sampleRate));

  for (let i = 0; i < samples.length; i++) {
    const freq = 200 + (800 * i) / samples.length;
    samples[i] = Math.sin((2 * Math.PI * freq * i) / sampleRate) * 0.5;
  }

  return { samples, sampleRate };
};

describe("огибающая", () => {
  it("пустой сигнал не даёт отпечатка", () => {
    expect(envelopeOf(new Float32Array(0), 8000)).toHaveLength(0);
  });

  it("тишина не ломает расчёт", () => {
    expect(envelopeOf(new Float32Array(8000), 8000).every((value) => value === 0)).toBe(true);
  });

  it("окно фиксированной длины", () => {
    const { samples, sampleRate } = tone(2);
    const envelope = envelopeOf(samples, sampleRate);

    // Две секунды по 50 мс — сорок окон, по два байта на окно.
    expect(envelope).toHaveLength(40 * BYTES_PER_WINDOW);
    expect(WINDOW_MS).toBe(50);
  });

  it("уровни не выходят за границы", () => {
    const { samples, sampleRate } = sweep(1);

    for (const value of envelopeOf(samples, sampleRate)) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(LEVELS);
    }
  });

  it("громкий сигнал даёт те же уровни, что тихий", () => {
    // Иначе отпечаток зависел бы от громкости загрузки, и один и тот же трек,
    // выложенный тише, не нашёлся бы.
    const quiet = tone(1);
    const loud = tone(1);

    for (let i = 0; i < loud.samples.length; i++) loud.samples[i] *= 0.05;

    const a = envelopeOf(quiet.samples, quiet.sampleRate);
    const b = envelopeOf(loud.samples, loud.sampleRate);

    expect(similarity(a, b)).toBeGreaterThan(0.9);
  });
});

describe("сравнение отпечатков", () => {
  it("один и тот же трек совпадает", () => {
    const { samples, sampleRate } = tone(2);
    const envelope = envelopeOf(samples, sampleRate);

    expect(isSameBeat(envelope, envelope)).toBe(true);
  });

  it("пережатый трек остаётся узнаваемым", () => {
    /*
     * Это главное свойство. Платформы пережимают загруженный трек, и если бы
     * отпечаток менялся при пережатии, защита от кражи не работала бы
     * ровно тогда, когда она нужна.
     */
    const { samples, sampleRate } = tone(2);
    const original = envelopeOf(samples, sampleRate);

    // «Пережатие»: немного другой уровень и шум.
    const damaged = new Uint8Array(original.length);

    for (let i = 0; i < original.length; i++) {
      damaged[i] = Math.max(0, Math.min(LEVELS - 1, original[i] + (i % 3 === 0 ? 1 : 0)));
    }

    expect(isSameBeat(original, damaged)).toBe(true);
  });

  it("разные треки не путаются", () => {
    const a = tone(2, 8000, 2000);
    const b = sweep(2);

    const first = envelopeOf(a.samples, a.sampleRate);
    const second = envelopeOf(b.samples, b.sampleRate);

    expect(isSameBeat(first, second)).toBe(false);
  });

  it("пустые отпечатки не считаются похожими", () => {
    expect(similarity(new Uint8Array(0), new Uint8Array(0))).toBe(0);
    expect(isSameBeat(new Uint8Array(0), new Uint8Array(0))).toBe(false);
  });
});

describe("хранение отпечатка", () => {
  it("отпечаток переживает сохранение и чтение", () => {
    const { samples, sampleRate } = tone(1);
    const envelope = envelopeOf(samples, sampleRate);

    expect(decodeEnvelope(encodeEnvelope(envelope))).toEqual(envelope);
  });
});
