import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { GENRE_SLUGS, normalizeGenre } from "./beat-validation";

/**
 * Список жанров живёт в двух местах: в миграции, которая наполняет базу, и
 * в проверке формы, которая отбрасывает чужое значение. Две копии одного
 * списка — это ровно та настройка, которая через полгода работает ни с чем.
 *
 * Тест читает саму миграцию, а не её копию в тесте: иначе он проверял бы
 * себя. Расхождение видно сразу и падает здесь, а не пустой вкладкой
 * фильтра.
 */

const migration = readFileSync(
  fileURLToPath(new URL("../../supabase/migrations/0030_counters_genres.sql", import.meta.url)),
  "utf8",
);

/**
 * Слаги, которые наполняют базу: только значения вставки в genres.
 *
 * По всему файлу искать нельзя: в нём есть другие вставки, и «paid» из
 * таблицы тарифов попадал бы в жанры. Поэтому сначала отрезается блок
 * вставки — и уже в нём ищутся пары ('slug', 'Название').
 */
const genresBlock = migration.slice(migration.indexOf("insert into public.genres"));

const slugsInMigration = [...genresBlock.matchAll(/\(\s*'([a-z-]+)'\s*,\s*'/g)].map((match) => match[1]);

describe("список жанров", () => {
  it("миграция наполняет базу теми же жанрами, что проверяет форма", () => {
    // Если форма и база разойдутся, тест назовёт расходящиеся жанры.
    expect([...slugsInMigration].sort()).toEqual([...GENRE_SLUGS].sort());
  });

  it("в базе нет повторов: один слагу — один жанр", () => {
    // Повтор прошёл бы unnoticed и превратил бы фильтр в две одинаковые
    // вкладки с разными счётчиками.
    expect(new Set(slugsInMigration).size).toBe(slugsInMigration.length);
  });

  it("в обеих локалях есть название каждого жанра", async () => {
    /*
     * Сверяются оба словаря. Типы словаря гарантируют, что у en есть все
     * ключи ru, но не гарантируют, что ключ вообще существует: пропущенный
     * жанр показался бы покупателю как его машинный слаг — «boom-bap»
     * вместо «Бум-бап».
     */
    const { dictionaries } = await import("./i18n/dictionaries");

    for (const slug of GENRE_SLUGS) {
      for (const locale of ["ru", "en"] as const) {
        const label = dictionaries[locale][`genre.${slug}` as "genre.trap"];

        expect(label, `в ${locale} нет перевода для ${slug}`).toBeTruthy();
        expect(label, `в ${locale} перевод для ${slug} совпал со слагом`).not.toBe(slug);
      }
    }
  });
});

describe("normalizeGenre", () => {
  it("принимает жанр из списка", () => {
    expect(normalizeGenre("trap")).toBe("trap");
    expect(normalizeGenre("boom-bap")).toBe("boom-bap");
  });

  it("не чувствителен к регистру и к пробелам", () => {
    // Форма присылает ровно то, что выбрано, но править жанр руками в
    // бите можно: «Трэп» и «TRAP» должны означать одно и то же.
    expect(normalizeGenre("TRAP")).toBe("trap");
    expect(normalizeGenre(" trap ")).toBe("trap");
  });

  it("пустое значение — это «без жанра», а не ошибка", () => {
    // Иначе нельзя было бы снять жанр с бита, который перестал быть
    // жанровым, и он остался бы в старой вкладке навсегда.
    expect(normalizeGenre("")).toBeNull();
    expect(normalizeGenre(null)).toBeNull();
    expect(normalizeGenre(undefined)).toBeNull();
  });

  it("чужое значение не попадает в колонку", () => {
    // Главная причина сверки со списком: без неё в genre оседали бы
    // «Trepp», «hip hop» и прочий мусор, и фильтр по жанру молча
    // разваливался бы на несуществующие категории.
    expect(normalizeGenre("trepp")).toBeNull();
    expect(normalizeGenre("hip hop")).toBeNull();
    expect(normalizeGenre("../../etc")).toBeNull();
    expect(normalizeGenre(42)).toBeNull();
  });
});