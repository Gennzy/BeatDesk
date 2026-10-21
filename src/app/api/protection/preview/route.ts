import { NextResponse, type NextRequest } from "next/server";

/**
 * Прокси превью.
 *
 * ---------------------------------------------------------------------------
 * ЗАЧЕМ
 *
 * Превью лежит на CDN площадки, и браузер не всегда может его забрать:
 * CORS-заголовков там нет, а нам нужен сам звук, чтобы посчитать отпечаток.
 *
 * Через нас файл проходит всегда. И заодно это правильно с точки зрения
 * площадок: мы тянем их превью, а не показываем их страницы.
 *
 * ---------------------------------------------------------------------------
 * ЧТО НЕ ПРОПУСКАЕМ
 *
 * Прокси берёт только то, что мы сами нашли на площадках: адрес должен
 * указывать на их CDN. Иначе это был бы открытый прокси для любого адреса.
 */

/** Хосты, с которых разрешено брать превью. */
const ALLOWED_HOSTS = [
  "p.scdn.co",
  "audio-ak-spotify-com.akamaized.net",
  "cdns-preview.dzcdn.net",
  "cdns-preview-0.dzcdn.net",
  "cdns-preview-1.dzcdn.net",
  "cdns-preview-2.dzcdn.net",
  "cdns-preview-3.dzcdn.net",
  "cdns-preview-4.dzcdn.net",
  "cdns-preview-5.dzcdn.net",
  "cdns-preview-6.dzcdn.net",
  "cdns-preview-7.dzcdn.net",
  "cdns-preview-8.dzcdn.net",
  "cdns-preview-9.dzcdn.net",
];

/** Потолок превью: Spotify и Deezer отдают тридцать секунд. */
const MAX_BYTES = 8 * 1024 * 1024;

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url") ?? "";

  let target: URL;

  try {
    target = new URL(url);
  } catch {
    return NextResponse.json({ error: "Некорректный адрес" }, { status: 400 });
  }

  if (target.protocol !== "https:" || !ALLOWED_HOSTS.includes(target.hostname)) {
    // Прокси открыт для любого адреса был бы дырой в нашу пользу.
    return NextResponse.json({ error: "Такой адрес не берём" }, { status: 403 });
  }

  try {
    const response = await fetch(target.toString());

    if (!response.ok) {
      return NextResponse.json({ error: "Превью недоступно" }, { status: 502 });
    }

    const buffer = await response.arrayBuffer();

    if (buffer.byteLength > MAX_BYTES) {
      return NextResponse.json({ error: "Превью слишком большое" }, { status: 413 });
    }

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": response.headers.get("Content-Type") ?? "audio/mpeg",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "Превью не скачалось" }, { status: 502 });
  }
}
