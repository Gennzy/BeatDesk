import { TAG_LIMITS, TIERS, type TierId } from "./delivery-rules";

/**
 * «Выходной контроль», слой гигиены пакета.
 *
 * Формат проходит по формату, а заказ всё равно невыполним. Здесь живут
 * вещи, из-за которых покупатель получает деньги назад:
 *
 * - уровень выставлен на продажу, а файла для него нет;
 * - архив со стемами положен, но это не он;
 * - в названии бита имя файла, и в выдаче оно выглядит мусором;
 * - в тегах файла одно, в карточке другое.
 *
 * Главная проверка здесь — первая. Раньше её не было вовсе: битмейкер
 * мог поставить цену на Track Out, не положив дорожки, и узнать об этом
 * только когда покупатель оплатит.
 */

/** Что лежит в бите, как это видит человек перед выкладкой. */
export type PackageFacts = {
  title: string;
  bpm?: number;
  /** Ключ в том виде, в каком битмейкер его ввёл. */
  key?: string;
  genre?: string;
  mood?: string;
  tags?: string[];
  /** Какие файлы лежат в бите. */
  files: { name: string; role: "wav" | "mp3" | "stems" | "artwork" | "other" }[];
  /** Что записано в самом файле: читаем теги. */
  embedded?: { title?: string; artist?: string; bpm?: number; key?: string };
};

export type HygieneFinding = {
  id: string;
  severity: "block" | "warn";
  message: string;
  suggestion: string;
};

const EXTENSION: Record<string, "wav" | "mp3" | "stems" | "artwork"> = {
  ".wav": "wav",
  ".mp3": "mp3",
  ".zip": "stems",
  ".rar": "stems",
  ".7z": "stems",
  ".png": "artwork",
  ".jpg": "artwork",
  ".jpeg": "artwork",
  ".webp": "artwork",
};

/** Имя файла без пути: расширение у браузера отрезано не всегда. */
const baseName = (name: string) => name.split(/[\\/]/).pop() ?? name;

const roleOf = (name: string): PackageFacts["files"][number]["role"] => {
  const lower = baseName(name).toLowerCase();
  const dot = lower.lastIndexOf(".");

  return (dot < 0 ? undefined : EXTENSION[lower.slice(dot)]) ?? "other";
};

/**
 * Требования уровней, которые битмейкер выставил на продажу.
 *
 * Пустой массив — это не «всё хорошо»: значит, продавать пока нечего, и
 * об этом тоже нужно сказать, иначе отчёт покажет пустой зелёный список.
 */
