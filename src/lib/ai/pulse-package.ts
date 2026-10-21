/**
 * Метаданные для YouTube от модели.
 *
 * ---------------------------------------------------------------------------
 * ЗАЧЕМ ЭТО, ЕСЛИ ЕСТЬ ПРАВИЛА
 *
 * Правила в metadata.ts дают надёжный минимум: жанр, темп, артисты, год. Но
 * они не знают, что именно в бите. Модель знает: по названию, тегам и жанру
 * она догадывается о настроении и о том, как этот бит ищут, — и именно по
 * этой догадке приходят зрители.
 *
 * У сервисов публикации битов так и устроено: упаковка не набирается руками.
 *
 * ---------------------------------------------------------------------------
 * ПОЧЕМУ ПРАВИЛА НЕ УБРАНЫ
 *
 * Модель может не ответить: нет ключа, модель перегружена, ключ истёк. В этот
 * момент человек нажал «собрать ролик», ждал двадцать минут рендера, и вместо
 * ролика получить сообщение об ошибке. Поэтому сгенерированное всегда проходит
 * через правила и лимиты, а отказ модели означает тишину в интерфейсе, а не
 * поломку.
 *
 * ---------------------------------------------------------------------------
 * ЧЕМУ МОДЕЛЬ УЧИТЬ НЕЛЬЗЯ
 *
 * Модель возвращает смысловую часть — заголовок, описание, теги. Она не
 * решает, влезает ли это в лимиты, не придумывает лицензию и не пишет
 * «must credit». Всё это остаётся за правилами, потому что ошибка здесь не
 * косметическая: обрезанное название не найдёт ролик, а выдуманная лицензия
 * стоит продажи.
 */

import { chat, type ChatMessage } from "./openrouter";
import { DESCRIPTION_LIMIT, TITLE_LIMIT, TAGS_LIMIT } from "../pulse/metadata";
import type { BeatMeta, PulseTemplate } from "../pulse/metadata";

/**
 * Что модель имеет право решать.
 *
 * Только смысл. Всё, что можно проверить числом, проверяется в clipMetadata,
 * а всё, что можно перепутать с фактом, модели не отдаётся вовсе.
 */
export type AiPackage = {
  title: string;
  description: string;
  tags: string[];
};

/** Что модель получила на вход. Собирается из того, что реально известно. */
export type PackageInput = {
  beat: BeatMeta;
  template: PulseTemplate;
  /**
   * Теги, которые на самом деле находят у нас.
   *
   * Приходят с сервера: там база, здесь только бит. Модель без них угадывает,
   * а с ними — знает, что работает именно здесь.
   */
  demandTags?: string[];
};

export const SYSTEM_PROMPT = [
  "Ты оформляешь публикацию бита на YouTube для битмейкера.",
  "Отвечай ТОЛЬКО валидным JSON, без рассуждений и без обёртки ```.",
  'Схема: {"title": string, "description": string, "tags": string[]}',
  "",
  "Правила:",
  "— title: как ищут этот бит артисты. Формат «<артисты> type beat — <название бита>».",
  "— description: 2–5 предложений о том, как этот бит звучит и под что подходит.",
  "— tags: 12–28 штук, латиницей, без символа #, по одному слову или фразе из 2 слов.",
  "",
  "Как выбирать теги — это и есть главная работа:",
  "— на каждый артист минимум три тега: «madk1d type beat», «madk1d type beat 2026», «madk1d type beat free for profit»;",
  "— жанр с настроением: «trap type beat melodic», «dark type beat hard»;",
  "— русскоязычные варианты: «тайп біт», «бесплатный type beat», «минус»;",
  "— год текущий и предыдущий.",
  "",
  "Чего не делать:",
  "— не выдумывать то, чего нет в данных: если жанр не указан, не называй жанр;",
  "— не писать о лицензии, ценах и ссылках на покупку: это добавляется отдельно;",
  "— не писать «must credit», «prod.» и юридические формулировки.",
].join("\n");

/** Сборка запроса. Отдельная функция, чтобы правила читались в тестах. */
export function buildPackageMessages({ beat, template, demandTags }: PackageInput): ChatMessage[] {
  const now = new Date();

  const facts: string[] = [`название бита: «${beat.title}»`, `продюсер: ${beat.producer}`];

  if (beat.artists.length > 0) facts.push(`артисты: ${beat.artists.join(", ")}`);
  facts.push(`темп: ${beat.bpm} BPM`);
  if (beat.musicalKey) facts.push(`тональность: ${beat.musicalKey}`);
  if (beat.genre) facts.push(`жанр: ${beat.genre}`);
  if (beat.tags.length > 0) facts.push(`теги автора: ${beat.tags.join(", ")}`);

  /*
   * Год говорится явно.
   *
   * Без него модель называет год по памяти и ошибается: в проверке на бите
   * «Night Vision» вышел 2025 при реальном 2026. Ошибка выглядит правдой,
   * и тег «type beat 2025» в описании просто не находится никем.
   */
  facts.push(`сейчас ${now.getFullYear()} год, прошлый — ${now.getFullYear() - 1}`);

  facts.push(
    template === "nonProfit"
      ? "лицензия: бесплатно, только некоммерческое использование"
      : "лицензия: платно, бит продаётся",
  );

  /*
   * Реальный спрос площадки.
   *
   * Модель знает, как ищут биты вообще, — по своему обучению. Она не знает,
   * как ищут у нас, и это единственное, где у площадки есть преимущество: её
   * собственные прослушивания.
   *
   * Эти теги — не пример и не совет, а то, что действительно приводит людей.
   * Спроси у модели без них, и она выдаст красивые и бесполезные слова.
   */
  if (demandTags?.length) {
    facts.push(`теги, которые у нас реально находят: ${demandTags.join(", ")}`);
  }

  return [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: [`Данные бита:`, ...facts.map((line) => `- ${line}`)].join("\n") },
  ];
}

