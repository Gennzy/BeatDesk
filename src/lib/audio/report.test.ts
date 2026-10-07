import { describe, expect, it } from "vitest";

import { MAX_ASSET_BYTES } from "@/lib/beats";

import { buildReport, soldTiers, type ReportInput } from "./report";
import type { TierId } from "./delivery-rules";

const ALL: TierId[] = ["mp3", "bundle", "trackout", "exclusive"];

const files = [
  { name: "Пыль в луче.wav", role: "wav" as const },
  { name: "Пыль в луче.mp3", role: "mp3" as const },
  { name: "stems.zip", role: "stems" as const },
  { name: "cover.png", role: "artwork" as const },
];

const input = (over: Partial<ReportInput> = {}): ReportInput => ({
  tiers: ALL,
  assets: [{ kind: "wav", bytes: 120 * 1024 * 1024, seconds: 184, bitsPerSample: 24, sampleRate: 44100, channels: 2 }],
  declared: { bpm: 130, key: "F# major", title: "Пыль в луче" },
  measured: { bpm: 130.02, key: "F# major", keyConfidence: 0.8 },
  package: {
    title: "Пыль в луче",
    bpm: 130,
    key: "F# major",
    genre: "Boom bap",
    tags: ["dark"],
    files,
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

  it("требует правки, когда нарушено то, что мы задали сами", () => {
    const report = buildReport(input({
      assets: [{ kind: "wav", bytes: MAX_ASSET_BYTES + 1, seconds: 184, bitsPerSample: 24, sampleRate: 44100, channels: 1 }],
    }));

    expect(report.verdict).toBe("fix");
    expect(report.blockers.map((row) => row.id)).toContain("size");
    expect(report.blockers.map((row) => row.id)).toContain("channels");
  });

  it("ошибка в темпе блокирует продажу", () => {
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

  it("известная ошибка важнее того, что мы не смогли проверить", () => {
    // Файл не прочитан, но уровень без мастера — это наш собственный
    // блокер, и он важнее любого «не знаю».
    const report = buildReport(input({
      tiers: ["bundle"],
      assets: [{ kind: "wav", bytes: 10 * 1024 * 1024 }],
      package: { ...input().package, files: [{ name: "cover.png", role: "artwork" }] },
    }));

    expect(report.verdict).toBe("fix");
    expect(report.blockers.map((row) => row.id)).toContain("files.noMaster");
  });
});

describe("невыполнимый заказ важнее всего", () => {
  it("уровень с ценой, но без файла — блокер", () => {
    const report = buildReport(input({
      tiers: ["trackout"],
      package: { ...input().package, files: files.filter((file) => file.role !== "stems") },
    }));

    expect(report.verdict).toBe("fix");
    expect(report.blockers.map((row) => row.id)).toContain("tier.trackout.no-stems");
  });

  it("тот же бит без Track Out в продаже — готов", () => {
    // Отсутствие дорожек перестаёт быть проблемой, когда их никто не покупает.
    const report = buildReport(input({
      tiers: ["mp3"],
      package: { ...input().package, files: files.filter((file) => file.role !== "stems") },
    }));

    expect(report.verdict).toBe("ready");
  });

  it("вердикт зависит от того, что выставлено на продажу", () => {
    const withoutStems = { ...input().package, files: files.filter((file) => file.role !== "stems") };

    expect(buildReport(input({ tiers: ["mp3"], package: withoutStems })).verdict).toBe("ready");
    expect(buildReport(input({ tiers: ["mp3", "trackout"], package: withoutStems })).verdict).toBe("fix");
  });
});

describe("молчание отчёта", () => {
  it("файл, который не удалось прочитать, не выглядит как проверенный", () => {
    // Требование к мастеру задано, но характеристики неизвестны. Сказать
    // «готово» здесь враньё: покупатель получит файл, который мы не смотрели.
    const report = buildReport(input({ assets: [{ kind: "wav", bytes: 120 * 1024 * 1024 }] }));

    expect(report.rows.some((row) => row.detail?.includes("не удалось прочитать"))).toBe(true);
    expect(report.unknown).toBe(0);
  });

  it("требования, которых мы не задали, остаются неизвестными", () => {
    // К обложке нижнюю границу мы не назвали. Обложка в бите есть — значит
    // неизвестность видна и не прячется за зелёной галочкой.
    const report = buildReport(input({
      assets: [...input().assets, { kind: "artwork", bytes: 400 * 1024, width: 1400, height: 1400 }],
    }));

    expect(report.unknown).toBeGreaterThan(0);
    expect(report.rows.some((row) => row.detail?.includes("не задано"))).toBe(true);
  });

  it("неизвестное правило не мешает, если такого файла в бите нет", () => {
    // Требования к размеру обложки нет, и обложки тоже нет — повода
    // тревожить битмейкера тоже нет.
    const report = buildReport(input());

    expect(report.unknown).toBe(0);
    expect(report.verdict).toBe("ready");
  });
});

describe("soldTiers", () => {
  it("берёт уровни с выставленной ценой", () => {
    expect(soldTiers({ mp3: 500, bundle: 1500, trackout: null, exclusive: 5000 })).toEqual(["mp3", "bundle", "exclusive"]);
  });

  it("нулевая цена — это не продажа", () => {
    expect(soldTiers({ mp3: 0, bundle: 1500 })).toEqual(["bundle"]);
  });

  it("пустые цены не дают уровней", () => {
    expect(soldTiers({ mp3: null, bundle: null, trackout: null, exclusive: null })).toEqual([]);
    expect(soldTiers({})).toEqual([]);
  });
});

describe("слои отчёта", () => {
  it("каждая строка принадлежит ровно одному слою", () => {
    const report = buildReport(input({
      declared: { bpm: 90, key: "C# major", title: "" },
      assets: [{ kind: "wav", bytes: MAX_ASSET_BYTES + 1, channels: 1 }],
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
      assets: [{ kind: "wav", bytes: MAX_ASSET_BYTES + 1, channels: 1 }],
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

  it("отчёт помнит, какие уровни проверял", () => {
    expect(buildReport(input({ tiers: ["mp3"] })).tiers).toEqual(["mp3"]);
  });
});
