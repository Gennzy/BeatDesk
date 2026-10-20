import { describe, expect, it } from "vitest";

import { drawKeyboard } from "./render-video";
import { layoutKeyboard } from "./keyboard";
import type { MidiNote } from "./midi";

/**
 * Рисование клавиатуры.
 *
 * Canvas в тестах нет, поэтому подменяем его простой записью: запоминаем
 * цвет и прямоугольник каждой заливки. Этого хватает, чтобы проверить главное —
 * нажатая клавиша заливается лаймовым, а ненажатая остаётся тёмной.
 */

type Paint = { color: string; x: number; y: number; w: number; h: number };

function fakeCtx(paints: Paint[]) {
  const ctx = {
    fillStyle: "",
    fillRect(x: number, y: number, w: number, h: number) {
      paints.push({ color: ctx.fillStyle, x, y, w, h });
    },
  };

  return ctx as unknown as CanvasRenderingContext2D;
}

const note = (pitch: number): MidiNote => ({
  pitch,
  time: 0,
  duration: 1,
  velocity: 0.9,
  track: 0,
});

const LIME = "#d8ff3e";

describe("клавиатура в кадре", () => {
  it("нажатая клавиша заливается лаймовым", () => {
    const notes = [note(60), note(64), note(67)];
    const keyboard = layoutKeyboard(notes);
    const paints: Paint[] = [];

    drawKeyboard(fakeCtx(paints), keyboard, {
      x: 0,
      y: 0,
      width: 1000,
      height: 100,
      active: new Set([64]),
      lime: LIME,
      bone: "#f2efe7",
    });

    // Клавиша 64 залита лаймовым: ровно одна заливка этого цвета.
    expect(paints.filter((paint) => paint.color === LIME)).toHaveLength(1);
  });

  it("все клавиши нарисованы: белые и чёрные", () => {
    const keyboard = layoutKeyboard([note(60), note(61), note(62)]);
    const paints: Paint[] = [];

    drawKeyboard(fakeCtx(paints), keyboard, {
      x: 0,
      y: 0,
      width: 1000,
      height: 100,
      active: new Set(),
      lime: LIME,
      bone: "#f2efe7",
    });

    const whiteCount = keyboard.keys.filter((key) => !key.black).length;
    const blackCount = keyboard.keys.filter((key) => key.black).length;

    // Чёрные рисуются вторым проходом, поверх белых: иначе белые их перекроют.
    expect(paints).toHaveLength(whiteCount + blackCount);
  });

  it("чёрная клавиша короче белой", () => {
    const keyboard = layoutKeyboard([note(60), note(61)]);
    const paints: Paint[] = [];

    drawKeyboard(fakeCtx(paints), keyboard, {
      x: 0,
      y: 0,
      width: 1000,
      height: 100,
      active: new Set(),
      lime: LIME,
      bone: "#f2efe7",
    });

    const heights = new Set(paints.map((paint) => paint.h));

    expect(heights.size).toBe(2);
  });

  it("пустая клавиатура не рисует ничего", () => {
    const paints: Paint[] = [];

    drawKeyboard(fakeCtx(paints), { keys: [] }, {
      x: 0,
      y: 0,
      width: 1000,
      height: 100,
      active: new Set([60]),
      lime: LIME,
      bone: "#f2efe7",
    });

    expect(paints).toHaveLength(0);
  });
});
