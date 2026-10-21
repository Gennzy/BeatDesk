import { describe, expect, it } from "vitest";

import { align, isMatch, MATCH_THRESHOLD } from "./align";
import { BYTES_PER_WINDOW, encodeEnvelope, envelopeOf } from "@/lib/audio/fingerprint";

/**
 * Поиск бита внутри трека.
 *
 * Главное свойство: бит в трепе начинается не с нуля, и наивное сравнение
 * первых секунд не находит ничего. Здесь проверяется именно это.
 */

const SAMPLE_RATE = 8000;

/** Бит: ровный тон с редким постукиванием. */
const beat = (seconds = 2) => {
  const samples = new Float32Array(Math.floor(seconds * SAMPLE_RATE));

  for (let i = 0; i < samples.length; i++) {
    const click = i % 4000 < 120 ? 1 : 0.15;
    samples[i] = Math.sin((2 * Math.PI * 2000 * i) / SAMPLE_RATE) * 0.5 * click;
  }

  return encodeEnvelope(envelopeOf(samples, SAMPLE_RATE));
};

/** Треп: сначала тишина, потом бит, потом своё. */
const trackWith = (before: number, seconds = 6) => {
  const total = Math.floor(seconds * SAMPLE_RATE);
  const samples = new Float32Array(total);
  const start = Math.floor(before * SAMPLE_RATE);

  for (let i = start; i < total; i++) {
    const click = (i - start) % 4000 < 120 ? 1 : 0.15;
    samples[i] = Math.sin((2 * Math.PI * 2000 * i) / SAMPLE_RATE) * 0.5 * click;
  }

  return encodeEnvelope(envelopeOf(samples, SAMPLE_RATE));
};

/** Совсем другой звук. */
const other = (seconds = 2) => {
  const samples = new Float32Array(Math.floor(seconds * SAMPLE_RATE));

  for (let i = 0; i < samples.length; i++) {
    const freq = 300 + (700 * i) / samples.length;
    samples[i] = Math.sin((2 * Math.PI * freq * i) / SAMPLE_RATE) * 0.5;
  }

  return encodeEnvelope(envelopeOf(samples, SAMPLE_RATE));
};


describe("бит внутри трепа", () => {
  it("находится, даже если начинается с середины", () => {
    /*
     * Это главное свойство. Без смещения движок не нашёл бы ничего: в трепе
     * бит играет после вступления, и первые секунды не похожи ни на что.
     */
    const result = align(beat(), trackWith(2.5));

    expect(result.match).toBeGreaterThan(MATCH_THRESHOLD);
    // Смещение считается окнами по 50 мс: 2,5 секунды — это пятидесятое окно.
    expect(result.offset).toBeGreaterThan(40);
    expect(result.offset).toBeLessThan(60);
  });

  it("находится и в начале", () => {
    const result = align(beat(), trackWith(0));

    expect(result.match).toBeGreaterThan(MATCH_THRESHOLD);
    expect(result.offset).toBe(0);
  });

  it("чужой треп не подходит", () => {
    const result = align(beat(), other(6));

    expect(result.match).toBeLessThan(MATCH_THRESHOLD);
    expect(isMatch(result.match)).toBe(false);
  });

  it("пустые отпечатки не ломают поиск", () => {
    const result = align("", beat());

    expect(result.match).toBe(0);
  });

  it("окно в 50 мс — значит смещение считается окнами", () => {
    expect(BYTES_PER_WINDOW).toBe(2);
  });
});
