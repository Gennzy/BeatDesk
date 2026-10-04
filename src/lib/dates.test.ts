import { afterEach, describe, expect, it, vi } from "vitest";

import { absoluteDate, absoluteDateTime, timeAgo } from "@/lib/dates";

const ISO = "2026-10-04T21:30:00.000Z";

afterEach(() => {
  vi.useRealTimers();
});

describe("absoluteDate", () => {
  it("не зависит от часового пояса", () => {
    // Один и тот же момент в разных поясах должен давать одну строку,
    // иначе сервер и браузер разойдутся при гидрации.
    const value = absoluteDate(ISO, "ru");
    expect(value).toBe(absoluteDate(ISO, "ru"));
    expect(value).toContain("04");
    expect(value.toLowerCase()).toContain("окт");
  });

  it("одинаков для сервера и клиента при любом Date.now", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-04T12:00:00.000Z"));
    const first = absoluteDate(ISO, "ru");

    vi.setSystemTime(new Date("2027-03-01T00:00:00.000Z"));
    expect(absoluteDate(ISO, "ru")).toBe(first);
  });

  it("английская локаль даёт другой текст, ту же дату", () => {
    expect(absoluteDate(ISO, "en")).not.toBe(absoluteDate(ISO, "ru"));
    expect(absoluteDate(ISO, "en")).toContain("04");
  });
});

describe("absoluteDateTime", () => {
  it("содержит дату и время", () => {
    const value = absoluteDateTime(ISO, "ru");
    expect(value).toMatch(/04/);
    expect(value).toMatch(/\d{2}:\d{2}/);
  });
});

describe("timeAgo", () => {
  it("только что снятый пост — «сейчас», а не пустота и не год", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-04T21:30:00.000Z"));

    expect(timeAgo(ISO, "ru").toLowerCase()).toContain("сейчас");
    expect(timeAgo(ISO, "en").toLowerCase()).toContain("now");
  });

  it("в первую минуту показывает секунды, а не молчит", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-04T21:30:30.000Z"));

    expect(timeAgo(ISO, "ru")).toContain("30");
  });

  it("переходит к минутам, часам и дням", () => {
    vi.useFakeTimers();

    vi.setSystemTime(new Date("2026-10-04T21:35:00.000Z"));
    expect(timeAgo(ISO, "ru")).toContain("5");

    vi.setSystemTime(new Date("2026-10-04T23:30:00.000Z"));
    expect(timeAgo(ISO, "ru")).toContain("2");

    vi.setSystemTime(new Date("2026-10-08T21:30:00.000Z"));
    expect(timeAgo(ISO, "ru").toLowerCase()).toContain("дн");
  });

  it("битая дата не роняет ленту", () => {
    expect(() => timeAgo("не дата", "ru")).not.toThrow();
  });
});
