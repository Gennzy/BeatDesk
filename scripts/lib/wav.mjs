/**
 * Разбор WAV для стенда замера.
 *
 * Фиксированные смещения не работают: в файле может лежать чанк JUNK или
 * LIST до fmt, как в нашем мастере. Поэтому идём по списку чанков.
 *
 * Отдельно важно: формат бывает не только целочисленный. Наш мастер —
 * IEEE float 32 бита, и код, который читает только int16, молча возьмёт
 * мусор вместо звука.
 */
import { readFileSync } from "node:fs";

const FOURCC = (view, offset) => String.fromCharCode(view.getUint8(offset), view.getUint8(offset + 1), view.getUint8(offset + 2), view.getUint8(offset + 3));

const INT = { 1: 1, 2: 2, 3: 4 }; // PCM 8/16/32 и IEEE float

export function decodeWav(buffer) {
  const view = new DataView(buffer);

  if (FOURCC(view, 0) !== "RIFF" || FOURCC(view, 8) !== "WAVE") {
    throw new Error("Это не WAV: сигнатура не RIFF/WAVE");
  }

  let format = null;
  let data = null;
  let offset = 12;

  while (offset + 8 <= view.byteLength) {
    const id = FOURCC(view, offset);
    const size = view.getUint32(offset + 4, true);
    const body = offset + 8;

    if (id === "fmt ") {
      format = {
        audioFormat: view.getUint16(body, true),
        channels: view.getUint16(body + 2, true),
        sampleRate: view.getUint32(body + 4, true),
        bitsPerSample: view.getUint16(body + 14, true),
      };
    } else if (id === "data") {
      data = { start: body, size: Math.min(size, view.byteLength - body) };
    }

    // Чанки выравниваются по чётной границе.
    offset = body + size + (size % 2);
  }

  if (!format || !data) throw new Error("В WAV нет чанков fmt или data");

  const bytesPerSample = (format.bitsPerSample / 8) | 0;
  if (!INT[format.audioFormat] || !bytesPerSample) {
    throw new Error(`Формат аудио ${format.audioFormat} и ${format.bitsPerSample} бит не поддерживается стендом`);
  }

  const frames = Math.floor(data.size / (bytesPerSample * format.channels));
  const mono = new Float32Array(frames);

  // Сводим каналы в один: удар в левом и правом — один удар, иначе темп удвоится.
  for (let frame = 0; frame < frames; frame += 1) {
    let sum = 0;

    for (let channel = 0; channel < format.channels; channel += 1) {
      const at = data.start + (frame * format.channels + channel) * bytesPerSample;
      sum += readSample(view, at, format.audioFormat, bytesPerSample);
    }

    mono[frame] = sum / format.channels;
  }

  return { samples: mono, sampleRate: format.sampleRate, channels: format.channels, bitsPerSample: format.bitsPerSample, audioFormat: format.audioFormat, seconds: frames / format.sampleRate };
}

function readSample(view, at, audioFormat, bytesPerSample) {
  if (audioFormat === 3) return view.getFloat32(at, true);

  if (bytesPerSample === 1) return (view.getUint8(at) - 128) / 128;

  if (bytesPerSample === 2) return view.getInt16(at, true) / 32768;

  return view.getInt32(at, true) / 2147483648;
}

export function readWav(path) {
  return decodeWav(readFileSync(path).buffer);
}