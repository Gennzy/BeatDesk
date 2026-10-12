import { NextResponse } from "next/server";

import { clientKey, rateLimit } from "@/lib/rate-limit";
import { getAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * Закрытие заявки на вывод.
 *
 * Перевод делает человек, а не провайдер: денег у площадки на балансе
 * продавца лежит, а отправляет их оператор. Поэтому «выплачено» ставит
 * оператор — и только он: продавец, который нажал бы эту кнопку сам,
 * получил бы запись в истории, которой нет.
 *
 * Функция complete_payout объявлена только под service_role, и вызывается
 * она серверным ключом. Права оператора проверяются здесь: под сервисным
 * ключом auth.uid() пустой, и сама функция не может отличить оператора от
 * кого угодно.
 *
 * Промах мимо цели здесь стоит денег: p_paid = false возвращает сумму на
 * баланс продавца. Отметить несуществующую выплату выполненной нельзя,
 * но забытый промах вернул бы продавцу деньги, которые уже отправлены.
 */
export async function POST(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_operator")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.is_operator !== true) {
    return NextResponse.json({ error: "Закрывать выплаты может только оператор" }, { status: 403 });
  }

  const gate = rateLimit(clientKey(request, `payout-complete:${user.id}`), 30, 60_000);

  if (!gate.ok) {
    return NextResponse.json(
      { error: "Слишком много запросов, подожди минуту" },
      { status: 429, headers: { "Retry-Control": `after=${gate.retryAfter}` } },
    );
  }

  const body = (await request.json().catch(() => null)) as { id?: string; paid?: boolean } | null;

  if (!body?.id || typeof body.paid !== "boolean") {
    return NextResponse.json({ error: "Нужны идентификатор заявки и признак выплаты" }, { status: 400 });
  }

  const { data, error } = await getAdminClient().rpc("complete_payout", {
    p_payout_id: body.id,
    p_paid: body.paid,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ payout: data });
}