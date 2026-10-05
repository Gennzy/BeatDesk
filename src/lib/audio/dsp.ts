/**
 * Базовая цифровая обработка для инструментов студии.
 *
 * Здесь только математика, без браузера: функции принимают и возвращают
 * обычные массивы чисел. Благодаря этому их можно проверить на
 * синтезированном сигнале с заранее известным ответом — а не «посмотреть,
 * что нарисовлось в браузере».
 */

/** Окно Ханна. Съедает края спектра, зато убирает утечку между тонами. */
export function hann(size: number): Float32Array {
  const window = new Float32Array(size);

  for (let i = 0; i < size; i += 1) {
    window[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (size - 1)));
  }

  return window;
}

/**
 * FFT по схеме Cooley–Tukey с переворачиванием битов, размер — степень двойки.
 *
 * Реальный вход не используется сознательно: на синтезированном сигнале
 * спектр удобнее считать из вещественной части, а комплексная реализация
 * нужна для окон и перемножения.
 */
export function fft(re: Float32Array, im: Float32Array): void {
  const n = re.length;
  if (n !== im.length) throw new Error("FFT: реальная и мнимая части разной длины");
  if (n === 0 || (n & (n - 1)) !== 0) throw new Error(`FFT: размер ${n} не степень двойки`);

  // перестановка битов
  for (let i = 1, j = 0; i < n; i += 1) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;

    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }

  for (let length = 2; length <= n; length <<= 1) {
    const angle = (-2 * Math.PI) / length;
    const stepRe = Math.cos(angle);
    const stepIm = Math.sin(angle);

    for (let start = 0; start < n; start += length) {
      let wr = 1;
      let wi = 0;

      for (let k = 0; k < length / 2; k += 1) {
        const a = start + k;
        const b = a + length / 2;

        const tr = re[b] * wr - im[b] * wi;
        const ti = re[b] * wi + im[b] * wr;

        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;

        const nextWr = wr * stepRe - wi * stepIm;
        wi = wr * stepIm + wi * stepRe;
        wr = nextWr;
      }
    }
  }
}

/** Амплитудный спектр: только первые n/2+1 bins. */
export function magnitude(samples: Float32Array, size = 1024): Float32Array {
  if (samples.length < size) throw new Error(`Спектр: нужно ${size} отсчётов, есть ${samples.length}`);

  const window = hann(size);
  const half = size / 2 + 1;
  const out = new Float32Array(half);

  const re = new Float32Array(size);
  const im = new Float32Array(size);

  for (let frame = 0; frame * size < samples.length; frame += 1) {
    const offset = frame * size;
    for (let i = 0; i < size; i += 1) {
      re[i] = (samples[offset + i] ?? 0) * window[i];
    }
    im.fill(0);
    fft(re, im);

    for (let bin = 0; bin < half; bin += 1) {
      out[bin] += Math.hypot(re[bin], im[bin]);
    }
  }

  return out;
}

/**
 * Спектральный поток: сумма положительных приращений между кадрами.
 *
 * Рост энергии в любом бине означает новый удар, затухание — нет. Именно
 * положительная часть отличает удар от хвоста предыдущей ноты.
 */
export function spectralFlux(samples: Float32Array, size = 1024, hop = 512): Float32Array {
  if (samples.length < size) return new Float32Array(0);

  const half = size / 2 + 1;
  const frames = Math.floor((samples.length - size) / hop) + 1;
  const flux = new Float32Array(frames);

  const window = hann(size);
  const re = new Float32Array(size);
  const im = new Float32Array(size);
  const previous = new Float32Array(half);

  for (let frame = 0; frame < frames; frame += 1) {
    const offset = frame * hop;

    for (let i = 0; i < size; i += 1) re[i] = (samples[offset + i] ?? 0) * window[i];
    im.fill(0);
    fft(re, im);

    let sum = 0;
    for (let bin = 0; bin < half; bin += 1) {
      const value = Math.hypot(re[bin], im[bin]);
      // Log-компрессия: иначе бас целиком перекрывает удар кикнура.
      const magnitudeValue = Math.log1p(1000 * value);
      const difference = magnitudeValue - previous[bin];
      if (difference > 0) sum += difference;
      previous[bin] = magnitudeValue;
    }

    flux[frame] = sum;
  }

  return flux;
}

/** Нормализация в 0..1: дальше все пороги ставятся в этих единицах. */
export function normalize(values: Float32Array): Float32Array {
  let min = Infinity;
  let max = -Infinity;

  for (const value of values) {
    if (value < min) min = value;
    if (value > max) max = value;
  }

  const out = new Float32Array(values.length);
  const span = max - min;
  if (span <= 0) return out;

  for (let i = 0; i < values.length; i += 1) {
    out[i] = (values[i] - min) / span;
  }

  return out;
}

/** Медиана. Порог по медиане устойчивее среднего: один щелчок не сдвигает. */
export function median(values: ArrayLike<number>): number {
  if (values.length === 0) return 0;

  const sorted = Array.from(values as ArrayLike<number>).sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  return sorted.length % 2 === 1 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

/**
 * Нормированная автокорреляция с ограничением по задержке.
 *
 * Возвращает массив длиной maxLag, где элемент — насколько сигнал похож
 * сам на себя со сдвигом на это число отсчётов.
 */
export function autocorrelation(values: Float32Array, maxLag: number): Float32Array {
  const n = values.length;
  const out = new Float32Array(maxLag);
  if (n === 0 || maxLag <= 0) return out;

  let energy = 0;
  for (let i = 0; i < n; i += 1) energy += values[i]! * values[i]!;
  if (energy <= 0) return out;

  for (let lag = 0; lag < maxLag; lag += 1) {
    let sum = 0;
    for (let i = 0; i < n - lag; i += 1) sum += values[i]! * values[i + lag]!;
    out[lag] = sum / energy;
  }

  return out;
}

/**
 * Сведение каналов в один массив.
 *
 * Анализировать надо моно: удар в левом канале и в правом — один удар, а не
 * два, иначе темп удвоится.
 */
export function toMono(channels: Float32Array[]): Float32Array {
  if (channels.length === 0) return new Float32Array(0);
  if (channels.length === 1) return channels[0]!;

  const length = channels[0]!.length;
  const out = new Float32Array(length);

  for (const channel of channels) {
    for (let i = 0; i < length; i += 1) out[i]! += channel[i]! / channels.length;
  }

  return out;
}