import type { FieldRule, PlatformRules, Trust } from "./platform-rules";

/**
 * «Выходной контроль», слой файлов.
 *
 * Проверяет то, что можно узнать из самого файла, против требований
 * площадки. Неизвестные требования не превращаются в предупреждения:
 * если площадка не опубликовала правило, мы о ней не знаем и молчим.
 */

export type AssetKind = "wav" | "mp3" | "stems" | "artwork";

export type AssetFacts = {
  kind: AssetKind;
  bytes: number;
  seconds?: number;
  bitsPerSample?: number;
  sampleRate?: number;
  channels?: number;
  /** Битрейт, кбит/с; для WAV не нужен. */
  kbps?: number;
  /** Для обложки: квадратная ли сторона. */
  width?: number;
  height?: number;
};

export type Severity = "block" | "warn" | "info";

export type Finding = {
  /** Короткий код для тестов и будущих ссылок из интерфейса. */
  id: string;
  ok: boolean;
  severity: Severity;
  label: string;
  /** Что получилось. */
  actual?: string;
  /** Что требуется. */
  expected?: string;
  trust: Trust;
  source?: string;
};

const MB = 1024 * 1024;

const mb = (bytes: number) => `${(bytes / MB).toFixed(1).replace(".", ",")} МБ`;
const khz = (value: number) => `${(value / 1000).toFixed(1).replace(".", ",")} кГц`;
const clock = (value: number) =>
  `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, "0")}`;

/** Правило применимо, только если площадка опубликовала цифры. */
const usable = (rule: FieldRule | undefined): rule is FieldRule =>
  rule !== undefined && rule.trust !== "unknown";

const skipped = (id: string, label: string, trust: Trust, source?: string): Finding => ({
  id,
  ok: true,
  severity: "info",
  label,
  expected: "требование не опубликовано",
  trust,
  source,
});

/**
 * Правило с одной границей.
 *
 * `direction` решает всё: потолок и минимум сравниваются в разные стороны,
 * и перепутать их — значит пропустить перелёт по размеру или словить ложную
 * тревогу на нормальном файле.
 */
function boundCheck(
  id: string,
  label: string,
  rule: FieldRule | undefined,
  actual: number | undefined,
  direction: "min" | "max",
  requirement: (rule: FieldRule) => string,
  bound: (rule: FieldRule) => number | undefined,
  format: (value: number) => string,
  source?: string,
): Finding {
  const trust = rule?.trust ?? "unknown";

  if (!usable(rule) || actual === undefined) return skipped(id, label, trust, source);

  const limit = bound(rule);
  if (limit === undefined) return skipped(id, label, trust, source);

  const ok = direction === "min" ? actual >= limit : actual <= limit;

  return {
    id,
    ok,
    severity: ok ? "info" : "block",
    label,
    actual: format(actual),
    expected: requirement(rule),
    trust: rule.trust,
    source,
  };
}

/** Правило с двумя границами: разрядность и частота. */
function rangeCheck(
  id: string,
  label: string,
  rule: FieldRule | undefined,
  actual: number | undefined,
  requirement: (rule: FieldRule) => string,
  min: (rule: FieldRule) => number | undefined,
  max: (rule: FieldRule) => number | undefined,
  format: (value: number) => string,
  source?: string,
): Finding {
  const trust = rule?.trust ?? "unknown";

  if (!usable(rule) || actual === undefined) return skipped(id, label, trust, source);

  const lower = min(rule);
  const upper = max(rule);
  if (lower === undefined && upper === undefined) return skipped(id, label, trust, source);

  const ok = (lower === undefined || actual >= lower) && (upper === undefined || actual <= upper);

  return {
    id,
    ok,
    severity: ok ? "info" : "block",
    label,
    actual: format(actual),
    expected: requirement(rule),
    trust: rule.trust,
    source,
  };
}

const sourceOf = (platform: PlatformRules, field: string) =>
  platform.checks.find((check) => check.field === field)?.source;

