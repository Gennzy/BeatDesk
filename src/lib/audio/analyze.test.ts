import { describe, expect, it } from "vitest";

import { analyzeChannels, formatDownbeat, formatTempo } from "./analyze";

const SAMPLE_RATE = 44100;

function clicks(channels: Float32Array[], seconds: number): Float32Array[] {
  const frames = channels.map((channel) => channel.length);
  const spb = 60 / 140;

  for (let beat = 0; beat * spb < seconds; beat += 1) {
    const start = Math.round(beat * spb * SAMPLE_RATE);
    const decay = Math.round(0.02 * SAMPLE_RATE);

    for (let i = 0; i < decay && start + i < frames[0]!; i += 1) {
      const envelope = (1 - i / decay) * 0.8;
      for (const channel of channels) {
        channel[start + i] = envelope * Math.sin((2 * Math.PI * 70 * (start + i)) / SAMPLE_RATE);
      }
    }
  }

  return channels;
}

const stereo = () => clicks([new Float32Array(SAMPLE_RATE * 8), new Float32Array(SAMPLE_RATE * 8)], 8);

describe("analyzeChannels", () => {
  it("разбирает клик в 140 BPM", () => {
    const result = analyzeChannels(stereo(), SAMPLE_RATE);

    expect(Math.abs(result.tempo.bpm - 140)).toBeLessThan(1);
    expect(result.duration).toBeCloseTo(8, 1);
  });

  it("один канал и два дают один темп", () => {
    const [left, right] = stereo();
    const stereoResult = analyzeChannels([left!, right!], SAMPLE_RATE);
    const monoResult = analyzeChannels([left!], SAMPLE_RATE);

    // Удар в левом и правом канале — один удар. Если считать по каналам
    // раздельно, темп удвоился бы.
    expect(Math.abs(stereoResult.tempo.bpm - monoResult.tempo.bpm)).toBeLessThan(2);
  });

  it("на тишине не выдумывает ни темп, ни тональность", () => {
    const silence = new Float32Array(SAMPLE_RATE * 4);
    const result = analyzeChannels([silence], SAMPLE_RATE);

    expect(result.tempo.bpm).toBe(0);
    expect(result.key).toBeNull();
  });

  it("на слишком коротком файле не выдумывает ответ", () => {
    const result = analyzeChannels([new Float32Array(SAMPLE_RATE / 2)], SAMPLE_RATE);

    expect(result.tempo.bpm).toBe(0);
    expect(result.duration).toBeCloseTo(0.5, 2);
  });

  it("на файле в полторы минуты не падает и остаётся быстрым", () => {
    const long = clicks([new Float32Array(SAMPLE_RATE * 90)], 90);
    const result = analyzeChannels(long, SAMPLE_RATE);

    expect(Math.abs(result.tempo.bpm - 140)).toBeLessThan(1);
  });
});

describe("formatTempo", () => {
  it("показывает десятую долю: 139,97 и 140,0 — это разные вещи", () => {
    expect(formatTempo({ bpm: 140, confidence: 1, downbeatOffset: 0, exact: true })).toBe("140.0 BPM");
    expect(formatTempo({ bpm: 139.97, confidence: 1, downbeatOffset: 0, exact: false })).toBe("140.0 BPM");
  });

  it("не выдумывает темп, если его нет", () => {
    expect(formatTempo({ bpm: 0, confidence: 0, downbeatOffset: 0, exact: false })).toBe("—");
  });
});

describe("formatDownbeat", () => {
  it("переводит фазу в доли и секунды", () => {
    const text = formatDownbeat({ bpm: 140, confidence: 1, downbeatOffset: 0.25, exact: true });
    expect(text).toContain("0,25 доли");
    expect(text).toMatch(/0[,.]107/u);
  });

  it("начало сетки так и называется началом", () => {
    expect(formatDownbeat({ bpm: 120, confidence: 1, downbeatOffset: 0, exact: true })).toContain("в начале");
  });

  it("фаза 0,999 — это ноль, а не почти целая доля", () => {
    expect(formatDownbeat({ bpm: 120, confidence: 1, downbeatOffset: 0.999, exact: true })).toContain("в начале");
  });
});