import { autocorrelation, median, normalize } from "./dsp";

/**
 * Темп по огибающей наступлений.
 *
 * Ключевой момент: битмейкеру нужен не просто темп, а темп вместе с
 * тем, где стоит сильная доля. «140 BPM» бесполезно для сведения сетки,
 * а «140,0, первая доля приходится на 0,25» позволяет поставить бит в
 * сетку и не гадать.
 */

export type OnsetTrack = {
  /** Огибающая наступлений, значения 0..1. */
  envelope: Float32Array;
  /** Сколько отсчётов огибающей в секунду. */
  rate: number;
  /**
   * На сколько кадров пик огибающей опережает само наступление.
   *
   * Окно спектра длиной size начинается за hop до текущего кадра, поэтому
   * всплеск появляется в том кадре, чьё окно впервые накрыло удар, — то
   * есть раньше его на (size - hop)/hop кадров. Для ударов это постоянная
   * поправка, и без неё сильная доля всегда смещена.
   */
  shift: number;
};

/**
 * Огибающая из спектрального потока.
 *
 * Шаг огибающей задаётся hop'ом, по которому считался поток, и больше
 * нигде не пересчитывается: все задержки считаются в отсчётах огибающей,
 * а в секунды переводятся по rate. Раньше шаг огибающей был зашит
 * отдельно от hop'а, и они разъезжались — удары попадали в самое начало.
 */
export function buildOnsetTrack(flux: Float32Array, size: number, hop: number, sampleRate: number): OnsetTrack {
  return {
    envelope: normalize(flux),
    rate: sampleRate / hop,
    shift: Math.max(0, (size - hop) / hop),
  };
}

export type Tempo = {
  /** Темп в ударах в минуту. 0 — определить не удалось. */
  bpm: number;
  /** Уверенность 0..1: насколько пик автокорреляции выше фона. */
  confidence: number;
  /**
   * Положение сильной доли в долях: 0 — ровно в начале отрезка,
   * 0.25 — четверть доли спустя. Это то, что нужно для сведения сетки.
   */
  downbeatOffset: number;
  /** Отличается ли темп от круглого числа настолько, что это стоит показать. */
  exact: boolean;
};

const MIN_BPM = 60;
/**
 * Верхняя граница с запасом сверх 200.
 *
 * Ровно 200 BPM — реальный предел для быстрых жанров, но погрешность в
 * доли BPM при округлении периода уводила estimate за 200, и коррекция
 * октавы отбрасывала правильный ответ как слишком быстрый.
 */
const MAX_BPM = 220;
/** Сглаживание огибающей перед подсчётом корреляции, секунды. */
const SMOOTHING_SECONDS = 0.06;
/**
 * Сколько трека берём для определения темпа.
 *
 * Темп в бите не меняется, а автокорреляция растёт квадратично по длине.
 * Минуты хватает за глаза и держат расчёт в пределах сотни миллисекунд.
 */
const TEMPO_WINDOW_SECONDS = 60;

/**
 * Ниже этого темпа допускается пунктирное прочтение сетки (3:2).
 *
 * Обоснование — в комментарии к правилу в detectTempo: на «Get Money»
 * множитель 1.5 даёт верные 166 из 110.6, на «Mimosa» из 130 он даёт
 * неверные 194.
 */
const DOTTED_FROM_BPM = 120;

/**
 * Приоритет темпов.
 *
 * Без него у бита 140 BPM находится сосед 70 с тем же периодом: ритм тот
 * же, но вдвое медленнее, и корреляция одинаковая. Логнормальный
 * приоритет выбирает диапазон, в котором музыка обычно живёт.
 */
function tempoWeight(bpm: number): number {
  if (bpm < MIN_BPM || bpm > MAX_BPM) return 0;

  const centered = Math.log2(bpm / 120);
  return Math.exp(-(centered * centered) / (2 * 0.9 * 0.9));
}

/**
 * Индексы локальных максимумов огибающей выше порога, слипшиеся объединены.
 *
 * Отдельная функция, потому что моменты ударов нужны не только темпу:
 * по ним считается свинг и рисуется сетка в интерфейсе.
 */
