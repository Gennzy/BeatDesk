import { describe, expect, it } from "vitest";

import { formatIdCard, wantsId } from "./telegram-format";

describe("карточка ID для телеграма", () => {
  it("отдаёт сам номер в моноширинном блоке", () => {
    // Человек копирует это поле в форму, а не переписывает с экрана.
    const card = formatIdCard({ id: -1001234567890, title: "Beat Store" });

    expect(card).toContain("<code>-1001234567890</code>");
    expect(card).toContain("Beat Store");
  });

  it("личному чату объясняет, что это не канал", () => {
    expect(formatIdCard({ id: 42 })).toContain("личный чат");
  });

  it("подпись канала не ломает разметку", () => {
    const card = formatIdCard({ id: 1, title: "A & <b> B" });

    expect(card).toContain("A &amp; &lt;b&gt; B");
  });

  it("подсказывает, куда вставить", () => {
    expect(formatIdCard({ id: 1 })).toContain("Площадки");
  });
});

describe("понимание просьбы дать ID", () => {
  it("ловит команду и обычный слово", () => {
    expect(wantsId("/id")).toBe(true);
    expect(wantsId("айди")).toBe(true);
    expect(wantsId("ID")).toBe(true);
    expect(wantsId("айди?")).toBe(true);
    expect(wantsId("айдишник")).toBe(true);
  });

  it("ловит хвост с названием бота, который добавляет телеграм в группе", () => {
    expect(wantsId("/id@beatdesk_bot")).toBe(true);
  });

  it("не ловит обычный разговор", () => {
    // Иначе бот начнёт вставлять ID на каждое сообщение в канале.
    expect(wantsId("привет")).toBe(false);
    expect(wantsId("сделай бит")).toBe(false);
    expect(wantsId("idbeats")).toBe(false);
    expect(wantsId("")).toBe(false);
    expect(wantsId(undefined)).toBe(false);
  });
});
