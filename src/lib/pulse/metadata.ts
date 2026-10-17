import { type GenreSlug } from "@/lib/beat-validation";

import {
  MINOR_CYRILLIC,
  MOODS,
  TAG_YEARS,
  TYPE_BEAT_CYRILLIC,
  atomsOf,
  genreWords,
  moodFromKey,
} from "./tag-vocabulary";

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
  /**
   * Теги, по которым видео находят: жанр, темп, продажа, продюсер.
   *
   * Отделены от авторских, потому что человек должен видеть разницу: одни
   * теги работают всегда, а вторые — добавка от него самого. Раньше всё лежало
   * в одну строку, и непонятно было, что из обязательного он может убрать, а
   * что нельзя.
   */
  coreTags: string[];
  /** Теги самого бита: mood, исполнители, всё, что знает автор. */
  ownTags: string[];
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
 * Форма устоявшаяся: префикс, «type beat», название и продюсер. Именно по
 * такой строке биты ищутся в YouTube, и разбор её на части заново
 * приходился бы каждому, кто ищет «type beat 150bpm».
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
 * Теги: так, как их собирают сервисы публикации битов.
 *
 * Порядок здесь и есть смысл. YouTube обрезает теги по суммарной длине, и
 * до обрезки доходит начало списка: первые теги работают, последние не
 * работают никогда. Поэтому список начинается с того, по чему бит ищут, а не
 * с того, что автор сам наобум накидал в поле «теги».
 *
 * Порядок групп:
 *
 *   1. «type beat» и жанр со словом «beat» — так пишут в поиске: «trap beat»,
 *      а не «trap». Голый слаг жанра не находится никем.
 *   2. темп с пробелом («150 bpm») — так его и набирают руками, плюс форма
 *      без пробела для тех, кто пишет слитно.
 *   3. «beats for sale» и «free for profit» — намерение покупателя. Это самые
 *      дорогие теги из всех: по ним ищут люди, уже готовые заплатить.
 *   4. продюсер и артисты: «X type beat», «beats by X».
 *   5. авторские теги — mood и всё, что автор знает о бите и чего не знает
 *      модуль. В конце, потому что это добавка, а не основа поиска.
 *
 * Лишнее срезается по-прежнему молча, но теперь молча срезается хвост, а не
 * начало.
 */