export function peaks(track: OnsetTrack, threshold: number, minDistance: number): number[] {
  const { envelope, rate } = track;
  const found: number[] = [];
  /*
   * Окно подавления — шириной с сам удар, а не с половину секунды.
   * Раньше оно равнялось 0,35 с, и удар на 200 BPM (интервал 0,3 с)
   * попадал внутрь окна предыдущего: если тот был громче, следующий
   * отбрасывался как «хвост», и половина ударов исчезала.
   */
  const windowSize = Math.max(2, Math.round(0.015 * rate));

  for (let i = 1; i < envelope.length - 1; i += 1) {
    const value = envelope[i]!;
    if (value < threshold) continue;
    if (value < envelope[i - 1]! || value < envelope[i + 1]!) continue;

    // Щёлчок и его хвост дают два пика рядом: оставляем сильнейший.
    let local = value;
    for (let j = Math.max(0, i - windowSize); j < Math.min(envelope.length, i + windowSize); j += 1) {
      if (envelope[j]! > local) local = envelope[j]!;
    }
    if (value < local * 0.999) continue;

    const last = found[found.length - 1];
    if (last !== undefined && i - last < minDistance) {
      if (envelope[last]! < value) found[found.length - 1] = i;
      continue;
    }

    found.push(i);
  }

  return found;
}

/**
 * Скользящее среднее по огибающей.
 *
 * Без него прореживание отсчётов работает как алиасинг: удары, у которых
 * период не кратен шагу прореживания, попадают то в выборку, то мимо, и
 * автокорреляция видит период вдвое длиннее настоящего. Сначала убираем
 * высокочастотные пики, потом можно считать без потерь.
 */
function smooth(values: Float32Array, width: number): Float32Array {
  if (width <= 1) return values;

  const out = new Float32Array(values.length);
  const half = Math.floor(width / 2);

  for (let i = 0; i < values.length; i += 1) {
    let sum = 0;
    let count = 0;

    for (let j = i - half; j <= i + half; j += 1) {
      if (j < 0 || j >= values.length) continue;
      sum += values[j]!;
      count += 1;
    }

    out[i] = count > 0 ? sum / count : 0;
  }

  return out;
}

/**
 * Субкадровая точность по вершине корреляции.
 *
 * Один кадр огибающей — около 6 миллисекунд, а при 140 BPM это сразу
 * ±2 BPM: округление до целого кадра дало бы «139,7» вместо «140,0».
 * Парабола, проведённая через три точки вокруг максимума, возвращает
 * вершину между кадрами и убирает эту погрешность.
 */
function refineLag(auto: Float32Array, lag: number): number {
  if (lag <= 0 || lag >= auto.length - 1) return lag;

  const left = auto[lag - 1]!;
  const center = auto[lag]!;
  const right = auto[lag + 1]!;

  const denominator = left - 2 * center + right;
  if (Math.abs(denominator) < 1e-9) return lag;

  const shift = (0.5 * (left - right)) / denominator;
  if (!Number.isFinite(shift) || Math.abs(shift) >= 1) return lag;

  return lag + shift;
}

/**
 * Насколько сильны удары, попавшие на сетку.
 *
 * Это то, что отличает 70 от 140 на бум-бэпе. Кик и снейр несут основную
 * энергию и стоят на долях, хэты слабее и стоят на восьмых. Значит у сетки
 * в 70 BPM средняя энергия ударов заметно выше, чем у сетки вдвое короче.
 *
 * Первый вариант сравнивал сетку с промежутками и оказался вырожденным:
 * между восьмыми тихо, поэтому удачно выглядела любая сетка с шагом в
 * восьмые. Сравнивать надо с абсолютной силой удара, а не с пустотой рядом.
 */
export function accentStrength(envelope: Float32Array, lagInFrames: number): number {
  if (lagInFrames < 4) return 0;

  const anchor = strongestOnset(envelope);
  const last = envelope.length - 1;
  const values: number[] = [];

  for (let step = 0; ; step += 1) {
    const on = anchor + step * lagInFrames;
    if (on > last) break;

    // Берём максимум в узком окне вокруг позиции: удар занимает
    // несколько кадров огибающей, а не один.
    let best = 0;
    for (let offset = -1; offset <= 2; offset += 1) {
      const at = on + offset;
      if (at < 0 || at > last) continue;
      best = Math.max(best, envelope[at]!);
    }
    values.push(best);
  }

  if (values.length < 4) return 0;

  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;

  // Нормируем на громкость самой сильной части трека: удар в тихом бите
  // и в громком — один и тот же ритм, а абсолютные значения разные.
  const sorted = Float32Array.from(envelope).sort();
  const ceiling = sorted[Math.floor(sorted.length * 0.98)] || 1;

  return Math.max(0, Math.min(1, mean / ceiling));
}

