import { describe, expect, it } from "vitest";

import { createEngine } from "./engine";
import { encodeEnvelope, envelopeOf } from "@/lib/audio/fingerprint";
import type { Candidate, Source } from "./sources";

/**
 * Движок целиком.
 *
 * Проверяется главное: бит находится в трепе, где он играет не с начала,
 * и рядом находится тот, кто этот файл у нас брал.
 */

const SR = 8000;

const beatEnvelope = () => {
  const samples = new Float32Array(Math.floor(2 * SR));

  for (let i = 0; i < samples.length; i++) {
    const click = i % 4000 < 120 ? 1 : 0.15;
    samples[i] = Math.sin((2 * Math.PI * 2000 * i) / SR) * 0.5 * click;
  }

  return encodeEnvelope(envelopeOf(samples, SR));
};

const trackEnvelope = (before: number) => {
  const total = Math.floor(6 * SR);
  const samples = new Float32Array(total);
  const start = Math.floor(before * SR);

  for (let i = start; i < total; i++) {
    const click = (i - start) % 4000 < 120 ? 1 : 0.15;
    samples[i] = Math.sin((2 * Math.PI * 2000 * i) / SR) * 0.5 * click;
  }

  return encodeEnvelope(envelopeOf(samples, SR));
};

const candidate = (over: Partial<Candidate> = {}): Candidate => ({
  platform: "spotify",
  externalId: "track-1",
  title: "Ночной рейс",
  artist: "Артист",
  previewUrl: "https://example.com/prev.mp3",
  url: "https://open.spotify.com/track/track-1",
  ...over,
});

const source = (list: Candidate[]): Source => ({
  platform: "spotify",
  search: async () => list,
});

describe("движок", () => {
  it("находит бит в трепе, где он играет с середины", async () => {
    const engine = createEngine([source([candidate()])]);

    const matches = await engine.run(
      {
        query: { title: "Night Vision", artists: ["madk1d"] },
        envelope: beatEnvelope(),
        downloads: [],
        platforms: ["spotify"],
      },
      async () => trackEnvelope(2.5),
    );

    expect(matches).toHaveLength(1);
    expect(matches[0].confidence).toBeGreaterThan(90);
    expect(matches[0].verifiedByAudio).toBe(true);
  });

  it("указывает, кто из наших покупателей брал этот файл", async () => {
    /*
     * Это то, чего у Wavesmatch нет: у них нет списка покупателей, а у нас
     * есть. Ответ не «кто-то use», а «вот кто у нас брал».
     */
    const envelope = trackEnvelope(2.5);
    const engine = createEngine([source([candidate()])]);

    const matches = await engine.run(
      {
        query: { title: "Night Vision", artists: ["madk1d"] },
        envelope: beatEnvelope(),
        downloads: [
          { userId: "u-9", envelope, createdAt: "2026-03-12T10:00:00.000Z", label: "Иван" },
        ],
        platforms: ["spotify"],
      },
      async () => envelope,
    );

    expect(matches).toHaveLength(1);
    expect(matches[0].suspect?.userId).toBe("u-9");
    expect(matches[0].suspect?.label).toBe("Иван");
  });

  it("чужой треп в отчёт не попадает", async () => {
    const engine = createEngine([source([candidate()])]);

    const matches = await engine.run(
      {
        query: { title: "Night Vision", artists: ["madk1d"] },
        envelope: beatEnvelope(),
        downloads: [],
        platforms: ["spotify"],
      },
      async () => {
        const samples = new Float32Array(Math.floor(3 * SR));

        for (let i = 0; i < samples.length; i++) {
          const freq = 300 + (700 * i) / samples.length;
          samples[i] = Math.sin((2 * Math.PI * freq * i) / SR) * 0.5;
        }

        return encodeEnvelope(envelopeOf(samples, SR));
      },
    );

    expect(matches).toHaveLength(0);
  });

  it("кандидат без превью в отчёт не попадает", async () => {
    // YouTube не отдаёт звук: там сверять нечем, и называть это находкой
    // было бы враньём.
    const engine = createEngine([source([candidate({ previewUrl: null })])]);

    const matches = await engine.run(
      {
        query: { title: "Night Vision", artists: ["madk1d"] },
        envelope: beatEnvelope(),
        downloads: [],
        platforms: ["spotify"],
      },
      async () => null,
    );

    expect(matches).toHaveLength(0);
  });

  it("площадка, которая не ответила, не роняет поиск", async () => {
    const broken: Source = {
      platform: "spotify",
      search: async () => {
        throw new Error("площадка недоступна");
      },
    };

    const engine = createEngine([broken]);

    const matches = await engine.run(
      {
        query: { title: "Night Vision", artists: ["madk1d"] },
        envelope: beatEnvelope(),
        downloads: [],
        platforms: ["spotify"],
      },
      async () => trackEnvelope(0),
    );

    expect(matches).toEqual([]);
  });
});
