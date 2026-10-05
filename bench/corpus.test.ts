import { existsSync, readdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { analyzeChannels } from "@/lib/audio/analyze";
import { parseKey } from "@/lib/audio/metadata";

const { readWav } = await import("../scripts/lib/wav.mjs");

/**
 * Отчёт по размеченной выборке.
 *
 * Файлы лежат в загрузках и в репозиторий не попадают: это рабочий материал,
 * а не тестовые данные. Путь переопределяется переменной окружения.
 *
 * Ключевая оговорка: выборка набрана не из битов, а из лупов и вокальных
 * сэмплов. У лупа без ударных нет темпа, который можно услышать, и требовать
 * от детектора точного числа значит заранее гарантировать провал. Поэтому
 * файл сначала проверяется на ритмичность и попадает в одну из двух групп.
 */

const CORPUS_DIR = process.env.BEATDESK_CORPUS ?? join(homedir(), "Downloads");

type Label = { bpm: number; key?: string };

/** `dark-drill-vox_146bpm_G_minor.wav` → `{ bpm: 146, key: "G minor" }`. */
function parseName(name: string): Label | null {
  if (!/\d{2,3}\s?bpm/i.test(name)) return null;

  const bpm = Number(name.match(/(\d{2,3})\s?bpm/i)?.[1]);
  if (!Number.isFinite(bpm) || bpm < 40 || bpm > 240) return null;

  // Ключ идёт после BPM: `_G_minor`, `_A#_minor`, `_C_major`.
  const tail = name.slice((name.match(/\d{2,3}\s?bpm/i)?.index ?? 0) + name.match(/\d{2,3}\s?bpm/i)![0].length);
  const key = tail.match(/^_?([A-G](?:#)?)_?(major|minor)/i);

  return { bpm, key: key ? `${key[1].toUpperCase()} ${key[2].toLowerCase()}` : undefined };
}

/** Слова, по которым видно, что это луп, а не бит. */
const LOOP_WORDS = /loop|vox|vocal|choir|acapella|guitar|melody|chop|fx|laugh|pitched|singing/i;

function corpusFiles() {
  if (!existsSync(CORPUS_DIR)) return [];

  return readdirSync(CORPUS_DIR)
    .map((name) => ({ name, path: join(CORPUS_DIR, name) }))
    .map((file) => ({ ...file, label: parseName(file.name) }))
    .filter((file): file is typeof file & { label: Label } => file.label !== null);
}

/** Отношение темпа, разложенное на понятные случаи. */
function verdict(declared: number, measured: number) {
  if (measured <= 0) return { kind: "нет ответа", ratio: 0 };

  const ratio = measured / declared;
  const near = (target: number) => Math.abs(ratio / target - 1);

  if (near(1) <= 0.03) return { kind: "точно", ratio };
  if (near(0.5) <= 0.03) return { kind: "вдвое медленнее", ratio };
  if (near(2) <= 0.03) return { kind: "вдвое быстрее", ratio };
  // Главный случай: пунктирная доля вместо четверти.
  if (near(2 / 3) <= 0.03) return { kind: "2/3", ratio };
  if (near(3 / 2) <= 0.03) return { kind: "3/2", ratio };

  return { kind: "мимо", ratio };
}

/** Родственная тональность: тот же набор нот, другая тоника. */
function keyVerdict(declared: string | undefined, measured: string | null) {
  if (!declared || !measured) return null;

  const a = parseKey(declared);
  const b = parseKey(measured);

  if (!a || !b) return { kind: "не разобрано", same: false, relative: false };

  const same = a.root === b.root && a.minor === b.minor;
  // Относительная пара: мажор и его минор отличаются на три полутона.
  const span = Math.abs(a.root - b.root);
  const relative = Math.min(span, 12 - span) === 3;

  return { kind: same ? "точно" : relative ? "родственная" : "мимо", same, relative };
}

type Row = {
  name: string;
  declared: number;
  measured: number;
  kind: string;
  confidence: number;
  seconds: number;
  loopish: boolean;
  keyLabel?: string;
  keyMeasured: string | null;
  keyConfidence: number;
  keyKind: string | null;
};

describe("размеченная выборка", () => {
  it("печатает отчёт и сохраняет базовую линию", () => {
    const rows: Row[] = [];

    for (const file of corpusFiles()) {
      // Стенд читает только WAV: конвертировать mp3 вручную дороже, чем
      // отбросить файл, который всё равно не даёт ритма.
      if (!file.path.toLowerCase().endsWith(".wav")) continue;

      let wav: { samples: Float32Array; sampleRate: number; seconds: number };
      try {
        wav = readWav(file.path) as typeof wav;
      } catch {
        continue;
      }

      const result = analyzeChannels([wav.samples], wav.sampleRate);
      const tempo = verdict(file.label.bpm, result.tempo.bpm);
      const key = keyVerdict(file.label.key, result.key?.key ?? null);

      rows.push({
        name: file.name,
        declared: file.label.bpm,
        measured: Number(result.tempo.bpm.toFixed(2)),
        kind: tempo.kind,
        confidence: Number(result.tempo.confidence.toFixed(2)),
        seconds: Number(wav.seconds.toFixed(1)),
        loopish: LOOP_WORDS.test(file.name),
        keyLabel: file.label.key,
        keyMeasured: result.key?.key ?? null,
        keyConfidence: Number((result.key?.confidence ?? 0).toFixed(2)),
        keyKind: key?.kind ?? null,
      });
    }

    rows.sort((a, b) => a.name.localeCompare(b.name));

    console.log("\n| файл | метка | наш темп | вердикт | ув. | с | ключ (метка → наш) |");
    console.log("| --- | --- | --- | --- | --- | --- | --- |");

    for (const row of rows) {
      const key = row.keyLabel
        ? `${row.keyLabel} → ${row.keyMeasured ?? "—"} (${row.keyKind}, ${Math.round(row.keyConfidence * 100)}%)`
        : "—";

      console.log(
        `| ${row.name.slice(0, 46)} | ${row.declared} | ${row.measured} | ${row.kind}${row.loopish ? " ·луп" : ""} | ${Math.round(row.confidence * 100)}% | ${row.seconds} | ${key} |`,
      );
    }

    const beats = rows.filter((row) => !row.loopish && row.seconds > 60);
    const loops = rows.filter((row) => row.loopish || row.seconds <= 60);
    const tally = (list: Row[], field: (row: Row) => string) =>
      list.reduce<Record<string, number>>((acc, row) => {
        const value = field(row);
        acc[value] = (acc[value] ?? 0) + 1;
        return acc;
      }, {});

    console.log("\nБИТЫ (>60 с, не луп):", JSON.stringify(tally(beats, (row) => row.kind)));
    console.log("ЛУПЫ И ШОРТЫ:", JSON.stringify(tally(loops, (row) => row.kind)));

    const withKey = rows.filter((row) => row.keyKind);
    console.log("КЛЮЧИ:", JSON.stringify(tally(withKey, (row) => row.keyKind!)));
    console.log(
      "ключи с уверенностью >70% и ошибкой:",
      withKey.filter((row) => row.keyConfidence > 0.7 && row.keyKind !== "точно").length,
      "из",
      withKey.filter((row) => row.keyConfidence > 0.7).length,
    );

    writeFileSync("bench/corpus-baseline.json", JSON.stringify(rows, null, 2));

    expect(rows.length).toBeGreaterThan(0);
  });
});