function strongestOnset(envelope: Float32Array): number {
  let best = 0;

  for (let i = 1; i < envelope.length; i += 1) {
    if (envelope[i]! > envelope[best]!) best = i;
  }

  return best;
}

export function detectTempo(track: OnsetTrack): Tempo {
  const { envelope, rate } = track;
  const nothing: Tempo = { bpm: 0, confidence: 0, downbeatOffset: 0, exact: false };

  if (envelope.length / rate < 1.5 || envelope.length < 16) return nothing;

  const windowLength = Math.min(envelope.length, Math.round(TEMPO_WINDOW_SECONDS * rate));
  const smoothed = smooth(envelope.subarray(0, windowLength), Math.max(1, Math.round(SMOOTHING_SECONDS * rate)));

  const maxLag = Math.min(smoothed.length - 1, Math.floor((60 / MIN_BPM) * rate));
  const auto = autocorrelation(smoothed, maxLag);

  let bestLag = 0;
  let bestScore = 0;

  for (let lag = 1; lag < auto.length; lag += 1) {
    const bpm = (60 * rate) / lag;
    const weight = tempoWeight(bpm);
    if (weight <= 0) continue;

    const score = Math.max(0, auto[lag]!) * weight;
    if (score > bestScore) {
      bestScore = score;
      bestLag = lag;
    }
  }

  if (bestLag === 0) return nothing;

  let chosenLag = refineLag(auto, bestLag);

  /*
   * Метрическая путаница темпа.
   *
   * Одна и та же сетка читается с разных уровней. Ровно пополам и ровно
   * втрое — это одно и то же бит, просто посчитанное быстрее или медленнее,
   * и жанровый диапазон их не различает: у клика на 174 BPM корреляция
   * высока и на доле, и на её половине.
   *
   * Третий случай — пунктирный, отношение 3:2. На настоящем бите Get Money
   * заявлено 166 BPM, а детектор давал 110.6 — ровно две трети. Это сетка с
   * пунктирной фигурой, и она встречается в трапе постоянно; раньше такой
   * уровень просто не рассматривался, поэтому заявленный темп не
   * сходился с измеренным и битмейкер получал ложную претензию.
   *
   * Проверяются все три уровня, и берётся тот, у которого корреляция
   * сопоставима с исходным. Порог тот же, что и раньше: он не точный, но
   * на материале стенда даёт верный ответ и там, где раньше давал сбой.
   *
   * Минус тот же, что был всегда: регулятор склонен занижать темп вдвое,
   * потому что в медленных жанрах это правдоподобнее быстрого. Поэтому он
   * отвечает за предварительную догадку, а решение о публикации принимает
   * слой продукта.
   */
  for (const factor of [2, 3, 1.5]) {
    // Лаг умножается на 1/factor: чем меньше lag, тем быстрее темп.
    const candidate = factor >= 2 ? chosenLag / factor : chosenLag * (2 / 3);
    if (candidate < 4) continue;

    /*
     * Пунктирное прочтение допустимо только из медленной зоны.
     *
     * Проверено на двух настоящих битах площадки. «Get Money»: заявлено
     * 166, сетка читалась как 110.6 — ровно две трети, и множитель 1.5
     * даёт верный ответ. «Mimosa»: заявлено 130, и тот же множитель
     * превратил верные 130 в 194. Разница — в исходном темпе: 110 уже
     * глубоко в медленной зоне, где пунктир и правда вероятен, а 130 — это
     * обычный ровный бит, который читается прямо, и ускорять его в полтора
     * раза незачем.
     *
     * Поэтому правило не «перемножай всегда», а «перемножай, только если
     * мы уже медленные». Порог — не вкусовое число, а граница, за которой
     * другой прочтений просто не бывает.
     */
    if (factor === 1.5 && (60 * rate) / chosenLag >= DOTTED_FROM_BPM) continue;

    const bpmCandidate = (60 * rate) / candidate;
    if (bpmCandidate > MAX_BPM || bpmCandidate < MIN_BPM) continue;

    const candidateScore = Math.max(0, auto[Math.round(candidate)] ?? 0);
    const chosenScore = Math.max(0, auto[Math.round(chosenLag)] ?? 0);
    if (candidateScore >= chosenScore * 0.5) chosenLag = candidate;
  }

  if (chosenLag === 0) return nothing;

  chosenLag = refineLag(auto, Math.round(chosenLag));
  const bpm = (60 * rate) / chosenLag;

  // Уверенность: во сколько раз пик выделяется на фоне задержек рядом.
  const peak = auto[Math.round(chosenLag)] ?? 0;
  const neighbours: number[] = [];
  for (let lag = Math.floor(chosenLag * 0.6); lag <= Math.ceil(chosenLag * 1.5); lag += 1) {
    if (Math.abs(lag - chosenLag) <= 2) continue;
    neighbours.push(auto[lag]!);
  }
  const floor = median(neighbours);
  const confidence = peak > 0 ? Math.max(0, Math.min(1, (peak - floor) / peak)) : 0;

  const secondsPerBeat = 60 / bpm;
  const stepPerBeat = secondsPerBeat * rate;

  return {
    bpm,
    confidence,
    downbeatOffset: downbeatOffset(track, stepPerBeat),
    exact: Math.abs(bpm - Math.round(bpm)) < 0.05,
  };
}

