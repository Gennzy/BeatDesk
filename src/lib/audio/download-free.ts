"use client";

import { decodeEnvelope, encodeEnvelope, envelopeOf } from "./fingerprint";

/**
 * Бесплатное скачивание бита.
 *
 * ---------------------------------------------------------------------------
 * ПОЧЕМУ ОТПЕЧАТОК СЧИТАЕТ БРАУЗЕР
 *
 * Сервер файл не расшифровывает: для этого нужен ffmpeg, а мы его не
 * держим. Браузер уже умеет — он расшифровывает аудио в студии, когда ищет
 * темп. Отпечаток того же файла, который мы отдаём, считается там же.
 *
 * ---------------------------------------------------------------------------
 * ЧТО ЭТО ДАЁТ
 *
 * Журнал: кто, когда и какой файл брал. Когда битмейкер приносит найденный
 * слитый треп, сверка идёт с этими записями — и совпадение означает «этот
 * файл у него».
 */

/** Сколько брать отпечаток: первые 30 секунд хватает и не грузит память. */
const ENVELOPE_SECONDS = 30;

/**
 * Отпечаток файла по ссылке.
 *
 * Считается по первым тридцати секундам: файл может быть длинным, а
 * отпечаток длинного трека весит столько же, сколько короткого, и хранить
 * его незачем.
 */
export async function envelopeOfUrl(url: string): Promise<string> {
  const response = await fetch(url);

  if (!response.ok) throw new Error("Файл недоступен");

  return envelopeOfBytes(new Uint8Array(await response.arrayBuffer()));
}

/**
 * Отпечаток по байтам.
 *
 * Отдельная функция, потому что байты приходят двумя путями: из своего файла
 * при скачивании и из превью площадки при поиске сливов. Расчёт должен быть
 * один и тот же, иначе след не совпадёт с тем, что мы отдавали.
 */
export async function envelopeOfBytes(bytes: Uint8Array): Promise<string> {
  const context = new AudioContext();

  try {
    const audio = await context.decodeAudioData(bytes.buffer.slice(0) as ArrayBuffer);

    // Смешиваем в один канал: отпечаток не должен зависеть от того, во
    // сколько каналов в файле.
    const channels = audio.numberOfChannels;
    const samples = new Float32Array(audio.length);

    for (let c = 0; c < channels; c++) {
      const data = audio.getChannelData(c);

      for (let i = 0; i < data.length; i++) samples[i] += data[i] / channels;
    }

    const limit = Math.min(samples.length, Math.floor(audio.sampleRate * ENVELOPE_SECONDS));

    return encodeEnvelope(envelopeOf(samples.subarray(0, limit), audio.sampleRate));
  } finally {
    await context.close().catch(() => {});
  }
}

/**
 * Скачивает бит бесплатно и записывает, кто его взял.
 *
 * Отпечаток считается до запроса: сервер записывает то, что мы отдаём, и
 * отпечаток должен соответствовать именно этому файлу.
 */
export async function downloadFreeBeat(beatId: string, fileUrl: string): Promise<void> {
  const envelope = await envelopeOfUrl(fileUrl);

  const response = await fetch(`/api/beats/${beatId}/free-download`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ envelope }),
  });

  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as { error?: string } | null;

    throw new Error(data?.error ?? "Не удалось скачать бит");
  }

  // Скачивание идёт по обычной ссылке: браузер сам сохранит файл, и
  // человек получит ровно то, что лежит на площадке.
  const link = document.createElement("a");

  link.href = fileUrl;
  link.download = "";
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

/** Отпечаток из строки: для проверки совпадения на стороне битмейкера. */
export function readEnvelope(value: string): Uint8Array {
  return decodeEnvelope(value);
}
