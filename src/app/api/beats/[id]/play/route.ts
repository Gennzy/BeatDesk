import { NextResponse } from "next/server";

import { clientKey, rateLimit } from "@/lib/rate-limit";
import { getAdminClient } from "@/lib/supabase/admin";

/** Один прослушивание = один вызов. Счётчик не должен расти от догрузки страницы. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const limit = rateLimit(clientKey(request, `play:${id}`), 20, 60_000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Слишком часто" },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  try {
    /*
     * Счётчик увеличивается служебным клиентом, а не пользовательским.
     *
     * increment_plays была выдана и анонимам, потому что гость тоже
     * слушает бит. Но тогда её можно было вызвать напрямую через PostgREST
     * вообще без маршрута — и без его ограничения в двадцать прослушиваний в
     * минуту. Счётчик прослушиваний входит в рейтинг ленты, то есть это был
     * способ поднять свой бит в выдаче.
     *
     * Теперь единственный путь к счётчику — маршрут, а в нём есть лимит.
     */
    const admin = getAdminClient();
    const { error } = await admin.rpc("increment_plays", { beat_id: id });

    // Текст ошибки базы наружу не отдаём: там имена функций и столбцов.
    if (error) {
      console.error("play count failed", error.code);
      return NextResponse.json({ error: "Не удалось засчитать прослушивание" }, { status: 500 });
    }

    const { data } = await admin.from("beats").select("plays").eq("id", id).maybeSingle();

    return NextResponse.json({ ok: true, plays: data?.plays ?? null });
  } catch {
    return NextResponse.json({ error: "Не удалось засчитать прослушивание" }, { status: 500 });
  }
}