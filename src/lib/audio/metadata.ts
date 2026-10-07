import type { TierId } from "./delivery-rules";

/**
 * «Выходной контроль», слой метаданных.
 *
 * Самое дорогое место: бит с неверным ключом или темпом уходит покупателю
 * и возвращается претензией. Тональность при этом проверять нельзя «просто
 * сравнением строк»: тональность без октавы — это 24 строки, а не одна.
 */

/** Что битмейкер написал в карточке. */
export type DeclaredMetadata = {
  bpm?: number;
  /** Например `F# major`. Октава, если есть, сохраняется: `F#2`. */
  key?: string;
  title?: string;
};

export type MeasuredAudio = {
  bpm: number;
  /** Тональность, например `F# major`. */
  key: string;
  /** Достоверность тональности, 0..1. */
  keyConfidence?: number;
};

/**
 * Ключ в нотации с решёткой, как его пишут в тегах.
 */
const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

/** Те же ноты плоским письмом, в том же порядке. */
const FLAT_NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

/** Бемоль, записанный с решёткой, — та же нота в другом ряду. */
const SHARP_OF_FLAT: Record<string, string> = {
  Db: "C#",
  Eb: "D#",
  Gb: "F#",
  Ab: "G#",
  Bb: "A#",
};

/** `F#2 minor` → тоника, лад, знаковая система и октава. */
export type ParsedKey = { root: number; minor: boolean; flat: boolean; octave?: number };

/**
 * Лад из слова-качества.
 *
 * Возвращает `null` для незнакомого слова: «си♭ гамма» — не тональность,
 * и выдумывать для неё мажор значит выдумать ошибку.
 */
function modeFrom(word: string): boolean | null {
  if (word === "") return false;

  const quality = word.toLowerCase();

  if (quality.startsWith("maj")) return false;
  if (quality.startsWith("min")) return true;
  // «Dm» и «CM» — краткие записи минорной тональности.
  if (quality === "m") return true;

  return null;
}

