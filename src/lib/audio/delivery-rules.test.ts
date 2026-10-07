import { describe, expect, it } from "vitest";

import { CHUNK_BYTES, MAX_ASSET_BYTES } from "@/lib/beats";

import { DELIVERY_FIELDS, TAG_LIMITS, TIERS, tierRules } from "./delivery-rules";

describe("конфиг требований к выдаче", () => {
  it("у каждого уровня заполнены id, подпись и обещание покупателю", () => {
    for (const tier of TIERS) {
      expect(tier.label.length, tier.id).toBeGreaterThan(0);
      expect(tier.delivers.length, `${tier.id}: пустое обещание`).toBeGreaterThan(10);
    }
  });

  it("идентификаторы совпадают с ключами цен", () => {
    // Иначе soldTiers() достанет не тот уровень, и проверка будет врать
    // про то, что можно продать.
    expect(TIERS.map((tier) => tier.id)).toEqual(["mp3", "bundle", "trackout", "exclusive"]);
  });

  it("у каждой проверки указан статус доверия", () => {
    for (const tier of TIERS) {
      for (const check of tier.checks) {
        expect(["documented", "observed", "unknown"], `${tier.id}: ${check.label}`).toContain(check.trust);
      }
    }
  });

  it("неизвестное правило не выдаётся за наше требование", () => {
    // Неизвестное должно читаться как «не задано», иначе битмейкер поверит
    // и выставит уровень, который мы не сможем отдать.
    for (const tier of TIERS) {
      for (const check of tier.checks.filter((item) => item.trust === "unknown")) {
        expect(check.requirement, `${tier.id}: ${check.label}`).toMatch(/не (задано|определ|решено|известн)/i);
      }
    }
  });

  it("документированные правила ссылаются на справку", () => {
    for (const tier of TIERS) {
      for (const check of tier.checks.filter((item) => item.trust === "documented")) {
        expect(check.source, `${tier.id}: ${check.label} без ссылки`).toBeTruthy();
      }
    }
  });

  it("у каждого уровня заполнен хотя бы один обязательный файл", () => {
    // Уровень, которому нечего отдавать, — это уровень на минус.
    for (const tier of TIERS) {
      expect(Object.values(tier.requires).some(Boolean), tier.id).toBe(true);
    }
  });

  it("MP3 обходится без мастера, а остальные уровни требуют его", () => {
    expect(tierRules("mp3")?.requires.wav).toBeUndefined();
    expect(tierRules("mp3")?.master).toBe(false);

    for (const id of ["bundle", "trackout", "exclusive"] as const) {
      expect(tierRules(id)?.requires.wav, id).toBe(true);
      expect(tierRules(id)?.master, id).toBe(true);
    }
  });

  it("дорожки обязательны ровно там, где обещают их отдать", () => {
    // Самая дорогая ошибка этого модуля: продать дорожки, которых нет.
    expect(tierRules("mp3")?.requires.stems).toBeUndefined();
    expect(tierRules("bundle")?.requires.stems).toBeUndefined();
    expect(tierRules("trackout")?.requires.stems).toBe(true);
    expect(tierRules("exclusive")?.requires.stems).toBe(true);
  });

  it("превью нужно каждому уровню: покупатель выбирает по нему", () => {
    for (const tier of TIERS) {
      expect(tier.requires.mp3, tier.id).toBe(true);
    }
  });

  it("формат мастера задан, и он наш собственный", () => {
    const wav = DELIVERY_FIELDS.wav;

    expect(wav.trust).toBe("documented");
    expect(wav.minBits).toBe(16);
    expect(wav.maxBits).toBe(32);
    expect(wav.minSampleRate).toBe(44100);
    expect(wav.maxSampleRate).toBe(48000);
    expect(wav.minChannels).toBe(2);
  });

  it("потолок мастера совпадает с потолком загрузчика", () => {
    // Правила строже загрузчика — значит файл пройдёт проверку и упадёт при
    // отправке. Правила мягче загрузчика — значит человек зря потратит
    // время на файл, который всё равно не примут. Потолок должен быть один.
    expect(DELIVERY_FIELDS.wav.maxBytes).toBe(MAX_ASSET_BYTES);
  });

  it("потолок мастера помещается в куски по 20 МБ", () => {
    // Мастер режется на куски, и ограничение Supabase в 50 МБ на объект до
    // кусков не относится. Если размер куска доползёт до потолка, на
    // бесплатном тарифе загрузка перестанет работать.
    expect(CHUNK_BYTES).toBeLessThan(50 * 1024 * 1024);
    expect(MAX_ASSET_BYTES % CHUNK_BYTES).toBe(0);
  });

  it("дорожки требуем в 24 бит: покупатель их сводит и слышит квантование", () => {
    expect(DELIVERY_FIELDS.stems.minBits).toBe(24);
  });

  it("требование к обложке честно не задано", () => {
    // Нижнюю границу мы не назвали — значит и проверять нечего. Выдуманное
    // число здесь отвергло бы нормальные обложки.
    expect(DELIVERY_FIELDS.artwork.trust).toBe("unknown");
    expect(DELIVERY_FIELDS.artwork.artworkMinSide).toBeUndefined();
  });

  it("лимит тегов объявлен целиком", () => {
    expect(TAG_LIMITS.tags).toBeGreaterThan(0);
    expect(TAG_LIMITS.genres).toBeGreaterThan(0);
    expect(TAG_LIMITS.moods).toBeGreaterThan(0);
  });

  it("неизвестный уровень не вызывает исключение, а возвращает пусто", () => {
    expect(tierRules("unknown" as never)).toBeUndefined();
  });

  it("в правилах уровней не осталось чужих площадок", () => {
    const text = JSON.stringify(TIERS);

    expect(text).not.toMatch(/beatstars|airbit|beatchain|beatmakertv/i);
  });
});
