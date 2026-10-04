/** Общая часть бита, нужная генератору текстов и публикаций. */
export type BeatMeta = {
  artists: string[];
  bpm: number;
  musicalKey: string;
  tags: string[];
  prices: { mp3: number | null; bundle: number | null; exclusive: number | null };
};

export type DistributionBeat = BeatMeta & {
  id: string;
  title: string;
  audioUrl: string | null;
  ownerUsername: string;
};

const TRANSLIT: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "y",
  к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f",
  х: "h", ц: "ts", ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
};

/** Кириллица в именах файлов ломает часть площадок, поэтому приводим к латинице. */
export function translit(input: string): string {
  return input
    .toLowerCase()
    .split("")
    .map((char) => TRANSLIT[char] ?? char)
    .join("")
    .replace(/[^a-z0-9#]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/** F# minor → F#m, C major → C */
export function keyShort(key: string): string {
  const [note, mode] = key.split(" ");
  return mode === "minor" ? `${note}m` : note;
}

/**
 * Тональность для имени файла. Решётку писать нельзя: в URL это якорь,
 * а маленькая b читается как «бемоль». Поэтому знаки пишем словом.
 */
export function keyForFile(key: string): string {
  const [note, mode] = key.split(" ");
  const safeNote = note.replace(/#/g, "sharp").replace(/b/g, "flat");
  return mode === "minor" ? `${safeNote}m` : safeNote;
}

export function fileBase(beat: DistributionBeat): string {
  return [translit(beat.title), beat.bpm, keyForFile(beat.musicalKey)].filter(Boolean).join("_");
}

export type FileName = { label: string; name: string };

export function fileNames(beat: DistributionBeat, has: { wav?: boolean; zip?: boolean; rar?: boolean }): FileName[] {
  const base = fileBase(beat);
  const names: FileName[] = [
    { label: "tagged", name: `${base}_tagged.mp3` },
    { label: "untagged", name: `${base}_untagged.mp3` },
  ];

  if (has.wav) names.push({ label: "wav", name: `${base}_tagged.wav` });
  if (has.zip) names.push({ label: "stems", name: `${base}_stems.zip` });
  if (has.rar) names.push({ label: "stems", name: `${base}_stems.rar` });

  return names;
}

function formatPrice(value: number | null): string | null {
  if (value === null || Number.isNaN(value)) return null;
  return `${new Intl.NumberFormat("ru-RU").format(value)} ₽`;
}

export function priceLine(beat: BeatMeta): string {
  const parts = [
    formatPrice(beat.prices.mp3) ? `MP3 ${formatPrice(beat.prices.mp3)}` : null,
    formatPrice(beat.prices.bundle) ? `MP3+WAV ${formatPrice(beat.prices.bundle)}` : null,
    formatPrice(beat.prices.exclusive) ? `Эксклюзив ${formatPrice(beat.prices.exclusive)}` : null,
  ].filter(Boolean) as string[];

  return parts.join(" · ");
}

export function typeBeatLine(beat: BeatMeta): string {
  return beat.artists.length > 0 ? `Type Beat ${beat.artists.join(", ")}` : "Type Beat";
}

export function hashtagList(beat: BeatMeta): string {
  return beat.tags.map((tag) => `#${tag}`).join(" ");
}

export type PlatformBlock = { title: string; text: string };

export function beatchainBlock(beat: DistributionBeat): PlatformBlock {
  const lines = [
    `Название: ${beat.title}`,
    "Тип: Type Beat",
    beat.artists.length > 0 ? `Артисты: ${beat.artists.join(", ")}` : null,
    `BPM: ${beat.bpm}`,
    `Тональность: ${beat.musicalKey}`,
    beat.tags.length > 0 ? `Теги: ${beat.tags.join(", ")}` : null,
    priceLine(beat) ? `Лицензии: ${priceLine(beat)}` : null,
  ].filter(Boolean) as string[];

  return { title: "BeatChain", text: lines.join("\n") };
}

export function youtubeBlocks(beat: DistributionBeat): PlatformBlock[] {
  const name = [beat.title, typeBeatLine(beat), `${beat.bpm} BPM`, beat.musicalKey]
    .filter(Boolean)
    .join(" | ");

  const description = [
    `${beat.title} — ${typeBeatLine(beat).toLowerCase()}`,
    `Темп: ${beat.bpm} BPM · Тональность: ${beat.musicalKey}`,
    beat.tags.length > 0 ? `Теги: ${beat.tags.join(", ")}` : null,
    priceLine(beat) ? `Продажа: ${priceLine(beat)}` : null,
    beat.audioUrl ? `Ссылка: ${beat.audioUrl}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const extraTags = [
    ...beat.tags,
    "type beat",
    ...beat.artists.map((artist) => artist.toLowerCase()),
    "beat",
    `${beat.bpm}bpm`,
    keyShort(beat.musicalKey),
    "битмейкер",
    "бит",
  ];

  return [
    { title: "YouTube · название", text: name },
    { title: "YouTube · описание", text: description },
    { title: "YouTube · теги", text: extraTags.join(", ") },
  ];
}

export function vkBlock(beat: DistributionBeat): PlatformBlock {
  const lines = [
    `${beat.title} — ${typeBeatLine(beat).toLowerCase()}`,
    `${beat.bpm} BPM · ${beat.musicalKey}`,
    beat.tags.length > 0 ? hashtagList(beat) : null,
    priceLine(beat) ? `Продажа: ${priceLine(beat)}` : null,
    beat.audioUrl ? beat.audioUrl : null,
  ].filter(Boolean) as string[];

  return { title: "ВК", text: lines.join("\n") };
}

export function telegramBlock(beat: DistributionBeat): PlatformBlock {
  const lines = [
    `${beat.title} — ${typeBeatLine(beat).toLowerCase()}`,
    `${beat.bpm} BPM · ${beat.musicalKey}`,
    priceLine(beat) ? `Продажа: ${priceLine(beat)}` : null,
    beat.tags.length > 0 ? hashtagList(beat) : null,
    beat.audioUrl ? beat.audioUrl : null,
  ].filter(Boolean) as string[];

  return { title: "Telegram", text: lines.join("\n") };
}

export function allBlocks(beat: DistributionBeat): PlatformBlock[] {
  return [beatchainBlock(beat), ...youtubeBlocks(beat), vkBlock(beat), telegramBlock(beat)];
}