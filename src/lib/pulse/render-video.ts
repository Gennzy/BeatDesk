/**
 * Сборка видео из бита — в браузере.
 *
 * Серверной альтернативы нет: ffmpeg на платформе нет, а серверные функции
 * ограничены по времени, а кодировать трёхминутный ролик там дольше, чем
 * он может работать. Браузер умеет всё нужное сам: canvas отдаёт картинку
 * как поток, MediaRecorder собирает поток в файл.
 *
 * ---------------------------------------------------------------------------
 * ПОЧЕМУ MP4, А НЕ WEBM
 *
 * YouTube принимает оба, но MP4 кодируется сразу и без перекодировки:
 * ролик выходит в том виде, в котором собран. С WebM платформа пережала бы
 * его сама, и качество зависело бы от её настроек.
 *
 * ---------------------------------------------------------------------------
 * ПОЧЕМУ ЭТО ИДЁТ В РЕАЛЬНОМ ВРЕМЕНИ
 *
 * MediaRecorder пишет с той же скоростью, с какой звук играет: ускорить
 * можно только видео, а звук из MediaStream ускорить нельзя. Трёхминутный
 * бит — три минуты сборки. Это заметно, поэтому длительность показывается
 * заранее, а прерывание возможно на любом кадре.
 * ---------------------------------------------------------------------------
 */

/** Разрешение по умолчанию — как у конкурентов: 16:9 FullHD. */
import { activeNotesAt, layoutKeyboard } from "./keyboard";
import { fitNotesToAudio, type MidiNote } from "./midi";
export const VIDEO_WIDTH = 1920;
export const VIDEO_HEIGHT = 1080;
export const VIDEO_FPS = 30;

/**
 * Кодеки по убыванию предпочтения.
 *
 * Первый вариант — MP4 с AVC и AAC, то есть то, что понимает YouTube без
 * возни. Остальные нужны для браузеров, где MP4 в MediaRecorder ещё не
 * появился: без них страница просто не собрала бы видео там, где могла бы.
 */
export const MIME_CANDIDATES = [
  'video/mp4;codecs="avc1.42E01E,mp4a.40.2"',
  "video/mp4",
  'video/webm;codecs="vp9,opus"',
  'video/webm;codecs="vp8,opus"',
  "video/webm",
];

export function pickMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "";

  return MIME_CANDIDATES.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
}

export type RenderInput = {
  /** Обложка: фон и акцент. */
  coverUrl: string | null;
  /** Превью бита: из него собирается звуковая дорожка. */
  audioUrl: string;
  title: string;
  techLine: string;
  producer: string;
  /** Показывается в углу мелким — как «must credit» на роликах. */
  credit: string | null;
  width?: number;
  height?: number;
  fps?: number;
  /** От 0 до 1. Человек должен видеть, что идёт сборка, а не зависание. */
  onProgress?: (ratio: number, secondsLeft: number) => void;
  /**
   * Ноты мелодии: по ним в кадре рисуется клавиатура.
   *
   * Время в секундах и уже подогнанное под аудио: разбор MIDI и масштаб по
   * темпу делаются до рендера, а внутри кадра остаётся только нарисовать.
   */
  notes?: MidiNote[];
  /** Темп бита: по нему ноты мелодии растягиваются или сжимаются. */
  audioBpm?: number;
  /** Темп MIDI-мелодии: по нему считается масштаб. */
  midiBpm?: number;
  signal?: AbortSignal;
};

export type RenderOutput = {
  blob: Blob;
  mimeType: string;
  durationMs: number;
};

export class RenderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RenderError";
  }
}

/** Скачивает файл с проверкой ответа: 404 должен говорить «нет файла», а не «сломалось». */
async function loadBlob(url: string): Promise<Blob> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new RenderError(`Не удалось загрузить файл: ${response.status}`);
  }

  return response.blob();
}

/** Готовит аудио: без расшифровки волну рисовать нечем, а звук не взять. */
async function decodeAudio(blob: Blob): Promise<AudioBuffer> {
  const context = new AudioContext();

  try {
    return await context.decodeAudioData(await blob.arrayBuffer());
  } catch {
    throw new RenderError("Браузер не смог прочитать аудиофайл.");
  } finally {
    // Контекст нужен был только для расшифровки: закрываем, иначе он держит
    // ресурс до конца сессии.
    void context.close();
  }
}

