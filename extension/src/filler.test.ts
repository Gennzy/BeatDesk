// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";

import { fillForm } from "./filler";
import type { BeatFill } from "./fields";
import { siteForBeat, type SiteConfig } from "./sites";

const beat = (over: Partial<BeatFill> = {}): BeatFill => ({
  id: "11111111-1111-1111-1111-111111111111",
  title: "Ночной бит",
  owner: "gennzy",
  artists: ["Slayr"],
  bpm: 130,
  key: "F# minor",
  keyShort: "F#m",
  type: "Type Beat",
  tags: ["dark", "trap"],
  hashtags: "#dark #trap",
  prices: { mp3: 500, bundle: 1500, exclusive: 3500 },
  priceLine: "MP3 500 ₽",
  currency: "RUB",
  description: "Ночной бит в тёмном ключе",
  files: [],
  ...over,
});

/**
 * Конфиг площадки берём из siteForBeat — тем же кодом, что и в расширении.
 * Собирать его руками в тесте опасно: так тест проверял бы несуществующее
 * правило и молча пропустил бы ошибку с валютами.
 */
const beatStarsFor = (currency: string): SiteConfig =>
  siteForBeat("https://studio.beatstars.com/upload", currency) as SiteConfig;
const beatChainFor = (currency: string): SiteConfig =>
  siteForBeat("https://beatchain.io/home", currency) as SiteConfig;

/** Раскладывает HTML и возвращает документ в текущем окне jsdom. */
function page(html: string): Document {
  document.body.innerHTML = html;
  return document;
}

const value = (selector: string) => (document.querySelector(selector) as HTMLInputElement | null)?.value;

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("fillForm: BeatChain", () => {
  it("заполняет поля, найденные по подписям", () => {
    const doc = page(`
      <form>
        <label for="t">Название трека</label><input id="t" />
        <label for="b">BPM</label><input id="b" />
        <label for="d">Описание</label><textarea id="d"></textarea>
        <label for="tg">Теги</label><input id="tg" />
      </form>
    `);

    const report = fillForm(beat(), beatChainFor("RUB"), doc);

    expect(value("#t")).toBe("Ночной бит");
    expect(value("#b")).toBe("130");
    expect(value("#d")).toBe("Ночной бит в тёмном ключе");
    expect(value("#tg")).toBe("dark, trap");
    // Форма из четырёх полей: тональности и цен на ней нет, и это должно
    // быть видно в отчёте, а не молча пройти.
    expect(report.filled.map((item) => item.label).sort()).toEqual(["BPM", "Название", "Описание", "Теги"].sort());
    expect(report.missing.sort()).toEqual(["Тональность", "Цена MP3", "Цена Exclusive", "Цена Track Out / WAV"].sort());
  });

  it("узнаёт поле тональности по списку и ставит полное название", () => {
    const doc = page(`
      <label for="k">Тональность</label>
      <select id="k">
        <option value="">Выберите</option>
        <option value="f_sharp_minor">F# minor</option>
        <option value="c_major">C major</option>
      </select>
    `);

    fillForm(beat(), beatChainFor("RUB"), doc);

    expect(value("#k")).toBe("f_sharp_minor");
  });

  it("обрезает длинное название до лимита площадки", () => {
    const doc = page(`<label for="t">Название</label><input id="t" />`);
    const long = "А".repeat(45);

    fillForm(beat({ title: long }), beatChainFor("RUB"), doc);

    const filled = value("#t") ?? "";
    expect(filled.length).toBeLessThanOrEqual(30);
    expect(filled.endsWith("…")).toBe(true);
  });
});

describe("fillForm: тональность в списке BeatStars", () => {
  it("подставляет сокращённый вариант и узнаёт его по корневой ноте", () => {
    const doc = page(`
      <label for="k">Musical Key</label>
      <select id="k">
        <option value="">Выберите</option>
        <option value="Gm">G#m</option>
        <option value="Cm">Cm</option>
      </select>
    `);

    fillForm(beat({ key: "G# minor", keyShort: "G#m" }), beatStarsFor("USD"), doc);

    expect(value("#k")).toBe("Gm");
  });
});

