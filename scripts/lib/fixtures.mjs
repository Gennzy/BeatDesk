/**
 * Синтетический битовый материал с известным ответом.
 *
 * Чистые клики из юнит-тестов слишком просты: у настоящего бита есть
 * ударные, тональные элементы и шум хэтов, которые меняют огибающую
 * наступлений. Здесь собирается материал, похожий на бит: кик, снейр,
 * хэты, бас и пад — и темп с тональностью заданы точно.
 */

/** Генератор шума с фиксированным зерном: прогоны должны повторяться. */
function seeded(seed) {
  let state = seed >>> 0 || 1;

  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return ((state >>> 0) / 4294967296) * 2 - 1;
  };
}

const C4 = 261.6255653;
const NOTE_SEMITONES = { C: 0, "C#": 1, D: 2, "D#": 3, E: 4, F: 5, "F#": 6, G: 7, "G#": 8, A: 9, "A#": 10, B: 11 };
const MINOR_STEPS = [0, 2, 3, 5, 7, 8, 10];

export function noteToSemitone(name, octave = 3) {
  return NOTE_SEMITONES[name] + (octave + 1) * 12;
}

export const frequencyOf = (semitone) => C4 * 2 ** (semitone / 12);

/** Кик: падающий тон с быстрым спадом. */
function kick(out, at, sampleRate, gain = 0.9) {
  const length = Math.round(0.12 * sampleRate);

  for (let i = 0; i < length && at + i < out.length; i += 1) {
    const t = i / sampleRate;
    const sweep = 120 * Math.exp(-t * 28) + 42;
    out[at + i] += gain * Math.exp(-t * 26) * Math.sin(2 * Math.PI * sweep * t);
  }
}

/** Снейр: шумовой всплеск с коротким тонким телом. */
function snare(out, at, sampleRate, noise, gain = 0.55) {
  const length = Math.round(0.16 * sampleRate);

  for (let i = 0; i < length && at + i < out.length; i += 1) {
    const t = i / sampleRate;
    out[at + i] += gain * Math.exp(-t * 34) * (noise() * 0.7 + Math.sin(2 * Math.PI * 190 * t) * 0.3);
  }
}

/** Хэт: очень короткий шум. */
function hat(out, at, sampleRate, noise, gain = 0.22) {
  const length = Math.round(0.05 * sampleRate);

  for (let i = 0; i < length && at + i < out.length; i += 1) {
    out[at + i] += gain * Math.exp(-(i / sampleRate) * 120) * noise();
  }
}

/** Тональный элемент: основной тон и обертоны с быстрым спадом. */
function tone(out, at, sampleRate, semitone, seconds, gain = 0.3) {
  const frequency = frequencyOf(semitone);
  const length = Math.round(seconds * sampleRate);

  for (let i = 0; i < length && at + i < out.length; i += 1) {
    const t = i / sampleRate;
    const envelope = Math.min(1, t * 40) * Math.exp(-t * 3.2);

    out[at + i] +=
      gain *
      envelope *
      (Math.sin(2 * Math.PI * frequency * t) +
        0.5 * Math.sin(2 * Math.PI * frequency * 2 * t) +
        0.25 * Math.sin(2 * Math.PI * frequency * 3 * t));
  }
}

/**
 * Раскладка ударов в долях, а не в индексах.
 *
 * Раньше восьмые отдавались индексами и потом умножались на длину доли,
 * из-за чего хэт «на восьмой» физически вставал на целую долю, а метка
 * «100 BPM» переставала соответствовать звуку. Позиции считаются сразу
 * в долях: index/2 для восьмых, index/4 для шестнадцатых.
 */
function hitsFor(pattern, beatInBar, bars) {
  const kicks = [];
  const snares = [];
  const hats = [];

  const eighth = (index) => index / 2;
  const sixteenth = (index) => index / 4;

  if (pattern === "straight") {
    if (beatInBar % 2 === 0) kicks.push(beatInBar);
    if (beatInBar % 4 === 1 || beatInBar % 4 === 3) snares.push(beatInBar);
    for (let index = beatInBar * 2; index < beatInBar * 2 + 2; index += 1) {
      hats.push({ at: eighth(index), swung: index % 2 === 1 });
    }
  } else if (pattern === "backbeat") {
    if (beatInBar % 4 === 0) kicks.push(beatInBar);
    if (beatInBar % 4 === 2) snares.push(beatInBar);
    for (let index = beatInBar * 2; index < beatInBar * 2 + 2; index += 1) {
      hats.push({ at: eighth(index), swung: index % 2 === 1 });
    }
  } else if (pattern === "busy") {
    if (beatInBar % 2 === 0 || beatInBar % 8 === 7) kicks.push(beatInBar);
    if (beatInBar % 4 === 1 || beatInBar % 4 === 3) snares.push(beatInBar);
    for (let index = beatInBar * 4; index < beatInBar * 4 + 4; index += 1) {
      // Свинг шестнадцатых не моделируем: он не нужен для проверки темпа,
      // а смешивание двух сеток делает эталон неоднозначным.
      hats.push({ at: sixteenth(index), swung: false });
    }
  } else {
    throw new Error(`неизвестная раскладка: ${pattern}`);
  }

  void bars;

  return { kicks, snares, hats };
}

export function renderBeat({
  bpm,
  seconds = 16,
  sampleRate = 44100,
  root = "F#",
  mode = "minor",
  pattern = "straight",
  swing = 0,
  bars = 4,
  seed = 12345,
}) {
  const out = new Float32Array(Math.round(seconds * sampleRate));
  const noise = seeded(seed);
  const secondsPerBeat = 60 / bpm;
  const rootSemitone = noteToSemitone(root, 2);
  const totalBeats = Math.floor(seconds / secondsPerBeat);

  // Свинг 0,24 означает пару 62/38: вторая доля сдвинута на 0,12 доли.
  const swingBeats = swing / 2;

  const at = (beatPosition) => Math.max(0, Math.round(beatPosition * secondsPerBeat * sampleRate));

  for (let beat = 0; beat < totalBeats; beat += 1) {
    const beatInBar = beat % bars;
    const { kicks, snares, hats } = hitsFor(pattern, beatInBar, bars);

    for (const position of kicks) kick(out, at(position), sampleRate);
    for (const position of snares) snare(out, at(position), sampleRate, noise);
    // Имя переменной не должно совпадать с именем функции hat: иначе
    // вызов внутри цикла разрешается в саму переменную.
    for (const placement of hats) {
      hat(out, at(placement.at + (swingBeats > 0 && placement.swung ? swingBeats : 0)), sampleRate, noise);
    }

    // Бас на основном тоне каждые два такта, пад — тоника с терцией и квинтой.
    if (beat % (bars * 2) === 0) {
      tone(out, at(beat), sampleRate, rootSemitone, secondsPerBeat * 2, 0.26);
    }

    if (beat % bars === 0) {
      const third = mode === "minor" ? MINOR_STEPS[2] : 4;
      tone(out, at(beat), sampleRate, rootSemitone + third, secondsPerBeat * bars * 0.9, 0.12);
      tone(out, at(beat), sampleRate, rootSemitone + 7, secondsPerBeat * bars * 0.9, 0.12);
    }
  }

  // Нормализация одинакова для всех фикстур: иначе громкость влияет на результат.
  let peak = 0;
  for (const value of out) peak = Math.max(peak, Math.abs(value));
  if (peak > 0) {
    for (let i = 0; i < out.length; i += 1) out[i] /= peak;
  }

  return out;
}