/** Разбивка дорожки на столбики: пиковые значения участков. */
function peaksOf(buffer: AudioBuffer, columns: number): Float32Array {
  const data = buffer.getChannelData(0);
  // Короткий файл короче числа столбиков: шаг ноль давал тишину на весь
  // кадр. Единица вместо нуля — каждый сэмпл виден хотя бы раз.
  const step = Math.max(1, Math.floor(data.length / columns));
  const peaks = new Float32Array(columns);

  for (let i = 0; i < columns; i += 1) {
    let peak = 0;

    for (let j = 0; j < step; j += 1) {
      const value = Math.abs(data[i * step + j] ?? 0);
      if (value > peak) peak = value;
    }

    peaks[i] = peak;
  }

  return peaks;
}

/** Обложка отдельным изображением: так она рисуется быстрее и не мигает. */
async function loadCover(url: string | null): Promise<ImageBitmap | null> {
  if (!url) return null;

  try {
    const blob = await loadBlob(url);
    const bitmap = await createImageBitmap(blob);

    return bitmap;
  } catch {
    // Без обложки ролик всё равно собирается: кадр будет фоном одного цвета.
    return null;
  }
}

/**
 * Один кадр.
 *
 * Рисуется целиком на каждом кадре, а не поверх предыдущего: дельта между
 * кадрами дешёвая, а перерисовка с нуля убирает класс ошибок, где
 * предыдущий кадр остался на месте после смены состояния.
 */
function drawFrame(
  ctx: CanvasRenderingContext2D,
  input: {
    cover: ImageBitmap | null;
    peaks: Float32Array;
    ratio: number;
    width: number;
    height: number;
    title: string;
    techLine: string;
    producer: string;
    credit: string | null;
    /** Раскладка клавиатуры: пустая — рисуем как раньше, без нот. */
    keyboard: { keys: { pitch: number; x: number; width: number; black: boolean }[] };
    /** Номера нот, которые звучат в этом кадре. */
    activePitches: Set<number>;
    /** Заголовок не должен вылезать за края. */
    fit: (value: string, max: number) => number;
  },
) {
  const { width, height, cover, peaks, ratio } = input;

  ctx.clearRect(0, 0, width, height);

  // Фон: обложка растянутая и затемнённая, чтобы текст читался поверх.
  if (cover) {
    // Масштаб по большему краю: обрезка, а не искажение пропорций —
    // растянутая обложка сразу выглядит натянутой.
    const scale = Math.max(width / cover.width, height / cover.height);
    const w = cover.width * scale;
    const h = cover.height * scale;

    ctx.save();
    ctx.globalAlpha = 0.28;
    ctx.drawImage(cover, (width - w) / 2, (height - h) / 2, w, h);
    ctx.restore();
  }

  ctx.fillStyle = "rgba(6, 6, 6, 0.72)";
  ctx.fillRect(0, 0, width, height);

  const pad = Math.round(width * 0.07);
  const lime = "#d8ff3e";
  const bone = "#f2efe7";

  // Мелкая строка сверху — как «must credit» на роликах о битах.
  ctx.fillStyle = lime;
  ctx.font = `600 ${Math.round(height * 0.032)}px Manrope, sans-serif`;
  ctx.letterSpacing = `${Math.round(height * 0.004)}px`;

  const label = "BEATDESK";
  ctx.fillText(label, pad, pad + Math.round(height * 0.03));

  // Волна: столбики, растущие от пройденной части трека.
  const waveY = Math.round(height * 0.58);
  const barW = Math.max(2, Math.round(width / 260));
  const gap = Math.max(2, Math.round(width / 180));
  const visible = Math.floor((width - pad * 2) / (barW + gap));

  for (let i = 0; i < visible; i += 1) {
    // Столбики не стоят на месте: справа набегает то, что ещё не прозвучало.
    const index = Math.floor(ratio * peaks.length + (i / visible) * peaks.length * 0.12) % peaks.length;
    const value = peaks[index] ?? 0;
    const h = Math.max(2, value * height * 0.22);

    ctx.fillStyle = lime;
    ctx.globalAlpha = 0.9;
    ctx.fillRect(pad + i * (barW + gap), waveY - h / 2, barW, h);
  }

  ctx.globalAlpha = 1;

  // Название — самая крупная строка, влезает по ширине.
  ctx.fillStyle = bone;
  const titleSize = input.fit(input.title, width - pad * 2);
  ctx.font = `700 ${Math.round(titleSize)}px Unbounded, Manrope, sans-serif`;

  const lines = wrap(ctx, input.title, width - pad * 2);
  let y = Math.round(height * 0.38);

  for (const line of lines.slice(0, 3)) {
    ctx.fillText(line, pad, y);
    y += Math.round(titleSize * 1.12);
  }

  ctx.font = `600 ${Math.round(height * 0.036)}px JetBrains Mono, monospace`;
  ctx.fillStyle = lime;
  ctx.fillText(input.techLine, pad, waveY + Math.round(height * 0.14));

  ctx.font = `600 ${Math.round(height * 0.03)}px Manrope, sans-serif`;
  ctx.fillStyle = bone;
  ctx.fillText(`prod. ${input.producer}`, pad, height - pad - Math.round(height * 0.06));

  if (input.credit) {
    ctx.font = `400 ${Math.round(height * 0.022)}px Manrope, sans-serif`;
    ctx.fillStyle = "rgba(242, 239, 231, 0.55)";
    ctx.fillText(input.credit, pad, height - pad);
  }

  /*
   * Клавиатура мелодии.
   *
   * Стоит внизу, поверх всего: это единственный элемент кадра, который
   * меняется, и он должен читаться как «сейчас играет вот это».
   *
   * Диапазон клавиш один на всю мелодию, а не пересчитывается каждый кадр:
   * иначе клавиатура дёргалась бы от такта к такту.
   */
  if (input.keyboard && input.keyboard.keys.length > 0) {
    drawKeyboard(ctx, input.keyboard, {
      x: pad,
      y: height - pad - Math.round(height * 0.14),
      width: width - pad * 2,
      height: Math.round(height * 0.1),
      active: input.activePitches,
      lime,
      bone,
    });
  }
}