/** Модель любит обёртки и преамбулы, а нужны только поля. */
function parseJson(raw: string): unknown {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : raw;

  // Модель любит довешивать хвост после объекта, поэтому берём первый
  // сбалансированный кусок, а не ждём идеальный документ.
  const start = body.indexOf("{");

  if (start < 0) return null;

  let depth = 0;

  for (let i = start; i < body.length; i++) {
    if (body[i] === "{") depth++;
    else if (body[i] === "}") {
      depth--;

      if (depth === 0) {
        try {
          return JSON.parse(body.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }

  return null;
}

/**
 * Приводит ответ модели к тому, что YouTube примет.
 *
 * Это единственное место, где решается, годится ли ответ. Модель возвращает
 * что угодно: пустые строки, названия в сто символов, теги с решёткой и
 * мусором внутри. Публиковать это нельзя, поэтому всё режется здесь — и
 * молча, без ошибки: непригодный кусок просто не попадает в список.
 */
export function sanitizePackage(raw: unknown, artists: string[]): AiPackage | null {
  if (!raw || typeof raw !== "object") return null;

  const source = raw as Record<string, unknown>;

  const title =
    typeof source.title === "string" ? source.title.replace(/[<>]/g, "").replace(/\s+/g, " ").trim() : "";

  if (!title) return null;

  const description =
    typeof source.description === "string"
      ? source.description.replace(/[<>]/g, "").replace(/[ \t]+/g, " ").trim().slice(0, DESCRIPTION_LIMIT)
      : "";

  /*
   * Теги чистятся так же, как их чистит правило для телеграма: решётка
   * убирается, пробелы и запятые внутри тега режутся. YouTube обрезает тег по
   * первому недопустимому символу, поэтому «dark trap beat» молча становится
   * «dark», а «free for profit» — «free».
   */
  const wanted = new Set(artists.map((artist) => artist.toLowerCase()));

  const tags = Array.isArray(source.tags)
    ? source.tags
        .filter((tag): tag is string => typeof tag === "string")
        .map((tag) => tag.replace(/^#/, "").replace(/[^\p{L}\p{N}_ ]/gu, "").trim())
        .filter(Boolean)
        // Имя артиста отдельно не нужно: имена идут в заголовок, а тег с
        // именем без «type beat» не находится никем.
        .filter((tag) => !wanted.has(tag.toLowerCase()))
        .filter((tag, i, all) => all.findIndex((item) => item.toLowerCase() === tag.toLowerCase()) === i)
    : [];

  if (tags.length === 0) return null;

  return { title: title.slice(0, TITLE_LIMIT), description, tags };
}

/** Длина списка тегов в том виде, в каком его считает YouTube. */
export function tagsLength(tags: string[]): number {
  return tags.join(",").length;
}

/**
 * Что можно взять из ответа модели, не потеряв обязательную часть.
 *
 * Теги модели — дополнение к правилам, а не замена: они могут оказаться
 * пустыми или мусорными, и тогда список остаётся прежним. Заголовок и
 * описание — наоборот, берутся от модели целиком, потому что она и умеет их
 * писать лучше правил.
 */
export function mergeWithRules(
  ai: AiPackage | null,
  ruled: { title: string; description: string; tags: string[] },
): { title: string; description: string; tags: string[] } {
  if (!ai) return ruled;

  const extra = ai.tags.filter((tag) => !ruled.tags.includes(tag));

  /*
   * Модельные теги идут в конец, а не в начало: правила отсортированы по
   * ценности, и перестановка местами отдала бы первый байт лимита словам,
   * которые никто не ищет.
   */
  let tags = [...ruled.tags, ...extra];

  while (tags.length > 1 && tagsLength(tags) > TAGS_LIMIT) tags = tags.slice(0, -1);

  return {
    title: ai.title || ruled.title,
    description: ai.description || ruled.description,
    tags,
  };
}

/**
 * Спросить модель и вернуть пакет.
 *
 * Отказ — это тишина, а не исключение: вызывающий живёт в потоке публикации,
 * где ролик собирается двадцать минут, и обрыв из-за подсказки недопустим.
 */
export async function suggestPackage(input: PackageInput): Promise<AiPackage | null> {
  /*
   * Бюджет токенов с запасом, и это не перестраховка.
   *
   * Часть бесплатных моделей сначала рассуждает, и на эту болтовню уходит
   * несколько сотен токенов. При max_tokens в 900 рассуждения съедали весь
   * бюджет, и модель возвращала пустой ответ: 200 без содержимого. Ответ на
   * вопрос «почему ИИ ничего не подсказал» был именно в этом, а не в ключе.
   *
   * Рассуждение не вырезается насильно — у провайдера нет надёжного флага для
   * этого, — поэтому бюджет просто рассчитан на оба.
   */
  const result = await chat(buildPackageMessages(input), { maxTokens: 3000 });

  if (!("text" in result)) return null;

  return sanitizePackage(parseJson(result.text), input.beat.artists);
}