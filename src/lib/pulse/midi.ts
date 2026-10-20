/**
 * Разбор MIDI-файла.
 *
 * ---------------------------------------------------------------------------
 * ЗАЧЕМ НАМ ЭТО
 *
 * Ролик бита показывает обложку, название, темп и тональность. Это статичная
 * картинка, и она ничего не говорит зрителю о мелодии. А мелодия — это и есть
 * то, что человек ищет, слушая бит: «вот эта тема». Если ролик рисует ноты
 * настоящей мелодии, он перестаёт быть заставкой и становится инструментом
 * продажи: тот, кто ищет тему, узнаёт её с первых секунд.
 *
 * ---------------------------------------------------------------------------
 * ПОЧЕМУ СВОЙ РАЗБОР, А НЕ БИБЛИОТЕКА
 *
 * Формат MIDI прост: заголовок, треки, события. Библиотека ради двух форматов
 * весила бы больше, чем весь остальной код Pulse, и приносила бы с собой
 * зависимость, которую придётся обновлять. К тому же разбор нужен ровно один:
 * вытащить ноты со временем.
 *
 * ---------------------------------------------------------------------------
 * ФОРМАТ
 *
 * Файл начинается с «MThd» и шести байт: формат, число треков, деление.
 * Деление — сколько тиков в четверти. Затем идут треки «MTrk», каждый —
 * поток событий с дельтой в тиках.
 *
 * Дельта записана переменной длиной: младшие семь бит несут значение,
 * старший бит говорит «дальше есть ещё байт». Читать её надо с конца, а не
 * с начала: значение растёт, а порядок байт обратный.
 */

export type MidiNote = {
  /** Начало в секундах от начала трека. */
  time: number;
  /** Длительность в секундах. */
  duration: number;
  /** Номер ноты: 60 — до-диез средней октавы. */
  pitch: number;
  /** Громкость от 0 до 1. */
  velocity: number;
  /** Дорожка: 0 — первая. */
  track: number;
};

export type MidiData = {
  notes: MidiNote[];
  /** Темп MIDI, ударов в минуту. */
  bpm: number;
  /** Длина в секундах: до последней ноты или до конца трека. */
  duration: number;
  /** Тиков в четверти. */
  division: number;
  /** Сколько дорожек в файле. */
  tracks: number;
};

const MICROSECONDS_PER_QUARTER = 1_000_000;

/** Темп по умолчанию, если в файле нет set tempo: 120 ударов в минуту. */
const DEFAULT_BPM = 120;

/** Ноты короче этого не рисуем: это отзвук, а не нота. */
const MIN_DURATION = 0.02;

/** Громкость тише этого не слышно, а в кадре это просто мусор. */
const MIN_VELOCITY = 0.08;

class Reader {
  offset = 0;

  constructor(private readonly bytes: Uint8Array) {}

  get left(): number {
    return this.bytes.length - this.offset;
  }

  u8(): number {
    if (this.left < 1) throw new Error("MIDI-файл оборван");

    return this.bytes[this.offset++];
  }

  u16(): number {
    if (this.left < 2) throw new Error("MIDI-файл оборван");

    const value = (this.bytes[this.offset] << 8) | this.bytes[this.offset + 1];

    this.offset += 2;

    return value;
  }

  u32(): number {
    if (this.left < 4) throw new Error("MIDI-файл оборван");

    const value =
      this.bytes[this.offset] * 0x1000000 +
      (this.bytes[this.offset + 1] << 16) +
      (this.bytes[this.offset + 2] << 8) +
      this.bytes[this.offset + 3];

    this.offset += 4;

    return value >>> 0;
  }

  string(length: number): string {
    let out = "";

    for (let i = 0; i < length; i++) out += String.fromCharCode(this.u8());

    return out;
  }

  skip(length: number): void {
    this.offset += length;
  }
}

/**
 * Переменная длина: сколько байт занимает число.
 *
 * Значение растёт, а порядок байт обратный: младший байт идёт первым.
 */
