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

  const sort: FeedSort = params.get("sort") === "popular" ? "popular" : "new";

  const filters: FeedFilters = {
    sort,
    query: params.get("q") ?? undefined,
    key: params.get("key") || undefined,
    bpmMin: number("bpmMin"),
    bpmMax: number("bpmMax"),
  };

  try {
    const supabase = await createClient();
    const {
    data: { user },
  } = await supabase.auth.getUser();

  const { beats, nextOffset } = await fetchPublicBeats(supabase, offset, undefined, filters, user?.id ?? null);
    return NextResponse.json({ beats, nextOffset });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "feed_error" }, { status: 500 });
  }
}