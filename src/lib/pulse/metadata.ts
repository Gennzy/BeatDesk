import { type GenreSlug } from "@/lib/beat-validation";
import { translit } from "@/lib/beat-promo";

/**
 * Метаданные видео для Pulse.
 *
 * Собираются по-настоящему, а не просятся у модели. Юридическая часть —
 * про лицензию и ссылку на покупку — обязана быть точной и неизменной:
 * ошибка в ней стоит не одного видео, а всех, кто на него ссылался.
 *
 * Лимиты YouTube зашиты здесь, а не берутся из документации, потому что
 * превышение лимита отклоняется при загрузке, и человек узнаёт об этом
 * через двадцать минут генерации видео. Проверяем здесь же, до рендера.
 */

/** Что YouTube принимает в заголовке. */
export const TITLE_LIMIT = 100;

/** Что YouTube принимает в описании. */
export const DESCRIPTION_LIMIT = 5000;

/** Суммарный лимит тегов, а не длина одного тега. */
export const TAGS_LIMIT = 500;

/**
 * Шаблон публикации.
 *
 * nonProfit — бит раздаётся бесплатно и только для некоммерческого
 * использования. В описании обязана быть ссылка на покупку, иначе автор
 * раздаёт своё даром и не получает ничего.
 *
 * paid — бит продаётся, и описание ведёт на страницу покупки.
 */
export type PulseTemplate = "nonProfit" | "paid";

export type BeatMeta = {
  title: string;
  bpm: number;
  musicalKey: string;
  genre: GenreSlug | null;
  /** Подпись жанра по-русски и по-английски: она уходит в описание. */
  genreLabel: string | null;
  tags: string[];
  artists: string[];
  producer: string;
  /** Адрес бита на площадке: в него уходит ссылка на покупку. */
  beatUrl: string;
};

export type PulseMetadata = {
  title: string;
  description: string;
  tags: string[];
  /** Техническая строка, которую ставят в конце: BPM и тональность. */
  techLine: string;
  /** Есть ли в заголовке имя бита. Без него видео не найти по названию. */
  named: boolean;
  /** Что не влезло и было срезано. Показывается, а не прячется. */
  trimmed: { title: boolean; description: boolean; tags: string[] };
};

/** Техническая строка: темп и тональность слитно, как их пишут в продакшене. */
function techLineOf(beat: Pick<BeatMeta, "bpm" | "musicalKey">): string {
  return `${beat.bpm}bpm ${beat.musicalKey.replace(/\s+/g, "")}`;
}

/**
 * Название видео.
 *
 * У BeatChain и у нас форма одинаковая: префикс, «type beat», название и
 * продюсер. Именно по такой строке биты ищутся в YouTube, и разбор её на
 * части заново приходилось бы каждому, кто ищет «type beat 150bpm».
 */
function titleOf(beat: BeatMeta, template: PulseTemplate): string {
  const free = template === "nonProfit" ? "[FREE] " : "";
  const kind = beat.artists.length > 0 ? `${beat.artists.join(", ")} type beat` : "type beat";

  /*
   * Пустое название бита не должно давать «type beat -  | prod. X»:
   * YouTube такое примет, а человек увидит в своём канале видео с двумя
   * пробелами и дырой посередине. Без названия берём продюсера — он есть
   * всегда, и «prod. Gennzy type beat» читается лучше, чем ничего.
   */
  const name = beat.title.trim();

  /*
   * Без названия бита «type beat -  | prod. X» выглядит дырой, а подставка
   * продюсера на место названия даёт «type beat - Gennzy | prod. Gennzy» —
   * масло масляное. Правильнее вовсе убрать название и оставить продюсера.
   */
  if (!name) {
    const who = beat.producer.trim();

    return who ? `${free}${kind} | prod. ${who}` : free + kind;
  }

  return `${free}${kind} - ${name} | prod. ${beat.producer}`;
}

/**
 * Описание.
 *
 * Первыми идут права: что можно с видео и что нельзя. Дальше — техника и
 * теги. Порядок не косметический: человек, открывший ссылку, читает
 * сверху, и «можно или нельзя» стоит дороже всего остального.
 */
function descriptionOf(beat: BeatMeta, template: PulseTemplate, hashtags: string[]): string {
  const head =
    template === "nonProfit"
      ? [
          "🔒 Бит доступен только для некоммерческого использования.",
          `Для релиза на Spotify / Apple Music / YouTube Monetization и использования в клипах — купите лицензию: ${beat.beatUrl}`,
        ]
      : [
          `Бит доступен по лицензии. Купить и скачать файлы: ${beat.beatUrl}`,
        ];

  const credit = beat.artists.length > 0 ? `must credit: ${beat.artists.join(", ")}` : "";

  /*
   * Пустые строки в списке — это разделители абзацев, и они нужны. Но
   * условные куски, которые без артистов или жанра дают пустую строку,
   * добавляли к разделителям ещё по одной, и в описании появлялось три
   * перевода строки подряд. YouTube такое сохраняет, а человек видит дыру
   * в своём видео.
   *
   * Поэтому условные куски отбрасываются целиком, а разделители остаются
   * явными: они стоят только там, где абзац действительно есть.
   */
  const parts: string[] = [...head];

  if (credit) parts.push("", credit, "Не удаляйте продасерский тег.");

  parts.push("", techLineOf(beat));

  if (beat.genreLabel) parts.push(`Жанр: ${beat.genreLabel}`);

  parts.push("", hashtags.join(" "));

  return parts.join("\n").trim();
}

