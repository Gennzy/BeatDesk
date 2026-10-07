import { describe, expect, it } from "vitest";

import { fileRoles } from "./beats";

const files = (over: Partial<Parameters<typeof fileRoles>[0]> = {}) => ({
  mp3: new File([], "a.mp3"),
  wav: new File([], "a.wav"),
  ...over,
});

describe("роли файлов в бите", () => {
  it("пустой бит не имеет ни одной роли", () => {
    expect(fileRoles({}, false)).toEqual([]);
  });

  it("превью, мастер и обложка дают три роли", () => {
    expect(fileRoles(files(), true)).toEqual(["mp3", "wav", "artwork"]);
  });

  it("zip и rar оба называются дорожками", () => {
    // В форме расширения разные, а проверка ждёт одну роль: архив со
    // стемами он и есть, независимо от того, чем его упаковали.
    expect(fileRoles(files({ zip: new File([], "s.zip") }), false)).toContain("stems");
    expect(fileRoles(files({ rar: new File([], "s.rar") }), false)).toContain("stems");
  });

  it("два архива не дают двух дорожек", () => {
    const roles = fileRoles(files({ zip: new File([], "s.zip"), rar: new File([], "s.rar") }), false);

    expect(roles.filter((role) => role === "stems")).toHaveLength(1);
  });

  it("обложка без файлов всё равно даёт свою роль", () => {
    // Обложка грузится отдельно от аудио, и карточка без неё слепа.
    expect(fileRoles({}, true)).toEqual(["artwork"]);
  });

  it("роли всегда идут в одном порядке", () => {
    // Порядок не важен логике, но важен тесту и рендеру: иначе список
    // прыгает при каждом добавлении файла.
    const withAll = fileRoles(files({ zip: new File([], "s.zip") }), true);

    expect(withAll).toEqual(["mp3", "wav", "stems", "artwork"]);
  });
});
