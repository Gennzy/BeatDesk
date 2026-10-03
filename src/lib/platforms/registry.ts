export type PlatformId =
  | "telegram"
  | "discord"
  | "vk"
  | "youtube"
  | "soundcloud"
  | "beatchain"
  | "beatstars"
  | "airbit"
  | "bandcamp"
  | "spotify"
  | "yamusic";

/** broadcast — автопост по API, market — маркетплейсы битов, distribution — стриминги */
export type PlatformGroup = "broadcast" | "market" | "distribution";

/** live — работает сразу, token — нужен токен или ссылка, oauth — нужен OAuth-клиент, manual — автозагрузки нет */
export type PlatformLevel = "live" | "token" | "oauth" | "manual";

export type PlatformAuth = "token" | "oauth" | "webhook" | "none";

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
    id: "discord",
    label: "Discord",
    group: "broadcast",
    level: "token",
    kind: "api",
    auth: "webhook",
    sendsFile: false,
    fields: [
      { key: "webhookUrl", label: "Webhook URL", placeholder: "https://discord.com/api/webhooks/…", hint: "Канал → Настройки → Интеграции → Вебхуки → Новый вебхук" },
    ],
    note: "Вебхук работает сразу, без OAuth. Пост приходит карточкой с обложкой, BPM, тональностью и ссылкой на бит.",
    docsUrl: "https://support.discord.com/hc/en-us/articles/228383668",
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
    docsUrl: "https://developers.google.com/youtube/v3/docs/videos/insert",
  },
  {
    id: "soundcloud",
    label: "SoundCloud",
    group: "broadcast",
    level: "oauth",
    kind: "api",
    auth: "oauth",
    sendsFile: true,
    noAutoPublish: true,
    note: "Загрузка треков через API доступна только по белому списку для приложений. Без одобрения — загружай файл вручную, тексты и имена файлов уже готовы.",
    docsUrl: "https://developers.soundcloud.com/docs/guide",
  },
  {
    id: "beatstars",
    label: "BeatStars",
    group: "market",
    level: "manual",
    kind: "manual",
    auth: "none",
    sendsFile: false,
    openUrl: "https://studio.beatstars.com/content/tracks/uploaded",
    note: "Главный маркетплейс битов: там покупают лицензии. Публичного API для загрузки нет — саппорт BeatStars прямо пишет, что не планирует его делать. Поэтому мы собираем всё, что нужно вставить: название, описание, теги, BPM, тональность, цены по лицензиям и имена файлов.",
    docsUrl: "https://help.beatstars.com/hc/en-us/articles/1260802609630-How-Do-I-Upload-Tracks",
  },
  {
    id: "airbit",
    label: "Airbit",
    group: "market",
    level: "manual",
    kind: "manual",
    auth: "none",
    sendsFile: false,
    openUrl: "https://airbit.com/dashboard",
    note: "Маркетплейс битов с лицензиями и контрактами. Загрузка только через Dashboard, открытого API для автозагрузки нет. Поля и имена файлов — в блоке ниже.",
    docsUrl: "https://help.airbit.com/hc/en-us/articles/24166105043865-How-to-Upload-Beats",
  },
  {
    id: "beatchain",
    label: "BeatChain",
    group: "market",
    level: "manual",
    kind: "manual",
    auth: "none",
    sendsFile: false,
    openUrl: "https://beatchain.io/home",
    note: "Маркетплейс битов. Публичного API нет: открываем Studio, текст и имена файлов уже в буфере.",
  },
  {
    id: "bandcamp",
    label: "Bandcamp",
    group: "market",
    level: "manual",
    kind: "manual",
    auth: "none",
    sendsFile: false,
    openUrl: "https://bandcamp.com",
    note: "Продаёт релизы и альбомы, а не биты по лицензиям. Годится как витрина: загрузи трек и дай ссылку в описании бита.",
  },
  {
    id: "spotify",
    label: "Spotify",
    group: "distribution",
    level: "manual",
    kind: "manual",
    auth: "none",
    sendsFile: false,
    openUrl: "https://artists.spotify.com",
    note: "Не площадка для продажи битов. Готовый трек попадает в Spotify только через дистрибьютора — напрямую загрузить файл нельзя. BeatDesk даёт тексты и ссылки, дальше DistroKid, Ditto или ONErpm.",
  },
  {
    id: "yamusic",
    label: "Яндекс Музыка",
    group: "distribution",
    level: "manual",
    kind: "manual",
    auth: "none",
    sendsFile: false,
    openUrl: "https://music.yandex.ru",
    note: "То же самое: самостоятельной загрузки нет, трек заливает дистрибьютор или лейбл. Ссылку на трек потом можно вставить в описание бита.",
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
  broadcast: "Автопост по API",
  market: "Маркетплейсы битов",
  distribution: "Дистрибуция трека на стриминги",
};

export const GROUP_HINTS: Record<PlatformGroup, string> = {
  broadcast: "Эти площадки публикуются прямо отсюда, через их API.",
  market: "Здесь продают биты. Публичного API для загрузки у них нет, поэтому BeatDesk готовит все поля и имена файлов — остаётся вставить.",
  distribution: "Это не продажа битов, а доставка готового трека на стриминги. Работает только через дистрибьютора.",
};

export const LEVEL_LABELS: Record<PlatformLevel, string> = {
  live: "Работает сразу",
  token: "Нужен токен",
  oauth: "Нужна настройка",
  manual: "Только вручную",
};

/** дистрибьюторы, через которые трек попадает на стриминги */
export const DISTRIBUTORS = [
  { label: "DistroKid", url: "https://distrokid.com" },
  { label: "Ditto", url: "https://dittomusic.com" },
  { label: "ONErpm", url: "https://onerpm.com" },
  { label: "Distribution.ru", url: "https://distribution.ru" },
];

export const API_PLATFORMS = PLATFORMS.filter((platform) => platform.kind === "api");
export const MANUAL_PLATFORMS = PLATFORMS.filter((platform) => platform.kind === "manual");

export function platformsByGroup(group: PlatformGroup): Platform[] {
  return PLATFORMS.filter((platform) => platform.group === group);
}