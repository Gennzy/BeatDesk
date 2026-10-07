import { NextResponse } from "next/server";

import { clientKey, rateLimit } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";

/**
 * Продавец подтвердил оплату руками.
 *
 * Пока нет юрлица и платёжного провайдера, деньги приходят битмейкеру на
 * карту напрямую. Заказ создаётся «ожидает оплаты», и без этой кнопки он
 * оставался бы таким навсегда: лицензии выдаёт mark_order_paid, а права на
 * её вызов у покупателя нет и быть не должно.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });

  const gate = rateLimit(clientKey(request, `order-paid:${user.id}`), 30, 60_000);
  if (!gate.ok) {
    return NextResponse.json(
      { error: "Слишком много запросов, подожди минуту" },
      { status: 429, headers: { "Retry-After": String(gate.retryAfter) } },
    );
  }

  /*
   * Право на подтверждение проверяет сама mark_order_paid (0024), здесь же —
   * только видимость заказа: RLS показывает продавцу заказ с его битом, а
   * чужой заказ вернулся бы пустым. Так на чужую кнопку не тратится вызов
   * функции.
   */
  const { data: order } = await supabase.from("orders").select("id, status").eq("id", id).maybeSingle();

  if (!order) return NextResponse.json({ error: "Заказ не найден" }, { status: 404 });

  const { data, error } = await supabase.rpc("mark_order_paid", {
    p_order_id: id,
    p_provider: "manual",
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ status: (data as { status: string } | null)?.status ?? "paid" });
}
