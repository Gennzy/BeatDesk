/**
 * Раскладка клавиатуры для ролика.
 *
 * ---------------------------------------------------------------------------
 * ЗАЧЕМ
 *
 * Ролик с обложкой — заставка. Ролик, в котором нажимаются клавиши настоящей
 * мелодии, — инструмент продажи: тот, кто ищет тему, узнаёт её с первых
 * секунд и остаётся дослушать.
 *
 * ---------------------------------------------------------------------------
 * ПОЧЕМУ ОТДЕЛЬНЫЙ МОДУЛЬ
 *
 * Раскладка — чистая арифметика: какие клавиши попадают в кадр, где они
 * стоят, какая сейчас нажата. Она проверяется тестами, без canvas и без
 * браузера, а рисование остаётся тонким слоем поверх.
 */

import type { MidiNote } from "./midi";

/** Клавиша на клавиатуре. */
export type KeyLayout = {
  /** Номер ноты. */
  pitch: number;
  /** Левая граница, доля ширины клавиатуры от 0 до 1. */
  x: number;
  /** Ширина, доля ширины клавиатуры. */
  width: number;
  /** Чёрная клавиша: она узкая и стоит между белыми. */
  black: boolean;
};

/** Клавиши, на которых не может быть чёрных: между E–F и B–C. */
const BLACK_PITCH_CLASSES = new Set([1, 3, 6, 8, 10]);

export const isBlackKey = (pitch: number): boolean => BLACK_PITCH_CLASSES.has(((pitch % 12) + 12) % 12);

/** Ширина чёрной клавиши относительно белой. */
const BLACK_WIDTH = 0.62;

/**
 * Какие клавиши показать и где они стоят.
 *
 * Диапазон берётся из самой мелодии: показывать все 88 клавиш бессмысленно,
 * нажатые и неразличимы. Плюс запас по краям, чтобы мелодия не упиралась в
 * рамку.
 */
export function layoutKeyboard(notes: MidiNote[], padding = 2): { keys: KeyLayout[] } {
  if (notes.length === 0) return { keys: [] };

  let min = Infinity;
  let max = -Infinity;

  for (const note of notes) {
    min = Math.min(min, note.pitch);
    max = Math.max(max, note.pitch);
  }

  const from = min - padding;
  const to = max + padding;

  // Белых клавиш в диапазоне: считаем по-настоящему, а не делением, потому
  // что между E и F и между B и C чёрных нет.
  let whites = 0;

  for (let pitch = from; pitch <= to; pitch++) {
    if (!isBlackKey(pitch)) whites += 1;
  }

  if (whites === 0) return { keys: [] };

  const keys: KeyLayout[] = [];

  let whiteIndex = 0;

  for (let pitch = from; pitch <= to; pitch++) {
    if (isBlackKey(pitch)) {
      // Чёрная стоит на границе двух белых: её центр — это граница.
      const centre = whiteIndex / whites;

      keys.push({
        pitch,
        x: centre - (BLACK_WIDTH / whites) / 2,
        width: BLACK_WIDTH / whites,
        black: true,
      });
    } else {
      keys.push({ pitch, x: whiteIndex / whites, width: 1 / whites, black: false });
      whiteIndex += 1;
    }
  }

  return { keys };
}

/**
 * Какие ноты звучат в момент t.
 *
 * Нота звучит от своего начала до конца. В момент начала она уже звучит, а в
 * момент конца — ещё нет: иначе клавиша мигала бы на границе.
 */
export function activeNotesAt(notes: MidiNote[], time: number): MidiNote[] {
  return notes.filter((note) => time >= note.time && time < note.time + note.duration);
}

/**
 * Диапазон, который стоит показать целиком.
 *
 * Ноты в ролике идут непрерывно, и если клавиатура будет прыгать от такта к
 * такту, это выглядит как дёрганье. Поэтому диапазон считается один раз на
 * всю мелодию.
 */
export function pitchRange(notes: MidiNote[]): { from: number; to: number } | null {
  if (notes.length === 0) return null;

  let min = Infinity;
  let max = -Infinity;

  for (const note of notes) {
    min = Math.min(min, note.pitch);
    max = Math.max(max, note.pitch);
  }

  return { from: min, to: max };
}
