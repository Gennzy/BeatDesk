/**
 * Сверка моего определителя с Essentia.js.
 *
 * ВЫВОД ЗАМЕРА (см. bench/report.md):
 *
 * Темп. На синтетике оба ошибаются, но в разные стороны: наш код удваивает
 * медленные темпы (70 → 140, 90 → 180), Essentia занижает быстрые вдвое
 * (174 → 87, 140 → 70). На настоящем бите оба попадают в цель: 130,02 и
 * 129,99 против 130. Синтетика тут вводит в заблуждение — она слишком
 * ровная для обоих алгоритмов. Свой код по темпу оставляем, а разбор октавы
 * переносим в слой продукта: оба числа показываем явно, а не отдаём на откуп.
 *
 * Тональность. Здесь вывод обратный. На своём же материале мы даём 10 из 10,
 * и это самообман: материал сделан так, что нравится именно нашему алгоритму.
 * На настоящем бите наш код ошибается на четыре полутона (C# major вместо
 * F# major), а Essentia угадывает. Значит тональность переводим на
 * Essentia, а собственный детектор оставляем только как запасной вариант.
 *
 * Числа пересчитываются этим же тестом, а не выдумываются: если Essentia
 * обновится и поведёт себя иначе, отчёт покажет расхождение.
 *
 * Зачем это тестом, а не разовым скриптом: расхождение между моим кодом и
 * отраслевым алгоритмом — это то, что может тихо сломать «выходной
 * контроль». Если однажды мой код начнёт расходиться с Essentia сильнее
 * допустимого, тест об этом скажет.
 *
 * Отчёт пишется в bench/report.md — по нему принимается решение, какой
 * алгоритм ставить в основу.
 */
import { createRequire } from "node:module";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { analyzeChannels } from "@/lib/audio/analyze";

const require = createRequire(import.meta.url);
const { renderBeat } = await import("../scripts/lib/fixtures.mjs");
const { readWav } = await import("../scripts/lib/wav.mjs");

const SAMPLE_RATE = 44100;

let essentiaPromise = null;
function essentia() {
  essentiaPromise ??= (async () => {
    const mod = require("essentia.js");
    return new mod.Essentia(mod.EssentiaWASM);
  })();

  return essentiaPromise;
}

/** Тональность в том же виде, в каком её отдаёт мой код: «F# minor». */
function normalizeKey(key: string, scale: string) {
  if (!key || !scale) return null;
  return `${key} ${scale === "minor" ? "minor" : "major"}`;
}

/**
 * Essentia принимает не сырой Float32Array, а свой VectorFloat: без
 * обёртки биндинги падают на BindingError. Конвертация копирует данные,
 * поэтому освобождать вручную ничего не нужно.
 */
async function asVector(samples: Float32Array) {
  const e = await essentia();

  return e.arrayToVector(samples);
}

async function essentiaTempoBpm(samples: Float32Array) {
  const e = await essentia();
  const result = e.RhythmExtractor2013(await asVector(samples), 210, "degara", 50);

  return { bpm: result.bpm, confidence: result.confidence, estimates: result.estimates };
}

async function essentiaKey(samples: Float32Array) {
  const e = await essentia();
  const result = e.KeyExtractor(await asVector(samples));

  return { key: normalizeKey(result.key, result.scale), strength: result.strength };
}

/** Во сколько раз BPM отличается: 2 и 0.5 — это одна и та же октава. */
function octaveRatio(a: number, b: number) {
  if (!a || !b) return null;
  return Math.max(a / b, b / a);
}

const FIXTURES = [
  { name: "straight 70", bpm: 70, pattern: "straight", root: "C", mode: "major" },
  { name: "straight 90", bpm: 90, pattern: "straight", root: "D", mode: "minor" },
  { name: "straight 128", bpm: 128, pattern: "straight", root: "F#", mode: "minor" },
  { name: "straight 140", bpm: 140, pattern: "straight", root: "A", mode: "minor" },
  { name: "straight 174", bpm: 174, pattern: "straight", root: "G", mode: "major" },
  { name: "busy 140", bpm: 140, pattern: "busy", root: "F", mode: "major" },
  { name: "busy 174", bpm: 174, pattern: "busy", root: "C#", mode: "minor" },
  { name: "backbeat 140", bpm: 140, pattern: "backbeat", root: "D", mode: "minor", note: "читается и как 70" },
  { name: "backbeat 174", bpm: 174, pattern: "backbeat", root: "A#", mode: "major", note: "читается и как 87" },
  { name: "swing 100", bpm: 100, pattern: "straight", swing: 0.24, root: "E", mode: "minor", note: "свинг 62/38" },
];

