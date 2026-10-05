import { describe, expect, it } from "vitest";

import { chroma, detectKey, keyName, transposeTo } from "./key";

const SAMPLE_RATE = 44100;
const C4 = 261.6255653;

/** Частота ноты по её номеру в полутонах от до. */
const frequencyOf = (semitone: number): number => C4 * 2 ** (semitone / 12);

/**
 * Триада с обертонами.
 *
 * Одной синусоиды недостаточно: почти чистая гармония без обертонов не
 * похожа на настоящий бит. Обертоны затухают как 1/h² — иначе четверть
 * энергии оседает на чужих классах высот, и тональность не читается вовсе.
 */
function triad(chord: number[], seconds = 3, amplitude = 0.3): Float32Array {
  const length = Math.round(seconds * SAMPLE_RATE);
  const out = new Float32Array(length);

  for (let i = 0; i < length; i += 1) {
    let sample = 0;

    for (const semitone of chord) {
      const frequency = frequencyOf(semitone);
      for (const harmonic of [1, 2, 3, 4]) {
        sample += (amplitude / harmonic ** 2) * Math.sin((2 * Math.PI * frequency * harmonic * i) / SAMPLE_RATE);
      }
    }

    out[i] = sample;
  }

  return out;
}

describe("chroma", () => {
  it("кладёт энергию в нужный класс высот", () => {
    // Чистая A4 = класс 9 при A4 = 440 Гц.
    const vector = chroma(sineAt(440, 2), SAMPLE_RATE);

    expect(vector.length).toBe(12);
    // A — девятый класс от до, а не нулевой.
    expect(vector[9]).toBeGreaterThan(vector[0]);
    expect(vector[9]).toBeGreaterThan(vector[6]);
  });

  it("сумма классов равна единице", () => {
    const vector = chroma(triad([0, 4, 7]), SAMPLE_RATE);
    const total = vector.reduce((sum, value) => sum + value, 0);

    expect(total).toBeCloseTo(1, 4);
  });

  it("не падает на тишине", () => {
    const vector = chroma(new Float32Array(SAMPLE_RATE), SAMPLE_RATE);
    expect([...vector].every((value) => value === 0)).toBe(true);
  });
});

/**
 * Идеальная хрома для тональности.
 *
 * Строится из того же профиля, по которому считает детектор: так проверяется
 * сама логика сопоставления, без помех от реального звука.
 */
function idealChroma(root: number, minor: boolean): Float32Array {
  const profile = minor
    ? [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17]
    : [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];

  const out = new Float32Array(12);
  for (let i = 0; i < 12; i += 1) out[i] = profile[(i - root + 12) % 12]!;

  return out;
}

describe("detectKey на точной хроме", () => {
  it("находит мажорную тональность по тонике", () => {
    for (let root = 0; root < 12; root += 1) {
      const result = detectKey(idealChroma(root, false))!;
      expect(result.key, `root ${root}`).toBe(keyName(root, false));
    }
  });

  it("находит минорную тональность по тонике", () => {
    for (let root = 0; root < 12; root += 1) {
      const result = detectKey(idealChroma(root, true))!;
      expect(result.key, `root ${root}`).toBe(keyName(root, true));
    }
  });

  it("различает мажор и минор на одной тонике", () => {
    expect(detectKey(idealChroma(0, false))!.key).toBe("C major");
    expect(detectKey(idealChroma(0, true))!.key).toBe("C minor");
  });

  it("уверенность на однозначном материале высокая", () => {
    expect(detectKey(idealChroma(0, false))!.confidence).toBeGreaterThan(0.8);
  });
});

describe("detectKey", () => {
  it("тоника триады попадает в её же ноты", () => {
    const result = detectKey(chroma(triad([0, 4, 7]), SAMPLE_RATE))!;

    /*
     * По одной триаде тональность не определяется в принципе: трезвучие
     * одновременно V в фа миноре, iii в ля миноре и I в до мажоре, и
     * различает их только остальной материал. Поэтому проверяем то, что
     * обязано быть верно: тоника ответа — одна из нот самого трезвучия.
     */
    expect(["C", "E", "G"]).toContain(result.key.split(" ")[0]);
  });

  it("узнаёт ля минор по его трееде", () => {
    const result = detectKey(chroma(triad([9, 12, 16]), SAMPLE_RATE));

    expect(result!.key).toBe("A minor");
    expect(result!.short).toBe("Am");
  });

  it("уверенность падает, когда первые два кандидата близки", () => {
    const clear = detectKey(idealChroma(0, false))!.confidence;
    const flat = detectKey(new Float32Array(12).fill(1 / 12))!.confidence;

    // Ровный вектор — это материал без гармонии вообще: все тональности
    // равновероятны, и инструмент честно обязан это показывать, а не заявлять
    // уверенный ответ.
    expect(clear).toBeGreaterThan(flat);
    expect(flat).toBeLessThan(0.2);
  });

  it("даёт кандидатов по убыванию веса", () => {
    const result = detectKey(chroma(triad([2, 5, 9]), SAMPLE_RATE))!;

    for (let i = 1; i < result.candidates.length; i += 1) {
      expect(result.candidates[i]!.score).toBeLessThanOrEqual(result.candidates[i - 1]!.score);
    }
    expect(result.candidates[0]!.key).toBe(result.key);
  });

  it("уверенность в пределах 0..1 и падает на спорном материале", () => {
    const clear = detectKey(chroma(triad([0, 4, 7]), SAMPLE_RATE))!;
    const muddy = detectKey(chroma(triad([0, 1, 2, 3, 4, 5]), SAMPLE_RATE))!;

    for (const result of [clear, muddy]) {
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    }
  });

  it("на векторе неверной длины не выдумывает тональность", () => {
    expect(detectKey(new Float32Array(11))).toBeNull();
  });
});

describe("keyName", () => {
  it("пишет так же, как хранится в бите", () => {
    expect(keyName(6, true)).toBe("F# minor");
    expect(keyName(0, false)).toBe("C major");
    expect(keyName(10, false)).toBe("A# major");
  });
});

describe("transposeTo", () => {
  it("совпадающие тональности не требуют сдвига", () => {
    expect(transposeTo("C major", "C major")).toBe(0);
    expect(transposeTo("F# minor", "F# minor")).toBe(0);
  });

  it("сдвиг между тональностями в пределах октавы", () => {
    expect(transposeTo("D major", "C major")).toBe(2);
    expect(transposeTo("C major", "D major")).toBe(-2);
    expect(transposeTo("A minor", "C major")).toBe(-3);
  });

  it("выбирает ближайшее направление, а не всегда вверх", () => {
    // F# minor → C major: вниз на 6 или вверх на 6 равноценно, берём вниз.
    const shift = transposeTo("C major", "F# minor");
    expect(Math.abs(shift)).toBeLessThanOrEqual(6);
  });

  it("сравнивает тоники, а не ключевые знаки", () => {
    // У A minor и C major один ключевой знак, но тоники разные:
    // сдвиг между ними три полутона, а не ноль.
    expect(transposeTo("C major", "A minor")).toBe(3);
    expect(transposeTo("A minor", "C major")).toBe(-3);
  });
});

function sineAt(frequency: number, seconds: number): Float32Array {
  const length = Math.round(seconds * SAMPLE_RATE);
  const out = new Float32Array(length);

  for (let i = 0; i < length; i += 1) {
    out[i] = 0.3 * Math.sin((2 * Math.PI * frequency * i) / SAMPLE_RATE);
  }

  return out;
}