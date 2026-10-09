import { NextResponse } from "next/server";

import { normalizeTier, tierPrice } from "@/lib/sales/tier";
import { createClient } from "@/lib/supabase/server";

/**
 * Одна позиция корзины: смена уровня и удаление.
 *
 * Проверки те же, что при добавлении. Иначе можно было бы оставить в
 * корзине уровень, который битмейкер уже убрал с продажи, и человек
 * платил бы за то, чего купить нельзя.
 */

export async function PATCH(request: Request, { params }: { params: Promise<{ beatId: string }> }) {
  const supabase = await createClient();
  const { beatId } = await params;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { tier?: unknown } | null;
  const tier = normalizeTier(body?.tier);

  if (!tier) return NextResponse.json({ error: "Нужен уровень лицензии" }, { status: 400 });

  const { data: beat } = await supabase.from("beats").select("prices").eq("id", beatId).maybeSingle();

  if (tierPrice(beat?.prices, tier) === null) {
    return NextResponse.json({ error: "Этот уровень не продаётся" }, { status: 400 });
  }

  // Фильтр по user_id обязателен: без него адрес менял бы чужую корзину.
  const { error } = await supabase
    .from("cart_items")
    .update({ tier })
    .eq("user_id", user.id)
    .eq("beat_id", beatId);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ beatId, tier });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ beatId: string }> }) {
  const supabase = await createClient();
  const { beatId } = await params;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });

  const { error } = await supabase.from("cart_items").delete().eq("user_id", user.id).eq("beat_id", beatId);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ removed: beatId });
}