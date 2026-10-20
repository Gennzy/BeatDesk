import { NextResponse, type NextRequest } from "next/server";

import { clientKey, rateLimit } from "@/lib/rate-limit";
import { youtubeIdOf, youtubeWatchUrl } from "@/lib/pulse/video";
import { createClient } from "@/lib/supabase/server";

/**
 * Прикрепление ролика к биту.
 *
 * ---------------------------------------------------------------------------
 * ЗАЧЕМ ЭТО НУЖНО
 *
 * Ролик — это публикация, и лежит она в pulse_jobs. Но Pulse появился не
 * сразу: ролики, выложенные до таблицы, в неё не попали, и бит с готовым
 * роликом выглядел так, будто ролика нет.
 *
 * А выложить ролик можно было и вовсе не через нас: свой канал, чужой
 * сервис, руками. Запрещать человеку показать свой ролик покупателям площадки
 * было бы глупо — ролик продаёт бит лучше любого превью.
 *
 * Поэтому здесь можно прикрепить ссылку: битмейкер вставляет ролик, и
 * покупатель видит его в плеере.
 *
 * ---------------------------------------------------------------------------
 * ЧТО ПРОВЕРЯЕТСЯ
 *
 * Ссылка должна быть ссылкой на YouTube и принадлежать владельцу бита. Чужой
 * бит не прикрепляем: это либо ошибка, либо попытка приклеить чужой ролик к
 * своему биту.
 */

const text = (value: unknown, max: number): string =>
  typeof value === "string" ? value.trim().slice(0, max) : "";

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });

  const gate = rateLimit(clientKey(request, `pulse-link:${user.id}`), 20, 60_000);

  if (!gate.ok) {
    return NextResponse.json(
      { error: "Слишком много запросов, подожди минуту" },
      { status: 429, headers: { "Retry-After": String(gate.retryAfter) } },
    );
  }

  const body = (await request.json().catch(() => null)) as { beatId?: unknown; url?: unknown } | null;

  const beatId = text(body?.beatId, 64);
  const url = text(body?.url, 500);

  if (!beatId) return NextResponse.json({ error: "Нужен бит" }, { status: 400 });

  const videoId = youtubeIdOf(url);

  if (!videoId) {
    return NextResponse.json(
      { error: "Это не ссылка на ролик YouTube. Нужен адрес вида youtube.com/watch?v=…" },
      { status: 400 },
    );
  }

  const { data: beat } = await supabase
    .from("beats")
    .select("id, owner_id, title")
    .eq("id", beatId)
    .maybeSingle();

  if (!beat) return NextResponse.json({ error: "Бит не найден" }, { status: 404 });

  if (beat.owner_id !== user.id) {
    return NextResponse.json({ error: "Это не твой бит" }, { status: 403 });
  }

  /*
   * Запись ведёт серверная функция pulse_job_link, а не вставка клиентом.
   *
   * Политика insert из 0054 разрешает создавать только черновик: опубликованной
   * задачей можно стать только через серверный путь, иначе клиент дописал бы
   * себе «published» с любым video_id. Обойти это вставкой нельзя, и правильно.
   */
  const { data, error } = await supabase.rpc("pulse_job_link", {
    p_beat_id: beat.id,
    p_video_id: videoId,
    p_watch_url: youtubeWatchUrl(videoId),
  });

  if (error) {
    // Таблицы может не быть: миграции 0054 и 0059 не применены. Тогда ролик
    // прикрепить некуда, и сказать об этом честнее, чем «не удалось».
    if (/pulse_job_link|does not exist/i.test(error.message)) {
      return NextResponse.json({ error: "История публикаций ещё не настроена на сервере" }, { status: 503 });
    }

    return NextResponse.json({ error: error.message || "Не удалось прикрепить ролик" }, { status: 400 });
  }

  return NextResponse.json({ id: data, videoId, watchUrl: youtubeWatchUrl(videoId) }, { status: 201 });
}
