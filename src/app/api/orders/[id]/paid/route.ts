import { NextResponse } from "next/server";

import { clientKey, rateLimit } from "@/lib/rate-limit";
import { getAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * Оператор подтвердил оплату руками.
 *
 * Пока нет юрлица и платёжного провайдера, деньги приходят на счёт площадки,
 * и поступление видит только оператор. Подтверждать может только он:
 * продавец нажимал бы вслепую и мог бы подтвердить неоплаченное.
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
   * Право на подтверждение проверяет сама mark_order_paid — это оператор,
   * а не продавец: деньги приходят на счёт площадки, и только оператор их
   * видит.
   *
   * Здесь та же проверка продублирована намеренно: без неё продавец
   * отправлял бы вызов функции, тратил квоту и получал отказ от базы.
   * Проверка на клиенте не заменяет проверку в функции — она её дублирует,
   * чтобы лишний вызов не уходил вообще.
   */
  const { data: viewer } = await supabase.from("profiles").select("is_operator").eq("id", user.id).maybeSingle();

  if (!viewer?.is_operator) {
    return NextResponse.json({ error: "Подтверждать оплату может только оператор площадки" }, { status: 403 });
  }

  const { data: order } = await supabase.from("orders").select("id, status").eq("id", id).maybeSingle();

  if (!order) return NextResponse.json({ error: "Заказ не найден" }, { status: 404 });

  const { data, error } = await supabase.rpc("mark_order_paid", {
    p_order_id: id,
    p_provider: "manual",
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  /*
   * Уведомления о продаже отправляем здесь, а не в mark_order_paid: там же
   * проверка прав продавца, и её копия в миграции рано или поздно разошлась
   * бы с оригиналом. Вызов идёт под service_role — у продавца нет доступа к
   * функции, и мы туда попали не по его запросу, а по факту оплаты.
   *
   * Ошибка здесь не должна отменять подтверждение: деньги получены, заказ
   * оплачен, а всплывашка — украшение.
   */
  try {
    const admin = getAdminClient();
    await admin.rpc("notify_sale", { p_order_id: id });

    /*
     * Продавцу уведомление о продаже приходит из notify_sale, а покупателю
     * нужен другой повод: у него заказ висел «ожидает оплату», и он не знал,
     * что продавец уже подтвердил и файлы можно забирать.
     */
    const { data: order } = await admin
      .from("orders")
      .select("buyer_id")
      .eq("id", id)
      .maybeSingle();

    if (order?.buyer_id) {
      await admin.rpc("notify_user", {
        p_user: order.buyer_id,
        p_kind: "order_ready",
        p_order: id,
      });
    }
  } catch {
    // уведомление не ушло, заказ при этом оплачен
  }

  return NextResponse.json({ status: (data as { status: string } | null)?.status ?? "paid" });
}