/**
 * Положение сильной доли в долях от начала файла.
 *
 * Ориентир — самый громкий удар: он ближе всего к сильной доле, и на
 * реальном бите первый удар как раз самый слабый (окно спектра начинается
 * на самом начале файла и половина удара в него не попадает). Фаза
 * берётся от него по модулю длины доли.
 */
function downbeatOffset(track: OnsetTrack, stepPerBeat: number): number {
  const hits = peaks(track, Math.max(0.12, median(track.envelope) * 2), Math.max(2, Math.round(stepPerBeat * 0.4)));

  if (hits.length < 4 || stepPerBeat <= 0) return 0;

  let strongest = hits[0]!;
  for (const hit of hits) {
    if (track.envelope[hit]! > track.envelope[strongest]!) strongest = hit;
  }

  const onsetFrame = strongest + track.shift;
  const phase = (onsetFrame / stepPerBeat) % 1;
  let normalized = ((phase % 1) + 1) % 1;

  // Фаза 0,999 — это ноль, просто накопленная погрешность деления.
  // Без этого каждая ровная сетка показывала бы сдвиг почти в целую долю.
  if (normalized > 0.99) normalized = 0;
  if (normalized < 0.01) normalized = 0;

  return Number(normalized.toFixed(3));
}

export type Swing = {
  /** Доля длинной доли в паре: ровно 0.5 у прямого ритма. */
  amount: number | null;
  /** Насколько ритм размыт: 0 — ровно, 1 — предельный свинг. */
  amountRatio: number | null;
};

/**
 * Свинг по интервалам между ударами.
 *
 * На прямом бите интервалы одинаковые. На свинге они чередуются: короткий
 * и длинный, и вместе дают ровно две доли.
 *
 * Размыты могут быть не только восьмые, поэтому размер доли подбирается:
 * берём тот, при котором соседние интервалы складываются в круглое число
 * долей. Иначе свинг не находится вовсе — раньше искали только по
 * четвертям, а размывка живёт на восьмых.
 */
export function detectSwing(track: OnsetTrack, bpm: number): Swing {
  const nothing: Swing = { amount: null, amountRatio: null };
  if (bpm <= 0) return nothing;

  const secondsPerBeat = 60 / bpm;
  // Число долей в такте: 16-е, 8-е и целые.
  const divisions = [4, 2, 1];

  for (const division of divisions) {
    const stepInFrames = (secondsPerBeat / division) * track.rate;
    if (stepInFrames < 3) continue;

    const hits = peaks(
      track,
      Math.max(0.12, median(track.envelope) * 2),
      Math.max(2, Math.round(stepInFrames * 0.4)),
    );
    if (hits.length < 8) continue;

    const intervals: number[] = [];
    for (let i = 1; i < hits.length; i += 1) {
      const interval = hits[i]! - hits[i - 1]!;
      // Соседние доли одного такта — короче одной целой доли с запасом.
      if (interval < stepInFrames * 1.6) intervals.push(interval);
    }

    if (intervals.length < 4) continue;

    const short = Math.min(...intervals);
    const long = Math.max(...intervals);

    // Пара обязана складываться в две ровные доли. Иначе это не свинг,
    // а неровный ритм или полиритмия, и называть её свингом неправильно.
    const steps = (short + long) / stepInFrames;
    if (Math.abs(steps - 2) > 0.35) continue;

    const amount = long / (short + long);
    if (amount <= 0.56) continue;

    return { amount, amountRatio: (amount - 0.5) * 2 };
  }

  return nothing;
}
