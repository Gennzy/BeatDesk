import { magnitude } from "./dsp";

/**
 * Тональность по хроматическому вектору.
 *
 * Честное ограничение: хроматический анализ ошибается на материале без
 * явной гармонии, и потолок точности — примерно 80–90%. Поэтому ответ
 * никогда не выдаётся как одиннадцать цифр точности: показываются все
 * кандидаты с весами, и человек решает сам.
 */

/** До первой октавы в герцях при тюнинге A4 = 440 Гц. */
const C4 = 261.6255653;
const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

/**
 * Профили Крамхансла–Шмуклера: насколько типичен каждый класс тона
 * для мажора и для минора. Сравнение хромы с этими наборами и даёт
 * тональность.
 */
const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

const LOW_HZ = 55; // примерно A1: ниже нет музыкального содержания
const HIGH_HZ = 5000; // выше слышно шипение, а не гармонию

export type KeyName = string;

export type KeyCandidate = {
  key: KeyName;
  /** Доля совпадения 0..1. Не вероятность, а относительный вес. */
  score: number;
};

export type KeyResult = {
  /** «F# minor» — в том же виде, в котором тональность хранится в бите. */
  key: KeyName;
  /** «F#m» — сокращённо, как ждёт форма площадки. */
  short: KeyName;
  /** Уверенность 0..1: насколько первый кандидат опережает остальные. */
  confidence: number;
  candidates: KeyCandidate[];
};

/**
 * Хроматический вектор: энергия спектра по двенадцати классам высот.
 *
 * Считается один раз на весь трек: тональность в бите не меняется, а
 * усреднение по времени убирает шум отдельных ударов.
 *
 * Перед раскладкой по классам спектр отбеливается — из него вычитается
 * сглаженная копия. Без этого вектор почти плоский: бас энергичнее верха,
 * и на такой хроме профили мажора и соседних тональностей слипаются, а
 * триада до мажора читается как соль мажор.
 */
export function chroma(samples: Float32Array, sampleRate: number, size = 4096): Float32Array {
  const spectrum = magnitude(samples, size);
  const out = new Float32Array(12);

  // Окно сглаживания — примерно треть октавы: так убирается общая огибающая,
  // но не сами тоны, которые и должны остаться в хроме.
  const smoothWidth = Math.max(2, Math.round(size / (12 * Math.log2(2)) / 8));
  const db = new Float32Array(spectrum.length);

  for (let bin = 1; bin < spectrum.length; bin += 1) {
    db[bin] = 20 * Math.log10(1 + 1000 * spectrum[bin]!);
  }

  for (let bin = 1; bin < spectrum.length; bin += 1) {
    const frequency = (bin * sampleRate) / size;
    if (frequency < LOW_HZ || frequency > HIGH_HZ) continue;

    let sum = 0;
    let count = 0;
    for (let j = Math.max(1, bin - smoothWidth); j <= Math.min(spectrum.length - 1, bin + smoothWidth); j += 1) {
      sum += db[j]!;
      count += 1;
    }
    const localAverage = count > 0 ? sum / count : 0;

    // Только что вылезшее из-под огибающей: остальное не нота.
    const prominence = Math.max(0, db[bin]! - localAverage);
    if (prominence === 0) continue;

    const semitonesFromC = 12 * Math.log2(frequency / C4);
    const pitchClass = Math.round(semitonesFromC) % 12;

    out[(pitchClass + 12) % 12]! += prominence;
  }

  const total = out.reduce((sum, value) => sum + value, 0);
  if (total > 0) {
    for (let i = 0; i < out.length; i += 1) out[i]! /= total;
  }

  return out;
}

function correlate(vector: Float32Array, profile: number[]): number {
  const meanVector = vector.reduce((sum, value) => sum + value, 0) / vector.length;
  const meanProfile = profile.reduce((sum, value) => sum + value, 0) / profile.length;

  let numerator = 0;
  let denominatorVector = 0;
  let denominatorProfile = 0;

  for (let i = 0; i < vector.length; i += 1) {
    const a = vector[i]! - meanVector;
    const b = profile[i]! - meanProfile;
    numerator += a * b;
    denominatorVector += a * a;
    denominatorProfile += b * b;
  }

  const denominator = Math.sqrt(denominatorVector * denominatorProfile);
  return denominator > 0 ? numerator / denominator : 0;
}

export function keyName(pitchClass: number, minor: boolean): KeyName {
  return `${NOTE_NAMES[((pitchClass % 12) + 12) % 12]} ${minor ? "minor" : "major"}`;
}

/**
 * Кандидаты по убыванию веса.
 *
 * Ротация профиля на ступень — это и есть проверка «а не в тональности ли
 * минора»: тоника одна и та же, отличается набор интервалов.
 */
export function detectKey(vector: Float32Array): KeyResult | null {
  if (vector.length !== 12) return null;

  /*
   * На тишине или на файле без гармонии хрома нулевая, и профили дают
   * полный ничей. Без этой проверки инструмент уверенно писал бы «C major»
   * для пустого файла: все двадцать четыре кандидата равны, побеждает
   * первый по сортировке. Лучше честно сказать «определить не удалось».
   */
  const energy = vector.reduce((sum, value) => sum + value, 0);
  if (energy <= 0) return null;

  const scored: KeyCandidate[] = [];


  for (let root = 0; root < 12; root += 1) {
    for (const minor of [false, true]) {
      const profile = minor ? MINOR_PROFILE : MAJOR_PROFILE;
      // Тональность с тоникой root: класс высот i — это ступень (i - root).
      const rotated = profile.map((_, index) => profile[(index - root + 12) % 12]!);
      scored.push({ key: keyName(root, minor), score: correlate(vector, rotated) });
    }
  }

  scored.sort((a, b) => b.score - a.score);

  const best = scored[0];
  const second = scored[1];
  if (!best) return null;

  /*
   * Уверенность — это разрыв между первым и вторым кандидатом, а не сам
   * балл и не размах по всем двадцати четырём. Размах ничего не значит:
   * у триады всегда найдётся кандидат с низким баллом, и уверенность
   * выходила бы высокой даже при полностью размытом ответе. А вот близкие
   * лидеры означают ровно то, что материал спорный.
   */
  const gap = second ? best.score - second.score : 0;
  const confidence = Math.max(0, Math.min(1, gap / 0.3));

  const [root, minor] = best.key.split(" ") as [string, string];

  return {
    key: best.key,
    short: `${root}${minor === "minor" ? "m" : ""}`,
    confidence,
    candidates: scored.slice(0, 5),
  };
}

/**
 * На сколько полутонов поднять или опустить трек, чтобы он попал
 * в чужую тональность. Ровно то, что нужно при сведении.
 */
export function transposeTo(target: KeyName, source: KeyName): number {
  /*
   * Сравниваются тоники, а не ключевые знаки. У A minor и C major знак
   * один, но тоники разные, и сдвиг между ними — три полутона, а не ноль.
   * Относительный мажор здесь путал бы две разные вещи.
   */
  const tonic = (key: KeyName): number => NOTE_NAMES.indexOf(key.split(" ")[0] ?? "");

  const semitones = (tonic(target) - tonic(source) + 12) % 12;

  // Ближайшее движение: поднять на 10 и опустить на 2 — одно и то же.
  return semitones > 6 ? semitones - 12 : semitones;
}

export const PITCH_CLASSES = NOTE_NAMES;