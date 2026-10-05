import { PLATFORMS, type PlatformId } from "./platform-rules";

/**
 * «Выходной контроль», слой гигиены пакета.
 *
 * Формат проходит по формату, но выкладка всё равно летит в корзину.
 * Здесь живут вещи, о которых площадка молчит, а виноват всегда битмейкер:
 * стемы в тощем битре, обложка в триста пикселей, теги не в том поле.
 */

/** Что лежит в пакете, как это видит человек перед отправкой. */
export type PackageFacts = {
  title: string;
  bpm?: number;
  /** Ключ в том виде, в каком битмейкер его ввёл. */
  key?: string;
  genre?: string;
  mood?: string;
  tags?: string[];
  /** Названия файлов, которые поедут на площадку. */
  files: { name: string; role: "wav" | "mp3" | "stems" | "artwork" | "other" }[];
  /** Что записано в самом WAV: читаем теги файла. */
  embedded?: { title?: string; artist?: string; bpm?: number; key?: string };
};

export type HygieneFinding = {
  id: string;
  severity: "block" | "warn";
  message: string;
  suggestion: string;
};

const EXTENSION: Record<string, string> = {
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

export function checkPackage(platform: PlatformId, pack: PackageFacts): HygieneFinding[] {
  const rules = PLATFORMS.find((item) => item.id === platform);
  const findings: HygieneFinding[] = [];
  const harsh = platform === "beatstars" ? "block" : "warn";

  const roles = new Set(
    pack.files.map((file) => file.role !== "other" ? file.role : (EXTENSION[baseName(file.name).toLowerCase().slice(baseName(file.name).toLowerCase().lastIndexOf("."))] as PackageFacts["files"][number]["role"]) ?? "other"),
  );

  if (pack.files.length === 0) {
    findings.push({
      id: "files.empty",
      severity: "block",
      message: "В пакете нет ни одного файла",
      suggestion: "Добавьте мастер: без аудиофайла площадка не создаст карточку.",
    });
  }

  if (rules && pack.files.length > (rules.maxFilesPerUpload ?? Infinity)) {
    findings.push({
      id: "files.tooMany",
      severity: "block",
      message: `Файлов ${pack.files.length}, а площадка принимает за одну загрузку ${rules.maxFilesPerUpload}`,
      suggestion: "Разделите пакет на две выкладки и не меняйте название бита между ними.",
    });
  }

  if (rules && !roles.has("wav")) {
    findings.push({
      id: "files.noMaster",
      severity: platform === "airbit" ? "block" : "warn",
      message: "В пакете нет WAV",
      suggestion: rules
        ? "Мастер нужен как источник: площадка собирает из него MP3 и превью."
        : "Добавьте WAV, чтобы площадка могла собрать превью сама.",
    });
  }

  // BeatStars сам помечает MP3, поэтому требовать его — значит гонять
  // битмейкера делать лишний рендер.
  if (rules && rules.mp3 === "required" && !roles.has("mp3")) {
    findings.push({
      id: "files.noMp3",
      severity: "block",
      message: "Площадка требует отдельный MP3",
      suggestion: "Сделайте превью из мастера и положите его рядом: площадка не генерирует его сама.",
    });
  }

  if (rules && roles.has("stems")) {
    findings.push({
      id: "stems.lowBitDepth",
      severity: "warn",
      message: "Стемы отправляются в пакете, но их разрядность мы не проверяли",
      suggestion: "Проверьте, что стемы не ниже 24 бит: покупатель их содит, и квантование слышно.",
    });
  }

  if (!roles.has("artwork") && rules?.fields.artwork?.trust === "documented") {
    findings.push({
      id: "artwork.missing",
      severity: "warn",
      message: "Обложка не приложена",
      suggestion: "Без обложки карточка теряется в ленте: у площадки нечего показать.",
    });
  }

  const name = pack.title.trim();

  if (name.length > 0 && !/^[\p{L}\p{N} .,'&!?\-–—_()]+$/u.test(name)) {
    findings.push({
      id: "title.symbols",
      severity: "warn",
      message: `В названии «${name}» есть необычные символы`,
      suggestion: "Оставьте буквы, цифры и простые знаки: часть площадок режет такие названия.",
    });
  }

  if (name.length > 80) {
    findings.push({
      id: "title.long",
      severity: "warn",
      message: `Название из ${name.length} символов обрежется в выдаче`,
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

  const limits = rules?.tagLimits;

  if (limits) {
    const tags = (pack.tags ?? []).map((tag) => tag.trim()).filter(Boolean);

    if (tags.length > (limits.tags ?? Infinity)) {
      findings.push({
        id: "tags.tooMany",
        severity: harsh,
        message: `Тегов ${tags.length}, площадка читает ${limits.tags}`,
        suggestion: `Оставьте ${limits.tags} самых точных: лишние всё равно не попадут в фильтры.`,
      });
    }

    if (new Set(tags.map((tag) => tag.toLowerCase())).size !== tags.length) {
      findings.push({
        id: "tags.duplicates",
        severity: "warn",
        message: "Теги повторяются",
        suggestion: "Уберите дубли в другом регистре: «Trap» и «trap» площадка считает одним и тем же.",
      });
    }
  }

  if (pack.genre !== undefined && pack.genre.trim().length === 0) {
    findings.push({
      id: "genre.missing",
      severity: "warn",
      message: "Жанр не выбран",
      suggestion: "Без жанра бит не попадает в подборки площадки.",
    });
  }

  const embedded = pack.embedded;

  if (embedded) {
    // Площадки берут название из файла, если поле карточки пустое. Разные
    // источники названия дают один бит с двумя именами в выдаче.
    if (embedded.title !== undefined && embedded.title.trim() !== name && name.length > 0) {
      findings.push({
        id: "embedded.titleDiffers",
        severity: "warn",
        message: `В файле записано «${embedded.title}», а в карточке «${name}»`,
        suggestion: "Сделайте названия одинаковыми, иначе площадка покажет своё имя из тегов.",
      });
    }

    if (embedded.bpm !== undefined && pack.bpm !== undefined && Math.abs(embedded.bpm / pack.bpm - 1) > 0.04) {
      findings.push({
        id: "embedded.bpmDiffers",
        severity: "warn",
        message: `В тегах файла ${embedded.bpm} BPM, а в карточке ${pack.bpm}`,
        suggestion: "Перезапишите темп в теги при сохранении: площадка читает их раньше карточки.",
      });
    }

    if (embedded.key !== undefined && pack.key !== undefined) {
      const normalize = (text: string) => text.toLowerCase().replace("maj", "").replace("min", "").trim();

      if (normalize(embedded.key) !== normalize(pack.key) && normalize(embedded.key).replace("#", "") !== normalize(pack.key).replace("#", "")) {
        findings.push({
          id: "embedded.keyDiffers",
          severity: "warn",
          message: `В тегах файла ${embedded.key}, а в карточке ${pack.key}`,
          suggestion: "Приведите ключ в тегах к тому, что в карточке: фильтры сравнивают строки.",
        });
      }
    }
  }

  // BeatStars различает мастер с тегом и без него.
  if (platform === "beatstars") {
    const masters = pack.files.filter((file) => file.role === "wav");

    if (masters.length > 1) {
      findings.push({
        id: "files.ambiguousMaster",
        severity: "warn",
        message: `В пакете ${masters.length} файла WAV`,
        suggestion: "Площадка спросит, какой из них мастер без тега. Ответьте заранее: переименуйте остальные в tagged и untagged.",
      });
    }
  }

  return findings;
}
