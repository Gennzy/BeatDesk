/**
 * Поиск бита внутри трека.
 *
 * ---------------------------------------------------------------------------
 * ПОЧЕМУ ЭТО СЛОЖНО
 *
 * Бит — не трек. В треке он играет с середины, под вокалом, с другой
 * аранжировкой. Отпечаток бита и отпечаток трепа не совпадают никогда, и
 * наивное сравнение «первых тридцати секунд» не найдёт ничего — даже если
 * бит в треке есть.
 *
 * Поэтому сравнение ищет **смещение**: берёт отпечаток бита и прикладывает
 * его к трепу в разных местах, ища положение, при котором совпадений больше
 * всего.
 *
 * ---------------------------------------------------------------------------
 * ЧТО ЭТО ДАЁТ И ЧТО НЕ ДАЁТ
 *
 * Даёт: кандидаты. Трек, в котором наш бит играет полторы минуты, будет
 * найден, даже если он начинается на 0:37.
 *
 * Не даёт: доказательства. Совпадение отпечатков означает «очень похоже»,
 * а не «это тот самый бит». Отчёт обязан это говорить, иначе мы будем
 * обвинять артистов на основании сходства.
 */

import { BYTES_PER_WINDOW } from "@/lib/audio/fingerprint";

/** Насколько близко, чтобы считать находкой. */
export const MATCH_THRESHOLD = 0.7;

/** Шаг, с которым перебираются смещения. */
const STEP_WINDOWS = 2;

/**
 * Лучшее совпадение отпечатка бита в отпечатке трека.
 *
 * Возвращает долю совпавших окон и смещение, при котором оно достигнуто.
 * Смещение считается окнами: 1 — это 50 мс.
 */
export function align(reference: string, candidate: string): { match: number; offset: number } {
  const ref = decode(reference);
  const cand = decode(candidate);

  return bestAlignment(ref, cand);
}

/** Распаковка отпечатка из строки. */
function decode(value: string): Uint8Array {
  if (!value) return new Uint8Array(0);

  try {
    const raw = atob(value);
    const out = new Uint8Array(raw.length);

    for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);

    return out;
  } catch {
    return new Uint8Array(0);
  }
}

function bestAlignment(reference: Uint8Array, candidate: Uint8Array): { match: number; offset: number } {
  const refWindows = Math.floor(reference.length / BYTES_PER_WINDOW);
  const candWindows = Math.floor(candidate.length / BYTES_PER_WINDOW);

  if (refWindows === 0 || candWindows === 0) return { match: 0, offset: 0 };

  // Длинный кусок ищем целиком, короткий — прикладываем в разных местах.
  const span = Math.min(refWindows, candWindows);

  let best = { match: 0, offset: 0 };

  for (let offset = 0; offset + span <= candWindows; offset += STEP_WINDOWS) {
    const match = matchAt(reference, candidate, offset, span);

    if (match > best.match) best = { match, offset };
  }

  return best;
}

/**
 * Совпадение при одном смещении.
 *
 * Окно считается совпавшим, если признаки рядом: пережимание слегка двигает
 * уровень, и точное совпадение терялось бы на ровном сигнале.
 */
function matchAt(reference: Uint8Array, candidate: Uint8Array, offset: number, span: number): number {
  let same = 0;

  for (let w = 0; w < span; w++) {
    const refIndex = w * BYTES_PER_WINDOW;
    const candIndex = (offset + w) * BYTES_PER_WINDOW;

    const levelClose = Math.abs(reference[refIndex] - candidate[candIndex]) <= 1;
    const toneClose = Math.abs(reference[refIndex + 1] - candidate[candIndex + 1]) <= 2;

    if (levelClose && toneClose) same += 1;
  }

  return same / span;
}

/**
 * Насколько треп похож на бит.
 *
 * Смещение ищется по всей длине трека, но совпадение считается только по
 * длине бита: иначе треп из трёх минут «похож» на двухсекундный бит целиком.
 */
export function matchBeat(reference: string, candidate: string): { match: number; offset: number } {
  return align(reference, candidate);
}

/** Находка ли это. */
export function isMatch(match: number, threshold = MATCH_THRESHOLD): boolean {
  return match >= threshold;
}
