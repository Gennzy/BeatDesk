import { describe, expect, it } from "vitest";

import { chatKind, formatIdCard, wantsId } from "./telegram-format";

describe("карточка ID для телеграма", () => {
  it("отдаёт сам номер в моноширинном блоке", () => {
    // Человек копирует это поле в форму, а не переписывает с экрана.
    const card = formatIdCard({ id: -1001234567890, title: "Beat Store", kind: "канал" });

    expect(card).toContain("<code>-1001234567890</code>");
    expect(card).toContain("Beat Store");
  });

  it("в личке не показывает никакого номера", () => {
    // Главная ошибка прежней версии: человек копировал свой ID в «Площадки».
    const card = formatIdCard({ id: 353507128, kind: "личный чат" });

    expect(card).not.toContain("353507128");
    expect(card).toContain("в личке не отдаю");
    expect(card).toContain("Подключить канал");
  });

  it("подпись канала не ломает разметку", () => {
    const card = formatIdCard({ id: 1, title: "A & <b> B", kind: "канал" });

    expect(card).toContain("A &amp; &lt;b&gt; B");
  });

  it("подсказывает, куда вставить", () => {
    expect(formatIdCard({ id: 1, kind: "канал" })).toContain("Площадки");
  });

  it("группа получает номер и объяснение про админа", () => {
    const card = formatIdCard({ id: -100, kind: "группа" });

    expect(card).toContain("<code>-100</code>");
  });

  it("в канале называет это номером канала", () => {
    const card = formatIdCard({ id: -100123, kind: "канал" });

    expect(card).toContain("ID канала");
    expect(card).not.toContain("вставлять нельзя");
  });

  it("вид чата опознаётся по типу", () => {
    expect(chatKind({ type: "channel" })).toBe("канал");
    expect(chatKind({ type: "supergroup" })).toBe("группа");
    expect(chatKind({ type: "private" })).toBe("личный чат");
    expect(chatKind(undefined)).toBe("личный чат");
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
