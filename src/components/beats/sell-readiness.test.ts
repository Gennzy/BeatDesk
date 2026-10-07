import { describe, expect, it } from "vitest";

import { TIERS, type TierId } from "@/lib/audio/delivery-rules";

/**
 * Повторяет решение, которое принимает форма редактирования, и сверяет его с
 * правилами уровней. Если эти две стороны разойдутся, человек увидит в форме
 * одно, а отчёт скажет другое.
 */
function lacking(tierId: TierId, roles: string[]): string[] {
  const tier = TIERS.find((item) => item.id === tierId)!;

  return (Object.keys(tier.requires) as string[]).filter(
    (role) => tier.requires[role as keyof typeof tier.requires] && !roles.includes(role),
  );
}

describe("готовность уровня к продаже", () => {
  it("MP3 считается готовым, когда есть превью", () => {
    expect(lacking("mp3", ["mp3"])).toEqual([]);
  });

  it("MP3 без превью не готов", () => {
    expect(lacking("mp3", ["wav"])).toEqual(["mp3"]);
  });

  it("Track Out без дорожек не готов", () => {
    // Самая частая ошибка: мастер загрузили, цену на дорожки поставили.
    expect(lacking("trackout", ["mp3", "wav"])).toEqual(["stems"]);
  });

  it("эксклюзив требует всего сразу", () => {
    expect(lacking("exclusive", ["mp3", "wav"])).toEqual(["stems"]);
    expect(lacking("exclusive", ["mp3", "wav", "stems"])).toEqual([]);
  });

  it("обложка не входит в условия готовности уровня", () => {
    // Без обложки карточка некрасивая, но заказ выполним.
    expect(lacking("bundle", ["mp3", "wav"])).toEqual([]);
  });

  it("каждый уровень обещает хотя бы один файл", () => {
    for (const tier of TIERS) {
      expect(lacking(tier.id, []).length, tier.id).toBeGreaterThan(0);
    }
  });

  it("бит, обеспеченный под всё, готов под всё", () => {
    const roles = ["mp3", "wav", "stems"];

    for (const tier of TIERS) {
      expect(lacking(tier.id, roles), tier.id).toEqual([]);
    }
  });
});