export function parseKey(text: string | undefined): ParsedKey | null {
  if (!text) return null;

  const trimmed = text.trim();

  // Октаву вытаскиваем отдельно: в тегах её пишут и до, и после лада
  // («F#2 minor» и «F# minor 2»), и в обоих случаях это одно и то же.
  const digits = /(-?\d+)/.exec(trimmed);
  const octave = digits ? Number(digits[1]) : undefined;
  const rest = trimmed.replace(/(-?\d+)/, " ").replace(/\s+/g, " ").trim();

  const match = rest.match(/^([A-Ga-g])([#b]?)\s*([a-zA-Z]*)$/);
  if (!match) return null;

  const [, letter, accidental, word] = match;

  // Знаковую систему запоминаем, а ноту приводим к решётке: так Gb и F#
  // сравниваются как одна нота, но различие написания остаётся видимым.
  const flat = accidental === "b";
  const sharp = flat ? SHARP_OF_FLAT[`${letter.toUpperCase()}b`] : undefined;
  const name = sharp ?? `${letter.toUpperCase()}${accidental}`;
  const root = NOTE_NAMES.indexOf(name);

  if (root < 0) return null;

  const minor = modeFrom(word);
  if (minor === null) return null;

  return { root, minor, flat, octave };
}

/**
 * Расстояние между тональностями в полутонах.
 *
 * Возвращает `null`, если одну из них не удалось разобрать: лучше промолчать,
 * чем заявить, что C# major и F# major не совпадают.
 */
export function keyDistance(a: ParsedKey | null, b: ParsedKey | null): number | null {
  if (!a || !b) return null;

  const span = Math.abs(a.root - b.root);
  const distance = Math.min(span, 12 - span);

  // C major и C minor стоят на одной ноте, но это разные тональности.
  // Возвращаем тритон: важно, что значение ненулевое.
  if (distance === 0 && a.minor !== b.minor) return 6;

  return distance;
}

/** Та же нота, но записанная иначе: F# major и Gb major. */
export function spellingDiffers(a: ParsedKey | null, b: ParsedKey | null): boolean {
  if (!a || !b) return false;

  return a.root === b.root && a.minor === b.minor && a.flat !== b.flat;
}

/** Собрать тональность в канонический вид для показа. */
export const canonicalKey = ({ root, minor, octave }: ParsedKey) =>
  `${NOTE_NAMES[root]} ${minor ? "minor" : "major"}${octave === undefined ? "" : ` ${octave}`}`;

/**
 * Перевести решётку в бемоль.
 *
 * Ищем по обоим написаниям, но в выдаче мелькают плоские тональности: один
 * и тот же бит зовётся то `F# major`, то `Gb major`, и это порождает две
 * почти одинаковые карточки.
 */
export function enharmonic(text: string): string | null {
  const parsed = parseKey(text);
  if (!parsed || parsed.flat) return null;

  // У E и B плоского эквивалента в обиходной записи нет.
  const flat = FLAT_NAMES[parsed.root];
  if (flat === NOTE_NAMES[parsed.root]) return null;

  return `${flat} ${parsed.minor ? "minor" : "major"}${parsed.octave === undefined ? "" : ` ${parsed.octave}`}`;
}

/**
 * Порог расхождения темпа.
 *
 * 4% — не точность детектора, а граница, за которой платформа считает, что
 * это другой бит: полтора процента отклонения на 140 BPM дают 2 BPM, и
 * покупатель слышит, что такт не сходится.
 */
export const TEMPO_TOLERANCE = 0.04;

/** Отношение, при котором это заведомо тот же бит на другой скорости. */
const HALF_REFERENCE = 0.5;
const DOUBLE_REFERENCE = 2;

export function tempoRelation(declared: number, measured: number): "match" | "family" | "off" {
  const ratio = declared / measured;

  if (Math.abs(ratio - 1) <= TEMPO_TOLERANCE) return "match";

  // Проверяем не только ровно половину и ровно вдвое, но и близко к ним:
  // 68 и 140 — это один бит, просто записанный с другой скоростью.
  const near = (reference: number) => Math.abs(ratio / reference - 1) <= TEMPO_TOLERANCE;

  if (near(HALF_REFERENCE) || near(DOUBLE_REFERENCE)) return "family";

  return "off";
}

export type MetadataFinding = {
  id: "tempo" | "key" | "title";
  severity: "block" | "warn";
  /** Расхождение в процентах: насколько далеко заявленное от измеренного. */
  drift?: number;
  message: string;
  /** Что показать битмейкеру вместо жалобы. */
  suggestion: string;
};

/**
 * Темп и тональность как поисковые фильтры.
 *
 * Раньше строгость зависела от площадки: BeatStars превращал темп в фильтр
 * выдачи и расхождение было блокером, Airbit про это молчал и то же
 * расхождение считалось предупреждением.
 *
 * Теперь площадка одна, и фильтры наши собственные. Расхождение блокирует
 * продажу всегда: покупатель ищет по темпу, выбирает «166 BPM», а получает
 * файл, который играет на 111, и возвращает его. Это не аккуратность
 * карточки, это неверно описанный товар.
 */
export function checkMetadata(
  tiers: TierId[],
  declared: DeclaredMetadata,
  measured: MeasuredAudio,
): MetadataFinding[] {
  const findings: MetadataFinding[] = [];
  // Ничего не продаётся — спорить не о чем, но и молчать нельзя:
  // к моменту продажи расхождение надо убрать.
  const harsh: "block" | "warn" = tiers.length > 0 ? "block" : "warn";

  if (declared.bpm !== undefined) {
    const relation = tempoRelation(declared.bpm, measured.bpm);
    const percent = Math.round(Math.abs(declared.bpm / measured.bpm - 1) * 100);
    const heard = measured.bpm.toFixed(2).replace(".", ",");

    if (relation === "off") {
      findings.push({
        id: "tempo",
        severity: harsh,
        drift: percent,
        message: `В карточке ${declared.bpm} BPM, а в файле ${heard} BPM — расхождение ${percent}%`,
        suggestion: `Поставьте ${measured.bpm.toFixed(0)} BPM: покупатель ищет по темпу и услышит не тот бит, который выбрал.`,
      });
    } else if (relation === "family") {
      // Заявленный медленнее измеренного — значит в карточке стоит половина.
      const halved = declared.bpm < measured.bpm;

      findings.push({
        id: "tempo",
        severity: "warn",
        drift: percent,
        message: `В карточке ${declared.bpm} BPM, а в файле ${heard} BPM — это ${halved ? "половина" : "удвоенный"} темп одного и того же бита`,
        suggestion: `Файл звучит как ${measured.bpm.toFixed(0)} BPM. Если это один бит на двух скоростях, выложите оба варианта: ${Math.round(measured.bpm / 2)} для медленного и ${measured.bpm.toFixed(0)} для быстрого, с разными названиями.`,
      });
    }
  }

  if (declared.key !== undefined && measured.keyConfidence !== undefined && measured.keyConfidence < 0.35) {
    findings.push({
      id: "key",
      severity: "warn",
      message: `Тональность определена неуверенно (${Math.round(measured.keyConfidence * 100)}%)`,
      suggestion: "Не указывайте тональность по догадке: лучше оставьте поле пустым, чем укажете неверную.",
    });
  }

  const declaredKey = parseKey(declared.key);
  const measuredKey = parseKey(measured.key);
  const distance = keyDistance(declaredKey, measuredKey);

  if (declaredKey && measuredKey && distance !== null) {
    if (distance > 0) {
      findings.push({
        id: "key",
        severity: harsh,
        message: `В карточке ${declared.key}, в файле ${measured.key} — тональности разные`,
        suggestion: `Поставьте ${measured.key}: покупатель отбирает бит по тональности и получит несовместимый.`,
      });
    } else if (spellingDiffers(declaredKey, measuredKey)) {
      findings.push({
        id: "key",
        severity: "warn",
        message: `В карточке ${declared.key}, в файле ${measured.key} — это одна тональность, записанная плоской знаковой системой`,
        suggestion: `Оставьте ${measured.key}: поиск по знакам с решёткой и по бемолям возвращает разные выдачи, и бит задваивается.`,
      });
    }
  }

  const title = declared.title?.trim() ?? "";

  if (title.length === 0) {
    findings.push({
      id: "title",
      severity: harsh,
      message: "У бита нет названия",
      suggestion: "Без названия бит не находится в поиске и выглядит как черновик.",
    });
  } else if (/\.(wav|mp3|zip)$/i.test(title)) {
    findings.push({
      id: "title",
      severity: "warn",
      message: `В названии есть имя файла: «${title}»`,
      suggestion: "Уберите расширение и путь: в ленте и в имени файла заказа они выглядят как мусор.",
    });
  }

  return findings;
}