function tagsOf(
  beat: BeatMeta,
  template: PulseTemplate,
): { all: string[]; core: string[]; own: string[] } {
  const out: string[] = [];

  const push = (value: string | null | undefined) => {
    const clean = value?.trim();
    if (clean && !out.includes(clean)) out.push(clean);
  };

  const genres = beat.genre ? genreWords(beat.genre) : [];
  const keyMoods = moodFromKey(beat.musicalKey);

  // Основа: как биты ищут.
  push("type beat");

  for (const words of genres) {
    /*
     * «beat» добавляем только если его ещё нет. Псевдоним «rap beat» уже
     * заканчивается на «beat», и без проверки получалось «rap beat beat» —
     * мусор, который не находит никто, но съедает лимит.
     *
     * Обратный порядок («beat trap») не строим: так не ищет никто, а места
     * в лимите не хватает.
     */
    push(/\bbeat$/.test(words) ? words : `${words} beat`);
  }

  if (beat.genre) {
    // Слаг тоже: часть людей ищет по нему, и он ничего не стоит.
    push(beat.genre);
  }

  // Темп: с пробелом — как в запросе, без — как в тегах битмейкеров.
  push(`${beat.bpm} bpm`);
  push(`${beat.bpm}bpm`);

  /*
   * Намерение купить.
   *
   * Тег «beats for sale» — самый дорогой из всех, но ставится только платному
   * биту. На бите с бесплатной некоммерческой лицензией он неправдив: клик
   * приведёт на страницу, где купить нельзя, и зритель уходит. Бесплатному
   * биту вместо этого достаётся «free for profit» — там он ищется по той же
   * самой причине, просто другим намерением.
   */
  if (template === "paid") {
    push("beats for sale");
    push("beat for sale");
  }

  if (template === "nonProfit") {
    push("free for profit");
    push("free beat");
  }

  const key = beat.musicalKey.replace(/\s+/g, "");

  if (key) {
    push(key);
    push(`${key} beat`);
  }

  const who = beat.producer.trim();

  if (who) {
    push(`${who} type beat`.slice(0, 30));
    push(`beats by ${who}`.slice(0, 30));
  }

  /*
   * Тональность как настроение — раньше кластеров и после намерения купить.
   *
   * «C minor» в тегах не ищет никто: ноты знают единицы. Ищут «минус» и
   * «dark». Тегов тут два-три, стоят они дёшево, а приводят тех, кто уже
   * выбрал настроение и ищет под него бит.
   */
  for (const mood of keyMoods) {
    push(`${mood} ${MINOR_CYRILLIC}`);
    push(`${mood} type beat`);
  }

  /*
   * Кластеры.
   *
   * Дальше список растёт не тегами по одному, а кластерами: на каждый атом —
   * артиста или настроение — сразу несколько форм. «prod.dy type beat»,
   * «free prod.dy type beat», «prod.dy type beat free for profit» — это один
   * атом и три разных запроса, которые иначе не нашлись бы никогда.
   *
   * Именно так устроены теги у сервисов публикации битов, и именно поэтому у
   * них по пятнадцать тегов, а у нас было семь.
   *
   * Пять форм, а не девять, — сознательно. Лимит YouTube — 500 символов на
   * весь список, и лишние формы вытесняли настроения: в прошлой версии на
   * бит с одним артистом кластер занимал четверть лимита, и половина тегов
   * про минор просто не публиковалась.
   *
   * Порядок атомов: артисты первыми — по имени приходят самые целевые
   * зрители, — потом настроения.
   */
  /*
   * Атомы по убыванию ценности, а не по количеству.
   *
   * Порядок важнее, чем кажется: лимит 500 символов, список обрезается с
   * конца, и кто стоит в хвосте — не публикуется никогда.
   *
   *   1. артисты — по имени приходят самые целевые зрители;
   *   2. настроения автора — автор знает про бит больше любого словаря;
   *   3. авторские теги — часто именно здесь лежат настоящие имена артистов,
   *      а в поле «артисты» стоит продюсер: «slayr» ценнее словарного «hard».
   *
   * Продюсера здесь нет намеренно: он уже получил «Gennzy type beat» и
   * «beats by Gennzy» в шапке. Второй кластер из пяти тегов стоил 126
   * символов и вытеснял имена артистов — «slayr type beat» не доезжал до
   * публикации вообще.
   */
  const atoms = [
    ...atomsOf(beat.artists, "", []),
    ...atomsOf([], "", beat.tags),
  ];
  const free = template === "nonProfit";
  const [year, lastYear] = TAG_YEARS;

  for (const atom of atoms) {
    const name = atom.slice(0, 30);

    push(`${name} type beat`);
    push(`${name} type beat ${year}`);

    if (free) {
      push(`${name} type beat free for profit`);
      push(`free for profit ${name} type beat`);
    }

    /*
     * «тайп біт» — самый дорогой тег кластера после «free for profit»: так
     * ищут русскоязычные, а латинское «type beat» их не находит.
     */
    push(`${name} ${TYPE_BEAT_CYRILLIC}`.slice(0, 30));

    if (free) push(`бесплатный ${name} ${TYPE_BEAT_CYRILLIC}`.slice(0, 30));
  }

  /*
   * Жанр с настроением — одна форма, а не всё произведение.
   *
   * «trap type beat dark» — узкий запрос: ищут, когда жанр уже известен и
   * осталось уточнить настроение. Таких пар десятки, и в лимит входит ровно
   * одна. Полное произведение занимало бы место, отданное артистам.
   *
   * Настроение берётся из тональности, а не из первого тега: тег может быть
   * именем артиста, а «минус» — это и правда настроение, и оно всегда есть.
   */
  for (const word of genres) {
    push(`${word} type beat ${keyMoods[0]}`);
    push(`${word} instrumental`);
  }

  // Словарь — последним: он заполняет остаток и выкидывается первым.
  for (const mood of MOODS) {
    push(`${mood} type beat`);
    push(`${mood} type beat ${year}`);

    push(`${mood} ${TYPE_BEAT_CYRILLIC}`.slice(0, 30));
  }

  push(`${lastYear} type beat`);

  /*
   * Инструментал — последний: редкий запрос от того, кто уже знает, что
   * ищет, и конверсия у него самая высокая.
   */
  const core = out.slice();
  const own: string[] = [];

  for (const tag of beat.tags) {
    const clean = tag?.trim();

    if (clean && !out.includes(clean)) {
      out.push(clean);
      own.push(clean);
    }
  }

  return { all: out, core, own };
}

/**
 * Хештеги из тегов: YouTube показывает их в описании и по ним ищет.
 *
 * Только первые три. YouTube выносит первые три хештега над заголовком видео,
 * а остальные прячет в описание, где они превращаются в стену из двадцати
 * слов под текстом о лицензии. Три главных тега — и есть те, по которым
 * видео находят.
 */
function hashtagsFrom(tags: string[]): string[] {
  return tags
    .slice(0, 3)
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

export function buildPulseMetadata(
  beat: BeatMeta,
  template: PulseTemplate,
  /**
   * Теги, которые человек убрал руками.
   *
   * Убрать можно любой, включая обязательный: человек знает свой бит лучше
   * модуля. Но всегда показывается, что именно исчезнет, — молча выкинутый
   * тег обнаруживается только на YouTube, когда видео не находят.
   */
  dropped: string[] = [],
): PulseMetadata {
  const blocked = new Set(dropped.map((tag) => tag.trim()).filter(Boolean));
  const grouped = tagsOf(beat, template);

  const allTags = grouped.all.filter((tag) => !blocked.has(tag));

  const { tags, dropped: clipped } = clipTags(allTags, TAGS_LIMIT);

  /*
   * Чипы показывают ровно то, что уйдёт в YouTube, а не весь рассчитанный
   * список.
   *
   * Раньше группы собирались до обрезки, и человек видел тридцать тегов, из
   * которых пятнадцать всё равно не публиковались: визуально невозможно
   * отличить опубликованное от отброшенного, и кажется, что бит плохо
   * оптимизирован. Отброшенные считаются отдельно в trimmed.tags.
   */
  const published = new Set(tags);
  const coreTags = grouped.core.filter((tag) => published.has(tag));
  const ownTags = grouped.own.filter((tag) => published.has(tag));

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
    coreTags,
    ownTags,
    techLine: techLineOf(beat),
    named: beat.title.trim().length > 0,
    trimmed: {
      title: title.trimmed,
      description: description.trimmed,
      tags: [...blocked, ...clipped],
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