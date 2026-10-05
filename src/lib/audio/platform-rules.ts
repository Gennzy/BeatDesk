/**
 * Требования площадок к биту.
 *
 * Каждое правило помечено статусом доверия, и это не формальность:
 *
 * - `documented` — написано в справке площадки, можно ссылаться;
 * - `observed`  — снято с формы загрузки своими глазами, может измениться;
 * - `unknown`   — неизвестно, и проверка молчит вместо того, чтобы выдумать.
 *
 * Выдуманное правило опаснее отсутствующего: битмейкер поверит чекбоксу и
 * выложит бит, который площадка всё равно не примет.
 */

export type Trust = "documented" | "observed" | "unknown";

export type PlatformId = "beatstars" | "airbit" | "beatchain";

export type Check = {
  /** Что проверяем, по-человечески. */
  label: string;
  /** Поле файла, к которому относится правило. */
  field: "wav" | "mp3" | "stems" | "artwork" | "tags";
  /** Что именно нужно. */
  requirement: string;
  trust: Trust;
  /** Где смотреть: раздел справки. */
  source?: string;
};

export type FieldRule = {
  /** Минимальная разрядность в битах. */
  minBits?: number;
  maxBits?: number;
  /** Частота дискретизации, Гц. */
  minSampleRate?: number;
  maxSampleRate?: number;
  /** Минимум каналов: почти везде нужно строго стерео. */
  minChannels?: number;
  /** Потолок размера файла, байт. */
  maxBytes?: number;
  /** Минимальный битрейт MP3, кбит/с. */
  minKbps?: number;
  /** Потолок длительности, секунд. */
  maxSeconds?: number;
  /** Обложка: квадратная сторона. */
  artworkSide?: number;
  artworkMaxBytes?: number;
  /** Сколько тегов, жанров и настроений читает площадка. */
  tagLimits?: { tags?: number; genres?: number; moods?: number };
  /** Сколько файлов можно загрузить за раз. */
  maxFilesPerUpload?: number;
  trust: Trust;
};

export type PlatformRules = {
  id: PlatformId;
  label: string;
  /** Что делать с MP3, если отдельного тегованного файла нет. */
  mp3: "required" | "derived" | "optional";
  fields: {
    wav?: FieldRule;
    mp3?: FieldRule;
    stems?: FieldRule;
    artwork?: FieldRule;
  };
  /** Лимиты на текстовые поля, если площадка их читает. */
  tagLimits?: { tags?: number; genres?: number; moods?: number };
  /** Сколько файлов площадка принимает за одну загрузку. */
  maxFilesPerUpload?: number;
  checks: Check[];
  /** Наблюдения, которые не выразить числом. */
  notes: string[];
};

const MB = 1024 * 1024;