function readVarLength(reader: Reader): number {
  let value = 0;
  let byte = 0;

  do {
    byte = reader.u8();
    value = (value << 7) | (byte & 0x7f);
  } while (byte & 0x80);

  return value;
}

/** Темп из трёх байт set tempo: микросекунд на четверть. */
function bpmFromTempo(tempo: number): number {
  if (!tempo) return DEFAULT_BPM;

  return Math.round((MICROSECONDS_PER_QUARTER / tempo) * 60);
}

/** Имя ноты: 60 — C4, 61 — C#4. */
export function noteNameOf(pitch: number): string {
  const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const octave = Math.floor(pitch / 12) - 1;
  const name = names[((pitch % 12) + 12) % 12];

  return `${name}${octave}`;
}

/**
 * Разбирает MIDI-файл.
 *
 * Бросает исключение с внятным текстом, если это не MIDI: лучше честный отказ,
 * чем тихий пустой ролик без нот, который выглядит как «стиль не тот».
 */
export function parseMidi(bytes: Uint8Array): MidiData {
  const reader = new Reader(bytes);

  if (reader.string(4) !== "MThd") throw new Error("Это не MIDI-файл");

  const headerLength = reader.u32();

  reader.u16(); // формат: 0 — один поток, 1 — несколько. На ноты не влияет.
  const trackCount = reader.u16();
  const division = reader.u16();

  // SMPTE-деление (старший бит установлен) встречается в старых файлах
  // из студий. Оно задаёт тики в секунду, а не в четверти, и считается иначе.
  const smpte = (division & 0x8000) !== 0;
  const ticksPerQuarter = smpte ? 96 : division;

  reader.skip(Math.max(0, headerLength - 6));

  const notes: MidiNote[] = [];
  const open = new Map<string, { time: number; velocity: number; track: number }>();

  let bpm = DEFAULT_BPM;
  let secondsPerTick = 1 / (ticksPerQuarter * 2);
  let absoluteTick = 0;
  let lastNoteEnd = 0;
  let runningStatus = 0;

  for (let trackIndex = 0; trackIndex < trackCount && reader.left > 8; trackIndex++) {
    if (reader.string(4) !== "MTrk") {
      // Дальше может идти не трек: у файла с хвостом мусора. Тогда всё, что
      // разобрано, — уже результат.
      break;
    }

    const trackLength = reader.u32();
    const trackEnd = reader.offset + trackLength;

    while (reader.offset < trackEnd && reader.left > 0) {
      absoluteTick += readVarLength(reader);

      let status = reader.u8();

      /*
       * Бегущий статус: если байт меньше 0x80, это не статус, а данные, и
       * событие продолжает предыдущий статус. Сам байт надо вернуть назад и
       * взять прошлый статус — иначе нота прочитается как ни то, ни сё.
       */
      if (status < 0x80) {
        reader.offset--;
        status = runningStatus;
      } else {
        runningStatus = status;
      }

      const command = status & 0xf0;
      const channel = status & 0x0f;

      /*
       * Мета-событие проверяется ПЕРЕД sysex.
       *
       * У meta-статуса 0xFF и sysex 0xF0 одинаковая старшая часть команды, и
       * проверка по ней ловила мета-событие как sysex: читалась длина, а
       * затем пропускалось несколько байт. Темп и все ноты после него терялись.
       */
      if (status === 0xff) {
        const type = reader.u8();
        const length = readVarLength(reader);

        if (type === 0x51 && length >= 3) {
          const value = (reader.u8() << 16) | (reader.u8() << 8) | reader.u8();

          bpm = bpmFromTempo(value);
          // Секунда в тике пересчитывается на ходу: темп в MIDI может
          // меняться посреди трека.
          secondsPerTick = value / MICROSECONDS_PER_QUARTER / ticksPerQuarter;
        } else {
          reader.skip(length);
        }
      } else if (command === 0x90 || command === 0x80) {
        const pitch = reader.u8();
        const velocity = reader.u8() / 127;
        const key = `${channel}:${pitch}`;

        if (command === 0x90 && velocity > 0) {
          // Повторное нажатие той же ноты без отпускания: предыдущее замыкаем,
          // иначе нота длилась бы до конца трека.
          const previous = open.get(key);
          if (previous) {
            const end = absoluteTick * secondsPerTick;
            notes.push({
              time: previous.time,
              duration: Math.max(MIN_DURATION, end - previous.time),
              pitch,
              velocity: previous.velocity,
              track: previous.track,
            });
          }

          open.set(key, { time: absoluteTick * secondsPerTick, velocity, track: trackIndex });
        } else {
          const started = open.get(key);

          if (started) {
            open.delete(key);

            const end = absoluteTick * secondsPerTick;

            notes.push({
              time: started.time,
              duration: Math.max(MIN_DURATION, end - started.time),
              pitch,
              velocity: started.velocity,
              track: started.track,
            });

            lastNoteEnd = Math.max(lastNoteEnd, end);
          }
        }
      } else if (command === 0xb0) {
        reader.u8(); // номер контроллера
        reader.u8(); // значение
      } else if (command === 0xc0 || command === 0xd0) {
        reader.u8(); // программа / давление
      } else if (command === 0xe0) {
        reader.u8(); // питч-бенд младший
        reader.u8(); // питч-бенд старший
      } else if (status === 0xf0 || status === 0xf7) {
        const length = readVarLength(reader);
        reader.skip(length);
      } else {
        // Неизвестное событие: дальше читать нечего, и трек обрывается.
        break;
      }
    }

    // Дельта могла вывести за границу трека — возвращаемся на её конец,
    // иначе следующий трек прочитается с середины.
    if (reader.offset > trackEnd) reader.offset = trackEnd;
  }

  // Ноты, которые так и не отпустили: закрываем в конце трека.
  for (const [key, started] of open) {
    const pitch = Number(key.split(":")[1]);

    notes.push({
      time: started.time,
      duration: Math.max(MIN_DURATION, lastNoteEnd - started.time),
      pitch,
      velocity: started.velocity,
      track: started.track,
    });
  }

  const kept = notes
    .filter((note) => note.velocity >= MIN_VELOCITY && note.duration >= MIN_DURATION)
    .sort((a, b) => a.time - b.time || a.pitch - b.pitch);

  return {
    notes: kept,
    bpm,
    duration: kept.length > 0 ? Math.max(...kept.map((note) => note.time + note.duration)) : 0,
    division: ticksPerQuarter,
    tracks: trackCount,
  };
}

