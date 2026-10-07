/*
 * Площадки, куда BeatDesk сам кладёт биты.
 *
 * Их ровно три: Telegram, ВКонтакте и YouTube. Всё остальное — сторонние
 * маркетплейсы — убрано вместе с расширением и блоком заполнения форм:
 * продажа теперь идёт здесь, и публиковать биты в чужие витрины больше не
 * зачем.
 */
export type PlatformId = "telegram" | "vk" | "youtube";

/**
 * Группа площадок.
 *
 * Раньше групп было три — автопост, маркетплейсы битов и доставка на
 * стриминги. Осталась одна: все три площадки работают автопостом.
 */
export type PlatformGroup = "broadcast";

/** live — работает сразу, token — нужен токен или ссылка, oauth — нужен OAuth-клиент */
export type PlatformLevel = "live" | "token" | "oauth";

export type PlatformAuth = "token" | "oauth" | "none";

export type Platform = {
  id: PlatformId;
  label: string;
  group: PlatformGroup;
  level: PlatformLevel;
  kind: "api" | "manual";
  auth: PlatformAuth;
  sendsFile: boolean;
  /** поля, которые пользователь вводит при подключении */
  fields?: { key: string; label: string; placeholder?: string; hint?: string }[];
  /** куда открываться в ручном режиме */
  openUrl?: string;
  docsUrl?: string;
  /**
   * Адрес входа для площадок с OAuth.
   *
   * Отдельное поле, а не переиспользование openUrl: openUrl — это куда
   * человек идёт менять настройки руками, а здесь мы отправляем его
   * согласовывать доступ.
   */
  oauthPath?: string;
  /** что именно делаем с площадкой */
  note: string;
  /** автопост в этот канал не включаем */
  noAutoPublish?: boolean;
};

export const PLATFORMS: Platform[] = [
  {
    id: "telegram",
    label: "Telegram",
    group: "broadcast",
    level: "live",
    kind: "api",
    auth: "token",
    sendsFile: true,
    fields: [
      { key: "chatId", label: "ID канала или чата", placeholder: "-1001234567890", hint: "Напиши боту @beatdesk_bot — он подскажет ID" },
    ],
    note: "Бот уже настроен. Пост уходит с обложкой, кнопкой «Слушать» и ссылкой на профиль.",
    docsUrl: "https://core.telegram.org/bots/api#sendphoto",
  },
  {
    id: "vk",
    label: "ВКонтакте",
    group: "broadcast",
    level: "token",
    kind: "api",
    auth: "token",
    sendsFile: true,
    fields: [
      { key: "groupId", label: "ID сообщества", placeholder: "123456789", hint: "Короткий адрес из раздела «Сообщество»" },
      { key: "accessToken", label: "Токен сообщества", placeholder: "vk1.a.…", hint: "Управление сообществом → API-ключи → Токен сообщества" },
    ],
    note: "Пост на стену сообщества: текст, обложка и прикреплённая ссылка на бит.",
    docsUrl: "https://dev.vk.com/ru/method/wall.post",
  },
  {
    id: "youtube",
    label: "YouTube",
    group: "broadcast",
    level: "oauth",
    kind: "api",
    auth: "oauth",
    sendsFile: false,
    noAutoPublish: true,
    note: "Нужен свой Google OAuth-клиент: в .env добавляешь YOUTUBE_CLIENT_ID и YOUTUBE_CLIENT_SECRET. Плюс видеофайл — тип-биты выкладывают видео. Пока копируй заголовок, описание и теги из блока на странице бита.",
    // Кнопка «Подключить» ведёт в Google, а не открывает форму с полями:
    // у OAuth-площадок поля вообще не заполняются руками.
    oauthPath: "/api/platforms/youtube/authorize",
    docsUrl: "https://developers.google.com/youtube/v3/docs/videos/insert",
  },

];

export const PLATFORM_MAP = Object.fromEntries(PLATFORMS.map((platform) => [platform.id, platform])) as Record<
  PlatformId,
  Platform
>;

export function isPlatformId(value: string): value is PlatformId {
  return value in PLATFORM_MAP;
}

export const GROUP_LABELS: Record<PlatformGroup, string> = {
  broadcast: "Каналы",
};

export const GROUP_HINTS: Record<PlatformGroup, string> = {
  broadcast: "Эти площадки BeatDesk публикует сам, через их API.",
};

export const LEVEL_LABELS: Record<PlatformLevel, string> = {
  live: "Работает сразу",
  token: "Нужен токен",
  oauth: "Нужна настройка",
};

export const API_PLATFORMS = PLATFORMS.filter((platform) => platform.kind === "api");

export function platformsByGroup(group: PlatformGroup): Platform[] {
  return PLATFORMS.filter((platform) => platform.group === group);
}
