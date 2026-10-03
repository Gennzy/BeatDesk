/** Обложка 3.7 МБ съедала бакет и тормозила ленту, но жить с ней можно. */
const MAX_EDGE = 1600;
const TARGET_BYTES = 700 * 1024;
/** Ниже этого размера картинку не трогаем: пережимать нет смысла. */
const SKIP_BELOW_BYTES = 500 * 1024;
const QUALITY_LADDER = [0.93, 0.88, 0.82, 0.75];
/** Фон под прозрачные PNG, чтобы не было белых пятен. */
const BACKDROP = "#0b0b0c";

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}

/**
 * Обжимает картинку на клиенте: длинная сторона не длиннее MAX_EDGE,
 * качество спускается по ступеням, пока файл не влезет в TARGET_BYTES.
 * Возвращает исходник, если пережимать невыгодно или нечем.
 */
export async function compressImage(
  file: File,
  maxEdge = MAX_EDGE,
  ladder: number[] = QUALITY_LADDER,
): Promise<File> {
  if (!file.type.startsWith("image/")) {
    return file;
  }

  // быстрый выход только для обложек: аватарки и так мелкие, им нужна переработка
  if (maxEdge === MAX_EDGE && file.size <= SKIP_BELOW_BYTES) {
    return file;
  }

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");
    if (!context) {
      bitmap.close();
      return file;
    }

    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.fillStyle = BACKDROP;
    context.fillRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    let best: Blob | null = null;

    for (const quality of ladder) {
      const blob = await toBlob(canvas, quality);
      if (!blob) break;
      best = blob;
      if (blob.size <= TARGET_BYTES) break;
    }

    if (!best || best.size >= file.size) {
      return file;
    }

    const name = file.name.replace(/\.[^.]+$/, "") || "cover";
    return new File([best], `${name}.jpg`, { type: "image/jpeg", lastModified: Date.now() });
  } catch {
    return file;
  }
}