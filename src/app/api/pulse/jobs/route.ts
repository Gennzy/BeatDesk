import { NextResponse, type NextRequest } from "next/server";

import { clientKey, rateLimit } from "@/lib/rate-limit";
import { JobError, createJob, jobOverview, listJobs } from "@/lib/pulse/jobs-server";
import { createClient } from "@/lib/supabase/server";

/**
 * История публикаций: список и создание.
 *
 * Создание идёт прямо в базу, минуя функцию: черновик не трогает состояние,
 * а политика insert требует ровно «draft». Всё остальное — через
 * pulse_job_advance.
 */

export async function GET(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });

  const limit = Number(request.nextUrl.searchParams.get("limit") ?? 50);

  try {
    // Сводка и список одним заходом: страница истории показывает и то, и
    // другое, а два круга туда-обратно на пустой странице заметны.
    const [jobs, overview] = await Promise.all([listJobs(user.id, limit), jobOverview()]);

    return NextResponse.json({ jobs, ...overview });
  } catch (error) {
    if (error instanceof JobError) return NextResponse.json({ error: error.message }, { status: error.status });

    return NextResponse.json({ error: "Не удалось загрузить историю" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });

  /*
   * Лимит на создание: каждый черновик — это обещание записи, и без
   * ограничения можно насоздавать их тысячи в минуту. Их потом видит сам же
   * автор в истории, так что это его собственная лента мусора.
   */
  const gate = rateLimit(clientKey(request, `pulse-job:${user.id}`), 30, 60_000);

  if (!gate.ok) {
    return NextResponse.json(
      { error: "Слишком много задач, подожди минуту" },
      { status: 429, headers: { "Retry-After": String(gate.retryAfter) } },
    );
  }

  const body = (await request.json().catch(() => null)) as {
    beatId?: unknown;
    beatTitle?: unknown;
    title?: unknown;
    description?: unknown;
    tags?: unknown;
    privacy?: unknown;
    template?: unknown;
  } | null;

  const privacy = ["private", "unlisted", "public"].includes(String(body?.privacy))
    ? String(body?.privacy)
    : "private";

  const template = body?.template === "nonProfit" ? "nonProfit" : "paid";

  try {
    const job = await createJob(user.id, {
      beatId: typeof body?.beatId === "string" ? body.beatId : null,
      beatTitle: typeof body?.beatTitle === "string" ? body.beatTitle : "",
      title: typeof body?.title === "string" ? body.title : "",
      description: typeof body?.description === "string" ? body.description : "",
      tags: Array.isArray(body?.tags) ? body.tags.filter((tag): tag is string => typeof tag === "string") : [],
      privacy,
      template,
    });

    return NextResponse.json({ job }, { status: 201 });
  } catch (error) {
    if (error instanceof JobError) return NextResponse.json({ error: error.message }, { status: error.status });

    return NextResponse.json({ error: "Не удалось создать задачу" }, { status: 500 });
  }
}
