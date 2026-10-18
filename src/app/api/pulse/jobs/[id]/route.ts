import { NextResponse, type NextRequest } from "next/server";

import { clientKey, rateLimit } from "@/lib/rate-limit";
import { isJobStatus } from "@/lib/pulse/jobs";
import { JobError, advanceJob, getJob } from "@/lib/pulse/jobs-server";
import { createClient } from "@/lib/supabase/server";

/**
 * Одна задача: чтение и продвижение.
 *
 * Продвигает задачу браузер: он рисует ролик и льёт его в YouTube, а сервер
 * только записывает, на каком шаге тот находится. Поэтому статусы приходят
 * от клиента, но проверяются на сервере — и в TypeScript, и в SQL.
 */

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  const { id } = await params;

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });

  try {
    const job = await getJob(id);

    // Чужая задача не находится, и это правильный ответ: различать «нет
    // такой» и «не твоя» не нужно, идентификаторы не перебираются.
    if (!job) return NextResponse.json({ error: "Задача не найдена" }, { status: 404 });

    return NextResponse.json({ job });
  } catch (error) {
    if (error instanceof JobError) return NextResponse.json({ error: error.message }, { status: error.status });

    return NextResponse.json({ error: "Не удалось загрузить задачу" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const { id } = await params;

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });

  /*
   * Лимит на переходы выше, чем на создание: за одну публикацию их четыре
   * (рендер, загрузка, выход, отказ), и несколько попыток подряд — обычное
   * дело при обрыве связи.
   */
  const gate = rateLimit(clientKey(request, `pulse-advance:${user.id}`), 120, 60_000);

  if (!gate.ok) {
    return NextResponse.json(
      { error: "Слишком много обновлений, подожди минуту" },
      { status: 429, headers: { "Retry-After": String(gate.retryAfter) } },
    );
  }

  const body = (await request.json().catch(() => null)) as {
    status?: unknown;
    progress?: unknown;
    error?: unknown;
    videoId?: unknown;
    watchUrl?: unknown;
  } | null;

  // Статус проверяется по списку, а не «лишнее отбросить»: неизвестное
  // значение молча превратилось бы в пустой статус, и ошибка уехала бы в
  // базу вместо того, чтобы вернуться сюда.
  if (!isJobStatus(body?.status)) {
    return NextResponse.json({ error: "Неизвестный статус задачи" }, { status: 400 });
  }

  const progress = Number(body?.progress);

  try {
    const job = await advanceJob(id, body.status, {
      progress: Number.isFinite(progress) ? progress : undefined,
      error: typeof body?.error === "string" ? body.error.slice(0, 500) : null,
      videoId: typeof body?.videoId === "string" ? body.videoId : undefined,
      watchUrl: typeof body?.watchUrl === "string" ? body.watchUrl : undefined,
    });

    return NextResponse.json({ job });
  } catch (error) {
    // 409 — это не «плохой запрос», а «так не делается»: повторять его
    // бессмысленно, нужно начать заново. Отдельный код это различает.
    if (error instanceof JobError) return NextResponse.json({ error: error.message }, { status: error.status });

    return NextResponse.json({ error: "Не удалось обновить задачу" }, { status: 500 });
  }
}
