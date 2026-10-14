import { NextResponse } from "next/server";

import { clientKey, rateLimit } from "@/lib/rate-limit";
import { startUploadSession, YouTubeUploadError } from "@/lib/pulse/youtube-upload";
import { createClient } from "@/lib/supabase/server";

/**
 * Потолок ролика для Pulse: 2 ГБ.
 *
 * Ролик целиком лежит в памяти вкладки блобом, пока идёт нарезка на куски,
 * поэтому верхняя граница упирается в браузер, а не в YouTube.
 */
const MAX_PULSE_VIDEO_BYTES = 2 * 1024 ** 3;

/**
 * Открывает сессию загрузки на YouTube.
 *
 * Маршрут маленький намеренно: видеофайл через него не идёт и не может
 * пойти — приём тела запроса ограничен четырьмя с половиной мегабайтами, а
 * ролик весит больше ста. Маршрут только спрашивает у YouTube адрес сессии.
 *
 * Поэтому размер файла приходит с клиента и подделать его можно — но
 * вреда от этого нет: сервер передаёт размер YouTube, а настоящий файл
 * придёт из браузера прямо в YouTube и должен совпасть. Не совпадёт —
 * YouTube отвергнет ролик сам. Поэтому размер проверяется на разумность,
 * а не сверяется с тем, чего сервер не видел: мусор и заведомо
 * непроходимые мегабайты отсекаются, а точность — это уже дело YouTube.
 */
export async function POST(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });

  const gate = rateLimit(clientKey(request, `pulse-session:${user.id}`), 20, 60_000);

  if (!gate.ok) {
    return NextResponse.json(
      { error: "Слишком много попыток, подожди минуту" },
      { status: 429, headers: { "Retry-After": String(gate.retryAfter) } },
    );
  }

  const body = (await request.json().catch(() => null)) as {
    title?: unknown;
    description?: unknown;
    tags?: unknown;
    privacy?: unknown;
    size?: unknown;
  } | null;

  const size = Number(body?.size);

  /*
   * Размер проверяется здесь, а не в библиотеке.
   *
   * Number() превращает отсутствие поля в NaN, и ролик уезжал в YouTube с
   * заголовком длины `NaN` — отказ приходил через полминуты и звучал как
   * «что-то сломалось у YouTube». Проверка в библиотеке ловила это, но
   * отвечала «ролик пустой», хотя файл был: человек искал, где потерялся
   * видеофайл, которого у него на диске стоял.
   *
   * Верхняя граница — не выдумка. Ролик целиком лежит в памяти браузера
   * блобом, пока идёт нарезка кусков, поэтому файл на несколько гигабайт
   * не загрузится в принципе: вкладка умирает раньше. Лучше сказать об
   * этом сразу, чем отправить в YouTube размер, который никогда не
   * подтвердится.
   */
  if (!Number.isSafeInteger(size) || size <= 0) {
    return NextResponse.json({ error: "Не удалось определить размер ролика" }, { status: 400 });
  }

  if (size > MAX_PULSE_VIDEO_BYTES) {
    return NextResponse.json(
      { error: `Ролик больше ${MAX_PULSE_VIDEO_BYTES / 1024 ** 3} ГБ — такой в браузере не загрузится` },
      { status: 413 },
    );
  }

  const privacy = ["private", "unlisted", "public"].includes(String(body?.privacy))
    ? (body?.privacy as "private" | "unlisted" | "public")
    : "private";

  const tags = Array.isArray(body?.tags)
    ? body.tags.filter((tag): tag is string => typeof tag === "string").slice(0, 30)
    : [];

  try {
    const session = await startUploadSession(user.id, {
      title: typeof body?.title === "string" ? body.title : "",
      description: typeof body?.description === "string" ? body.description : "",
      tags,
      privacy,
      size,
    });

    return NextResponse.json(session, { status: 201 });
  } catch (error) {
    // Текст ошибки из YouTube отдаём как есть: он объясняет, что именно
    // не так с роликом или с квотой, и обёртка это сглаживала бы.
    if (error instanceof YouTubeUploadError) {
      return NextResponse.json({ error: error.message }, { status: error.status ?? 400 });
    }

    return NextResponse.json({ error: "Не удалось открыть загрузку" }, { status: 500 });
  }
}