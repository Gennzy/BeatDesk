import { NextResponse, type NextRequest } from "next/server";

import { clientKey, rateLimit } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";

/**
 * Просмотр бита.
 *
 * Отдельный маршрут, а не увеличение в рендере страницы: рендер выполняется и
 * на предзагрузке, и повторно, и просмотр нашёлся бы без открытия.
 *
 * Счётчик на ранг не влияет — иначе открытие страницы ради счётчика поднимало
 * бы бит в ленте. Это прямо написано в функции bump_beat_counter.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  /*
   * Один маршрут считает и просмотры страницы, и показы карточки: счётчик
   * различается параметром kind. Показ отправляется из ленты, просмотр — со
   * страницы бита.
   */
  const kind = new URL(request.url).searchParams.get("kind") === "impressions" ? "impressions" : "views";

  const gate = rateLimit(clientKey(request, `beat-${kind}:${id}`), 120, 60_000);
  if (!gate.ok) return NextResponse.json({ ok: true });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Владельцу не засчитывается ни то, ни другое: иначе он сам себя накручивает.
  if (user) {
    const { data: beat } = await supabase.from("beats").select("owner_id").eq("id", id).maybeSingle();
    if (!beat || beat.owner_id === user.id) return NextResponse.json({ ok: true });
  }

  const { data, error } = await supabase.rpc("bump_beat_counter", {
    p_beat_id: id,
    p_column: kind,
  });

  // Ошибку не поднимаем: просмотр — статистика, и его потеря не должна
  // выглядеть как поломка страницы.
  if (error) return NextResponse.json({ ok: false });

  return NextResponse.json({ ok: true, [kind]: data ?? null });
}