/**
 * Теги.
 *
 * YouTube считает не число тегов, а их суммарную длину, и 500 символов —
 * это примерно 25 тегов. Лишнее срезается молча у того, кто превысил,
 * поэтому здесь лишнее тоже срезается молча: список всё равно полезен,
 * а обрезанные два тега в конце ничего не решают.
 */
function tagsOf(beat: BeatMeta): string[] {
  const out: string[] = [];

  const push = (value: string | null | undefined) => {
    const clean = value?.trim();
    if (clean && !out.includes(clean)) out.push(clean);
  };

  for (const tag of beat.tags) push(tag);
  /*
   * Тег жанра — по-английски, даже когда площадка на русском.
   *
   * Подпись «Трейп» пришла из словаря интерфейса, и в теги ушла вместе с
   * ней. YouTube ищут по-английски почти всегда, и русский тег там не
   * находит ровно того, кто его ищет. Слаг жанра уже английский — берём
   * его, а русскую подпись оставляем в описании, где она для человека.
   */
  if (beat.genre) push(beat.genre);
  push("type beat");
  push("beatmaking");
  push("instrumental");

  for (const artist of beat.artists) {
    push(`${artist} type beat`.slice(0, 30));
    push(translit(artist));
  }

  push(`${beat.bpm}bpm`);
  push(beat.musicalKey.replace(/\s+/g, ""));

  return out;
}

/** Хештеги из тегов: YouTube показывает их в описании и по ним ищет. */
function hashtagsFrom(tags: string[]): string[] {
  return tags
    .map((tag) => tag.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter(Boolean)
    .map((tag) => `#${tag}`);
}

/** Обрезает по лимиту YouTube и говорит, обрезалось ли. */
function clip(value: string, limit: number): { value: string; trimmed: boolean } {
  if (value.length <= limit) return { value, trimmed: false };

  /*
   * Режем по границе слова, а не по символу: заголовок, оборванный
   * посреди слова, выглядит опечаткой и хуже, чем на одно слово короче.
   */
  const cut = value.slice(0, limit);
  const space = cut.lastIndexOf(" ");

  return { value: space > limit * 0.6 ? cut.slice(0, space) : cut, trimmed: true };
}

/** Теги укладываются в общий лимит длины, а не в число. */
function clipTags(tags: string[], limit: number): { tags: string[]; dropped: string[] } {
  const kept: string[] = [];
  const dropped: string[] = [];

  // YouTube не считает разделители между тегами, но считает запятые после
  // последнего. Один символ запаса стоит одного тега, который не влез.
  let used = 0;

  for (const tag of tags) {
    const cost = tag.length + (kept.length > 0 ? 1 : 0);

    if (used + cost > limit) {
      dropped.push(tag);
      continue;
    }

    kept.push(tag);
    used += cost;
  }

  return { tags: kept, dropped };
}

export function buildPulseMetadata(beat: BeatMeta, template: PulseTemplate): PulseMetadata {
  const allTags = tagsOf(beat);

  const { tags, dropped } = clipTags(allTags, TAGS_LIMIT);

  // Описание строится по полному списку: хештеги в нём не ограничены
  // лимитом тегов, и обрезать их заранее значило бы выбросить то, что
  // в описание ещё влезло.
  const hashtags = hashtagsFrom(allTags);

  const rawDescription = descriptionOf(beat, template, hashtags);

  const title = clip(titleOf(beat, template), TITLE_LIMIT);
  const description = clip(rawDescription, DESCRIPTION_LIMIT);

  return {
    title: title.value,
    description: description.value,
    tags,
    techLine: techLineOf(beat),
    named: beat.title.trim().length > 0,
    trimmed: {
      title: title.trimmed,
      description: description.trimmed,
      tags: dropped,
    },
  };
}

/**
 * Проверка перед рендером видео.
 *
 * Порядок работы: сначала видео, потом загрузка. Если метаданные не
 * влезают, человек узнаёт об этом через двадцать минут генерации, и
 * придётся начинать заново.
 */
export function pulseMetadataProblem(metadata: PulseMetadata): string | null {
  if (!metadata.title.trim()) return "Пустое название: YouTube его не примет.";

  if (!metadata.named) {
    return "У бита не заполнено название — видео выйдет без него и не найдётся по запросу.";
  }

  if (metadata.title.length > TITLE_LIMIT) {
    return `Название длиннее ${TITLE_LIMIT} символов — YouTube обрежет его сам.`;
  }

  if (metadata.tags.length === 0) return "Нет ни одного тега: видео не найдут по названию.";

  return null;
}