const byField = (
  id: string,
  label: string,
  rule: FieldRule | undefined,
  requirement: (rule: FieldRule) => string,
  bounds: Array<[keyof FieldRule, (rule: FieldRule) => number | undefined]>,
  actual: number | undefined,
  format: (value: number) => string,
  source?: string,
) =>
  bounds.length === 2
    ? rangeCheck(id, label, rule, actual, requirement, bounds[0][1], bounds[1][1], format, source)
    : boundCheck(id, label, rule, actual, "min", requirement, bounds[0][1], format, source);

export function checkAsset(platform: PlatformRules, asset: AssetFacts): Finding[] {
  const rule = platform.fields[asset.kind];
  const source = sourceOf(platform, asset.kind);

  // Обложка проверяется иначе: там важна квадратность, а не потолок.
  if (asset.kind === "artwork") {
    const side = rule?.artworkSide;
    const isSquare = asset.width === asset.height;
    const bigEnough = side !== undefined && (asset.width ?? 0) >= side;

    return [
      {
        id: "artwork.square",
        ok: isSquare,
        // Не блокер: площадка обрежет сама, предупреждаем заранее.
        severity: isSquare ? "info" : "warn",
        label: "Обложка квадратная",
        actual: asset.width && asset.height ? `${asset.width}×${asset.height}` : undefined,
        expected: "квадрат",
        trust: rule?.trust ?? "unknown",
      },
      {
        id: "artwork.size",
        ok: bigEnough,
        severity: "info",
        label: "Размер обложки",
        actual: asset.width && asset.height ? `${asset.width}×${asset.height}` : undefined,
        expected: side === undefined ? "требование не опубликовано" : `от ${side}×${side}`,
        trust: rule?.trust ?? "unknown",
      },
    ];
  }

  return [
    boundCheck(
      "size",
      "Размер файла",
      rule,
      asset.bytes,
      "max",
      (value) => `не больше ${mb(value.maxBytes ?? 0)}`,
      (value) => value.maxBytes,
      mb,
      source,
    ),
    byField(
      "bits",
      "Разрядность",
      rule,
      (value) => `${value.minBits ?? "?"}–${value.maxBits ?? "?"} бит`,
      [["minBits", (value) => value.minBits], ["maxBits", (value) => value.maxBits]],
      asset.bitsPerSample,
      (value) => `${value} бит`,
      source,
    ),
    byField(
      "sampleRate",
      "Частота дискретизации",
      rule,
      (value) => `${khz(value.minSampleRate ?? 0)}–${khz(value.maxSampleRate ?? 0)}`,
      [
        ["minSampleRate", (value) => value.minSampleRate],
        ["maxSampleRate", (value) => value.maxSampleRate],
      ],
      asset.sampleRate,
      khz,
      source,
    ),
    boundCheck(
      "channels",
      "Каналы",
      rule,
      asset.channels,
      "min",
      () => "строго два, моно не принимается",
      (value) => value.minChannels,
      (value) => (value === 2 ? "стерео" : `${value} канала`),
      source,
    ),
    boundCheck(
      "bitrate",
      "Битрейт",
      rule,
      asset.kbps,
      "min",
      () => "не ниже 320 кбит/с",
      (value) => value.minKbps,
      (value) => `${value} кбит/с`,
      source,
    ),
    boundCheck(
      "duration",
      "Длительность",
      rule,
      asset.seconds,
      "max",
      (value) => `не длиннее ${clock(value.maxSeconds ?? 0)}`,
      (value) => value.maxSeconds,
      clock,
      source,
    ),
  ];
}

export function checkAssets(platform: PlatformRules, assets: AssetFacts[]): Finding[] {
  return assets.flatMap((asset) => checkAsset(platform, asset));
}

/** Что мешает выложить: только то, что площадка действительно запрещает. */
export function blockers(findings: Finding[]): Finding[] {
  return findings.filter((finding) => finding.severity === "block" && !finding.ok);
}