/**
 * Клавиатура: белые клавиши, поверх них чёрные, нажатые — лаймовые.
 *
 * Нажатые определяются не временем, а списком номеров нот: время в кадре
 * меняется каждый кадр, а список нажатых считается один раз.
 */
export function drawKeyboard(
  ctx: CanvasRenderingContext2D,
  keyboard: { keys: { pitch: number; x: number; width: number; black: boolean }[] },
  box: {
    x: number;
    y: number;
    width: number;
    height: number;
    active: Set<number>;
    lime: string;
    bone: string;
  },
) {
  const whiteHeight = box.height;
  const blackHeight = Math.round(box.height * 0.62);

  // Белые клавиши.
  for (const key of keyboard.keys) {
    if (key.black) continue;

    const left = box.x + key.x * box.width;
    const w = key.width * box.width;

    ctx.fillStyle = key.pitch !== undefined && box.active.has(key.pitch) ? box.lime : "rgba(242, 239, 231, 0.16)";

    ctx.fillRect(left, box.y, w - 1, whiteHeight);
  }

  // Чёрные — поверх, иначе белые их перекроют.
  for (const key of keyboard.keys) {
    if (!key.black) continue;

    const left = box.x + key.x * box.width;
    const w = key.width * box.width;

    ctx.fillStyle = box.active.has(key.pitch) ? box.lime : "rgba(10, 10, 10, 0.85)";

    ctx.fillRect(left, box.y, w, blackHeight);
  }
}

/** Перенос по словам: техническая строка и длинное название не режутся посреди слова. */
function wrap(ctx: CanvasRenderingContext2D, value: string, maxWidth: number): string[] {
  const words = value.split(/\s+/);
  const lines: string[] = [];
  let line = "";

  for (const word of words) {
    const next = line ? `${line} ${word}` : word;

    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }

  if (line) lines.push(line);

  return lines;
}

/**
 * Подгоняет кегль так, чтобы строка влезла по ширине.
 *
 * По одной строке, как в заголовке: название из трёх строк выходит мелким
 * и теряется, а одна широкая строка читается с самого края кадра.
 */
function fitSize(ctx: CanvasRenderingContext2D, value: string, maxWidth: number): number {
  let size = Math.round(maxWidth / 9);

  while (size > 24) {
    ctx.font = `700 ${size}px Unbounded, Manrope, sans-serif`;

    if (ctx.measureText(value).width <= maxWidth) break;

    size -= 2;
  }

  return size;
}

