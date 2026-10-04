/** Данные бита в том виде, в каком их отдаёт /api/beats/[id]/fill. */
export type BeatFill = {
  id: string;
  title: string;
  owner: string;
  artists: string[];
  bpm: number;
  key: string;
  keyShort: string;
  type: string;
  tags: string[];
  hashtags: string;
  prices: { mp3: number | null; bundle: number | null; exclusive: number | null };
  priceLine: string;
  /** Валюта цен бита: RUB, USD или EUR. */
  currency: string;
  description: string;
  files: { label: string; name: string }[];
};

/** Одно поле формы: как узнать и чем заполнить. */
export type FieldSpec = {
  key: string;
  /** Подпись в отчёте. */
  label: string;
  /** Слова, по которым поле узнаётся. Проверяются по label, name, id, placeholder, aria-label. */
  keywords: string[];
  /** Слова, которые отменяют совпадение: «file name» не должен попасть в «name». */
  exclude?: string[];
  value: (beat: BeatFill) => string;
};

const num = (value: number | null): string => (value === null || value === undefined ? "" : String(value));

export const FIELDS: FieldSpec[] = [
  {
    key: "title",
    label: "Название",
    keywords: ["trackname", "track_name", "track title", "beatname", "beat name", "name", "title", "название", "имя трека", "трек"],
    exclude: ["username", "file name", "filename", "artist name", "имя файла", "название файла", "display", "collaborator", "collab", "username"],
    value: (beat) => beat.title,
  },
  {
    key: "bpm",
    label: "BPM",
    keywords: ["bpm", "tempo", "темпо"],
    value: (beat) => String(beat.bpm),
  },
  {
    key: "key",
    label: "Тональность",
    keywords: ["musicalkey", "musical key", "musickey", "key", "тональность", "тональн"],
    exclude: ["api key", "apikey", "keywords", "secret", "tags"],
    value: (beat) => beat.key,
  },
  {
    key: "tags",
    label: "Теги",
    keywords: ["tags", "keywords", "tag", "теги", "тег", "ключевые слова"],
    exclude: ["hashtag count"],
    value: (beat) => beat.tags.join(", "),
  },
  {
    key: "description",
    label: "Описание",
    keywords: ["description", "notes", "comment", "comments", "about", "описание", "примечание", "комментарий", "об бите", "про трек"],
    exclude: ["collaborator", "collab"],
    value: (beat) => beat.description,
  },
  {
    key: "price_mp3",
    label: "Цена MP3",
    keywords: ["mp3"],
    exclude: ["name", "file", "deliver", "delivery", "track out"],
    value: (beat) => num(beat.prices.mp3),
  },
  {
    key: "price_bundle",
    label: "Цена Track Out / WAV",
    keywords: ["track out", "trackout", "wav", "bundle", "unlimited", "mp3+wav", "mp3 wav"],
    exclude: ["name", "file", "deliver", "delivery", "mp3 lease", "base leasing"],
    value: (beat) => num(beat.prices.bundle),
  },
  {
    key: "price_exclusive",
    label: "Цена Exclusive",
    keywords: ["exclusive", "excl", "эксклюзив"],
    exclude: ["name", "file", "deliver", "delivery"],
    value: (beat) => num(beat.prices.exclusive),
  },
];

/** Поля, где обязательно нужна цифра: если цена не задана, оставляем пусто, а не ноль. */
export const NUMERIC_KEYS = new Set(["bpm", "price_mp3", "price_bundle", "price_exclusive"]);

/** Поля, в которые нельзя писать «0» — это цена, и ноль означает «бесплатно». */
export const SKIP_WHEN_ZERO = new Set(["price_mp3", "price_bundle", "price_exclusive"]);