export const PLATFORMS: PlatformRules[] = [
  {
    id: "beatstars",
    label: "BeatStars",
    // Не выкладываем тегованный превью: BeatStars умеет помечать файл сам,
    // и MP3 генерируется из WAV при загрузке мастера.
    mp3: "derived",
    fields: {
      wav: {
        minBits: 16,
        maxBits: 32,
        minSampleRate: 44100,
        maxSampleRate: 48000,
        minChannels: 2,
        maxBytes: 300 * MB,
        maxSeconds: 600,
        trust: "documented",
      },
      mp3: {
        minBits: 16,
        maxBits: 24,
        minSampleRate: 44100,
        maxSampleRate: 48000,
        minChannels: 2,
        maxBytes: 150 * MB,
        minKbps: 320,
        maxSeconds: 600,
        trust: "documented",
      },
      stems: {
        // Стеймс BeatStars советует грузить в 24 бит и выше: покупателю
        // нужно сводить, и каждый шаг квантования слышен.
        minBits: 24,
        minSampleRate: 44100,
        trust: "documented",
      },
      artwork: {
        artworkSide: 1400,
        trust: "unknown",
      },
    },
    tagLimits: { tags: 3, genres: 3, moods: 5 },
    maxFilesPerUpload: 4,
    checks: [
      {
        label: "Разрядность WAV",
        field: "wav",
        requirement: "от 16 до 32 бит",
        trust: "documented",
        source: "help.beatstars.com — What Type Of Audio Files Can I Upload?",
      },
      {
        label: "Частота дискретизации",
        field: "wav",
        requirement: "44,1–48 кГц",
        trust: "documented",
        source: "help.beatstars.com — What Type Of Audio Files Can I Upload?",
      },
      {
        label: "Каналы",
        field: "wav",
        requirement: "строго два, моно не принимается",
        trust: "documented",
        source: "help.beatstars.com — What Type Of Audio Files Can I Upload?",
      },
      {
        label: "Размер WAV",
        field: "wav",
        requirement: "до 300 МБ",
        trust: "documented",
        source: "help.beatstars.com — What Type Of Audio Files Can I Upload?",
      },
      {
        label: "Битрейт MP3",
        field: "mp3",
        requirement: "не ниже 320 кбит/с",
        trust: "documented",
        source: "help.beatstars.com — What Type Of Audio Files Can I Upload?",
      },
      {
        label: "Длительность",
        field: "wav",
        requirement: "не длиннее 600 секунд",
        trust: "documented",
        source: "help.beatstars.com — What Type Of Audio Files Can I Upload?",
      },
      {
        label: "Теги, жанры и настроения",
        field: "tags",
        requirement: "до 3 тегов, 3 жанров и 5 настроений",
        trust: "documented",
        source: "blog.beatstars.com — How to Upload Tracks in BeatStars Studio",
      },
      {
        label: "Ключ и темп",
        field: "tags",
        requirement:
          "площадка трактует их как фильтры поиска; по ключу в теге неверным возвращают чаще всего",
        trust: "documented",
        source: "justdropthebeat.com — How to upload beats to BeatStars",
      },
      {
        label: "Размер обложки",
        field: "artwork",
        requirement: "источники называют разные значения, поэтому проверка не включена",
        trust: "unknown",
      },
    ],
    notes: [
      "За один раз можно перетащить до четырёх файлов: WAV, MP3, обложку и ZIP со стемами.",
      "Если файлов одного типа два, площадка спрашивает, какой из них мастер без тега.",
      "BeatStars определяет ключ и темп сам, но автору полезно сверить их до выкладки.",
    ],
  },
  {
    id: "airbit",
    label: "Airbit",
    mp3: "derived",
    fields: {
      wav: { trust: "unknown" },
      stems: { trust: "unknown" },
      artwork: { trust: "unknown" },
    },
    checks: [
      {
        label: "Порядок загрузки",
        field: "wav",
        requirement: "WAV первым: MP3 платформа собирает сама",
        trust: "documented",
        source: "help.airbit.com — How to Upload Beats",
      },
      {
        label: "Расхождение WAV и MP3",
        field: "mp3",
        requirement: "если версии разные, сначала MP3, затем WAV через Replace",
        trust: "documented",
        source: "help.airbit.com — How to Upload Beats",
      },
      {
        label: "Теги и настроения",
        field: "tags",
        requirement: "площадка прямо называет полное заполнение тегов условием видимости",
        trust: "documented",
        source: "help.airbit.com — ответ поддержки",
      },
      {
        label: "Аудиоформат",
        field: "wav",
        requirement: "разрядность, частота и размер не опубликованы, проверка не включена",
        trust: "unknown",
      },
    ],
    notes: [
      "Replace, Tagged и Trackout доступны только платящим.",
      "Треки отклоняются по жалобе на Content ID, это известная претензия продавцов.",
      "YouTube Content ID доступен только на платине.",
    ],
  },
  {
    id: "beatchain",
    label: "BeatChain",
    // Не выдумываем: пока мы не видели форму загрузки, нельзя утверждать,
    // что площадка требует отдельный тегованный MP3.
    mp3: "optional",
    fields: {
      wav: { trust: "unknown" },
      mp3: { trust: "unknown" },
      stems: { trust: "unknown" },
      artwork: { trust: "unknown" },
    },
    checks: [
      {
        label: "Аудиоформат",
        field: "wav",
        requirement: "требования не опубликованы, проверка не включена",
        trust: "unknown",
      },
    ],
    notes: [
      "Маркетплейс СНГ: trap, jerk, hoodtrap, pluggnb, rage, phonk. Более 120 тысяч битов.",
      "Оплата СБП или картой, цены в рублях.",
      "Спецификацию снимаем с формы загрузки при первом живом тесте расширения.",
    ],
  },
];

export const platformRules = (id: PlatformId): PlatformRules | undefined =>
  PLATFORMS.find((platform) => platform.id === id);