/**
 * Ноты подгоняются под аудио.
 *
 * ---------------------------------------------------------------------------
 * ЗАЧЕМ
 *
 * MIDI написан под свой темп: мелодия из DAW обычно 120 или 140, а бит может
 * быть 150. Время нот надо пересчитать, иначе ролик будет рисовать ноты не
 * в такт, а мелодия в кадре разойдётся со звуком.
 *
 * Масштаб один: tempo бита, делённое на темп MIDI. Ноты растягиваются или
 * сжимаются целиком, и мелодия остаётся в такте.
 *
 * ---------------------------------------------------------------------------
 * ОБРЕЗКА
 *
 * Ноты за пределами аудио отбрасываются: рисовать то, чего в ролике не
 * слышно, бессмысленно, а кадр с нотами без звука выглядит как ошибка.
 */
export function fitNotesToAudio(
  notes: MidiNote[],
  facts: { audioSeconds: number; audioBpm: number; midiBpm: number },
): MidiNote[] {
  const scale = facts.midiBpm > 0 ? facts.audioBpm / facts.midiBpm : 1;

  return notes
    .map((note) => ({
      ...note,
      time: note.time * scale,
      duration: note.duration * scale,
    }))
    .filter((note) => note.time < facts.audioSeconds && note.duration > 0)
    .map((note) => ({
      ...note,
      duration: Math.min(note.duration, facts.audioSeconds - note.time),
    }));
}
