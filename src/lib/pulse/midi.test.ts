import { describe, expect, it } from "vitest";

import { fitNotesToAudio, noteNameOf, parseMidi, type MidiNote } from "./midi";

/**
 * Разбор MIDI.
 *
 * Файл собирается руками из настоящих байт формата, а не из заготовки:
 * парсер должен понимать настоящий файл, и единственный способ это проверить —
 * скормить ему настоящие байты.
 */

/** Собирает MIDI-файл из событий. */
function buildMidi(
  events: number[][],
  { division = 96, tempo = 500_000, tracks = 1 } = {},
): Uint8Array {
  const bytes: number[] = [];

  const push32 = (value: number) => {
    bytes.push((value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff);
  };

  const pushVar = (target: number[], value: number) => {
    const parts = [value & 0x7f];

    let rest = value >> 7;

    while (rest > 0) {
      parts.unshift((rest & 0x7f) | 0x80);
      rest >>= 7;
    }

    target.push(...parts);
  };

  const chunk = (name: string, body: number[]) => {
    bytes.push(...[...name].map((c) => c.charCodeAt(0)));
    push32(body.length);
    bytes.push(...body);
  };

  const track: number[] = [];

  // set tempo: FF 51 03 tttttt
  //
  // Перед каждым событием идёт дельта, в том числе перед мета-событием: без
  // неё файл перестаёт быть MIDI-файлом, и парсер честно его не узнаёт.
  pushVar(track, 0);
  track.push(0xff, 0x51, 0x03, (tempo >>> 16) & 0xff, (tempo >>> 8) & 0xff, tempo & 0xff);

  for (const event of events) {
    // Дельта пишется в трек, а не в общий буфер: иначе она окажется перед
    // заголовком, и файл перестанет быть MIDI-файлом.
    pushVar(track, event[0]);
    track.push(...event.slice(1));
  }

  // конец трека
  track.push(0x00, 0xff, 0x2f, 0x00);

  chunk("MThd", [...[0, 0], ...[0, tracks], ...[0, division]]);
  chunk("MTrk", track);

  return new Uint8Array(bytes);
}

describe("разбор MIDI", () => {
  it("читает ноту по включению и выключению", () => {
    // 96 тиков в четверти при 120 BPM: четверть — полсекунды, значит 96 тиков.
    const file = buildMidi([
      [0, 0x90, 60, 100],
      [96, 0x80, 60, 0],
    ]);

    const midi = parseMidi(file);

    expect(midi.notes).toHaveLength(1);
    expect(midi.notes[0].pitch).toBe(60);
    expect(midi.notes[0].time).toBeCloseTo(0, 3);
    expect(midi.notes[0].duration).toBeCloseTo(0.5, 3);
    expect(midi.notes[0].velocity).toBeGreaterThan(0.7);
  });

  it("читает темп из файла", () => {
    // 375000 микросекунд на четверть — это 160 ударов в минуту.
    const file = buildMidi([[0, 0x90, 60, 100], [96, 0x80, 60, 0]], { tempo: 375_000 });

    expect(parseMidi(file).bpm).toBe(160);
  });

  it("считает время по темпу, а не по тикам", () => {
    // При 160 BPM четверть — 0,375 секунды, то есть 96 тиков это 0,375 с.
    const file = buildMidi([[0, 0x90, 60, 100], [96, 0x80, 60, 0]], { tempo: 375_000 });

    expect(parseMidi(file).notes[0].duration).toBeCloseTo(0.375, 3);
  });

  it("отжатая нота без отпускания закрывается в конце", () => {
    // Так бывает в файлах, выгруженных из пианино: нота нажата и больше не
    // отпущена. Без обработки она длилась бы до бесконечности.
    const file = buildMidi([[0, 0x90, 60, 100]]);

    const midi = parseMidi(file);

    expect(midi.notes).toHaveLength(1);
    expect(midi.notes[0].duration).toBeGreaterThan(0);
    expect(Number.isFinite(midi.notes[0].duration)).toBe(true);
  });

  it("повторное нажатие закрывает предыдущую ноту", () => {
    // Мелодия без отпусканий — обычное дело для MIDI из DAW.
    const file = buildMidi([
      [0, 0x90, 60, 100],
      [96, 0x90, 60, 100],
      [96, 0x80, 60, 0],
    ]);

    const midi = parseMidi(file);

    expect(midi.notes).toHaveLength(2);
    expect(midi.notes[0].duration).toBeCloseTo(0.5, 3);
    expect(midi.notes[1].duration).toBeCloseTo(0.5, 3);
  });

  it("несколько нот идут в порядке времени", () => {
    const file = buildMidi([
      [0, 0x90, 64, 100],
      [0, 0x90, 60, 100],
      [96, 0x80, 64, 0],
      [0, 0x80, 60, 0],
    ]);

    const midi = parseMidi(file);

    expect(midi.notes).toHaveLength(2);
    expect(midi.notes[0].pitch).toBe(60);
    expect(midi.notes[1].pitch).toBe(64);
  });

  it("тихая нота отбрасывается", () => {
    // Нота на грани слышимости в кадре — мусор, а не музыка.
    const file = buildMidi([
      [0, 0x90, 60, 2],
      [96, 0x80, 60, 0],
    ]);

    expect(parseMidi(file).notes).toHaveLength(0);
  });

  it("чужой файл честно отвергается", () => {
    // Лучше внятный отказ, чем тихий ролик без нот: он выглядел бы как
    // «стиль не тот».
    expect(() => parseMidi(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]))).toThrow(/не MIDI/i);
  });

  it("обрезанный файл не читается молча", () => {
    const file = buildMidi([[0, 0x90, 60, 100], [96, 0x80, 60, 0]]);

    expect(() => parseMidi(file.slice(0, 10))).toThrow();
  });
});

