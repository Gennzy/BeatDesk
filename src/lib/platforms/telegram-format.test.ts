import { describe, expect, it } from "vitest";

import { formatIdCard } from "./telegram-format";

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
