import { describe, expect, it } from "vitest";

import { detectSite, priceSkipReason, siteForBeat, SITES } from "./sites";

describe("detectSite", () => {
  it("узнаёт BeatStars по обоим адресам", () => {
    expect(detectSite("https://studio.beatstars.com/content/tracks/uploaded")?.id).toBe("beatstars");
    expect(detectSite("https://www.beatstars.com/beat/new")?.id).toBe("beatstars");
  });

  it("узнаёт BeatChain", () => {
    expect(detectSite("https://beatchain.io/home")?.id).toBe("beatchain");
  });

  it("чужие страницы и мусор не проходят", () => {
    for (const url of ["https://beat-desk.vercel.app/", "https://airbit.com/dashboard", "", "не url", "https://evil.beatstars.com.attacker.net/"]) {
      expect(detectSite(url), url).toBeNull();
    }
  });
});

describe("siteForBeat", () => {
  it("цены ставятся, когда валюта бита совпадает с формой", () => {
    expect(siteForBeat("https://studio.beatstars.com/", "USD")?.pricesFillable).toBe(true);
    expect(siteForBeat("https://beatchain.io/home", "RUB")?.pricesFillable).toBe(true);
  });

  it("цены не ставятся, когда валюты разные", () => {
    // Раньше это правило было зашито в конфиг площадки, и бит в долларах
    // на BeatChain остался бы без цены без единого предупреждения.
    expect(siteForBeat("https://beatchain.io/home", "USD")?.pricesFillable).toBe(false);
    expect(siteForBeat("https://studio.beatstars.com/", "RUB")?.pricesFillable).toBe(false);
    expect(siteForBeat("https://studio.beatstars.com/", "EUR")?.pricesFillable).toBe(false);
  });

  it("на чужой странице площадки не возвращает", () => {
    expect(siteForBeat("https://beat-desk.vercel.app/", "USD")).toBeNull();
  });

  it("не меняет исходный конфиг площадки между вызовами", () => {
    siteForBeat("https://studio.beatstars.com/", "USD");
    expect(SITES.find((site) => site.id === "beatstars")?.pricesFillable).toBe(false);
  });
});

describe("priceSkipReason", () => {
  it("объясняет расхождение валют, а не говорит про рубли", () => {
    const site = siteForBeat("https://studio.beatstars.com/", "RUB");
    expect(priceSkipReason("RUB", site!)).toContain("RUB");
    expect(priceSkipReason("RUB", site!)).toContain("USD");
  });
});
