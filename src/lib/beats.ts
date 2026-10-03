import type { SupabaseBrowserClient } from "@/lib/supabase/client";

export type BeatFileKind = "mp3" | "wav" | "zip" | "rar";
export type BeatFiles = Partial<Record<BeatFileKind, File>>;
export type AssetKind = Exclude<BeatFileKind, "mp3">;

export const BEAT_FILE_KINDS = ["mp3", "wav", "zip", "rar"] as const;
export const ASSET_KINDS = ["wav", "zip", "rar"] as const;

const MB = 1024 * 1024;

/** Supabase Storage: один объект максимум 50 МБ. Режем с запасом. */
export const CHUNK_BYTES = 20 * MB;

/** Суммарно в бакете 1 ГБ на бесплатном тарифе, поэтому один файл держим в 500 МБ. */
export const MAX_ASSET_BYTES = 500 * MB;
export const MAX_MP3_BYTES = 15 * MB;
export const MAX_COVER_BYTES = 5 * MB;

type FileRule = {
  accept: string;
  extensions: string[];
  maxBytes: number;
};

export const BEAT_FILE_RULES: Record<BeatFileKind, FileRule> = {
  mp3: { accept: "audio/mpeg,audio/mp3", extensions: ["mp3"], maxBytes: MAX_MP3_BYTES },
  wav: { accept: "audio/wav,audio/x-wav,audio/wave", extensions: ["wav"], maxBytes: MAX_ASSET_BYTES },
  zip: { accept: "application/zip,application/x-zip-compressed", extensions: ["zip"], maxBytes: MAX_ASSET_BYTES },
  rar: { accept: "application/vnd.rar,application/x-rar-compressed", extensions: ["rar"], maxBytes: MAX_ASSET_BYTES },
};

export const ASSET_MIME: Record<AssetKind, string> = {
  wav: "audio/wav",
  zip: "application/zip",
  rar: "application/vnd.rar",
};

export type AssetPart = { url: string; size: number };

/** Файл целиком (url) либо нарезанный на чанки (parts). */
export type BeatAsset = {
  name: string;
  size: number;
  mime: string;
  url?: string;
  parts?: AssetPart[];
};

export type BeatFilesColumn = Partial<Record<AssetKind, BeatAsset>>;

export function extensionOf(name: string): string {
  return name.split(".").pop()?.toLowerCase() ?? "";
}

export function validateBeatFile(kind: BeatFileKind, file: File): "upload.errorFileType" | "upload.errorFileSize" | null {
  const rule = BEAT_FILE_RULES[kind];
  if (!rule.extensions.includes(extensionOf(file.name))) return "upload.errorFileType";
  if (file.size > rule.maxBytes) return "upload.errorFileSize";
  return null;
}

export function validateCoverFile(file: File): "upload.errorFileType" | "upload.errorFileSize" | null {
  if (!["jpg", "jpeg", "png", "webp"].includes(extensionOf(file.name))) return "upload.errorFileType";
  if (file.size > MAX_COVER_BYTES) return "upload.errorFileSize";
  return null;
}

export function countParts(size: number): number {
  return Math.max(1, Math.ceil(size / CHUNK_BYTES));
}

export function formatBytes(bytes: number): string {
  if (bytes <= 0) return "—";
  if (bytes < MB) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  if (bytes < 1024 * MB) return `${(bytes / MB).toFixed(1)} MB`;
  return `${(bytes / (1024 * MB)).toFixed(2)} GB`;
}

