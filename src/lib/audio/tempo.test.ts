import { describe, expect, it } from "vitest";

import { spectralFlux } from "./dsp";
import { buildOnsetTrack, detectSwing, detectTempo } from "./tempo";

const SAMPLE_RATE = 44100;

/**
 * Удар в такт.
 *
 * Клики идут ровно по долям, иначе сигнал двусмысленен сам по себе:
 * клики по восьмым честно читаются и как 70, и как 140 BPM, и проверить
 * на них детектор нельзя.
 */
function clickTrack(bpm: number, seconds: number, options: { offsetBeats?: number } = {}): Float32Array {
  const length = Math.round(seconds * SAMPLE_RATE);
  const out = new Float32Array(length);
  const secondsPerBeat = 60 / bpm;
  const offset = (options.offsetBeats ?? 0) * secondsPerBeat;

  for (let time = offset; time < seconds; time += secondsPerBeat) {
    const start = Math.round(time * SAMPLE_RATE);
    const decay = Math.round(0.02 * SAMPLE_RATE);

    for (let i = 0; i < decay && start + i < length; i += 1) {
      const envelope = 1 - i / decay;
      out[start + i] = envelope * Math.sin((2 * Math.PI * 70 * (start + i)) / SAMPLE_RATE);
    }
  }

  return out;
}

/**
 * Ритм со свингом: удары на восьмых, но доли неравные.
 *
 * swing задан смещением: 0 — ровные восьмые, 0.24 — пара 62/38,
 * то есть классический свинг.
 */
function swingTrack(bpm: number, seconds: number, swing: number): Float32Array {
  const length = Math.round(seconds * SAMPLE_RATE);
  const out = new Float32Array(length);
  const step = 60 / bpm / 2;

  for (let index = 0; ; index += 1) {
    const time = index * step + (index % 2 === 1 ? step * swing : 0);
    if (time >= seconds) break;

    const start = Math.round(time * SAMPLE_RATE);
    const decay = Math.round(0.02 * SAMPLE_RATE);

    for (let i = 0; i < decay && start + i < length; i += 1) {
      const envelope = 1 - i / decay;
      out[start + i] = envelope * Math.sin((2 * Math.PI * 70 * (start + i)) / SAMPLE_RATE);
    }
  }

  return out;
}

const SIZE = 1024;
const HOP = 256;

function analyze(samples: Float32Array) {
  const flux = spectralFlux(samples, SIZE, HOP);
  const track = buildOnsetTrack(flux, SIZE, HOP, SAMPLE_RATE);
  return { tempo: detectTempo(track), track };
}

describe("buildOnsetTrack", () => {
  it("частота огибающей равна sampleRate / hop", () => {
    const samples = clickTrack(120, 2);
    const track = buildOnsetTrack(spectralFlux(samples, SIZE, HOP), SIZE, HOP, SAMPLE_RATE);

    // 256 отсчётов при 44100 Гц — примерно 172 отсчёта огибающей в секунду
    expect(track.rate).toBeCloseTo(SAMPLE_RATE / HOP, 6);
    expect(track.envelope.length).toBeGreaterThan(300);
  });

  it("удары попадают в огибающую по всему треку, а не только в начало", () => {
    // Раньше индексы огибающей считались от отдельного шага, не совпадавшего
    // с hop'ом, и весь трек схлопывался в первый отсчёт.
    const samples = clickTrack(120, 2);
    const track = buildOnsetTrack(spectralFlux(samples, SIZE, HOP), SIZE, HOP, SAMPLE_RATE);

    const loud = track.envelope.reduce((count, value) => (value > 0.5 ? count + 1 : count), 0);
    expect(loud).toBeGreaterThan(2);
  });
});

describe("detectTempo на клике с известным темпом", () => {
  for (const bpm of [70, 90, 128, 140, 174, 200]) {
    it(`находит ${bpm} BPM`, () => {
      const { tempo } = analyze(clickTrack(bpm, 8));

      expect(tempo.bpm).toBeGreaterThan(0);
      // Детектор оценивает период по огибающей, поэтому небольшая
      // погрешность неизбежна: доли секунды тут норма.
      expect(Math.abs(tempo.bpm - bpm)).toBeLessThan(1.5);
      expect(tempo.confidence).toBeGreaterThan(0.1);
    });
  }

  it("различает 70 и 140 BPM: это разный ритм, а не один с двойной скоростью", () => {
    const slow = analyze(clickTrack(70, 10)).tempo.bpm;
    const fast = analyze(clickTrack(140, 10)).tempo.bpm;

    expect(Math.abs(slow - 70)).toBeLessThan(1.5);
    expect(Math.abs(fast - 140)).toBeLessThan(1.5);
  });

  it("на целом темпе честно ставит метку «ровно»", () => {
    const { tempo } = analyze(clickTrack(140, 8));
    expect(tempo.exact).toBe(true);
  });

  it("на нецелом темпе метку не ставит", () => {
    const { tempo } = analyze(clickTrack(140.4, 8));
    if (tempo.bpm > 0) expect(tempo.exact).toBe(false);
  });

  it("сильная доля смещена, если клики сдвинуты на четверть", () => {
    const straight = analyze(clickTrack(120, 10)).tempo;
    const shifted = analyze(clickTrack(120, 10, { offsetBeats: 0.25 })).tempo;

    expect(straight.downbeatOffset).toBeLessThan(0.15);
    // Первый удар смещён на четверть доли — детектор обязан это увидеть.
    expect(Math.abs(shifted.downbeatOffset - 0.25)).toBeLessThan(0.15);
  });

  it("на тишине не выдумывает темп", () => {
    const { tempo } = analyze(new Float32Array(SAMPLE_RATE * 4));

    expect(tempo.bpm).toBe(0);
    expect(tempo.confidence).toBe(0);
  });

  it("на слишком коротком файле не выдумывает темп", () => {
    const { tempo } = analyze(clickTrack(140, 0.4));

    expect(tempo.bpm).toBe(0);
  });
});

describe("detectSwing", () => {
  it("на ровном ритме свинга нет", () => {
    const { track, tempo } = analyze(clickTrack(100, 12));

    const swing = detectSwing(track, tempo.bpm);
    expect(swing.amount).toBeNull();
  });

  it("на свинге показывает, насколько он размытый", () => {
    // Восьмые доли 62/38 — это классический свинг.
    const { track, tempo } = analyze(swingTrack(100, 12, 0.24));

    const swing = detectSwing(track, tempo.bpm);

    expect(swing.amount).not.toBeNull();
    // Доля длинной доли в паре должна быть заметно больше половины.
    expect(swing.amount!).toBeGreaterThan(0.55);
    expect(swing.amount!).toBeLessThan(0.8);
  });

  it("без известного темпа не выдумывает свинг", () => {
    const { track } = analyze(clickTrack(100, 12));
    expect(detectSwing(track, 0).amount).toBeNull();
  });
});