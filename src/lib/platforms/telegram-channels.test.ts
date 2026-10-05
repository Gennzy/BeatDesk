import { describe, expect, it } from "vitest";

import { channelToRemember } from "./telegram-channels";

/** Так выглядит реальный апдейт, когда человека пускают бота в канал. */
const addedToChannel = {
  update_id: 1,
  my_chat_member: {
    chat: { id: -1001234567890, type: "channel", title: "Gennzy | Beat Store" },
    from: { id: 353507128, is_bot: false },
    new_chat_member: { status: "administrator", user: { is_bot: true } },
  },
};

describe("что запомнить из апдейта", () => {
  it("берёт автора из самого события, а не из message", () => {
    // Регрессия: у my_chat_member нет поля message, и автор брался оттуда.
    // Из-за этого канал не записывался никогда.
    expect(channelToRemember(addedToChannel)).toEqual({
      ownerId: 353507128,
      chatId: -1001234567890,
      title: "Gennzy | Beat Store",
    });
  });

  it("не путает канал с группой и личкой", () => {
    for (const type of ["group", "supergroup", "private"]) {
      expect(channelToRemember({ my_chat_member: { ...addedToChannel.my_chat_member, chat: { id: 1, type } } }), type).toBeNull();
    }
  });

  it("реагирует только на добавление бота", () => {
    expect(channelToRemember({ my_chat_member: { ...addedToChannel.my_chat_member, new_chat_member: { status: "member", user: { is_bot: false } } } })).toBeNull();
  });

  it("бота в личный чат каналом не считает", () => {
    expect(channelToRemember({ my_chat_member: { chat: { id: 353507128, type: "private" }, from: { id: 353507128 }, new_chat_member: { status: "member", user: { is_bot: true } } } })).toBeNull();
  });

  it("событие от самого бота игнорирует", () => {
    expect(channelToRemember({ my_chat_member: { ...addedToChannel.my_chat_member, from: { id: 777, is_bot: true } } })).toBeNull();
  });

  it("обычные сообщения не дают ничего запоминать", () => {
    expect(channelToRemember({ message: { from: { id: 1 } } })).toBeNull();
    expect(channelToRemember({})).toBeNull();
  });

  it("без автора событие пропускает", () => {
    expect(channelToRemember({ my_chat_member: { chat: { id: -100, type: "channel" }, new_chat_member: { user: { is_bot: true } } } })).toBeNull();
  });
});