/** Безопасное имя файла в storage: латиница, цифры, точка и дефис. */
export function safeFileName(name: string): string {
  const base = name
    .normalize("NFKD")
    .replace(/[^\w.\-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");

  return (base || "file").slice(-60);
}

function partName(kind: BeatFileKind, fileName: string, index: number, total: number): string {
  const stamp = total > 1 ? `.part${String(index + 1).padStart(3, "0")}-of-${String(total).padStart(3, "0")}` : "";
  return `${kind}-${safeFileName(fileName)}${stamp}`;
}

async function uploadToBucket(
  supabase: SupabaseBrowserClient,
  bucket: "beats" | "covers",
  path: string,
  body: Blob,
): Promise<string> {
  const { error } = await supabase.storage.from(bucket).upload(path, body, { cacheControl: "3600", upsert: true });

  if (error) throw error;

  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

/**
 * Кладёт файл в бакет, при необходимости нарезав его на чанки по 20 МБ.
 * Ограничение Supabase в 50 МБ на объект обходится так.
 */
export async function uploadAsset(
  supabase: SupabaseBrowserClient,
  {
    userId,
    beatId,
    kind,
    file,
    onStep,
  }: {
    userId: string;
    beatId: string;
    kind: AssetKind;
    file: File;
    onStep?: (label: string) => void;
  },
): Promise<BeatAsset> {
  const total = countParts(file.size);
  const parts: AssetPart[] = [];

  for (let index = 0; index < total; index += 1) {
    const start = index * CHUNK_BYTES;
    const blob = file.slice(start, Math.min(start + CHUNK_BYTES, file.size));

    onStep?.(total > 1 ? `${file.name} · ${index + 1}/${total}` : file.name);

    const url = await uploadToBucket(supabase, "beats", `${userId}/${beatId}/${partName(kind, file.name, index, total)}`, blob);
    parts.push({ url, size: blob.size });
  }

  const asset: BeatAsset = { name: file.name, size: file.size, mime: ASSET_MIME[kind] };

  if (total === 1) {
    asset.url = parts[0].url;
  } else {
    asset.parts = parts;
  }

  return asset;
}

export type UploadedBeat = {
  audioUrl: string | null;
  coverUrl: string | null;
  files: BeatFilesColumn;
};

/** Порядок важен: сначала аудио, потом крупные файлы, в конце обложка. */
export async function uploadBeat(
  supabase: SupabaseBrowserClient,
  {
    userId,
    beatId,
    files,
    cover,
    onStep,
  }: {
    userId: string;
    beatId: string;
    files: BeatFiles;
    cover: File | null;
    onStep?: (label: string) => void;
  },
): Promise<UploadedBeat> {
  const assets: BeatFilesColumn = {};
  let audioUrl: string | null = null;

  for (const kind of BEAT_FILE_KINDS) {
    const file = files[kind];
    if (!file) continue;

    if (kind === "mp3") {
      onStep?.(file.name);
      audioUrl = await uploadToBucket(supabase, "beats", `${userId}/${beatId}/${partName("mp3", file.name, 0, 1)}`, file);
      continue;
    }

    const asset = await uploadAsset(supabase, { userId, beatId, kind, file, onStep });
    assets[kind] = asset;
    if (!audioUrl) audioUrl = asset.url ?? asset.parts?.[0].url ?? null;
  }

  let coverUrl: string | null = null;

  if (cover) {
    onStep?.(cover.name);
    coverUrl = await uploadToBucket(
      supabase,
      "covers",
      `${userId}/${beatId}/cover-${Date.now()}.${extensionOf(cover.name)}`,
      cover,
    );
  }

  return { audioUrl, coverUrl, files: assets };
}

/** Собирает файл из частей прямо в браузере и отдаёт на скачивание. */
export async function downloadAsset(asset: BeatAsset): Promise<void> {
  const urls = asset.parts ? asset.parts.map((part) => part.url) : asset.url ? [asset.url] : [];

  if (urls.length === 0) return;

  const chunks: Blob[] = [];
  for (const url of urls) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`download failed: ${response.status}`);
    chunks.push(await response.blob());
  }

  const blob = new Blob(chunks, { type: asset.mime });
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = asset.name;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(href);
}

export type BeatInsert = {
  title: string;
  type_beat_artists: string[];
  bpm: number;
  key: string;
  tags: string[];
  mp3_url: string | null;
  cover_url: string | null;
  files: BeatFilesColumn;
  prices: { mp3: number | null; bundle: number | null; exclusive: number | null };
  is_public: boolean;
};

/** Создание бита идёт через сервер: там нормализация тегов, цен и тональности. */
export async function createBeat(beat: BeatInsert): Promise<{ id: string; title: string }> {
  const response = await fetch("/api/beats", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(beat),
  });

  const data = (await response.json()) as { id?: string; title?: string; error?: string };

  if (!response.ok || !data.id) {
    throw new Error(data.error ?? "Не удалось создать бит");
  }

  return { id: data.id, title: data.title ?? beat.title };
}