import { describe, expect, it } from "vitest";

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