describe("fillForm: цены", () => {
  it("не ставит цену, если она не задана", () => {
    const doc = page(`<label for="p">Цена MP3</label><input id="p" />`);

    const report = fillForm(beat({ prices: { mp3: null, bundle: null, exclusive: null } }), beatChainFor("RUB"), doc);

    // Ноль в поле цены означал бы «бесплатно» — это хуже, чем пустое поле.
    expect(value("#p")).toBe("");
    expect(report.empty.map((item) => item.label)).toContain("Цена MP3");
  });

  it("пропускает цены, когда валюта бита не совпадает с формой", () => {
    const doc = page(`<label for="p">Цена MP3</label><input id="p" />`);

    // Бит в рублях, форма BeatStars в долларах: цену ставить нельзя.
    const report = fillForm(beat({ currency: "RUB" }), beatStarsFor("RUB"), doc);

    expect(value("#p")).toBe("");
    expect(report.skipped).toHaveLength(3);
    expect(report.skipped[0]?.reason).toContain("RUB");
    expect(report.skipped[0]?.reason).toContain("USD");
  });

  it("в отчёте не осталось старого текста про рубли", () => {
    const doc = page(`<label for="p">Цена MP3</label><input id="p" />`);
    const report = fillForm(beat({ currency: "RUB" }), beatStarsFor("RUB"), doc);

    // Формулировка про «цены в BeatDesk в рублях» устарела: валюта теперь у бита.
    for (const item of report.skipped) expect(item.reason).not.toContain("в BeatDesk в рублях");
  });
});

describe("fillForm: чипы тегов", () => {
  it("вводит теги по одному и жмёт Enter", () => {
    const keys: string[] = [];
    document.addEventListener("keydown", (event) => keys.push((event as KeyboardEvent).key));

    const doc = page(`
      <div>
        <span>Tags</span>
        <div><input id="tag" /><button type="button">×</button></div>
      </div>
    `);

    const report = fillForm(beat({ tags: ["dark", "trap"] }), beatStarsFor("USD"), doc);

    expect(report.filled.map((item) => item.label)).toContain("Теги");
    expect(keys.filter((key) => key === "Enter")).toHaveLength(2);
    expect(keys.join("")).toContain("dark");
  });

  it("не больше трёх тегов: площадки не ждут длинных списков", () => {
    const keys: string[] = [];
    document.addEventListener("keydown", (event) => keys.push((event as KeyboardEvent).key));

    const doc = page(`
      <div>
        <span>Tags</span>
        <div><input id="tag" /><button type="button">×</button></div>
      </div>
    `);

    fillForm(beat({ tags: ["a", "b", "c", "d", "e"] }), beatStarsFor("USD"), doc);

    expect(keys.filter((key) => key === "Enter")).toHaveLength(3);
  });
});

describe("fillForm: защита от чужих полей", () => {
  it("не путает «имя файла» с названием трека", () => {
    const doc = page(`
      <label for="fn">File name</label><input id="fn" />
      <label for="t">Track name</label><input id="t" />
    `);

    fillForm(beat(), beatChainFor("RUB"), doc);

    expect(value("#t")).toBe("Ночной бит");
    expect(value("#fn")).toBe("");
  });

  it("не путает «API key» с тональностью", () => {
    const doc = page(`
      <label for="api">API key</label><input id="api" />
      <label for="k">Musical key</label><input id="k" />
    `);

    fillForm(beat(), beatChainFor("RUB"), doc);

    expect(value("#k")).toBe("F# minor");
    expect(value("#api")).toBe("");
  });

  it("одно поле не заполняется дважды", () => {
    const doc = page(`
      <label for="t">Название</label><input id="t" />
      <label for="t2">Название трека</label><input id="t2" />
    `);

    const report = fillForm(beat(), beatChainFor("RUB"), doc);

    const filledTitles = report.filled.filter((item) => item.label === "Название");
    expect(filledTitles).toHaveLength(1);
  });

  it("пропускает скрытые и служебные поля", () => {
    const doc = page(`
      <label for="h">Название</label><input id="h" type="hidden" />
      <label for="s">Название</label><input id="s" type="submit" />
      <div aria-hidden="true"><label for="a">Название</label><input id="a" /></div>
    `);

    const report = fillForm(beat(), beatChainFor("RUB"), doc);

    expect(report.missing).toContain("Название");
    expect(value("#h")).toBe("");
    expect(value("#a")).toBe("");
  });

  it("пустая форма даёт отчёт, а не исключение", () => {
    const report = fillForm(beat(), beatChainFor("RUB"), page("<form></form>"));

    expect(report.filled).toEqual([]);
    expect(report.missing.length).toBeGreaterThan(0);
  });
});
