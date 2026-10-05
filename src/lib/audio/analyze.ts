import { spectralFlux, toMono } from "./dsp";
import { detectKeyWithEssentia } from "./essentia";
import { chroma, detectKey, type KeyResult } from "./key";
import { buildOnsetTrack, detectSwing, detectTempo, type Swing, type Tempo } from "./tempo";

/**
 * Разбор аудиофайла целиком, в браузере.
 *
 * Считает всё локально: незаконченный бит не покидает машину, результат
 * появляется мгновенно, а счёт за анализ не идёт. Плата — точность:
 * инструмент показывает её честно, уверенностью и кандидатами, а не
 * громким утверждением.
 */

export const SPECTRUM_SIZE = 1024;
export const SPECTRUM_HOP = 256;
/** Окно хромы: чем больше, тем точнее низкие тона, но медленнее расчёт. */
const CHROMA_SIZE = 4096;

export type Analysis = {
  tempo: Tempo;
  swing: Swing;
  key: KeyResult | null;
  /** Откуда взята тональность: эталонный алгоритм или наш запасной код. */
  keySource: "essentia" | "own" | null;
  /** Длительность в секундах — чтобы показать, что файл вообще разобран. */
  duration: number;
};

export function analyzeChannels(channels: Float32Array[], sampleRate: number): Analysis {
  const mono = toMono(channels);

  if (mono.length < sampleRate) {
    // Короче секунды темп и тональность не определяются: детектор не имел бы
    // на что смотреть и выдумал бы ответ.
    return {
      tempo: { bpm: 0, confidence: 0, downbeatOffset: 0, exact: false },
      swing: { amount: null, amountRatio: null },
      key: null,
      keySource: null,
      duration: mono.length / sampleRate,
    };
  }

  const flux = spectralFlux(mono, SPECTRUM_SIZE, SPECTRUM_HOP);
  const track = buildOnsetTrack(flux, SPECTRUM_SIZE, SPECTRUM_HOP, sampleRate);

  const tempo = detectTempo(track);

  const key = detectKey(chroma(mono, sampleRate, CHROMA_SIZE));

  return {
    tempo,
    swing: detectSwing(track, tempo.bpm),
    key,
    keySource: key ? "own" : null,
    duration: mono.length / sampleRate,
  };
}

/**
 * Разбор для студии: тональность уточняется эталонным алгоритмом.
 *
 * Темп и свинг остаются нашими — на настоящем материале они попадают
 * точнее. А тональность наш код на бите промахивался на четыре полутона,
 * поэтому её считает Essentia, а наш результат уходит в кандидаты: он
 * честно показывает, что ещё рассматривалось, но ответом выдаётся не он.
 */
export async function analyzeForStudio(channels: Float32Array[], sampleRate: number): Promise<Analysis> {
  const base = analyzeChannels(channels, sampleRate);
  if (base.duration < 1.5) return base;

  const mono = toMono(channels);
  const measured = await detectKeyWithEssentia(mono, sampleRate);
  if (!measured) return base;

  const previous = base.key;
  const [note, mode] = measured.key.split(" ") as [string, string];

  return {
    ...base,
    key: {
      key: measured.key,
      short: `${note}${mode === "minor" ? "m" : ""}`,
      confidence: measured.strength,
      // Кандидаты нашего анализа оставляем: они показывают, что кроме
      // победителя рассматривались и другие тональности.
      candidates: previous?.candidates ?? [{ key: measured.key, score: measured.strength }],
    },
    keySource: "essentia",
  };
}

/** Темп одной строкой: «140,0 BPM» или «—», если определить не удалось. */
export function formatTempo(tempo: Tempo): string {
  return tempo.bpm > 0 ? `${tempo.bpm.toFixed(1)} BPM` : "—";
}

/** Сдвиг сильной доли в человекочитаемом виде: «0,25 доли». */
export function formatDownbeat(tempo: Tempo): string {
  if (tempo.bpm <= 0) return "—";

  // Фаза около единицы — это ноль, просто накопленная погрешность деления.
  // Без такой свертки почти-целая доля показывалась бы как 0,75.
  const raw = tempo.downbeatOffset > 0.99 || tempo.downbeatOffset < 0.01 ? 0 : tempo.downbeatOffset;

  const beats = [0, 0.25, 0.5, 0.75];
  const nearest = beats.reduce((best, beat) =>
    Math.abs(beat - raw) < Math.abs(best - raw) ? beat : best,
  );

  const fraction = nearest === 0 ? "в начале" : `на ${nearest.toLocaleString("ru-RU")} доли`;
  const seconds = (nearest * 60) / tempo.bpm;

  return `${fraction} (${seconds.toFixed(3).replace(".", ",")} с)`;
}