describe("имя ноты", () => {
  it("средняя нота называется правильно", () => {
    expect(noteNameOf(60)).toBe("C4");
    expect(noteNameOf(61)).toBe("C#4");
    expect(noteNameOf(69)).toBe("A4");
    expect(noteNameOf(21)).toBe("A0");
  });
});

describe("подгонка нот под аудио", () => {
  const notes: MidiNote[] = [
    { time: 0, duration: 0.5, pitch: 60, velocity: 0.8, track: 0 },
    { time: 1, duration: 0.5, pitch: 62, velocity: 0.8, track: 0 },
    { time: 2, duration: 0.5, pitch: 64, velocity: 0.8, track: 0 },
  ];

  it("время растягивается под темп бита", () => {
    // MIDI на 120, бит на 150: ноты должны идти быстрее, иначе мелодия в кадре
    // разойдётся со звуком.
    const fitted = fitNotesToAudio(notes, { audioSeconds: 10, audioBpm: 150, midiBpm: 120 });

    expect(fitted[1].time).toBeCloseTo(1.25, 3);
    expect(fitted[1].duration).toBeCloseTo(0.625, 3);
  });

  it("при том же темпе ничего не меняется", () => {
    const fitted = fitNotesToAudio(notes, { audioSeconds: 10, audioBpm: 140, midiBpm: 140 });

    expect(fitted[1].time).toBeCloseTo(1, 3);
  });

  it("ноты за пределами аудио отбрасываются", () => {
    // Рисовать то, чего в ролике не слышно, бессмысленно: кадр с нотами
    // без звука выглядит как ошибка.
    const fitted = fitNotesToAudio(notes, { audioSeconds: 1.5, audioBpm: 140, midiBpm: 140 });

    expect(fitted).toHaveLength(2);
    expect(fitted.every((note) => note.time < 1.5)).toBe(true);
  });

  it("нота, обрезанная концом аудио, не выходит за него", () => {
    const fitted = fitNotesToAudio(notes, { audioSeconds: 1.2, audioBpm: 140, midiBpm: 140 });

    expect(fitted[1].time + fitted[1].duration).toBeLessThanOrEqual(1.2 + 0.0001);
  });

  it("нулевой темп MIDI не ломает масштаб", () => {
    const fitted = fitNotesToAudio(notes, { audioSeconds: 10, audioBpm: 140, midiBpm: 0 });

    expect(fitted[1].time).toBeCloseTo(1, 3);
  });
});
