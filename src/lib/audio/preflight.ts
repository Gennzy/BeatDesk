import { DELIVERY_FIELDS, type FieldKind, type FieldRule, type Trust } from "./delivery-rules";

/**
 * «Выходной контроль», слой файлов.
 *
 * Проверяет то, что можно узнать из самого файла, против наших требований
 * к выдаче. Требования теперь общие для всех уровней и лежат в
 * delivery-rules: различается не формат, а то, обязателен ли файл, и это
 * проверяет hygiene.
 *
 * Здесь важно различать два молчания, которые старый код смешивал:
 *
 * - требования нет — мы не знаем, что требовать;
 * - требование есть, а файл прочитать не удалось — мы знаем, что
 *   требовать, но не знаем, выполнено ли.
 *
 * Первое — вина правил, второе — вина файла. Битмейкер должен видеть их
 * по-разному, иначе «файл не прочитался» выглядит как «всё в порядке».
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

/** Почему проверка не дала ответа. */
export type SkipReason = "no-rule" | "unreadable";

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
  /** Заполняется, когда ok === true, а ответа по сути нет. */
  skip?: SkipReason;
  source?: string;
};

const MB = 1024 * 1024;

const mb = (bytes: number) => `${(bytes / MB).toFixed(1).replace(".", ",")} МБ`;
const khz = (value: number) => `${(value / 1000).toFixed(1).replace(".", ",")} кГц`;
const clock = (value: number) =>
  `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, "0")}`;

/** Правило применимо, только если мы его задали. */
const usable = (rule: FieldRule | undefined): rule is FieldRule =>
  rule !== undefined && rule.trust !== "unknown";

/**
 * Молчание с причиной.
 *
 * `severity: "info"` и `ok: true` — проверка не мешает выкладке, но
 * отчёт обязан показать, что она ничего не проверила.
 */
const skipped = (id: string, label: string, trust: Trust, reason: SkipReason): Finding => ({
  id,
  ok: true,
  severity: "info",
  label,
  expected: reason === "no-rule" ? "требование не задано" : "файл не удалось прочитать",
  trust: reason === "no-rule" ? "unknown" : trust,
  skip: reason,
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

  if (!usable(rule)) return skipped(id, label, trust, "no-rule");
  if (actual === undefined) return skipped(id, label, trust, "unreadable");

  const limit = bound(rule);
  if (limit === undefined) return skipped(id, label, trust, "no-rule");

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

  if (!usable(rule)) return skipped(id, label, trust, "no-rule");
  if (actual === undefined) return skipped(id, label, trust, "unreadable");

  const lower = min(rule);
  const upper = max(rule);
  if (lower === undefined && upper === undefined) return skipped(id, label, trust, "no-rule");

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

/** Где в справке написано про это поле. */
const DELIVERY_CHECKS: Record<AssetKind, string | undefined> = {
  wav: "справка BeatDesk — лицензии и файлы",
  mp3: "справка BeatDesk — как загрузить бит",
  stems: "справка BeatDesk — лицензии и файлы",
  artwork: undefined,
};

export function checkAsset(kind: AssetKind, asset: AssetFacts): Finding[] {
  const rule: FieldRule | undefined = DELIVERY_FIELDS[kind as FieldKind];

  // Обложка проверяется иначе: там важна квадратность, а не потолок.
  if (kind === "artwork") {
    const side = rule?.artworkMinSide;
    const isSquare = asset.width === asset.height;
    const bigEnough = side === undefined || (asset.width ?? 0) >= side;
    const measured = asset.width && asset.height ? `${asset.width}×${asset.height}` : undefined;

    return [
      {
        id: "artwork.square",
        ok: isSquare,
        // Не блокер: обложку можно обрезать, об этом честнее сказать
        // заранее, чем отклонять карточку.
        severity: isSquare ? "info" : "warn",
        label: "Обложка квадратная",
        actual: measured,
        expected: "квадрат",
        trust: rule?.trust ?? "unknown",
        ...(measured === undefined ? { skip: "unreadable" as const } : {}),
      },
      {
        id: "artwork.size",
        // Границы пока не задано, поэтому проверка всегда «ок». Как только
        // зададим — начнёт проверять, а не молчать.
        ok: bigEnough,
        severity: bigEnough ? "info" : "warn",
        label: "Размер обложки",
        actual: measured,
        expected: side === undefined ? "требование не задано" : `от ${side}×${side}`,
        trust: rule?.trust ?? "unknown",
        ...(side === undefined ? { skip: "no-rule" as const } : measured === undefined ? { skip: "unreadable" as const } : {}),
      },
    ];
  }

  const source = DELIVERY_CHECKS[kind];

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
      (value) => `не ниже ${value.minKbps} кбит/с`,
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

export function checkAssets(assets: AssetFacts[]): Finding[] {
  return assets.flatMap((asset) => checkAsset(asset.kind, asset));
}

/** Что мешает продать: только то, что мы действительно запрещаем. */
export function blockers(findings: Finding[]): Finding[] {
  return findings.filter((finding) => finding.severity === "block" && !finding.ok);
}
