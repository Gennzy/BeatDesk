import { describe, expect, it } from "vitest";

import {
  buildPulseMetadata,
  pulseMetadataProblem,
  DESCRIPTION_LIMIT,
  TAGS_LIMIT,
  TAG_LENGTH_LIMIT,
  TITLE_LIMIT,
  type BeatMeta,
} from "./metadata";

/**
 * Метаданные для YouTube.
 *
 * Проверяется не вид, а текст и лимиты. Ошибка в заголовке или описании
 * уходит наружу и остаётся там навсегда: видео видно всем, и «исправить
 * это» стоит ручной правки в чужом кабинете.
 */
const beat: BeatMeta = {
  title: "Slayr & Pittkiid Type Beat | Mimosa",
  bpm: 130,
  musicalKey: "F# minor",
  genre: "trap",
  genreLabel: "Трап",
  tags: ["slayr", "pittkiid", "mayot"],
  artists: ["prod.dy"],
  producer: "Gennzy",
  beatUrl: "https://beat-desk.ru/beats/123",
};

describe("метаданные Pulse", () => {
  it("название собирается так, как биты ищут в YouTube", () => {
    const meta = buildPulseMetadata(beat, "nonProfit");

    expect(meta.title).toBe("[FREE] prod.dy type beat - Slayr & Pittkiid Type Beat | Mimosa | prod. Gennzy");
  });

  it("без свободного распространения префикса нет", () => {
    const meta = buildPulseMetadata(beat, "paid");

    expect(meta.title.startsWith("[FREE]")).toBe(false);
  });

  it("без артистов название остаётся разбираемым", () => {
    const meta = buildPulseMetadata({ ...beat, artists: [] }, "nonProfit");

    // Пустое « type beat — » хуже, чем просто «type beat».
    expect(meta.title).toBe("[FREE] type beat - Slayr & Pittkiid Type Beat | Mimosa | prod. Gennzy");
  });

  it("в описании бесплатного бита есть и запрет, и ссылка на покупку", () => {
    const meta = buildPulseMetadata(beat, "nonProfit");

    expect(meta.description).toContain("только для некоммерческого использования");
    expect(meta.description).toContain(beat.beatUrl);
  });

  it("в описании платного бита запрета нет, а ссылка есть", () => {
    const meta = buildPulseMetadata(beat, "paid");

    expect(meta.description).toContain(beat.beatUrl);
    expect(meta.description).not.toContain("только для некоммерческого использования");
  });

  it("кредит указывает битмейкера, а не артистов", () => {
    const meta = buildPulseMetadata(beat, "nonProfit");

    /*
     * «must credit» — это «укажи меня, если используешь бит». Артисты
     * (prod.dy) тут бесполезны: их имена и так в названии, а вот имя
     * битмейкера нужно, чтобы трафик и репутация шли к нему.
     */
    expect(meta.description).toContain("must credit: Gennzy");
    expect(meta.description).not.toContain("must credit: prod.dy");
  });

  it("без битмейкера строка кредита не остаётся висячей", () => {
    const meta = buildPulseMetadata({ ...beat, producer: "" }, "nonProfit");

    expect(meta.description).not.toContain("must credit:");
  });

  it("техническая строка склеена — так её пишут в продакшене", () => {
    expect(buildPulseMetadata(beat, "paid").techLine).toBe("130bpm F#minor");
  });

  it("название укладывается в лимит YouTube", () => {
    const long = { ...beat, title: "Ж".repeat(200), artists: ["Х".repeat(60)] };
    const meta = buildPulseMetadata(long, "nonProfit");

    expect(meta.title.length).toBeLessThanOrEqual(TITLE_LIMIT);
    expect(meta.trimmed.title).toBe(true);
  });

  it("обрезанное название не кончается полусловом", () => {
    const long = { ...beat, title: "beat ".repeat(40), artists: [] };
    const meta = buildPulseMetadata(long, "paid");

    expect(meta.trimmed.title).toBe(true);
    expect(meta.title.endsWith(" ")).toBe(false);
  });

  it("теги укладываются в суммарный лимит, а не в число", () => {
    const fat = {
      ...beat,
      tags: Array.from({ length: 40 }, (_, i) => `очень-длинный-тег-номер-${i}`),
      artists: ["prod.one", "prod.two", "prod.three", "prod.four"],
    };

    const meta = buildPulseMetadata(fat, "paid");
    const used = meta.tags.join(",").length;

    expect(used).toBeLessThanOrEqual(TAGS_LIMIT);
    expect(meta.trimmed.tags.length).toBeGreaterThan(0);
  });

  it("тег жанра английский, а не подпись из интерфейса", () => {
    const meta = buildPulseMetadata(beat, "paid");

    // «Трейп» в тегах не находит ничего: YouTube ищут по-английски.
    expect(meta.tags).toContain("trap");
    expect(meta.tags).not.toContain("Трап");
    // В описании остаётся по-русски — там читает человек.
    expect(meta.description).toContain("Жанр: Трап");
  });

  it("теги не повторяются", () => {
    const meta = buildPulseMetadata({ ...beat, tags: ["trap", "trap", "trap"] }, "paid");

    expect(new Set(meta.tags).size).toBe(meta.tags.length);
  });

  it("первым идёт «type beat» — по нему ищут сами биты", () => {
    const meta = buildPulseMetadata(beat, "paid");

    /*
     * Авторские теги шли первыми и съедали лимит: на бите с длинными
     * тегами до «type beat» очередь не доходила, и видео не находилось ни по
     * одному запросу, ради которого его и выкладывали.
     */
    expect(meta.tags[0]).toBe("type beat");
  });

  it("жанр попадает в теги со словом «beat», а не голым слагом", () => {
    const meta = buildPulseMetadata(beat, "paid");

    // «trap beat» — как ищут; «trap» сам по себе почти ничего не находит.
    expect(meta.tags).toContain("trap beat");
    expect(meta.tags).toContain("trap");
    // Обратный порядок не строим: YouTube не различает порядок слов в тегах,
    // а 9 символов лимита лучше отдать настроению.
    expect(meta.tags).not.toContain("beat trap");
  });

  it("темп идёт с пробелом и без — так его ищут и так пишут", () => {
    const meta = buildPulseMetadata(beat, "paid");

    expect(meta.tags).toContain("130 bpm");
    expect(meta.tags).toContain("130bpm");
  });

  it("есть теги о намерении купить", () => {
    const paid = buildPulseMetadata(beat, "paid");
    const free = buildPulseMetadata(beat, "nonProfit");

    expect(paid.tags).toContain("beats for sale");
    // Бесплатный бит должен находиться и по запросу про бесплатный.
    expect(free.tags).toContain("free for profit");
    expect(paid.tags).not.toContain("free for profit");
  });

  it("жанр через дефис разбирается на слова", () => {
    const dashed = buildPulseMetadata({ ...beat, genre: "boom-bap" }, "paid");

    expect(dashed.tags).toContain("boom bap beat");
  });

  it("авторские теги не вытесняют основные, даже когда их много", () => {
    const fat = {
      ...beat,
      tags: Array.from({ length: 40 }, (_, i) => `длинный-авторский-тег-${i}`),
    };

    const meta = buildPulseMetadata(fat, "paid");

    expect(meta.tags.slice(0, 8)).toContain("type beat");
    expect(meta.tags.slice(0, 8).some((tag) => tag.includes("авторский"))).toBe(false);
  });

  it("в описании три хештега, а не стена", () => {
    const meta = buildPulseMetadata(beat, "paid");

    /*
     * Хештег начинается с начала строки или после пробела. Решетка внутри
     * «F#minor» из технической строки хештегом не является — и YouTube так
     * же её не считает, поэтому и проверка требует границу.
     */
    const hashtags = meta.description.match(/(?:^|\s)#[^\s]+/g) ?? [];

    // YouTube выносит первые три над заголовком, остальное — просто шум.
    expect(hashtags).toHaveLength(3);
  });

  it("на каждый атом — несколько форм, как у сервисов публикации", () => {
    const meta = buildPulseMetadata(beat, "nonProfit");
    const tags = meta.tags;

    /*
     * Один артист — минимум четыре разных запроса: сам, с годом, свободный и
     * кириллический. Без этого длинного хвоста не существует: один тег на
     * артиста находит тех, кто уже знает имя, а остальные ищут по описанию.
     */
    expect(tags).toContain("prod.dy type beat");
    expect(tags.some((tag) => /^prod\.dy type beat \d{4}$/.test(tag))).toBe(true);
    expect(tags).toContain("free prod.dy type beat");
    expect(tags).toContain("prod.dy тайп біт");
  });

  it("ни один тег не длиннее тридцати символов", () => {
    const long = {
      ...beat,
      artists: ["villian production", "madk1d official"],
      tags: ["очень длинный тег автора"],
    };

    const meta = buildPulseMetadata(long, "nonProfit");

    /*
     * YouTube отбрасывает слишком длинный тег целиком. Обрезать нельзя:
     * «prod.dy type beat free for» — обрывок, который не находит никто.
     * Поэтому длинные формы уходят в описание, а не сюда.
     */
    for (const tag of meta.tags) expect(tag.length).toBeLessThanOrEqual(TAG_LENGTH_LIMIT);
  });

  it("длинные формы не теряются, а уходят в описание", () => {
    const meta = buildPulseMetadata(beat, "nonProfit");

    // То, что не влезает в тридцать символов, обязано найтись в описании.
    expect(meta.description).toContain("free for profit prod.dy type beat");
    expect(meta.description).toContain("бесплатный prod.dy тайп біт");
  });

  it("объединённая форма артистов повторяет название", () => {
    const two = {
      ...beat,
      artists: ["madk1d", "villian"],
    };

    const meta = buildPulseMetadata(two, "nonProfit");

    // Название: «madk1d, villian type beat - …». Ищут ровно эту строку, и
    // YouTube тем сильнее считает бит своим, чем ближе теги к названию.
    expect(meta.title).toContain("madk1d, villian type beat");
    expect(meta.tags).toContain("madk1d villian type beat");
    // И отдельный кластер на каждого: это два разных человека.
    expect(meta.tags).toContain("madk1d type beat");
    expect(meta.tags).toContain("villian type beat");
  });

  it("бесплатное намерение выражено, а не подменено одной формой", () => {
    const free = buildPulseMetadata(beat, "nonProfit");

    /*
     * Формы «free …» разные, и держать их все нельзя: лимит 500 символов, и
     * каждая лишняя съедает настроение. Проверяем поэтому намерение целиком —
     * чтобы его нельзя было потерять, убрав все формы разом.
     */
    expect(free.tags).toContain("free for profit");
    expect(free.tags.some((tag) => /free for profit/.test(tag))).toBe(true);
  });

  it("бесплатный бит не обещает продажу", () => {
    const free = buildPulseMetadata(beat, "nonProfit");

    // На бите с некоммерческой лицензией купить нельзя: клик приведёт в
    // тупик, а «beats for sale» — самый дорогой тег из всех.
    expect(free.tags).not.toContain("beats for sale");
    expect(buildPulseMetadata(beat, "paid").tags).toContain("beats for sale");
  });

  it("кириллическое «тайп бит» ставится рядом с латинским", () => {
    const meta = buildPulseMetadata(beat, "nonProfit");

    // «type beat» и «тайп біт» — разные запросы, и русскоязычный покупатель
    // находит бит только по второму.
    expect(meta.tags).toContain("prod.dy type beat");
    expect(meta.tags).toContain("prod.dy тайп біт");
    expect(meta.tags).toContain("бесплатный prod.dy тайп біт");
  });

  it("настроение попадает и в жанр, и в отдельный тег", () => {
    const meta = buildPulseMetadata({ ...beat, musicalKey: "C minor" }, "paid");

    // «dark» берётся из минора: тег может быть именем артиста, а тональность
    // — это единственный источник настроения, который есть всегда.
    expect(meta.tags.some((tag) => /trap type beat dark/.test(tag))).toBe(true);
    expect(meta.tags).toContain("dark type beat");
  });

  it("минус из тональности доезжает до тегов", () => {
    const meta = buildPulseMetadata({ ...beat, musicalKey: "C minor" }, "paid");

    // «minor» в тегах бесполезно: так не ищет никто. Ищут «минус» и «dark».
    expect(meta.tags).toContain("dark минус");
    expect(meta.tags).toContain("melodic минус");
  });

  it("жанр не получает «beat» дважды", () => {
    const meta = buildPulseMetadata({ ...beat, genre: "trap" }, "paid");

    // Псевдоним «rap beat» уже заканчивается на «beat»: без проверки выходило
    // «rap beat beat» — мусор, который съедал лимит.
    expect(meta.tags).not.toContain("rap beat beat");
    expect(meta.tags).toContain("rap beat");
  });

  it("артисты из тегов тоже получают кластер", () => {
    const meta = buildPulseMetadata({ ...beat, tags: ["slayr"] }, "nonProfit");

    // В поле артистов лежит продюсер, а настоящие артисты — в тегах.
    expect(meta.tags).toContain("slayr type beat");
  });

  it("мажорный бит не получает тег «минус»", () => {
    const major = buildPulseMetadata({ ...beat, musicalKey: "F# major" }, "paid");

    /*
     * На бите F# major выходило «bright минус»: YouTube получал утверждение,
     * что бит минорный. «Минус» добавляется только минорам.
     */
    expect(major.tags.some((tag) => tag.includes("минус"))).toBe(false);
    expect(major.description).not.toContain("минус");
  });

  it("минорный бит получает «минус» — его ищут вместо нот", () => {
    const minor = buildPulseMetadata({ ...beat, musicalKey: "C minor" }, "paid");

    // Ноты не ищет никто: «C minor» бесполезно, а «dark минус» — запрос.
    expect(minor.tags).toContain("type beat минус");
    expect(minor.tags).toContain("dark минус");
  });

  it("жанр не спорит сам с собой в паре с настроением", () => {
    const dark = buildPulseMetadata({ ...beat, genre: "dark" }, "paid");

    // На жанре «dark» выходило «dark type beat bright» — бит, который
    // одновременно тёмный и светлый. Противоречие хуже отсутствия тега.
    for (const tag of dark.tags) {
      expect(tag).not.toMatch(/^dark type beat dark/);
    }

    expect(dark.tags).toContain("dark type beat melodic");
  });

  it("хештеги — артисты, а не продюсер и не жанр", () => {
    const two = { ...beat, artists: ["madk1d", "villian"], tags: [] };
    const meta = buildPulseMetadata(two, "nonProfit");
    // Решётка внутри «F#minor» из технической строки хештегом не является.
    const hashtags = (meta.description.match(/(?:^|\s)#[^\s]+/g) ?? []).map((tag) => tag.trim());

    /*
     * Три хештега показываются над заголовком — единственное место, где тег
     * видит человек. По счёту первыми шли продюсер и жанр: «#Gennzytypebeat
     * #darktypebeat» — ровно то, что не ищет никто конкретный.
     */
    expect(hashtags).toEqual(["#madk1dtypebeat", "#villiantypebeat", "#madk1dvilliantypebeat"]);
    expect(hashtags.join(" ")).not.toContain("Gennzy");
  });

  it("смешанного хештега латиница с кириллицей не бывает", () => {
    const two = { ...beat, artists: ["madk1d", "villian"], tags: [] };
    const meta = buildPulseMetadata(two, "nonProfit");

    // «#madk1dvillianтайпбіт» — не запрос, а склейка. Кириллица в тегах
    // остаётся, но в хештег не идёт.
    for (const tag of meta.description.match(/(?:^|\s)#[^\s]+/g) ?? []) {
      expect(tag).not.toMatch(/#[a-zA-Z]+[а-яА-Я]/);
    }
  });

  it("длинный хвост ключевых слов помещается в описание", () => {
    const meta = buildPulseMetadata(beat, "nonProfit");
    const block = meta.description.match(/Ключевые слова:\n(.+)/)?.[1] ?? "";

    // Теги упираются в 500 символов, описание — в 5000. Хвост живёт здесь.
    expect(block.length).toBeGreaterThan(500);
    expect(meta.description.length).toBeLessThanOrEqual(DESCRIPTION_LIMIT);
    expect(meta.tags.join(",").length).toBeLessThanOrEqual(TAGS_LIMIT);
  });

  it("авторские теги публикуются, даже когда лимит тесный", () => {
    const fat = {
      ...beat,
      artists: ["madk1d", "villian", "slayr", "pittkiid"],
      tags: ["slayr", "pittkiid", "mayot", "prod.dy", "a very long author tag here"],
    };

    const meta = buildPulseMetadata(fat, "nonProfit");

    /*
     * Автор вписал их руками, их не больше восьми, и хвост списка отрезается
     * лимитом. Раньше они уезжали за кластерами и молча пропадали, а человек
     * видел, что группа «твои теги» исчезла, и не понимал, куда дел то, что
     * сам вписал.
     */
    for (const tag of fat.tags) expect(meta.tags).toContain(tag);
    expect(meta.ownTags).toEqual(fat.tags);
  });

  it("бесплатные теги не появляются у платного бита", () => {
    const paid = buildPulseMetadata(beat, "paid");

    expect(paid.tags).not.toContain("free prod.dy type beat");
    expect(paid.tags).not.toContain("бесплатный prod.dy тайп біт");
  });

  it("лимит YouTube соблюдается и с длинными артистами", () => {
    const many = {
      ...beat,
      artists: ["prod.one", "prod.two", "prod.three", "villian"],
      tags: ["dark", "melodic", "emotional", "chill"],
    };

    const meta = buildPulseMetadata(many, "nonProfit");

    expect(meta.tags.join(",").length).toBeLessThanOrEqual(TAGS_LIMIT);
    // Список не может выродиться в два тега: кластеры должны что-то влезть.
    expect(meta.tags.length).toBeGreaterThan(8);
  });

  it("чипы показывают ровно то, что уйдёт в YouTube", () => {
    const fat = {
      ...beat,
      artists: ["prod.one", "prod.two", "prod.three"],
      tags: ["slayr", "pittkiid", "mayot"],
    };

    const meta = buildPulseMetadata(fat, "nonProfit");

    /*
     * Список рассчитан длиннее лимита, и отброшенные теги не должны выглядеть
     * как опубликованные: человек не может отличить одно от другого в чипах и
     * решит, что бит плохо оптимизирован.
     */
    const shown = [...meta.coreTags, ...meta.ownTags];

    expect(meta.trimmed.tags.length).toBeGreaterThan(0);
    for (const tag of shown) expect(meta.tags).toContain(tag);
    // Обрезанное не показывается, но честно считается.
    expect(new Set(shown).size).toBe(meta.tags.length);
  });

  it("название и описание без пустых строк подряд", () => {
    const meta = buildPulseMetadata({ ...beat, artists: [], genreLabel: null }, "paid");

    expect(meta.description).not.toMatch(/\n{3,}/);
    expect(meta.title).not.toMatch(/\s{2,}/);
  });

  it("пустое название бита не оставляет дыру в заголовке", () => {
    const meta = buildPulseMetadata({ ...beat, title: "  ", artists: [] }, "paid");

    // Название исчезает совсем, а продюсер остаётся один раз: подставить
    // его на место названия дало бы «Gennzy | prod. Gennzy».
    expect(meta.title).toBe("type beat | prod. Gennzy");
    expect(meta.title).not.toMatch(/\s{2,}/);
    expect(meta.named).toBe(false);
  });

  it("совсем пустой заголовок ловится до рендера видео", () => {
    const meta = buildPulseMetadata({ ...beat, title: "", producer: "", artists: [] }, "paid");

    expect(pulseMetadataProblem(meta)).toBeTruthy();
  });

  it("нормальные метаданные проблем не имеют", () => {
    expect(pulseMetadataProblem(buildPulseMetadata(beat, "nonProfit"))).toBeNull();
  });
});