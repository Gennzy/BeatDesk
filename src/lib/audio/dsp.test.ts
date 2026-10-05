import { describe, expect, it } from "vitest";

import {
  autocorrelation,
  fft,
  hann,
  magnitude,
  median,
  normalize,
  spectralFlux,
  toMono,
} from "./dsp";

/** Синус заданной частоты и длительности. */
function sine(frequency: number, seconds: number, sampleRate: number, amplitude = 1): Float32Array {
  const out = new Float32Array(Math.round(seconds * sampleRate));
  for (let i = 0; i < out.length; i += 1) {
    out[i] = amplitude * Math.sin((2 * Math.PI * frequency * i) / sampleRate);
  }
  return out;
}

describe("hann", () => {
  it("окно не выходит за 0..1 и симметрично", () => {
    const window = hann(64);

    expect(window[0]).toBeCloseTo(0, 6);
    expect(window[63]).toBeCloseTo(0, 6);
    // При чётном размере вершина окна попадает между отсчётами, поэтому
    // единице равен максимум, а не какой-то конкретный элемент.
    expect(Math.max(...window)).toBeGreaterThan(0.999);
    expect(window[31]).toBeCloseTo(window[32]!, 6);

    for (let i = 0; i < 64; i += 1) {
      expect(window[i]).toBeGreaterThanOrEqual(-1e-9);
      expect(window[i]).toBeLessThanOrEqual(1 + 1e-9);
      expect(window[i]).toBeCloseTo(window[63 - i]!, 6);
    }
  });
});

describe("fft", () => {
  it("находит ровно тот bin, где лежит тон", () => {
    const size = 1024;
    const sampleRate = 44100;
    // 44100/1024 ≈ 43.07 Hz на bin: тон на bin 100 — это точная частота
    const frequency = (sampleRate / size) * 100;
    const signal = sine(frequency, size / sampleRate, sampleRate);

    const re = Float32Array.from(signal);
    const im = new Float32Array(size);
    fft(re, im);

    let peak = 0;
    let peakBin = 0;
    for (let bin = 1; bin < size / 2; bin += 1) {
      const value = Math.hypot(re[bin]!, im[bin]!);
      if (value > peak) {
        peak = value;
        peakBin = bin;
      }
    }

    expect(peakBin).toBe(100);
    expect(peak).toBeGreaterThan(size / 4);
  });

  it("не тихо забывает постоянную составляющую", () => {
    const size = 256;
    const re = new Float32Array(size).fill(1);
    const im = new Float32Array(size);
    fft(re, im);

    expect(Math.hypot(re[0]!, im[0]!)).toBeCloseTo(size, 4);
    // в остальных бинах постоянная составляющая даёт ровно ноль
    expect(Math.hypot(re[10]!, im[10]!)).toBeCloseTo(0, 4);
  });

  it("отказывается от размера, который не степень двойки", () => {
    expect(() => fft(new Float32Array(3), new Float32Array(3))).toThrow(/степень двойки/u);
  });

  it("отказывается от рассинхрона частей", () => {
    expect(() => fft(new Float32Array(4), new Float32Array(8))).toThrow(/разной длины/u);
  });
});

describe("magnitude", () => {
  it("суммирует кадры и находит пик тона", () => {
    const sampleRate = 44100;
    const size = 2048;
    const bin = 100;
    const frequency = (sampleRate / size) * bin;
    const signal = sine(frequency, 0.2, sampleRate);

    const spectrum = magnitude(signal, size);

    let peakBin = 0;
    let peak = 0;
    for (let i = 1; i < spectrum.length; i += 1) {
      if (spectrum[i]! > peak) {
        peak = spectrum[i]!;
        peakBin = i;
      }
    }

    expect(peakBin).toBe(bin);
    expect(peak).toBeGreaterThan(0);
  });

  it("требует достаточно данных", () => {
    expect(() => magnitude(new Float32Array(10), 2048)).toThrow(/нужно 2048/u);
  });
});

describe("spectralFlux", () => {
  it("даёт больше потока в начале удара, чем в его хвосте", () => {
    const sampleRate = 44100;
    // щелчок: короткий всплеск в начале и тишина потом
    const length = Math.round(0.4 * sampleRate);
    const signal = new Float32Array(length);
    for (let i = 0; i < Math.round(0.006 * sampleRate); i += 1) {
      const decay = 1 - i / (0.006 * sampleRate);
      signal[i] = decay * Math.sin((2 * Math.PI * 180 * i) / sampleRate);
    }

    const flux = spectralFlux(signal, 1024, 512);
    const first = flux[0]! + flux[1]! + flux[2]!;
    const last = flux[flux.length - 1]! + flux[flux.length - 2]!;

    expect(flux.length).toBeGreaterThan(10);
    expect(first).toBeGreaterThan(last);
  });

  it("тишина даёт нулевой поток", () => {
    expect(spectralFlux(new Float32Array(8192), 1024, 512).every((value) => value === 0)).toBe(true);
  });

  it("на сигнале короче окна не падает", () => {
    expect(() => spectralFlux(new Float32Array(100), 1024, 512)).not.toThrow();
    expect(spectralFlux(new Float32Array(100), 1024, 512).length).toBe(0);
  });
});

describe("normalize", () => {
  it("растягивает до 0..1", () => {
    const out = normalize(Float32Array.from([2, 4, 6]));
    expect(out[0]).toBeCloseTo(0, 6);
    expect(out[2]).toBeCloseTo(1, 6);
    expect(out[1]).toBeCloseTo(0.5, 6);
  });

  it("на постоянном сигнале отдаёт нули, а не деление на ноль", () => {
    const out = normalize(new Float32Array(5).fill(3));
    expect([...out]).toEqual([0, 0, 0, 0, 0]);
  });

  it("пустой массив не ломается", () => {
    expect(normalize(new Float32Array(0)).length).toBe(0);
  });
});

describe("median", () => {
  it("середина отсортированного", () => {
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });

  it("пустой массив даёт ноль", () => {
    expect(median([])).toBe(0);
  });

  it("один выброс не сдвигает середину", () => {
    expect(median([10, 10, 10, 10, 10_000])).toBe(10);
  });
});

describe("autocorrelation", () => {
  it("находит период повторения", () => {
    // прямоугольные импульсы с периодом 64 отсчёта
    const values = new Float32Array(1024);
    for (let i = 0; i < values.length; i += 1) values[i] = i % 64 < 4 ? 1 : 0;

    const auto = autocorrelation(values, 256);
    let best = 1;
    let bestLag = 1;
    for (let lag = 2; lag < 256; lag += 1) {
      if (auto[lag]! > auto[bestLag]!) {
        bestLag = lag;
        best = auto[lag]!;
      }
    }

    expect(bestLag).toBe(64);
    expect(best).toBeGreaterThan(0.2);
  });

  it("тишина даёт нули вместо деления на ноль", () => {
    expect([...autocorrelation(new Float32Array(64), 8)].every((value) => value === 0)).toBe(true);
  });
});

describe("toMono", () => {
  it("усредняет каналы", () => {
    const left = Float32Array.from([1, 1]);
    const right = Float32Array.from([0, 0]);

    expect([...toMono([left, right])]).toEqual([0.5, 0.5]);
  });

  it("один канал идёт как есть", () => {
    const single = Float32Array.from([1, 2, 3]);
    expect(toMono([single])).toBe(single);
  });

  it("пустой набор каналов даёт пустой результат", () => {
    expect(toMono([]).length).toBe(0);
  });
});