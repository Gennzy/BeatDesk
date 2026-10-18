import { describe, expect, it } from "vitest";

import { assetsBelongTo } from "./beats";

/**
 * Чужие файлы в бите.
 *
 * Путь в баке — это право на файл: покупателю отдаётся то, что записано в
 * бите. Одно поле в форме с чужим путём отдало бы чужой мастер вместо
 * своего, поэтому проверка обязана быть здесь, а не при выдаче.
 */
describe("файлы мастера принадлежат биту", () => {
  const owner = "user-1";
  const other = "user-2";

  it("свой файл принимается", () => {
    expect(assetsBelongTo(owner, { zip: { path: `${owner}/beat-1/stems.zip` } })).toBe(true);
  });

  it("куски большого файла проверяются все, а не только первый", () => {
    // Архив режется на части, и проверка одного пути оставила бы возможность
    // подсунуть чужой кусок вторым: он скачался бы первым, а ошибки не было бы.
    expect(
      assetsBelongTo(owner, {
        zip: {
          parts: [
            { path: `${owner}/beat-1/stems.part1`, size: 1 },
            { path: `${other}/beat-2/stems.part2`, size: 1 },
          ],
        },
      }),
    ).toBe(false);
  });

  it("чужой путь не принимается", () => {
    expect(assetsBelongTo(owner, { wav: { path: `${other}/beat-2/master.wav` } })).toBe(false);
  });

  it("выход вверх по каталогам не принимается", () => {
    // База приведёт «user-1/../user-2/x» к user-2/x: строка начинается с
    // своего идентификатора, а файл оказывается в чужой папке.
    expect(assetsBelongTo(owner, { wav: { path: `${owner}/../${other}/x.wav` } })).toBe(false);
  });

  it("обратный слеш не принимается", () => {
    expect(assetsBelongTo(owner, { wav: { path: `${owner}\\..\\${other}\\x.wav` } })).toBe(false);
  });

  it("пустой набор проходит", () => {
    expect(assetsBelongTo(owner, {})).toBe(true);
  });
});

import { beatRoles } from "./beats";

const keys = (over: string[] = ["mp3", "wav"]) => over;

describe("что реально лежит в бите", () => {
  it("пустой бит не имеет ни одной роли", () => {
    expect(beatRoles({})).toEqual([]);
  });

  it("превью, мастер и обложка дают три роли", () => {
    expect(beatRoles({ keys: keys(), hasCover: true })).toEqual(["mp3", "wav", "artwork"]);
  });

  it("zip и rar оба называются дорожками", () => {
    // В форме расширения разные, а проверка ждёт одну роль: архив со
    // стемами он и есть, независимо от того, чем его упаковали.
    expect(beatRoles({ keys: keys(["mp3", "wav", "zip"]) })).toContain("stems");
    expect(beatRoles({ keys: keys(["mp3", "wav", "rar"]) })).toContain("stems");
  });

  it("два архива не дают двух дорожек", () => {
    const roles = beatRoles({ keys: keys(["mp3", "wav", "zip", "rar"]) });

    expect(roles.filter((role) => role === "stems")).toHaveLength(1);
  });

  // Регрессия: форма редактирования брала роли только из jsonb files, где
  // нет ни превью, ни обложки, и писала «не загружена» о файлах, которые
  // битмейкер давно загрузил.
  it("превью и обложка считаются, даже если их нет в ключах файлов", () => {
    expect(beatRoles({ keys: ["wav"], hasPreview: true, hasCover: true })).toEqual([
      "mp3",
      "wav",
      "artwork",
    ]);
  });

  it("обложка без файлов всё равно даёт свою роль", () => {
    // Обложка грузится отдельно от аудио, и карточка без неё слепа.
    expect(beatRoles({ hasCover: true })).toEqual(["artwork"]);
  });

  it("роли всегда идут в одном порядке", () => {
    // Порядок не важен логике, но важен тесту и рендеру: иначе список
    // прыгает при каждом добавлении файла.
    const withAll = beatRoles({ keys: keys(["mp3", "wav", "zip"]), hasCover: true });

    expect(withAll).toEqual(["mp3", "wav", "stems", "artwork"]);
  });
});
