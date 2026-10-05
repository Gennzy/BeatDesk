import { describe, expect, it } from "vitest";

import { blockers, checkAsset, checkAssets, type AssetFacts } from "./preflight";
import { platformRules } from "./platform-rules";

const beatstars = platformRules("beatstars")!;
const airbit = platformRules("airbit")!;

const wav = (over: Partial<AssetFacts> = {}): AssetFacts => ({
  kind: "wav",
  bytes: 120 * 1024 * 1024,
  seconds: 184,
  bitsPerSample: 24,
  sampleRate: 44100,
  channels: 2,
  ...over,
});

const byId = (findings: ReturnType<typeof checkAsset>, id: string) => findings.find((item) => item.id === id)!;

describe("checkAsset: BeatStars", () => {
  it("пропускает мастер, соответствующий требованиям", () => {
    const findings = checkAsset(beatstars, wav());

    expect(blockers(findings)).toEqual([]);
    expect(findings.every((item) => item.ok)).toBe(true);
  });

  it("ловит моно: площадка требует ровно два канала", () => {
    const findings = checkAsset(beatstars, wav({ channels: 1 }));
    const channels = byId(findings, "channels");

    expect(channels.ok).toBe(false);
    expect(channels.severity).toBe("block");
    expect(channels.expected).toContain("два");
  });

  it("ловит разрядность вне диапазона в обе стороны", () => {
    expect(byId(checkAsset(beatstars, wav({ bitsPerSample: 8 })), "bits").ok).toBe(false);
    expect(byId(checkAsset(beatstars, wav({ bitsPerSample: 64 })), "bits").ok).toBe(false);
    expect(byId(checkAsset(beatstars, wav({ bitsPerSample: 32 })), "bits").ok).toBe(true);
  });

  it("ловит частоту вне 44,1–48 кГц", () => {
    expect(byId(checkAsset(beatstars, wav({ sampleRate: 22050 })), "sampleRate").ok).toBe(false);
    expect(byId(checkAsset(beatstars, wav({ sampleRate: 96000 })), "sampleRate").ok).toBe(false);
    expect(byId(checkAsset(beatstars, wav({ sampleRate: 48000 })), "sampleRate").ok).toBe(true);
  });

  it("ловит файл тяжелее 300 МБ", () => {
    const findings = checkAsset(beatstars, wav({ bytes: 400 * 1024 * 1024 }));

    expect(byId(findings, "size").ok).toBe(false);
    expect(byId(findings, "size").severity).toBe("block");
  });

  it("ловит трек длиннее десяти минут", () => {
    expect(byId(checkAsset(beatstars, wav({ seconds: 700 })), "duration").ok).toBe(false);
    expect(byId(checkAsset(beatstars, wav({ seconds: 599 })), "duration").ok).toBe(true);
  });

  it("ловит MP3 ниже 320 кбит/с", () => {
    const mp3: AssetFacts = {
      kind: "mp3",
      bytes: 8 * 1024 * 1024,
      seconds: 184,
      bitsPerSample: 16,
      sampleRate: 44100,
      channels: 2,
      kbps: 192,
    };

    const bitrate = byId(checkAsset(beatstars, mp3), "bitrate");
    expect(bitrate.ok).toBe(false);
    expect(bitrate.expected).toContain("320");
  });

  it("у каждого правила BeatStars указан источник", () => {
    for (const finding of checkAsset(beatstars, wav({ channels: 1, bitsPerSample: 8 }))) {
      if (finding.severity === "block") expect(finding.source, finding.id).toBeTruthy();
    }
  });
});

describe("checkAsset: площадки без опубликованных требований", () => {
  it("Airbit не выдумывает ограничений и не ругается на мастер", () => {
    // У Airbit аудиотребований не опубликовано. Если начать проверять по
    // догадке, битмейкер получит выдуманное «нарушение».
    expect(blockers(checkAsset(airbit, wav()))).toEqual([]);
    expect(blockers(checkAsset(airbit, wav({ channels: 1, bitsPerSample: 8, sampleRate: 22050 })))).toEqual([]);
  });

  it("но помечает, что требования неизвестны", () => {
    const findings = checkAsset(airbit, wav());

    expect(findings.some((item) => item.expected?.includes("не опубликовано"))).toBe(true);
  });

  it("BeatChain ведёт себя так же", () => {
    expect(blockers(checkAsset(platformRules("beatchain")!, wav()))).toEqual([]);
  });
});

describe("checkAssets", () => {
  it("проверяет каждый файл и собирает всё в один список", () => {
    const findings = checkAssets(beatstars, [
      wav({ channels: 1 }),
      { kind: "mp3", bytes: 8 * 1024 * 1024, seconds: 184, bitsPerSample: 16, sampleRate: 44100, channels: 2, kbps: 128 },
    ]);

    expect(findings.filter((item) => item.severity === "block" && !item.ok)).toHaveLength(2);
  });

  it("пустой набор файлов не считается нарушением", () => {
    expect(blockers(checkAssets(beatstars, []))).toEqual([]);
  });
});

describe("обложка", () => {
  it("квадратная обложка проходит, вытянутая — предупреждение", () => {
    const square = checkAsset(beatstars, { kind: "artwork", bytes: 500 * 1024, width: 1400, height: 1400 });
    const stretched = checkAsset(beatstars, { kind: "artwork", bytes: 500 * 1024, width: 1400, height: 800 });

    expect(byId(square, "artwork.square").ok).toBe(true);
    expect(byId(stretched, "artwork.square").ok).toBe(false);
    // Не блокер: площадка обрежет сама, предупреждаем заранее.
    expect(byId(stretched, "artwork.square").severity).toBe("warn");
  });
});
