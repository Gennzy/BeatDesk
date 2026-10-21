import { describe, expect, it } from "vitest";

import { compareEnvelopes, findSuspects, type DownloadRecord } from "./attribution";
import { encodeEnvelope, envelopeOf } from "@/lib/audio/fingerprint";

/**
 * Атрибуция слива.
 *
 * Это наше отличие от Wavesmatch: у них нет списка покупателей, у нас есть.
 * Проверяется, что сверка работает и что чужие файлы не подставляются.
 */

/** Тон: ровный, одинаковый у всех. */
const tone = (seconds = 1, sampleRate = 8000) => {
  const samples = new Float32Array(Math.floor(seconds * sampleRate));

  for (let i = 0; i < samples.length; i++) {
    samples[i] = Math.sin((2 * Math.PI * 2000 * i) / sampleRate) * 0.5;
  }

  return encodeEnvelope(envelopeOf(samples, sampleRate));
};

/** Другая форма звука: та же громкость, другой тембр. */
const other = (seconds = 1, sampleRate = 8000) => {
  const samples = new Float32Array(Math.floor(seconds * sampleRate));

  for (let i = 0; i < samples.length; i++) {
    const freq = 300 + (600 * i) / samples.length;
    samples[i] = Math.sin((2 * Math.PI * freq * i) / sampleRate) * 0.5;
  }

  return encodeEnvelope(envelopeOf(samples, sampleRate));
};

const download = (envelope: string, over: Partial<DownloadRecord> = {}): DownloadRecord => ({
  userId: "u-1",
  envelope,
  createdAt: "2026-03-12T10:00:00.000Z",
  label: "Иван",
  ...over,
});

describe("сравнение отпечатков", () => {
  it("одинаковые файлы совпадают полностью", () => {
    expect(compareEnvelopes(tone(), tone())).toBe(1);
  });

  it("разные файлы не совпадают", () => {
    expect(compareEnvelopes(tone(), other())).toBeLessThan(0.5);
  });

  it("пустые отпечатки не совпадают", () => {
    expect(compareEnvelopes("", tone())).toBe(0);
    expect(compareEnvelopes("не base64", tone())).toBe(0);
  });
});

describe("поиск подозреваемого", () => {
  it("находит того, кто брал такой же файл", () => {
    const envelope = tone();

    const suspects = findSuspects(
      { platform: "spotify", title: "Трек", artist: null, url: null, confidence: 100, envelope },
      [download(envelope)],
    );

    expect(suspects).toHaveLength(1);
    expect(suspects[0].userId).toBe("u-1");
    expect(suspects[0].createdAt).toBe("2026-03-12T10:00:00.000Z");
  });

  it("чужие файлы не подставляются", () => {
    const suspects = findSuspects(
      { platform: "spotify", title: null, artist: null, url: null, confidence: 100, envelope: tone() },
      [download(other(), { userId: "u-2" })],
    );

    expect(suspects).toHaveLength(0);
  });

  it("без отпечатка находки подозреваемых нет", () => {
    // Движок не умеет отдавать отпечаток — и это не повод никого обвинять.
    const suspects = findSuspects(
      { platform: "spotify", title: null, artist: null, url: null, confidence: 100, envelope: null },
      [download(tone())],
    );

    expect(suspects).toHaveLength(0);
  });

  it("несколько совпадений идут по убыванию", () => {
    const envelope = tone();

    const suspects = findSuspects(
      { platform: "spotify", title: null, artist: null, url: null, confidence: 100, envelope },
      [
        download(envelope, { userId: "u-1" }),
        download(envelope, { userId: "u-2" }),
      ],
    );

    expect(suspects).toHaveLength(2);
    expect(suspects[0].match).toBeGreaterThanOrEqual(suspects[1].match);
  });
});
