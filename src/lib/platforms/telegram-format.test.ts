import { describe, expect, it } from "vitest";

import { captionForPost, chatKind, formatIdCard, notConnected, planPost, telegramTags, wantsId } from "./telegram-format";

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

describe("пока канал не подключён", () => {
  it("объясняет шаги и не выдаёт никаких номеров", () => {
    const text = notConnected();

    expect(text).toContain("администратора");
    expect(text).toContain("в личку");
    // Никаких цифр с минусом быть не должно.
    expect(text).not.toMatch(/-100\d+/);
  });
});

describe("пост бита одним сообщением", () => {
  it("трек идёт одним постом вместе со своей обложкой", () => {
    // Раньше карточка и файл уходили двумя сообщениями — в канале это два поста.
    expect(planPost({ audioUrl: "https://a/beat.mp3", coverUrl: "https://a/cover.jpg" })).toBe("audio");
  });

  it("приоритет у трека, а не у картинки", () => {
    expect(planPost({ audioUrl: "https://a/beat.mp3" })).toBe("audio");
    expect(planPost({ coverUrl: "https://a/cover.jpg" })).toBe("photo");
    expect(planPost({})).toBe("text");
  });
});

describe("подпись поста", () => {
  it("короткая подпись не трогается", () => {
    expect(captionForPost("short", 1024)).toBe("short");
  });

  it("длинная обрезается по лимиту", () => {
    const cut = captionForPost("a".repeat(2000), 1024);

    expect(cut.length).toBeLessThanOrEqual(1024);
  });

  it("обрезанная разметка остаётся закрытой", () => {
    // Разорванный <b> Telegram отвергает целиком.
    const cut = captionForPost(`<b>${"текст ".repeat(400)}`, 1024);

    expect((cut.match(/<b>/g) ?? []).length).toBe((cut.match(/<\/b>/g) ?? []).length);
  });
});

describe("хештеги для телеграма", () => {
  it("артисты из type beat в теги не попадают", () => {
    // Раньше подпись повторяла артистов ещё раз тегами.
    const line = telegramTags(["polo g", "lil durk", "dark"], ["Polo G", "Lil Durk"]);

    expect(line).toBe("#dark");
  });

  it("лишние символы выкидываются, а не обрезают тег", () => {
    // Телеграм режет тег по первому недопустимому символу: "#tikot.theceo"
    // молча становился "#tikot".
    expect(telegramTags(["tikot.theceo"])).toBe("#tikottheceo");
    // Дефис телеграм в теге не держит и режет по нему: "#boom-bap" в разметке
    // осталось бы "#boom". Поэтому дефис убираем, а не оставляем.
    expect(telegramTags(["boom-bap!"])).toBe("#boombap");
  });

  it("однобуквенные теги не идут", () => {
    expect(telegramTags(["g", "j", "trap"])).toBe("#trap");
  });

  it("повторы в разном регистре схлопываются", () => {
    expect(telegramTags(["Dark", "dark", "DARK"])).toBe("#Dark");
  });

  it("хэши из названия не дублируются", () => {
    expect(telegramTags(["#dark", "dark"])).toBe("#dark");
  });

  it("пусто не значит строка из запятых", () => {
    expect(telegramTags([])).toBeNull();
    expect(telegramTags(["###"])).toBeNull();
  });
});
