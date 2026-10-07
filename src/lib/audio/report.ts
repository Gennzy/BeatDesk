import { checkMetadata, type DeclaredMetadata, type MeasuredAudio, type MetadataFinding } from "./metadata";
import { checkPackage, type HygieneFinding, type PackageFacts } from "./hygiene";
import { checkAssets, type AssetFacts, type Finding } from "./preflight";
import { DELIVERY_FIELDS, TIERS, type TierId, type Trust } from "./delivery-rules";

/**
 * Выходной контроль целиком.
 *
 * Четыре слоя проверок дают четыре разных типа замечаний. Их нужно свести в
 * один ответ на единственный вопрос битмейкера: «это можно продавать?».
 *
 * Ответ бывает и «не знаю», и это теперь важнее, чем раньше. Проверка
 * формата сравнивает файл с нашими требованиями — но если файл не удалось
 * прочитать, сравнивать не с чем. Обещать готовность там, где мы ничего не
 * проверили, хуже, чем молчать: покупатель получит файл, который мы не
 * смотрели.
 *
 * Второе отличие от прежней версии: отчёт отвечает не про площадку, а про
 * уровни. Один и тот же бит может быть готов к продаже по MP3 и совсем не
 * готов по эксклюзиву, если нет дорожек, — и раньше такой вопрос был
 * невозможен, потому что площадка была одна на все уровни сразу.
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
  /** Уровни, которые битмейкер выставил на продажу. */
  tiers: TierId[];
  verdict: Verdict;
  rows: Row[];
  /** Мешает продать. Пустой массив, а не флаг: по нему считаем счётчики. */
  blockers: Row[];
  /** Стоит поправить, но заказ выполним. */
  warnings: Row[];
  /** Сколько правил мы не смогли проверить. */
  unknown: number;
};

export type ReportInput = {
  /** Какие уровни лицензии выставлены на продажу. */
  tiers: TierId[];
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
  suggestion: finding.ok ? finding.expected : finding.expected,
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
  trust: "documented",
});

/**
 * Проверка, которая ничего не проверила.
 *
 * Иначе битмейкер увидит зелёный список и решит, что файл посмотрен
 * целиком, хотя половина требований к нему не применялась.
 */
const unreadableRow = (kind: string, reason: string): Row => ({
  id: `unreadable:${kind}`,
  layer: "files",
  ok: true,
  severity: "info",
  label: `${kind}: ${reason}`,
  detail: reason,
  trust: reason === "требование не задано" ? "unknown" : "observed",
});

export function buildReport(input: ReportInput): Report {
  const rows: Row[] = [
    ...checkAssets(input.assets).map(fileRow),
    ...checkMetadata(input.tiers, input.declared, input.measured).map(metaRow),
    ...checkPackage(input.tiers, input.package).map(hygieneRow),
  ];

  /**
   * Молчание переносим в отчёт отдельной строкой.
   *
   * Считаем только по тем полям, которые в бите действительно есть: если
   * обложки нет, отсутствие требования к её размеру не повод тревожить
   * битмейкера. Требования к обложке мы не задали, и без обложки это
   * безобидно.
   */
  const present = new Set(input.assets.map((asset) => asset.kind));

  for (const kind of ["wav", "mp3", "stems", "artwork"] as const) {
    const rule = DELIVERY_FIELDS[kind];

    if (!present.has(kind)) continue;

    if (rule.trust === "unknown") {
      rows.push(unreadableRow(kind, "требование не задано"));
      continue;
    }

    // Файл в бите есть, но ни одна его характеристика не прочиталась:
    // проверить формат было нечем, и это надо сказать отдельно от
    // «требование не задано».
    const asset = input.assets.find((item) => item.kind === kind);

    if (asset && !measurable(asset)) {
      rows.push(unreadableRow(kind, "файл не удалось прочитать"));
    }
  }

  const blockers = rows.filter((row) => row.severity === "block" && !row.ok);
  const warnings = rows.filter((row) => row.severity === "warn" && !row.ok);
  const unknown = rows.filter((row) => row.trust === "unknown").length;

  const verdict: Verdict = blockers.length > 0 ? "fix" : unknown > 0 ? "unknown" : "ready";

  return { tiers: input.tiers, verdict, rows, blockers, warnings, unknown };
}

/**
 * Читаем ли мы хоть что-нибудь в этом файле.
 *
 * Обложку меряем по сторонам, аудио — по разрядности, частоте, каналам и
 * битрейту. Размер и имя файла есть всегда, но по ним формат не судить.
 */
function measurable(asset: AssetFacts): boolean {
  if (asset.kind === "artwork") return asset.width !== undefined && asset.height !== undefined;

  return (
    asset.bitsPerSample !== undefined ||
    asset.sampleRate !== undefined ||
    asset.channels !== undefined ||
    asset.kbps !== undefined
  );
}

/**
 * Уровни, которые нельзя продавать из-за отсутствия файлов.
 *
 * Отдельная функция, потому что это единственное место, где нужно знать
 * про файлы и про цены одновременно, а проверки по слоям про них не знают.
 */
export function soldTiers(prices: Record<string, number | null>): TierId[] {
  return TIERS.filter((tier) => typeof prices[tier.id] === "number" && (prices[tier.id] ?? 0) > 0).map(
    (tier) => tier.id,
  );
}