export function checkPackage(tiers: TierId[], pack: PackageFacts): HygieneFinding[] {
  const findings: HygieneFinding[] = [];
  const sold = TIERS.filter((tier) => tiers.includes(tier.id));

  const roles = new Set(pack.files.map((file) => (file.role === "other" ? roleOf(file.name) : file.role)));

  if (tiers.length === 0) {
    findings.push({
      id: "tiers.none",
      severity: "warn",
      message: "Ни один уровень лицензии не выставлен на продажу",
      suggestion: "Поставьте хотя бы цену на MP3: без цены бит нельзя купить.",
    });
  }

  if (pack.files.length === 0) {
    findings.push({
      id: "files.empty",
      severity: "block",
      message: "В бите нет ни одного файла",
      suggestion: "Добавьте превью в MP3: без аудиофайла карточку нечего слушать.",
    });
  }

  /**
   * Уровень продаётся, а обязательного файла нет.
   *
   * Это самый дорогой класс проблем: деньги за него уже можно получить.
   */
  for (const tier of sold) {
    for (const [need, role] of [
      [tier.requires.wav, "wav"],
      [tier.requires.mp3, "mp3"],
      [tier.requires.stems, "stems"],
    ] as const) {
      if (!need || roles.has(role)) continue;

      findings.push({
        id: `tier.${tier.id}.no-${role}`,
        severity: "block",
        message: `Уровень «${tier.label}» выставлен на продажу, а ${role === "stems" ? "архива со стемами" : role === "wav" ? "мастера в WAV" : "превью в MP3"} нет`,
        suggestion: `Либо добавьте файл — уровень обещает «${tier.delivers}», — либо снимите цену и уберите его из карточки.`,
      });
    }
  }

  if (sold.some((tier) => tier.master) && !roles.has("wav")) {
    findings.push({
      id: "files.noMaster",
      severity: "block",
      message: "Мастер в WAV не загружен",
      suggestion: "Без мастера покупатель не получит ни MP3+WAV, ни Track Out, ни эксклюзив.",
    });
  }

  // Превью нужно всем уровням: покупатель выбирает бит по нему, а не по мастеру.
  if (tiers.length > 0 && !roles.has("mp3") && roles.size > 0) {
    findings.push({
      id: "files.noMp3",
      severity: "warn",
      message: "Нет превью в MP3",
      suggestion: "Превью слушают в ленте и в карточке. Из мастера его делает любой конвертер.",
    });
  }

  if (!roles.has("artwork")) {
    findings.push({
      id: "artwork.missing",
      severity: "warn",
      message: "Обложка не загружена",
      suggestion: "Без обложки карточка теряется в ленте: вместо превью — пустое место.",
    });
  }

  const stems = pack.files.filter((file) => (file.role === "other" ? roleOf(file.name) : file.role) === "stems");

  if (stems.length > 1) {
    findings.push({
      id: "stems.ambiguous",
      severity: "warn",
      message: `В бите ${stems.length} архива со стемами`,
      suggestion: "Покупатель получит архив, который вы не имели в виду. Оставьте один.",
    });
  }

  const masters = pack.files.filter((file) => (file.role === "other" ? roleOf(file.name) : file.role) === "wav");

  if (masters.length > 1) {
    findings.push({
      id: "files.ambiguousMaster",
      severity: "warn",
      message: `В бите ${masters.length} файла WAV`,
      suggestion: "Отдаём первый по порядку. Переименуйте лишние в tagged и untagged или уберите.",
    });
  }

  const name = pack.title.trim();

  if (name.length > 0 && !/^[\p{L}\p{N} .,'&!?\-–—_()]+$/u.test(name)) {
    findings.push({
      id: "title.symbols",
      severity: "warn",
      message: `В названии «${name}» есть необычные символы`,
      suggestion: "Оставьте буквы, цифры и простые знаки: часть каналов режет такие названия при вставке ссылки.",
    });
  }

  if (name.length > 80) {
    findings.push({
      id: "title.long",
      severity: "warn",
      message: `Название из ${name.length} символов обрежется в ленте`,
      suggestion: "Сократите до 40 символов: дальше текст всё равно не читается.",
    });
  }

  if (/\s{2,}/.test(name)) {
    findings.push({
      id: "title.spaces",
      severity: "warn",
      message: "В названии двойные пробелы",
      suggestion: "Сведите пробелы в один: иначе один и тот же бит получит несколько карточек.",
    });
  }

  const tags = (pack.tags ?? []).map((tag) => tag.trim()).filter(Boolean);

  if (tags.length > TAG_LIMITS.tags) {
    findings.push({
      id: "tags.tooMany",
      severity: "warn",
      message: `Тегов ${tags.length}, а мы читаем ${TAG_LIMITS.tags}`,
      suggestion: `Оставьте ${TAG_LIMITS.tags} самых точных: остальные не попадут ни в один фильтр.`,
    });
  }

  if (new Set(tags.map((tag) => tag.toLowerCase())).size !== tags.length) {
    findings.push({
      id: "tags.duplicates",
      severity: "warn",
      message: "Теги повторяются",
      suggestion: "Уберите дубли в другом регистре: «Trap» и «trap» считаются одним и тем же тегом.",
    });
  }

  if (pack.genre !== undefined && pack.genre.trim().length === 0) {
    findings.push({
      id: "genre.missing",
      severity: "warn",
      message: "Жанр не выбран",
      suggestion: "По жанру собираются подборки, и бит без него в них не попадает.",
    });
  }

  const embedded = pack.embedded;

  if (embedded) {
    // Название из тегов файла может перебить название в карточке — разные
    // источники имени дают один бит под двумя именами.
    if (embedded.title !== undefined && embedded.title.trim() !== name && name.length > 0) {
      findings.push({
        id: "embedded.titleDiffers",
        severity: "warn",
        message: `В файле записано «${embedded.title}», а в карточке «${name}»`,
        suggestion: "Сделайте названия одинаковыми, иначе в заказе файл будет называться не так, как карточка.",
      });
    }

    if (embedded.bpm !== undefined && pack.bpm !== undefined && Math.abs(embedded.bpm / pack.bpm - 1) > 0.04) {
      findings.push({
        id: "embedded.bpmDiffers",
        severity: "warn",
        message: `В тегах файла ${embedded.bpm} BPM, а в карточке ${pack.bpm}`,
        suggestion: "Перезапишите темп в теги при сохранении: покупатель ищет по карточке и не найдёт нужный бит.",
      });
    }

    if (embedded.key !== undefined && pack.key !== undefined) {
      const normalize = (text: string) => text.toLowerCase().replace("maj", "").replace("min", "").trim();

      if (
        normalize(embedded.key) !== normalize(pack.key) &&
        normalize(embedded.key).replace("#", "") !== normalize(pack.key).replace("#", "")
      ) {
        findings.push({
          id: "embedded.keyDiffers",
          severity: "warn",
          message: `В тегах файла ${embedded.key}, а в карточке ${pack.key}`,
          suggestion: "Приведите ключ в тегах к тому, что в карточке: фильтры сравнивают строки.",
        });
      }
    }
  }

  return findings;
}
