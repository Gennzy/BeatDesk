import { checkMetadata, type DeclaredMetadata, type MeasuredAudio, type MetadataFinding } from "./metadata";
import { checkPackage, type HygieneFinding, type PackageFacts } from "./hygiene";
import { checkAssets, type AssetFacts, type Finding } from "./preflight";
import { platformRules, type PlatformId, type Trust } from "./platform-rules";

/**
 * Выходной контроль целиком.
 *
 * Четыре слоя проверок дают четыре разных типа замечаний. Их нужно свести в
 * один ответ на единственный вопрос битмейкера: «можно выкладывать?».
 *
 * Ответ бывает и «не знаю». Для Airbit и BeatChain требования к аудио не
 * опубликованы, поэтому честный вердикт — «не проверено», а не «готово».
 * Обещать готовность там, где мы ничего не знаем, хуже, чем молчать.
 */

export type Layer = "files" | "metadata" | "hygiene";

export type Verdict = "ready" | "fix" | "unknown";

export type Row = {
  id: string;
  layer: Layer;
  ok: boolean;
  severity: "block" | "warn" | "info";
  label: string;
  /** Что получилось или в чём проблема. */
  detail?: string;
  /** Что делать битмейкеру. */
  suggestion?: string;
  trust: Trust;
};

export type Report = {
  platform: PlatformId;
  verdict: Verdict;
  rows: Row[];
  /** Мешает выложить. Пустой массив, а не флаг: по нему считаем счётчики. */
  blockers: Row[];
  /** Стоит поправить, но площадка примет. */
  warnings: Row[];
  /** Сколько правил мы не смогли проверить. */
  unknown: number;
};

export type ReportInput = {
  platform: PlatformId;
  assets: AssetFacts[];
  declared: DeclaredMetadata;
  measured: MeasuredAudio;
  package: PackageFacts;
};

const fileRow = (finding: Finding): Row => ({
  id: finding.id,
  layer: "files",
  ok: finding.ok,
  severity: finding.severity,
  label: finding.label,
  detail: finding.ok ? finding.actual : `получено: ${finding.actual ?? "неизвестно"}`,
  suggestion: finding.ok ? undefined : finding.expected,
  trust: finding.trust,
});

const metaRow = (finding: MetadataFinding): Row => ({
  id: finding.id,
  layer: "metadata",
  ok: false,
  severity: finding.severity,
  label: finding.id === "tempo" ? "Темп" : finding.id === "key" ? "Тональность" : "Название",
  detail: finding.message,
  suggestion: finding.suggestion,
  trust: "observed",
});

const hygieneRow = (finding: HygieneFinding): Row => ({
  id: finding.id,
  layer: "hygiene",
  ok: false,
  severity: finding.severity,
  label: finding.message,
  detail: finding.message,
  suggestion: finding.suggestion,
  trust: "observed",
});

/**
 * Правило, которое мы не смогли проверить, попадает в отчёт отдельной строкой.
 *
 * Иначе битмейкер увидит зелёный список и решит, что площадка проверена
 * целиком, хотя половина требований неизвестна.
 */
const unknownRow = (label: string): Row => ({
  id: `unknown:${label}`,
  layer: "files",
  ok: true,
  severity: "info",
  label,
  detail: "требование не опубликовано, проверить нечем",
  trust: "unknown",
});

export function buildReport(input: ReportInput): Report {
  const rules = platformRules(input.platform);

  const rows: Row[] = [
    ...checkAssets(rules!, input.assets).map(fileRow),
    ...checkMetadata(input.platform, input.declared, input.measured).map(metaRow),
    ...checkPackage(input.platform, input.package).map(hygieneRow),
  ];

  // Неизвестное правило мешает обещать готовность только для тех файлов,
  // которые действительно поедут на площадку. У BeatStars не опубликован
  // размер обложки, но если обложки в пакете нет, это не повод тревожить
  // битмейкера.
  const present = new Set(input.assets.map((asset) => asset.kind));

  if (rules) {
    for (const kind of ["wav", "mp3", "stems", "artwork"] as const) {
      const field = rules.fields[kind];

      if (field?.trust === "unknown" && present.has(kind)) {
        rows.push(unknownRow(`${kind}: параметры не опубликованы`));
      }
    }
  }

  const blockers = rows.filter((row) => row.severity === "block" && !row.ok);
  const warnings = rows.filter((row) => row.severity === "warn" && !row.ok);
  const unknown = rows.filter((row) => row.trust === "unknown").length;

  const verdict: Verdict = blockers.length > 0 ? "fix" : unknown > 0 ? "unknown" : "ready";

  return { platform: input.platform, verdict, rows, blockers, warnings, unknown };
}