/**
 * Собирает видео.
 *
 * Идёт в реальном времени и слушает отмену: человек должен иметь право
 * передумать на середине трёхминутной сборки.
 */
export async function renderBeatVideo(input: RenderInput): Promise<RenderOutput> {
  const mimeType = pickMimeType();

  if (!mimeType) {
    throw new RenderError("Браузер не умеет записывать видео. Попробуйте другой браузер.");
  }

  const width = input.width ?? VIDEO_WIDTH;
  const height = input.height ?? VIDEO_HEIGHT;
  const fps = input.fps ?? VIDEO_FPS;

  const [audioBlob, cover] = await Promise.all([
    loadBlob(input.audioUrl),
    loadCover(input.coverUrl),
  ]);

  const buffer = await decodeAudio(audioBlob);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");

  if (!ctx) throw new RenderError("Браузер не смог создать холст.");

  const peaks = peaksOf(buffer, 512);
  const credits = input.credit ? `must credit: ${input.credit}` : null;

  /*
   * Ноты подгоняются под аудио и рисуются один раз на всю мелодию.
   *
   * Мелодия может быть написана под другой темп, чем бит, и без подгонки
   * ноты в кадре разойдутся со звуком. Раскладка клавиатуры считается один
   * раз: если считать её каждый кадр, клавиатура дёргалась бы от такта к
   * такту.
   */
  const notes = fitNotesToAudio(input.notes ?? [], {
    audioSeconds: buffer.duration,
    audioBpm: input.audioBpm ?? 120,
    midiBpm: input.midiBpm ?? 120,
  });

  const keyboard = layoutKeyboard(notes);

  const stream = canvas.captureStream(fps);

  const context = new AudioContext();
  const destination = context.createMediaStreamDestination();
  const source = context.createBufferSource();

  source.buffer = buffer;

  // В поток записи — обязательно, иначе ролик получится без звука.
  source.connect(destination);

  // И в колонки — тоже: человек должен слышать трек, пока собирает
  // ролик из него. Иначе три минуты тишины выглядят как зависание.
  source.connect(context.destination);

  for (const track of destination.stream.getAudioTracks()) {
    stream.addTrack(track);
  }

  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 6_000_000 });

  const chunks: Blob[] = [];

  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };

  const durationMs = buffer.duration * 1000;
  const started = performance.now();

  const finished = new Promise<Blob>((resolve, reject) => {
    recorder.onerror = () => reject(new RenderError("Браузер прервал запись."));
    recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
  });

  const draw = () => {
    const ratio = Math.min(1, (performance.now() - started) / durationMs);

    /*
     * Клавиатура и нажатые ноты.
     *
     * Раскладка считается один раз на всю мелодию, а набор нажатых — каждый
     * кадр: он зависит от того, что сейчас звучит.
     */
    const seconds = ratio * buffer.duration;
    const activePitches = new Set(activeNotesAt(notes, seconds).map((note) => note.pitch));

    drawFrame(ctx, {
      cover,
      peaks,
      ratio,
      keyboard,
      activePitches,
      width,
      height,
      title: input.title,
      techLine: input.techLine,
      producer: input.producer,
      credit: credits,
      fit: (value, max) => fitSize(ctx, value, max),
    });

    input.onProgress?.(ratio, Math.max(0, durationMs - (performance.now() - started)) / 1000);
  };

  recorder.start(1000);
  source.start();
  draw();

  const timer = window.setInterval(draw, 1000 / fps);

  // Отмена: останавливаем всё, иначе источник продолжал бы играть в пустоту,
  // а запись — расти в никуда до конца трека.
  const abort = () => {
    if (recorder.state !== "inactive") recorder.stop();
  };

  input.signal?.addEventListener("abort", abort, { once: true });

  try {
    await new Promise<void>((resolve) => {
      source.onended = () => resolve();
    });

    if (input.signal?.aborted) throw new RenderError("Сборка отменена.");
  } finally {
    window.clearInterval(timer);
    input.signal?.removeEventListener("abort", abort);

    // Запись может быть уже остановлена отменой: повторный stop бросает.
    if (recorder.state !== "inactive") recorder.stop();

    source.disconnect();
    void context.close();
  }

  const blob = await finished;

  return { blob, mimeType, durationMs };
}