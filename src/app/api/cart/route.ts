import { NextResponse } from "next/server";

import { normalizeTier, tierPrice } from "@/lib/sales/tier";
import { createClient } from "@/lib/supabase/server";

/**
 * Корзина: чтение и добавление.
 *
 * Позиция — это пара «бит + уровень», и на один бит позиция одна.
 * Повторное добавление того же бита с другим уровнем не плодит записи, а
 * меняет выбор: купить один бит дважды нельзя, выбрать другой уровень
 * можно.
 *
 * Проверки перед записью намеренные. Скидка, жанр и цена могут измениться,
 * пока бит лежал в корзине, но уровень, который не продаётся, или бит,
 * снятый с продажи, попасть в неё не должны: человек обнаружит это в
 * момент оплаты, и это худшее место для ошибки.
 */

export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });

  const { data, error } = await supabase
    .from("cart_items")
    .select("id, beat_id, tier, created_at, beats(id, title, cover_url, mp3_url, prices, prices_before, discount_percent, currency, sale_state, is_public, owner_id, profiles!beats_owner_id_fkey(username, avatar_url))")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ items: data ?? [] });
}

export async function POST(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { beatId?: unknown; tier?: unknown } | null;
  const beatId = typeof body?.beatId === "string" ? body.beatId : null;
  const tier = normalizeTier(body?.tier);

  if (!beatId) return NextResponse.json({ error: "Нужен бит" }, { status: 400 });
  if (!tier) return NextResponse.json({ error: "Нужен уровень лицензии" }, { status: 400 });

  const { data: beat } = await supabase
    .from("beats")
    .select("id, owner_id, sale_state, is_public, prices")
    .eq("id", beatId)
    .maybeSingle();

  if (!beat) return NextResponse.json({ error: "Бит не найден" }, { status: 404 });

  // Свой бит в корзину класть незачем: там нет ни покупки, ни загрузки.
  if (beat.owner_id === user.id) {
    return NextResponse.json({ error: "Свой бит не нужно покупать" }, { status: 400 });
  }

  if (beat.sale_state !== "on_sale" || !beat.is_public) {
    return NextResponse.json({ error: "Бит сейчас не продаётся" }, { status: 400 });
  }

  if (tierPrice(beat.prices, tier) === null) {
    return NextResponse.json({ error: "Этот уровень не продаётся" }, { status: 400 });
  }

  /*
   * onConflict меняет уровень, если бит уже в корзине. Именно за это и
   * отвечает ключ (user_id, beat_id): второй клик по «в корзину» с другим
   * уровнем не должен превращаться в две позиции одного бита.
   */
  const { error } = await supabase.from("cart_items").upsert(
    { user_id: user.id, beat_id: beatId, tier },
    { onConflict: "user_id,beat_id" },
  );

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ beatId, tier });
}