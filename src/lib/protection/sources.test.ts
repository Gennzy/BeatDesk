import { describe, expect, it } from "vitest";

import { dedupe, queriesFor, type Candidate } from "./sources";

/**
 * Источники кандидатов.
 *
 * Проверяется, что запросы строятся по-разному (биты называют по-разному)
 * и что один трек не попадает в отчёт трижды.
 */

describe("запросы по биту", () => {
  it("спрашивает и по названию, и по имени типа-бита", () => {
    const queries = queriesFor({ title: "Night Vision", artists: ["madk1d"] });

    expect(queries).toContain("Night Vision");
    expect(queries).toContain("madk1d type beat");
  });

  it("спрашивает и по имени битмейкера", () => {
    const queries = queriesFor({ title: "Night Vision", artists: [], producer: "Gennzy" });

    expect(queries).toContain("Gennzy type beat");
  });

  it("пустое имя не даёт запроса", () => {
    const queries = queriesFor({ title: "  ", artists: ["  "] });

    expect(queries).toEqual([]);
  });

  it("одинаковые запросы не повторяются", () => {
    const queries = queriesFor({ title: "Night Vision", artists: ["madk1d", "madk1d"] });

    expect(new Set(queries).size).toBe(queries.length);
  });
});

describe("один трек — одна находка", () => {
  const candidate = (over: Partial<Candidate> = {}): Candidate => ({
    platform: "spotify",
    externalId: "track-1",
    title: "Трек",
    artist: "Артист",
    previewUrl: null,
    url: "https://open.spotify.com/track/track-1",
    ...over,
  });

  it("треп, найденный тремя запросами, попадает в отчёт один раз", () => {
    // Без этого человек увидел бы «три использования» там, где трек один, и
    // решил бы, что его использовали трижды.
    const list = dedupe([candidate(), candidate(), candidate({ title: "Другое название" })]);

    expect(list).toHaveLength(1);
  });

  it("разные площадки не схлопываются", () => {
    const list = dedupe([candidate(), candidate({ platform: "youtube" })]);

    expect(list).toHaveLength(2);
  });
});