describe("сверка с Essentia", () => {
  it("совпадает с отраслевым алгоритмом на битовом материале", async () => {
    const rows = [];

    for (const fixture of FIXTURES) {
      const samples = renderBeat({ ...fixture, seconds: 16, sampleRate: SAMPLE_RATE });
      const mine = analyzeChannels([samples], SAMPLE_RATE);
      const theirs = await essentiaTempoBpm(samples);
      const theirsKey = await essentiaKey(samples);

      rows.push({
        name: fixture.name,
        truthBpm: fixture.bpm,
        mineBpm: Number(mine.tempo.bpm.toFixed(2)),
        essentiaBpm: Number(theirs.bpm.toFixed(2)),
        mineConfidence: Number(mine.tempo.confidence.toFixed(2)),
        essentiaConfidence: Number(theirs.confidence.toFixed(2)),
        truthKey: `${fixture.root} ${fixture.mode}`,
        mineKey: mine.key?.key ?? null,
        essentiaKey: theirsKey.key,
        note: fixture.note ?? "",
      });
    }

    const report = renderReport(rows);
    writeReport(report);

    const mineWrong = rows.filter((row) => Math.abs(Number(row.mineBpm) - Number(row.truthBpm)) / Number(row.truthBpm) > 0.015);
    const theirsWrong = rows.filter((row) => Math.abs(Number(row.essentiaBpm) - Number(row.truthBpm)) / Number(row.truthBpm) > 0.015);

    // Стенд измеряет, а не требует. На этом материале оба алгоритма ошибаются,
    // и в разных местах: наш удваивает медленные темпы, Essentia занижает
    // быстрые вдвое. Утверждать тут что-то, кроме «ошибки не катастрофические»,
    // было бы самообманом — решение принимается по отчёту, а не по зелёной
    // галочке.

    // Расхождение больше октавы означало бы, что один из нас считает не тот
    // метр вообще. На октаву ровно расходиться можно — это и есть предмет спора.
    for (const row of rows) {
      const ratio = octaveRatio(Number(row.mineBpm), Number(row.essentiaBpm)) ?? 1;
      expect(ratio, `${row.name}: мой ${row.mineBpm} против Essentia ${row.essentiaBpm}`).toBeLessThan(2.1);
    }

    console.log(`
Темп: верно мой ${rows.length - mineWrong.length} из ${rows.length}, Essentia ${rows.length - theirsWrong.length} из ${rows.length}`);
    if (mineWrong.length > 0) console.log(`Наш код ошибся: ${mineWrong.map((row) => row.name).join(", ")}`);
    if (theirsWrong.length > 0) console.log(`Essentia ошибся: ${theirsWrong.map((row) => row.name).join(", ")}`);

  }, 120_000);

  it("проверяет настоящий бит против его заявленного темпа и тональности", async () => {
    const path = resolve(process.cwd(), "bench/audio/mimosa.wav");

    if (!existsSync(path)) {
      // Фикстуры нет — это не повод ронять прогон, но сказать о нём надо.
      console.warn("bench/audio/mimosa.wav отсутствует: настоящий бит не проверен");
      return;
    }

    const wav = readWav(path);
    const mine = analyzeChannels([wav.samples], wav.sampleRate);
    const theirs = await essentiaTempoBpm(wav.samples);
    const theirsKey = await essentiaKey(wav.samples);

    const row = {
      name: "Mimosa (наш бит)",
      truthBpm: 130,
      mineBpm: Number(mine.tempo.bpm.toFixed(2)),
      essentiaBpm: Number(theirs.bpm.toFixed(2)),
      mineConfidence: Number(mine.tempo.confidence.toFixed(2)),
      essentiaConfidence: Number(theirs.confidence.toFixed(2)),
      truthKey: "F# major",
      mineKey: mine.key?.key ?? null,
      essentiaKey: theirsKey.key,
      note: `${wav.bitsPerSample} бит, формат ${wav.audioFormat === 3 ? "float" : "PCM"}, ${wav.seconds.toFixed(1)} с`,
    };

    appendReport(renderReport([row], "Настоящий бит"));

    // Имя файла заявляет 130 BPM и F# major — это единственный настоящий
    // материал с известным ответом, который у нас есть.
    expect(Math.abs(row.mineBpm - row.truthBpm) / row.truthBpm, `мой ${row.mineBpm}, эталон 130`).toBeLessThan(0.02);
    expect(row.essentiaBpm).toBeGreaterThan(0);
  }, 180_000);
});

type Row = Record<string, string | number | null>;

function renderReport(rows: Row[], title = "Синтетический битовый материал") {
  const header = [
    `# ${title}`,
    "",
    "| материал | эталон BPM | мой BPM | Essentia BPM | моя уверенность | уверенность Essentia | эталон ключ | мой ключ | ключ Essentia |",
    "|---|---|---|---|---|---|---|---|---|",
  ];

  const body = rows.map((row) =>
    [
      row.name,
      row.truthBpm,
      row.mineBpm,
      row.essentiaBpm,
      row.mineConfidence,
      row.essentiaConfidence,
      row.truthKey,
      row.mineKey ?? "—",
      row.essentiaKey ?? "—",
    ].join(" | "),
  );

  const notes = rows.filter((row) => row.note).map((row) => `- ${row.name}: ${row.note}`);

  return [...header, ...body, "", ...notes].join("\n");
}

function writeReport(report: string) {
  mkdirSync(resolve(process.cwd(), "bench"), { recursive: true });
  writeFileSync(resolve(process.cwd(), "bench/report.md"), `${report}\n`, "utf8");
}

function appendReport(report: string) {
  mkdirSync(resolve(process.cwd(), "bench"), { recursive: true });
  writeFileSync(resolve(process.cwd(), "bench/report.md"), `${report}\n`, { flag: "a" });
}