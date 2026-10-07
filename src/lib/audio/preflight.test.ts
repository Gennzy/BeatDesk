import { describe, expect, it } from "vitest";

import { blockers, checkAsset, checkAssets, type AssetFacts } from "./preflight";

const wav = (over: Partial<AssetFacts> = {}): AssetFacts => ({
  kind: "wav",
  bytes: 120 * 1024 * 1024,
  seconds: 184,
  bitsPerSample: 24,
  sampleRate: 44100,
  channels: 2,
  ...over,
});

const mp3 = (over: Partial<AssetFacts> = {}): AssetFacts => ({
  kind: "mp3",
  bytes: 8 * 1024 * 1024,
  seconds: 184,
  bitsPerSample: 16,
  sampleRate: 44100,
  channels: 2,
  kbps: 320,
  ...over,
});

const byId = (findings: ReturnType<typeof checkAsset>, id: string) => findings.find((item) => item.id === id)!;

describe("checkAsset: мастер", () => {
  it("пропускает мастер, соответствующий нашим требованиям", () => {
    const findings = checkAsset("wav", wav());

    expect(blockers(findings)).toEqual([]);
    expect(findings.every((item) => item.ok)).toBe(true);
  });

  it("ловит моно: мастер без стерео не годится", () => {
    const channels = byId(checkAsset("wav", wav({ channels: 1 })), "channels");

    expect(channels.ok).toBe(false);
    expect(channels.severity).toBe("block");
    expect(channels.expected).toContain("два");
  });

  it("ловит разрядность вне диапазона в обе стороны", () => {
    expect(byId(checkAsset("wav", wav({ bitsPerSample: 8 })), "bits").ok).toBe(false);
    expect(byId(checkAsset("wav", wav({ bitsPerSample: 64 })), "bits").ok).toBe(false);
    expect(byId(checkAsset("wav", wav({ bitsPerSample: 32 })), "bits").ok).toBe(true);
  });

  it("ловит частоту вне 44,1–48 кГц", () => {
    expect(byId(checkAsset("wav", wav({ sampleRate: 22050 })), "sampleRate").ok).toBe(false);
    expect(byId(checkAsset("wav", wav({ sampleRate: 96000 })), "sampleRate").ok).toBe(false);
    expect(byId(checkAsset("wav", wav({ sampleRate: 48000 })), "sampleRate").ok).toBe(true);
  });

  it("ловит файл тяжелее 300 МБ", () => {
    const findings = checkAsset("wav", wav({ bytes: 400 * 1024 * 1024 }));

    expect(byId(findings, "size").ok).toBe(false);
    expect(byId(findings, "size").severity).toBe("block");
  });

  it("ловит трек длиннее десяти минут", () => {
    expect(byId(checkAsset("wav", wav({ seconds: 700 })), "duration").ok).toBe(false);
    expect(byId(checkAsset("wav", wav({ seconds: 599 })), "duration").ok).toBe(true);
  });
});

describe("checkAsset: превью", () => {
  it("ловит MP3 ниже 320 кбит/с", () => {
    const bitrate = byId(checkAsset("mp3", mp3({ kbps: 192 })), "bitrate");

    expect(bitrate.ok).toBe(false);
    expect(bitrate.expected).toContain("320");
  });

  it("ловит превью тяжелее 15 МБ", () => {
    expect(byId(checkAsset("mp3", mp3({ bytes: 20 * 1024 * 1024 })), "size").ok).toBe(false);
  });

  it("превью в 16 бит — норма, в отличие от дорожек", () => {
    // Превью слушают в браузере, а не сводят в DAW.
    expect(byId(checkAsset("mp3", mp3({ bitsPerSample: 16 })), "bits").ok).toBe(true);
  });
});

describe("checkAsset: дорожки", () => {
  it("ловит 16-битные дорожки: покупатель их сводит", () => {
    const bits = byId(checkAsset("stems", { kind: "stems", bytes: 80 * 1024 * 1024, bitsPerSample: 16, sampleRate: 44100, channels: 2 }), "bits");

    expect(bits.ok).toBe(false);
    expect(bits.expected).toContain("24");
  });

  it("24-битные дорожки проходят", () => {
    const bits = byId(checkAsset("stems", { kind: "stems", bytes: 80 * 1024 * 1024, bitsPerSample: 24, sampleRate: 48000, channels: 2 }), "bits");

    expect(bits.ok).toBe(true);
  });
});

describe("два разных молчания", () => {
  it("нет требования — это «не задано», и доверие неизвестно", () => {
    // Требования к обложке мы не назвали. Выдумать число — значит отвергнуть
    // нормальную обложку.
    const size = byId(checkAsset("artwork", { kind: "artwork", bytes: 500 * 1024, width: 800, height: 800 }), "artwork.size");

    expect(size.ok).toBe(true);
    expect(size.skip).toBe("no-rule");
    expect(size.trust).toBe("unknown");
  });

  it("требование есть, а файл не прочитали — это другой случай", () => {
    // Требование к мастеру задано, но характеристики неизвестны: сказать
    // «всё в порядке» здесь враньё, потому что проверить было нечем.
    const bits = byId(checkAsset("wav", { kind: "wav", bytes: 120 * 1024 * 1024 }), "bits");

    expect(bits.ok).toBe(true);
    expect(bits.skip).toBe("unreadable");
    expect(bits.expected).toContain("не удалось прочитать");
    // Доверие тут не отсутствует: требование наше и мы его знаем.
    expect(bits.trust).not.toBe("unknown");
  });

  it("пропущенная проверка никогда не выглядит как пройденная", () => {
    // Иначе битмейкер увидит сплошные галочки и решит, что файл смотрели.
    const findings = checkAsset("wav", { kind: "wav", bytes: 120 * 1024 * 1024 });

    for (const finding of findings.filter((item) => item.skip !== undefined)) {
      expect(finding.severity, finding.id).toBe("info");
      expect(finding.expected, finding.id).toBeTruthy();
    }
  });
});

describe("у каждого блокера указан источник", () => {
  it("иначе битмейкер не поймёт, что именно нарушено", () => {
    for (const finding of checkAsset("wav", wav({ channels: 1, bitsPerSample: 8 }))) {
      if (finding.severity === "block") expect(finding.source, finding.id).toBeTruthy();
    }
  });
});

describe("checkAssets", () => {
  it("проверяет каждый файл и собирает всё в один список", () => {
    const findings = checkAssets([wav({ channels: 1 }), mp3({ kbps: 128 })]);

    expect(findings.filter((item) => item.severity === "block" && !item.ok)).toHaveLength(2);
  });

  it("пустой набор файлов не считается нарушением", () => {
    expect(blockers(checkAssets([]))).toEqual([]);
  });
});

describe("обложка", () => {
  it("квадратная обложка проходит, вытянутая — предупреждение", () => {
    const square = checkAsset("artwork", { kind: "artwork", bytes: 500 * 1024, width: 1400, height: 1400 });
    const stretched = checkAsset("artwork", { kind: "artwork", bytes: 500 * 1024, width: 1400, height: 800 });

    expect(byId(square, "artwork.square").ok).toBe(true);
    expect(byId(stretched, "artwork.square").ok).toBe(false);
    // Не блокер: обложку можно обрезать, об этом честнее сказать заранее.
    expect(byId(stretched, "artwork.square").severity).toBe("warn");
  });

  it("непрочитанная обложка не выглядит как подтверждённая квадратность", () => {
    const finding = byId(checkAsset("artwork", { kind: "artwork", bytes: 500 * 1024 }), "artwork.square");

    expect(finding.skip).toBe("unreadable");
  });
});
