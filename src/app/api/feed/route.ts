import { NextResponse, type NextRequest } from "next/server";

import { fetchPublicBeats, type FeedFilters, type FeedSort } from "@/lib/feed";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  if (!isSupabaseConfigured) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  const limit = rateLimit(clientKey(request, "feed"), 120, 60_000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Слишком много запросов" },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  const params = new URL(request.url).searchParams;
  const raw = Number(params.get("offset") ?? 0);
  const offset = Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 0;

  const number = (key: string) => {
    const value = Number(params.get(key));
    return params.has(key) && Number.isFinite(value) ? value : undefined;
  };

  const sortParam = params.get("sort");
  // По умолчанию — как у витрины: иначе первая страница (top с сервера)
  // и догрузка (new отсюда) шли бы разным порядком.
  const sort: FeedSort = sortParam === "popular" || sortParam === "new" ? sortParam : "top";

  const bpmMin = number("bpmMin");
  const bpmMax = number("bpmMax");
  // Перевёрнутый диапазон читаем как опечатку порядка, а не как пустой
  // фильтр: молча показать всё значило бы спрятать ошибку ввода.
  const [lo, hi] =
    bpmMin !== undefined && bpmMax !== undefined && bpmMin > bpmMax ? [bpmMax, bpmMin] : [bpmMin, bpmMax];

  const filters: FeedFilters = {
    sort,
    query: params.get("q")?.trim() || undefined,
    key: params.get("key") || undefined,
    bpmMin: lo,
    bpmMax: hi,
  };

try {
    const supabase = await createClient();
    const {
    data: { user },
  } = await supabase.auth.getUser();

    /*
     * Рейтинг освежается здесь, а не по расписанию.
     *
     * Формула score содержит затухание по времени, то есть бит без реакций
     * через три дня должен весить вдвое меньше. Пересчитывал только триггер на
     * реакциях, поэтому затухание не применялось никогда: лента замирала.
     *
     * Функция трогает только биты, чей вес старше десяти минут, так что обычно
     * она не делает ничего — условие отсекает всё свежее. Ошибка молча
     * игнорируется намеренно: лента должна открыться и без пересчёта, иначе
     * замороженный рейтинг ронял бы витрину целиком.
     */
    await supabase.rpc("refresh_beat_scores", { p_max_age_seconds: 600 });

    const { beats, nextOffset } = await fetchPublicBeats(supabase, offset, undefined, filters, user?.id ?? null);
    return NextResponse.json({ beats, nextOffset });
  } catch {
    return NextResponse.json({ error: "Не удалось загрузить ленту" }, { status: 500 });
  }
}