import { NextResponse, type NextRequest } from "next/server";

import { clientKey, rateLimit } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";

/**
 * Отзыв о битмейкере.
 *
 * Проверку «оплачено ли» делает триггер в базе (0025): только он видит
 * позицию заказа целиком и статус заказа. Здесь — только вход и сама
 * вставка, чтобы политика RLS не дала записать отзыв от чужого имени.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });

  const gate = rateLimit(clientKey(request, `review:${user.id}`), 20, 60_000);
  if (!gate.ok) {
    return NextResponse.json(
      { error: "Слишком много отзывов, подожди минуту" },
      { status: 429, headers: { "Retry-After": String(gate.retryAfter) } },
    );
  }

  const body = (await request.json().catch(() => null)) as {
    orderItemId?: unknown;
    rating?: unknown;
    body?: unknown;
  } | null;

  const orderItemId = typeof body?.orderItemId === "string" ? body.orderItemId : "";
  const rating = typeof body?.rating === "number" ? Math.round(body.rating) : 0;
  const text = typeof body?.body === "string" ? body.body.trim() : "";

  if (!/^[0-9a-f-]{36}$/i.test(orderItemId)) {
    return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
  }

  if (rating < 1 || rating > 5) {
    return NextResponse.json({ error: "Оценка от 1 до 5" }, { status: 400 });
  }

  if (text.length > 600) {
    return NextResponse.json({ error: "Слишком длинный отзыв" }, { status: 400 });
  }

  /*
   * Автора и адресата отзыва проставляет триггер по позиции заказа: клиент
   * не указывает их сам, иначе можно было бы похвалить чужой профиль,
   * купив дешёвый бит.
   */
  const { error } = await supabase.from("reviews").insert({
    order_item_id: orderItemId,
    rating,
    body: text || null,
  } as never);

  if (error) {
    // Уже оставленный отзыв на эту позицию — не ошибка, а повторное
    // нажатие кнопки: отвечаем так, чтобы форма закрылась.
    if (error.code === "23505") return NextResponse.json({ status: "exists" }, { status: 409 });
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ status: "created" }, { status: 201 });
}