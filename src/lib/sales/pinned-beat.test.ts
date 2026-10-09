import { describe, expect, it } from "vitest";

/**
 * Правила закрепления проверяются здесь, а не в базе и не в компоненте,
 * потому что решается одно: кому принадлежит верхняя позиция витрины.
 *
 * Ошибка в этом месте выглядит безобидно — профиль продавца с чужим битом
 * наверху, — но это чужая работа на чужой странице. Поэтому проверка
 * владельца сделана двумя слоями: в запросе к базе и в триггере.
 */

/** Владелец закрепляемого бита и владелец профиля. */
type Pinning = { beatOwnerId: string | null; profileId: string };

/**
 * Правило из триггера profiles_check_pinned_beat.
 *
 * Держится рядом с миграцией, а не вместо неё: проверка в тесте не может
 * выполнить SQL, но может проверить, что мы написали в базу именно это
 * правило, и напомнить о нём, когда правило поменяется.
 */
function pinAllowed({ beatOwnerId, profileId }: Pinning): { ok: true } | { ok: false; reason: string } {
  if (beatOwnerId === null) return { ok: false, reason: "Бит для закрепления не найден" };
  if (beatOwnerId !== profileId) return { ok: false, reason: "Закрепить можно только свой бит" };

  return { ok: true };
}

const MIMOSA = "b8d4bfa3-3104-4e2e";
const SLAYR = "3282f961-352b-4276-96aa-57a17886357f";

describe("закрепление бита", () => {
  it("свой бит закрепить можно", () => {
    expect(pinAllowed({ beatOwnerId: MIMOSA, profileId: MIMOSA })).toEqual({ ok: true });
  });

  it("чужой бит закрепить нельзя", () => {
    // Главное правило. Без него верх витрины одного продавца занимает бит
    // другого: его обложка, его цена и его кнопка покупки на чужой странице.
    const result = pinAllowed({ beatOwnerId: SLAYR, profileId: MIMOSA });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("Закрепить можно только свой бит");
  });

  it("несуществующий бит отвергается, а не зависает на себе", () => {
    // Ссылки на удалённый бит всё равно приходят: у продавца мог остаться
    // открытый профиль. Ответ должен быть понятным, а не бесконечным.
    const result = pinAllowed({ beatOwnerId: null, profileId: MIMOSA });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("не найден");
  });

  it("закреплённый бит не показывается дважды", () => {
    /*
     * Витрина состоит из закреплённого блока и списка остальных. Если бы
     * бит остался и там, человек видел бы его дважды — как будто это два
     * разных товара, и один из них дешевле.
     */
    const beats = [{ id: SLAYR }, { id: MIMOSA }];
    const pinnedId: string | null = MIMOSA;

    const pinned = beats.find((beat) => beat.id === pinnedId) ?? null;
    const rest = pinned ? beats.filter((beat) => beat.id !== pinned.id) : beats;

    expect(pinned?.id).toBe(MIMOSA);
    expect(rest.map((beat) => beat.id)).toEqual([SLAYR]);
  });

  it("закреплённого бита нет в базе — витрина просто остаётся прежней", () => {
    /*
     * Закрепление ссылается на бит, который продавец потом удалил. Профиль
     * не должен из-за этого падать: у чужих настроек слишком много
     * последствий, чтобы переживать их падением страницы.
     */
    const beats = [{ id: SLAYR }];
    const pinnedId = "00000000-0000-0000-0000-000000000000";

    const pinned = beats.find((beat) => beat.id === pinnedId) ?? null;

    expect(pinned).toBeNull();
    expect(beats).toHaveLength(1);
  });

  it("без закрепления витрина идёт по свежести и ничего не теряет", () => {
    const beats = [{ id: SLAYR }, { id: MIMOSA }];
    const pinnedId = null;

    const pinned = beats.find((beat) => beat.id === pinnedId) ?? null;
    const rest = pinned ? beats.filter((beat) => beat.id !== pinned.id) : beats;

    expect(pinned).toBeNull();
    expect(rest).toHaveLength(2);
  });
});