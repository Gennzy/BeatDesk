import { describe, expect, it } from "vitest";

import { activeNotesAt, isBlackKey, layoutKeyboard, pitchRange } from "./keyboard";
import type { MidiNote } from "./midi";

/**
 * Клавиатура в ролике.
 *
 * Проверяется арифметика: где стоят клавиши, какая нажата, что попадает в
 * кадр. Рисование поверх этого — тонкий слой, и ошибаться в нём нельзя.
 */

const note = (pitch: number, time = 0, duration = 0.5): MidiNote => ({
  pitch,
  time,
  duration,
  velocity: 0.8,
  track: 0,
});

describe("чёрные и белые клавиши", () => {
  it("чёрные — это промежутки между белыми", () => {
    expect(isBlackKey(60)).toBe(false); // C
    expect(isBlackKey(61)).toBe(true); // C#
    expect(isBlackKey(62)).toBe(false); // D
    expect(isBlackKey(64)).toBe(false); // E
    expect(isBlackKey(66)).toBe(true); // F#
    expect(isBlackKey(69)).toBe(false); // A
  });

  it("октава не влияет", () => {
    expect(isBlackKey(61)).toBe(isBlackKey(73));
    expect(isBlackKey(60)).toBe(isBlackKey(72));
  });
});

describe("раскладка клавиатуры", () => {
  it("пустая мелодия не даёт клавиш", () => {
    expect(layoutKeyboard([]).keys).toHaveLength(0);
  });

  it("белые клавиши стоят подряд и занимают всю ширину", () => {
    const { keys } = layoutKeyboard([note(60), note(62), note(64)]);

    const whites = keys.filter((key) => !key.black);

    expect(whites.length).toBeGreaterThanOrEqual(3);
    expect(whites[0].x).toBe(0);
    // Последняя белая клавиша кончается ровно на правом краю.
    const last = whites[whites.length - 1];
    expect(last.x + last.width).toBeCloseTo(1, 5);
  });

  it("чёрная клавиша стоит на границе соседних белых", () => {
    const { keys } = layoutKeyboard([note(60), note(61), note(62)]);

    const black = keys.find((key) => key.black);

    expect(black).toBeDefined();

    const whites = keys.filter((key) => !key.black);
    const before = whites.filter((key) => key.pitch < (black as { pitch: number }).pitch);
    const boundary = before.length / whites.length;

    // Центр чёрной клавиши совпадает с границей между белыми — иначе она
    // нависает над одной из них и выглядит сдвинутой.
    expect((black as { x: number }).x + (black as { width: number }).width / 2).toBeCloseTo(boundary, 5);
  });

  it("чёрная клавиша уже белой", () => {
    const { keys } = layoutKeyboard([note(60), note(61)]);

    const white = keys.find((key) => !key.black);
    const black = keys.find((key) => key.black);

    expect((black as { width: number }).width).toBeLessThan((white as { width: number }).width);
  });

  it("диапазон берётся из мелодии с запасом", () => {
    const { keys } = layoutKeyboard([note(60), note(64)], 2);

    expect(keys[0].pitch).toBe(58);
    expect(keys[keys.length - 1].pitch).toBe(66);
  });

  it("клавиши идут по высоте", () => {
    const { keys } = layoutKeyboard([note(60), note(72)]);

    for (let i = 1; i < keys.length; i++) {
      expect(keys[i].pitch).toBeGreaterThan(keys[i - 1].pitch);
    }
  });
});

describe("нажатые ноты", () => {
  const notes = [note(60, 0, 1), note(64, 1, 1)];

  it("в момент начала нота уже звучит", () => {
    expect(activeNotesAt(notes, 0)).toHaveLength(1);
  });

  it("в момент конца нота уже не звучит", () => {
    // Иначе клавиша мигала бы на границе: звук кончился, а кадр ещё горит.
    expect(activeNotesAt(notes, 1)).toHaveLength(1);
    expect(activeNotesAt(notes, 1)[0].pitch).toBe(64);
  });

  it("в паузе не звучит ничего", () => {
    expect(activeNotesAt(notes, 0.5)).toHaveLength(1);
    expect(activeNotesAt(notes, 2)).toHaveLength(0);
  });

  it("несколько нот одновременно — это аккорд", () => {
    const chord = [note(60, 0, 1), note(64, 0, 1), note(67, 0, 1)];

    expect(activeNotesAt(chord, 0.2)).toHaveLength(3);
  });
});

describe("диапазон мелодии", () => {
  it("пустая мелодия не даёт диапазона", () => {
    expect(pitchRange([])).toBeNull();
  });

  it("берёт самую низкую и самую высокую", () => {
    expect(pitchRange([note(60), note(72), note(64)])).toEqual({ from: 60, to: 72 });
  });
});
