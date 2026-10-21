/**
 * Отпечаток аудио.
 *
 * ---------------------------------------------------------------------------
 * ЗАЧЕМ
 *
 * Бит скачивают бесплатно, а потом выкладывают трек на площадки. Битмейкер
 * узнаёт об этом поздно и не знает, кто именно слил.
 *
 * Единственный способ узнать — измерить, чей это файл. Платформы пережимают
 * и перекодируют загруженный трек, поэтому встроенная метка в метаданных
 * (ID3) не выживает: YouTube и SoundCloud вырезают теги при перекодировке.
 * Выживает только сама форма звука.
 *
 * Поэтому отпечаток — это огибающая громкости, разбитая на короткие окна и
 * квантованная в грубые шаги. Пережимание меняет абсолютные значения, но не
 * форму огибающей: бит, перекодированный в AAC, остаётся узнаваемым.
 *
 * ---------------------------------------------------------------------------
 * ЧТО ЭТО НЕ ОДНОЗНАЧНО
 *
 * Огибающая намеренно грубая: она различает «тот же трек», а не «тот же
 * ритм». Два разных бита с одинаковой структурой дадут похожий отпечаток, и
 * поэтому совпадение — это повод для разговора, а не приговор.
 *
 * Точность поднимается сравнением: у отпечатка хранится не только хэш, но и
 * сами квантованные окна, и тогда можно посчитать, насколько близки два
 * файла, а не просто совпали ли.
 */

/** Окно огибающей в миллисекундах. */
export const WINDOW_MS = 50;

/** Сколько окон берём: достаточно для узнавания, мало для объёма. */
export const MAX_WINDOWS = 600;

/** Уровней квантования: 4 бита на признак. */
export const LEVELS = 16;

/** Сколько байт занимает одно окно: громкость и частота. */
export const BYTES_PER_WINDOW = 2;

/**
 * Огибающая громкости и частоты, квантованная.
 *
 * ---------------------------------------------------------------------------
 * ПОЧЕМУ ДВА ПРИЗНАКА, А НЕ ОДИН
 *
 * Одной громкости мало. Два разных трека с одинаковой ритмической схемой
 * дают одинаковую огибающую: тот же бит, тот же малый барабан, только
 * мелодия другая. Отпечаток сказал бы «тот же трек», и защита от кражи
 * обвинила бы невиновного.
 *
 * Поэтому вторым признаком идёт плотность смены знака: она отражает
 * тембр. У малого барабана она высокая, у бочки низкая, у скрипки средняя.
 * Ровно то, что отличает один бит от другого при одинаковом ритме.
 *
 * Пережимание это переживает: смена знака зависит от частотного состава, а
 * он при перекодировании меняется куда меньше, чем абсолютные уровни.
 *
 * ---------------------------------------------------------------------------
 * ФОРМАТ
 *
 * На окно два байта: первый — уровень громкости, второй — плотность смены
 * знака. Окна разной длины сравниваются по общему началу.
 */
export function envelopeOf(samples: Float32Array, sampleRate: number): Uint8Array {
  if (samples.length === 0 || sampleRate <= 0) return new Uint8Array(0);

  const windowSize = Math.max(2, Math.floor((sampleRate * WINDOW_MS) / 1000));
  const count = Math.min(MAX_WINDOWS, Math.floor(samples.length / windowSize));

  if (count === 0) return new Uint8Array(0);

  const out = new Uint8Array(count * BYTES_PER_WINDOW);

  // Максимум считается по всему сигналу, а не по окну: иначе тихий бит дал бы
  // такую же огибающую, как громкий, и любой отпечаток совпадал бы со
  // всеми.
  let peak = 0;

  for (let i = 0; i < samples.length; i++) {
    const value = Math.abs(samples[i]);
    if (value > peak) peak = value;
  }

  if (peak === 0) return out;

  for (let w = 0; w < count; w++) {
    const start = w * windowSize;
    let sum = 0;
    let crossings = 0;
    let previousSign = 0;

    for (let i = start; i < start + windowSize; i++) {
      const value = samples[i];

      sum += value * value;

      const sign = value >= 0 ? 1 : -1;

      if (previousSign !== 0 && sign !== previousSign) crossings += 1;

      previousSign = sign;
    }

    const rms = Math.sqrt(sum / windowSize) / peak;
    const zcr = crossings / windowSize;

    out[w * BYTES_PER_WINDOW] = Math.round(Math.min(1, rms) * (LEVELS - 1));
    out[w * BYTES_PER_WINDOW + 1] = Math.round(Math.min(1, zcr) * (LEVELS - 1));
  }

  return out;
}

/** Байты в виде строки: так их удобно хранить в базе. */
export function encodeEnvelope(envelope: Uint8Array): string {
  let out = "";

  for (const value of envelope) out += String.fromCharCode(value);

  return btoa(out);
}

/** Обратное к encodeEnvelope. */
export function decodeEnvelope(value: string): Uint8Array {
  const raw = atob(value);
  const out = new Uint8Array(raw.length);

  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);

  return out;
}

/**
 * Насколько похожи два отпечатка, от 0 до 1.
 *
 * Считается доля совпавших окон. Окна разной длины сравниваются по общему
 * началу: без этого отпечаток короткого трека и длинного никогда не совпали бы
 * даже если это один и тот же ритм.
 *
 * Учитываются оба признака окна: и громкость, и тембр. Совпала громкость, но
 * разный тембр — это разные треки, и такой отпечаток совпасть не должен.
 */
export function similarity(a: Uint8Array, b: Uint8Array): number {
  const windows = Math.min(Math.floor(a.length / BYTES_PER_WINDOW), Math.floor(b.length / BYTES_PER_WINDOW));

  if (windows === 0) return 0;

  let same = 0;

  for (let w = 0; w < windows; w++) {
    const levelA = a[w * BYTES_PER_WINDOW];
    const levelB = b[w * BYTES_PER_WINDOW];
    const toneA = a[w * BYTES_PER_WINDOW + 1];
    const toneB = b[w * BYTES_PER_WINDOW + 1];

    // Окно считается совпавшим, если признаки рядом: пережимание слегка
    // сдвигает уровень, и точное совпадение терялось бы на ровном сигнале.
    const levelClose = Math.abs(levelA - levelB) <= 1;
    const toneClose = Math.abs(toneA - toneB) <= 2;

    if (levelClose && toneClose) same += 1;
  }

  return same / windows;
}

/**
 * Один и тот же файл или нет.
 *
 * Порог 0.9: у одного и того же трека после пережимания совпадает почти всё,
 * а у разных треков в одном жанре — меньше половины окон.
 */
export const SAME_THRESHOLD = 0.9;

/** Разные ли это файлы. */
export function isSameBeat(a: Uint8Array, b: Uint8Array): boolean {
  return similarity(a, b) >= SAME_THRESHOLD;
}
