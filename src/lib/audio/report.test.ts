import { describe, expect, it } from "vitest";

import { buildReport, type ReportInput } from "./report";

const input = (over: Partial<ReportInput> = {}): ReportInput => ({
  platform: "beatstars",
  assets: [{ kind: "wav", bytes: 120 * 1024 * 1024, seconds: 184, bitsPerSample: 24, sampleRate: 44100, channels: 2 }],
  declared: { bpm: 130, key: "F# major", title: "Пыль в луче" },
  measured: { bpm: 130.02, key: "F# major", keyConfidence: 0.8 },
  package: {
    title: "Пыль в луче",
    bpm: 130,
    key: "F# major",
    genre: "Boom bap",
    tags: ["dark"],
    files: [{ name: "Пыль в луче.wav", role: "wav" }],
    embedded: { title: "Пыль в луче", bpm: 130, key: "F# major" },
  },
  ...over,
});

describe("вердикт выходного контроля", () => {
  it("готов, когда всё совпало и все правила известны", () => {
    const report = buildReport(input());

    expect(report.verdict).toBe("ready");
    expect(report.blockers).toEqual([]);
    expect(report.unknown).toBe(0);
  });

  it("требует правки, когда площадка запрещает то, что мы нашли", () => {
    const report = buildReport(input({
      assets: [{ kind: "wav", bytes: 400 * 1024 * 1024, seconds: 184, bitsPerSample: 24, sampleRate: 44100, channels: 1 }],
    }));

    expect(report.verdict).toBe("fix");
    expect(report.blockers.map((row) => row.id)).toContain("size");
    expect(report.blockers.map((row) => row.id)).toContain("channels");
  });

  it("ошибка в темпе блокирует выкладку на BeatStars", () => {
    const report = buildReport(input({ declared: { bpm: 90, key: "F# major", title: "Пыль в луче" } }));

    expect(report.verdict).toBe("fix");
    expect(report.blockers.find((row) => row.id === "tempo")?.layer).toBe("metadata");
  });

  it("тот же темп на половине — предупреждение, а не отказ", () => {
    const report = buildReport(input({
      declared: { bpm: 65, key: "F# major", title: "Пыль в луче" },
      measured: { bpm: 130.02, key: "F# major", keyConfidence: 0.8 },
    }));

    expect(report.verdict).toBe("ready");
    expect(report.warnings.map((row) => row.id)).toContain("tempo");
  });

  it("неизвестные требования не превращаются в зелёную галочку", () => {
    // У Airbit аудиоспецификации нет. Сказать «готово» — значит соврать.
    const report = buildReport(input({ platform: "airbit" }));

    expect(report.verdict).toBe("unknown");
    expect(report.blockers).toEqual([]);
    expect(report.unknown).toBeGreaterThan(0);
    expect(report.rows.some((row) => row.detail?.includes("не опубликовано"))).toBe(true);
  });

  it("у BeatChain вердикт тоже «неизвестно»", () => {
    expect(buildReport(input({ platform: "beatchain" })).verdict).toBe("unknown");
  });

  it("известная ошибка важнее неизвестных правил", () => {
    // У Airbit требований к аудио нет, но отсутствие мастера — это наш
    // собственный блокер, и он важнее любого «не знаю».
    const report = buildReport(input({
      platform: "airbit",
      assets: [{ kind: "wav", bytes: 10 * 1024 * 1024, channels: 1 }],
      package: { ...input().package, files: [{ name: "cover.png", role: "artwork" }] },
    }));

    expect(report.verdict).toBe("fix");
    expect(report.blockers.map((row) => row.id)).toContain("files.noMaster");
    expect(report.unknown).toBeGreaterThan(0);
  });

  it("неизвестное правило не мешает, если такого файла в пакете нет", () => {
    // Размер обложки у BeatStars не опубликован, но обложки в пакете нет —
    // и повода тревожить битмейкера тоже нет.
    const report = buildReport(input());

    expect(report.unknown).toBe(0);
    expect(report.verdict).toBe("ready");
  });

  it("но если обложка приложена, неизвестность всплывает", () => {
    const report = buildReport(input({
      assets: [...input().assets, { kind: "artwork", bytes: 400 * 1024, width: 1400, height: 1400 }],
    }));

    expect(report.verdict).toBe("unknown");
    expect(report.unknown).toBeGreaterThan(0);
  });
});

describe("слои отчёта", () => {
  it("каждая строка принадлежит ровно одному слою", () => {
    const report = buildReport(input({
      declared: { bpm: 90, key: "C# major", title: "" },
      assets: [{ kind: "wav", bytes: 400 * 1024 * 1024, channels: 1 }],
    }));

    for (const row of report.rows) {
      expect(["files", "metadata", "hygiene"], row.id).toContain(row.layer);
    }
  });

  it("блокер всегда сопровождается советом", () => {
    // Молчаливое «нельзя» хуже, чем неправильная выкладка: человек не знает,
    // что именно чинить.
    const report = buildReport(input({
      declared: { bpm: 90, key: "F# major", title: "" },
      assets: [{ kind: "wav", bytes: 400 * 1024 * 1024, channels: 1 }],
    }));

    for (const row of report.blockers) {
      expect(row.suggestion, row.id).toBeTruthy();
    }
  });

  it("все строки поступают из известных слоёв, а счётчики не пересекаются", () => {
    const report = buildReport(input({ declared: { bpm: 90, title: "" } }));

    expect(report.blockers.length + report.warnings.length).toBeLessThanOrEqual(report.rows.length);
    expect(report.rows.some((row) => row.ok && row.severity !== "info")).toBe(false);
  });

  it("id строк уникальны: иначе интерфейс не сможет ними пользоваться", () => {
    const report = buildReport(input({ declared: { bpm: 90, key: "C# major", title: "" } }));
    const ids = report.rows.map((row) => row.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it("в готовом отчёте нет строк о неизвестных требованиях BeatStars", () => {
    const rows = buildReport(input()).rows.filter((row) => row.trust === "unknown");

    expect(rows).toEqual([]);
  });
});
